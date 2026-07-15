import * as path from 'path';
import { fileURLToPath } from 'url';

import { bench, describe } from 'vitest';

import { CachedWordList, FileWordList } from '../src/wordlist.js';

// Benchmark the WordList layer directly (no HTTP) against the real ~236k-word
// list. Driving supertest was flaky (ECONNRESET) once queries got fast, and the
// HTTP round-trip dominated the measurement; this isolates the actual work.
//
// A single shared instance builds its cache/index/set once, matching how a
// running server reuses them across requests.
const wordsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../words.txt',
);
const wl = new CachedWordList(new FileWordList(wordsPath));

describe('CachedWordList.has', () => {
  bench('existing word', async () => {
    await wl.has('Zyzzogeton');
  });

  bench('missing word', async () => {
    await wl.has('notarealword');
  });
});

describe('CachedWordList.matches', () => {
  bench('prefix "a" (many matches)', async () => {
    await wl.matches('a');
  });

  bench('prefix "pre" (some matches)', async () => {
    await wl.matches('pre');
  });

  bench('prefix "zyth" (few matches)', async () => {
    await wl.matches('zyth');
  });

  bench('prefix "qzx" (no matches)', async () => {
    await wl.matches('qzx');
  });
});
