const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { mediaTypeFor } = require('./media-types');
const { clientJoin } = require('./library');

const GENERATED_THUMBNAIL_PATTERN = /^(?:r\d+-)?[a-f0-9]{64}\.jpg(?:\.\d+\.tmp\.jpg)?$/i;

function detectFfmpeg() {
  try {
    return spawnSync('ffmpeg', ['-version'], {
      stdio: 'ignore',
      windowsHide: true,
    }).status === 0;
  } catch {
    return false;
  }
}

class ThumbnailService {
  constructor({ guard, cacheDirectory, ffmpegAvailable = detectFfmpeg(), logger = console }) {
    this.guard = guard;
    this.cacheDirectory = cacheDirectory;
    this.ffmpegAvailable = ffmpegAvailable;
    this.logger = logger;
    this.pending = new Map();
    this.cacheRevision = 0;
    this.directoryCachePaths = new Map();
  }

  async cachePathFor(video, directorySignature) {
    const digest = crypto
      .createHash('sha256')
      .update(`${directorySignature}\0${video.absolutePath}\0${video.stat.size}\0${video.stat.mtimeMs}`)
      .digest('hex');
    return path.join(this.cacheDirectory, `r${this.cacheRevision}-${digest}.jpg`);
  }

  async forgetDirectory(relativeDirectory, nextPath = null) {
    const previousPath = this.directoryCachePaths.get(relativeDirectory);
    if (previousPath && previousPath !== nextPath) {
      await fs.rm(previousPath, { force: true }).catch(() => {});
    }
    if (nextPath) this.directoryCachePaths.set(relativeDirectory, nextPath);
    else this.directoryCachePaths.delete(relativeDirectory);
  }

  async invalidate() {
    this.cacheRevision += 1;
    const staleTasks = [...this.pending.values()];
    await Promise.allSettled(staleTasks);
    this.directoryCachePaths.clear();

    let names;
    try {
      names = await fs.readdir(this.cacheDirectory);
    } catch (error) {
      if (error.code === 'ENOENT') return 0;
      throw error;
    }

    const currentPrefix = `r${this.cacheRevision}-`;
    const staleNames = names.filter(
      (name) => GENERATED_THUMBNAIL_PATTERN.test(name) && !name.startsWith(currentPrefix),
    );
    await Promise.all(staleNames.map((name) => fs.rm(path.join(this.cacheDirectory, name), { force: true })));
    return staleNames.length;
  }

  async generate(video, outputPath) {
    if (this.pending.has(outputPath)) return this.pending.get(outputPath);

    const task = (async () => {
      await fs.mkdir(this.cacheDirectory, { recursive: true });
      const temporaryPath = `${outputPath}.${process.pid}.tmp.jpg`;
      try {
        await new Promise((resolve, reject) => {
          const child = spawn('ffmpeg', [
            '-hide_banner', '-loglevel', 'error', '-y',
            '-ss', '00:00:01', '-i', video.absolutePath,
            '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', temporaryPath,
          ], { windowsHide: true, stdio: 'ignore' });
          child.once('error', reject);
          child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with ${code}`)));
        });
        await fs.rename(temporaryPath, outputPath);
        return outputPath;
      } catch {
        await fs.rm(temporaryPath, { force: true }).catch(() => {});
        this.logger.warn?.('Video thumbnail generation failed; using the placeholder.');
        return null;
      }
    })();

    this.pending.set(outputPath, task);
    try {
      return await task;
    } finally {
      this.pending.delete(outputPath);
    }
  }

  async find(relativeDirectory) {
    const directory = await this.guard.resolveExisting(relativeDirectory, 'directory');
    const names = (await fs.readdir(directory.absolutePath)).sort((left, right) => left.localeCompare(right));
    const signature = crypto.createHash('sha256');
    signature.update(directory.relativePath);
    const videos = [];
    const images = [];
    let explicitThumbnail = null;

    for (const name of names) {
      if (name.toLowerCase() === 'thumbs.db') continue;
      try {
        const entry = await this.guard.resolveExisting(clientJoin(directory.relativePath, name));
        const kind = entry.stat.isDirectory() ? 'directory' : entry.stat.isFile() ? 'file' : 'other';
        signature.update(`\0${kind}\0${name}\0${entry.stat.size}\0${entry.stat.mtimeMs}`);
        if (!entry.stat.isFile()) continue;
        if (name.toLowerCase() === 'thumbnail.jpg') explicitThumbnail = entry;
        const type = mediaTypeFor(name);
        if (type === 'video') videos.push(entry);
        if (type === 'image' && name.toLowerCase() !== 'thumbnail.jpg') images.push(entry);
      } catch {
        // Unsafe and inaccessible entries are never served or fingerprinted.
      }
    }

    if (explicitThumbnail) {
      await this.forgetDirectory(directory.relativePath);
      return explicitThumbnail.absolutePath;
    }

    if (videos.length > 0) {
      const cachedPath = await this.cachePathFor(videos[0], signature.digest('hex'));
      await this.forgetDirectory(directory.relativePath, cachedPath);
      try {
        const stat = await fs.stat(cachedPath);
        if (stat.isFile()) return cachedPath;
      } catch {
        // Cache miss.
      }

      if (images.length > 0) {
        await this.forgetDirectory(directory.relativePath);
        return images[0].absolutePath;
      }
      if (this.ffmpegAvailable) {
        const generated = await this.generate(videos[0], cachedPath);
        if (!generated) await this.forgetDirectory(directory.relativePath);
        return generated;
      }
    }

    await this.forgetDirectory(directory.relativePath);
    return images[0]?.absolutePath || null;
  }
}

module.exports = { ThumbnailService, detectFfmpeg };
