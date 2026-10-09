import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { byteRange, createIrisServer, fileUnder, listen } from '../bin/server.mjs';

const root = mkdtempSync(join(tmpdir(), 'iris-server-'));
const dist = join(root, 'dist');
const projectDir = join(root, 'my project');
mkdirSync(join(dist, 'assets'), { recursive: true });
mkdirSync(join(projectDir, 'images', 'a'), { recursive: true });
writeFileSync(join(dist, 'index.html'), '<!doctype html><title>IRIS</title>');
writeFileSync(join(dist, 'assets', 'app.js'), 'export {}');
writeFileSync(join(root, 'secret.txt'), 'outside');
writeFileSync(join(projectDir, 'project.json'), '{"name": "mine"}');
writeFileSync(join(projectDir, 'images', 'a', 's2.tif'), Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));

let server;
let base;

beforeAll(async () => {
  server = createIrisServer({ dist, projectFile: join(projectDir, 'project.json') });
  const port = await listen(server, { port: 0, host: '127.0.0.1' });
  base = `http://127.0.0.1:${port}`;
});

afterAll(() => new Promise((done) => server.close(done)));

describe('the IRIS server', () => {
  it('serves the page and an iris.json that opens the project', async () => {
    const page = await fetch(`${base}/`);
    expect(page.headers.get('content-type')).toMatch(/text\/html/);
    expect(await page.text()).toContain('<title>IRIS</title>');

    const site = await (await fetch(`${base}/iris.json`)).json();
    expect(site).toEqual({ project: 'project/project.json' });
    expect(await (await fetch(`${base}/${site.project}`)).json()).toEqual({ name: 'mine' });
  });

  it('serves byte ranges of the COGs', async () => {
    const part = await fetch(`${base}/project/images/a/s2.tif`, { headers: { Range: 'bytes=2-5' } });
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 2-5/10');
    expect([...new Uint8Array(await part.arrayBuffer())]).toEqual([2, 3, 4, 5]);

    const tail = await fetch(`${base}/project/images/a/s2.tif`, { headers: { Range: 'bytes=-3' } });
    expect([...new Uint8Array(await tail.arrayBuffer())]).toEqual([7, 8, 9]);

    const whole = await fetch(`${base}/project/images/a/s2.tif`);
    expect(whole.status).toBe(200);
    expect(whole.headers.get('accept-ranges')).toBe('bytes');
    expect(whole.headers.get('content-type')).toBe('image/tiff');

    const beyond = await fetch(`${base}/project/images/a/s2.tif`, { headers: { Range: 'bytes=20-30' } });
    expect(beyond.status).toBe(416);
  });

  it('answers a missing file with 404, not with the page', async () => {
    expect((await fetch(`${base}/project/missing.json`)).status).toBe(404);
    expect((await fetch(`${base}/nothing.js`)).status).toBe(404);
  });

  it('never serves files outside the page and the project', async () => {
    expect((await fetch(`${base}/project/..%2fsecret.txt`)).status).toBe(404);
    expect((await fetch(`${base}/..%2f..%2fsecret.txt`)).status).toBe(404);
    expect(fileUnder(projectDir, '/../secret.txt')).toBeNull();
    expect(fileUnder(projectDir, '/images/a/s2.tif')).toBe(join(projectDir, 'images', 'a', 's2.tif'));
  });

  it('only reads', async () => {
    expect((await fetch(`${base}/project/project.json`, { method: 'PUT', body: '{}' })).status).toBe(405);
  });
});

describe('byteRange', () => {
  it('reads the forms of the Range header', () => {
    expect(byteRange(undefined, 10)).toBeNull();
    expect(byteRange('bytes=0-', 10)).toEqual({ start: 0, end: 9 });
    expect(byteRange('bytes=5-100', 10)).toEqual({ start: 5, end: 9 });
    expect(byteRange('bytes=-4', 10)).toEqual({ start: 6, end: 9 });
    expect(byteRange('bytes=0-1,4-5', 10)).toBeNull();
    expect(byteRange('bytes=9-2', 10)).toBe('invalid');
  });
});

describe('a remote project server', () => {
  it('serves the supplied site configuration without exposing a local project route', async () => {
    const remote = {
      project: 'hf://datasets/asterisk-labs/iris-datasets/cloud-demo/project.json',
      labels: 'hf://datasets/asterisk-labs/iris-datasets/cloud-demo',
      login: 'huggingface',
      guests: true,
    };
    const remoteServer = createIrisServer({ dist, site: remote });
    const port = await listen(remoteServer, { port: 0, host: '127.0.0.1' });
    try {
      expect(await (await fetch(`http://127.0.0.1:${port}/iris.json`)).json()).toEqual(remote);
      expect((await fetch(`http://127.0.0.1:${port}/project/project.json`)).status).toBe(404);
    } finally {
      await new Promise((done) => remoteServer.close(done));
    }
  });

  it('requires either a local project or a site configuration', () => {
    expect(() => createIrisServer({ dist })).toThrow(/project file or site configuration/);
  });
});
