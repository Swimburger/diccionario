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
