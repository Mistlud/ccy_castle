const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { inferCollectionType, mediaTypeFor } = require('./media-types');

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const HIDDEN_ITEM_FILES = new Set(['meta.json', 'thumbnail.jpg', 'thumbs.db']);
const IGNORED_SYSTEM_FILES = new Set(['thumbs.db']);

function isHiddenItemFile(filename) {
  return HIDDEN_ITEM_FILES.has(filename.toLowerCase());
}

function isIgnoredSystemFile(filename) {
  return IGNORED_SYSTEM_FILES.has(filename.toLowerCase());
}

function clientJoin(parent, child) {
  return parent ? `${parent}/${child}` : child;
}

function breadcrumb(relativePath) {
  const crumbs = [{ title: 'Castle', path: '' }];
  let current = '';
  for (const part of relativePath.split('/').filter(Boolean)) {
    current = clientJoin(current, part);
    crumbs.push({ title: part, path: current });
  }
  return crumbs;
}

class CastleLibrary {
  constructor(guard, logger = console) {
    this.guard = guard;
    this.logger = logger;
    this.refreshRevision = 0;
  }

  invalidate() {
    this.refreshRevision += 1;
    return this.refreshRevision;
  }

  versionFor(relativeDirectory, entries) {
    const hash = crypto.createHash('sha256');
    hash.update(`${this.refreshRevision}\0${relativeDirectory}`);
    for (const entry of entries) {
      hash.update(`\0${entry.kind}\0${entry.name}\0${entry.size ?? ''}\0${entry.mtimeMs}`);
    }
    return hash.digest('hex').slice(0, 16);
  }

  async readMetadata(absoluteDirectory) {
    try {
      const raw = await fs.readFile(path.join(absoluteDirectory, 'meta.json'), 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const result = {};
      for (const field of ['title', 'artist', 'description', 'rating']) {
        if (typeof parsed[field] === 'string') result[field] = parsed[field];
      }
      return result;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        this.logger.warn?.('Ignoring malformed or unreadable meta.json.');
      }
      return {};
    }
  }

  async listEntries(relativeDirectory = '') {
    const directory = await this.guard.resolveExisting(relativeDirectory, 'directory');
    const dirents = await fs.readdir(directory.absolutePath, { withFileTypes: true });
    const entries = [];

    for (const dirent of dirents) {
      const relativePath = clientJoin(directory.relativePath, dirent.name);
      try {
        const resolved = await this.guard.resolveExisting(relativePath);
        if (!resolved.stat.isDirectory() && !resolved.stat.isFile()) continue;
        entries.push({
          name: dirent.name,
          path: relativePath,
          kind: resolved.stat.isDirectory() ? 'directory' : 'file',
          size: resolved.stat.isFile() ? resolved.stat.size : null,
          mtimeMs: resolved.stat.mtimeMs,
          mediaType: resolved.stat.isFile() ? mediaTypeFor(dirent.name) : 'folder',
        });
      } catch (error) {
        this.logger.warn?.(`Skipping unsafe or inaccessible entry: ${dirent.name}`);
      }
    }

    entries.sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === 'directory' ? -1 : 1;
      return collator.compare(left.name, right.name);
    });
    return entries;
  }

  async menus() {
    const entries = await this.listEntries('');
    return entries
      .filter((entry) => entry.kind === 'directory')
      .map(({ name, path: relativePath }) => ({ title: name, path: relativePath }));
  }

  async directoryData(relativeDirectory) {
    const directory = await this.guard.resolveExisting(relativeDirectory, 'directory');
    const entries = await this.listEntries(directory.relativePath);
    const metadata = await this.readMetadata(directory.absolutePath);
    const version = this.versionFor(
      directory.relativePath,
      entries.filter((entry) => entry.kind !== 'file' || !isIgnoredSystemFile(entry.name)),
    );
    const mediaFiles = entries.filter(
      (entry) => entry.kind === 'file' && !isHiddenItemFile(entry.name),
    );
    return { directory, entries, mediaFiles, metadata, version };
  }

  async card(relativeDirectory) {
    const { directory, mediaFiles, metadata, version } = await this.directoryData(relativeDirectory);

    return {
      path: directory.relativePath,
      title: metadata.title || path.basename(directory.absolutePath),
      artist: metadata.artist || '',
      type: inferCollectionType(mediaFiles.map((file) => file.name)),
      description: metadata.description || '',
      rating: metadata.rating || '',
      mediaCount: mediaFiles.length,
      thumbnailUrl: `/thumbnail?path=${encodeURIComponent(directory.relativePath)}&v=${version}`,
    };
  }

  async cards(relativeMenu) {
    const entries = await this.listEntries(relativeMenu);
    return Promise.all(
      entries
        .filter((entry) => entry.kind === 'directory')
        .map((entry) => this.card(entry.path)),
    );
  }

  async browse(relativeDirectory = '') {
    const { directory, entries: allEntries, mediaFiles, metadata, version } = await this.directoryData(relativeDirectory);
    const visibleEntries = allEntries.filter(
      (entry) => entry.kind !== 'file' || !isHiddenItemFile(entry.name),
    );
    return {
      path: directory.relativePath,
      title: directory.relativePath ? path.basename(directory.absolutePath) : 'Castle',
      artist: metadata.artist || '',
      type: inferCollectionType(mediaFiles.map((file) => file.name)),
      description: metadata.description || '',
      rating: metadata.rating || '',
      mediaCount: mediaFiles.length,
      thumbnailUrl: `/thumbnail?path=${encodeURIComponent(directory.relativePath)}&v=${version}`,
      breadcrumb: breadcrumb(directory.relativePath),
      entries: visibleEntries.map(({ mtimeMs, ...entry }) => ({
        ...entry,
        mediaUrl: entry.kind === 'file' ? `/media?path=${encodeURIComponent(entry.path)}` : null,
      })),
    };
  }

  async item(relativeDirectory) {
    return {
      menu: await this.browse(relativeDirectory),
      cards: await this.cards(relativeDirectory),
    };
  }
}

module.exports = { CastleLibrary, breadcrumb, clientJoin };
