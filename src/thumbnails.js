const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { mediaTypeFor } = require('./media-types');
const { clientJoin } = require('./library');

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
  }

  async cachePathFor(video) {
    const digest = crypto
      .createHash('sha256')
      .update(`${video.absolutePath}\0${video.stat.size}\0${video.stat.mtimeMs}`)
      .digest('hex');
    return path.join(this.cacheDirectory, `${digest}.jpg`);
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
    const names = await fs.readdir(directory.absolutePath);

    const explicitName = names.find((name) => name.toLowerCase() === 'thumbnail.jpg');
    if (explicitName) {
      try {
        return (await this.guard.resolveExisting(clientJoin(directory.relativePath, explicitName), 'file')).absolutePath;
      } catch {
        // Continue through the documented fallback order.
      }
    }

    const videos = [];
    const images = [];
    for (const name of names.sort((left, right) => left.localeCompare(right))) {
      const type = mediaTypeFor(name);
      if (type !== 'video' && type !== 'image') continue;
      try {
        const file = await this.guard.resolveExisting(clientJoin(directory.relativePath, name), 'file');
        if (type === 'video') videos.push(file);
        if (type === 'image') images.push(file);
      } catch {
        // Unsafe and inaccessible candidates are never served.
      }
    }

    if (videos.length > 0) {
      const cachedPath = await this.cachePathFor(videos[0]);
      try {
        const stat = await fs.stat(cachedPath);
        if (stat.isFile()) return cachedPath;
      } catch {
        // Cache miss.
      }

      if (images.length > 0) return images[0].absolutePath;
      if (this.ffmpegAvailable) return this.generate(videos[0], cachedPath);
    }

    return images[0]?.absolutePath || null;
  }
}

module.exports = { ThumbnailService, detectFfmpeg };
