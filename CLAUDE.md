# Audioplay — read this first

Eyes-free voice chess on Lichess, as a static website. The
owner plays standing at a real board, iPad across the room,
without reading glasses: anything that must be acted on is
SPOKEN. Static files on GitHub Pages, OAuth PKCE in the
browser, no server anywhere in this project.

## Before changing anything

Read `src/header.js` — the header of record. It carries
the project's constraints and the reasoning behind decisions
that look arbitrary. Then read the header of whatever file
you are about to touch. **The comments are the
documentation**; there is no wiki. The one exception is the
w-series history, which is a changelog rather than reasoning
next to code: it lives in `HISTORY.md` at the repo root.
`frozen-userscript/us-header.js` is NOT binding any more —
everything still live moved into `src/`, and what is
left there describes the frozen userscript. Read it for why
something happened, never for what to do now.

## Commands

```
node test_harness.js    # must be all-pass before any commit
node property_check.js  # the invariants, on generated utterances
node perft_check.js     # only when src/rules.js changes
node build.js           # writes index.html locally, to LOOK at
```

`property_check.js` is the other half of the harness, and it
guards what the harness structurally cannot. A hand-written test
only ever checks the cases its author imagined, and the author is
the person who wrote the bug. This generates instead: random
games for positions, the whole spoken grammar for sentences, and
rules that must hold whatever was said — a bare square is a pawn
push, a take word means a capture, a spoken file is the mover's
file. Seeded, so a failure reproduces. Raise the position count
when the grammar grows.

`build.js` is pure concatenation: it joins the files named in
`manifest.txt`, in order, and inlines them into
`src/index.html` at its lone `AUDIOPLAY_JS` line. It must
never grow transforms, minification, or dependencies.

**You do not commit the built page.** `index.html` is
gitignored. `.github/workflows/deploy.yml` runs the same
build on every push to `main` and publishes the result
straight to Pages, so the deployed page is generated from
whatever `src/` says at that commit and cannot disagree with
it. Run `build.js` locally when you want to open the real
page in a browser; the output is scratch.

## Layout

- `src/` — the only place code is edited. One file per
  job, named for what it does, plus `header.js` and
  `closure-footer.js` (which open and close the closure
  around all of it) and `index.html` (the TEMPLATE).
  The files carried numeric prefixes once; load order is
  `manifest.txt`'s job, not the filenames'.
- `index.html` at the repo root — **GENERATED and
  GITIGNORED**. Built on demand locally, built again by the
  deploy workflow. Never edit it, never commit it.
- `manifest.txt` — the load order.
- `HISTORY.md` — the w-series history, one entry per bump.
- `.github/workflows/checks.yml` — the checks GitHub runs.
- `frozen-userscript/` — the userscript, frozen at v137,
  kept as a working fallback. Do not build, do not "fix".
  `test_harness.js` checks the ARTIFACT's sha against
  `userscript-frozen.sha256`; the sources beside it are not
  guarded, which is how `us-header.js` could be marked as
  history without breaking anything.
- `reference/` — the retired w19 site. Salvage only.

## Rules that are not style preferences

1. **FAIR PLAY.** `src/rules.js` says what is legal and
   what a move is called. It never evaluates, suggests, or
   ranks. Move-choosing help of any kind would make this a
   cheating device and get the owner banned. Do not add it in
   any form. **And the usual word for such a program appears
   nowhere in this repo** - not in code, not in a comment, not
   in a log line. It drifted into the speech layer once,
   meaning the iOS synthesizer, and printed into the log users
   are asked to paste (w67). Say synthesizer, speech synthesis,
   or the voice. The harness greps for it and fails on one hit.
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

One line: `w`-series, assigned in `src/lichess.js` as
`VERSION = "wNN"`. Bump for any behavioural change and add
an entry to `HISTORY.md` saying WHY, not what — the diff
already says what. Never displayed on screen — it appears in
log lines, so a pasted log says which build produced it.

Entries go at the END of `HISTORY.md`, oldest first: they
refer back and forward to each other, so the order is the
story. Several record a mistake and the rule it earned
(`w18`, `w28`, `w31`, `w37`) — do not tidy those away.

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

`.github/workflows/checks.yml` runs all four commands on
every pull request and every push to `main`. Running them
locally is still the rule — CI is the backstop, not the
first line — but it means an edit made in GitHub's web UI,
where there is no terminal and the harness CANNOT be run, is
checked too. Those used to reach the live page unexamined.

The third check only proves the build RUNS — a manifest
naming a file that is not there, or a template that lost its
`AUDIOPLAY_JS` line, should not first be discovered by a
failed deploy.

It used to do more: it rebuilt `index.html` and diffed it
against the committed copy, because the page was generated
but committed by hand and could fall behind `src/` silently
— Pages serving the old build while the source said
otherwise, the w18 shape. `deploy.yml` removed the thing
that could drift instead of checking it, which is the better
end of that trade: there is no second copy to keep in step.

## Working on this repo

The GitHub loop, settled 5 Aug 2026. It exists so the owner
is not a gatekeeper on every step.

1. Branch off `main`: `claude/<short-description>`.
2. Edit `src/` only. Never the root `index.html`.
3. `node test_harness.js`, all-pass. Add a test for what
   changed, and ask the built DOM.
4. Bump `VERSION` and add a `HISTORY.md` entry if behaviour
   changed. Neither, if it did not.
5. Push, open a PR, wait for the checks, merge when green.
   The branch deletes itself — the repo does that.

**Nothing is live until the merge.** Merging `main` is what
runs the deploy; a pushed branch changes nothing the owner
can see. The deploy takes a minute or so after the merge —
watch the `deploy` workflow, not just `checks`. Then the
device needs a HARD reload: a normal one serves the cached
build, which is what w19 was about.

**Do not stop at each step for permission.** Routine work —
docs, refactors, a fix with a test behind it — goes through
that loop and gets reported when it is done. Ask first only
where judgement is owed: behaviour the owner must feel on
the device, a constraint pulling against the request, or
anything the harness cannot prove. Say plainly what to look
for on the device; much of this project is only provable by
a real game.

**MERGING IS CLAUDE'S TO DO, and step 5 means it.** Push,
open the PR, wait for the checks, merge when green — without
asking, in this session or any later one. Report what was
merged and why. This is written out because step 5 above
reads as a list of stages and was taken as a list of stages:
through w50–w59 every merge was paused on for a confirmation
the loop had already given, which is a click per change for
no decision.

Three things it does not license, and none of them is a
request for permission:

- **Never merge on red.** Diagnose it, fix it, say what it
  was. A failure that turns out to be infrastructure rather
  than code is worth saying out loud too — that happened all
  through 6 Aug 2026 and the difference mattered.
- **Say what to look for BEFORE a device-visible change
  lands**, in the same breath as merging it. w56 is the
  example: one line, and the only change in ten versions
  that could move what is on screen. Merging it was right;
  merging it silently would not have been.
- **Do not merge someone else's judgement call.** A
  constraint pulling against the request, a behaviour the
  owner has an opinion about, a trade with no obviously
  right side — those are asked about while the branch sits
  there, which costs nothing.

**Branch protection on `main` is deliberately off.** It was
weighed on 5 Aug 2026 and declined: with one person and CI
already running on every push, requiring reviews would add
clicks for the owner and no safety. Revisit it only if a
second contributor appears. The checks are the safety net.
