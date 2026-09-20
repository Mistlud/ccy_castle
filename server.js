const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { CastleLibrary } = require('./src/library');
const { mimeTypeFor } = require('./src/media-types');
const { PathGuard, UnsafePathError } = require('./src/path-safety');
const { ThumbnailService } = require('./src/thumbnails');

const PUBLIC_DIRECTORY = path.join(__dirname, 'public');
const STATIC_FILES = new Map([
  ['/', 'index.html'],
  ['/app.js', 'app.js'],
  ['/styles.css', 'styles.css'],
  ['/placeholder.svg', 'placeholder.svg'],
]);

function parseRangeHeader(header, size) {
  if (!header) return null;
  if (!header.startsWith('bytes=') || header.includes(',')) return false;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (match[1] === '' && match[2] === '')) return false;

  let start;
  let end;
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0 || size === 0) return false;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return false;
    if (start < 0 || start >= size || end < start) return false;
  }

  return { start, end };
}

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; media-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function sendJson(response, status, value, method = 'GET') {
  const body = Buffer.from(JSON.stringify(value));
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
  });
  response.end(method === 'HEAD' ? undefined : body);
}

function sendText(response, status, message, method = 'GET') {
  const body = Buffer.from(message);
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': body.length,
  });
  response.end(method === 'HEAD' ? undefined : body);
}

async function serveFile(request, response, absolutePath, { allowRange = false, cacheControl = 'no-cache' } = {}) {
  const stat = await fsp.stat(absolutePath);
  if (!stat.isFile()) {
    const error = new Error('Not found');
    error.code = 'ENOENT';
    throw error;
  }

  const headers = {
    'Content-Type': mimeTypeFor(absolutePath),
    'Cache-Control': cacheControl,
    'Accept-Ranges': allowRange ? 'bytes' : 'none',
  };
  let status = 200;
  let start = 0;
  let end = Math.max(stat.size - 1, 0);

  if (allowRange && request.headers.range) {
    const range = parseRangeHeader(request.headers.range, stat.size);
    if (!range) {
      response.writeHead(416, {
        ...headers,
        'Content-Range': `bytes */${stat.size}`,
        'Content-Length': 0,
      });
      response.end();
      return;
    }
    ({ start, end } = range);
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
  }

  const contentLength = stat.size === 0 ? 0 : end - start + 1;
  headers['Content-Length'] = contentLength;
  if (allowRange) {
    headers['Content-Disposition'] = `inline; filename*=UTF-8''${encodeURIComponent(path.basename(absolutePath))}`;
  }
  response.writeHead(status, headers);
  if (request.method === 'HEAD' || contentLength === 0) {
    response.end();
    return;
  }

  const stream = fs.createReadStream(absolutePath, { start, end });
  stream.once('error', () => response.destroy());
  stream.pipe(response);
}

function parseOptions(argv = process.argv.slice(2), env = process.env) {
  const options = {
    root: env.CASTLE_ROOT,
    host: env.CASTLE_HOST || '0.0.0.0',
    port: env.CASTLE_PORT || '8080',
    cacheDirectory: env.CASTLE_CACHE,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') {
      options.help = true;
      continue;
    }
    if (!['--root', '--host', '--port', '--cache'].includes(argument)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    if (index + 1 >= argv.length) throw new Error(`Missing value for ${argument}`);
    const value = argv[++index];
    if (argument === '--root') options.root = value;
    if (argument === '--host') options.host = value;
    if (argument === '--port') options.port = value;
    if (argument === '--cache') options.cacheDirectory = value;
  }

  options.port = Number(options.port);
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error('Port must be an integer from 0 to 65535.');
  }
  options.cacheDirectory = path.resolve(options.cacheDirectory || path.join(__dirname, '.cache', 'thumbnails'));
  return options;
}

function lanAddresses() {
  const addresses = [];
  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const address of interfaces || []) {
      if (address.family === 'IPv4' && !address.internal) addresses.push(address.address);
    }
  }
  return [...new Set(addresses)];
}

async function createCastleServer({ root, cacheDirectory, ffmpegAvailable, logger = console }) {
  const guard = await PathGuard.create(root);
  const library = new CastleLibrary(guard, logger);
  const thumbnails = new ThumbnailService({
    guard,
    cacheDirectory: cacheDirectory || path.join(__dirname, '.cache', 'thumbnails'),
    ffmpegAvailable,
    logger,
  });

  const server = http.createServer(async (request, response) => {
    applySecurityHeaders(response);
    const method = request.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed.' }, method);
      return;
    }

    try {
      const url = new URL(request.url, 'http://castle.local');
      const clientPath = url.searchParams.get('path') || '';

      if (STATIC_FILES.has(url.pathname)) {
        await serveFile(request, response, path.join(PUBLIC_DIRECTORY, STATIC_FILES.get(url.pathname)), {
          cacheControl: url.pathname === '/' ? 'no-cache' : 'public, max-age=3600',
        });
        return;
      }
      if (url.pathname === '/api/menus') {
        sendJson(response, 200, { menus: await library.menus() }, method);
        return;
      }
      if (url.pathname === '/api/browse') {
        sendJson(response, 200, await library.browse(clientPath), method);
        return;
      }
      if (url.pathname === '/api/item') {
        sendJson(response, 200, await library.item(clientPath), method);
        return;
      }
      if (url.pathname === '/media') {
        const file = await guard.resolveExisting(clientPath, 'file');
        await serveFile(request, response, file.absolutePath, { allowRange: true, cacheControl: 'private, max-age=60' });
        return;
      }
      if (url.pathname === '/thumbnail') {
        const thumbnail = await thumbnails.find(clientPath);
        await serveFile(request, response, thumbnail || path.join(PUBLIC_DIRECTORY, 'placeholder.svg'), {
          cacheControl: 'private, max-age=300',
        });
        return;
      }

      sendText(response, 404, 'Not found.', method);
    } catch (error) {
      if (error instanceof UnsafePathError) {
        logger.warn?.('Forbidden path attempt rejected.');
        sendJson(response, 403, { error: 'Forbidden path.' }, method);
        return;
      }
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        sendJson(response, 404, { error: 'Not found.' }, method);
        return;
      }
      logger.error?.('Unhandled server error.', error);
      if (!response.headersSent) sendJson(response, 500, { error: 'Server error.' }, method);
      else response.destroy();
    }
  });

  return {
    ffmpegAvailable: thumbnails.ffmpegAvailable,
    guard,
    library,
    server,
    start({ host = '0.0.0.0', port = 8080 } = {}) {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}

function printHelp() {
  console.log(`Castle LAN Media Browser

Usage:
  node server.js --root <local-castle-path> [--host 0.0.0.0] [--port 8080]

Environment variables:
  CASTLE_ROOT, CASTLE_HOST, CASTLE_PORT, CASTLE_CACHE`);
}

async function main() {
  const options = parseOptions();
  if (options.help) {
    printHelp();
    return;
  }

  const app = await createCastleServer(options);
  const address = await app.start(options);
  const actualPort = address.port;
  console.log(`Castle root: ${app.guard.root}`);
  console.log(`Listening: http://${options.host}:${actualPort}`);
  for (const addressValue of lanAddresses()) console.log(`LAN URL: http://${addressValue}:${actualPort}`);
  console.log(`Optional ffmpeg thumbnails: ${app.ffmpegAvailable ? 'available' : 'unavailable (placeholder fallback enabled)'}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Startup failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createCastleServer, parseOptions, parseRangeHeader, serveFile };
