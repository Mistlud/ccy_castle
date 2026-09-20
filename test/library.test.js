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
  await fs.mkdir(path.join(temporaryDirectory, 'Movies', 'Versioned'), { recursive: true });
  await fs.mkdir(path.join(temporaryDirectory, 'Photos'), { recursive: true });
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Interstellar', 'movie.mkv'), 'video');
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Interstellar', 'Thumbnail.JPG'), 'thumbnail');
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Interstellar', 'Thumbs.DB'), 'system thumbnail cache');
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Interstellar', 'meta.json'), JSON.stringify({
    title: '인터스텔라',
    artist: 'Christopher Nolan',
    description: 'Personal library item',
    rating: '12세 관람가',
    type: 'audio',
    date: '2026-09-20',
  }));
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Broken Metadata', 'track.mp3'), 'audio');
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Broken Metadata', 'meta.json'), '{broken');
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Versioned', 'clip.mp4'), 'video');
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Versioned', 'meta.json'), '{"title":"One"}');
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
  assert.equal(interstellar.artist, 'Christopher Nolan');
  assert.equal(interstellar.description, 'Personal library item');
  assert.equal(interstellar.rating, '12세 관람가');
  assert.equal(interstellar.type, 'video');
  assert.equal(interstellar.mediaCount, 1);
  assert.equal(Object.hasOwn(interstellar, 'date'), false);
});

test('falls back to folder name and inferred type for malformed metadata', async () => {
  const card = await library.card('Movies/Broken Metadata');
  assert.equal(card.title, 'Broken Metadata');
  assert.equal(card.artist, '');
  assert.equal(card.rating, '');
  assert.equal(card.type, 'audio');
  assert.equal(card.mediaCount, 1);
});

test('returns safe relative explorer entries and breadcrumbs', async () => {
  const result = await library.browse('Movies/Interstellar');
  assert.equal(result.artist, 'Christopher Nolan');
  assert.equal(result.description, 'Personal library item');
  assert.equal(result.rating, '12세 관람가');
  assert.equal(result.type, 'video');
  assert.equal(result.mediaCount, 1);
  assert.match(result.thumbnailUrl, /&v=[a-f0-9]{16}$/);
  assert.deepEqual(result.breadcrumb.map((entry) => entry.path), ['', 'Movies', 'Movies/Interstellar']);
  assert.equal(result.entries.find((entry) => entry.name === 'movie.mkv').mediaType, 'video');
  assert.equal(result.entries.some((entry) => ['meta.json', 'thumbnail.jpg', 'thumbs.db'].includes(entry.name.toLowerCase())), false);
  assert.ok(result.entries.every((entry) => !path.isAbsolute(entry.path)));
});

test('versions thumbnail URLs when metadata, thumbnails, contents, or manual revision changes', async () => {
  const itemPath = path.join(temporaryDirectory, 'Movies', 'Versioned');
  const initial = (await library.card('Movies/Versioned')).thumbnailUrl;
  assert.match(initial, /&v=[a-f0-9]{16}$/);

  await fs.writeFile(path.join(itemPath, 'meta.json'), '{"title":"A longer title"}');
  const afterMetadata = (await library.card('Movies/Versioned')).thumbnailUrl;
  assert.notEqual(afterMetadata, initial);

  await fs.writeFile(path.join(itemPath, 'thumbnail.jpg'), 'thumbnail');
  const afterThumbnail = (await library.card('Movies/Versioned')).thumbnailUrl;
  assert.notEqual(afterThumbnail, afterMetadata);

  await fs.writeFile(path.join(itemPath, 'extra.mp3'), 'audio');
  const afterContents = (await library.card('Movies/Versioned')).thumbnailUrl;
  assert.notEqual(afterContents, afterThumbnail);

  await fs.writeFile(path.join(itemPath, 'Thumbs.db'), 'ignored system file');
  assert.equal((await library.card('Movies/Versioned')).thumbnailUrl, afterContents);

  library.invalidate();
  assert.notEqual((await library.card('Movies/Versioned')).thumbnailUrl, afterContents);
});
