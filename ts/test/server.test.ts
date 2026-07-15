import request from 'supertest';
import { describe, it, expect } from 'vitest';

import { createServer } from '../src/server.js';
import { CachedWordList, containsWord, type WordList } from '../src/wordlist.js';

class FakeWordList implements WordList {
  readonly added: string[] = [];

  constructor(
    private readonly words: string[],
    private readonly err: Error | null = null,
    private readonly addErr: Error | null = null,
  ) {}

  async getWords(): Promise<string[]> {
    if (this.err) {
      throw this.err;
    }
    return this.words;
  }

  async has(word: string): Promise<boolean> {
    return containsWord(await this.getWords(), word);
  }

  async addWord(word: string): Promise<boolean> {
    if (await this.has(word)) {
      return false;
    }
    if (this.addErr) {
      throw this.addErr;
    }
    this.added.push(word);
    return true;
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

describe('POST /add', () => {
  it('adds a new word and returns 204', async () => {
    const wl = new FakeWordList(['hola']);
    const app = createServer(wl);

    const res = await request(app).post('/add').send({ word: 'adios' });

    expect(res.status).toBe(204);
    expect(wl.added).toEqual(['adios']);
  });

  it('returns 409 when the word already exists', async () => {
    const wl = new FakeWordList(['hola', 'adios']);
    const app = createServer(wl);

    const res = await request(app).post('/add').send({ word: 'hola' });

    expect(res.status).toBe(409);
    expect(wl.added).toEqual([]);
  });

  it('treats an existing word case insensitively as a duplicate', async () => {
    const wl = new FakeWordList(['hola']);
    const app = createServer(wl);

    const res = await request(app).post('/add').send({ word: 'HoLa' });

    expect(res.status).toBe(409);
    expect(wl.added).toEqual([]);
  });

  it('rejects a word containing numbers', async () => {
    const wl = new FakeWordList([]);
    const app = createServer(wl);

    const res = await request(app).post('/add').send({ word: 'hol4' });

    expect(res.status).toBe(400);
    expect(wl.added).toEqual([]);
  });

  it('rejects a word containing special characters', async () => {
    const wl = new FakeWordList([]);
    const app = createServer(wl);

    const res = await request(app).post('/add').send({ word: 'ho la' });

    expect(res.status).toBe(400);
    expect(wl.added).toEqual([]);
  });

  it('rejects an empty word', async () => {
    const wl = new FakeWordList([]);
    const app = createServer(wl);

    const res = await request(app).post('/add').send({ word: '' });

    expect(res.status).toBe(400);
    expect(wl.added).toEqual([]);
  });

  it('rejects a body missing the word field', async () => {
    const wl = new FakeWordList([]);
    const app = createServer(wl);

    const res = await request(app).post('/add').send({});

    expect(res.status).toBe(400);
    expect(wl.added).toEqual([]);
  });

  it('returns 500 when reading the word list fails', async () => {
    const wl = new FakeWordList([], new Error('boom'));
    const app = createServer(wl);

    const res = await request(app).post('/add').send({ word: 'adios' });

    expect(res.status).toBe(500);
  });

  it('returns 500 when persisting the word fails', async () => {
    const wl = new FakeWordList([], null, new Error('disk full'));
    const app = createServer(wl);

    const res = await request(app).post('/add').send({ word: 'adios' });

    expect(res.status).toBe(500);
  });
});

describe('GET /matches/:prefix', () => {
  it('returns prefix matches case insensitively, preserving casing', async () => {
    const wl = new CachedWordList(new FakeWordList(['Adios', 'adiestrar', 'hola']));
    const app = createServer(wl);

    const res = await request(app).get('/matches/ADI');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ matches: ['Adios', 'adiestrar'] });
  });

  it('returns an empty array when nothing matches', async () => {
    const wl = new CachedWordList(new FakeWordList(['hola', 'adios']));
    const app = createServer(wl);

    const res = await request(app).get('/matches/xyz');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ matches: [] });
  });

  it('falls back to a naive scan for a plain WordList', async () => {
    // FakeWordList does not implement WordMatcher, exercising the fallback path.
    const wl = new FakeWordList(['Adios', 'adiestrar', 'hola']);
    const app = createServer(wl);

    const res = await request(app).get('/matches/adi');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ matches: ['Adios', 'adiestrar'] });
  });

  it('returns 500 when reading the word list fails', async () => {
    const wl = new FakeWordList([], new Error('boom'));
    const app = createServer(wl);

    const res = await request(app).get('/matches/adi');

    expect(res.status).toBe(500);
  });
});
