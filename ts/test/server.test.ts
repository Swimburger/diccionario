import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { createServer } from '../src/server.js';
import type { WordList } from '../src/wordlist.js';

class FakeWordList implements WordList {
  constructor(private readonly words: string[], private readonly err: Error | null = null) {}

  async addWord(_word: string): Promise<void> {
    // no-op for tests
  }

  async getWords(): Promise<string[]> {
    if (this.err) {
      throw this.err;
    }
    return this.words;
  }
}

describe('GET /exists/:word', () => {
  it('word exists with exact match', async () => {
    const wl = new FakeWordList(['hola', 'adios']);
    const app = createServer(wl);

    const res = await request(app).get('/exists/hola');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true });
  });

  it('prefix of a word is not an exact match', async () => {
    const wl = new FakeWordList(['hola', 'adios']);
    const app = createServer(wl);

    const res = await request(app).get('/exists/ad');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  it('matches case insensitively', async () => {
    const wl = new FakeWordList(['hola', 'adios']);
    const app = createServer(wl);

    const res = await request(app).get('/exists/HoLa');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: true });
  });

  it('word does not exist', async () => {
    const wl = new FakeWordList(['hola', 'adios']);
    const app = createServer(wl);

    const res = await request(app).get('/exists/bonjour');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  it('empty word list', async () => {
    const wl = new FakeWordList([]);
    const app = createServer(wl);

    const res = await request(app).get('/exists/hola');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ exists: false });
  });

  it('GetWords returns error', async () => {
    const wl = new FakeWordList([], new Error('boom'));
    const app = createServer(wl);

    const res = await request(app).get('/exists/hola');

    expect(res.status).toBe(500);
  });
});
