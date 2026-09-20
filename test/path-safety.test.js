const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { PathGuard, UnsafePathError, normalizeRelativePath } = require('../src/path-safety');

let temporaryDirectory;
let root;
let outside;
let guard;

before(async () => {
  temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'castle-path-test-'));
  root = path.join(temporaryDirectory, 'castle');
  outside = path.join(temporaryDirectory, 'outside');
  await fs.mkdir(path.join(root, 'Menu', 'Item'), { recursive: true });
  await fs.mkdir(outside, { recursive: true });
  await fs.writeFile(path.join(root, 'Menu', 'Item', 'inside.txt'), 'inside');
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
  guard = await PathGuard.create(root);
});

after(async () => {
  await fs.rm(temporaryDirectory, { recursive: true, force: true });
});

test('normalizes harmless separators and dot segments', () => {
  assert.equal(normalizeRelativePath('Menu\\Item/./inside.txt'), 'Menu/Item/inside.txt');
});

test('rejects traversal and absolute paths', () => {
  for (const unsafe of ['..', '../secret', 'Menu/../../secret', 'C:\\Windows\\win.ini', '\\\\server\\share', '/etc/passwd']) {
    assert.throws(() => normalizeRelativePath(unsafe), UnsafePathError);
  }
});

test('resolves an existing file inside the canonical root', async () => {
  const result = await guard.resolveExisting('Menu/Item/inside.txt', 'file');
  assert.equal(result.relativePath, 'Menu/Item/inside.txt');
  assert.equal(await fs.readFile(result.absolutePath, 'utf8'), 'inside');
});

test('rejects a symlink or junction that escapes the root', async (context) => {
  const link = path.join(root, 'escape-link');
  try {
    await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    context.skip(`The environment cannot create a test link: ${error.code || error.message}`);
    return;
  }
  await assert.rejects(() => guard.resolveExisting('escape-link/secret.txt', 'file'), UnsafePathError);
});
