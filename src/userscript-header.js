// ==UserScript==
// @name         Lichess Audioplay
// @version      138
// @description  Eyes-free voice play on Lichess (Board API)
// @match        https://lichess.org/*
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @run-at       document-idle
// ==/UserScript==

/*  THE USERSCRIPT, BACK IN PRINT (v138, owner's request,
 *  19 Aug 2026). v137 froze on 5 Aug 2026 when the website
 *  became the project; the owner then asked for a userscript
 *  that carries the website's CURRENT behaviour, as the
 *  backup that still works if the website's hosting ever
 *  goes away. So this build is not the v137 line continued -
 *  it is the website's own pipeline files, byte-identical,
 *  wrapped in a small userscript shell:
 *
 *    SHARED, verbatim from src/ (the website's files):
 *      settings, log, watchdog, vocabulary, parsing,
 *      matching, dialogue, practice, speech-out, chimes,
 *      mic, rules, clock
 *    USERSCRIPT-ONLY:
 *      this header, userscript-lichess (token via the
 *      Userscripts app's storage, game id from the URL),
 *      userscript-ui (the floating row over lichess.org),
 *      userscript-boot (watch for a game page)
 *
 *  "node build.js manifest-userscript.txt lichess_audioplay.js"
 *  rebuilds it; the committed copy at the repo root is the
 *  installable artifact, and the harness fails if the two
 *  ever disagree. The frozen v137 stays untouched in
 *  frozen-userscript/ as the last of the old line.
 *
 *  WHAT THE SHELL DELIBERATELY LEAVES OUT: the website's
 *  board, clocks-by-the-board, player names, sign-in, seek
 *  and challenge panels. This script runs ON lichess.org,
 *  where all of that is the page underneath - start the
 *  game with Lichess's own buttons, then speak.
 *
 *  SETUP
 *  1. Create a token at
 *     https://lichess.org/account/oauth/token/create
 *     Tick "board:play". The script asks for it the first
 *     time and remembers it, so later versions do not need
 *     it pasted in again. It is kept in the Userscripts
 *     app's own storage, out of reach of anything running
 *     on the page. Tap "token" in the log panel to replace
 *     or clear it.
 *  2. Save this file in the Userscripts app folder and
 *     enable it for lichess.org.
 *  3. Open a game, tap the round button ONCE (iOS needs
 *     one touch to unlock mic and audio), then walk to
 *     your board.
 *
 *  SPEAKING MOVES (the w118 grammar - the piece-name
 *  grammar of v137 and before is GONE)
 *
 *  Speak your move by saying the starting and ending
 *  squares, using the NATO alphabet for the files:
 *    A = alpha    B = bravo    C = charlie  D = delta
 *    E = echo     F = foxtrot  G = golf     H = hotel
 *  Examples:
 *    "echo 2 echo 4"
 *    "bravo 8 charlie 6"
 *    "echo 1 golf 1" (castle short)
 *    "echo 8 charlie 8" (castle long)
 *    "hotel 7 hotel 8" (automatic promotion of pawn to
 *        a queen)
 *    "alpha 2 alpha 1 equals knight" (underpromotion to
 *        a knight)
 *  Do not say any piece names. Do not say "takes" or
 *  "captures". Do not say "check" or "checkmate". Do not
 *  say "castles kingside/short" or "castles
 *  queenside/long". None of these words are accepted.
 *
 *  A legal move heard whole plays at once, and the chime
 *  (or the Confirm setting's choice) says it landed.
 *  Anything damaged, incomplete, or heard two ways is
 *  answered "Say again." - the script never guesses. A
 *  whole move that is simply not legal is answered "That
 *  is not a legal move."
 *
 *  Single letters work as well as NATO words ("E two E
 *  four"), and glued squares work ("e2 e4"). But the
 *  letters b, c, d, e, g are one vowel apart across a
 *  room; the NATO words are the ones that survive the
 *  distance.
 *
 *  IF THE FIRST WORD KEEPS GETTING LOST
 *    iOS needs a moment to notice speech has started, and
 *    can miss the opening syllable. Start with a word that
 *    does not matter and let it absorb the loss:
 *      "move echo two echo four"
 *    "move", "play", "please", "okay", "um" are all ignored.
 *
 *  VERBAL COMMANDS
 *    "repeat"        say the last move again
 *    "resign"        Resign the game? asks yes/no
 *    "draw"          Offer a draw? asks yes/no
 *    "cancel"        drops an open yes/no question
 *    "clock"/"time"  say the time remaining for each player
 *    "flip clock"    flip which side of the screen your
 *                    clock is on (in clock mode)
 *    "memo ..."      transcribe a memo into the log -
 *                    useful for reporting problems
 *
 *  THE BUTTONS (floating, bottom right)
 *    round button    microphone and speech on or off
 *    settings        how moves are spoken (Pieces or
 *                    Squares) and how your move is
 *                    confirmed (Chime at three loudnesses,
 *                    Voice, or None)
 *    clock           full-screen clock mode: a black screen
 *                    showing just the two clocks, the side
 *                    to move in bolder font. Tap anywhere
 *                    to exit.
 *    log             everything heard and done. "copy" puts
 *                    the full text on the clipboard;
 *                    "token" replaces or clears the stored
 *                    token.
 *    practice        understands moves and answers and
 *                    gives a random legal reply, sending
 *                    nothing to Lichess
 *
 *  A BETTER VOICE: the script speaks with the device's
 *  system voice. On an iPhone or iPad: Settings >
 *  Accessibility > Spoken Content > Voices > English -
 *  choose a Premium or Enhanced voice (Ava is a good one).
 *
 *  THE HISTORY. v1-v137 are the old line, whose story is
 *  frozen-userscript/us-header.js; the behaviour carried
 *  here is the website's, whose story is HISTORY.md (w20
 *  onward). The short version of what changed between v137
 *  and this build: the four-item move grammar replaced the
 *  piece-name grammar and its question machinery (w118),
 *  refusals shrank to "Say again." plus the illegal-move
 *  carve-out (w131), your own move confirms with a chime at
 *  a chosen loudness, a spoken read-back, or nothing
 *  (w116/w120/w131/w137), the spoken clock answers "clock"
 *  or "time" on demand (w133), the vocabulary was trimmed
 *  to what the instructions claim (w133/w134), takebacks
 *  that do not shorten the list are caught (w50), a
 *  departed opponent is announced and the win claimable
 *  (w61), a dead token stops the retries and says what to
 *  do (w52/w60), reconnects back off (w52), variant games
 *  are refused out loud (w61), and a main-thread stall
 *  writes itself into the log (w90). The keep-alive and
 *  screen-off play are gone (w90); the mic itself holds the
 *  audio session (w91).
 */
(function () {
  "use strict";
