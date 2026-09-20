const fs = require('node:fs/promises');
const path = require('node:path');
const { inferCollectionType, mediaTypeFor } = require('./media-types');

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const SUPPORTED_META_TYPES = new Set(['video', 'audio', 'image', 'mixed']);

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
  }

  async readMetadata(absoluteDirectory) {
    try {
      const raw = await fs.readFile(path.join(absoluteDirectory, 'meta.json'), 'utf8');
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const result = {};
      for (const field of ['title', 'description', 'date']) {
        if (typeof parsed[field] === 'string') result[field] = parsed[field];
      }
      if (typeof parsed.type === 'string' && SUPPORTED_META_TYPES.has(parsed.type)) {
        result.type = parsed.type;
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

  async card(relativeDirectory) {
    const directory = await this.guard.resolveExisting(relativeDirectory, 'directory');
    const entries = await this.listEntries(directory.relativePath);
    const metadata = await this.readMetadata(directory.absolutePath);
    const mediaFiles = entries.filter(
      (entry) => entry.kind === 'file' && !['meta.json', 'thumbnail.jpg'].includes(entry.name.toLowerCase()),
    );

    return {
      path: directory.relativePath,
      title: metadata.title || path.basename(directory.absolutePath),
      type: metadata.type || inferCollectionType(mediaFiles.map((file) => file.name)),
      description: metadata.description || '',
      date: metadata.date || '',
      mediaCount: mediaFiles.length,
      thumbnailUrl: `/thumbnail?path=${encodeURIComponent(directory.relativePath)}`,
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
    const directory = await this.guard.resolveExisting(relativeDirectory, 'directory');
    const entries = await this.listEntries(directory.relativePath);
    return {
      path: directory.relativePath,
      title: directory.relativePath ? path.basename(directory.absolutePath) : 'Castle',
      breadcrumb: breadcrumb(directory.relativePath),
      entries: entries.map((entry) => ({
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
