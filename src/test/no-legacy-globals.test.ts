/**
 * Guards the end of the legacy migration: application code talks to
 * stores and modules through imports, not through window globals, and
 * components read stores through selectors.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__fixtures__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/** The one deliberate global: window.__IRIS__, the debug/test handle declared in boot.ts. */
const ALLOWED: Array<[string, RegExp]> = [['boot.ts', /interface Window\b/]];

const RULES: Array<[string, RegExp]> = [
  ['window cast to any', /\(?window as any\)?/],
  ['legacy vars object', /\bvars\./],
  ['legacy *FromStore / *InStore bridge functions', /\b\w+(FromStore|InStore)\b/],
  ['global Window declarations', /interface Window\b/],
  ['bare store hook without a selector', /use(Segmentation|ViewManager)Store\(\)/],
];

describe('no legacy globals in application code', () => {
  const files = sourceFiles(SRC);

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  for (const [name, pattern] of RULES) {
    it(`has no ${name}`, () => {
      const hits = files.flatMap(file =>
        readFileSync(file, 'utf8').split('\n')
          .map((line, i) => ({ line, i }))
          .filter(({ line }) => pattern.test(line))
          .filter(() => !ALLOWED.some(([f, p]) => relative(SRC, file) === f && p.source === pattern.source))
          .map(({ line, i }) => `${relative(SRC, file)}:${i + 1}: ${line.trim()}`),
      );
      expect(hits).toEqual([]);
    });
  }
});
