  /*=========================== SETTINGS ===========================*/

  // DECLARED HERE, ASSIGNED IN lichess.js. It said "v137" for
  // as long as this file was shared with the userscript, and
  // was only ever right at runtime because lichess.js loads
  // later in the manifest and overwrites it - so reordering
  // the manifest would have shipped logs claiming a version
  // this project stopped using in August (w54). The w-series
  // is the only version line now; the value lives in one
  // place, next to the comment explaining the series.
  var VERSION = "";

  // LEAVE TOKEN EMPTY. PKCE sign-in gets a token and
  // localStorage on this origin keeps it, so nobody types one
  // and nothing needs pasting in again.
  //
  // Anything put here is used instead, which is handy for
  // testing but means the token lives in the file.
  //
  // (Through w53 this said "tap 'token' in the log panel to
  // replace or clear it" - the userscript's way in, and a
  // button this page deliberately does not have. Sign out is
  // how you clear it here.)
  var TOKEN = "";
  // "audioplay_lichess_token", underscores and all, until
  // w111: the userscript's key name, carried into the w20
  // port by the cut-and-wrap and never earning its keep -
  // the userscript ran on lichess.org, a different origin,
  // so the name never shared storage with anything. The
  // w111 storage audit renamed every key to one flat
  // current scheme (see scrubDeadStorage below), WITHOUT
  // migrations - a shim that reads a dead name is the
  // clutter the audit exists to remove. The one-time cost
  // was a single re-sign-in.
  var TOKEN_KEY = "audioplay.token";

  // Maximum number of lines in the log
  var LOG_MAX = 3000;

  /*--------------- PERSISTED SETTINGS (v124) ----------------
   * Everything below in SETTING_DEFAULTS is a TOGGLE ON THE
   * SCREEN: the "settings" button in ui.js opens a panel
   * of switches, changes persist in localStorage, and these
   * values are only the FIRST-RUN defaults. Flipping a value
   * here does nothing once the panel has saved - clear the
   * "audioplay.settings" localStorage key to return to
   * defaults. Every read in the code goes through CFG.x,
   * never these names, so the panel is always live.
   *
   * There is no mode tree any more (w110). v124 grew one -
   * per-mode read-back, per-mode opponent speech, a message
   * strip with channel routing - on the theory that with
   * the clock up the SCREEN could do the telling. The owner
   * played with it for a year and found the opposite:
   * reading the overlay pulled his eyes off the physical
   * board, which is the one thing this program exists to
   * spare. So every switch below acts in voice mode and
   * clock mode alike, the voice is the one channel for
   * everything, and the clock overlay shows numbers and
   * nothing else (see clock.js).
   *--------------------------------------------------------*/
  var SETTING_DEFAULTS = {
    // HEADPHONES DELETED (v132). The system-wide echo
    // cancellation was found doing the job on every audio
    // route - see the platform finding and the v132 entry.
    // A stored value under this name is simply ignored.

    // confirmMyMove DELETED AT w110 (named confirmAllMoves
    // until v131): ask before EVERY move, not only
    // ambiguous ones. The owner never once turned it on,
    // and its label was squatting on the name the
    // read-back switch below actually deserved. A stored
    // value under this name is ignored - and MUST stay
    // ignored: reusing the key for the renamed read-back
    // would load some old panel save's false into a
    // setting that means something else entirely, which is
    // why that key is confirmMine and not this.

    // A bare square is interpreted as a pawn push, which is
    // correct unless Safari has dropped the piece name
    // from the reading: "rook echo four" arriving as plain
    // "echo four" would push the e-pawn. However, if a piece
    // could also legally reach the same square, then the pawn
    // push is confirmed first: "did you mean echo four? yes
    // or no". Answering "no" then walks through the piece
    // moves to that square. A pawn push to a square that no
    // piece could move to still plays instantly, so most
    // pawn moves cost nothing extra. Saying "pawn echo four"
    // skips the question, since the piece was named - and
    // since v120 "push echo four" does the same, because
    // Safari mishears "pawn" constantly and "push" almost
    // never. Naming a promotion ("golf one equals knight")
    // also skips it: only a pawn can promote, so the pawn
    // was named too. In game3 the guard still asked about
    // Bg1 after "g1 equals knight" had ruled every bishop
    // move out; fixed in v65.
    //
    // Since v71 the same guard covers bare pawn CAPTURES:
    // "takes f3" with neither a piece nor the from-file
    // named, when a piece could also capture f3, is confirmed
    // first ("queen takes f3" heard as "takes f3" cost
    // game6). "golf takes f3" names the file and plays at
    // once, exactly as "pawn e4" does for pushes.
    // Off plays every bare pawn move at once, unasked.
    guardPawnPushes: true,

    // chimeConfirmed LIVED HERE FOR ONE VERSION (w108) and
    // was removed at w109, on the owner's order: the
    // confirmed-move chime is behaviour, not a choice, and
    // a switch nobody asked for was clutter in the panel.
    // The chime itself stays - see chimes.js - and a stored
    // value under this name is simply ignored, as with
    // every deleted setting.

    // Your own move read back in full once Lichess accepts
    // it ("knight foxtrot 3."), questioned or not. ON since
    // v70; "repeat" always works either way. The key was
    // readBackMine until w110, when the label became
    // "confirm my move" - and the key followed the label
    // (v131's rule) as far as it safely could: the obvious
    // key is barred, see the confirmMyMove tombstone above.
    // One switch for BOTH modes since w110:
    // clockReadBackMine existed so the overlay's move row
    // could do the confirming, and the row is gone. (w108
    // put a chime here for yes-answered questions; w112
    // removed it - a chime cannot say WHICH move, see
    // chimes.js.)
    confirmMine: true,

    // clockSpeakOpponent DELETED AT w110 with the rest of
    // the clock-mode group: the opponent's move is always
    // spoken, in every mode - it is the one event the user
    // cannot know any other way with their eyes on the
    // physical board. The choice existed for the move row,
    // and the row is gone.

    // SHOWPLAYERS WAS DELETED AT w75, and the reasoning it
    // was added on (w68) is the reasoning that killed it:
    // "anything permanent on screen has to earn the room". A
    // name earns it every time. The owner played with the
    // switch for a week and found no occasion to turn it off -
    // Lichess hides names behind Zen mode because it hides the
    // whole interface, which is not a thing this page has. A
    // stored value under this name is simply ignored, as the
    // deleted headphones setting above is.
    //
    // The rating is a real choice and survives as one, now
    // INDEPENDENT of anything else. It took four versions to
    // find that shape: w69 split it off nested, w71 made it
    // free and let a bare number float beside a clock, w72
    // chained it back to showPlayers, and w75 removes the
    // thing it was chained to. Names always; the number beside
    // them optional.
    //
    // NOT A FAIR-PLAY QUESTION, and worth saying where the
    // next reader will look: constraint 1 is about MOVE
    // CHOICE. A rating is a fact about a person, not about the
    // position, and no rating ever suggested a move. The move
    // list is the thing that would start to look like analysis
    // surface, and it is deliberately still absent.
    showRatings: true

    // THE CLOCK-MODE TEXT IS GONE, AND ITS SWITCHES WITH IT
    // (w110, owner's decision, 9 Aug 2026). clockShowMoves
    // (the move row), clockSpeakMessages and
    // clockShowMessages (the v129 message strip and its
    // never-both-off channel invariant) were all built on
    // the idea that the overlay could carry text the voice
    // then need not say. In real games the owner found
    // himself looking at the screen to read it - away from
    // the physical board, the exact motion this program
    // exists to remove - so the overlay is numbers and
    // nothing else now, the voice speaks everything, and
    // the panel lost five rows in one day. Stored values
    // under all five dead names are ignored. If text on
    // the overlay is ever wanted again, start from the
    // w110 HISTORY entry: the strip's machinery (question
    // stickiness, sentence-casing, channel repair) is all
    // in git at w109.
  };

  var SETTINGS_KEY = "audioplay.settings";

  function loadSettings() {
    var out = {};
    Object.keys(SETTING_DEFAULTS).forEach(function (k) {
      out[k] = SETTING_DEFAULTS[k];
    });
    // ONE READ, ONE PARSE (w54). This read the key and parsed
    // it, then read and parsed the SAME key again a few lines
    // down for the v131 rename - two trips for one string,
    // with two catch blocks disagreeing about what to say when
    // it failed.
    try {
      var saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      Object.keys(SETTING_DEFAULTS).forEach(function (k) {
        if (typeof saved[k] === "boolean") out[k] = saved[k];
      });
      // NO MIGRATIONS LIVE HERE ANY MORE (w111). The w110
      // readBackMine->confirmMine carry was deletable "once
      // the panel has been saved on the device", and the
      // owner's 9 Aug practice log showed exactly that -
      // "SET confirmMine = true" - so it is gone, one
      // version after it shipped. Unknown keys in a stored
      // blob are simply ignored (the w75 rule, asserted in
      // the harness); a rename that must keep its stored
      // value writes a carry HERE and dies the next time
      // a pasted log proves the save happened.
    } catch (e) { /* defaults stand */ }
    // (the v129 keep-one-message-channel repair stood here
    // until w110; it guarded a pair of switches that no
    // longer exists - the voice is the one channel now)
    return out;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(CFG)); }
    catch (e) { /* private mode etc; the session still works */ }
  }

  var CFG = loadSettings();

  /* THE STORAGE AUDIT (w111, owner's request): every key
   * this program keeps is named audioplay.<what it is> -
   * token, verifier, settings, panels, opponent, rated,
   * timecontrol - and storage holds NOTHING else of ours.
   * This list is every name a previous era wrote on this
   * origin, removed on boot so no dead key sits behind the
   * program to puzzle over in twenty versions:
   *
   *   audioplay_lichess_token   the userscript's token key,
   *                             carried into the w20 port -
   *                             its stranded token is a live
   *                             credential and deleting it
   *                             is the point (rule 4)
   *   audioplay.lichess.token   the w19 site's token key,
   *                             possibly still holding a
   *                             token from before the
   *                             rebuild
   *   audioplay.lichess.verifier  the PKCE verifier's old
   *                             name; transient anyway
   *   audioplay.web.*           the seek prefs, when "web"
   *                             distinguished this site
   *                             from a userscript that is
   *                             frozen now
   *
   * A name leaves this list only if it is reused - never
   * because the scrub "must have run by now": storage is
   * per browser, and a device away from the site for a year
   * still deserves the clean-up. */
  function scrubDeadStorage() {
    var dead = ["audioplay_lichess_token",
                "audioplay.lichess.token",
                "audioplay.lichess.verifier",
                "audioplay.web.opponent",
                "audioplay.web.rated",
                "audioplay.web.timecontrol"];
    var gone = [];
    try {
      dead.forEach(function (k) {
        if (localStorage.getItem(k) !== null) {
          localStorage.removeItem(k);
          gone.push(k);
        }
      });
    } catch (e) { /* private mode; nothing to scrub anyway */ }
    if (gone.length) log("SET", "storage: removed dead keys " + gone.join(" "));
  }

  // GUARD_PAWN_PUSHES and CONFIRM_ALL_MOVES moved to
  // SETTING_DEFAULTS (v128): panel toggles from then on.
  // The second one was renamed at v131 and deleted whole
  // at w110 - see its tombstone in SETTING_DEFAULTS.

  // LEAVE VOICE_NAME = "" TO USE SYSTEM DEFAULT.
  // To pick system default voice on iOS or iPadOS device:
  // Settings > General > Accessibility > Read & Speak >
  //   Voices > English > Voice
  // Ava (Premium) is my preferred voice on current iPadOS.
  // Other English voices that can be explicitly chosen here:
  // Samantha, Daniel, Karen, Moira, Rishi, Tessa
  var VOICE_NAME = "";
  var SPEAK_RATE = 1.0;
  var SPEAK_PITCH = 1.0;

  // Silence inserted between spoken chunks. Raise these if it
  // still runs together, lower them if it feels slow.
  var GAP_SENTENCE_MS = 450;   // after . ; :
  var GAP_CLAUSE_MS = 220;     // after ,

  // Logs the real duration of every spoken chunk to the log
  // panel. Set false once the pacing sounds right.
  var SPEAK_DEBUG = false;

  // The practice button. False builds the UI without it, and
  // the mode becomes unreachable — the #voicetest hash that
  // was its second door is gone (v112), so the button is the
  // only one. dryRun then stays false for the whole session
  // and every branch that tests it is simply never taken.
  // The code stays: it is how the grammar gets exercised
  // without spending a real game, which is what it was
  // written for.
  var PRACTICE_MODE = true;

  // KEEP THIS ON IF YOU PLAY WITH THE SCREEN OFF. iOS will
  // not let a stopped recogniser start again while the
  // screen is off: the first time speech pauses the mic it
  // comes back "not-allowed" and stays dead for the rest of
  // the game. Leaving the mic running avoids the restart
  // entirely, so screen-off play works.
  //
  // ON by default, and the reason the dictation tones are
  // gone. Switching the mic off before speaking and back on
  // afterwards makes iOS play its own tone each time: those
  // were the chimes at the start and end of every sentence.
  //
  // Leaving the mic running avoids both. The mic hears
  // nothing of our own announcements either way: iPadOS
  // echo cancellation removes them (the v132 finding), so
  // the open mic transcribes only the room.
  //
  // One cost: a long session has no restart to recover
  // from if Safari stops delivering results. Watch "MIC
  // listening (cycle N)": if it stops climbing and moves
  // stop registering, tap the button off and on. Set false
  // to go back to switching the mic.
  //
  // That line SAYS NOTHING EXTRA while this is on, and adds
  // " switching" when it is off, so the suffix marks the
  // unusual mode. It marked the opposite before v127, where
  // " continuous" was gated on the deleted MIC_CONTINUOUS
  // and so never printed in a normal session: logs from
  // v126 and earlier read the other way round.
  var MIC_ALWAYS_ON = true;

  // MIC_IGNORE_TAIL_MS and the whole speaking gate deleted
  // at v132 with the headphones setting: AEC keeps our own
  // voice out of the mic, so there is nothing to gate.

  // ---- overlay: clock mode ----
  // ONE color for all overlay text (v82); the only color
  // change left is the under-a-minute red.
  var TEXT_COLOR = "#a8a29a"; // grey
  var LOW_TIME_COLOR = "#b0503e"; // red

  // CLOCK NUMBER FONT WEIGHT IS THE SIGNAL FOR WHOSE TURN
  var ACTIVE_WEIGHT = "750";   // clock: side to move
  var IDLE_WEIGHT = "200";     // clock: waiting side
  var OVERLAY_TICK_MS = 100;   // overlay redraw period

  // (The message strip's CLOCK_MSG_* pair, the move row's
  // CLOCK_TIME_SIZE / CLOCK_MOVE_* / MOVE_CHAR_EM, and
  // MOVE_WEIGHT above all left with the clock-mode text at
  // w110 - see the tombstone in SETTING_DEFAULTS. The
  // digits below are all the overlay draws now.)

  // ---- clock digits ----
  // Sized for the digits ACTUALLY ON SCREEN: whole
  // minutes above a minute, seconds below, so two digits
  // covers every game to 99 minutes and every low-time
  // reading. A third appears only past 100 minutes, and
  // then the size drops ONCE, permanently — it never grows
  // back, so the digits cannot resize mid-game.
  //   width = n * CLOCK_DIGIT_EM * font-size, against
  //   CLOCK_BARE_BUDGET_VW; at n = 2, 40/(2*.62) = 32.3vw
  //
  // THE UNUSED WIDTH IS THE GUTTER, and that is the
  // budget's real job. The two clocks sit side by
  // side in 50vw each, so the centre gap is 50 minus this
  // number and the outer margin is half of it: at 40, 10vw
  // between and 5vw either side. At 46 the digits nearly
  // touched and "10 10" read as 1010. A divider line was
  // refused — space is what separates things, and it costs
  // nothing to light. CONFIRMED on screen at 40; separation
  // is proportional, so it holds at any viewing distance.
  //
  // The vh cap is the WHOLE height. THERE IS NO FULLSCREEN,
  // so Safari's toolbar is up while vh — the layout
  // viewport — excludes it, and the old 80 would clip top
  // and bottom. 62 is a starting figure, not a measured
  // one: lower it if the digits clip, raise it if there is
  // dead space above and below. Width usually binds first.
  var CLOCK_DIGIT_EM = 0.62;      // tabular, no letter-spacing
  var CLOCK_BARE_BUDGET_VW = 40;  // of the 50vw half
  var CLOCK_BARE_MAX_VH = 62;

  // Which side YOUR clock STARTS on, every game. A real
  // clock stands beside the board with the near face its
  // owner's, so the right value is whichever side the iPad
  // is sitting on — and that changes between games, which
  // is why "flip clock" flips it live instead of this being
  // a constant you must reload to change.
  var PLAYER_ON_LEFT_OF_CLOCK = true;

