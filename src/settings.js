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
  var TOKEN_KEY = "audioplay_lichess_token";

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
   * The mode tree these express:
   *   all modes: the two guards on the act this file
   *     cannot take back, sending a move. They act in
   *     voice mode and clock mode alike, hence the group.
   *   voice mode (clock off): the opponent's move is ALWAYS
   *     spoken - that is the product - and readBackMine
   *     decides whether your own move is spoken back too.
   *   clock mode: clockShowMoves puts the move row on the
   *     overlay; clockReadBackMine and clockSpeakOpponent
   *     choose what is SPOKEN there, independently of voice
   *     mode, because at the board with the clock up you
   *     may want the screen doing the telling.
   *     clockSpeakMessages and clockShowMessages route
   *     everything ELSE - questions, errors, command
   *     answers - to the voice, the message strip, or
   *     both; never neither, see v129.
   *--------------------------------------------------------*/
  var SETTING_DEFAULTS = {
    // HEADPHONES DELETED (v132). The system-wide echo
    // cancellation was found doing the job on every audio
    // route - see the platform finding and the v132 entry.
    // A stored value under this name is simply ignored.

    // On asks "Confirm:" before EVERY move, not only
    // ambiguous ones. Slower, but nothing is ever sent to
    // Lichess without being read back first. Named
    // confirmAllMoves until v131.
    confirmMyMove: false,

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

    // Your own move read back in full once Lichess accepts
    // it ("knight foxtrot 3."). ON since v70 as the chosen
    // move confirmation, OFF by default since v113 for
    // silent success with the opponent's reply as implicit
    // confirmation; "repeat" always works either way.
    readBackMine: true,

    // The same choice inside clock mode. Separate because
    // the overlay's move row can do the confirming there.
    clockReadBackMine: true,

    // Speak the opponent's move while clock mode is up.
    // Voice mode always speaks it; here the move row can
    // carry it instead, so it is a choice.
    clockSpeakOpponent: true,

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
    showRatings: true,

    // The move row on the clock overlay. The cost is digit
    // size: with the row present the clocks take
    // CLOCK_TIME_SIZE instead of the larger
    // bareDigitSizeCss(). Toggling it tears the overlay
    // down for rebuild on next entry - the overlay is
    // otherwise built once and reused.
    clockShowMoves: true,

    // Everything spoken that is NOT a move, while clock
    // mode is up: the yes/no questions, "say again",
    // command answers, game over. This pair CANNOT BOTH BE
    // OFF - the panel flips the other back on, and
    // loadSettings repairs a stored off/off - because a
    // question with no channel left would hang the game in
    // silence. speak() routes by these (v129).
    clockSpeakMessages: true,

    // The same messages painted on a strip along the foot
    // of the clock overlay. A question stays up until
    // answered; anything else fades after
    // CLOCK_MSG_EXPIRE_MS. The strip is built ALWAYS and
    // this only gates writing to it, so unlike
    // clockShowMoves the toggle needs no overlay rebuild.
    clockShowMessages: true
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
      // confirmAllMoves became confirmMyMove at v131; carry a
      // stored value across once. Deletable once the panel has
      // been saved on the device - still here because there is
      // no way to know from here whether it has been.
      if (typeof saved.confirmAllMoves === "boolean" &&
          typeof saved.confirmMyMove !== "boolean") {
        out.confirmMyMove = saved.confirmAllMoves;
      }
    } catch (e) { /* defaults stand */ }
    // messages must keep one channel (v129): a stored
    // off/off - an old save, a hand-edit - would let a
    // question hang silently. Voice is the channel that
    // works with the eyes closed, so it is the one
    // restored.
    if (!out.clockSpeakMessages && !out.clockShowMessages) {
      out.clockSpeakMessages = true;
    }
    return out;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(CFG)); }
    catch (e) { /* private mode etc; the session still works */ }
  }

  var CFG = loadSettings();

  // GUARD_PAWN_PUSHES and CONFIRM_ALL_MOVES moved to
  // SETTING_DEFAULTS (v128): panel toggles now, read as
  // CFG.guardPawnPushes and CFG.confirmMyMove (named
  // confirmAllMoves until v131) everywhere.

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
  var MOVE_WEIGHT = "300";     // the move row, always
  var OVERLAY_TICK_MS = 100;   // overlay redraw period

  // ---- clock mode, message strip (v129) ----
  // Sized to be read at arm's length across the board, not
  // across the room: a sentence, unlike the clocks, is a
  // glance target. Wraps as it must; the strip sits below
  // the centred halves, so a two-line question overlaps
  // nothing.
  var CLOCK_MSG_SIZE = "min(4.2vw,4.5vh)";
  // How long a message that is NOT a question stays on the
  // strip. Questions ignore this and stay until answered.
  var CLOCK_MSG_EXPIRE_MS = 5000;

  // ---- clock mode, move row ON/OFF selection ----
  // CLOCK_SHOW_MOVES moved to SETTING_DEFAULTS (v124), read
  // as CFG.clockShowMoves. The overlay is BUILT ONCE and
  // reused, so the panel toggle tears it down for rebuild
  // on the next clock entry. CLOCK_MOVE_* and MOVE_CHAR_EM
  // below exist only for the row being ON, the three
  // CLOCK_BARE/DIGIT ones only for OFF.

  // ---- clock digits, move row ON ----
  // Sized for the WORST case: three digits past 100
  // minutes, seven characters of SAN ("bxa8=Q+"). Both rows
  // are nowrap, so nothing can wrap or break mid-token.
  // Raise it until the longest real move stops fitting.
  var CLOCK_TIME_SIZE = "min(28vw,32vh)";

  // ---- clock digits, move row OFF ----
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

  // ---- the move row text ----
  // SIZED PER MOVE. Almost every SAN is 2-4 characters, so
  // sizing all of them for "Qh4xe1#" made the common case
  // needlessly small. Each move gets the max — equal to the
  // clock digits beside it — and shrinks only as far as its
  // own length demands: "h4" is as big as "10".
  //   size = BUDGET / (chars * MOVE_CHAR_EM), capped by
  //   MAX_VW and MAX_VH
  // MOVE_CHAR_EM is the average glyph advance in system-ui
  // plus the .04em letter-spacing these rows carry; raise
  // it if a long move ever touches the edge.
  //
  // The move stacks UNDER the clock in a half only 50vh
  // tall, so its ceiling is vertical, not a matter of
  // taste: time (32vh) + move + margin must fit. The vw
  // budget halved at v97 with the side-by-side layout — the
  // move sits in its own clock's 50vw column, not across
  // the screen.
  var MOVE_CHAR_EM = 0.62;
  var CLOCK_MOVE_MAX_VW = 28;
  var CLOCK_MOVE_MAX_VH = 14;
  var CLOCK_MOVE_BUDGET_VW = 46; // of the 50vw half

