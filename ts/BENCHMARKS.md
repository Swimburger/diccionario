# Benchmarks

Run with:

```sh
npm run bench
```

The benchmark (`test/matches.bench.ts`) exercises the `GET /matches/:prefix`
endpoint via supertest against the real word list (`words.txt`, ~235,976 lines).

## GET /matches/:prefix — baseline (before optimization)

Recorded 2026-07-15, Node 24, vitest 2.1.9. Numbers are indicative and vary by
machine.

| Prefix | Matches   | Throughput | Mean latency |
| ------ | --------: | ---------: | -----------: |
| `a`    | ~17,000   | 104.70 hz  | 9.55 ms      |
| `pre`  | ~3,000    | 125.19 hz  | 7.99 ms      |
| `zyth` | few       | 126.91 hz  | 7.88 ms      |
| `qzx`  | 0         | 123.60 hz  | 8.09 ms      |

### Key finding

Latency is essentially flat (~8 ms) regardless of the number of matches — a
request that matches nothing (`qzx`) costs almost as much as one matching
~17,000 words (`a`). The cost is dominated by fixed per-request work, not the
result size.

Root causes (see analysis in the PR/discussion):

1. The entire file is re-read and `split('\n')` on every request (no caching).
2. Every word is re-lowercased on every request (~100k allocations per call).
3. An unconditional O(n) linear scan; sort order is not exploited.
4. `getWords()` truncates to the first 100,000 lines (`.slice(0, 100_000)`),
   which is also a correctness bug for the alphabetical list (z-words dropped).

## Step 1 — in-memory caching (CachedWordList)

Wrap the file-backed list in `CachedWordList` (composition) so the file is
read and split once, not on every request. Cache is invalidated on a
successful add. Addresses root cause #1.

| Prefix | Matches | Baseline mean | Step 1 mean | Speedup |
| ------ | ------: | ------------: | ----------: | ------: |
| `a`    | ~17,000 | 9.55 ms       | 4.02 ms     | 2.4x    |
| `pre`  | ~3,000  | 7.99 ms       | 2.27 ms     | 3.5x    |
| `zyth` | few     | 7.88 ms       | 2.31 ms     | 3.4x    |
| `qzx`  | 0       | 8.09 ms       | 1.99 ms     | 4.1x    |

The latency floor drops from ~8 ms to ~2 ms. The remaining per-request cost is
now dominated by re-lowercasing every word during the scan (#2) plus result
serialization for large result sets — addressed in later steps.
