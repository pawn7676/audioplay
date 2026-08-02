/*  audioplay-web — modes.js
 *  Read the app.js header first: it carries the project
 *  story, the hard constraints, and the file map.
 *
 *  New at w2: the three viewing modes, chosen per game
 *  from the Voice panel. Sections 15 (CLOCK MODE) and 16
 *  (SILENT MODE) are the userscript's, ported verbatim
 *  below — every v73-v101 display decision intact — with
 *  exactly four one-line insertions, marked "w2:", so the
 *  mode selector repaints when an overlay is entered or
 *  left by tap. Their settings from userscript section 1
 *  travel with them, verbatim.
 *
 *  THE MODES ARE THE OVERLAYS. "Voice only" is no overlay
 *  (this page, or a dark room with the screen off);
 *  "clock" and "silent" are the two screens. Voice INPUT
 *  is identical in all three, as it always was. Tapping
 *  an overlay returns to voice only, exactly the
 *  userscript's tap-to-leave. Entering by tap is also
 *  what lets fullscreen work: Safari grants it only from
 *  a real gesture (the closed case in section 15).
 *
 *  PER-MODE READ-BACK (w2). The userscript's single
 *  READ_BACK_MY_MOVE becomes readBackMyMove(), consulted
 *  at the two accept sites in parser.js. Voice only
 *  defaults ON — the ear is all there is. Clock mode
 *  defaults OFF, on the owner's observation that the
 *  turn signal already confirms the move: the moment
 *  Lichess accepts it the turn flips and the OPPONENT'S
 *  clock goes heavy, which the eye gets for free — the
 *  v88 rule (weight describes the turn, on the clocks
 *  alone) paying an unplanned dividend. Silent mode never
 *  reaches the setting: the quadrant IS the read-back.
 *
 *  LOW-TIME CALLOUTS (w2) — A CLOSED CASE, REOPENED BY
 *  THE OWNER. The v92 tombstone declined any unprompted
 *  clock speech as too distracting, and its reasons stay
 *  true and stay written down: an alert that fires while
 *  the user is thinking, and that gates the mic when it
 *  speaks, costs concentration. At w2 the owner reopened
 *  it deliberately for VOICE-ONLY mode, where game11 was
 *  lost on time with no visible clock and no way to know
 *  short of asking. So: OPT-IN, default OFF, voice-only
 *  mode only (any visible clock makes it the refused
 *  distraction again), each threshold spoken ONCE per
 *  game, and never in the middle of a pending question —
 *  the callout waits for the dialogue to clear rather
 *  than talk over it. "clock" on demand remains the whole
 *  answer whenever this is off.
 */

  /*------------- settings for the overlays (verbatim) -------------*/

  // ---- overlays: clock mode (15) and silent mode (16) ----
  // v82 cleanup: ONE color for all overlay text, and the
  // side to move is marked by WEIGHT alone. The only color
  // change left is the under-a-minute red; set
  // LOW_TIME_COLOR equal to TEXT_COLOR to remove that too.
  var TEXT_COLOR = "#a8a29a";
  var LOW_TIME_COLOR = "#b0503e";
  // Weight is the TURN signal, and it belongs to the CLOCKS
  // ALONE (v88). Through v87 the last-move text changed
  // weight with the turn too, which read as "this move just
  // happened" — but it fires on turn change, so the
  // OPPONENT'S move went bold the moment the user played
  // theirs, and looked like a reply that had not arrived.
  // A signal that means one thing must not be attached to
  // something it does not describe. The moves are now a
  // constant weight and change only when the move changes.
  var ACTIVE_WEIGHT = "750";   // clock: side to move
  var IDLE_WEIGHT = "200";     // clock: waiting side
  var MOVE_WEIGHT = "300";     // both moves, always
  var INFO_WEIGHT = "300";     // silent mode lists/prompts
  var OVERLAY_TICK_MS = 100;   // redraw period, both screens

  // ---- overlay text sizes (v83) ----
  // Sized for the WORST case, not the common one: a clock
  // can reach three digits in a long game, and a SAN can
  // reach seven characters ("bxa8=Q+", "Qh4xe1#"). Both
  // rows are white-space:nowrap, so nothing can ever wrap
  // or break mid-token; the sizes below leave the worst
  // case inside its cell. Clock mode's halves are full
  // width, so they take more than silent mode's quadrants.
  // Raise these until the longest real move stops fitting.
  var CLOCK_TIME_SIZE = "min(28vw,32vh)";   // section 15
  var QUAD_TIME_SIZE = "min(26vw,30vh)";    // section 16

  // ---- clock mode without the moves (v93) ----
  // OFF, and the reason is what clock mode is now FOR.
  // Silent mode makes you look at the iPad for everything,
  // because nothing is said; voice mode says everything but
  // leaves the clock invisible until you ask. Clock mode is
  // the middle: the moves are SPOKEN — it never intercepts
  // speech, only silent mode does — so the rows under the
  // digits repeat what the ear already has, and the space
  // they cost buys the one thing worth having, which is a
  // number readable from the board without turning your
  // head. "repeat" still speaks the last move.
  // TRUE restores the v73-v92 layout exactly, and the three
  // CLOCK_MOVE_* constants below exist only for it.
  var CLOCK_SHOW_MOVES = false;

  // ---- the digits when the moves are off ----
  // SIZED FOR THE DIGITS ACTUALLY ON SCREEN (v97), not for
  // a worst case that never arrives. clockDigits shows
  // whole MINUTES above a minute and SECONDS below one, so
  // two digits covers every game up to 99 minutes and every
  // low-time reading. Three appears only past 100 minutes,
  // and then it appears by itself: the count is watched and
  // the size drops once, permanently, the first time a
  // third digit is seen. It never grows back, so the digits
  // cannot resize while a game is being read.
  //   width used = n * CLOCK_DIGIT_EM * font-size
  // against CLOCK_BARE_BUDGET_VW, so for the usual n = 2
  //   40 / (2 * 0.62) = 32.3vw
  // The budget is 40 of the 50vw each clock owns: the two
  // sit SIDE BY SIDE (see section 15), so width is halved
  // and is what binds on nearly every screen.
  //
  // THE OTHER 10vw IS THE GUTTER, and it is the budget's
  // real job (v101). At 46 the digits nearly touched and
  // the two clocks read as ONE four-digit number — "10 10"
  // came out as 1010. The unused width of each half meets
  // in the middle, so the centre gap is exactly 50 minus
  // this number, and the outer margin is half of it: 10vw
  // between, 5vw either side. A divider line was considered
  // and refused, because a rule drawn in a gap too small to
  // begin with only decorates the problem; space is what
  // separates things, and it costs nothing to light.
  // CONFIRMED on screen at 40: the two read as two numbers.
  // Separation is proportional, so this holds at any
  // viewing distance — it does not need retesting from
  // across the room.
  // CLOCK_DIGIT_EM is MOVE_CHAR_EM's figure (0.62); these
  // digits are tabular and carry no letter-spacing, so it
  // is if anything generous.
  //
  // The vh cap is now the WHOLE height, not half of it, and
  // 80 ASSUMES FULLSCREEN, which means entry by the "clock"
  // CHIP. vh is the LAYOUT viewport, so with Safari's
  // toolbar up a box this tall clips top and bottom. That
  // is not a risk in practice: fullscreen is granted only
  // from a real gesture, the chip is one and voice is not,
  // and the voice entry is not used at all — tried once and
  // abandoned, because a clock screen with the toolbar on
  // it is the wrong thing to look at.
  var CLOCK_DIGIT_EM = 0.62;
  var CLOCK_BARE_BUDGET_VW = 40;  // of the 50vw half
  var CLOCK_BARE_MAX_VH = 80;

  // Which side of the screen YOUR clock is on. A real clock
  // stands beside the board with the near face its owner's,
  // so the right setting is whichever side of the board the
  // iPad is sitting on — and that changes between games,
  // which is why "flip clock" flips it live instead of this
  // being a constant you must reload to change. This is the
  // value it STARTS at, every game.
  var PLAYER_ON_LEFT_OF_CLOCK = true;

  // MOVE TEXT IS SIZED PER MOVE (v84). Sizing every move
  // for the worst case ("Qh4xe1#") made the common two
  // character move needlessly small, when almost every SAN
  // is 2-4 characters. So the move gets the MAX size, equal
  // to the clock digits beside it, and shrinks only as far
  // as its own length demands: "h4" is as big as "10", and
  // only a genuinely long move pays for being long.
  //   width used = chars * MOVE_CHAR_EM * font-size
  // so the size that just fills the budget is
  //   BUDGET / (chars * MOVE_CHAR_EM)
  // capped by MAX_VW and MAX_VH. MOVE_CHAR_EM is the
  // average glyph advance in system-ui for SAN characters
  // plus the .04em letter-spacing these rows carry; raise
  // it if a long move ever touches the edge.
  var MOVE_CHAR_EM = 0.62;
  var QUAD_MOVE_MAX_VW = 26;    // = QUAD_TIME_SIZE's vw
  var QUAD_MOVE_MAX_VH = 30;    // = QUAD_TIME_SIZE's vh
  var QUAD_MOVE_BUDGET_VW = 44; // of the 50vw quadrant
  // Clock mode stacks the move UNDER the clock in a half
  // that is only 50vh tall, so its ceiling is vertical, not
  // a matter of taste: time (32vh) + move + margin must fit.
  // These three exist only for CLOCK_SHOW_MOVES = true. The
  // budget halved at v97 with the side-by-side layout: the
  // move sits under its own clock, in that clock's 50vw
  // column, not across the screen.
  var CLOCK_MOVE_MAX_VW = 28;
  var CLOCK_MOVE_MAX_VH = 14;
  var CLOCK_MOVE_BUDGET_VW = 46; // of the 50vw half

  // ---- the lower-right quadrant (v86) ----
  // THE MOVE IS HIDDEN WHENEVER THERE IS ANYTHING TO READ.
  // The user plays without reading glasses, so the only
  // question that matters is whether the thing being read
  // is legible. While a list or a prompt is up, the move
  // above it is DEAD WEIGHT: it is the move already made,
  // the user said it themselves, and the opponent has
  // usually replied since. So it is removed from the
  // screen entirely and the list gets the whole quadrant.
  // v85 only made the move yield; this is the same idea
  // carried to its end, and it roughly doubles the text.
  //
  // The size is then the largest that FITS, found by
  // trying sizes downward and counting how many rows the
  // text wraps to at each — width and height together,
  // since a big enough size makes even a short option wrap.
  // A wrapped or clipped option is one the user cannot
  // read but CAN still select by number, which is the kind
  // of silent mismatch this program refuses everywhere.
  //
  // At 1024x768: two options come out around 107px, where
  // v84 gave 35px and v85 gave 61px.
  var LIST_TEXT_MAX_VH = 14;
  var LIST_TEXT_MIN_VH = 2.5;
  var LIST_TEXT_STEP_VH = 0.25;
  var LIST_LINE_HEIGHT = 1.4;
  var LIST_BUDGET_VW = 46;      // of the 50vw quadrant
  // Fallback geometry when the overlay cannot be measured
  // (hidden, or the node test harness).
  var QUAD_HEIGHT_VH = 50;
  var QUAD_WIDTH_VW = 50;
  var QUAD_GAP_VH = 2.5;

  // How long a passing message holds the quadrant before
  // the move comes back (v87). Applies ONLY to messages
  // with nothing outstanding — a clock or turn answer, an
  // error, a memo receipt. Anything AWAITING AN ANSWER
  // stays until it is answered: an option list, a yes/no
  // question, and the final result of the game. Those are
  // not messages, they are the state of play.
  //
  // Saying "repeat" also brings the move back at once,
  // which needs no new vocabulary: in silent mode the
  // answer to "what was my last move" is the quadrant
  // itself, so the command clears the message instead of
  // speaking. With a list up, "repeat" redraws the list.
  var MESSAGE_HOLD_MS = 4000;
  // Lists cap at 8 because answers reuse NUMS, which stops
  // at 8 since chess ranks do (option 9 would be
  // unanswerable). Overflow is STATED on screen, one line:
  // "+N more - say the move again". Never a silent drop.
  var LIST_MAX = 8;
  /*--------------- w2: mode choice and persistence ----------------*/

  // Persisted so a reload mid-session keeps the choices.
  // The MODE itself is not persisted: overlays need a tap
  // anyway (fullscreen, mic, audio), so every load starts
  // in voice only, which is also the safe default.
  var MODE_SETTINGS_KEY = "audioplay.mode.settings";

  var MODE_SETTINGS = {
    readBackVoice: true,    // voice only: the ear is all
    readBackClock: false,   // clock: the turn flip confirms
    lowTimeOn: false,       // CLOSED CASE REOPENED, opt-in
    lowTimeLevels: "60",    // seconds, comma-separated
    voiceName: "",          // "" = the browser default
    opponent: "maia1"       // the seek/challenge dropdown
  };

  function loadModeSettings() {
    try {
      var raw = localStorage.getItem(MODE_SETTINGS_KEY);
      if (!raw) return;
      var got = JSON.parse(raw);
      for (var k in MODE_SETTINGS) {
        if (k in got) MODE_SETTINGS[k] = got[k];
      }
    } catch (e) {}
  }

  function saveModeSettings() {
    try {
      localStorage.setItem(MODE_SETTINGS_KEY,
                           JSON.stringify(MODE_SETTINGS));
    } catch (e) {}
  }

  // The two accept sites in parser.js ask this instead of
  // the old constant. Silent mode never reaches it.
  function readBackMyMove() {
    if (clockModeOn()) return !!MODE_SETTINGS.readBackClock;
    return !!MODE_SETTINGS.readBackVoice;
  }

  function currentMode() {
    if (silentModeOn()) return "silent";
    if (clockModeOn()) return "clock";
    return "voice";
  }

  // The selector's three states map onto the overlays the
  // userscript already had; enter/exit carry all the
  // fullscreen and wake-lock behaviour with them.
  function setMode(mode) {
    if (mode === currentMode()) return;
    if (mode === "clock") enterClockMode();
    else if (mode === "silent") enterSilentMode();
    else {
      exitClockMode(true);
      exitSilentMode(true);
    }
    uiModeChanged();
  }

  /*--------------- w2: low-time callouts (opt-in) -----------------*/

  // Which thresholds (seconds) have been spoken this game.
  var lowTimeSaid = {};
  var lowTimeGame = null;

  function lowTimeLevels() {
    return String(MODE_SETTINGS.lowTimeLevels || "")
      .split(",")
      .map(function (s) { return parseInt(s.trim(), 10); })
      .filter(function (n) { return n > 0 && n <= 3600; })
      .sort(function (a, b) { return b - a; });
  }

  function spokenTimeLeft(s) {
    if (s % 60 === 0) {
      var m = s / 60;
      return (m === 1 ? "one minute" : m + " minutes") + " remaining.";
    }
    if (s < 60) return s + " seconds remaining.";
    var mm = Math.floor(s / 60), ss = s % 60;
    return (mm === 1 ? "one minute " : mm + " minutes ") +
           ss + " seconds remaining.";
  }

  // Every gate restated in code order: the option is on,
  // voice-only mode (a visible clock makes this the
  // refused distraction), a live connected game, voice
  // running and not practice, and no dialogue mid-flight —
  // a pending question is never talked over; the callout
  // just tries again next tick, unsaid and unmarked.
  function lowTimeTick() {
    if (!MODE_SETTINGS.lowTimeOn) return;
    if (currentMode() !== "voice") return;
    if (!running || dryRun) return;
    if (!api.pos || !api.gameId || api.over || !api.myColor) return;
    if (api.gameId !== lowTimeGame) {
      lowTimeGame = api.gameId;
      lowTimeSaid = {};
    }
    var ms = myRemainingMs();
    if (ms == null) return;
    if (pending || confirmAction || speaking) return;
    var levels = lowTimeLevels();
    for (var i = 0; i < levels.length; i++) {
      var s = levels[i];
      if (ms <= s * 1000 && !lowTimeSaid[s]) {
        lowTimeSaid[s] = true;
        log("CLK", "low-time callout at " + s + "s (" +
            Math.floor(ms / 1000) + "s left)");
        speak(spokenTimeLeft(s));
        return;   // one per tick; deeper levels get theirs
      }
    }
  }

  setInterval(lowTimeTick, 500);
  loadModeSettings();
  // the saved voice is applied once the list exists; iOS
  // reports nothing until speech has been used, so this
  // also re-runs from the first tap (app.js).
  if (MODE_SETTINGS.voiceName) setVoiceName(MODE_SETTINGS.voiceName);

  /*======================== 15. CLOCK MODE ========================*/

  // A full-screen, pure black overlay showing only the two
  // clocks: opponent on top, you on the bottom, the side to
  // move drawn HEAVIER (weight, not brightness, since v81/v82;
  // red still means under a minute). On an OLED panel
  // black pixels are
  // OFF, so in a dark room the display reduces to four
  // faint glyph groups. Everything else — the mic, speech,
  // the game — runs on underneath: this whole section is
  // only a second renderer over state the script already
  // keeps (remainingMs, lastSanW/B, api.pos.turn), and it
  // touches nothing outside itself.
  //
  // Each side's last move sat under its clock from v73 to
  // v92 and is now off by default: the moves are spoken
  // here, so the rows were repeating the ear. See
  // CLOCK_SHOW_MOVES in section 1, which restores them.
  //
  // In: the "clock" chip, and ONLY the chip (v98).
  // Out: tap anywhere on it.
  //
  // A screen wake lock is held while the overlay is up, so
  // the iPad does not sleep into the lock screen mid-game.
  // iOS silently drops the lock whenever the app is
  // backgrounded; the visibilitychange listener retakes it
  // when the page returns. With the screen on, none of the
  // screen-off restrictions (mic restarts, audio loss)
  // apply, so this is also the script's most stable
  // operating state.
  //
  // Section numbering is append-only (see CONTENTS), which
  // is why 15 lives after 14. BOOT: the boot statements
  // above ran at load, and everything here is hoisted
  // functions and state used only on demand.

  var clockOverlay = null, clockTimer = null, clockLock = null;
  var clockHalves = null;

  function clockModeOn() {
    return !!(clockOverlay && clockOverlay.style.display !== "none");
  }

  // One number only (v78): ticking seconds drew the eye,
  // so above a minute just the whole minutes remain — "10",
  // changing once a minute — and under a minute the number
  // becomes the seconds and the half turns
  // LOW_TIME_COLOR (red). The v73-77 form (5:15 with
  // tenths under twenty seconds) is in git history if ever
  // wanted; the spoken "clock" still gives minutes and
  // seconds exactly.
  function clockDigits(ms) {
    if (ms == null) return "--";
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    if (s < 60) return String(s);
    return String(Math.floor(s / 60));
  }

  function buildClockOverlay() {
    clockOverlay = document.createElement("div");
    clockOverlay.style.cssText =
      "position:fixed;inset:0;z-index:100000;background:#000;" +
      "display:flex;flex-direction:row;touch-action:none;" +
      "-webkit-user-select:none;user-select:none;cursor:default;";
    clockHalves = {};
    // the halves are LEFT and RIGHT (v97). Which one is
    // yours is PLAYER_ON_LEFT_OF_CLOCK, read at paint time,
    // so "flip
    // clock" is a repaint and never a rebuild.
    ["left", "right"].forEach(function (k) {
      var half = document.createElement("div");
      half.style.cssText =
        "flex:1;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;";
      // weight is set by paintClockHalf every tick (v81:
      // it is the turn signal), so the value here is only
      // what shows for the instant before the first paint
      var time = document.createElement("div");
      time.style.cssText =
        "font-family:system-ui,sans-serif;font-weight:" +
        IDLE_WEIGHT + ";white-space:nowrap;" +
        "line-height:1;font-size:" +
        (CLOCK_SHOW_MOVES ? CLOCK_TIME_SIZE : bareDigitSizeCss()) +
        ";font-variant-numeric:tabular-nums;";
      half.appendChild(time);
      // with CLOCK_SHOW_MOVES off there is no move row at
      // all: not hidden, never built, so nothing downstream
      // can paint or size it. paintClockHalf tests h.move.
      var move = null;
      if (CLOCK_SHOW_MOVES) {
        move = document.createElement("div");
        move.style.cssText =
          "font-family:system-ui,sans-serif;font-weight:" +
          MOVE_WEIGHT + ";white-space:nowrap;" +
          "font-size:" + moveSizeCss("", CLOCK_MOVE_MAX_VW,
            CLOCK_MOVE_MAX_VH, CLOCK_MOVE_BUDGET_VW) +
          ";margin-top:2.5vh;" +
          "letter-spacing:.04em;";
        half.appendChild(move);
      }
      clockOverlay.appendChild(half);
      clockHalves[k] = { time: time, move: move, col: null, wt: null };
    });
    clockOverlay.addEventListener("click", function () {
      exitClockMode(true);
    });
    document.body.appendChild(clockOverlay);
  }

  // The size the bare digits may have, for the widest
  // reading seen so far this session (v97). Monotonic: the
  // count only ever grows, so a game that ticks 100 -> 99
  // does not resize back up and the number never moves
  // under the eye while it is being read.
  var clockDigitsSeen = 2;

  function bareDigitSizeCss() {
    var vw = CLOCK_BARE_BUDGET_VW / (clockDigitsSeen * CLOCK_DIGIT_EM);
    return "min(" + vw.toFixed(2) + "vw," + CLOCK_BARE_MAX_VH + "vh)";
  }

  // Called with every reading painted. Returns true if the
  // size changed and the halves need restyling.
  function noteClockDigits(text) {
    var n = String(text).length;
    if (n <= clockDigitsSeen) return false;
    clockDigitsSeen = n;
    log("CLK", "digits grew to " + n + ", resizing");
    return true;
  }

  // The size a move of this length can have: as large as
  // the ceiling allows, shrunk only enough that its own
  // characters fit the budget (v84). Returns a CSS value;
  // the vh cap stays inside the min() so a tall-and-narrow
  // window cannot push the text past its row.
  function moveSizeCss(text, maxVw, maxVh, budgetVw) {
    var n = Math.max(1, String(text || "").length);
    var vw = Math.min(maxVw, budgetVw / (n * MOVE_CHAR_EM));
    return "min(" + vw.toFixed(2) + "vw," + maxVh + "vh)";
  }

  function paintClockHalf(h, color) {
    var ms = remainingMs(color);
    var digits = clockDigits(ms);
    var active = api.pos && !api.over && api.pos.turn === color;
    // one color for everything (v82); red is the only
    // exception and means "under a minute". The turn is
    // carried by weight alone, so low-and-waiting reads
    // both facts at once.
    var col = ms != null && ms < 60000 ? LOW_TIME_COLOR : TEXT_COLOR;
    // the clock alone carries the turn (v88); the move
    // below it keeps MOVE_WEIGHT, set once at build time
    var wt = active ? ACTIVE_WEIGHT : IDLE_WEIGHT;
    if (h.time.textContent !== digits) {
      h.time.textContent = digits;
      if (!CLOCK_SHOW_MOVES && noteClockDigits(digits)) {
        var css = bareDigitSizeCss();
        clockHalves.left.time.style.fontSize = css;
        clockHalves.right.time.style.fontSize = css;
      }
    }
    if (h.move) {
      var mv = (color === "w" ? api.lastSanW : api.lastSanB) || "\u2014";
      if (h.move.textContent !== mv) {
        h.move.textContent = mv;
        h.move.style.fontSize = moveSizeCss(mv, CLOCK_MOVE_MAX_VW,
          CLOCK_MOVE_MAX_VH, CLOCK_MOVE_BUDGET_VW);
      }
    }
    if (h.col !== col) {
      h.col = col;
      h.time.style.color = col;
      if (h.move) h.move.style.color = col;
    }
    if (h.wt !== wt) {
      h.wt = wt;
      h.time.style.fontWeight = wt;
    }
  }

  function renderClockMode() {
    if (!clockHalves) return;
    var mine = api.myColor || "w";
    var theirs = mine === "w" ? "b" : "w";
    var myHalf = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
    var oppHalf = PLAYER_ON_LEFT_OF_CLOCK ? "right" : "left";
    paintClockHalf(clockHalves[myHalf], mine);
    paintClockHalf(clockHalves[oppHalf], theirs);
  }

  // "flip clock" swaps the sides. Nothing is rebuilt: the
  // next tick paints the other way round, within
  // OVERLAY_TICK_MS, so fullscreen is never disturbed —
  // which matters, because it cannot be retaken without
  // another tap. CONFIRMED in use.
  function flipClockSides() {
    PLAYER_ON_LEFT_OF_CLOCK = !PLAYER_ON_LEFT_OF_CLOCK;
    var side = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
    log("CLK", "my clock now on the " + side);
    renderClockMode();
    // with the overlay up the swap is its own confirmation;
    // spoken only when there is nothing to see
    if (!clockModeOn()) speak("your clock on the " + side + ".");
  }

  function acquireClockLock() {
    try {
      if (!navigator.wakeLock || !navigator.wakeLock.request) {
        log("CLK", "wake lock unsupported");
        return;
      }
      navigator.wakeLock.request("screen").then(function (lock) {
        clockLock = lock;
        log("CLK", "wake lock held");
      }).catch(function (e) {
        log("CLK", "wake lock refused: " + e.message);
      });
    } catch (e) { log("CLK", "wake lock error: " + e.message); }
  }

  function releaseClockLock() {
    try { if (clockLock) clockLock.release(); } catch (e) {}
    clockLock = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (clockModeOn() && document.visibilityState === "visible") {
      acquireClockLock();
    }
  });

  /*----- w3: FULLSCREEN RETIRED — THE TOMBSTONE'S OWN OUT -----
   * enterClockFullscreen, leaveClockFullscreen,
   * enterSilentFullscreen and leaveSilentFullscreen are
   * DELETED, not disabled, at w3.
   *
   * The v75/v76/v79 closed case recorded that Safari's
   * layout viewport stays corrupted after any element
   * fullscreen EXIT until the app is force-quit, that
   * three in-page repairs were built and all removed, and
   * that "the one-line out, if it ever becomes
   * intolerable, is to stop calling
   * enterClockFullscreen()/enterSilentFullscreen()". The
   * owner reported glitchy transitions on the website at
   * w3 and asked for exactly that. So this is the
   * sanctioned exit being taken, not a new idea.
   *
   * WHAT IS LOST: Safari's toolbar stays on screen, so
   * the black area is the visible viewport rather than
   * the whole panel. That is the accepted cost, and the
   * owner judged it fine — the clocks are sized in vh, so
   * they fill whatever height they are given.
   *
   * WHAT IS GAINED, beyond smooth transitions: the
   * corruption cannot happen at all, since it is
   * triggered by the EXIT that no longer occurs. The
   * chip-row displacement in the section 12 closed case
   * had the same root and also goes away.
   *
   * DO NOT REINSTATE without a fundamentally different
   * theory, and read v75-v79 first if tempted.
   *--------------------------------------------------------*/

  function enterClockMode() {
    // v80: the two full-screen overlays never stack; the
    // one being entered wins (mirrored in enterSilentMode)
    exitSilentMode(true);
    if (!clockOverlay) buildClockOverlay();
    clockOverlay.style.display = "flex";
    renderClockMode();
    clearInterval(clockTimer);
    clockTimer = setInterval(renderClockMode, OVERLAY_TICK_MS);
    acquireClockLock();
    // w3: NO FULLSCREEN. See the note above exitClockMode.
    log("CLK", "clock mode on");
    // no spoken announcement: the clocks are the signal
    uiModeChanged();   // w2: repaint the mode selector
  }

  function exitClockMode(byTap) {
    if (!clockModeOn()) return;
    clockOverlay.style.display = "none";
    clearInterval(clockTimer);
    clockTimer = null;
    releaseClockLock();
    log("CLK", "clock mode off" + (byTap ? " (tap)" : ""));
    if (!byTap) speak("clock mode off.");
    uiModeChanged();   // w2: repaint the mode selector
  }

  function toggleClockMode() {
    if (clockModeOn()) exitClockMode(false);
    else enterClockMode();
  }

  /*======================= 16. SILENT MODE ========================*/

  // The four-quadrant screen (v80): everything the script
  // has to say, shown instead of spoken.
  //
  //   upper left   opponent's clock
  //   lower left   your clock
  //   upper right  opponent's last move (SAN)
  //   lower right  your last move, and beneath it the info
  //                area: numbered option lists, prompts,
  //                errors, offers, results — every routed
  //                speak() lands here as text
  //
  // Speech is fully OFF while this is up: speak() itself
  // routes here (the one funnel), and the three call sites
  // whose content a quadrant already shows — my-move
  // read-back, opponent-move announcements — skip speak()
  // instead of duplicating themselves in the info area.
  // Voice INPUT is completely unchanged; the mic loop,
  // parsing, matching and the guards all run exactly as in
  // voice play. The one dialogue difference: ambiguity is
  // answered as a numbered list in one utterance instead of
  // a walked yes/no chain (handleListAnswer, section 6).
  //
  // In: the "silent" chip, and ONLY the chip (v99).
  // Out: tap anywhere on it.
  //
  // Same architecture as section 15: a pure renderer over
  // state the script already keeps, plus the info area,
  // which is written only by silentSetInfo. Clock digits,
  // colors and the wake-lock/fullscreen behavior are clock
  // mode's, quadrant-sized. The two overlays never stack
  // (each enter exits the other). The FULLSCREEN-EXIT
  // CORRUPTION closed case applies here exactly as it does
  // to clock mode: chip entry goes fullscreen, voice entry
  // cannot, and the one-line out if it ever bites is to
  // stop calling enterSilentFullscreen() below.

  var silentOverlay = null, silentTimer = null, silentLock = null;
  var silentCells = null, silentInfoLines = [];

  function silentModeOn() {
    return !!(silentOverlay && silentOverlay.style.display !== "none");
  }

  // What the ROUTED text looks like. Spoken sentences spell
  // squares phonetically ("foxtrot 3", and "gawlf" is a
  // respelling for the voice, not a word) — on screen the
  // plain letters read better and take a third of the
  // space, so NATO words are folded back down before
  // display. Word-level, so nothing else in a sentence is
  // touched.
  var DISPLAY_WORD = { alpha: "a", bravo: "b", charlie: "c",
    delta: "d", echo: "e", foxtrot: "f", golf: "g", gawlf: "g",
    hotel: "h" };

  function displayify(text) {
    return String(text).replace(/[A-Za-z]+/g, function (w) {
      var d = DISPLAY_WORD[w.toLowerCase()];
      return d === undefined ? w : d;
    });
  }

  function buildSilentOverlay() {
    silentOverlay = document.createElement("div");
    silentOverlay.style.cssText =
      "position:fixed;inset:0;z-index:100000;background:#000;" +
      "display:grid;grid-template-columns:1fr 1fr;" +
      "grid-template-rows:1fr 1fr;touch-action:none;" +
      "-webkit-user-select:none;user-select:none;cursor:default;";
    function cell() {
      var c = document.createElement("div");
      c.style.cssText =
        "display:flex;flex-direction:column;align-items:center;" +
        "justify-content:center;overflow:hidden;";
      silentOverlay.appendChild(c);
      return c;
    }
    // grid fills row by row: TL, TR, BL, BR
    var tl = cell(), tr = cell(), bl = cell(), br = cell();
    // as in section 15, the weight here is only the value
    // before the first paint: renderSilentMode owns it
    function timeDiv(parent) {
      var d = document.createElement("div");
      d.style.cssText =
        "font-family:system-ui,sans-serif;font-weight:" +
        IDLE_WEIGHT + ";white-space:nowrap;" +
        "line-height:1;font-size:" + QUAD_TIME_SIZE + ";" +
        "font-variant-numeric:tabular-nums;";
      parent.appendChild(d);
      return d;
    }
    function moveDiv(parent) {
      var d = document.createElement("div");
      d.style.cssText =
        "font-family:system-ui,sans-serif;font-weight:" +
        MOVE_WEIGHT + ";white-space:nowrap;" +
        "font-size:" + moveSizeCss("", QUAD_MOVE_MAX_VW,
          QUAD_MOVE_MAX_VH, QUAD_MOVE_BUDGET_VW) +
        ";letter-spacing:.04em;";
      parent.appendChild(d);
      return d;
    }
    var info = document.createElement("div");
    info.style.cssText =
      "font-family:system-ui,sans-serif;font-weight:" +
      INFO_WEIGHT + ";" +
      "font-size:" + LIST_TEXT_MAX_VH + "vh;line-height:" +
      LIST_LINE_HEIGHT + ";" +
      "letter-spacing:.02em;padding:0 2vw;" +
      "text-align:center;white-space:pre-wrap;" +
      "font-variant-numeric:tabular-nums;" +
      "color:" + TEXT_COLOR + ";";
    silentCells = {
      oppTime: { el: timeDiv(tl), col: null, wt: null },
      myTime: { el: timeDiv(bl), col: null, wt: null },
      oppMove: { el: moveDiv(tr), col: null, wt: null },
      myMove: { el: moveDiv(br), col: null, wt: null },
      info: info
    };
    br.appendChild(info);
    silentOverlay.addEventListener("click", function () {
      exitSilentMode(true);
    });
    document.body.appendChild(silentOverlay);
  }

  // isMove: the SAN rows are sized per move (v84); the
  // clock rows are a fixed size and never call this.
  function paintSilentCell(c, text, col, wt, isMove) {
    if (c.el.textContent !== text) {
      c.el.textContent = text;
      if (isMove) {
        c.el.style.fontSize = moveSizeCss(text, QUAD_MOVE_MAX_VW,
          QUAD_MOVE_MAX_VH, QUAD_MOVE_BUDGET_VW);
        // the lower-right quadrant is shared with the
        // info area, so its layout is decided in one
        // place whenever the move changes
        if (c === silentCells.myMove) layoutMyQuadrant();
      }
    }
    if (c.col !== col) { c.col = col; c.el.style.color = col; }
    if (c.wt !== wt) { c.wt = wt; c.el.style.fontWeight = wt; }
  }

  function renderSilentMode() {
    if (!silentCells) return;
    var mine = api.myColor || "w";
    var opp = mine === "w" ? "b" : "w";
    function isActive(color) {
      return !!(api.pos && !api.over && api.pos.turn === color);
    }
    // one color (v82); red means only "under a minute",
    // and the turn is weight alone
    function colFor(color, ms) {
      if (ms !== undefined && ms != null && ms < 60000) {
        return LOW_TIME_COLOR;
      }
      return TEXT_COLOR;
    }
    function wtFor(color) {
      return isActive(color) ? ACTIVE_WEIGHT
                             : IDLE_WEIGHT;
    }
    var oms = remainingMs(opp), mms = remainingMs(mine);
    paintSilentCell(silentCells.oppTime, clockDigits(oms),
      colFor(opp, oms), wtFor(opp));
    paintSilentCell(silentCells.myTime, clockDigits(mms),
      colFor(mine, mms), wtFor(mine));
    // MOVE_WEIGHT, not wtFor: the move must not restyle
    // itself when the turn changes (v88)
    paintSilentCell(silentCells.oppMove,
      (opp === "w" ? api.lastSanW : api.lastSanB) || "\u2014",
      colFor(opp), MOVE_WEIGHT, true);
    paintSilentCell(silentCells.myMove,
      (mine === "w" ? api.lastSanW : api.lastSanB) || "\u2014",
      colFor(mine), MOVE_WEIGHT, true);
  }

  // The ONLY writer of the info area. Takes an array of
  // lines; empty array clears it. Callers pass display
  // text, so routed speech goes through displayify first.
  var silentHoldTimer = null;

  function silentSetInfo(lines) {
    silentInfoLines = lines || [];
    clearTimeout(silentHoldTimer);
    silentHoldTimer = null;
    if (!silentCells) return;
    silentCells.info.textContent = silentInfoLines.join("\n");
    layoutMyQuadrant();
    // A passing message gives the quadrant back on its own;
    // anything awaiting an answer does not. See
    // MESSAGE_HOLD_MS in section 1 for which is which.
    if (silentInfoLines.length && !silentInfoSticky()) {
      silentHoldTimer = setTimeout(function () {
        silentHoldTimer = null;
        if (!silentInfoSticky()) silentSetInfo([]);
      }, MESSAGE_HOLD_MS);
    }
  }

  // "The dialogue that was on screen is finished" — the
  // only clear that is allowed to lose a race (v91).
  // Through v90 accepting a move called silentSetInfo([])
  // outright, from the postMove callback, which resolves
  // AFTER the gameState event for that same move. On a
  // mating move the order in every log is: move applied,
  // game over, "checkmate. white wins." shown, then the
  // 200 comes back and wiped it. The message is sticky
  // precisely so it cannot expire, so nothing incidental
  // may clear it either. Anything the user must still act
  // on stays up; only a finished exchange is cleared.
  // CONFIRMED IN GAME12, under the same race that broke it:
  // the 200 still landed after the game-over line, and the
  // line held two and a half minutes, through a background
  // and return, until the tap that closed the overlay.
  function silentClearFinishedDialogue() {
    if (silentInfoSticky()) return;
    silentSetInfo([]);
  }

  // Is something outstanding that the user must still act
  // on? A list of options, a yes/no question, or the game
  // being over. These hold the screen indefinitely.
  function silentInfoSticky() {
    return !!(pending || confirmAction || (api && api.over));
  }

  // Lay out the lower-right quadrant. Two states, and the
  // whole of section 1's budget comment applies:
  //
  //   nothing to read  the move alone, at its full size
  //   anything to read the move is HIDDEN and the text
  //                    gets the entire quadrant, at the
  //                    largest size that fits it
  //
  // Sizing is a downward search rather than a formula
  // because wrapping is not linear: past a certain size a
  // seven-character option needs two rows, which costs
  // more height than the larger text gained. So try sizes
  // from the ceiling down and take the first that fits in
  // BOTH directions. About fifty iterations of arithmetic,
  // run only when the text changes, never on the clock
  // tick.
  function layoutMyQuadrant() {
    if (!silentCells) return;
    var moveEl = silentCells.myMove.el;
    var lines = silentInfoLines;

    if (!lines.length) {
      moveEl.style.display = "";
      moveEl.style.fontSize =
        moveSizeCss(moveEl.textContent || "", QUAD_MOVE_MAX_VW,
                    QUAD_MOVE_MAX_VH, QUAD_MOVE_BUDGET_VW);
      return;
    }

    // the move is not just made small, it is taken away
    moveEl.style.display = "none";

    var vw = QUAD_WIDTH_VW, vh = QUAD_HEIGHT_VH;
    var pxPerVw = 1024 / 100, pxPerVh = 768 / 100;
    try {
      if (window.innerWidth && window.innerHeight) {
        pxPerVw = window.innerWidth / 100;
        pxPerVh = window.innerHeight / 100;
      }
    } catch (e) {}
    var budgetPx = LIST_BUDGET_VW * pxPerVw;
    var availPx = (vh - QUAD_GAP_VH) * pxPerVh;

    var size = LIST_TEXT_MIN_VH;
    for (var t = LIST_TEXT_MAX_VH; t >= LIST_TEXT_MIN_VH;
         t -= LIST_TEXT_STEP_VH) {
      var fontPx = t * pxPerVh;
      var perChar = fontPx * MOVE_CHAR_EM;
      var perLine = Math.max(1, Math.floor(budgetPx / perChar));
      var rows = 0;
      for (var i = 0; i < lines.length; i++) {
        rows += Math.max(1, Math.ceil(lines[i].length / perLine));
      }
      if (rows * LIST_LINE_HEIGHT * fontPx <= availPx) { size = t; break; }
    }
    silentCells.info.style.fontSize = size.toFixed(2) + "vh";
  }

  function silentShowText(text) {
    silentSetInfo([displayify(text)]);
  }

  function silentListLines() {
    if (!pending) return [];
    var lines = pending.cands.map(function (c, i) {
      return (i + 1) + "   " + c.san;
    });
    // never a silent drop: a trimmed list says so (v82)
    if (pending.overflow) {
      lines.push("+" + pending.overflow +
                 " more \u2014 say the move again");
    }
    return lines;
  }

  // Puts the current pending candidates on screen as the
  // numbered list, trimmed to LIST_MAX (see section 1 for
  // why 8). The trim cuts pending.cands itself, so screen
  // numbers and answered indexes can never drift apart,
  // and the count of hidden entries is kept on pending so
  // every re-render of the list states the overflow.
  // Measured across 400 random games: at most 7 legal
  // moves target one square, so the bare guard can never
  // overflow; only multi-square readings can, rarely.
  function presentPendingList() {
    if (!pending) return;
    if (pending.cands.length > LIST_MAX) {
      pending.overflow = pending.cands.length - LIST_MAX;
      log("LST", "list trimmed to " + LIST_MAX + " of " +
          (pending.cands.length) + " (overflow shown)");
      pending.cands = pending.cands.slice(0, LIST_MAX);
    }
    pending.idx = 0;
    silentSetInfo(silentListLines());
    log("LST", "showing: " + pending.cands.map(function (c, i) {
      return (i + 1) + ")" + c.san;
    }).join(" "));
  }

  function acquireSilentLock() {
    try {
      if (!navigator.wakeLock || !navigator.wakeLock.request) {
        log("SIL", "wake lock unsupported");
        return;
      }
      navigator.wakeLock.request("screen").then(function (lock) {
        silentLock = lock;
        log("SIL", "wake lock held");
      }).catch(function (e) {
        log("SIL", "wake lock refused: " + e.message);
      });
    } catch (e) { log("SIL", "wake lock error: " + e.message); }
  }

  function releaseSilentLock() {
    try { if (silentLock) silentLock.release(); } catch (e) {}
    silentLock = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (silentModeOn() && document.visibilityState === "visible") {
      acquireSilentLock();
    }
  });

  // (silent-mode fullscreen retired at w3 — see the
  // tombstone above enterClockMode)

  function enterSilentMode() {
    // the two overlays never stack (mirrored in
    // enterClockMode); tap-style exit, so nothing speaks
    exitClockMode(true);
    if (!silentOverlay) buildSilentOverlay();
    silentOverlay.style.display = "grid";
    // a question that was mid-flight when the screen came
    // up is re-presented as its list, so it is not lost
    silentSetInfo(pending ? silentListLines() : []);
    renderSilentMode();
    clearInterval(silentTimer);
    silentTimer = setInterval(renderSilentMode, OVERLAY_TICK_MS);
    acquireSilentLock();
    // w3: NO FULLSCREEN. See the note above exitClockMode.
    log("SIL", "silent mode on");
    // no announcement of any kind: that is the whole point
    uiModeChanged();   // w2: repaint the mode selector
  }

  function exitSilentMode(byTap) {
    if (!silentModeOn()) return;
    silentOverlay.style.display = "none";
    clearInterval(silentTimer);
    silentTimer = null;
    releaseSilentLock();
    log("SIL", "silent mode off" + (byTap ? " (tap)" : ""));
    // spoken, not shown: the overlay is already down, so
    // speech is live again and the confirmation is audible
    if (!byTap) speak("silent mode off.");
    uiModeChanged();   // w2: repaint the mode selector
  }

  function toggleSilentMode() {
    if (silentModeOn()) exitSilentMode(false);
    else enterSilentMode();
  }
