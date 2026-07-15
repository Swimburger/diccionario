import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CachedWordList,
  FileWordList,
  containsWord,
  isValidWord,
  type WordList,
} from '../src/wordlist.js';

// In-memory WordList that counts getWords() calls, for verifying caching.
class CountingWordList implements WordList {
  getWordsCalls = 0;

  constructor(private readonly words: string[]) {}

  async getWords(): Promise<string[]> {
    this.getWordsCalls++;
    return [...this.words];
  }

  async has(word: string): Promise<boolean> {
    return containsWord(this.words, word);
  }

  async addWord(word: string): Promise<boolean> {
    if (containsWord(this.words, word)) {
      return false;
    }
    this.words.push(word);
    return true;
  }
}

describe('containsWord', () => {
  it('matches an exact word', () => {
    expect(containsWord(['hola', 'adios'], 'hola')).toBe(true);
  });

  it('matches case insensitively', () => {
    expect(containsWord(['hola'], 'HoLa')).toBe(true);
  });

  it('does not treat a prefix as a match', () => {
    expect(containsWord(['adios'], 'ad')).toBe(false);
  });

  it('returns false when the word is absent', () => {
    expect(containsWord(['hola'], 'bonjour')).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(containsWord([], 'hola')).toBe(false);
  });

  it('matches across NFC and NFD normalization forms', () => {
    const nfc = 'ni\u00F1o'; // "niño" precomposed (U+00F1)
    const nfd = 'nin\u0303o'; // "niño" decomposed (n + U+0303)
    expect(nfc).not.toBe(nfd); // guard: the two forms really differ

    expect(containsWord([nfc], nfd)).toBe(true);
    expect(containsWord([nfd], nfc)).toBe(true);
  });
});

describe('isValidWord', () => {
  it('accepts a plain alphabetic word', () => {
    expect(isValidWord('hola')).toBe(true);
  });

  it('accepts accented letters', () => {
    expect(isValidWord('niño')).toBe(true);
  });

  it('accepts a decomposed (NFD) accented word', () => {
    // "niño" is n + combining tilde (U+0303); without NFC normalization the
    // combining mark is \p{M}, not \p{L}, and would be rejected.
    expect(isValidWord('nin\u0303o')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidWord('')).toBe(false);
  });

  it('rejects digits', () => {
    expect(isValidWord('hol4')).toBe(false);
  });

  it('rejects whitespace', () => {
    expect(isValidWord('ho la')).toBe(false);
  });

  it('rejects special characters', () => {
    expect(isValidWord('hola!')).toBe(false);
  });
});

describe('FileWordList', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wordlist-'));
    file = path.join(dir, 'words.txt');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('getWords reads the words from the file', async () => {
    await fs.writeFile(file, 'hola\nadios\n', 'utf8');
    const wl = new FileWordList(file);

    const words = await wl.getWords();

    expect(words).toContain('hola');
    expect(words).toContain('adios');
  });

  it('getWords rejects when the file does not exist', async () => {
    const wl = new FileWordList(path.join(dir, 'missing.txt'));

    await expect(wl.getWords()).rejects.toThrow();
  });

  it('getWords handles CRLF line endings without leaving a trailing \\r', async () => {
    await fs.writeFile(file, 'hola\r\nadios\r\n', 'utf8');
    const wl = new FileWordList(file);

    expect(await wl.getWords()).toEqual(['hola', 'adios']);
  });

  it('getWords strips a leading UTF-8 BOM', async () => {
    await fs.writeFile(file, '\uFEFFhola\nadios\n', 'utf8');
    const wl = new FileWordList(file);

    const words = await wl.getWords();
    expect(words[0]).toBe('hola');
    expect(await wl.has('hola')).toBe(true);
  });

  it('getWords ignores blank lines and the trailing newline', async () => {
    await fs.writeFile(file, 'hola\n\nadios\n', 'utf8');
    const wl = new FileWordList(file);

    expect(await wl.getWords()).toEqual(['hola', 'adios']);
  });

  it('getWords reads words past the former 100k-line truncation', async () => {
    const lines: string[] = [];
    for (let i = 0; i <= 100_000; i++) {
      lines.push(`w${i}`);
    }
    await fs.writeFile(file, `${lines.join('\n')}\n`, 'utf8');
    const wl = new FileWordList(file);

    const words = await wl.getWords();
    expect(words.length).toBe(100_001);
    expect(words[words.length - 1]).toBe('w100000');
    expect(await wl.has('w100000')).toBe(true);
  });

  it('has finds an existing word case insensitively', async () => {
    await fs.writeFile(file, 'hola\nadios\n', 'utf8');
    const wl = new FileWordList(file);

    expect(await wl.has('HOLA')).toBe(true);
    expect(await wl.has('nope')).toBe(false);
  });

  it('addWord appends a new word and returns true', async () => {
    await fs.writeFile(file, 'hola\n', 'utf8');
    const wl = new FileWordList(file);

    expect(await wl.addWord('adios')).toBe(true);
    expect(await fs.readFile(file, 'utf8')).toBe('hola\nadios\n');
  });

  it('addWord keeps repeated adds on separate lines', async () => {
    await fs.writeFile(file, 'hola\n', 'utf8');
    const wl = new FileWordList(file);

    await wl.addWord('adios');
    await wl.addWord('bonjour');

    expect(await fs.readFile(file, 'utf8')).toBe('hola\nadios\nbonjour\n');
  });

  it('addWord rejects a duplicate (case insensitive) and returns false', async () => {
    await fs.writeFile(file, 'hola\n', 'utf8');
    const wl = new FileWordList(file);

    expect(await wl.addWord('HOLA')).toBe(false);
    expect(await fs.readFile(file, 'utf8')).toBe('hola\n');
  });
});

