/*  audioplay — eyes-free voice chess on Lichess
 *
 *  THE PAGE YOU ARE READING IS GENERATED. The source lives
 *  in src/, one file per job, joined in the order given by
 *  manifest.txt; "node build.js" reassembles this page and
 *  writes the root index.html that GitHub Pages serves.
 *  Never edit the generated file - the next build erases it.
 *
 *  The files were numbered 00..15 once - a habit from the
 *  userscript era, when this was one long scroll with
 *  numbered sections in it. Order is the manifest's job; a
 *  filename's job is to say what the file is FOR.
 */
(function () {
  "use strict";

  /*===================== THE PROJECT, FROZEN AND LIVING ===========
   *
   *  THE USERSCRIPT IS FROZEN AT v137 (owner's decision,
   *  Aug 5 2026). The website is the project now; the
   *  userscript stays installed as a working fallback and
   *  its sources stay in the tree, unmaintained. What this
   *  changes day to day: the pipeline files in src/ serve
   *  ONLY the website and may evolve freely; the w-series
   *  is the only version line; the harness guards the
   *  frozen v137 ARTIFACT (userscript-frozen.sha256), not
   *  its buildability. What it does not change: us-header
   *  is still binding reading - its constraints, platform
   *  findings and closed cases did not freeze with the
   *  code they were learned in. THIS FILE is the header of
   *  record now.
   *================================================================*/

  /*==================== THE WEBSITE, AT w20 =======================
   *
   *  WHAT THIS IS. Eyes-free voice chess on Lichess, as a
   *  plain website: open the page, tap "Sign in with
   *  Lichess", approve once, play by speaking moves. Static
   *  files on GitHub Pages; OAuth PKCE runs in the browser;
   *  no server exists anywhere in this project.
   *
   *  WHERE THE CODE COMES FROM. w20 is a REBUILD. The first
   *  site (w1-w19) was ported from userscript v104 and then
   *  fell behind while the userscript ran on to v134. Rather
   *  than merge, w20 cuts the v134 userscript into one file
   *  per job — settings, log, vocabulary, parsing, matching,
   *  dialogue, speech-out, chimes, mic, keepalive, rules,
   *  clock — and wraps this page's own shell around them:
   *  lichess.js (PKCE sign-in and the account event
   *  stream), ui.js (the page), boot.js. The w19 site
   *  survives as reference/ — its PKCE
   *  flow, page furniture and remembered-panels code were
   *  salvaged into the web files, each block keeping its
   *  w-history. Its modes.js was NOT carried: silent mode
   *  was deleted from canon at v109, and clock mode now
   *  ships as its own file, clock.js.
   *
   *  THE HEADER OF RECORD for the shared pipeline is in
   *  us-header.js (the userscript's front door): hard
   *  constraints, platform findings, closed cases, the
   *  v-series history. Everything there binds this build
   *  too. Web-specific reasoning lives in the web files'
   *  own headers. The constraints, restated in one breath:
   *  FAIR PLAY (rules.js only says what is legal and what
   *  it is called - no evaluation, ever); the BOARD API is
   *  the only truth; NO external libraries; NO tokens
   *  visible to the user.
   *
   *  WHO THIS IS FOR. The owner plays without reading
   *  glasses at a real board, standing, iPad across the
   *  room - that is why anything that must be acted on is
   *  SPOKEN. But the page is opened by whoever finds it, on
   *  whatever they own: no code may assume an iPad, Safari,
   *  or a US English voice. Platform findings are handled
   *  as conditions to detect, never as the shape of the
   *  world.
   *
   *  VERSIONS. The website counts w1, w2, ... so no number
   *  ever collides with the userscript's v-series in a log
   *  dump. Bump for any behavioural change, revert freely.
   *  VERSION itself is assigned in lichess.js.
   *
   *  THE HISTORY IS IN HISTORY.md at the repo root - w1 to
   *  w39 and everything after it. It lived here until it
   *  was half this file, which left a reader scrolling
   *  past a changelog to reach the constraints above that
   *  they needed first. Read it before a bump: an entry
   *  says WHY, and several are a mistake and the rule it
   *  earned (w18, w28, w31, w37). Reasoning that belongs
   *  to a piece of code did NOT move - it stays in that
   *  file's own header, next to what it explains.
   *================================================================*/

