import express, { Request, Response } from 'express';
import { CachedWordList, FileWordList, isValidWord, WordList } from './wordlist.js';

export interface ExistsResponse {
  exists: boolean;
}

export interface MatchesResponse {
  matches: string[];
}

export interface AddRequest {
  word: string;
}

export class Server {
  readonly app = express();
  private readonly w: WordList;

  constructor(wordList?: WordList) {
    this.w = wordList ?? new CachedWordList(new FileWordList('/words.txt'));

    this.app.use(express.json());

    this.app.get('/ping', (_req: Request, res: Response) => {
      res.status(200).json({ message: 'pong' });
    });

    this.app.get('/exists/:word', this.wordExists.bind(this));
    this.app.post('/add', this.add.bind(this));
    this.app.get('/matches/:prefix', this.matches.bind(this));
  }

  // Returns true if the word exists in the word list.
  // It performs case insensitive matching to the words in the wordlist.
  private async wordExists(req: Request, res: Response): Promise<void> {
    let exists: boolean;
    try {
      exists = await this.w.has(req.params.word);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      res.status(500).send(msg);
      return;
    }

    const resp: ExistsResponse = { exists };
    res.status(200).json(resp);
  }

  // Returns a list of words that matched the given prefix.
  // It performs case insensitive matching to the words in the wordlist.
  private async matches(req: Request, res: Response): Promise<void> {
    const prefix = req.params.prefix.toLowerCase();

    let wordlist: string[];
    try {
      wordlist = await this.w.getWords();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      res.status(400).send(msg);
      return;
    }

    const resp: MatchesResponse = { matches: [] };

    for (const w of wordlist) {
      if (w.toLowerCase().startsWith(prefix)) {
        resp.matches.push(w);
      }
    }

    res.status(200).json(resp);
  }

  // Add a new word to the word list.
  // A word is a single string of unbroken alpha characters.
  // Returns 204 on success, 409 if the word already exists (case insensitive).
  private async add(req: Request, res: Response): Promise<void> {
    let body: AddRequest;
    try {
      body = req.body as AddRequest;
      if (typeof body.word !== 'string') {
        throw new Error('invalid body');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'invalid body';
      res.status(400).send(msg);
      return;
    }

    if (!isValidWord(body.word)) {
      res.status(400).send('word must contain only alphabetic characters');
      return;
    }

    let added: boolean;
    try {
      added = await this.w.addWord(body.word);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      res.status(500).send(msg);
      return;
    }

    if (!added) {
      res.status(409).send('word already exists');
      return;
    }

    res.status(204).end();
  }
}

export function createServer(wordList?: WordList) {
  const server = new Server(wordList);
  return server.app;
}
