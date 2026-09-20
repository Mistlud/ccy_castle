const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { after, before, test } = require('node:test');
const { PathGuard } = require('../src/path-safety');
const { ThumbnailService, detectFfmpeg } = require('../src/thumbnails');

let temporaryDirectory;
let root;
let cacheDirectory;
let guard;
const quietLogger = { warn() {}, error() {}, log() {} };

before(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'castle-thumbnail-test-'));
  root = path.join(temporaryDirectory, 'castle');
  cacheDirectory = path.join(temporaryDirectory, 'cache');
  await fs.mkdir(path.join(root, 'Explicit'), { recursive: true });
  await fs.mkdir(path.join(root, 'Video'), { recursive: true });
  await fs.writeFile(path.join(root, 'Explicit', 'thumbnail.jpg'), 'explicit-thumbnail');
  guard = await PathGuard.create(root);
});

after(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test('prefers an explicit thumbnail inside the item directory', async () => {
  const service = new ThumbnailService({ guard, cacheDirectory, ffmpegAvailable: false, logger: quietLogger });
  const result = await service.find('Explicit');
  assert.equal(path.basename(result).toLowerCase(), 'thumbnail.jpg');
});

test('generates and reuses a cached video thumbnail when ffmpeg is available', async (context) => {
  if (!detectFfmpeg()) {
    context.skip('ffmpeg is unavailable in this environment');
    return;
  }

  const videoPath = path.join(root, 'Video', 'sample.mp4');
  const creation = spawnSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=160x90:d=2',
    '-pix_fmt', 'yuv420p', videoPath,
  ], { windowsHide: true, stdio: 'ignore' });
  assert.equal(creation.status, 0, 'ffmpeg should create the test video');

  const service = new ThumbnailService({ guard, cacheDirectory, ffmpegAvailable: true, logger: quietLogger });
  const generated = await service.find('Video');
  assert.equal(path.dirname(generated), cacheDirectory);
  assert.equal(path.extname(generated), '.jpg');
  assert.ok((await fs.stat(generated)).size > 0);

  const reused = await service.find('Video');
  assert.equal(reused, generated);

  await fs.writeFile(path.join(root, 'Video', 'meta.json'), '{"title":"Changed"}');
  const regenerated = await service.find('Video');
  assert.notEqual(regenerated, generated);
  await assert.rejects(fs.stat(generated), { code: 'ENOENT' });
  assert.ok((await fs.stat(regenerated)).size > 0);
  assert.ok((await fs.stat(videoPath)).size > 0, 'the original video remains intact');
});

test('manual invalidation removes generated thumbnails but preserves unrelated cache files', async () => {
  await fs.mkdir(cacheDirectory, { recursive: true });
  await fs.writeFile(path.join(cacheDirectory, `${'a'.repeat(64)}.jpg`), 'legacy');
  await fs.writeFile(path.join(cacheDirectory, `r0-${'b'.repeat(64)}.jpg`), 'generated');
  await fs.writeFile(path.join(cacheDirectory, 'keep.txt'), 'keep');
  const service = new ThumbnailService({ guard, cacheDirectory, ffmpegAvailable: false, logger: quietLogger });

  const removed = await service.invalidate();
  assert.ok(removed >= 2);
  assert.deepEqual(await fs.readdir(cacheDirectory), ['keep.txt']);
});
