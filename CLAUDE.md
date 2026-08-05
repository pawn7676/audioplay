# Audioplay — read this first

Eyes-free voice chess on Lichess, as a static website. The
owner plays standing at a real board, iPad across the room,
without reading glasses: anything that must be acted on is
SPOKEN. Static files on GitHub Pages, OAuth PKCE in the
browser, no server anywhere in this project.

## Before changing anything

Read `src/00-header.js` — the header of record. It carries
the project's constraints, the w-series history, and the
reasoning behind decisions that look arbitrary. Then read the
header of whatever file you are about to touch. **The
comments are the documentation**; there is no wiki.
`frozen-userscript/us-header.js` is also binding: its
platform findings and closed cases did not freeze with the
code they were learned in.

## Commands

```
node build.js          # src/ -> index.html  (the deployed page)
node test_harness.js   # must be all-pass before any commit
node perft_check.js    # only when src/13-rules.js changes
```

`build.js` is pure concatenation: it joins the files named in
`manifest.txt`, in order, and inlines them into
`src/index.html` at its lone `AUDIOPLAY_JS` line. It must
never grow transforms, minification, or dependencies.

## Layout

- `src/` — the only place code is edited. One file per
  section, `01`..`15`, plus `00-header.js`, `board.js`,
  `closure-footer.js`, and `index.html` (the TEMPLATE).
- `index.html` at the repo root — **GENERATED**. Never edit
  by hand; run the build. It is what GitHub Pages serves.
- `manifest.txt` — the load order.
- `frozen-userscript/` — the userscript, frozen at v137,
  kept as a working fallback. Do not edit, do not build,
  do not "fix". `test_harness.js` checks the artifact's
  sha against `userscript-frozen.sha256`.
- `reference/` — the retired w19 site. Salvage only.

## Rules that are not style preferences

1. **FAIR PLAY.** `src/13-rules.js` says what is legal and
   what a move is called. It never evaluates, suggests, or
   ranks. Engine help would make this a cheating device and
   get the owner banned. Do not add it in any form.
2. **The board API is the only truth.** Never scrape a page
   or infer state from the DOM.
3. **No external libraries, no build-time dependencies.**
4. **Never expose or log a token.**
5. **Silence is not an answer.** Every path an eyes-free
   user can reach must SAY something — silence reads as
   "not heard", not as "done". A question that can be asked
   must be cancellable.
6. **The stylesheet owns what each state LOOKS like; the
   code owns which state IS current**, and says so by
   toggling a class. Setting colours inline from code has
   caused three separate bugs (see w21, w24, w36).

## Versioning

One line: `w`-series, assigned in `src/11-lichess.js` as
`VERSION = "wNN"`. Bump for any behavioural change and add
an entry to the history in `src/00-header.js` saying WHY,
not what. Never displayed on screen — it appears in log
lines, so a pasted log says which build produced it.

## Testing

`test_harness.js` stubs a browser, loads the manifest's
files as ONE concatenated script (function hoisting across
sections is real), boots the page, and drives it. Two hard
lessons are baked in:

- **Ask the built DOM, never grep the source.** A test that
  greps a file for a string passes while the feature is
  broken; this shipped a no-op once (w27/w28).
- **A feature used twice is a different feature.** The
  custom time box was only ever tested by typing into it,
  never by returning to it — which is exactly where it
  broke (w37).

## Deploying

`node build.js` writes the root `index.html`. Committing it
is the deploy; GitHub Pages serves it directly. Always run
the harness first, and say in the PR what the owner should
look for on the device — much of this project can only be
proven by a real game.
