// Serves IRIS and one project from this computer: the built page from dist/,
// the folder of the project under /project/, and an iris.json that opens it.
// Only files are served, with byte ranges for the COGs; nothing is written.
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { basename, dirname, extname, resolve, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
};

/** The file under root that a URL path names, or null when it would leave root */
export const fileUnder = (root, urlPath) => {
  let path;
  try {
    path = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (path.includes('\0')) return null;
  const file = resolve(root, `.${path.startsWith('/') ? '' : '/'}${path}`);
  return file === root || file.startsWith(root + sep) ? file : null;
};

/** The byte range a Range header asks for: null for the whole file, 'invalid' when it cannot be served */
export const byteRange = (header, size) => {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  // Several ranges at once are answered with the whole file
  if (!match) return null;
  const [, from, to] = match;
  let start;
  let end;
  if (from === '') {
    const length = Number(to);
    if (!length) return 'invalid';
    start = Math.max(0, size - length);
    end = size - 1;
  } else {
    start = Number(from);
    end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
  }
  return start > end || start >= size ? 'invalid' : { start, end };
};

const send = (response, status, body, type = 'text/plain; charset=utf-8') => {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  response.end(body);
};

const sendFile = async (request, response, file, cache) => {
  let info;
  try {
    info = await stat(file);
  } catch {
    send(response, 404, 'Not found');
    return;
  }
  if (!info.isFile()) {
    send(response, 404, 'Not found');
    return;
  }
  const headers = {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Accept-Ranges': 'bytes',
    'Cache-Control': cache,
  };
  const range = byteRange(request.headers.range, info.size);
  if (range === 'invalid') {
    response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}` });
    response.end();
    return;
  }
  const { start, end } = range ?? { start: 0, end: info.size - 1 };
  response.writeHead(range ? 206 : 200, {
    ...headers,
    'Content-Length': info.size ? end - start + 1 : 0,
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {}),
  });
  if (request.method === 'HEAD' || !info.size) {
    response.end();
    return;
  }
  createReadStream(file, { start, end }).pipe(response);
};

/**
 * A server for the page in dist and the project file projectFile. The page
 * reads the project at /project/<file>, so its relative paths resolve in its
 * own folder.
 */
export const createIrisServer = ({ dist, projectFile }) => {
  const page = resolve(dist);
  const projectRoot = dirname(resolve(projectFile));
  const site = JSON.stringify({ project: `project/${encodeURIComponent(basename(projectFile))}` });

  return createServer((request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Only GET and HEAD');
      return;
    }
    const { pathname } = new URL(request.url ?? '/', 'http://localhost');
    if (pathname === '/iris.json') {
      send(response, 200, site, TYPES['.json']);
      return;
    }
    if (pathname === '/project' || pathname.startsWith('/project/')) {
      const file = fileUnder(projectRoot, pathname.slice('/project'.length) || '/');
      if (file) sendFile(request, response, file, 'no-store');
      else send(response, 404, 'Not found');
      return;
    }
    const file = fileUnder(page, pathname === '/' ? '/index.html' : pathname);
    if (file) sendFile(request, response, file, pathname.startsWith('/assets/') ? 'max-age=3600' : 'no-cache');
    else send(response, 404, 'Not found');
  });
};

/** Listen on port, or on the next free one when allowed */
export const listen = (server, { port, host, tries = 20 }) => new Promise((done, fail) => {
  let attempt = 0;
  const tryPort = () => {
    const onError = (error) => {
      if (error.code === 'EADDRINUSE' && attempt < tries - 1) {
        attempt += 1;
        tryPort();
      } else {
        fail(error);
      }
    };
    server.once('error', onError);
    server.listen(port === 0 ? 0 : port + attempt, host, () => {
      server.off('error', onError);
      done(server.address().port);
    });
  };
  tryPort();
});
