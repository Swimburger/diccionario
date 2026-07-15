# diccionario

A simple word list service control plane.

It has the following capabilities:

* Check if a word exists in the word list
* Add a new word to the word list
* Find a list of words that match a given prefix

The word list is stored in a flat file at [words.txt](./words.txt).

# Endpoints

## /exists/:word

This endpoint checks if a word exists in the word list.

Expected functionality:
* It returns a 200 upon success
* It returns other status codes as appropriate (4XXs for input errors, 5XXs for internal server errors)
* The response body is a JSON object with a single field `exists` of type boolean
  * Example: `{ "exists": true }`
* It performs case insensitive matching to the words in the wordlist
* It only returns true if the word exists (exactly matches) in the wordlist

## /add

This endpoint adds a new word to the word list.

Expected functionality:
* It returns a 204 upon success.
* It returns a 409 if the word already exists in the word list.
* It returns other status codes as appropriate (4XXs for input errors, 5XXs for internal server errors)
* The newly added word should persist for the life of the running Docker container.
* A word is considered a single string of unbroken alpha characters (no numbers or special characters)

## /matches/:prefix

This endpoint returns a list of words that match a given prefix.

Expected functionality:
* It returns a 200 upon success
* It returns other status codes as appropriate (4XXs for input errors, 5XXs for internal server errors)
* The response body is a JSON object with a single field `matches` of type string array
  * Example: `{ "matches": ["word1", "word2"] }`
* It performs case insensitive matching to the words in the wordlist
* It only returns words that match the given prefix

# Go Implementation

All of the Go-related code is in the `go` directory.

From the root of this repo run:

```sh
docker build -f go/Dockerfile -t diccionario .
docker run -it -p 8080:8080 -v ./go:/usr/src/diccionario diccionario
```

The server will be available at http://localhost:8080.
It will automatically reload when you make changes to the source code
(it's using [air](https://github.com/air-verse/air)).

To stop the server, press Ctrl+C in the terminal where it's running.

To access the running container, run:

```sh
docker exec -it `docker ps | grep diccionario | awk '{print $1}'` bash
```

To exit the terminal session, press Ctrl+D in the terminal where it's running.

# Typescript Implementation

All of the Typescript-related code is in the `ts` directory.

From the root of this repo run:

```sh
docker build -f ts/Dockerfile -t diccionario .
docker run -it -p 5000:5000 -v ./ts:/usr/src/diccionario -v /usr/src/diccionario/node_modules diccionario
```

The server will be available at http://localhost:5000.
It will automatically reload when you make changes to the source code.

To stop the server, press Ctrl+C in the terminal where it's running.

To access the running container, run:

```sh
docker exec -it `docker ps | grep diccionario | awk '{print $1}'` bash
```

To exit the terminal session, press Ctrl+D in the terminal where it's running.

## Status

All three endpoints are implemented and covered by tests:

* `/exists/:word` — case-insensitive exact match via an O(1) lookup.
* `/add` — validates input, rejects duplicates with a 409, and persists the
  word to `words.txt`.
* `/matches/:prefix` — case-insensitive prefix match; results are returned
  sorted. Backed by an in-memory cache, a pre-normalized index, and binary
  search over the sorted list.

Matching and validation are Unicode-normalized (NFC), so accented words compare
consistently regardless of how the request encodes them.

## Development

The word list is loaded once and cached in memory. The `WordList` interface
(`src/wordlist.ts`) is composed via decorators: `CachedWordList` wraps
`FileWordList` to add caching and the search index.

Inside the `ts` directory (or the running container):

```sh
npm install     # install dependencies
npm test        # run the unit tests (vitest)
npm run bench   # run the performance benchmarks
npm run build   # type-check and compile to dist/
```

See [ts/ISSUES.md](./ts/ISSUES.md) for known encoding edge cases and
[ts/BENCHMARKS.md](./ts/BENCHMARKS.md) for performance results.
