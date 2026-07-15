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

// Capability for word lists that can perform prefix matching.
export interface WordMatcher {
  // Returns the words that start with the given prefix (case insensitive),
  // preserving each word's original casing. Results are ordered
  // lexicographically by their lowercased form.
  matches(prefix: string): Promise<string[]>;
}

// A word list that also supports prefix matching.
export type SearchableWordList = WordList & WordMatcher;

// Fold a word for case-insensitive comparison: NFC-normalize its composition
// (so precomposed and decomposed forms of e.g. "ñ" compare equal), then
// lowercase.
export function foldWord(word: string): string {
  return word.normalize('NFC').toLowerCase();
}

// Case-insensitive exact-match lookup over a list of words.
export function containsWord(words: string[], word: string): boolean {
  const target = foldWord(word);
  return words.some((w) => foldWord(w) === target);
}

// A valid word is a single, non-empty string of unbroken alphabetic
// characters (no numbers, whitespace, or special characters). The word is
// NFC-normalized first so a decomposed accented letter (base letter + combining
// mark) is treated as the single letter it renders as, not a letter + a mark.
export function isValidWord(word: string): boolean {
  return /^\p{L}+$/u.test(word.normalize('NFC'));
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
    const target = foldWord(prefix);
    const index = await this.getIndex();

    // The index is sorted by `lower`, so all words with the given prefix form a
    // contiguous run starting at the prefix's lower bound. Walk it until a word
    // no longer starts with the prefix. O(log n + k) instead of a full scan.
    const result: string[] = [];
    for (let i = lowerBound(index, target); i < index.length; i++) {
      if (!index[i].lower.startsWith(target)) {
        break;
      }
      result.push(index[i].original);
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
      const index = (await this.getWords()).map((original) => ({
        original,
        lower: foldWord(original),
      }));
      // Sort using the same order the binary search relies on (default string
      // comparison on the lowercased form, not locale-aware).
      index.sort((a, b) => (a.lower < b.lower ? -1 : a.lower > b.lower ? 1 : 0));
      this.index = index;
    }
    return this.index;
  }
}

// Index of the first entry whose lowercased word is >= target, over an index
// sorted by `lower`.
function lowerBound(index: IndexedWord[], target: string): number {
  let lo = 0;
  let hi = index.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (index[mid].lower < target) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

export class FileWordList implements WordList {
  private readonly filename: string;

  constructor(filename: string) {
    this.filename = filename;
  }

  async getWords(): Promise<string[]> {
    const abs = path.resolve(this.filename);
    const data = await fs.readFile(abs, { encoding: 'utf8' });
    return data
      .replace(/^\uFEFF/, '') // strip a leading UTF-8 BOM, if present
      .split(/\r?\n/) // handle both LF and CRLF line endings
      .map((line) => line.trim()) // drop stray surrounding whitespace (e.g. \r)
      .filter((line) => line.length > 0); // drop blank lines and trailing newline
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
