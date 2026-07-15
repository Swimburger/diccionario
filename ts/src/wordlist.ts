import { promises as fs } from 'fs';
import * as path from 'path';

export interface WordList {
  // Returns all words in the list.
  getWords(): Promise<string[]>;

  // Returns true if the word exists in the list (case insensitive, exact match).
  has(word: string): Promise<boolean>;

  // Adds a word to the list if it is not already present (case insensitive).
  // Returns true if the word was added, false if it already existed.
  addWord(word: string): Promise<boolean>;
}

// Optional capability for word lists that can perform prefix matching more
// efficiently than a naive scan.
export interface WordMatcher {
  // Returns the words that start with the given prefix (case insensitive),
  // preserving each word's original casing.
  matches(prefix: string): Promise<string[]>;
}

export function isWordMatcher(w: WordList): w is WordList & WordMatcher {
  return typeof (w as Partial<WordMatcher>).matches === 'function';
}

// Case-insensitive exact-match lookup over a list of words.
export function containsWord(words: string[], word: string): boolean {
  const target = word.toLowerCase();
  return words.some((w) => w.toLowerCase() === target);
}

// A valid word is a single, non-empty string of unbroken alphabetic
// characters (no numbers, whitespace, or special characters).
export function isValidWord(word: string): boolean {
  return /^\p{L}+$/u.test(word);
}

// A word paired with its lowercased form, so prefix matching does not have to
// re-lowercase the word on every request.
interface IndexedWord {
  lower: string;
  original: string;
}

// Wraps a WordList and caches the full word list in memory so repeated reads
// do not hit the underlying store on every call. Also maintains a lowercased
// index for efficient case-insensitive prefix matching. Both caches are
// invalidated when a new word is successfully added.
export class CachedWordList implements WordList, WordMatcher {
  private cache: string[] | null = null;
  private index: IndexedWord[] | null = null;

  constructor(private readonly inner: WordList) {}

  async getWords(): Promise<string[]> {
    if (this.cache === null) {
      // On failure `cache` stays null (assignment never runs), so the next
      // call retries the read.
      this.cache = await this.inner.getWords();
    }
    return this.cache;
  }

  async has(word: string): Promise<boolean> {
    return containsWord(await this.getWords(), word);
  }

  async matches(prefix: string): Promise<string[]> {
    const target = prefix.toLowerCase();
    const index = await this.getIndex();

    const result: string[] = [];
    for (const entry of index) {
      if (entry.lower.startsWith(target)) {
        result.push(entry.original);
      }
    }
    return result;
  }

  async addWord(word: string): Promise<boolean> {
    const added = await this.inner.addWord(word);
    if (added) {
      this.cache = null;
      this.index = null;
    }
    return added;
  }

  private async getIndex(): Promise<IndexedWord[]> {
    if (this.index === null) {
      const words = await this.getWords();
      this.index = words.map((original) => ({ original, lower: original.toLowerCase() }));
    }
    return this.index;
  }
}

export class FileWordList implements WordList {
  private readonly filename: string;

  constructor(filename: string) {
    this.filename = filename;
  }

  async getWords(): Promise<string[]> {
    const abs = path.resolve(this.filename);
    const data = await fs.readFile(abs, { encoding: 'utf8' });
    return data.split('\n').slice(0, 100_000);
  }

  async has(word: string): Promise<boolean> {
    return containsWord(await this.getWords(), word);
  }

  async addWord(word: string): Promise<boolean> {
    if (await this.has(word)) {
      return false;
    }
    await fs.appendFile(this.filename, `${word}\n`, { encoding: 'utf8' });
    return true;
  }
}
