const fs = require('node:fs/promises');
const path = require('node:path');

class UnsafePathError extends Error {
  constructor(message = 'The requested path is not allowed.') {
    super(message);
    this.name = 'UnsafePathError';
  }
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function normalizeRelativePath(input = '') {
  if (typeof input !== 'string') {
    throw new UnsafePathError();
  }
  if (input.includes('\0')) {
    throw new UnsafePathError();
  }

  const slashPath = input.replaceAll('\\', '/');
  if (
    slashPath.startsWith('/') ||
    slashPath.startsWith('//') ||
    /^[A-Za-z]:/.test(slashPath) ||
    path.win32.isAbsolute(input) ||
    path.posix.isAbsolute(slashPath)
  ) {
    throw new UnsafePathError();
  }

  const parts = [];
  for (const part of slashPath.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') throw new UnsafePathError();
    parts.push(part);
  }

  return parts.join('/');
}

class PathGuard {
  constructor(root) {
    this.root = root;
  }

  static async create(rootInput) {
    if (!rootInput || typeof rootInput !== 'string') {
      throw new Error('A castle root is required. Use --root or CASTLE_ROOT.');
    }

    let canonicalRoot;
    try {
      canonicalRoot = await fs.realpath(path.resolve(rootInput));
      const stat = await fs.stat(canonicalRoot);
      if (!stat.isDirectory()) throw new Error('not a directory');
    } catch {
      throw new Error('The configured castle root does not exist or is not a directory.');
    }

    return new PathGuard(canonicalRoot);
  }

  async resolveExisting(clientPath = '', expectedType = 'any') {
    const relativePath = normalizeRelativePath(clientPath);
    const lexicalTarget = path.resolve(this.root, ...relativePath.split('/').filter(Boolean));
    if (!isInside(this.root, lexicalTarget)) throw new UnsafePathError();

    let realTarget;
    try {
      realTarget = await fs.realpath(lexicalTarget);
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        const missing = new Error('The requested path was not found.');
        missing.code = 'ENOENT';
        throw missing;
      }
      throw error;
    }

    if (!isInside(this.root, realTarget)) throw new UnsafePathError();

    const stat = await fs.stat(realTarget);
    if (expectedType === 'file' && !stat.isFile()) {
      const error = new Error('The requested file was not found.');
      error.code = 'ENOENT';
      throw error;
    }
    if (expectedType === 'directory' && !stat.isDirectory()) {
      const error = new Error('The requested directory was not found.');
      error.code = 'ENOENT';
      throw error;
    }

    return { absolutePath: realTarget, relativePath, stat };
  }
}

module.exports = {
  PathGuard,
  UnsafePathError,
  isInside,
  normalizeRelativePath,
};
