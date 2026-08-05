# Audioplay — handoff for the next chat

**Read `src/us-header.js` first** (the userscript's front door:
constraints, platform findings, closed cases, v-history), then
`src/web-header.js` (the website's: the w-history and the w20
rebuild). Then the header of whichever file you touch. The
comments ARE the handoff; everything below is *ephemeral
session state* the source cannot know. Do not commit this
file. If something here proves durable, move it into the
relevant header and delete it here.

---

## THE FREEZE (the biggest change in this note)

The userscript is FROZEN at v137, by the owner, Aug 5 2026.
The website is the project. Practically:
- Edit ANY src file freely - it all serves the website now.
- Do not touch anything in frozen-userscript/; the harness
  checks the canon artifact's sha against the recorded one.
- One version line now: w-series, in web-11. No more v-bumps.
- us-header.js is still required reading; the knowledge in
  it did not freeze.
- Longer term, web-12 no longer needs to shadow 12-ui.js;
  the body-attached overlay panels can become real page
  panels when the owner wants that.

## The shape of the project now

ONE modular source tree builds BOTH deploys:

```
src/                the only place code is edited
  00-header.js      the header of record - READ FIRST
  01..15, board.js, closure-footer.js
  index.html        the template (build inlines the script)
manifest.txt        the load order; @template names the page
build.js            pure concatenation; "node build.js"
dist/index.html     the ONE file uploaded to GitHub Pages
frozen-userscript/  v137: canon artifact, its sha, its four
                    own sources, its old manifest. NOTHING
                    here is built or edited. us-header.js in
                    it is still binding reading.
reference/          the w19 site, salvage material only
```

- `node build.js` → `dist/lichess_audioplay.js`, **byte-identical
  to canon v134** (sha-verified this session).
- `node build.js manifest-web.txt dist/index.html` → the whole
  website as ONE file for GitHub Pages.
- The owner deploys by hand and never runs the build: hand him
  the finished dist file(s) at the end of a session.

## How a new userscript version lands (proven once, on v134)

1. Put the new original at repo root as `lichess_audioplay.js`.
2. Re-cut src/ at its section banners (grep `/*==== N.`).
3. `node build.js` and diff against the original — byte-identical
   or stop.
4. Regenerate `web-11` (it splices the userscript's section 11
   verbatim around three web transplants — its header says
   exactly which parts are whose). Section 12 is usually
   untouched — VERIFY with a section diff, don't assume.
5. Full suite (below). v133→v134 took one session segment and
   the v134 read-back fix flowed into the website by re-copy,
   untouched.

## Run the tests

```
node test_harness.js     # 49 passed, 0 failed as of this note
node perft_check.js      # startpos d4=197281, Kiwipete d3=97862
```

The harness loads the web manifest's files as ONE concatenated
script (hoisting across sections is real; file-by-file loading
breaks it). Its last check rebuilds nothing but compares
`dist/lichess_audioplay.js` to canon, so a web-motivated edit
to a shared file fails loudly.

## Current state

- Userscript: **v135 — the first version BUILT FROM the
  shared tree** (the boot-time settings line). The flow has
  reversed: canon no longer arrives from outside to be cut;
  releases come out of src/ and the build output IS the
  canon original at repo root. The owner must install the
  new dist/lichess_audioplay.js for the userscript to gain
  the line the website already has.
- Website: **w21, FIRST REAL GAME PLAYED AND WON** (Qxf7#,
  log dated 17:15-17:23, in the project files). Now proven on
  device: PKCE sign-in, account event stream, game stream,
  mic, clock mode with a held wake lock, mid-game settings
  flips, the v134 read-back race fix (stream beat the 200 on
  move one and the read-back came from syncMoves), the mate
  rule (Qxf7# never read back, the result line spoke). Zero
  retries in the whole game - no vocabulary work is owed from
  this log, and the house rule stands: add nothing without a
  real mishearing.
  Second full game (45 min vs maia5, won by c1=B#
  underpromotion) found the v136 silent-cancel bug and
  proved the reconnect path. Still unproven: the polling
  fallback, a takeback/draw offer in anger, a game joined
  from the Lichess app side, and any browser that is not
  this iPad.
  No sign-in, no game, not even a page load on a device. The
  harness proves the pipeline and the shell logic; it cannot
  prove Safari, the mic, PKCE against real lichess.org, or the
  floating chips over the page layout. Treat every one of
  those as open until a real game is logged.
- w20 drops from w19, on purpose (see web-header): silent mode
  (left canon at v109), the voice dropdown, w2 low-time
  callouts. If the owner misses one, the tombstones say where
  it lived.

## Things a new session will get wrong if not told

1. **Never edit a shared src file for a web reason.** That is
   what web-* files are for; the guard test enforces it.
2. **Verify that edits actually applied** (the w15 lesson
   stands — this session hit it twice more in generator
   scripts: an assert died before a write and the stale file
   passed the next step). Grep the file after every write.
3. **The harness stub was blind until w28.** Its
   getElementById created any id on demand, so buildUI's
   "already built?" guard always fired and the UI was never
   constructed in any test - every UI test was really a
   source grep, and w27 shipped a no-op with a green suite.
   getElementById now returns null for ids the template does
   not have. If a UI test looks like it greps a file, it is
   probably lying; ask the built tree instead.
4. `dist/` is generated. The template placeholder is a LINE
   that is exactly `AUDIOPLAY_JS`; build.js refuses anything
   else after prose in a comment once swallowed the program.
5. The harness's earlier "syntax OK" was once checking the
   wrong extracted text. The extraction is fixed; if you touch
   it, prove it by breaking a file and watching it fail.

## Where the next real gains are

Unchanged: vocabulary from real logs, nothing speculative.
And the first real w20 game — that log will be worth more
than everything the harness can say.
