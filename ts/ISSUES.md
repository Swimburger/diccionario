# Known issues

All actionable bugs below are fixed. The remaining items are either intentional
non-fixes or optional enhancements (not bugs).

## /exists, /add, /matches — language & encoding edge cases

### Fixed

1. **Unicode normalization (NFC vs NFD)** — comparisons now fold through
   `foldWord()` (`.normalize('NFC').toLowerCase()`), and `isValidWord()`
   NFC-normalizes before the `\p{L}` test, so precomposed and decomposed forms
   of accented letters (e.g. `ñ` as U+00F1 vs `n` + U+0303) compare and validate
   equal. `/add` also stores the canonical NFC form.

2. **File line endings / stray bytes** — `FileWordList.getWords()` now strips a
   leading UTF-8 BOM, splits on `/\r?\n/` (so CRLF files don't leave a trailing
   `\r`), trims each line, and drops blank lines (including the trailing
   newline's empty entry).

3. **100k-line truncation** — `getWords()` no longer does `.slice(0, 100_000)`,
   so words past line 100,000 (e.g. the z-words in the alphabetical list) are
   found. The whole list (~235,976 words) is loaded once and cached.

### Not code-fixed (by design)

4. **URL / percent-encoding** — accepted behavior, not a bug. `req.params` is
   percent-decoded by Express; non-ASCII letters must be percent-encoded and a
   malformed `%` sequence yields a 400, which is the correct response to
   malformed input. The decoded value is NFC-normalized downstream (see #1).

5. **Case-folding special cases** (Turkish İ/ı, German ß/ẞ) — left as-is.
   `toLowerCase()` is intentionally locale-independent, which is the correct,
   predictable choice for this Spanish/ASCII corpus. Full case folding (e.g.
   `STRASSE` == `straße`) would need a dedicated case-folding routine and is out
   of scope until the corpus requires it.

6. **Homoglyphs / confusables** (e.g. Cyrillic `а` U+0430 vs Latin `a` U+0061) —
   inherent to Unicode text; distinct code points are genuinely different words.
   Not fixable without a confusables-mapping policy, which we do not want.

## Possible future enhancements (not bugs)

Deliberately left out; noted for future reference.

- **Result limit / pagination for `/matches`** — a broad prefix like `a` returns
  ~17k words; the only remaining `/matches` cost is building that array. A limit
  would cap it, but it changes the API contract, so it is out of scope for now.
- **Incremental index/set maintenance on `/add`** — `CachedWordList` currently
  invalidates and rebuilds its cache/index/set on a successful add. Inserting
  into the existing structures would avoid the rebuild, but adds are rare so the
  gain is marginal.
