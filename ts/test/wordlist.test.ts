import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileWordList, containsWord, isValidWord } from '../src/wordlist.js';

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
});

describe('isValidWord', () => {
  it('accepts a plain alphabetic word', () => {
    expect(isValidWord('hola')).toBe(true);
  });

  it('accepts accented letters', () => {
    expect(isValidWord('niño')).toBe(true);
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