describe('CachedWordList', () => {
  it('reads the inner list only once across repeated calls', async () => {
    const inner = new CountingWordList(['hola', 'adios']);
    const wl = new CachedWordList(inner);

    await wl.getWords();
    await wl.getWords();
    await wl.has('hola');

    expect(inner.getWordsCalls).toBe(1);
  });

  it('has uses the cache and matches case insensitively', async () => {
    const inner = new CountingWordList(['hola']);
    const wl = new CachedWordList(inner);

    expect(await wl.has('HOLA')).toBe(true);
    expect(await wl.has('nope')).toBe(false);
    expect(inner.getWordsCalls).toBe(1);
  });

  it('invalidates the cache after a successful add', async () => {
    const inner = new CountingWordList(['hola']);
    const wl = new CachedWordList(inner);

    expect(await wl.getWords()).toEqual(['hola']);
    expect(await wl.addWord('adios')).toBe(true);
    expect(await wl.getWords()).toContain('adios');
    expect(inner.getWordsCalls).toBe(2); // once before add, once after invalidation
  });

  it('does not invalidate the cache when the word already exists', async () => {
    const inner = new CountingWordList(['hola']);
    const wl = new CachedWordList(inner);

    await wl.getWords();
    expect(await wl.addWord('HOLA')).toBe(false);
    await wl.getWords();

    expect(inner.getWordsCalls).toBe(1);
  });

  it('does not cache a failed read (retries on the next call)', async () => {
    let calls = 0;
    const flaky: WordList = {
      async getWords() {
        calls++;
        if (calls === 1) {
          throw new Error('boom');
        }
        return ['hola'];
      },
      async has() {
        return false;
      },
      async addWord() {
        return true;
      },
    };
    const wl = new CachedWordList(flaky);

    await expect(wl.getWords()).rejects.toThrow('boom');
    expect(await wl.getWords()).toEqual(['hola']);
    expect(calls).toBe(2);
  });

  it('matches a prefix case insensitively, preserving casing, sorted by lowercase', async () => {
    // Sorted by lowercased form: 'adiestrar' (adie) < 'Adios' (adio), which
    // also shows the ordering is case-insensitive (not ASCII, where 'A' < 'a').
    const inner = new CountingWordList(['Adios', 'adiestrar', 'hola']);
    const wl = new CachedWordList(inner);

    expect(await wl.matches('ADI')).toEqual(['adiestrar', 'Adios']);
  });

  it('returns an empty array when nothing matches the prefix', async () => {
    const inner = new CountingWordList(['hola', 'adios']);
    const wl = new CachedWordList(inner);

    expect(await wl.matches('xyz')).toEqual([]);
  });

  it('collects exactly the contiguous run for a prefix in the middle', async () => {
    const inner = new CountingWordList(['aa', 'ac', 'abc', 'ab', 'aba', 'b']);
    const wl = new CachedWordList(inner);

    // sorted: aa, ab, aba, abc, ac, b -> prefix "ab" is the run [ab, aba, abc]
    expect(await wl.matches('ab')).toEqual(['ab', 'aba', 'abc']);
  });

  it('matches a prefix across NFC/NFD normalization forms', async () => {
    const word = 'ni\u00F1o'; // stored precomposed "niño"
    const inner = new CountingWordList([word]);
    const wl = new CachedWordList(inner);

    // decomposed prefix "niñ" (ni + n + combining tilde)
    expect(await wl.matches('nin\u0303')).toEqual([word]);
  });

  it('builds the index once across repeated matches calls', async () => {
    const inner = new CountingWordList(['hola', 'adios']);
    const wl = new CachedWordList(inner);

    await wl.matches('h');
    await wl.matches('a');

    expect(inner.getWordsCalls).toBe(1);
  });

  it('reflects a newly added word in subsequent matches', async () => {
    const inner = new CountingWordList(['hola']);
    const wl = new CachedWordList(inner);

    expect(await wl.matches('ad')).toEqual([]);
    await wl.addWord('adios');
    expect(await wl.matches('ad')).toEqual(['adios']);
  });
});
