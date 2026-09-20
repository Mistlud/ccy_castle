const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { createCastleServer, parseRangeHeader } = require('../server');

let temporaryDirectory;
let app;
let baseUrl;
const mediaBody = Buffer.from('0123456789');
const quietLogger = { warn() {}, error() {}, log() {} };

before(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'castle-server-test-'));
  await fs.mkdir(path.join(temporaryDirectory, 'Movies', 'Demo'), { recursive: true });
  await fs.writeFile(path.join(temporaryDirectory, 'Movies', 'Demo', 'clip.mp4'), mediaBody);
  app = await createCastleServer({ root: temporaryDirectory, ffmpegAvailable: false, logger: quietLogger });
  const address = await app.start({ host: '127.0.0.1', port: 0 });
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await app.close();
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test('parses full, open-ended, and suffix ranges', () => {
  assert.deepEqual(parseRangeHeader('bytes=2-5', 10), { start: 2, end: 5 });
  assert.deepEqual(parseRangeHeader('bytes=6-', 10), { start: 6, end: 9 });
  assert.deepEqual(parseRangeHeader('bytes=-3', 10), { start: 7, end: 9 });
  assert.equal(parseRangeHeader('bytes=12-', 10), false);
  assert.equal(parseRangeHeader('items=0-1', 10), false);
});

test('serves menu and item APIs without absolute host paths', async () => {
  const menusResponse = await fetch(`${baseUrl}/api/menus`);
  assert.equal(menusResponse.status, 200);
  assert.deepEqual(await menusResponse.json(), { menus: [{ title: 'Movies', path: 'Movies' }] });

  const itemResponse = await fetch(`${baseUrl}/api/item?path=Movies`);
  const body = await itemResponse.text();
  assert.equal(itemResponse.status, 200);
  assert.equal(body.includes(temporaryDirectory), false);
  const item = JSON.parse(body);
  const card = item.cards[0];
  assert.equal(card.path, 'Movies/Demo');
  assert.match(card.thumbnailUrl, /&v=[a-f0-9]{16}$/);
  assert.match(item.menu.thumbnailUrl, /&v=[a-f0-9]{16}$/);
});

test('refreshes library revisions and applies immutable caching only to versioned thumbnails', async () => {
  const beforeResponse = await fetch(`${baseUrl}/api/item?path=Movies`);
  const before = (await beforeResponse.json()).cards[0].thumbnailUrl;
  const versionedThumbnail = await fetch(`${baseUrl}${before}`);
  assert.match(versionedThumbnail.headers.get('cache-control'), /immutable/);

  const refreshResponse = await fetch(`${baseUrl}/api/refresh`, { method: 'POST' });
  assert.equal(refreshResponse.status, 200);
  assert.equal((await refreshResponse.json()).revision, 1);

  const afterResponse = await fetch(`${baseUrl}/api/item?path=Movies`);
  const after = (await afterResponse.json()).cards[0].thumbnailUrl;
  assert.notEqual(after, before);

  assert.equal((await fetch(`${baseUrl}/api/refresh`)).status, 405);
  const home = await fetch(baseUrl);
  assert.match(await home.text(), /id="refresh-library"/);
});

test('rejects encoded, mixed-slash, and absolute traversal without leaking host paths', async () => {
  const attempts = [
    '..%2Foutside.txt',
    'Movies%2F..%5C..%5Coutside.txt',
    encodeURIComponent('C:\\Windows\\win.ini'),
  ];
  for (const attempt of attempts) {
    const response = await fetch(`${baseUrl}/media?path=${attempt}`);
    const body = await response.text();
    assert.equal(response.status, 403);
    assert.equal(body.includes(temporaryDirectory), false);
  }
});

test('serves full media without loading it through the API model', async () => {
  const response = await fetch(`${baseUrl}/media?path=${encodeURIComponent('Movies/Demo/clip.mp4')}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), mediaBody);
});

test('serves valid closed and open-ended range requests', async () => {
  const closed = await fetch(`${baseUrl}/media?path=${encodeURIComponent('Movies/Demo/clip.mp4')}`, {
    headers: { Range: 'bytes=2-5' },
  });
  assert.equal(closed.status, 206);
  assert.equal(closed.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await closed.text(), '2345');

  const open = await fetch(`${baseUrl}/media?path=${encodeURIComponent('Movies/Demo/clip.mp4')}`, {
    headers: { Range: 'bytes=6-' },
  });
  assert.equal(open.status, 206);
  assert.equal(await open.text(), '6789');
});

test('returns 416 for an invalid range', async () => {
  const response = await fetch(`${baseUrl}/media?path=${encodeURIComponent('Movies/Demo/clip.mp4')}`, {
    headers: { Range: 'bytes=100-' },
  });
  assert.equal(response.status, 416);
  assert.equal(response.headers.get('content-range'), 'bytes */10');
});

test('supports HEAD for media and serves thumbnail fallback', async () => {
  const head = await fetch(`${baseUrl}/media?path=${encodeURIComponent('Movies/Demo/clip.mp4')}`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('content-length'), '10');
  assert.equal(await head.text(), '');

  const thumbnail = await fetch(`${baseUrl}/thumbnail?path=${encodeURIComponent('Movies/Demo')}`);
  assert.equal(thumbnail.status, 200);
  assert.match(thumbnail.headers.get('content-type'), /^image\/svg\+xml/);
  assert.equal(thumbnail.headers.get('cache-control'), 'no-store');
});
