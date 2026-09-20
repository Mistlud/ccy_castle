const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { CastleLibrary } = require('../src/library');
const { PathGuard } = require('../src/path-safety');

let temporaryDirectory;
let library;

const quietLogger = { warn() {}, error() {}, log() {} };

before(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'castle-library-test-'));
  await fs.mkdir(path.join(temporaryDirectory, 'Movies', 'Interstellar'), { recursive: true });
  await fs.mkdir(path.join(temporaryDirectory, 'Movies', 'Broken Metadata'), { recursive: true });
  await fs.mkdir(path.join(temporaryDirectory, 'Photos'), { recursive: true });
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Interstellar', 'movie.mkv'), 'video');
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Interstellar', 'meta.json'), JSON.stringify({
    title: '인터스텔라',
    type: 'video',
    description: 'Personal library item',
    date: '2026-09-20',
  }));
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Broken Metadata', 'track.mp3'), 'audio');
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Broken Metadata', 'meta.json'), '{broken');
  library = new CastleLibrary(await PathGuard.create(temporaryDirectory), quietLogger);
});

after(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test('maps root directories to menus', async () => {
  assert.deepEqual(await library.menus(), [
    { title: 'Movies', path: 'Movies' },
    { title: 'Photos', path: 'Photos' },
  ]);
});

test('maps menu children to cards and reads optional metadata', async () => {
  const cards = await library.cards('Movies');
  const interstellar = cards.find((card) => card.path === 'Movies/Interstellar');
  assert.equal(interstellar.title, '인터스텔라');
  assert.equal(interstellar.type, 'video');
  assert.equal(interstellar.mediaCount, 1);
  assert.equal(interstellar.date, '2026-09-20');
});

test('falls back to folder name and inferred type for malformed metadata', async () => {
  const card = await library.card('Movies/Broken Metadata');
  assert.equal(card.title, 'Broken Metadata');
  assert.equal(card.type, 'audio');
  assert.equal(card.mediaCount, 1);
});

test('returns safe relative explorer entries and breadcrumbs', async () => {
  const result = await library.browse('Movies/Interstellar');
  assert.deepEqual(result.breadcrumb.map((entry) => entry.path), ['', 'Movies', 'Movies/Interstellar']);
  assert.equal(result.entries.find((entry) => entry.name === 'movie.mkv').mediaType, 'video');
  assert.ok(result.entries.every((entry) => !path.isAbsolute(entry.path)));
});
