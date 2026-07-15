import * as path from 'path';
import { fileURLToPath } from 'url';

import request from 'supertest';
import { bench, describe } from 'vitest';

import { createServer } from '../src/server.js';
import { FileWordList } from '../src/wordlist.js';

// Benchmark the /matches/:prefix endpoint against the real ~236k-word list.
const wordsPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../words.txt',
);
const app = createServer(new FileWordList(wordsPath));

describe('GET /matches/:prefix', () => {
  // Large result set (~17k matches): scan + build + serialize dominate.
  bench('prefix "a" (many matches)', async () => {
    await request(app).get('/matches/a');
  });

  // Moderate result set (~3k matches).
  bench('prefix "pre" (some matches)', async () => {
    await request(app).get('/matches/pre');
  });

  // Tiny result set, but still a full scan of the word list.
  bench('prefix "zyth" (few matches)', async () => {
    await request(app).get('/matches/zyth');
  });

  // No matches, yet the endpoint still reads and scans the entire list.
  bench('prefix "qzx" (no matches)', async () => {
    await request(app).get('/matches/qzx');
  });
});
