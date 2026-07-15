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
