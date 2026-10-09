#!/usr/bin/env node
// IRIS on this computer, without cloning anything:
//
//   npx @asterisk-labs/iris demo                 the cloud segmentation demo
//   npx @asterisk-labs/iris <project.json>       a project of yours
//   npx @asterisk-labs/iris init [folder]        a new local project
//   npx @asterisk-labs/iris credentials add|remove <user> [--role admin|annotator] [--file credentials.json]
//
// The masks stay in the browser, unless the project is on the Hugging Face Hub.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIrisServer, listen } from './server.mjs';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const TEMPLATE = fileURLToPath(new URL('../template/', import.meta.url));
const DEFAULT_PORT = 4173;
const DEMO_SITE = {
  project: 'hf://datasets/asterisk-labs/iris-datasets/cloud-demo/project.json',
  labels: 'hf://datasets/asterisk-labs/iris-datasets/cloud-demo',
  login: 'huggingface',
  guests: true,
  admin: { username: 'admin', password: 'admin' },
};

const USAGE = `IRIS: segmentation of satellite images in the browser

Usage:
  npx @asterisk-labs/iris demo                  open the cloud segmentation demo
  npx @asterisk-labs/iris <project.json>        open a project from this computer
  npx @asterisk-labs/iris init [folder]         create an empty local project
  npx @asterisk-labs/iris credentials add|remove <user> [--role admin|annotator] [--file credentials.json]

Options:
  --port <number>   port to listen on (default ${DEFAULT_PORT}, or the next free one)
  --host <address>  address to listen on (default 127.0.0.1)
  --no-open         do not open the browser
`;

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index < 0) return undefined;
  const [, value] = args.splice(index, 2);
  return value;
};
const toggle = (name) => {
  const index = args.indexOf(`--${name}`);
  if (index >= 0) args.splice(index, 1);
  return index >= 0;
};

// The options of the server, wherever they are on the command line
const portOption = flag('port');
const hostOption = flag('host');
const noOpen = toggle('no-open');

const openBrowser = (url) => {
  const [command, ...rest] = process.platform === 'darwin' ? ['open']
    : process.platform === 'win32' ? ['cmd', '/c', 'start', '""'] : ['xdg-open'];
  try {
    spawn(command, [...rest, url], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // Opening it by hand works too
  }
};

const serve = async ({ projectFile, site }, label) => {
  if (!existsSync(join(DIST, 'index.html'))) fail('IRIS is not built: run npm run build first');
  const host = hostOption ?? '127.0.0.1';
  const port = portOption === undefined ? DEFAULT_PORT : Number(portOption);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`Invalid port: ${portOption}`);

  const server = createIrisServer({ dist: DIST, projectFile, site });
  let actual;
  try {
    actual = await listen(server, { port, host, tries: portOption === undefined ? 20 : 1 });
  } catch (error) {
    fail(`Could not listen on ${host}:${port}: ${error.message}`);
  }
  const url = `http://${host.includes(':') ? `[${host}]` : host}:${actual}/`;
  console.log(`IRIS is serving ${label}\n\n  ${url}\n\nPress Ctrl+C to stop.`);
  if (!noOpen) openBrowser(url);
};

/** A project file, or the project.json of a folder */
const projectFileOf = (target) => {
  if (!existsSync(target)) fail(`${target} does not exist`);
  if (!statSync(target).isDirectory()) return target;
  const file = join(target, 'project.json');
  if (!existsSync(file)) fail(`${target} has no project.json: name the project file`);
  return file;
};

const init = async (folder = 'iris-project') => {
  if (!existsSync(TEMPLATE)) fail('The IRIS project template is missing');
  if (existsSync(folder) && readdirSync(folder).length) fail(`${folder} already exists and is not empty`);
  await cp(TEMPLATE, folder, { recursive: true });
  await mkdir(join(folder, 'images'), { recursive: true });
  await mkdir(join(folder, 'segmentation'), { recursive: true });
  const projectPath = join(folder, 'project.json');
  const project = JSON.parse(await readFile(projectPath, 'utf8'));
  project.name = basename(resolve(folder));
  await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`);
  const where = relative(process.cwd(), folder) || '.';
  console.log(`Created ${where}/ with project.json, images.json, images/ and segmentation/.

Edit ${where}/project.json (see https://github.com/asterisk-labs/iris/blob/serverless/docs/config.md),
put each COG in ${where}/images/<id>/image.tif and list the ids in ${where}/images.json, then run:

  npx @asterisk-labs/iris ${where}
`);
};

const [command, ...rest] = args;
if (!command || command === 'help' || command === '--help' || command === '-h') {
  console.log(USAGE);
} else if (command === 'demo') {
  await serve({ site: DEMO_SITE }, 'the cloud demo from Hugging Face');
} else if (command === 'init') {
  await init(rest[0]);
} else if (command === 'credentials') {
  // The script reads its own arguments
  process.argv = [process.argv[0], 'credentials.mjs', ...rest];
  await import('../scripts/credentials.mjs');
} else if (command.startsWith('-')) {
  fail(USAGE);
} else {
  const file = projectFileOf(command);
  await serve({ projectFile: file }, file);
}
