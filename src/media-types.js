const path = require('node:path');

const EXTENSIONS = {
  image: new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp']),
  audio: new Set(['.aac', '.flac', '.m4a', '.mp3', '.oga', '.ogg', '.wav', '.weba']),
  video: new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.mpeg', '.mpg', '.ogv', '.webm']),
};

const MIME_TYPES = {
  '.aac': 'audio/aac',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.css': 'text/css; charset=utf-8',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.htm': 'text/html; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.mpeg': 'video/mpeg',
  '.mpg': 'video/mpeg',
  '.oga': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.ogv': 'video/ogg',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.weba': 'audio/webm',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
};

function mediaTypeFor(filename) {
  const extension = path.extname(filename).toLowerCase();
  for (const [type, extensions] of Object.entries(EXTENSIONS)) {
    if (extensions.has(extension)) return type;
  }
  return 'other';
}

function mimeTypeFor(filename) {
  return MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

function inferCollectionType(files) {
  const types = new Set(
    files
      .map((file) => mediaTypeFor(file))
      .filter((type) => type !== 'other'),
  );
  return types.size === 1 ? [...types][0] : 'mixed';
}

module.exports = { EXTENSIONS, inferCollectionType, mediaTypeFor, mimeTypeFor };
