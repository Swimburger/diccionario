## /exists/:word — language & encoding edge cases (to tackle later)

Implementation is currently left as-is (`word.toLowerCase()` compared against
`w.toLowerCase()` in a linear scan). Known edge cases, ranked by likelihood of
biting for a Spanish word list:

1. **Unicode normalization (NFC vs NFD)** — `toLowerCase()` maps case but does
   not normalize composition. `ñ`, `á`, `é`, `ü` have both precomposed (NFC,
   e.g. `ñ` = U+00F1) and decomposed (NFD, `n` + combining tilde U+0303) forms
   that render identically but are not `===` equal. If the file and the request
   use different forms (macOS often returns NFD), matches silently fail.
   Fix: `.normalize('NFC')` on both sides.

2. **File line endings / stray bytes** in `getWords()` (`data.split('\n')`,
   no trimming):
   - CRLF files leave a trailing `\r` on every word (`"hola\r"` never matches).
   - A leading UTF-8 BOM makes the first word `"﻿hola"`, unfindable.
   - Trailing newline yields a final `""` entry.

3. **URL / percent-encoding** — `req.params.word` is percent-decoded by Express.
   Non-ASCII letters must arrive percent-encoded (`ñ` → `%C3%B1`); a malformed
   `%` sequence makes Express throw a URIError → 400 before the handler runs.
   `+` is not decoded to space in a path segment (unlike query strings).

4. **Case-folding special cases** (low risk while corpus is Spanish; uses
   locale-independent `toLowerCase()`):
   - Turkish İ/ı: `'I'.toLowerCase()` is always `'i'`, regardless of locale.
   - German ß/ẞ: no expansion to `ss`, so `STRASSE` ≠ `straße`.

5. **Homoglyphs / confusables** — e.g. Cyrillic `а` (U+0430) vs Latin `a`
   (U+0061) look identical but won't match. Inherent; not really fixable.

Related non-encoding bug that produces the same "word is there but returns
`exists:false`" symptom: `getWords()` does `.split('\n').slice(0, 100000)`, but
`words.txt` has ~235,976 lines — every word past line 100,000 is silently
unfindable.
