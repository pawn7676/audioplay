# audioplay

Voice chess on Lichess for someone playing at a real board,
away from the screen. Sign in with Lichess, tap Microphone,
and speak moves as four NATO items ("echo two echo four");
the opponent's moves are spoken back. Plain static files: no
build, no server of ours.

Settings > Play by picks one of three ways to play:

- Voice: moves spoken, everything said back.
- Hybrid: moves typed on a hardware keyboard ("e2e4" or
  "5254", then Enter), everything said back as in voice
  mode. The mic stays off. On screen, the same as
  Keyboard: the move being typed, the moves played, and
  what was last said, in print.
- Keyboard (keys mode in the code): moves typed, in
  silence, with everything the page would say shown under
  the clocks instead. The mic stays off and nothing is
  spoken or chimed.

The page has two views: Board View, the page with the
chessboard and the controls, and Clock View (entered by
pressing the "Clock" button), just the two clocks on a
black screen.

## The files

The scripts, in the order audioplay.html loads them:

- `settings.js` - settings, constants and storage
- `log.js` - the debug log, kept across reloads
- `stall.js` - notices page freezes
- `vocabulary.js` - the words understood
- `parsing.js` - reads what was said
- `matching.js` - what was heard -> one legal move
- `dialogue.js` - what to do about it, and what to say
- `practice.js` - a local game against random moves
- `voice.js` - the page's voice
- `chimes.js` - the move-confirm chime
- `mic.js` - speech recognition
- `rules.js` - the rules of chess
- `lichess.js` - sign-in, streams, moves, seeks
- `board.js` - draws the board
- `touch.js` - tap-to-move
- `keys.js` - typed moves (hybrid and keys modes), and
  keys mode's shown messages
- `ui.js` - the page's controls
- `clock.js` - Clock View and the spoken time
- `awake.js` - keeps the screen on during a game
- `boot.js` - starts it all

The scripts share one global scope. Order only matters for
code that runs as a file loads: settings.js and log.js
first, boot.js last.

The other files:

- `audioplay.html` - the layout
- `audioplay.css` - the look
- `keys.css` - the look of typing, which shows only in
  hybrid and keys modes
- `pieces.svg` - the twelve piece pictures, drawn by
  board.js
- `icon.png` - the home-screen icon
- `index.html` - the site's front door: it only sends the
  short address on to audioplay.html (without it, GitHub
  Pages shows this README there instead)
- `README.md` - this file, which the page doesn't load
- `LICENSE` - the GNU General Public License, version 3:
  audioplay's license
- `CREDITS.md` - others' work used here (the pieces,
  Lichess's colours and API, and what rules.js matches),
  with their licenses

## How the three modes differ

settings.js has three tests: `keysMode()` (typed and
silent), `hybridMode()` (typed and spoken) and
`typingMode()` (either of those).

When typing, the mic never starts and the Microphone
button is greyed out (ui.js), and keys.js reads the
keyboard. Typed moves go through `acceptMove()` like
spoken ones, so they are confirmed by the Confirm setting.
Yes/no questions are answered with 1 or 0. In voice mode
`answerHint()` (dialogue.js) adds "Say yes to accept, no
to decline." to a spoken question; when typing it adds
nothing.

Everything the page says goes through `speak()` in
voice.js. In keys mode it hands the words to
`showMessage()` in keys.js instead, so Lichess events need
no changes of their own. In hybrid mode it speaks and also
hands the words to `showSpoken()` in keys.js, to print.
Beyond that, keys mode skips the audio primer (voice.js),
the confirm chime (dialogue.js) and waking the audio
(ui.js).

Hybrid mode has no Microphone tap to wake the audio, so
any tap or key press on the page wakes it (`wakeOnInput()`
in ui.js), and the log says whether it worked.

To take the typing modes out: delete keys.js and keys.css,
and the lines that mention them, `keysMode()`,
`hybridMode()` or `typingMode()` in the other files.

## Hosting

Any host that serves static files works, except one that
stops pages from contacting other sites. Free Neocities
sites do exactly that (a Content-Security-Policy that
blocks a script from fetching another site's data), and
only a paid Supporter account lifts it. There, going to
lichess.org and back works, since that is plain
navigation, but every request the page itself makes fails
with "Load failed": the sign-in can't trade its code for
a token, and nothing else could reach Lichess either.
GitHub Pages works, and files can be uploaded on
github.com from the iPad, with no git.

The return address for sign-in is this page's own address
(`redirectUri()` in lichess.js), so moving to a new host
needs no code change. If sign-in fails, the log says
where it stopped: the address used, each try at the
token, and, if no try got an answer, whether lichess.org
can be reached from the page at all (a NET line).

## iPad and Safari, learned the hard way

- The mic only starts after a tap, and the page can only
  make sound after a tap. Whether a key press from a
  hardware keyboard counts too is not yet known; hybrid
  mode logs it (AUD lines).
- On iPadOS 27, speech played while the mic is open, or
  while it is starting, leaves the mic deaf. So the mic is
  switched off while the page speaks and restarted after.
- The first thing spoken after audio starts up is lost, so
  a silent utterance goes first.
- Speech reports "ended" while still playing; wait for real
  quiet before timing pauses.
- `<audio>` elements are silently dropped while the mic is
  open, so the chime uses WebAudio.
- The chime's WebAudio clock can stand still while
  reporting "running": the chime then sounds late, or
  never. In voice mode it starts when the mic opens. In
  hybrid mode the page's own speech often stops it, and
  resume() doesn't restart it; a new AudioContext made
  during a tap or key press (key presses do count) always
  works. So in hybrid mode only, chimes.js watches the
  clock twice a second and rebuilds a stopped one on the
  next tap or key; and after every chime, in any mode, it
  checks the clock again: if it hasn't moved, the chime is
  called off and "okay." is said instead. The typing
  modes also declare the audio session "playback" rather
  than "play-and-record" (mic.js), though that alone
  didn't help.
- Leaving fullscreen breaks the page layout until Safari
  restarts, so nothing goes fullscreen.
- Safari's toolbar shows the page through it, and a fixed
  overlay doesn't reach under it: with the page scrolled
  down, the board showed behind Clock View there. So
  Clock View scrolls to the top while it is up.
- With the screen off the page can be suspended, which
  stops the mic and the connections to Lichess. So
  awake.js keeps the screen on while a game is on, a seek
  or challenge is waiting, or Clock View is up, in both
  views alike. iOS drops the lock whenever the page is
  hidden; it is taken back on the next repaint tick.
- A connection to Lichess can die without an error (a
  Wi-Fi blip, the iPad dozing): the request just hangs.
  Both streams send a blank line every few seconds, so
  lichess.js reopens one that has been silent for 20
  seconds, and checks again as soon as the page is back
  in view.
- Bluetooth headphones switch to a call mode when the mic
  opens, which can clip words and change volume. The iPad's
  own speaker is the tested setup.
- The mic's "sound" and "speech" start events no longer
  fire on iPadOS 27; results still arrive.
- Keys from a hardware keyboard reach the page only while
  no text box has the focus; keys typed into the Custom
  time or name box stay in that box.

## Credits and license

Copyright (C) 2026 pawn7676. audioplay is free software
under the GNU General Public License, version 3 or later
(`LICENSE`). The cburnett pieces, Lichess's colours and
API, and the libraries rules.js is written to match
(chess.js, python-chess) are credited in `CREDITS.md`,
with their licenses. Keep `LICENSE` and `CREDITS.md` with
audioplay's files wherever they're published.

audioplay is not affiliated with or endorsed by Lichess.
