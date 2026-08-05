# Audioplay — handoff for the next chat

**Read `app.js`'s header block first.** It is the project's real
documentation: what this is, who it is for, the hard constraints, the
file map, the closed cases, and the full version history w1–w19. Then
read the header of whichever file you are about to touch — every file
carries the reasoning for its own code.

This note deliberately contains **nothing that belongs in the source**.
The project decided at userscript v90 that a separate handoff document
becomes a second source of truth needing constant syncing, and folded
it into the code. That decision stands, and this file is not a reversal
of it: everything below is *ephemeral session state* — what is deployed
right now, what is unproven, what to do next — which the source cannot
know and should not carry. **Do not commit this file to the repo.** If
something here turns out to be durable, move it into the relevant
file's header and delete it from here.

---

## What this is, in one paragraph

Eyes-free voice chess on Lichess, as a static website. Third chapter of
a project: BoardEye read a physical board with a camera; the Lichess
Audioplay userscript (v104) played by voice but required the Userscripts
app; this site removes that barrier. Open the page, tap "Sign in with
Lichess", approve once, play by speaking moves. No token to create,
nothing to install. Hosted on GitHub Pages — OAuth PKCE runs entirely
in the browser, so the project has no server anywhere.

## Deployment

- Repo: `pawn7676/audioplay` → `https://pawn7676.github.io/audioplay/`
- GitHub Pages: deploy from branch, root.
- Files sit at repo root. `test_harness.js` lives there too and is
  never served (nothing links it).
- The owner uploads by hand through the GitHub web UI. **Keep changes
  to as few files as possible** — this is a real constraint on how to
  design a change, not a nicety. See "Churn" below.

## Current state: w19, all green

- `rules.js` perft: startpos d4 = 197281, Kiwipete d3 = 97862 ✓
- `test_harness.js`: 46 passed, 0 failed ✓
- Working copy and the owner's uploaded copy are believed in sync as of
  the end of that session.

## Run the tests

```
node test_harness.js        # stubs the browser, loads all six scripts
```

Perft, when `rules.js` is touched (it is FROZEN — re-run both):

```
node -e "const fs=require('fs');eval(fs.readFileSync('rules.js','utf8'));
const R=makeRules();
function perft(p,d){if(d===0)return 1;let n=0;
for(const m of p.legalMoves()){const q=p.clone();q.apply(m);n+=perft(q,d-1);}return n;}
console.log(perft(new R.Position(),4));"
```

---

## Things a new session will get wrong if not told

**1. Verify that edits actually applied.** At w15 a scripted edit
asserted on a *later* file, died before writing `app.js`, and the two
version bumps after it then matched nothing and failed **silently**.
`VERSION` read `w14` for three versions while the assistant reported
otherwise. Assert on every replacement, and grep the file afterwards.
This is recorded as w18 in the history.

**2. The browser cache will lie to you.** Cache-busting query strings
were removed at w5 (they forced an `index.html` edit on every version
bump). GitHub Pages caches ~10 minutes. Three separate "the fix doesn't
work" reports were stale JavaScript. Before debugging anything the
owner reports, confirm the running build: the Log panel prints
`script loaded wNN` and `panels found N, saved state ...`.

**3. Do not propose muting speech for speed.** Measured in game17:
opponent's move → first word heard, median **11.0s**; that word → POST,
median **0.0s**. The code is free; the wait is thinking, speaking,
Safari's transcript finalisation, and the program's own voice (the mic
is deaf while it talks). w15 turned the announcement into a checkbox and
w16 deleted it the same day: hearing the opponent's move *is* audioplay,
and fast chess already has lichess.org. Tombstone in `modes.js`.

**4. No code may assume an iPad.** The userscript had one user; the site
has whoever finds it. w4 shipped a six-name Apple voice list and Windows
users saw an empty dropdown. Prefer *detecting what is there* to
*declaring what should be*. The no-reading-glasses constraint still
drives the display decisions in `modes.js` and should not be undone.

**5. Fair play is permanent.** `rules.js` may only answer which moves
are LEGAL and what they are CALLED. No evaluation, search, opening book,
or move recommendation, ever.

## Churn: the recurring friction

The owner uploads files by hand and has objected — correctly — to
four-file changes for one idea. Two rules came out of it:

- `index.html` holds the **resting** look and layout. Anything whose
  appearance changes with program state is styled from `app.js`,
  inline (w11).
- Checkboxes bind by `data-setting="key"` → `MODE_SETTINGS[key]`, so a
  new setting needs `index.html` (control) + `modes.js` (default) only
  (w18).
- No version string anywhere in `index.html` (w5), and no version shown
  on screen at all (w6). `VERSION` lives in `app.js` and appears only in
  log lines.

Still outstanding: **19 `uiStatus()` wording strings live in
`lichess.js`.** That file should report *state* and let `app.js` choose
the *words*. Until that is done, some status-text changes drag
`lichess.js` along. This is the next churn fix worth doing.

## Open / unproven

- **Only one real game has been played on the site** (game 17, logged,
  in the project files). Everything beyond that is untested in anger.
- **Clock mode and silent mode have never been used on the website.**
  They were ported verbatim from userscript sections 15/16 at w2 and
  fullscreen was removed at w3; the overlays now fill the viewport under
  Safari's toolbar. Unverified on device.
- **Low-time callouts** (w2, opt-in, default off) have never fired in a
  real game. This reopened a v92 closed case at the owner's request; the
  amended tombstone is in `modes.js`. Note the owner has now lost on
  time from a winning position in a 5+3 game with the clock visible.
- **The mic-restart fix (w14) is unverified in a real game.** Game17
  found that tapping the round button *during* an announcement left the
  mic permanently dead with the button lit — the userscript could assume
  the mic was already up, the website cannot, because the connection now
  belongs to sign-in. End-of-speech now re-checks. Watch for
  `MIC starting after speech (was blocked by it)` in the next log.

## Where the next real gains are

Vocabulary, from real logs — that is where every gain in this project
has actually come from. Game17's two retries cost 10s and 6s:

- `"Tell three"` / `"Tell Ted three"` for *delta three* — heard once,
  the owner repeated it and it worked. Not yet acted on.
- `"Rep takes golf for"` for *rook takes g4* — the repair caught it and
  asked. That is the system working.

The house rule holds: **nothing speculative.** Every vocabulary entry
must come from a real mishearing in a real log. `"tags"/"tag"` were
added at w14 on exactly that basis.

## Working style that works

- Log dumps are the best source of bugs. Ask for them; read them
  closely. Several fixes came from lines nobody asked about.
- Verify before asserting. Run the position, run the test.
- Bump the version per behavioural change and revert freely. w15 was
  deleted the day it was built. That is the system working.
- Say what is unproven.
- Comment lines are kept to ~70 characters so they read on an iPad.
