// ==UserScript==
// @name         Lichess Audioplay v141
// @version      141
// @description  Eyes-free voice play on Lichess (Board API)
// @match        https://lichess.org/*
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @run-at       document-idle
// ==/UserScript==

/* ======================= INSTRUCTIONS ======================= */

/*  CREATE TOKEN
 *  Go to: https://lichess.org/account/oauth/token/create
 *  Tick "board:play". The script asks for it the first
 *  time and remembers it, so later versions do not need
 *  it pasted in again. It is kept in the Userscripts
 *  app's own storage, out of reach of anything running
 *  on the page. Tap "token" in the log panel to replace
 *  or clear it.
 *
 *  SPEAKING MOVES
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
 *  Do not say any piece names.
 *  Do not say "takes" or "captures".
 *  Do not say "check" or "checkmate".
 *  Do not say "castles kingside/short" or "castles
 *  queenside/long".
 *  None of these words are accepted.
 *
 *  A legal move heard whole plays at once, and the chime
 *  (or the Confirm setting's choice) says it landed.
 *  Anything damaged, incomplete, or heard two ways is
 *  answered "Say again." - the script never guesses. A
 *  whole move that is simply not legal is answered "That
 *  is not a legal move."
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
 *    "resign"        Resign the game? Confirm with a yes/no
 *    "draw"          Offer a draw? Confirm with a yes/no
 *    "cancel"        drops an open yes/no question
 *    "time"          say the time remaining for each player
 *    "flip"          flip which side your clock is on
 *                    (in full-screen clock mode)
 *    "memo"          transcribe a memo into the log
 * 
 *  THE BUTTONS
 *    voice           microphone and speech OFF (■) or ON (●)
 *    settings        how moves are spoken (Pieces or
 *                    Squares) and how your move is
 *                    confirmed (Chime, Voice, or None).
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
 *                    nothing to Lichess.
 *
 *  A BETTER VOICE: the script speaks with the device's
 *  system voice. On an iPhone or iPad: Settings >
 *  Accessibility > Spoken Content > Voices > English -
 *  choose a Premium or Enhanced voice (Ava is a good one).
 */

(function () {
  "use strict";

  /* =================== DEFAULT SETTINGS ==================== */

  var VERSION = "v141";

  // LEAVE TOKEN EMPTY: the stored token is used. Anything put
  // here is used instead, which is handy for testing but means
  // the token lives in the file.
  var TOKEN = "";

  // Maximum number of lines in the log
  var LOG_MAX = 3000;

  // HOW A MOVE IS ANNOUNCED:
  //   pieces   "bishop charlie 4" - the piece and where it
  //            landed
  //   squares  "foxtrot 1, charlie 4" - the move's starting
  //            and ending squares: exactly the four-item
  //            shape the grammar asks the USER to speak,
  //            so the page and the player use one language.
  var MOVE_SPEECH = "pieces";
  var MOVE_SPEECH_KEY = "audioplay.movespeech";

  // HOW AN ACCEPTED MOVE IS CONFIRMED:
  //   chime-quiet, chime, chime-loud
  //           two rising notes (chimes.js) at one of three
  //           loudnesses - one axis folded into the other
  //           rather than a volume control of its own,
  //           because the only chime question is "what
  //           plays, and how loud" and one select asks all
  //           of it. "chime" is the middle loudness and the
  //           default. All three fall back to a spoken
  //           "okay." when no chime can even be scheduled.
  //   voice   the move read back whole (moveToSpeech), for
  //           ears the chime has gone missing on - it is
  //           speech, so it is never silently lost
  //   none    nothing on success. Errors still speak.
  var CONFIRM_MODE = "chime";
  var CONFIRM_MODE_KEY = "audioplay.confirm";

  function isConfirmMode(v) {
    return v === "chime" || v === "chime-quiet" ||
           v === "chime-loud" || v === "voice" || v === "none";
  }

  // Loaded on boot, before the page builds, so the selects
  // and the first announcement both agree with storage. Junk
  // or a missing key reads as the default: storage must
  // never quietly change behaviour.
  function loadStoredSettings() {
    // the defaults are RESTATED, not assumed: this function's
    // contract is stored-or-default whatever the variables
    // held before it ran, so calling it IS a settings reload
    MOVE_SPEECH = "pieces";
    CONFIRM_MODE = "chime";
    try {
      var s = localStorage.getItem(MOVE_SPEECH_KEY);
      if (s === "pieces" || s === "squares") {
        MOVE_SPEECH = s;
      }
      var c = localStorage.getItem(CONFIRM_MODE_KEY);
      if (isConfirmMode(c)) {
        CONFIRM_MODE = c;
      }
    } catch (e) { /* private mode; the defaults stand */ }
  }

  /* THE STORAGE AUDIT: every key this program keeps is
   * named audioplay.<what it is>, and storage holds NOTHING
   * else of ours. This list is every name a previous era
   * wrote on this origin, removed on boot so no dead key
   * sits behind the program to puzzle over. The old
   * localStorage token names matter most: a stranded token
   * is a live credential and deleting it is the point.*/
  function scrubDeadStorage() {
    var dead = ["audioplay_lichess_token",
                "audioplay.lichess.token",
                "audioplay.lichess.verifier",
                "audioplay.web.opponent",
                "audioplay.web.rated",
                "audioplay.web.timecontrol",
                "audioplay.settings"];
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

  // LEAVE VOICE_NAME = "" TO USE SYSTEM DEFAULT.
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
  // the mode becomes unreachable - the button is its only
  // door. dryRun then stays false for the whole session and
  // every branch that tests it is simply never taken. The
  // code stays: it is how the grammar gets exercised without
  // spending a real game.
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
  // echo cancellation removes them, so the open mic
  // transcribes only the room.
  //
  // One cost: a long session has no restart to recover
  // from if Safari stops delivering results. Watch "MIC
  // listening (cycle N)": if it stops climbing and moves
  // stop registering, tap the button off and on. Set false
  // to go back to switching the mic.
  //
  // That line SAYS NOTHING EXTRA while this is on, and adds
  // " switching" when it is off, so the suffix marks the
  // unusual mode.
  var MIC_ALWAYS_ON = true;

  // ---- overlay: clock mode ----
  // ONE color for all overlay text; the only color change
  // left is the under-a-minute red.
  var TEXT_COLOR = "#a8a29a"; // grey
  var LOW_TIME_COLOR = "#b0503e"; // red

  // CLOCK NUMBER FONT WEIGHT IS THE SIGNAL FOR WHOSE TURN
  var ACTIVE_WEIGHT = "750";   // clock: side to move
  var IDLE_WEIGHT = "200";     // clock: waiting side
  var OVERLAY_TICK_MS = 100;   // overlay redraw period

  // The digits below are all the overlay draws.

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
  // nothing to light. Confirmed on screen at 40; separation
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
  // is why "flip" flips it live instead of this being
  // a constant you must reload to change.
  var PLAYER_ON_LEFT_OF_CLOCK = true;

  /* ========================= DEBUG LOG ========================== */

  /* THE TAGS:
   *   API  a Lichess REST call
   *   AUD  the audio session and route
   *   CHM  the confirm chime
   *   CLK  clock mode
   *   CND  candidate legal moves matched
   *   DLG  dialogue-level refusals
   *   DRY  practice mode
   *   ERR  page errors
   *   EVT  an event a stream delivered
   *   HRD  what the recognizer heard
   *   LAG  main-thread stalls
   *   MIC  recognizer lifecycle
   *   MOV  a move applied to the board
   *   NET  streams opening and closing
   *   PRS  the items parsed out of it
   *   PST  a move PoSTed + the answer
   *   SAY  what the voice spoke
   *   SET  settings loaded or changed
   *   TCH  tap moves on the board
   *   TTS  the synthesizer's own state
   *   UI   page chrome: buttons, panels
   *
   * A PST line is the POST of your move to Lichess and,
   * on its second line, the HTTP status that came back:
   * "d2d4 -> 200 {"ok":true}" is Lichess saying yes.
   * The EVT gameState that lands beside it is the
   * same move returning on the game stream; both are logged
   * because they race (see acceptMove), and which one wins
   * differs move to move even within one game. */
  var LOG = [];
  var logBody = null;

  /* THE PANEL IS REPAINTED ONLY WHEN IT CAN BE SEEN. The log
   * is chatty during a game (every heard utterance, every
   * parse, every move, every net event), so repainting a
   * hidden panel builds a few hundred kilobytes of string per
   * move on a device that is also running speech recognition
   * and a synthesiser. The panel's own toggle repaints on
   * open, so a hidden panel loses nothing by being skipped;
   * logPanelVisible is what the toggle sets. */
  var logPanelVisible = false;

  function paintLog() {
    if (!logBody || !logPanelVisible) return;
    logBody.textContent = LOG.join("\n");
    logBody.scrollTop = logBody.scrollHeight;
  }

  function log(tag, msg) {
    var t = new Date().toTimeString().slice(0, 8);
    var line = t + "  " + tag + "  " + msg;
    LOG.push(line);
    if (LOG.length > LOG_MAX) LOG.shift();
    paintLog();
    try { console.log("[voice] " + line); } catch (e) {}
  }

  window.addEventListener("error", function (e) {
    log("ERR", (e.message || "?") + " @" + (e.lineno || "?"));
  });

  /*========================= STALL WATCH ==========================
   *
   *  A heartbeat that notices the main thread freezing.
   *
   *  "It felt laggy around then" cannot pick between the mic,
   *  the synthesizer, and the OS; a log line saying the main
   *  thread stalled, HOW LONG, and WHEN, sits right next to
   *  the SAY/MIC/AUD lines that name what was running.
   *  Measure first; the next theory has to fit the numbers.
   *
   *  A setInterval beat expects itself every STALL_TICK_MS;
   *  arriving later than STALL_LOG_MS beyond that is a stall
   *  worth a line. The interval is being throttled rather
   *  than blocked whenever the page is HIDDEN - iOS slows
   *  background timers on purpose - so a beat that wakes
   *  hidden, or wakes from hidden, only resets its clock:
   *  screen-off play must not fill the log with stalls that
   *  are really naps.
   */

  var STALL_TICK_MS = 250;
  var STALL_LOG_MS = 600;
  var stallLast = 0, stallWasHidden = false;

  function startStallWatch() {
    stallLast = Date.now();
    setInterval(function () {
      var now = Date.now();
      var hidden = document.visibilityState === "hidden";
      var late = now - stallLast - STALL_TICK_MS;
      if (!hidden && !stallWasHidden && late > STALL_LOG_MS) {
        log("LAG", "main thread stalled ~" +
            (late / 1000).toFixed(1) + "s");
      }
      stallLast = now;
      stallWasHidden = hidden;
    }, STALL_TICK_MS);
  }
  /*========================== VOCABULARY ==========================*/

  /* The lists below are written ONE ENTRY PER VALUE: every
   * spelling iOS has been heard to return for the a-file, for
   * the rank 4, for the knight, on one line together. expand()
   * flips that into the flat word -> value map the parser looks
   * words up in.*/
  function expand(groups) {
    var out = {};
    Object.keys(groups).forEach(function (val) {
      groups[val].split(/\s+/).forEach(function (w) {
        if (!w) return;
        if (out[w] && out[w] !== val) {
          throw new Error("vocab: \"" + w + "\" is both " +
                          out[w] + " and " + val);
        }
        out[w] = val;
      });
    });
    return out;
  }

  /* The command lists are sets, not maps: only membership is
   * ever asked. Same shape of win, without the repeated ": 1". */
  function wordSet(str) {
    var out = {};
    str.split(/\s+/).forEach(function (w) { if (w) out[w] = 1; });
    return out;
  }

  var NATO = expand({
    a: "alpha alfa alpher ay eh apple elsa alsa ilsa alka alba " +
       "elba alva ulta olfa alfalfa adam",
    b: "bravo brava bravos bravado be bee beta",
    c: "charlie charley charly charlee shirley sharlie sea see " +
       "chan chang ching chong chung chin chino chinese " +
       "charlotte shortly channel chili chilly",
    d: "delta deltas dealt delt de dee",
    e: "echo ecko eco eggo echoes aiko",
    f: "foxtrot foxtrots foxtrott foxdrop fox ef eff " +
       "astra ostra otra austra oxtra",
    g: "golf golfs gulf gold goal gee call",
    h: "hotel hotels hotell motel aitch age"
  });

  var NUMS = expand({
    1: "one won wan juan wun",
    2: "two too tu tue tew tube",
    3: "three tree free thee",
    4: "four for fore ford forth fourth foure forde",
    5: "five hive fife fiv",
    6: "six sex sicks seeks sics",
    7: "seven heaven sevin sevan",
    8: "eight ate hate ait eighth"
  });

  var PIECES = expand({
    q: "queen queens quean quinn clean",
    r: "rook rooks rock rocks brook rooke",
    b: "bishop bishops bishup bish fish fisher",
    n: "knight knights night nights nite"
  });

  // A WHOLE SQUARE CAN FUSE INTO ONE WORD, and these are the
  // recoveries. 
  var COMPOUND = {
    abbreviate: [["file", "b"], ["rank", "8"]],
    aquaphor: [["file", "e"], ["rank", "4"]],
    chariot: [["file", "c"], ["rank", "8"]],
    chariots: [["file", "c"], ["rank", "8"]],
    equate: [["file", "e"], ["rank", "8"]],
    gofer: [["file", "g"], ["rank", "4"]],
    golfer: [["file", "g"], ["rank", "4"]],
    golfers: [["file", "g"], ["rank", "4"]],
    gopher: [["file", "g"], ["rank", "4"]],
    gophers: [["file", "g"], ["rank", "4"]]
  };

  /* AND NOW ACROSS THE TABLES, NOT JUST WITHIN THEM.
   *
   * expand() throws when one word is given two values inside a
   * single map - that is what the grouped shape above is for -
   * and nothing checked the same word appearing in two
   * DIFFERENT maps, where it is just as wrong and quieter.
   * readItems tries the tables in a fixed order; a word in two
   * of them is decided by that order, silently, and the
   * loser's meaning simply never happens. These tables only
   * ever grow, one real log at a time, and a homophone
   * landing in two of them is exactly the kind of thing that
   * gets added twice by two different sessions reading two
   * different game logs.
   *
   * Checked at load, throwing like expand() does, because a
   * grammar that is wrong should refuse to start rather than
   * quietly mean something else. FILLER is deliberately NOT in
   * the set: it is consumed last on purpose, so a word in both
   * FILLER and a value map reads as the value, which is how
   * "a" works.
   */
  (function crossCheckVocabulary() {
    // COMPOUND is in the check for a structural reason, not
    // about any one entry: it is consumed
    // BEFORE the others in readItems, so a word in both wins
    // here and the other meaning silently never happens - the
    // loudest version of exactly the bug this guard exists
    // for.
    var maps = { NATO: NATO, NUMS: NUMS, PIECES: PIECES,
                 COMPOUND: COMPOUND };
    var owner = {};
    Object.keys(maps).forEach(function (name) {
      Object.keys(maps[name]).forEach(function (w) {
        if (owner[w] && owner[w] !== name) {
          throw new Error("vocab: \"" + w + "\" is in both " +
                          owner[w] + " and " + name);
        }
        owner[w] = name;
      });
    });
  })();
  // Framed sentences are not accepted: the way to ask for
  // the time is the bare word "time", and a sentence around
  // it is stray talk like any other.
  // "i" is filler because "I resign" is natural speech, and
  // a filler word that guards a game-ending command earns
  // its line.
  // "a" and "an" are filler because Safari returns "resign"
  // as "A resign", which classifyCommand would count as a
  // content word and refuse. Every command classifier
  // requires no other content, so a stray article breaks all
  // of them. readItems is untouched: its own "a" branch runs
  // BEFORE the filler check, so the a-file still reads as
  // the a-file when a rank follows it.
  // "of" is filler because Safari inserts it ("Patient OF
  // Charlie four"), and an unaccounted word next to a bare
  // square raises a question - a stray "of" would raise one
  // on its own. It carries no meaning in any sentence this
  // grammar accepts, so it is filler like "the" and "on".
  var FILLER = wordSet("please move moves play plays the piece um " +
    "uh a an then and go goes on my is it to into onto i of");

  var YES_WORDS = wordSet("yes yeah yep yup correct right confirm " +
    "confirmed affirmative ok okay sure aye");
  var NO_WORDS = wordSet("no nope wrong negative next nah");
  var CANCEL_WORDS = wordSet("cancel nevermind forget stop abort");
  var REPEAT_WORDS = wordSet("repeat");
  // "time" asks for the remaining time. One word, no synonym
  // family - "timer" and "clock" are not accepted.
  var TIME_WORDS = wordSet("time");
  // "flip" swaps which side of the screen your clock is on.
  // The plural is a spelling the mic plausibly returns for
  // the word spoken.
  var FLIP_WORDS = wordSet("flip flips");
  var RESIGN_WORDS = wordSet("resign resigns");
  var DRAW_WORDS = wordSet("draw");
  var MEMO_WORDS = wordSet("memo memos");

  /*=========================== PARSING ============================*/

  /*===================== THE SPOKEN GRAMMAR =======================
   *
   *  A MOVE IS FOUR ITEMS:
   *  from-file, from-rank, to-file, to-rank
   *
   *    "echo two echo four"        e2e4
   *    "golf one foxtrot three"    Ng1-f3, no piece name needed
   *    "echo four delta five"      the capture exd5 - captures
   *                                are not special, the board
   *                                knows what stands on d5
   *    "echo one golf one"         castles kingside: castling
   *                                is the KING's move, spoken
   *                                as the king's two squares
   *    "echo seven echo eight"     promotion to a queen unless...
   *    "... equals knight"         ...a piece is named after
   *                                an equals word
   *
   *  THE VOCABULARY IS SIXTEEN WORDS - alpha through hotel,
   *  one through eight - plus their logged homophones.
   *
   *  AND THE FORMAT IS ITS OWN GUARD. Four items name one
   *  move with no legal-move disambiguation, so nothing is
   *  ever inferred; the from-square must hold the mover's own
   *  piece and the whole move must be legal, so most
   *  mishearings produce an illegal move and are refused
   *  rather than played. A legal four-item move plays AT ONCE
   *  and the chime confirms it - no read-back, no yes. The
   *  user said all four items; the chime says they landed.
   *
   *  ANYTHING LESS IS "Say again." The ONLY thing that is
   *  accepted is four items heard whole. If several rival
   *  readings parse to DIFFERENT legal moves, that is a
   *  mishearing by definition, and it gets "Say again." too.
   *
   *  ONE EXCEPTION: a WHOLE move, heard clean, that is not
   *  legal gets: "That is not a legal move.".
   *  The line and its reasons live at namesIllegalMove.
   *
   *  IF THE FIRST WORD KEEPS GETTING LOST, start with one
   *  that does not matter and let it absorb the loss:
   *  "move", "play", "please", "okay", "um" are ignored.
   *
   *  COMMANDS: "repeat", "time", "flip", "cancel",
   *  "memo", "resign", "draw" - the last two
   *  still ask their yes/no, because they end a game and are
   *  not moves.
   *
   *  STRAY TALK. The mic is open all game, so everything said
   *  in the room reaches it. An utterance with no complete
   *  square in it is ignored silently and only logged; one
   *  with a square in it was probably aimed at us, and gets
   *  its "Say again." - or, spoken out of turn, the true
   *  answer ("black to move.", "The game is over.").
   *================================================================*/

  // Apostrophes are deleted, not turned into spaces, so
  // "who's" becomes "whos" and matches the filler words.
  function wordsOf(raw) {
    return String(raw).toLowerCase().replace(/['’]/g, "")
      .replace(/[.,!?;:]/g, " ")
      .split(/\s+/).filter(Boolean);
  }

  /* THE CLASSIFIERS: they read an utterance and decide
   * what KIND of thing it is. */
  function memoTranscript(transcripts) {
    for (var i = 0; i < transcripts.length; i++) {
      var toks = wordsOf(transcripts[i]);
      if (toks.length > 1 && MEMO_WORDS[toks[0]]) return transcripts[i];
    }
    return null;
  }

  function classifyCommand(raw) {
    var toks = wordsOf(raw);
    var yes = 0, no = 0, cancel = 0, repeat = 0,
        resign = 0, draw = 0, time = 0, flip = 0, other = 0;
    toks.forEach(function (t) {
      if (YES_WORDS[t]) yes++;
      else if (NO_WORDS[t]) no++;
      else if (CANCEL_WORDS[t]) cancel++;
      else if (REPEAT_WORDS[t]) repeat++;
      else if (RESIGN_WORDS[t]) resign++;
      else if (DRAW_WORDS[t]) draw++;
      // "time", alone, asks for the remaining times.
      else if (TIME_WORDS[t]) time++;
      // "flip", alone, swaps the clock sides.
      else if (FLIP_WORDS[t]) flip++;
      else if (!FILLER[t]) other++;
    });
    if (cancel && !other) return "cancel";
    if (resign && !other) return "resign";
    if (draw && !other) return "draw";
    if (yes && !no && !other) return "yes";
    if (no && !yes && !other) return "no";
    if (repeat && !other) return "repeat";
    if (time && !flip && !other) return "time";
    if (flip && !time && !other) return "flip";
    return null;
  }

  /* A WORD THAT IS NOT PART OF A MOVE BUT IS NOT UNKNOWN
   * EITHER. The command tables hold every word the
   * program recognises without it being a file or a rank;
   * the move parser has no use for them, but their presence
   * must not damn a reading the way a genuinely unknown word
   * does - "yeah, echo two echo four" is not a damaged
   * hearing. */
  function knownNonMoveWord(tk) {
    return !!(YES_WORDS[tk] || NO_WORDS[tk] || CANCEL_WORDS[tk] ||
              REPEAT_WORDS[tk] || TIME_WORDS[tk] ||
              FLIP_WORDS[tk] || RESIGN_WORDS[tk] || DRAW_WORDS[tk] ||
              MEMO_WORDS[tk]);
  }

  /* ONE READING, REDUCED TO ITS ITEMS. Returns
   *   { items: [{t:"file"|"rank", v}...],
   *     promo:  "q"|"r"|"b"|"n"|null,
   *     unknown: first unaccounted content word or null }
   * The caller decides what the shape means; this only
   * translates words. An unknown content word marks the
   * reading DAMAGED - something was said that the grammar
   * cannot account for, and the commonest such something
   * is a word the mic mangled. A
   * damaged reading never plays; whether it earns a "Say
   * again." depends on whether any reading held a square.
   */
  function readItems(raw) {
    var toks = wordsOf(raw);
    var items = [], promo = null, unknown = null;
    var afterPromoKw = false;
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (tk === "promote" || tk === "promotes" || tk === "promotion" ||
          tk === "equals" || tk === "equal") {
        afterPromoKw = true;
        continue;
      }
      if (afterPromoKw && PIECES[tk]) {
        promo = PIECES[tk];
        afterPromoKw = false;
        continue;
      }
      // "to" is filler EXCEPT directly after a file, where it
      // is the rank 2: Safari writes "two" as "to", and the
      // four-item grammar says a rank follows every file, so
      // "echo to echo four" MUST read as e2e4.
      if (tk === "to") {
        if (items.length && items[items.length - 1].t === "file") {
          items.push({ t: "rank", v: "2" });
        }
        continue;
      }
      // SAFARI WRITES "delta" AS "down to": "down to"
      // DIRECTLY BEFORE A RANK is the d-file, the "to"
      // consumed as part of the word.
      if (tk === "down" && toks[i + 1] === "to") {
        var nxr = toks[i + 2];
        if (nxr && (NUMS[nxr] || /^[1-8]$/.test(nxr))) {
          items.push({ t: "file", v: "d" });
          i++;
          continue;
        }
      }
      if (COMPOUND[tk]) {
        COMPOUND[tk].forEach(function (pair) {
          items.push({ t: pair[0], v: pair[1] });
        });
        continue;
      }
      /* Bare "a" is usually the article. It counts as the
       * a-FILE only when a rank follows it, which in this
       * grammar is the only place a file can stand:
       *   "a four e four"   -> a4e4 (well, half of one)
       *   "a knight..."     -> the article, ignored
       */
      if (tk === "a") {
        var nx = toks[i + 1];
        if (nx && (NUMS[nx] || /^[1-8]$/.test(nx))) {
          items.push({ t: "file", v: "a" });
        }
        continue;
      }
      if (NATO[tk]) { items.push({ t: "file", v: NATO[tk] }); continue; }
      if (NUMS[tk]) { items.push({ t: "rank", v: NUMS[tk] }); continue; }
      // a glued whole move ("e2e4") or a glued square ("b4")
      var m2 = /^([a-h][1-8])([a-h][1-8])$/.exec(tk);
      if (m2) {
        items.push({ t: "file", v: m2[1][0] }, { t: "rank", v: m2[1][1] },
                   { t: "file", v: m2[2][0] }, { t: "rank", v: m2[2][1] });
        continue;
      }
      var m1 = /^([a-h])([1-8])$/.exec(tk);
      if (m1) {
        items.push({ t: "file", v: m1[1] }, { t: "rank", v: m1[2] });
        continue;
      }
      if (/^[a-h]$/.test(tk)) { items.push({ t: "file", v: tk }); continue; }
      if (/^[1-8]$/.test(tk)) { items.push({ t: "rank", v: tk }); continue; }
      if (FILLER[tk]) continue;
      if (knownNonMoveWord(tk)) continue;
      // Not in any table: an unknown word. It is REMEMBERED,
      // not skipped - the four-item test refuses a move with
      // an unknown beside it, and the log line naming it is
      // how the homophone tables grow.
      if (!unknown) unknown = tk;
    }
    return { items: items, promo: promo, unknown: unknown };
  }

  /* THE FOUR-ITEM TEST. A reading plays only if it reduces to
   * EXACTLY file rank file rank, in that order, with no
   * unknown word beside them. Returns "e2e4"-style UCI (the
   * promotion letter appended by the caller once legality is
   * known), or null. No shorter or longer shape is ever
   * completed or trimmed: the rule is that the system never
   * guesses, so a hearing that is not the whole move is not
   * a move.
   */
  function parseMove(raw) {
    var r = readItems(raw);
    if (r.unknown) return null;
    if (r.items.length !== 4) return null;
    var t = r.items.map(function (s) { return s.t; }).join(" ");
    if (t !== "file rank file rank") return null;
    return { uci: r.items[0].v + r.items[1].v +
                  r.items[2].v + r.items[3].v,
             promo: r.promo };
  }

  /* MOVE-SHAPED is what separates "Say again." from silence:
   * a complete square (a file with its rank beside it) in any
   * reading means the utterance was probably aimed at us. A
   * lone file or lone rank is not enough - "see you at four"
   * carries a four. */
  function hasSquare(raw) {
    var items = readItems(raw).items;
    for (var i = 0; i + 1 < items.length; i++) {
      if (items[i].t === "file" && items[i + 1].t === "rank") return true;
    }
    return false;
  }

  function colorWord(c) { return c === "w" ? "white" : "black"; }

  // The PRS log line: what the reading reduced to, so a
  // pasted log shows why it played or was refused.
  function describeItems(raw) {
    var r = readItems(raw);
    return r.items.map(function (s) { return s.v; }).join(" ") +
           (r.promo ? " =" + r.promo : "") +
           (r.unknown ? "   (\"" + r.unknown + "\" not understood)" : "");
  }
  /*=========================== MATCHING ===========================*/

  /* WHAT THIS FILE IS: the one step between "some readings
   * arrived" and "exactly one legal move, or nothing". The
   * four-item grammar says the whole move or
   * says nothing, so all that is left to do here is: read
   * every rival transcript, keep the readings that reduce to
   * a clean four-item move, check them against the legal
   * moves, and insist the survivors AGREE.
   *
   * RIVAL READINGS may rescue a move - Safari's first guess
   * writes "echo four" as "go for" while its third gets it
   * right, and the third is as much the user's utterance as
   * the first. Rivals are safe because nothing is inferred:
   * a rival that yields a complete legal four-item move heard
   * the same mouth say the same squares. But if two readings
   * yield two DIFFERENT legal moves, the mic is guessing, and
   * the answer is the caller's "Say again." - never a pick
   * between them.
   */

  function dedupeTranscripts(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (t) {
      if (!String(t).trim()) return;
      // the dedupe key follows the parser's rules, so two
      // spellings of the same items count as one reading
      var r = readItems(t);
      var key = r.items.map(function (s) { return s.t + s.v; }).join("|") +
                "|" + (r.promo || "") + "|" + (r.unknown ? "?" : "");
      if (seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  /* Every distinct legal move the readings produce, as
   * {m, san, uci} - the caller plays a lone survivor and
   * refuses a crowd. The promotion default is applied here,
   * where legality is known: a four-item move that lands a
   * pawn on the last rank is a QUEEN promotion unless the
   * utterance named another piece ("equals knight" is the
   * one accepted piece phrase).
   */
  function collectMoves(pos, transcripts) {
    var legal = pos.legalMoves();
    var byUci = {};
    legal.forEach(function (m) { byUci[pos.uciOf(m)] = m; });
    var seen = {}, out = [];
    transcripts.forEach(function (raw, ti) {
      var pm = parseMove(raw);
      if (!pm) return;
      var uci = pm.uci;
      // a promoting move's UCI carries its piece letter; the
      // bare four items name the queen, a spoken piece names
      // itself. Nothing else is tried: e7e8 with "equals
      // knight" is e7e8n or it is nothing - and a promotion
      // word next to a move that does not promote is a
      // mishearing, not a move.
      if (byUci[uci + (pm.promo || "q")]) uci = uci + (pm.promo || "q");
      else if (pm.promo) return;
      var m = byUci[uci];
      if (!m) return;
      if (seen[uci]) return;
      seen[uci] = true;
      if (ti > 0) log("PRS", "move came from reading " + ti);
      out.push({ m: m, san: pos.sanOf(m, legal), uci: uci });
    });
    return out;
  }

  /* The one distinction the refusal is allowed to make -
   * without it, a mishearing and a bad move are
   * indistinguishable at the board: did some reading reduce to a
   * clean four-item move - nothing missing, no unknown word -
   * whose from-to pair matches NO legal move? Then the mic
   * heard a whole move and the move itself is the problem, and
   * the caller says "That is not a legal move." instead. This
   * asks about the SQUARES only: a four-square pair that is
   * legal but fell to the promotion rule ("equals knight" on a
   * move that does not promote) stays a mishearing, and rival
   * readings that disagree never reach here - with a candidate
   * on the board the mic is guessing, not the player.
   */
  function namesIllegalMove(pos, transcripts) {
    var fromTo = {};
    pos.legalMoves().forEach(function (m) {
      fromTo[pos.uciOf(m).slice(0, 4)] = true;
    });
    return transcripts.some(function (raw) {
      var pm = parseMove(raw);
      return !!pm && !fromTo[pm.uci];
    });
  }
  /*=========================== DIALOGUE ===========================\
   *
   *  WHAT THIS FILE IS. Everything between "some words arrived"
   *  and "a move was sent, or a sentence was spoken". matching.js
   *  reduces the readings to at most one legal move; this decides
   *  what to do about it - play it, or say "Say again." - and it
   *  is the file that owes the user a sentence on every path out.
   *
   *  The four-item grammar does not allow half a
   *  sentence, so there is no repair or prompting machinery
   *  here. What there is: the one question that is not a move
   *  (resign/draw/claim, yes or no), the busy guard, the post
   *  pipeline, and the chime.
   *
   *  THE ORDER OF handleTranscripts IS LOAD-BEARING:
   *  memo first (a memo naming a move must never be played),
   *  then the open yes/no, then commands, then the move.
   *
   *  SILENCE IS NOT AN ANSWER. Every path out of here speaks or
   *  chimes, except the two deliberate exceptions documented
   *  where they live: stray talk with no square in it, and
   *  yes/no/cancel with no open question.
   *
   *  "Say again." IS THE REFUSAL for everything that is not a
   *  clean legal four-item move. The log records what was heard.
   *
   *  ONE EXCEPTION: a WHOLE move, heard clean, that is simply
   *  not legal gets "That is not a legal move."
   *================================================================*/

  var confirmAction = null;  // key into CONFIRMS

  var CONFIRMS = {
    resign:        { yes: "resign", yesSay: "resigning.",
                     no: null, noSay: "cancelled." },
    offerdraw:     { yes: "draw/yes", yesSay: "draw offered.",
                     no: null, noSay: "cancelled." },
    drawoffer:     { yes: "draw/yes", yesSay: "draw accepted.",
                     no: "draw/no", noSay: "draw declined." },
    takebackoffer: { yes: "takeback/yes", yesSay: "takeback accepted.",
                     no: "takeback/no", noSay: "takeback declined." },
    // claim-victory: offered when the opponent has been
    // gone past Lichess's window. "no" sends nothing - the
    // window stays open, and handleOpponentGone only re-arms
    // the question on a FRESH departure, so declining is
    // declining, not snoozing. "waiting." is the honest word.
    claimvictory:  { yes: "claim-victory", yesSay: "claiming the win.",
                     no: null, noSay: "waiting." }
  };

  var busy = false;

  /* NO QUESTION OUTLIVES THE GAME IT WAS ASKED IN.
   * Called from everywhere a game begins or ends: joinGame,
   * the game-over branch, practice on and off, voice off. The
   * armed read-back goes too, since it refers to a move posted
   * in a game that is no longer the current one.
   */
  function clearDialogue() {
    confirmAction = null;
    armedUci = null;
  }

  // THE CONFIRMATION BELONGS TO WHICHEVER EVENT ARRIVES
  // FIRST. Two things confirm a move we posted - the stream
  // carrying our own uci back, and the 200 - and they arrive
  // in either order within the same second. armedUci is set by
  // acceptMove to the move we sent, and the first caller to
  // match it takes it. The loser finds it null and says
  // nothing, so nothing is doubled and nothing depends on who
  // won.
  //
  // ONLY A MOVE WE POSTED IS ARMED. A move made by hand on
  // the Lichess board arrives through the same syncMoves
  // path with no arm behind it and stays unspoken.
  var armedUci = null;

  // The post-move feedback. It confirms a move the user
  // spoke WHOLE - all four items - so the one bit it carries
  // is the bit that is owed: heard exactly, legal, played.
  // HOW it is carried is the Confirm setting:
  //   chime   the default - two notes when they can be
  //           scheduled, a spoken "okay" when they cannot.
  //           three loudnesses.
  //   voice   the move read back whole, the same sentence an
  //           opponent's move gets.
  //   none    nothing. Every error path below still speaks.
  function confirmFeedback(san, uci) {
    if (CONFIRM_MODE === "none") return;
    if (CONFIRM_MODE === "voice") {
      speak(moveToSpeech(san, uci) + ".");
      return;
    }
    if (playConfirmChime()) return;
    speak("okay.");
  }

  // announce=false is a catch-up replay (reconnect,
  // takeback rebuild): it still DISARMS - that move is
  // history now and must not be confirmed when some later
  // event happens to match - but speaks nothing.
  function readBackMine(san, uci, announce) {
    if (!armedUci || armedUci !== uci) return;
    armedUci = null;
    if (!announce) return;
    // A SAN ending in # ends the game whoever gets there
    // first, and the result line says it better than a
    // confirmation can. api.over alone is not enough.
    if (api.over || /#$/.test(san)) return;
    confirmFeedback(san, uci);
  }

  /* THE ONLY OTHER CALLER IS THE FOUR-ITEM MATCH in
   * handleTranscripts: a reading that reduced to exactly one
   * legal move, spoken whole by the user. Nothing arrives here
   * inferred, repaired, or picked from a list, and if a new
   * path ever wants in without the whole move behind it, the
   * answer is no. */
  function acceptMove(c, quiet) {
    if (busy) {
      // SILENCE IS NOT AN ANSWER, not even for "I am still
      // working on the last one". It is a short window
      // normally; it was an unbounded one until postMove grew
      // a timeout.
      log("DLG", "ignored, busy");
      speak("still sending the last move.");
      return;
    }
    busy = true;
    var uci = api.pos.uciOf(c.m);

    if (dryRun) {
      api.pos.apply(c.m);
      api.moves.push(uci);
      api.lastSan = c.san;
      api.lastUci = uci;
      busy = false;
      log("DRY", "you play " + uci + " = " + c.san + " (not sent)");
      // same one-bit feedback as the live path, so practice
      // is where the chime can be heard without a game at
      // stake
      if (!quiet) confirmFeedback(c.san, uci);
      // CALLED BY NAME, NOT BY REFERENCE: late binding
      // costs nothing and means the current definition is the
      // one that runs.
      setTimeout(function () { dryOpponentReply(); }, 1600);
      return;
    }

    armedUci = quiet ? null : uci;        /* see readBackMine */
    postMove(uci).then(function (r) {
      busy = false;
      var ok = r.status === 200 && r.body && r.body.ok !== false && !r.body.error;
      log("PST", uci + " -> " + r.status + " " + JSON.stringify(r.body).slice(0, 120));
      if (ok) {
        // THIS RESOLVES LATE. The gameState event for the same
        // move usually arrives before this promise does - on
        // the mating move, always - so whichever got here first
        // confirms, the other finds it disarmed (see
        // readBackMine).
        readBackMine(c.san, uci, true);
      } else {
        armedUci = null;     /* rejected: nothing to confirm */
        // A DEAD TOKEN IS NOT A BAD MOVE. "Lichess rejected
        // that move. error 401" is true words with the wrong
        // diagnosis; say the one useful instruction instead.
        if (r.status === 401 || r.status === 403) {
          var firstAuthFail = !authGone;
          noteAuthFailure(new Error("move HTTP " + r.status));
          if (!firstAuthFail) speak("still signed out. sign in again.");
          return;
        }
        if (r.status === 429) {
          // the one wrong answer to a 429 is trying again at
          // once, and "rejected" invites exactly that
          speak("Lichess asks us to slow down. " +
                "wait a moment, then say the move again.");
          return;
        }
        var msg = (r.body && r.body.error) ? String(r.body.error) : ("error " + r.status);
        speak("Lichess rejected that move. " + msg);
      }
    }).catch(function (e) {
      busy = false;
      armedUci = null;
      log("ERR", "post: " + e.message);
      speak("Could not reach Lichess.");
    });
  }

  /* Send a confirmed yes/no action and report what actually
   * happened. In practice mode there is nothing to send
   * and nothing to fail, so it just says the line. */
  function confirmedAction(path, saidWhenSent) {
    if (dryRun) { speak(saidWhenSent); return; }
    postAction(path).then(function (r) {
      if (r.ok) { speak(saidWhenSent); return; }
      // THE STATUS IS PART OF THE ANSWER. Lichess 400s these
      // paths in ordinary play - resign in the abortable
      // phase, a takeback the opponent just withdrew, a draw
      // offer that expired - and "resigning." over any of
      // them would be a lie.
      if (r.status === 401 || r.status === 403) {
        var firstFail = !authGone;
        noteAuthFailure(new Error("action HTTP " + r.status));
        if (!firstFail) speak("still signed out. sign in again.");
        return;
      }
      if (r.status === 429) {
        speak("Lichess asks us to slow down. try that again in a moment.");
        return;
      }
      var why = "";
      try { why = String(JSON.parse(r.body).error || ""); } catch (e) {}
      log("ERR", "action " + path + " refused: " + r.status +
          (why ? " " + why : ""));
      speak("Lichess refused that." + (why ? " " + why : ""));
    }).catch(function (e) {
      log("ERR", "action " + path + ": " + e.message);
      speak("could not reach Lichess. that did not go through.");
    });
  }

  function repeatLast() {
    speak(api.lastSan
            ? "Last move: " + moveToSpeech(api.lastSan, api.lastUci)
            : "No move to repeat yet.");
  }

  function handleTranscripts(rawList) {
    var transcripts = dedupeTranscripts(rawList);
    var primary = transcripts[0] || "";
    var dropped = (rawList ? rawList.length : 0) - transcripts.length;
    log("HRD", transcripts.map(function (t, i) {
      return i + ":" + t;
    }).join(" | ") + (dropped ? "   (" + dropped + " dup)" : ""));

    // A verbal memo for the log. Checked before ANYTHING
    // else, because a memo that mentions a move must never
    // be parsed as one: a note containing a currently legal
    // move would otherwise be PLAYED. Any
    // reading may carry the memo word. A pending yes/no
    // question survives a memo untouched.
    var memoText = memoTranscript(transcripts);
    if (memoText) {
      log("MEMO", memoText);
      speak("Memo recorded in log.");
      return;
    }
    // COMMANDS ARE READ FROM THE PRIMARY TRANSCRIPT ONLY, and
    // that is a decision, not an oversight: "resign", "yes"
    // and "draw" all END something, and
    // a command invented from a reading the mic ranked second
    // could resign a game the user is winning. A missed
    // command costs one repetition.
    var cmd = classifyCommand(primary);

    if (confirmAction) {
      var spec = CONFIRMS[confirmAction];
      // THE ANSWER WAITS FOR THE POST: nothing is
      // claimed until the send succeeds, and a failed send
      // says so.
      if (cmd === "yes") {
        confirmAction = null;
        confirmedAction(spec.yes, spec.yesSay);
        return;
      }
      if (cmd === "no" || cmd === "cancel") {
        confirmAction = null;
        if (spec.no) confirmedAction(spec.no, spec.noSay);
        else speak(spec.noSay);      /* nothing to send: local */
        return;
      }
      speak("Say yes or no.");
      return;
    }

    if (cmd === "repeat") { repeatLast(); return; }
    if (cmd === "time") { speakClockTimes(); return; }
    if (cmd === "flip") { flipClockSides(); return; }

    if (cmd === "resign") { confirmAction = "resign";
      speak("Resign the game?"); return; }
    if (cmd === "draw") { confirmAction = "offerdraw";
      speak("Offer a draw?"); return; }
    // YES, NO AND CANCEL WITH NOTHING OPEN ARE SILENT, ON
    // PURPOSE. The mic is open the whole game,
    // and CANCEL_WORDS includes "stop" and "forget", which
    // land in ordinary speech at the board more often than as
    // commands. The trade is only safe because it is narrow: a
    // yes or no that has a question to answer always speaks,
    // in the confirmAction block above.
    if (cmd === "yes" || cmd === "no" || cmd === "cancel") return;

    // Is there anything move-shaped in ANY reading - a
    // complete square, file and rank together. The mic is
    // open the whole game, so stray talk arrives here
    // constantly, and it should not be answered out loud.
    var moveLike = transcripts.some(hasSquare);

    if (!api.pos || api.over || api.pos.turn !== api.myColor) {
      if (!moveLike) {
        // ordinary talk, a cough, the television. Nothing
        // was being asked of us, so say nothing.
        log("HRD", "ignored, not a move: " + primary);
        return;
      }
      // a real move at the wrong moment IS worth answering
      if (!api.pos) speak("Not connected to a game yet.");
      else if (api.over) speak("The game is over.");
      else speak(colorWord(api.pos.turn) + " to move.");
      return;
    }

    log("PRS", describeItems(primary));
    var cands = collectMoves(api.pos, transcripts);
    log("CND", cands.map(function (c) { return c.san; }).join(",") ||
        "(none)");

    // EXACTLY ONE legal four-item move across every reading:
    // play it. The chime that follows the post is the whole
    // confirmation - see confirmFeedback.
    if (cands.length === 1) {
      acceptMove(cands[0]);
      return;
    }
    // More than one means rival readings disagree about which
    // legal move was said - a mishearing by definition, and
    // never a pick (the log above names them both). Zero with
    // a square in the utterance means damaged, incomplete, or
    // illegal. ONE ANSWER FOR ALL OF IT: no read-back of the
    // hearing, no legality lecture, no filling the gap however
    // unique the completion - getting fancy with logic to fix
    // mishears is the wrong path.
    if (moveLike || cands.length > 1) {
      // A whole four-item move, heard clean, that is not legal
      // is answered "That is not a legal move."
      if (!cands.length && namesIllegalMove(api.pos, transcripts)) {
        speak("That is not a legal move.");
        return;
      }
      speak("Say again.");
      return;
    }
    // no square anywhere: stray talk, logged and left alone
    log("HRD", "ignored, not a move: " + primary);
  }
  /*=========================== PRACTICE ===========================\
   *
   *  A WHOLE GAME, LOCALLY, WITH NOTHING SENT TO LICHESS. The
   *  entire pipeline runs - mic, parsing, the ambiguity
   *  dialogue, speech, the log - and the "opponent" picks
   *  uniformly at random from the legal moves. It is how the
   *  grammar is exercised without spending a real game, and it
   *  is what the harness drives.
   *
   *  THE ONE FLAG SHARED with the rest of the program is
   *  dryRun, and it is declared here because this
   *  is what owns it. Everything else only ever ASKS: lichess.js
   *  refuses to send while it is true, ui.js toggles it, the
   *  harness sets it directly. It is read in a dozen places and
   *  written in three, all of which are about entering or
   *  leaving this mode.
   *
   *  BEFORE TOUCHING dryStart: practice must put down
   *  everything that could deliver a real game - here that
   *  is the game stream and its reconnect/poll timers -
   *  because dryRun gags every announcement, and a real game
   *  arriving while it is on is a live clock in silence.
   *================================================================*/

  // practice mode: nothing is ever sent to Lichess
  var dryRun = false;

  function dryStart() {
    // EVERYTHING THAT COULD DELIVER A REAL GAME IS PUT DOWN
    // FIRST. dryRun gags every announcement - a real game
    // with a running clock, in silence, while the board in
    // front of you says something else. Practice is a mode
    // where nothing is sent to Lichess, so nothing may
    // arrive from it either.
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
    clearDialogue();
    api.gameId = "PRACTICE";
    api.myColor = "w";
    api.pos = new RULES.Position();
    api.moves = [];
    api.over = false;
    api.lastSan = "";
    api.lastUci = "";
    // practice has no clock: "time" answers "no clock
    // running.", which is the truth.
    api.wtime = null;
    api.btime = null;
    api.clockAt = null;
    api.movesBefore = 0;
    api.players = { w: null, b: null };
    log("DRY", "practice mode ON - nothing will be sent to Lichess");
    speakWhenAudioSettled("Practice mode. You are white.");
  }

  function dryOpponentReply() {
    // it is scheduled 1.6s ahead, so it can land after
    // practice has ended - including after a real game took
    // the board. dryRun alone was the guard; the game id is
    // added because this function APPLIES A MOVE, and the one
    // thing it must never apply it to is a real position.
    if (!dryRun || api.over || api.gameId !== "PRACTICE") return;
    var legal = api.pos.legalMoves();
    if (!legal.length) {
      api.over = true;
      sayResult("Practice game over.");
      return;
    }
    var m = legal[Math.floor(Math.random() * legal.length)];
    var san = api.pos.sanOf(m);
    var uci = api.pos.uciOf(m);
    api.pos.apply(m);
    api.moves.push(uci);
    api.lastSan = san;
    api.lastUci = uci;
    log("DRY", "opponent plays random legal move " + uci + " = " + san);
    speak(moveToSpeech(san, uci) + ".");
    if (!api.pos.legalMoves().length) {
      api.over = true;
      sayResult("Practice game over.");
    }
  }

  /*================== SPEECH OUT (gates the mic) ==================*/

  var SPOKEN_FILE = { a: "alpha", b: "bravo", c: "charlie", d: "delta",
    e: "echo", f: "foxtrot", g: "golf", h: "hotel" };
  var SPOKEN_PIECE = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };

  var speechReady = false, speakQueue = [], speaking = false, speakGuard = null;
  var voicePicked = null, spokeOnce = false, noSynthLogged = false;
  var missLogged = null;

  // iOS often returns an empty voice list until speech has
  // actually been used once, and Safari does not reliably
  // fire onvoiceschanged. So poll, and re-check after the
  // first tap, instead of trusting a single early call.
  var voiceTries = 0;

  // SILENT WHEN IT WORKS: per-session voice counts say the
  // same thing every time, which is noise in a log read to
  // find bugs. Making a missing voice diagnosable is the job
  // of the miss path below, which prints the full list only
  // when VOICE_NAME was set and did not match - the only
  // moment the names are actually wanted.
  function loadVoices() {
    // An empty list is not a failure: iOS returns nothing
    // until speech has been used once, and the false
    // return is what tells the boot poller to keep trying.
    var list = [];
    try { list = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!list.length) return false;
    // cleared so a reloaded voice list cannot leave a
    // stale pick behind
    voicePicked = null;
    if (!VOICE_NAME) {
      // THE EMPTY STRING IS THE RECOMMENDED SETTING, and
      // the mechanism is the whole reason: Safari uses the
      // voice for the PAGE language rather than whichever
      // entry carries the default flag, and iOS then
      // substitutes the best installed variant of it. So
      // whatever is chosen as the SYSTEM voice arrives
      // here - including a downloaded Premium or Enhanced
      // voice that getVoices() never lists by name. See
      // the note above VOICE_NAME for the Settings path.
      return true;
    }
    var want = VOICE_NAME.toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (list[i].name.toLowerCase().indexOf(want) >= 0) {
        voicePicked = list[i];
        if (missLogged !== "ok:" + VOICE_NAME) {
          missLogged = "ok:" + VOICE_NAME;
          log("TTS", "using voice " + list[i].name +
              " (" + (list[i].lang || "?") + ")");
        }
        return true;
      }
    }
    if (missLogged === VOICE_NAME) return true;
    missLogged = VOICE_NAME;
    if (/siri/i.test(VOICE_NAME)) {
      log("TTS", "Siri voices are private to Apple and are " +
          "never offered to web pages");
    } else {
      log("TTS", "voice not found: " + VOICE_NAME);
    }
    // built HERE, not at the top: this path is the only
    // one that wants the names.
    var eng = list.filter(function (v) {
      return /^en/i.test(v.lang || "");
    });
    log("TTS", "English voices: " + (eng.length
      ? eng.map(function (v) { return v.name; }).join(", ")
      : "none"));
    return true;
  }

  function pollVoices() {
    if (loadVoices()) return;
    if (voiceTries++ < 40) setTimeout(pollVoices, 500);
    else log("TTS", "no voices reported by this browser");
  }

  try {
    if (window.speechSynthesis) {
      pollVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  } catch (e) {}

  function wakeSpeech() {
    if (speechReady || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
      speechReady = true;
    } catch (err) { log("TTS", "wake failed: " + err.message); }
  }

  // One long utterance comes out as a run-on sentence, because
  // the browser voice barely pauses at punctuation. So split on
  // punctuation and put real silence between the pieces.
  function splitForSpeech(text) {
    var parts = [], buf = "", i, c, gap;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      buf += c;
      if (c === "." || c === "," || c === ";" || c === ":") {
        gap = (c === ",") ? GAP_CLAUSE_MS : GAP_SENTENCE_MS;
        if (buf.replace(/[.,;:\s]/g, "")) {
          parts.push({ text: buf.trim(), gap: gap });
        }
        buf = "";
      }
    }
    if (buf.replace(/[.,;:\s]/g, "")) {
      parts.push({ text: buf.trim(), gap: GAP_SENTENCE_MS });
    }
    return parts;
  }

  function speak(text) {
    if (!text) return;
    // EVERY output funnels through here, and it all goes
    // ONE way: to the voice. On-screen channels have been
    // tried and removed twice, both times for the same
    // reason: text on a screen pulls the eyes off the
    // physical board. If another channel is ever proposed,
    // that is the argument to answer first.
    log("SAY", text);
    splitForSpeech(text).forEach(function (p) { speakQueue.push(p); });
    pumpSpeech();
  }

  /* SPOKEN FOR THE EAR, LOGGED FOR THE EYE. Every English
   * voice reads "lichess" as "LITCH-ess", and Ava reads
   * "bravo" with the wrong first vowel; the respellings
   * below fix what the ear hears. The sentences are written
   * with the real words, log("SAY") records them as written,
   * and this table is applied at the LAST moment, on the
   * text handed to the synthesizer and nowhere else
   * (pumpSpeech) - so the log this project asks users to
   * paste reads normally.
   *
   * WHY RESPELLING AND NOT PROPER PHONETICS: the standard
   * for saying a pronunciation precisely EXISTS - SSML's
   * <phoneme> tag carries IPA - but Safari's speechSynthesis
   * takes plain text only: SSML is read out as markup or
   * stripped, and there is no lexicon hook. Respelling in
   * ordinary spelling-to-sound English is the one lever this
   * platform offers, which is why this table exists instead
   * of a phoneme field.*/
  function forTheEar(text) {
    return String(text)
      .replace(/lichess/gi, "lee chess")
      .replace(/\bbravo\b/gi, "brawvo");
  }

  // iOS fires onend while the audio is still playing. If the
  // next chunk is handed over then, the synthesizer queues it
  // internally and plays it back to back, so the gap elapses
  // silently underneath chunk one and is never heard. Wait for
  // the synthesizer to actually go quiet before timing the gap.
  function waitUntilQuiet(ceiling, cb) {
    var synth = window.speechSynthesis;
    var t0 = Date.now();
    (function check() {
      var busy = false;
      try { busy = synth.speaking || synth.pending; } catch (e) {}
      if (!busy || Date.now() - t0 > ceiling) return cb();
      setTimeout(check, 50);
    })();
  }

  function pumpSpeech() {
    if (speaking || !speakQueue.length) return;
    if (!window.speechSynthesis) {
      // nothing can be spoken here, but the panel this project
      // tells users to paste should say so rather than the
      // queue just emptying
      if (!noSynthLogged) {
        noSynthLogged = true;
        log("TTS", "no speechSynthesis in this browser - " +
            "spoken output is off");
      }
      speakQueue = [];
      return;
    }
    speaking = true;
    if (!MIC_ALWAYS_ON) pauseMic();
    var item = speakQueue.shift();
    var text = item.text;
    var gap = item.gap || 0;
    var t0 = Date.now();
    var tStart = 0;
    var settled = false;

    var advance = function (guardFired) {
      if (settled) return;
      settled = true;
      clearTimeout(speakGuard);
      // A WEDGED SYNTHESIZER IS RESET, NOT WALKED PAST. An iOS
      // audio-session interruption mid-utterance - Siri, a
      // call, an alarm - can leave speechSynthesis stuck:
      // speaking forever, new utterances queued inside it and
      // never started. Every item here then died the same way:
      // onstart never fired, the guard advanced past it, and
      // the page went PERMANENTLY SILENT while looking, to
      // every test we have, like it was speaking. The detection
      // signal was already computed for the debug log and used
      // for nothing: the guard firing with tStart still 0 means
      // this utterance NEVER STARTED. cancel() flushes the
      // synthesizer's internal backlog (our own queue is
      // untouched - items are handed over one at a time),
      // resume() clears a stuck paused flag, and the cancelled
      // utterance's late onerror lands on `settled` harmlessly.
      if (guardFired && tStart === 0) {
        log("TTS", "utterance never started - resetting speech synthesis");
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
        } catch (e) {}
      }
      var ceiling = Math.max(2500, text.length * 140);
      waitUntilQuiet(ceiling, function () {
        speaking = false;
        if (SPEAK_DEBUG) {
          // lag is how long the voice took to START talking,
          // which is the part that varies between voices.
          // spoke is mostly just how long the words take.
          log("TTS", "lag " + (tStart ? (tStart - t0) : -1) +
              "ms, spoke " + (Date.now() - t0) + "ms, gap " +
              gap + "ms  \"" + text + "\"");
        }
        if (speakQueue.length) {
          // speaking stays TRUE across the gap: it was
          // cleared above first, so a speak() arriving inside
          // the gap window pumped immediately and the
          // deliberate pause between chunks was lost. The
          // delayed pump clears it itself.
          speaking = true;
          setTimeout(function () { speaking = false; pumpSpeech(); }, gap);
        }
        else {
          if (!MIC_ALWAYS_ON) resumeMicSoon();
          // THE MIC MAY NEVER HAVE STARTED. startListening()
          // refuses while speech is in flight, and with
          // MIC_ALWAYS_ON nothing above resumes it. Here
          // the button starts the mic BEFORE connect()'s
          // announcement returns over the network, so the
          // race is narrow - but it exists any time the
          // button is tapped while anything is being
          // spoken, and it can leave the mic dead with the
          // button lit. startListening() returns early if
          // already listening, so this costs nothing
          // normally.
          else if (running && !listening) {
            log("MIC", "starting after speech (was blocked by it)");
            startListening();
          }
        }
      });
    };

    try {
      // the one place the phonetic respellings apply:
      // the queue, the log and the debug line all carry the
      // text as written
      var u = new SpeechSynthesisUtterance(forTheEar(text));
      u.rate = SPEAK_RATE;
      u.pitch = SPEAK_PITCH;
      u.volume = 1;
      if (voicePicked) u.voice = voicePicked;
      if (SPEAK_DEBUG && !spokeOnce) {
        spokeOnce = true;
        log("TTS", "first utterance voice: " +
            (u.voice ? u.voice.name : "system default"));
      }
      u.onstart = function () { tStart = Date.now(); };
      u.onend = advance;
      u.onerror = advance;
      window.speechSynthesis.speak(u);
      speakGuard = setTimeout(function () { advance(true); },
                              1200 + text.length * 90);
    } catch (err) { advance(); }
  }

  // Only for the FIRST announcement after a tap. Waits
  // until the recogniser is actually running, so its grab
  // of the audio route cannot cut the words in half, and
  // then lets the SILENT PRIMER below be what settles the
  // route - the real utterance goes out on the next tick
  // after the primer has ended.
  //
  // iOS loses the FIRST thing spoken after the audio route
  // comes up. Not clipped, lost outright. Something has to
  // be spoken before the route is really live, so this
  // speaks a SILENT utterance and lets that be the one that
  // disappears. No extra words are ever heard.
  function primeAudioRoute(done) {
    var fired = false;
    var once = function () {
      if (fired) return;
      fired = true;
      done();
    };
    try {
      var u = new SpeechSynthesisUtterance("ready");
      u.volume = 0;
      u.rate = 2;
      u.onend = once;
      u.onerror = once;
      window.speechSynthesis.speak(u);
      setTimeout(once, 800);
    } catch (e) { once(); }
  }

  function speakWhenAudioSettled(text) {
    var waited = 0;
    (function check() {
      if (listening || waited >= 4000) {
        if (!listening) log("AUD", "mic never started, speaking anyway");
        primeAudioRoute(function () {
          log("AUD", "route primed silently");
          setTimeout(function () { speak(text); });
        });
        return;
      }
      waited += 100;
      setTimeout(check, 100);
    })();
  }

  // Both styles speak NATO files: a square is its NATO word
  // and its rank.
  function spokenSquare(square) {
    return (SPOKEN_FILE[square[0]] || square[0]) + " " + square[1];
  }

  // the check/mate suffix, which every shape below must reach
  // at the end - castling included: a bare "castles kingside"
  // for "O-O+" would be the one move that gives check without
  // saying so, and the opponent's castling is exactly the move
  // being listened to rather than watched.
  function checkWord(san) {
    if (san.slice(-1) === "#") return ", checkmate";
    if (san.slice(-1) === "+") return ", check";
    return "";
  }

  function sanToSpeech(san) {
    if (!san) return "";
    if (san.indexOf("O-O-O") === 0) return "castles queenside" + checkWord(san);
    if (san.indexOf("O-O") === 0) return "castles kingside" + checkWord(san);
    var text = san.replace(/[+#]$/, "").replace(/=([QRBN])/, "");
    var promoted = /=([QRBN])/.exec(san);
    // ONE FLAT PHRASE, AND THAT IS A CLOSED CASE. Comma
    // pacing was tried at two gap lengths and the chunking
    // had a cost no number could fix: splitting hands the
    // synthesizer each item as its own utterance, which
    // changes how the words themselves are voiced - "queen"
    // and "takes" stop sounding like words in a sentence.
    // Do not re-propose comma-pacing inside a move
    // announcement; a future fix has to change what the
    // synthesizer is HANDED (forTheEar above is that lever),
    // not how the sentence is chopped.
    var words = "";
    var piece = SPOKEN_PIECE[text[0]];
    if (piece) { words = piece + " "; text = text.slice(1); }
    var takes = text.indexOf("x") >= 0;
    var parts = text.split("x");
    var target = parts[parts.length - 1].slice(-2);
    var from = parts[0].slice(0, parts[0].length - (takes ? 0 : 2));
    if (from) {
      words += (SPOKEN_FILE[from[0]] || from[0]) + " ";
      if (from.length > 1) words += from[1] + " ";
    }
    if (takes) words += "takes ";
    words += spokenSquare(target);
    if (promoted) words += ", promotes to " + SPOKEN_PIECE[promoted[1]];
    words += checkWord(san);
    return words;
  }

  /* HOW A MOVE IS SPOKEN IS THE MOVE_SPEECH SETTING
   * pieces is sanToSpeech: the piece and where it landed.
   *  squares drops the piece talk entirely and speaks the
   * move's own two starting and ending squares - the same
   * four items the grammar asks the user to SAY, so what
   * the page announces is exactly what could be spoken
   * back at it. The uci is the truth for those squares:
   * castling in uci is the king's own move ("echo 1 golf 1"),
   * which is also how it is spoken IN. Promotion and the
   * check suffix still come off the san, the only place
   * they are written.
   *
   * Every announcement funnels through here; sanToSpeech is
   * called directly only where no uci exists to offer.
   */
  function moveToSpeech(san, uci) {
    if (MOVE_SPEECH === "squares" && uci && uci.length >= 4) {
      // A COMMA BETWEEN THE SQUARES: spoken flat, "delta 7
      // delta 5" runs on as one breathless phrase. The comma
      // buys the same GAP_CLAUSE_MS pause every spoken comma
      // gets (splitForSpeech), so the two squares land as
      // two things - from, then to.
      var words = spokenSquare(uci.slice(0, 2)) + ", " +
                  spokenSquare(uci.slice(2, 4));
      if (uci.length > 4 && SPOKEN_PIECE[uci[4].toUpperCase()]) {
        words += ", promotes to " + SPOKEN_PIECE[uci[4].toUpperCase()];
      }
      words += checkWord(san || "");
      return words;
    }
    return sanToSpeech(san);
  }

  /*============================ CHIMES ============================*/

  // WEBAUDIO ONLY, NEVER <audio> MEDIA ELEMENTS: iOS
  // silently discards media-element audio while the mic is
  // open - real games logged playback ok on moves that were
  // inaudible - so the chime is scheduled on a WebAudio
  // context born in a user gesture.
  //
  // The chime carries exactly ONE bit: your move landed.
  // A tone cannot say WHICH move, so it may only stand in a
  // slot where WHICH is not owed - and this is the only
  // such slot.
  //
  // No API reports AUDIBILITY; only ears at the board can
  // judge this. A chime that cannot even
  // be SCHEDULED - no WebAudio, context not running - is
  // answered with a spoken "okay." instead, never with
  // silence. A chime that was scheduled and went unheard
  // degrades to the opponent's reply being the next thing
  // heard, or to asking "repeat" - loud failures, not the
  // silent kind.

  // Retune these by ear at the board: two short rising sine
  // notes. LOUDNESS IS THE CONFIRM SETTING'S CHOICE: the
  // three sizes are the three chime entries of the Confirm
  // select - no separate volume control, no new key, and the
  // ear that judges is the finger that sets it. The steps
  // are roughly 6 dB apart, which is what "a step" means to
  // an ear; the device volume slider scales speech and chime
  // together, so this ratio is the only chime-to-speech
  // balance there is.
  var CHIME_FREQS = [988, 1319];    /* B5 then E6 */
  var CHIME_NOTE_S = 0.09;          /* per note, seconds */
  var CHIME_GAINS = { "chime-quiet": 0.09,
                      "chime":       0.18,
                      "chime-loud":  0.35 };

  // Standard for any non-chime mode: confirmFeedback only
  // calls into here on a chime mode, but a caller with no
  // mode (a future audition path, a test) still gets a sound,
  // never a NaN ramp.
  function chimeGain() {
    return CHIME_GAINS[CONFIRM_MODE] || CHIME_GAINS["chime"];
  }

  var chimeCtx = null, chimeNoApiLogged = false;

  // Called from the voice and practice taps: an
  // AudioContext created outside a user gesture starts
  // suspended on iOS, so it is created - and woken - where
  // the gestures are. Safe to call any number of times, and
  // a browser without the API gets a log line and speech,
  // never an error: a condition to detect, not the shape of
  // the world.
  function primeChimes() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        if (!chimeNoApiLogged) {
          chimeNoApiLogged = true;
          log("CHM", "no WebAudio on this browser - " +
              "confirmations will be spoken");
        }
        return;
      }
      if (!chimeCtx) {
        chimeCtx = new AC();
        log("CHM", "chime context created (" + chimeCtx.state + ")");
      }
      if (chimeCtx.state !== "running") {
        var p = chimeCtx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { log("CHM", "chime prime failed: " + e.message); }
  }

  // True means the chime was handed to the audio stack.
  // Audibility is the open question and nothing here can
  // answer it (see the header above); what CAN be known is
  // logged, because a pasted log has to separate "spoke okay
  // because the context was suspended" from "chimed and the
  // user did not hear it".
  function playConfirmChime() {
    try {
      if (!chimeCtx || chimeCtx.state !== "running") {
        if (chimeCtx) {
          log("CHM", "chime context " + chimeCtx.state +
              " - speaking instead");
          /* may rescue the NEXT chime, never this one */
          var p = chimeCtx.resume();
          if (p && p.catch) p.catch(function () {});
        }
        return false;
      }
      var t = chimeCtx.currentTime;
      var gain = chimeGain();
      for (var i = 0; i < CHIME_FREQS.length; i++) {
        var o = chimeCtx.createOscillator();
        var g = chimeCtx.createGain();
        var t0 = t + i * CHIME_NOTE_S, t1 = t0 + CHIME_NOTE_S;
        o.type = "sine";
        o.frequency.value = CHIME_FREQS[i];
        /* ramps, not steps: a bare start/stop clicks */
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
        g.gain.setValueAtTime(gain, t1 - 0.025);
        g.gain.linearRampToValueAtTime(0, t1);
        o.connect(g);
        g.connect(chimeCtx.destination);
        o.start(t0);
        o.stop(t1);
      }
      log("CHM", "confirm chime");
      return true;
    } catch (e) {
      log("CHM", "chime failed: " + e.message);
      return false;
    }
  }
  /*=================== MIC / SPEECH RECOGNITION ===================*/

  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null, listening = false, running = false;
  var restartTimer = null, micFails = 0, micCycles = 0;
  var micBlockedLogged = false;

  function startListening() {
    if (!Rec) { log("MIC", "SpeechRecognition unavailable in this browser"); return; }
    // A SILENT REFUSAL HIDES A DEAD MIC: the button is lit
    // and nothing in the log says the mic declined to
    // start. Speech blocking it is normal and self-healing
    // (the end of speech re-checks), so it is logged once
    // rather than every time; anything else refusing is
    // worth seeing.
    if (!running) return;
    if (listening) return;
    if (speaking) {
      if (!micBlockedLogged) {
        micBlockedLogged = true;
        log("MIC", "not starting yet: speech in flight");
      }
      return;
    }
    micBlockedLogged = false;
    try {
      recognition = new Rec();
    } catch (e) { log("ERR", "new SpeechRecognition: " + e.message); return; }
    recognition.lang = "en-US";
    recognition.continuous = MIC_ALWAYS_ON;
    recognition.interimResults = false;
    // Safari sometimes buries the correct reading: "echo
    // four" came back as "go for", "I go for", "go four"
    // with the right one fourth. More alternatives to sift
    // costs nothing, since every one is checked for a legal
    // move and only real matches survive.
    recognition.maxAlternatives = 8;
    recognition.onstart = function () {
      micFails = 0;
      micCycles++;
      /* Proof the loop is alive. Safari ends and restarts on
         its own, so cycles are rare - rare enough to log
         each one. */
      log("MIC", "listening (cycle " + micCycles + ")" +
          (MIC_ALWAYS_ON ? "" : " switching"));
    };
    // THE WEDGE IS OTHERWISE INVISIBLE: a wedged recognizer
    // logs "listening" and then nothing at all - no result,
    // no error, no end - while spoken moves go unheard. It
    // fires none of the handlers below, so nothing could say
    // WHERE voice died:
    // no audio reaching it is a different disease from audio
    // arriving and nothing recognised, and the two point at
    // different culprits (the audio session vs the service).
    // These lifecycle lines are the difference, at most one
    // apiece per cycle. A healthy start shows "audio route
    // open" within a moment of "listening"; its absence in a
    // pasted log is the diagnosis.
    var sawSound = false, sawSpeech = false;
    recognition.onaudiostart = function () {
      log("MIC", "audio route open");
    };
    recognition.onsoundstart = function () {
      if (sawSound) return;
      sawSound = true;
      log("MIC", "sound reaching the recogniser");
    };
    recognition.onspeechstart = function () {
      if (sawSpeech) return;
      sawSpeech = true;
      log("MIC", "speech detected");
    };
    recognition.onresult = function (ev) {
      var res = ev.results[ev.results.length - 1];
      if (!res) return;
      var alts = [];
      for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
      // no speaking gate here: AEC keeps our own
      // announcements out of the mic, so
      // every result is the room, and a move said over an
      // announcement lands as said.
      handleTranscripts(alts);
    };
    recognition.onerror = function (ev) {
      /* "aborted" is self-inflicted: speak() aborts the mic so we
       * never transcribe our own voice. "no-speech" is just silence.
       * Neither is worth a log line, and together they drowned out
       * the real events. */
      if (ev.error !== "no-speech" && ev.error !== "aborted") {
        log("MIC", "error " + ev.error);
      }
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        running = false;
        speak("Microphone blocked.");
      } else if (ev.error !== "no-speech" && ev.error !== "aborted") {
        micFails++;
        if (micFails >= 8) {
          running = false;
          log("MIC", "giving up after " + micFails +
              " failures - tap the button to restart");
          speak("Microphone stopped. Tap the button to restart.");
        }
      }
    };
    recognition.onend = function () {
      listening = false;
      renderButton();
      scheduleRestart(300);
    };
    try {
      recognition.start();
      listening = true;
    } catch (e) {
      log("ERR", "rec.start: " + e.message);
      listening = false;
      scheduleRestart(800);
    }
    renderButton();
  }

  function scheduleRestart(ms) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(function () {
      if (running && !speaking && !listening) startListening();
    }, ms);
  }

  /* DECLARE THE SESSION instead of letting Safari guess.
   * "play-and-record" is the web's version of the
   * AVAudioSession category a native mic-and-speaker app
   * names, and this page is exactly that: mic open,
   * synthesizer speaking. A condition to DETECT, never the
   * shape of the world: browsers without the API get a log
   * line and nothing else. */
  function declareAudioSession() {
    try {
      if (navigator.audioSession && "type" in navigator.audioSession) {
        navigator.audioSession.type = "play-and-record";
        log("AUD", "audio session declared play-and-record");
      } else {
        log("AUD", "no audio session API on this browser");
      }
    } catch (e) { log("AUD", "audio session declare failed: " + e.message); }
  }

  function pauseMic() {
    clearTimeout(restartTimer);
    if (recognition) { try { recognition.abort(); } catch (e) {} }
    recognition = null;
    listening = false;
    renderButton();
  }

  function resumeMicSoon() { scheduleRestart(400); }

  /* ================ LICHESS BOARD API ============== */

  var RULES = makeRules();

  var api = {
    gameId: null,
    myId: null,
    myName: null,
    myColor: null,
    players: { w: null, b: null },
    pos: null,
    moves: [],            // uci list already applied
    movesBefore: 0,       // plies played before this list began -
                          // zero except a mid-game poll join (the
                          // pair's sum is the true ply count,
                          // which is what says whether the clocks run)
    lastSan: "",
    lastUci: "",          // the same move as lastSan, in the
                          // coordinates the squares speech style
                          // reads
    wtime: null, btime: null,
    clockAt: null,        // when wtime/btime were last true
    over: false
  };

  var LICHESS_BASE = "https://lichess.org";

  // The token is kept ONLY in the Userscripts app's own
  // storage. Not in localStorage, which belongs to the site
  // and can be read by anything running on lichess.org,
  // including other extensions.
  //
  // The Safari Userscripts app provides the PROMISE form,
  // GM.setValue, and deliberately never implemented the old
  // synchronous GM_setValue. So the stored value is read
  // once at startup and held in memory, which keeps the
  // rest of the script synchronous.
  //
  // UNDER THE LEGACY KEY NAME, DELIBERATELY:
  // "audioplay_lichess_token" is the key installed versions
  // have been keeping the token under - so a new build
  // installed over one finds the token where it already is,
  // and "later versions do not need it pasted in again"
  // stays true.
  var GM_TOKEN_KEY = "audioplay_lichess_token";
  var cachedToken = null;

  function gmAvailable() {
    return typeof GM !== "undefined" && GM &&
           typeof GM.setValue === "function" &&
           typeof GM.getValue === "function";
  }

  function loadStoredToken() {
    if (!gmAvailable()) {
      log("ERR", "no extension storage: GM.setValue missing");
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(GM.getValue(GM_TOKEN_KEY, "")).then(function (v) {
        cachedToken = v || null;
        log("API", cachedToken
          ? "token loaded from extension storage"
          : "no token stored yet");
        return cachedToken;
      }).catch(function (e) {
        log("ERR", "could not read token: " + e);
        return null;
      });
    } catch (e) {
      log("ERR", "could not read token: " + e.message);
      return Promise.resolve(null);
    }
  }

  function storedToken() {
    return TOKEN || cachedToken || null;
  }

  function saveToken(t) {
    cachedToken = t;
    authGone = false;   /* a NEW token re-arms the reconnects -
                           the whole point of the token button:
                           replace a dead token mid-session and
                           the retries come back to life. */
    if (!gmAvailable()) return Promise.resolve(false);
    try {
      return Promise.resolve(GM.setValue(GM_TOKEN_KEY, t)).then(function () {
        log("API", "token saved in extension storage");
        return true;
      }).catch(function (e) {
        log("ERR", "could not save token: " + e);
        return false;
      });
    } catch (e) {
      log("ERR", "could not save token: " + e.message);
      return Promise.resolve(false);
    }
  }

  function clearToken() {
    cachedToken = null;
    api.myId = null;
    api.myName = null;
    if (!gmAvailable()) return Promise.resolve(false);
    try {
      var p = (typeof GM.deleteValue === "function")
        ? GM.deleteValue(GM_TOKEN_KEY)
        : GM.setValue(GM_TOKEN_KEY, "");
      return Promise.resolve(p).then(function () {
        log("API", "token cleared from this device");
        return true;
      }).catch(function (e) {
        log("ERR", "could not clear token: " + e);
        return false;
      });
    } catch (e) { return Promise.resolve(false); }
  }

  // Asked for once. Kept only by the Userscripts app on this
  // device. Never sent anywhere except to Lichess itself in
  // the Authorization header. Resolves with the token, or
  // null if there is nowhere to keep it or none was given.
  // A confirm box only has two buttons, so checking what was
  // stored meant either replacing it or deleting it, with no
  // way out. A prompt has three outcomes: type something to
  // replace, type CLEAR to delete, or Cancel to leave it be.
  function manageToken() {
    var have = storedToken();
    if (!have) { ensureToken(); return; }
    var tail = have.length > 4 ? have.slice(-4) : have;
    var t = null;
    try {
      t = window.prompt(
        "A token ending " + tail + " is saved.\n\n" +
        "Paste a new token to replace it,\n" +
        "type CLEAR to delete it,\n" +
        "or press Cancel to leave it alone.", "");
    } catch (e) { return; }
    if (t === null) { log("API", "token left unchanged"); return; }
    t = t.replace(/\s+/g, "");
    if (!t) { log("API", "token left unchanged"); return; }
    if (/^clear$/i.test(t)) { clearToken(); return; }
    saveToken(t);
  }

  function ensureToken() {
    var have = storedToken();
    if (have) return Promise.resolve(have);
    if (!gmAvailable()) {
      log("ERR", "not asking for a token: nowhere safe to put it");
      try {
        window.alert("This script cannot store your token.\n\n" +
          "The Userscripts app is not providing GM.setValue. " +
          "Check the @grant lines at the top of the file.");
      } catch (e) {}
      return Promise.resolve(null);
    }
    var t = null;
    try {
      t = window.prompt(
        "Lichess API token (needs the board:play scope).\n\n" +
        "Create one at lichess.org/account/oauth/token/create\n\n" +
        "It is stored on this device only.");
    } catch (e) {}
    if (!t) return Promise.resolve(null);
    t = t.replace(/\s+/g, "");
    if (!t) return Promise.resolve(null);
    return saveToken(t).then(function (ok) { return ok ? t : null; });
  }

  function authHeaders() {
    return { Authorization: "Bearer " + (storedToken() || "") };
  }

  // The one DOM-adjacent read this layer makes, and it reads
  // the URL, not the page (constraint 2 is about game STATE).
  // A game path is /8chars, sometimes /12 with the player
  // suffix; the first 8 are the game id.
  function gameIdFromUrl() {
    var seg = location.pathname.split("/")[1] || "";
    if (/^[A-Za-z0-9]{8,12}$/.test(seg)) return seg.slice(0, 8);
    return null;
  }

  function apiGet(path) {
    return fetch(LICHESS_BASE + path, { headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
        return r.json();
      });
  }

  function fetchMyId() {
    return apiGet("/api/account").then(function (a) {
      api.myId = (a.id || "").toLowerCase();
      // the id is lowercased for comparing against
      // game.white.id; the username keeps its real
      // capitalisation and is what the log shows
      api.myName = a.username || a.id || "";
      log("API", "account = " + api.myName);
      return api.myId;
    });
  }

  /* A POST THAT NEVER SETTLES MUST STILL SETTLE. The
   * caller sets busy = true and clears it in this promise's
   * handlers, so a fetch that hangs - a dead cell, a captive
   * wifi portal, the radio asleep - leaves busy stuck true
   * forever, and from then on EVERY accepted move is dropped
   * with nothing said. That is a mode the user cannot see, and
   * the only way out is the button. Twelve seconds is long
   * enough that a slow-but-alive request still wins the race,
   * and short enough to be inside the time a person waits
   * before assuming they were not heard. */
  var MOVE_POST_TIMEOUT_MS = 12000;

  function postMove(uci) {
    var url = LICHESS_BASE + "/api/board/game/" + api.gameId + "/move/" + uci;
    log("PST", "move " + uci);
    var timer = null;
    var live = fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) {
        return r.json().catch(function () { return { ok: r.ok }; })
          .then(function (j) { return { status: r.status, body: j }; });
      });
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        reject(new Error("no reply from Lichess in " +
                         (MOVE_POST_TIMEOUT_MS / 1000) + " seconds"));
      }, MOVE_POST_TIMEOUT_MS);
    });
    // whichever wins, the timer is done with - otherwise every
    // move leaves one armed for the full timeout behind it
    function done(v) { clearTimeout(timer); return v; }
    return Promise.race([live, timeout])
      .then(done, function (e) { done(); throw e; });
  }

  /* RESOLVES WITH WHAT HAPPENED, not with nothing. The
   * Board API 400s these paths in ordinary play: resign during
   * the abortable first moves, a takeback accepted after the
   * opponent withdrew it, a draw accepted after the offer
   * expired - and each must not be announced as done. */
  function postAction(action) {
    var url = LICHESS_BASE + "/api/board/game/" + api.gameId + "/" + action;
    log("PST", action);
    return fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) { return r.text().then(function (t) {
        log("PST", action + " -> " + r.status + " " + t.slice(0, 120));
        return { ok: r.ok, status: r.status, body: t };
      }); });
  }

  /* rebuild position from a uci move list, announcing only the new
   * tail */
  function syncMoves(uciString, announce) {
    var list = (uciString || "").trim() ? uciString.trim().split(/\s+/) : [];
    /* A TAKEBACK IS NOT ALWAYS SHORTER. What we hold has
     * to be a PREFIX of what the server sent; anything else is
     * a rebuild. The list is a few hundred entries at most and
     * this runs once per event. */
    var diverged = list.length < api.moves.length;
    for (var k = 0; !diverged && k < api.moves.length; k++) {
      if (list[k] !== api.moves[k]) diverged = true;
    }
    if (diverged) {
      /* takeback or new game: rebuild from scratch, silently */
      log("MOV", "move list diverged - rebuilding");
      api.pos = new RULES.Position();
      api.moves = [];
      api.lastSan = "";
      api.lastUci = "";
      armedUci = null;      /* it named a move in the old list */
      announce = false;
    }
    for (var i = api.moves.length; i < list.length; i++) {
      var res = api.pos.applyUci(list[i]);
      if (!res) {
        log("ERR", "illegal uci from stream: " + list[i] + " (resyncing)");
        api.pos = new RULES.Position();
        api.moves = [];
        /* REPLAY, KEEPING WHAT THE REPLAY SAYS. */
        api.lastSan = "";
        api.lastUci = "";
        armedUci = null;
        for (var j = 0; j < list.length; j++) {
          var rr = api.pos.applyUci(list[j]);
          if (!rr) { log("ERR", "resync failed at " + list[j]); break; }
          api.lastSan = rr.san;
          api.lastUci = list[j];
        }
        api.moves = list.slice();
        return;
      }
      api.moves.push(list[i]);
      var moverIsMine = (res.move.color === api.myColor);
      api.lastSan = res.san;
      api.lastUci = list[i];
      log("MOV", colorWord(res.move.color) + " " + list[i] + " = " + res.san +
          (announce ? "" : " (catch-up)"));
      if (announce && !moverIsMine) {
        speak(moveToSpeech(res.san, list[i]) + ".");
      }
      // OUR OWN MOVE, CONFIRMED BY THE STREAM. This
      // is the earlier of the two confirmations whenever
      // the stream wins the race with the 200, and it must
      // speak HERE: the opponent's reply can be in the very
      // same event batch, and the read-back has to be out
      // before it. readBackMine ignores anything we did not
      // post, and takes the arm so the 200 stays quiet.
      if (moverIsMine) readBackMine(res.san, list[i], announce);
    }
  }

  /* AN OPPONENT WHO LEAVES IS INVISIBLE TOO. Spoken once
   * per departure, and when the window opens it becomes a
   * yes/no through the same CONFIRMS machinery as every other
   * game-ending question. The event repeats as the countdown
   * ticks, so oppGone/claimAsked keep each sentence to once. */
  var oppGone = false, claimAsked = false;

  function handleOpponentGone(ev) {
    if (api.over || dryRun) return;
    if (ev.gone) {
      if (!oppGone) {
        oppGone = true;
        log("EVT", "opponent gone" + (ev.claimWinInSeconds != null
            ? ", claim in " + ev.claimWinInSeconds + "s" : ""));
        speak("your opponent has left the game.");
      }
      if (ev.claimWinInSeconds != null && ev.claimWinInSeconds <= 0 &&
          !claimAsked) {
        claimAsked = true;
        confirmAction = "claimvictory";
        speak("you can claim the win. say yes to claim it, " +
              "no to keep waiting.");
      }
    } else if (oppGone) {
      oppGone = false;
      claimAsked = false;
      if (confirmAction === "claimvictory") confirmAction = null;
      log("EVT", "opponent back");
      speak("your opponent is back.");
    }
  }

  /* An opponent's draw or takeback offer is invisible if you are not
   * looking at the screen, so it has to be spoken and answerable. */
  var offerState = { draw: false, takeback: false };

  /* AN OFFER MAY NOT QUIETLY INHERIT SOMEBODY ELSE'S "YES".
   * The offer still has to be heard: it is invisible
   * from across the room and it expires. So it takes the slot
   * and SAYS it is doing so, naming what it displaced. And an
   * offer that goes away takes its question with it. */
  function checkOffers(s) {
    if (!api.myColor) return;
    var oppDraw = api.myColor === "w" ? !!s.bdraw : !!s.wdraw;
    var oppTake = api.myColor === "w" ? !!s.btakeback : !!s.wtakeback;
    var them = colorWord(api.myColor === "w" ? "b" : "w");

    function displaced() {
      // only a question the user is mid-way through needs
      // naming; an earlier offer being replaced by a later one
      // is the same kind of thing and needs no apology.
      if (confirmAction === "resign") return "that cancels the resign question. ";
      if (confirmAction === "offerdraw") return "that cancels your draw offer question. ";
      if (confirmAction === "claimvictory") return "that cancels the claim question. ";
      return "";
    }

    if (oppDraw && !offerState.draw && !api.over) {
      var wasD = displaced();
      confirmAction = "drawoffer";
      log("API", "opponent offers a draw" + (wasD ? " (displacing a question)" : ""));
      speak(them + " offers a draw. " + wasD +
            "Say yes to accept, no to decline.");
    }
    if (oppTake && !offerState.takeback && !api.over) {
      var wasT = displaced();
      confirmAction = "takebackoffer";
      log("API", "opponent asks for a takeback" +
          (wasT ? " (displacing a question)" : ""));
      speak(them + " asks to take back a move. " + wasT +
            "Say yes to accept, no to decline.");
    }
    // WITHDRAWN: the question goes with the offer, and says so,
    // because the user may be holding a "yes" ready for it.
    if (!oppDraw && offerState.draw && confirmAction === "drawoffer") {
      confirmAction = null;
      log("API", "draw offer withdrawn");
      speak(them + " withdrew the draw offer.");
    }
    if (!oppTake && offerState.takeback && confirmAction === "takebackoffer") {
      confirmAction = null;
      log("API", "takeback request withdrawn");
      speak(them + " withdrew the takeback request.");
    }
    offerState.draw = oppDraw;
    offerState.takeback = oppTake;
  }

  // Extrapolates the running side's clock between server
  // events, for either color: clock mode paints both. Frozen
  // once the game is over, AND FROZEN BEFORE BOTH SIDES
  // HAVE MOVED: Lichess does not start the clocks until
  // each player has made their first move. The ply count is
  // movesBefore + moves.length so a mid-game poll join, whose
  // move list starts empty against a game already underway,
  // still knows the clocks are long since running.
  function remainingMs(color) {
    var base = color === "w" ? api.wtime : api.btime;
    if (base == null) return null;
    if (api.pos && !api.over && api.pos.turn === color && api.clockAt &&
        api.movesBefore + api.moves.length >= 2) {
      return base - (Date.now() - api.clockAt);
    }
    return base;
  }

  function resultSpoken(s2) {
    var status = (s2 && s2.status) || "over";
    // "white" | "black" | undefined
    var winner = s2 && s2.winner;
    var loser = winner === "white" ? "black" : "white";
    var how = { mate: "checkmate", resign: "resignation", outoftime: "time",
                timeout: "timeout", stalemate: "stalemate", draw: "agreement",
                aborted: "abort", cheat: "cheat detection",
                variantEnd: "variant end" }[status] || status;
    if (status === "aborted") return "game aborted.";
    if (status === "stalemate") return "stalemate. drawn.";
    if (!winner) return "drawn by " + how + ".";
    if (status === "mate") return "checkmate. " + winner + " wins.";
    if (status === "resign") return loser + " resigned. " + winner + " wins.";
    if (status === "outoftime") {
      return loser + " ran out of time. " + winner + " wins.";
    }
    return winner + " wins by " + how + ".";
  }

  function sayResult(sentence) {
    speak(sentence);
  }

  // "connected" the first time, "reconnected" after that,
  // so a mid-game network drop that healed itself is
  // announced as what it was: a resume, not a fresh start.
  var everConnected = false;

  function handleGameFull(g) {
    // STANDARD CHESS ONLY. NO VARIANTS.
    var vkey = (g.variant && (g.variant.key || g.variant.name)) || "standard";
    if (vkey !== "standard" && vkey !== "fromPosition") {
      api.over = true;
      log("API", "variant game (" + vkey + ") - not playable here");
      sayResult("this is a " + ((g.variant && g.variant.name) || vkey) +
            " game. this script plays standard chess only. play it by hand.");
      try { if (streamAbort) streamAbort.abort(); } catch (e) {}
      return;
    }
    api.pos = new RULES.Position(g.initialFen && g.initialFen !== "startpos"
                               ? g.initialFen : undefined);
    api.moves = [];
    api.movesBefore = 0;    // gameFull carries the WHOLE game;
                            // syncMoves below rebuilds the list
                            // from ply one, so nothing predates it
    var whiteId = ((g.white && g.white.id) || "").toLowerCase();
    api.myColor = (whiteId && whiteId === api.myId) ? "w" : "b";
    api.players.w = playerOf(g.white);
    api.players.b = playerOf(g.black);
    log("API", "game " + api.gameId + " you are " +
        (api.myColor === "w" ? "white" : "black") + ", " +
        playerLabel(api.players[api.myColor === "w" ? "b" : "w"]) +
        " on the other side");
    syncMoves(g.state && g.state.moves, false);   // catch up silently
    var st = g.state && g.state.status;
    if (st && st !== "started" && st !== "created") {
      api.over = true;
      log("API", "joined a finished game: " + st);
      sayResult("This game is already finished. " + resultSpoken(g.state));
      return;
    }
    handleGameState(g.state, false);
    speakWhenAudioSettled((everConnected ? "reconnected" : "connected") +
          ". You are " + colorWord(api.myColor) + ". " +
          colorWord(api.pos.turn) + " to move.");
    everConnected = true;
  }

  /* A gameFull player slot is one of two shapes: a human or
   * bot has {id, name, title, rating}, and one of Lichess's
   * own opponents has {aiLevel} and NO name at all. Both are
   * normalised here so nothing downstream has to know. */
  function playerOf(p) {
    if (!p) return null;
    if (p.aiLevel != null) {
      return { name: "computer level " + p.aiLevel, rating: null, title: null };
    }
    var name = p.name || p.id;
    if (!name) return null;
    return { name: name,
             rating: (typeof p.rating === "number") ? p.rating : null,
             title: p.title || null };
  }

  // For the log line and nothing else.
  function playerLabel(pl) {
    if (!pl) return "unknown opponent";
    return (pl.title ? pl.title + " " : "") + pl.name +
           (pl.rating != null ? " (" + pl.rating + ")" : "");
  }

  function handleGameState(s, announce) {
    if (!s) return;
    syncMoves(s.moves, announce !== false);
    api.wtime = s.wtime; api.btime = s.btime; api.clockAt = Date.now();
    checkOffers(s);
    if (s.status && s.status !== "started" && s.status !== "created") {
      if (!api.over) {
        api.over = true;
        log("API", "game over: " + s.status + " " + (s.winner || ""));
        // every open question dies with the game. A
        // "yes" held over from a finished game had nothing
        // good to do: post to a game Lichess has closed and
        // hear "draw accepted." for a draw that was not.
        clearDialogue();
        sayResult(resultSpoken(s));
      }
      return;
    }
  }

  /* ---- streaming ---- */

  var streamAbort = null;

  /* A LIVE STREAM IS LEFT ALONE. The voice button calls
   * this rather than startStream: restarting a HEALTHY stream
   * re-delivers gameFull, and the page announced "connected"
   * and "reconnected" back to back. Lichess keeps the stream
   * warm with a newline every few seconds, so bytes within the
   * last fifteen mean it is alive and there is nothing to
   * restart. */
  var streamBeatAt = 0;
  var streamGameId = null;

  function ensureStream() {
    if (streamGameId === api.gameId && streamBeatAt &&
        Date.now() - streamBeatAt < 15000) {
      log("NET", "stream is live - leaving it alone");
      return;
    }
    startStream();
  }

  function startStream() {
    if (!api.gameId || dryRun || api.gameId === "PRACTICE") return;
    log("NET", "opening stream for " + api.gameId);
    streamGameId = api.gameId;
    streamBeatAt = 0;
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    streamAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = { headers: authHeaders() };
    if (streamAbort) opts.signal = streamAbort.signal;

    fetch(LICHESS_BASE + "/api/board/game/stream/" + api.gameId, opts)
      .then(function (r) {
        if (!r.ok) throw new Error("stream HTTP " + r.status);
        if (!r.body || !r.body.getReader) throw new Error("no streaming body");
        streamBeatAt = Date.now();
        streamFails = 0;          /* it opened: the ladder resets */
        stopPolling();            /* one transport at a time */
        var reader = r.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) {
              log("NET", "stream ended");
              streamBeatAt = 0;      /* dead means dead */
              scheduleReconnect();
              return;
            }
            streamBeatAt = Date.now();   /* keep-alives count too */
            buf += dec.decode(res.value, { stream: true });
            var lines = buf.split("\n");
            buf = lines.pop();
            lines.forEach(function (ln) {
              if (!ln.trim()) return;            // keep-alive
              var ev;
              try { ev = JSON.parse(ln); }
              catch (e) { log("ERR", "bad ndjson: " + ln.slice(0, 80)); return; }
              log("EVT", ev.type || "?");
              if (ev.type === "gameFull") handleGameFull(ev);
              else if (ev.type === "gameState") handleGameState(ev, true);
              else if (ev.type === "opponentGone") handleOpponentGone(ev);
              else if (ev.type === "chatLine") { /* ignore */ }
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (e) {
        // AN ABORT IS OUR OWN DOING, NOT A DROPPED STREAM.
        // Without this filter, startStream aborting its
        // predecessor fed a reconnect loop that re-delivered
        // gameFull every two seconds for a whole game.
        if (String(e.name) === "AbortError") return;
        streamBeatAt = 0;         /* a failed stream is not live */
        log("ERR", "stream: " + e.message);
        /* a 429 jumps the ladder straight to its cap */
        if (/HTTP 429/.test(String(e.message))) {
          streamFails = Math.max(streamFails, 5);
        }
        if (String(e.message).indexOf("no streaming body") >= 0) startPolling();
        else if (!noteAuthFailure(e)) scheduleReconnect();
      });
  }

  /* A TOKEN THAT LICHESS NO LONGER ACCEPTS IS NOT A NETWORK
   * BLIP: retried, it is an HTTP 401 every two seconds,
   * forever, filling the log and telling the user nothing.
   * Said once, and the retrying stops,
   * because retrying cannot fix it. The remedy here is the
   * userscript's: the token button, not a sign-in page. */
  var authGone = false;
  function noteAuthFailure(e) {
    if (!/HTTP 40[13]/.test(String(e.message))) return false;
    if (authGone) return true;
    authGone = true;
    log("ERR", "lichess refused the token - tap token in the log panel");
    speak("Lichess refused the token. " +
          "tap the token button in the log panel and paste a new one.");
    return true;
  }

  var reconnectTimer = null;
  var streamFails = 0;
  function scheduleReconnect() {
    // NOT GATED ON THE MIC: listening and being
    // connected are different things. The stream is cheap,
    // every speaking path gates on its own state, and being
    // connected while silent costs nothing - whereas being
    // disconnected while listening is the failure that loses
    // games.
    if (api.over || dryRun || !api.gameId || api.gameId === "PRACTICE") return;
    if (authGone) return;
    // AND IT BACKS OFF: doubling to a thirty-second
    // ceiling keeps the first few retries as quick as they
    // ever were, which is the case that actually matters.
    streamFails++;
    var wait = Math.min(2000 * Math.pow(2, streamFails - 1), 30000);
    log("NET", "reconnecting in " + (wait / 1000) + "s (try " + streamFails + ")");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startStream, wait);
  }

  /* ---- polling fallback (if fetch streaming is unavailable) ----
   *
   * This path exists for a browser that cannot hold a
   * streaming body open, which the tested device can, so it
   * must not be trusted on faith. What the endpoint can and
   * cannot say: /api/account/playing carries neither a
   * status nor a result nor the opponent's clock, and its
   * `secondsLeft` is the account holder's. What cannot be
   * known is left null, and the end of a game is inferred
   * from the game leaving the list - twice in a row, because
   * a single anomalous response must not end a live game.
   *
   * THE URL IS THE DISCOVERY - the user is standing on the
   * game page - so the poll only ever FOLLOWS the game it
   * was started for. */
  var pollTimer = null;
  var pollSeen = false;      // has THIS game appeared in the list?
                             // (reset per game, in joinGame)
  var pollMisses = 0;        // consecutive ticks the game was gone
  var pollFails = 0;         // consecutive failed requests
  var pollSkip = 0;

  function startPolling() {
    if (pollTimer) return;   // already the fallback; keep cadence
    log("NET", "falling back to polling /api/account/playing");
    pollTimer = setInterval(pollOnce, 1500);
    pollOnce();
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function pollOnce() {
    /* NOT GATED ON THE MIC - listening and being
     * connected are different things, in this transport too. */
    if (dryRun) return;
    /* the ladder, poll-shaped: after four straight
     * failures, only every eighth tick goes out (~12s); one
     * success restores full cadence. */
    if (pollFails >= 4) {
      pollSkip++;
      if (pollSkip % 8 !== 0) return;
    }
    var forGame = api.gameId;   // bail if the world changes
                                // while the request is in flight
    if (!forGame || forGame === "PRACTICE" || api.over) return;
    apiGet("/api/account/playing?nb=50").then(function (d) {
      pollFails = 0;
      /* THE WORLD MAY HAVE CHANGED UNDER THE REQUEST. */
      if (dryRun || api.gameId !== forGame || api.over) return;

      var g = (d.nowPlaying || []).filter(function (x) {
        return x.gameId === api.gameId || (x.fullId || "").indexOf(api.gameId) === 0;
      })[0];
      if (!g) {
        /* The game left the list of ongoing games, so it is
         * over. The endpoint gives no status, so the sentence
         * does not guess a result. TWO consecutive missing
         * ticks are required. */
        if (pollSeen && !api.over) {
          pollMisses++;
          if (pollMisses < 2) return;
          api.over = true;
          clearDialogue();
          log("API", "game gone from nowPlaying - treating it as over");
          sayResult("game over. check lichess for the result.");
          uiGameChanged();
        }
        return;
      }
      pollSeen = true;
      pollMisses = 0;
      if (!api.myColor) {
        /* FIRST SIGHTING LOADS THE REAL POSITION. The
         * endpoint's fen is FULL - side to move, castling,
         * ep, the lot - so load it and say whose move it is,
         * exactly as handleGameFull does. */
        api.myColor = g.color === "white" ? "w" : "b";
        api.pos = new RULES.Position();
        if (g.fen) api.pos.load(g.fen);
        api.moves = [];
        /* THE FEN SAYS HOW FAR ALONG THE GAME IS. */
        var fp = String(g.fen || "").split(" ");
        var fm = parseInt(fp[5], 10);
        api.movesBefore = fm > 0
          ? (fm - 1) * 2 + (fp[1] === "b" ? 1 : 0) : 2;
        speak((everConnected ? "reconnected" : "connected") +
              ". You are " + g.color + ". " +
              colorWord(api.pos.turn) + " to move.");
        everConnected = true;
      }
      /* poll gives fen + lastMove only; replay lastMove onto our
       * position */
      if (g.lastMove && api.moves[api.moves.length - 1] !== g.lastMove) {
        var res = api.pos.applyUci(g.lastMove);
        if (res) {
          api.moves.push(g.lastMove);
          api.lastSan = res.san;
          api.lastUci = g.lastMove;
          if (res.move.color !== api.myColor) {
            speak(moveToSpeech(res.san, g.lastMove) + ".");
          }
          /* the stream's rule, kept identical here */
          if (res.move.color === api.myColor)
            readBackMine(res.san, g.lastMove, true);
          log("MOV", "poll " + g.lastMove + " = " + res.san);
        } else {
          /* RELOAD, THEN REMEMBER THAT WE DID: the uci is
           * pushed so the next tick's comparison moves on
           * and the ply guards keep counting; the list is a
           * position marker in poll mode, not a game record.
           * The fen is loaded WHOLE. */
          log("ERR", "poll desync on " + g.lastMove + "; reloading from fen");
          api.pos.load(g.fen);
          api.moves.push(g.lastMove);
          armedUci = null;          /* it named the old position */
        }
      }
      /* secondsLeft IS THE ACCOUNT HOLDER'S CLOCK, not white's.
       * The other side is unknowable from this endpoint and
       * stays null - "unknown" is the honest answer. */
      if (g.secondsLeft != null) {
        if (api.myColor === "w") api.wtime = g.secondsLeft * 1000;
        else api.btime = g.secondsLeft * 1000;
        api.clockAt = Date.now();
      }
    }).catch(function (e) {
      pollFails++;
      /* A REVOKED TOKEN IN POLL MODE: same sentence,
       * same halt as the streams. */
      if (noteAuthFailure(e)) { stopPolling(); return; }
      if (/HTTP 429/.test(String(e.message))) {
        pollFails = Math.max(pollFails, 4);      /* back off now */
      }
      log("ERR", "poll: " + e.message);
    });
  }

  /* ---- connecting ---- */

  function joinGame(gameId) {
    if (api.gameId === gameId && !api.over) return;
    api.gameId = gameId;
    api.myColor = null;
    api.pos = null;
    api.moves = [];
    api.movesBefore = 0;
    api.over = false;
    api.wtime = null; api.btime = null; api.clockAt = null;
    api.players = { w: null, b: null };
    offerState = { draw: false, takeback: false };
    oppGone = false; claimAsked = false;
    pollSeen = false; pollMisses = 0;      /* per-game */
    // and the questions from whatever game came before this
    // one - see clearDialogue.
    clearDialogue();
    (api.myId ? Promise.resolve(api.myId) : fetchMyId())
      .then(startStream)
      .catch(function (e) {
        log("ERR", "join: " + e.message);
        speak("could not connect. check the log.");
      });
  }

  // The voice button's way in: the game id is the URL's, the
  // token is asked for if none is stored (the tap that got us
  // here is the gesture a prompt needs).
  function connect() {
    var gid = gameIdFromUrl();
    if (!gid) {
      speak("Open a game first.");
      log("ERR", "no game id in " + location.pathname);
      return;
    }
    ensureToken().then(function (tok) {
      if (!tok) {
        speak("No API token set.");
        log("ERR", "no token set");
        return;
      }
      joinGame(gid);
    });
  }

  /*=========================== UI ============================\
   *
   *  The control panel over lichess.org: practice, log, clock,
   *  settings, and the voice button - a bordered box at the
   *  bottom right. Every button is the same tunable size
   *  (BUTTON_WIDTH / BUTTON_HEIGHT); the panel's position
   *  (PANEL_BOTTOM_PX / PANEL_RIGHT_PX), typography and
   *  colors are tunable just below too.
   *
   *  - THE BUTTON OWNS THE VOICE, NOT THE CONNECTION.
   *    Voice off tears down no network: the stream keeps
   *    announcing, the reconnect ladder keeps working, and
   *    turning voice back on is just the mic. What still lives
   *    on the ON tap is the FIRST connection - the tap is also
   *    the iOS gesture that unlocks mic, audio and (if needed)
   *    the token prompt.
   *  - PRACTICE SURVIVES THE VOICE BUTTON in both directions;
   *    the practice button is what ends it.
   *  - THE SETTINGS PANEL IS TWO SELECTS: how moves are
   *    spoken, and how your move is confirmed. Stored under
   *    audioplay.* keys in this origin's localStorage, which
   *    is fine for a cosmetic choice and would be wrong for
   *    the token (see GM_TOKEN_KEY for that reasoning).
   *  - THE LOG PANEL KEEPS ITS 'TOKEN' BUTTON - the
   *    userscript's one door to replacing a dead token - and
   *    the repaint gate (logPanelVisible).
   *================================================================*/

  var wrapEl, voiceBtn, logPanel, logBtn, practiceBtn, clockBtn,
      settingsBtn, setPanel;

  // ----- Color Pallette -----
  var BLACK = "#161512";      // panel + box background
  var MED_GRAY = "#404040";   // panel + box borders
  var LIGHT_GRAY = "#bbbbbb"; // secondary text (log body, heads)
  var OFF_WHITE = "#eaeaea";  // primary text
  var BLUE = "#3893E8";       // "Octopus Blue"
  var RED = "#f34335";        // recording color

  // ----- Typography -----
  var FONT_SIZE = "1.35em";   // every button label
  var FONT_ICON = "1.6rem";   // the voice button's ■/● only,
                              // slightly larger than the words

  // ----- Button colors -----
  var BTN_BG = BLACK;         // button background
  var BTN_TEXT = OFF_WHITE;   // button label text
  var BTN_ON_BG = BLUE;       // an ON button's fill
  var BTN_ON_TEXT = BLACK;    // an ON button's label
  var BTN_REC_BG = RED;       // the voice button's fill while
                              // recording is on - red, the
                              // universal recording color
  var BTN_REC_TEXT = OFF_WHITE; // circle glyph while recording

  // ----- Button parameters -----
  var BUTTON_WIDTH = 65;      // px - outer size (border-box)
  var BUTTON_HEIGHT = 33;     // px

  // ----- Control panel layout & geometry -----
  var PANEL_BOTTOM_PX = 0;   // from the bottom screen edge
  var PANEL_RIGHT_PX = 6;    // from the right screen edge
  var PANEL_RADIUS = 10;      // px - the panel box (and the
                              // settings box, same family)
  var BUTTON_RADIUS = 8;      // px - the buttons inside it
  var PANEL_PAD = 6;          // px - around and between buttons

  // ----- Border parameters -----
  function edgeBorder() {
    return "1px solid " + MED_GRAY;
  }

  // THE one look for a panel button. Fixed outer size
  // (border-box, so the border eats inwards and nothing in
  // the row shifts), label centered, colors from above.
  // fontSize is FONT_SIZE unless the caller says otherwise
  // (the voice button uses FONT_ICON).
  function panelBtnCss(fontSize) {
    return "appearance:none;-webkit-appearance:none;" +
      "box-sizing:border-box;" +
      "width:" + BUTTON_WIDTH + "px;" +
      "height:" + BUTTON_HEIGHT + "px;" +
      "display:flex;align-items:center;justify-content:center;" +
      "padding:0;line-height:1;white-space:nowrap;" +
      "font-size:" + (fontSize || FONT_SIZE) + ";" +
      "border-radius:" + BUTTON_RADIUS + "px;" +
      "background:" + BTN_BG + ";color:" + BTN_TEXT + ";" +
      "border:" + edgeBorder() + ";" +
      "touch-action:manipulation;" +
      "-webkit-user-select:none;user-select:none;";
  }

  // A lit button means that thing is currently ON: the
  // accent fill. Called from renderButton so every control
  // is repainted from one place.
  function paintButton(el, on) {
    if (!el) return;
    el.style.background = on ? BTN_ON_BG : BTN_BG;
    el.style.color = on ? BTN_ON_TEXT : BTN_TEXT;
  }

  function renderButton() {
    paintButton(practiceBtn, dryRun);
    paintButton(logBtn, !!(logPanel && logPanel.style.display !== "none"));
    paintButton(clockBtn, clockModeOn());
    paintButton(settingsBtn, !!(setPanel && setPanel.style.display !== "none"));
    if (!voiceBtn) return;
    // The voice button turns RED while recording is ON.
    if (!running) { voiceBtn.textContent = "■"; paintButton(voiceBtn, false); }
    else {
      voiceBtn.textContent = "●";
      voiceBtn.style.background = BTN_REC_BG;
      voiceBtn.style.color = BTN_REC_TEXT;
    }
  }

  function uiGameChanged() {
    renderButton();
  }

  // Built only when PRACTICE_MODE = true. practiceBtn stays null
  // otherwise, which every other reference already tolerates:
  // paintButton returns on a falsy element, and the button is the
  // only thing that ever sets dryRun true.
  function buildPracticeButton() {
    practiceBtn = document.createElement("button");
    practiceBtn.textContent = "pract";
    practiceBtn.style.cssText = panelBtnCss();
    practiceBtn.addEventListener("click", function () {
      wakeSpeech();
      primeChimes();   /* an AudioContext must be born in a gesture */
      setTimeout(loadVoices, 300);
      if (dryRun) {
        dryRun = false; running = false;
        pauseMic(); clearDialogue();
        log("DRY", "practice mode OFF");
        // dryStart took over the api state; hand it back and
        // pick the page's game up again if there is one - the
        // URL says which game. Guarded on the token so
        // leaving practice never raises a prompt.
        api.gameId = null; api.pos = null;
        api.moves = []; api.over = false;
        uiGameChanged();
        if (gameIdFromUrl() && storedToken()) connect();
      } else {
        // dryRun goes up FIRST so nothing in flight can
        // reconnect behind us, then dryStart owns the whole
        // teardown.
        dryRun = true; running = true;
        startListening();
        dryStart();
      }
      renderButton();
    });
  }

  /* THE SETTINGS PANEL: the two stored choices,
   * presented in a floating panel above the control panel.
   * Each flip is logged, so a pasted log says what the
   * device was set to and when it changed. */
  function settingRow(labelText, select) {
    var row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;" +
      "gap:14px;margin:6px 0;";
    var lab = document.createElement("div");
    lab.textContent = labelText;
    lab.style.cssText = "color:" + OFF_WHITE + ";font-size:13px;";
    select.style.cssText =
      "font-size:12px;padding:4px 6px;" +
      "border-radius:" + BUTTON_RADIUS + "px;" +
      "background:" + BLACK + ";color:" + BLUE + ";" +
      "border:" + edgeBorder() + ";";
    row.appendChild(lab);
    row.appendChild(select);
    setPanel.appendChild(row);
  }

  function makeSelect(pairs, value) {
    var s = document.createElement("select");
    pairs.forEach(function (p) {
      var o = document.createElement("option");
      o.value = p[0];
      o.textContent = p[1];
      s.appendChild(o);
    });
    s.value = value;
    return s;
  }

  function buildSettingsPanel() {
    setPanel = document.createElement("div");
    setPanel.style.cssText =
      "position:fixed;right:" + PANEL_RIGHT_PX + "px;bottom:118px;" +
      "z-index:99990;" +
      "display:none;background:" + BLACK + ";border:" + edgeBorder() +
      ";border-radius:" + PANEL_RADIUS + "px;padding:10px 12px;" +
      "min-width:230px;" +
      "box-shadow:0 4px 14px rgba(0,0,0,0.45);" +
      "font-family:-apple-system,system-ui,sans-serif;" +
      "-webkit-user-select:none;user-select:none;";

    var head = document.createElement("div");
    head.textContent = "settings";
    head.style.cssText =
      "color:" + LIGHT_GRAY + ";font-size:11px;letter-spacing:.08em;" +
      "text-transform:uppercase;margin:0 0 4px;";
    setPanel.appendChild(head);

    // loadStoredSettings has already run (userscript-boot), so
    // the selects show what storage says.
    var speech = makeSelect([["pieces", "Pieces"], ["squares", "Squares"]],
                            MOVE_SPEECH);
    speech.addEventListener("change", function () {
      if (speech.value === "pieces" || speech.value === "squares") {
        MOVE_SPEECH = speech.value;
      }
      try { localStorage.setItem(MOVE_SPEECH_KEY, MOVE_SPEECH); }
      catch (e) { log("ERR", "could not save move speech: " + e.message); }
      log("SET", "moves spoken " + MOVE_SPEECH);
    });
    settingRow("moves spoken", speech);

    var confirm = makeSelect([["chime-quiet", "Chime (quiet)"],
                              ["chime", "Chime"],
                              ["chime-loud", "Chime (loud)"],
                              ["voice", "Voice"],
                              ["none", "None"]], CONFIRM_MODE);
    confirm.addEventListener("change", function () {
      var picked = confirm.value;
      if (isConfirmMode(picked)) {
        CONFIRM_MODE = picked;
      }
      try { localStorage.setItem(CONFIRM_MODE_KEY, CONFIRM_MODE); }
      catch (e) { log("ERR", "could not save confirm: " + e.message); }
      log("SET", "confirm " + CONFIRM_MODE);
      // CHOOSING THE CHIME IS ITSELF A GESTURE, so it
      // wakes the context on the spot. AND THE PICK PLAYS THE
      // PICK: three loudnesses are only choosable by
      // ear, so a chime level auditions itself - only when
      // the context is already RUNNING (a cold context
      // resumes asynchronously, and a chime scheduled into it
      // now would be the schedule-vs-hear gap chimes.js is
      // about). No spoken fallback here: nothing was asked
      // and nothing is owed.
      if (CONFIRM_MODE.indexOf("chime") === 0) {
        primeChimes();
        if (picked === CONFIRM_MODE &&
            chimeCtx && chimeCtx.state === "running") {
          playConfirmChime();
        }
      }
    });
    settingRow("confirm", confirm);

    document.body.appendChild(setPanel);
  }

  function buildUI() {
    if (document.getElementById("voicemove-ui")) return;

    // THE PANEL ITSELF: a bordered box on the study
    // enhancer's pattern - black, one gray border around the
    // whole thing, rounded, softly shadowed. Position config:
    // PANEL_BOTTOM_PX / PANEL_RIGHT_PX above.
    wrapEl = document.createElement("div");
    wrapEl.id = "voicemove-ui";
    wrapEl.style.cssText =
      "position:fixed;right:" + PANEL_RIGHT_PX + "px;" +
      "bottom:" + PANEL_BOTTOM_PX + "px;z-index:99999;" +
      "display:flex;align-items:center;gap:" + PANEL_PAD + "px;" +
      "background:" + BLACK + ";border:" + edgeBorder() + ";" +
      "border-radius:" + PANEL_RADIUS + "px;" +
      "padding:" + PANEL_PAD + "px;" +
      "box-shadow:0 4px 14px rgba(0,0,0,0.45);" +
      "font-family:system-ui,-apple-system,sans-serif;" +
      "-webkit-user-select:none;user-select:none;";

    if (PRACTICE_MODE) buildPracticeButton();

    logBtn = document.createElement("button");
    logBtn.textContent = "log";
    logBtn.style.cssText = panelBtnCss();

    // THE VOICE BUTTON. The same size as every other button;
    // only its glyph is bigger (FONT_ICON). renderButton
    // owns its face: ■ off, ● recording.
    voiceBtn = document.createElement("button");
    voiceBtn.style.cssText = panelBtnCss(FONT_ICON);

    clockBtn = document.createElement("button");
    clockBtn.textContent = "clock";
    clockBtn.style.cssText = panelBtnCss();
    clockBtn.addEventListener("click", function () {
      toggleClockMode();
    });

    settingsBtn = document.createElement("button");
    settingsBtn.textContent = "set";
    settingsBtn.style.cssText = panelBtnCss();
    settingsBtn.addEventListener("click", function () {
      var open = setPanel.style.display !== "none";
      if (!open) {
        // anchor just above the panel (every button is one
        // height now, so any of them names the top edge)
        try {
          var top = voiceBtn.getBoundingClientRect().top;
          setPanel.style.bottom =
            Math.max(60, window.innerHeight - top + 8) + "px";
        } catch (e) {}
      }
      setPanel.style.display = open ? "none" : "block";
      renderButton();
    });

    buildSettingsPanel();

    if (practiceBtn) wrapEl.appendChild(practiceBtn);
    wrapEl.appendChild(logBtn);
    wrapEl.appendChild(clockBtn);
    wrapEl.appendChild(settingsBtn);
    wrapEl.appendChild(voiceBtn);
    document.body.appendChild(wrapEl);

    // PANEL POSITIONING IS A CLOSED CASE — leave this alone.
    // The panel is plain position:fixed, bottom/right. iOS
    // rubber-band overscroll can leave it sitting low until
    // the next real page interaction or reload; that is a
    // cosmetic iOS quirk and the accepted cost. Two fixes
    // were tried and REMOVED; do not reopen without a
    // fundamentally different approach.

    /* ---- debug panel ---- */

    logPanel = document.createElement("div");
    logPanel.style.cssText =
      "position:fixed;left:8px;right:8px;top:8px;bottom:110px;z-index:99998;" +
      "display:none;flex-direction:column;background:rgba(22,21,18,.97);" +
      "border:" + edgeBorder() + ";" +
      "border-radius:" + PANEL_RADIUS + "px;overflow:hidden;";
    var verLabel = document.createElement("div");
    verLabel.textContent = "Audioplay " + VERSION;
    verLabel.style.cssText =
      "color:" + BLUE + ";font-size:" + FONT_SIZE +
      ";padding:6px 4px;margin-left:auto;" +
      "font-family:system-ui,sans-serif;";

    var bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:8px;padding:8px;border-bottom:" + edgeBorder() + ";" +
      "font-family:system-ui,sans-serif;";
    // "token" is the one door to the stored token
    // (manageToken).
    ["token", "copy", "clear", "close"].forEach(function (name) {
      var b = document.createElement("button");
      b.textContent = name;
      // The one button style in the whole script - fixed
      // size, so the copy feedback below must fit it (glyphs,
      // not words).
      b.style.cssText = panelBtnCss();
      b.addEventListener("click", function () {
        if (name === "token") {
          manageToken();
          return;
        }
        if (name === "copy") {
          try {
            navigator.clipboard.writeText(LOG.join("\n"));
            b.textContent = "✓";
            setTimeout(function () { b.textContent = "copy"; }, 1200);
          } catch (e) {
            b.textContent = "✗";
            setTimeout(function () { b.textContent = "copy"; }, 1200);
          }
        } else if (name === "clear") { LOG.length = 0; logBody.textContent = ""; }
        else {
          logPanel.style.display = "none";
          logPanelVisible = false;
          renderButton();
        }
      });
      bar.appendChild(b);
    });
    bar.appendChild(verLabel);

    logBody = document.createElement("pre");
    logBody.style.cssText =
      "margin:0;padding:8px;flex:1;overflow:auto;color:" + LIGHT_GRAY +
      ";font-size:11px;" +
      "line-height:1.35;white-space:pre-wrap;word-break:break-word;" +
      "font-family:ui-monospace,Menlo,monospace;-webkit-overflow-scrolling:touch;";
    logBody.textContent = LOG.join("\n");
    logPanel.appendChild(bar);
    logPanel.appendChild(logBody);
    document.body.appendChild(logPanel);

    logBtn.addEventListener("click", function () {
      var open = logPanel.style.display !== "none";
      logPanel.style.display = open ? "none" : "flex";
      logPanelVisible = !open;
      if (!open) paintLog();
      renderButton();
    });

    voiceBtn.addEventListener("click", function () {
      wakeSpeech();
      primeChimes();   /* an AudioContext must be born in a gesture */
      setTimeout(loadVoices, 300);
      running = !running;
      if (running) {
        // practice survives the voice button in BOTH
        // directions; the practice button is what ends it.
        startListening();
        if (dryRun) speak("voice play on.");
        // THE FIRST TAP OF A GAME IS THE CONNECT: sign-in
        // does not exist here, so the connection belongs to
        // the first tap - which is also the gesture the
        // token prompt needs. Already connected to this
        // page's game, the tap is only the mic: ensureStream
        // restarts a stream only if it has actually gone
        // quiet.
        else if (api.gameId && api.gameId === gameIdFromUrl() && !api.over) {
          ensureStream();
        } else {
          connect();
        }
      } else {
        // VOICE OFF TEARS DOWN NO NETWORK: listening and
        // being connected are
        // different things. The stream keeps announcing; the
        // page-watcher in userscript-boot is what tears down,
        // when the game page itself goes away.
        pauseMic();
        clearDialogue();
        // nothing spoken: the button's own state is the
        // signal, and the user just pressed it. Speaking
        // after being switched off is the wrong last word
        // from a thing that has been told to stop.
        log(" UI", "voice play off.");
      }
      renderButton();
    });
    renderButton();
    log(" UI", "ready.");
  }
  /*========= EMBEDDED CHESS RULES / LEGAL MOVE GENERATOR ==========*/

  /* FROZEN. Verified by perft: startpos depth 4 = 197281,
   * Kiwipete depth 3 = 97862. Re-run both after ANY edit here.
   * Nothing in this section may evaluate, score, search, or
   * recommend: it knows only which moves are LEGAL and what
   * they are CALLED. */

  /* Minimal self-contained chess RULES (0x88 board). No dependencies.
   * This knows which moves are LEGAL and what they are CALLED. It
   * does not evaluate, score, search, or recommend anything.
   *
   * Position(startFen?) with .legalMoves, .applyUci, .findUci,
   * .sanOf, .uciOf, .apply, .clone, .load, .inCheck, .turn.
   */
  function makeRules() {
    "use strict";

    var FILES = "abcdefgh";
    var KNIGHT = [33, 31, 18, 14, -33, -31, -18, -14];
    var BISHOP = [17, 15, -17, -15];
    var ROOK = [16, 1, -16, -1];
    var ROYAL = [17, 16, 15, 1, -17, -16, -15, -1];

    /* the two slider families, built once so attacked() does
     * not allocate two arrays per call purely to read them
     * twice. */
    var BISHOPQ = ["b", "q"], ROOKQ = ["r", "q"];

    /* Does a slider of one of `types` sit on a clear ray from
     * `sq`? Lifted out of attacked(), the hottest predicate in
     * the program: a closure declared inside it would allocate
     * a new function object on every call - and attacked() is
     * called at least once per pseudo-move, which is once per
     * clone, which is a million times in a perft.
     */
    function raySees(b, sq, by, dirs, types) {
      for (var m = 0; m < dirs.length; m++) {
        var d = dirs[m], i = sq + d;
        while ((i & 0x88) === 0) {
          var p = b[i];
          if (p) {
            if (colorOf(p) === by && types.indexOf(typeOf(p)) >= 0) return true;
            break;
          }
          i += d;
        }
      }
      return false;
    }

    function sqName(i) { return FILES[i & 15] + ((i >> 4) + 1); }
    function nameSq(s) { return (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97); }
    function isWhite(p) { return p && p === p.toUpperCase(); }
    function colorOf(p) { return isWhite(p) ? "w" : "b"; }
    function typeOf(p) { return p ? p.toLowerCase() : null; }
    function onBoard(i) { return (i & 0x88) === 0; }

    var START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    function Position(fen) {
      this.board = new Array(128).fill(null);
      this.turn = "w";
      this.castle = { K: false, Q: false, k: false, q: false };
      this.ep = -1;
      this.half = 0;
      this.full = 1;
      this.load(fen || START);
    }

    Position.prototype.load = function (fen) {
      var parts = fen.trim().split(/\s+/);
      this.board = new Array(128).fill(null);
      var rows = parts[0].split("/");
      for (var r = 0; r < 8; r++) {
        var i = (7 - r) * 16, row = rows[r];
        for (var k = 0; k < row.length; k++) {
          var c = row[k];
          if (/[1-8]/.test(c)) i += parseInt(c, 10);
          else { this.board[i] = c; i++; }
        }
      }
      this.turn = parts[1] === "b" ? "b" : "w";
      var cs = parts[2] || "-";
      this.castle = {
        K: cs.indexOf("K") >= 0, Q: cs.indexOf("Q") >= 0,
        k: cs.indexOf("k") >= 0, q: cs.indexOf("q") >= 0
      };
      this.ep = (parts[3] && parts[3] !== "-") ? nameSq(parts[3]) : -1;
      this.half = parseInt(parts[4] || "0", 10);
      this.full = parseInt(parts[5] || "1", 10);
    };

    /* THE HOTTEST FUNCTION IN THE FILE. legalMoves clones once
     * per pseudo-move to test the king - about 35 times per
     * position, and perft alone does it a million times - so
     * this must not go through new Position(START), which
     * fills a 128-slot array and then parses the start FEN
     * character by character only to be overwritten.
     * Object.create skips the constructor entirely; the fields
     * are all assigned here anyway, so nothing is left
     * undefined. */
    Position.prototype.clone = function () {
      var p = Object.create(Position.prototype);
      p.board = this.board.slice();
      p.turn = this.turn;
      p.castle = { K: this.castle.K, Q: this.castle.Q, k: this.castle.k, q: this.castle.q };
      p.ep = this.ep; p.half = this.half; p.full = this.full;
      return p;
    };

    Position.prototype.kingSq = function (color) {
      var want = color === "w" ? "K" : "k";
      for (var i = 0; i < 128; i++) {
        if (!onBoard(i)) { i += 7; continue; }
        if (this.board[i] === want) return i;
      }
      return -1;
    };

    /* is square `sq` attacked by side `by` */
    Position.prototype.attacked = function (sq, by) {
      var b = this.board, i, j, p;
      /* pawns */
      var pd = by === "w" ? [-17, -15] : [17, 15];
      for (j = 0; j < 2; j++) {
        i = sq + pd[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "p" && colorOf(p) === by) return true; }
      }
      /* knights */
      for (j = 0; j < 8; j++) {
        i = sq + KNIGHT[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "n" && colorOf(p) === by) return true; }
      }
      /* king */
      for (j = 0; j < 8; j++) {
        i = sq + ROYAL[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "k" && colorOf(p) === by) return true; }
      }
      /* sliders - see raySees */
      if (raySees(b, sq, by, BISHOP, BISHOPQ)) return true;
      if (raySees(b, sq, by, ROOK, ROOKQ)) return true;
      return false;
    };

    Position.prototype.inCheck = function (color) {
      var c = color || this.turn;
      var k = this.kingSq(c);
      if (k < 0) return false;
      return this.attacked(k, c === "w" ? "b" : "w");
    };

    /* pseudo-legal move objects:
     * {from,to,piece,color,captured,promotion,flags} */
    Position.prototype.pseudoMoves = function () {
      var out = [], b = this.board, us = this.turn, them = us === "w" ? "b" : "w";

      function add(from, to, extra) {
        var m = {
          from: from, to: to,
          piece: typeOf(b[from]), color: us,
          captured: b[to] ? typeOf(b[to]) : null,
          promotion: null, flags: ""
        };
        if (extra) for (var k in extra) m[k] = extra[k];
        if (m.captured) m.flags += "c";
        out.push(m);
      }

      for (var from = 0; from < 128; from++) {
        if (!onBoard(from)) { from += 7; continue; }
        var pc = b[from];
        if (!pc || colorOf(pc) !== us) continue;
        var t = typeOf(pc), to, d, j;

        if (t === "p") {
          var fwd = us === "w" ? 16 : -16;
          var startRank = us === "w" ? 1 : 6;
          var lastRank = us === "w" ? 7 : 0;
          to = from + fwd;
          if (onBoard(to) && !b[to]) {
            if ((to >> 4) === lastRank) {
              ["q", "r", "b", "n"].forEach(function (pr) {
                add(from, to, { promotion: pr, flags: "p" });
              });
            } else {
              add(from, to, {});
              var dbl = from + 2 * fwd;
              if ((from >> 4) === startRank && !b[dbl]) add(from, dbl, { flags: "b" });
            }
          }
          var caps = us === "w" ? [17, 15] : [-17, -15];
          for (j = 0; j < 2; j++) {
            to = from + caps[j];
            if (!onBoard(to)) continue;
            if (b[to] && colorOf(b[to]) === them) {
              if ((to >> 4) === lastRank) {
                ["q", "r", "b", "n"].forEach(function (pr) {
                  add(from, to, { promotion: pr, flags: "p" });
                });
              } else add(from, to, {});
            } else if (to === this.ep) {
              out.push({
                from: from, to: to, piece: "p", color: us,
                captured: "p", promotion: null, flags: "ce"
              });
            }
          }
          continue;
        }

        if (t === "n" || t === "k") {
          var offs = t === "n" ? KNIGHT : ROYAL;
          for (j = 0; j < 8; j++) {
            to = from + offs[j];
            if (!onBoard(to)) continue;
            if (b[to] && colorOf(b[to]) === us) continue;
            add(from, to, {});
          }
          continue;
        }

        var dirs = t === "b" ? BISHOP : t === "r" ? ROOK : ROYAL;
        for (j = 0; j < dirs.length; j++) {
          d = dirs[j]; to = from + d;
          while (onBoard(to)) {
            if (!b[to]) { add(from, to, {}); }
            else {
              if (colorOf(b[to]) === them) add(from, to, {});
              break;
            }
            to += d;
          }
        }
      }

      /* castling */
      var kSq = us === "w" ? nameSq("e1") : nameSq("e8");
      var kRight = us === "w" ? this.castle.K : this.castle.k;
      var qRight = us === "w" ? this.castle.Q : this.castle.q;
      var king = b[kSq];
      if (king && typeOf(king) === "k" && colorOf(king) === us && !this.inCheck(us)) {
        if (kRight && !b[kSq + 1] && !b[kSq + 2] &&
            !this.attacked(kSq + 1, them) && !this.attacked(kSq + 2, them)) {
          out.push({ from: kSq, to: kSq + 2, piece: "k", color: us,
                     captured: null, promotion: null, flags: "k" });
        }
        if (qRight && !b[kSq - 1] && !b[kSq - 2] && !b[kSq - 3] &&
            !this.attacked(kSq - 1, them) && !this.attacked(kSq - 2, them)) {
          out.push({ from: kSq, to: kSq - 2, piece: "k", color: us,
                     captured: null, promotion: null, flags: "q" });
        }
      }
      return out;
    };

    /* mutate in place; assumes move is pseudo-legal for current turn
     */
    Position.prototype.apply = function (m) {
      var b = this.board, us = this.turn;
      b[m.to] = m.promotion ? (us === "w" ? m.promotion.toUpperCase() : m.promotion)
                            : b[m.from];
      b[m.from] = null;

      if (m.flags.indexOf("e") >= 0) {
        b[m.to + (us === "w" ? -16 : 16)] = null;
      }
      if (m.flags.indexOf("k") >= 0) {
        b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null;
      }
      if (m.flags.indexOf("q") >= 0) {
        b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null;
      }

      /* castling rights */
      if (m.piece === "k") {
        if (us === "w") { this.castle.K = this.castle.Q = false; }
        else { this.castle.k = this.castle.q = false; }
      }
      var h1 = nameSq("h1"), a1 = nameSq("a1"), h8 = nameSq("h8"), a8 = nameSq("a8");
      if (m.from === h1 || m.to === h1) this.castle.K = false;
      if (m.from === a1 || m.to === a1) this.castle.Q = false;
      if (m.from === h8 || m.to === h8) this.castle.k = false;
      if (m.from === a8 || m.to === a8) this.castle.q = false;

      /* ep square */
      this.ep = (m.flags.indexOf("b") >= 0)
        ? m.from + (us === "w" ? 16 : -16) : -1;

      this.half = (m.piece === "p" || m.captured) ? 0 : this.half + 1;
      if (us === "b") this.full++;
      this.turn = us === "w" ? "b" : "w";
    };

    Position.prototype.legalMoves = function () {
      var self = this, out = [];
      this.pseudoMoves().forEach(function (m) {
        var p = self.clone();
        p.apply(m);
        if (!p.inCheck(m.color)) out.push(m);
      });
      return out;
    };

    Position.prototype.uciOf = function (m) {
      return sqName(m.from) + sqName(m.to) + (m.promotion || "");
    };

    /* SAN with disambiguation and check/mate suffix */
    Position.prototype.sanOf = function (m, legalList) {
      var legal = legalList || this.legalMoves();
      var san;
      if (m.flags.indexOf("k") >= 0) san = "O-O";
      else if (m.flags.indexOf("q") >= 0) san = "O-O-O";
      else {
        var s = "";
        if (m.piece !== "p") {
          s += m.piece.toUpperCase();
          var same = legal.filter(function (o) {
            return o.piece === m.piece && o.to === m.to && o.from !== m.from;
          });
          if (same.length) {
            var sameFile = same.some(function (o) { return (o.from & 15) === (m.from & 15); });
            var sameRank = same.some(function (o) { return (o.from >> 4) === (m.from >> 4); });
            if (!sameFile) s += FILES[m.from & 15];
            else if (!sameRank) s += String((m.from >> 4) + 1);
            else s += sqName(m.from);
          }
        } else if (m.captured) {
          s += FILES[m.from & 15];
        }
        if (m.captured) s += "x";
        s += sqName(m.to);
        if (m.promotion) s += "=" + m.promotion.toUpperCase();
        san = s;
      }
      var after = this.clone();
      after.apply(m);
      if (after.inCheck(after.turn)) {
        san += after.legalMoves().length ? "+" : "#";
      }
      return san;
    };

    /* legalList is optional and is passed by anything that has
     * already generated one - see applyUci. */
    Position.prototype.findUci = function (uci, legalList) {
      var moves = legalList || this.legalMoves();
      for (var i = 0; i < moves.length; i++) {
        if (this.uciOf(moves[i]) === uci) return moves[i];
      }
      /* lichess sends castling as e1g1; some sources use e1h1
       * (chess960 style) */
      for (i = 0; i < moves.length; i++) {
        var m = moves[i];
        if (m.piece === "k" && m.flags.indexOf("k") >= 0 &&
            uci === sqName(m.from) + sqName(m.to + 1)) return m;
        if (m.piece === "k" && m.flags.indexOf("q") >= 0 &&
            uci === sqName(m.from) + sqName(m.to - 2)) return m;
      }
      return null;
    };

    Position.prototype.applyUci = function (uci) {
      /* ONE LIST, USED TWICE. Generating the legal moves is
       * the expensive step, and every move replayed from the
       * stream comes through here - which is how the board is
       * rebuilt after any reconnect - so findUci and sanOf
       * share one list. */
      var moves = this.legalMoves();
      var m = this.findUci(uci, moves);
      if (!m) return null;
      var san = this.sanOf(m, moves);
      this.apply(m);
      return { move: m, san: san };
    };

    Position.prototype.isGameOver = function () {
      return this.legalMoves().length === 0;
    };

    return {
      Position: Position,
      sqName: sqName,
      nameSq: nameSq,
      START: START
    };
  }

  /* ========================= CLOCK MODE ======================== */

  // A full-screen, pure black overlay showing the two
  // clocks, SIDE BY SIDE, AND NOTHING ELSE:
  // yours on the side set by PLAYER_ON_LEFT_OF_CLOCK,
  // theirs on the other, the side to move drawn HEAVIER
  // (weight, not brightness; red still
  // means under a minute). On an OLED panel black pixels
  // are OFF, so in a dark room the display reduces to two
  // faint numbers. Everything else — the mic, speech, the
  // game — runs on underneath: this whole section is only
  // a second renderer over state the script already keeps
  // (remainingMs, api.pos.turn), and it touches nothing
  // outside itself.
  //
  // TEXT ON THIS SCREEN IS A CLOSED CASE. On-screen text
  // pulls the eyes off the physical board, which is the
  // exact motion this program exists to remove; real games
  // settled it. The voice is the one channel, and this
  // screen is numbers. If text is ever argued back, argue
  // with that sentence first.
  //
  // In: the "clock" button, and ONLY the button.
  // Out: tap anywhere on it.
  //
  // THIS FILE PAINTS FROM CODE. The stylesheet owns what a
  // state looks like and the code only says which state is
  // current. Here the whole overlay is built from cssText
  // and its colours are set on the elements: red under a
  // minute, dim for the side not to move. It is left that
  // way ON PURPOSE and the reason is worth stating, because
  // an undocumented exception is indistinguishable from an
  // oversight.
  //
  //   - the overlay is a SECOND RENDERER. It shares no markup
  //     with the page, sits outside .panel, and is created and
  //     destroyed whole, so there is no stylesheet cascade
  //     here to be the single source of anything.
  //   - it is the screen the owner READS at a glance across a
  //     room, and the sizes and colours in it were tuned on
  //     the device by eye. Moving them into the stylesheet
  //     cannot be verified by the harness and would need a
  //     real game to confirm - a bad trade for tidiness.
  //
  // If this overlay is ever rebuilt, move it to classes then.
  // Do not do it as a drive-by.
  //
  // A screen wake lock is held while the overlay is up, so
  // the iPad does not sleep into the lock screen mid-game.
  // iOS silently drops the lock whenever the app is
  // backgrounded; the visibilitychange listener retakes it
  // when the page returns. With the screen on, none of the
  // screen-off restrictions (mic restarts, audio loss)
  // apply, so this is also the script's most stable
  // operating state.

  var clockOverlay = null, clockTimer = null, clockLock = null;
  var clockHalves = null;

  function clockModeOn() {
    return !!(clockOverlay && clockOverlay.style.display !== "none");
  }

  // One number only: ticking seconds draw the eye, so above
  // a minute just the whole minutes remain, changing once a
  // minute — and under a minute the number becomes the
  // seconds and the number turns red (LOW_TIME_COLOR). The
  // voice can say the same reading ON DEMAND — "clock" or
  // "time", speakClockTimes below — in these same units;
  // nothing speaks it unprompted.
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
    // the halves are LEFT and RIGHT. Which one is
    // yours is PLAYER_ON_LEFT_OF_CLOCK, read at paint time,
    // so "flip clock" is a repaint and never a rebuild.
    ["left", "right"].forEach(function (k) {
      var half = document.createElement("div");
      half.style.cssText =
        "flex:1;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;";
      // weight is set by paintClockHalf every tick (it is
      // the turn signal), so the value here is only
      // what shows for the instant before the first paint
      var time = document.createElement("div");
      time.style.cssText =
        "font-family:system-ui,sans-serif;font-weight:" +
        IDLE_WEIGHT + ";white-space:nowrap;" +
        "line-height:1;font-size:" + bareDigitSizeCss() +
        ";font-variant-numeric:tabular-nums;";
      half.appendChild(time);
      clockOverlay.appendChild(half);
      clockHalves[k] = { time: time, col: null, wt: null };
    });
    clockOverlay.addEventListener("click", function () {
      exitClockMode(true);
    });
    document.body.appendChild(clockOverlay);
  }

  // The size the bare digits may have, for the widest
  // reading seen so far this session. Monotonic: the
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

  function paintClockHalf(h, color) {
    var ms = remainingMs(color);
    var digits = clockDigits(ms);
    var active = api.pos && !api.over && api.pos.turn === color;
    // one color for everything; red is the only
    // exception and means "under a minute". The turn is
    // carried by weight alone, so low-and-waiting reads
    // both facts at once.
    var col = ms != null && ms < 60000 ? LOW_TIME_COLOR : TEXT_COLOR;
    // the clock alone carries the turn
    var wt = active ? ACTIVE_WEIGHT : IDLE_WEIGHT;
    if (h.time.textContent !== digits) {
      h.time.textContent = digits;
      if (noteClockDigits(digits)) {
        var css = bareDigitSizeCss();
        clockHalves.left.time.style.fontSize = css;
        clockHalves.right.time.style.fontSize = css;
      }
    }
    if (h.col !== col) {
      h.col = col;
      h.time.style.color = col;
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
  // OVERLAY_TICK_MS, so the overlay is never disturbed —
  // which matters, because it cannot be retaken without
  // another tap. CONFIRMED in use.
  // AND IT SAYS WHICH SIDE. A silent repaint is fine while
  // you are looking at the overlay - and "flip clock" is a
  // VOICE command, reachable with the overlay down, where
  // the repaint is invisible and nothing else happens at
  // all. That is constraint 5: silence reads as "not heard",
  // so the user says it again, and flips it back.
  //
  // It answers with the new state rather than "flipped",
  // because a confirmation has to carry information to earn
  // its airtime.
  function flipClockSides() {
    PLAYER_ON_LEFT_OF_CLOCK = !PLAYER_ON_LEFT_OF_CLOCK;
    var side = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
    log("CLK", "my clock now on the " + side);
    renderClockMode();
    speak("your clock on the " + side + ".");
  }

  // THE SPOKEN CLOCK. "clock" or "time", said alone, answers
  // with both times, the player's own color FIRST - the
  // number the asker almost always wants - in the overlay's
  // own units: whole minutes, floored, exactly as the screen
  // shows them, and the seconds once a side is under a
  // minute. ON DEMAND ONLY: nothing here fires unprompted,
  // and there is deliberately no low-time alert.
  function spokenClockReading(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + (s === 1 ? " second" : " seconds");
    var m = Math.floor(s / 60);
    return m + (m === 1 ? " minute" : " minutes");
  }

  function speakClockTimes() {
    var mine = api.myColor || "w";
    var theirs = mine === "w" ? "b" : "w";
    var myMs = remainingMs(mine), oppMs = remainingMs(theirs);
    // no game, or a game without clocks (correspondence):
    // the refusal is said, not implied
    if (myMs == null || oppMs == null) {
      speak("no clock running.");
      return;
    }
    speak(colorWord(mine) + " " + spokenClockReading(myMs) + ", " +
          colorWord(theirs) + " " + spokenClockReading(oppMs) + ".");
  }

  function acquireClockLock() {
    try {
      if (!navigator.wakeLock || !navigator.wakeLock.request) {
        log("CLK", "wake lock unsupported");
        return;
      }
      navigator.wakeLock.request("screen").then(function (lock) {
        // THE REQUEST CAN OUTLIVE THE MODE. Enter, tap
        // straight out, and this promise resolves with the
        // overlay already down: release() found null and did
        // nothing, then the lock landed here - held forever,
        // screen never sleeping. Worse, the next enter
        // OVERWROTE the sentinel and orphaned it. If the mode
        // is gone, let the lock go; if one is somehow already
        // held, release it before taking this one.
        if (!clockModeOn()) {
          try { lock.release(); } catch (e) {}
          log("CLK", "wake lock arrived after exit - released");
          return;
        }
        if (clockLock && clockLock !== lock) {
          try { clockLock.release(); } catch (e) {}
        }
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

  // NO FULLSCREEN. The overlay fills the viewport under
  // Safari's toolbar. Requesting fullscreen for a black
  // edge-to-edge screen costs layout-viewport corruption on
  // every EXIT, curable only by force-quitting Safari.
  // Losing the toolbar's strip of screen is the cheaper
  // trade. Tapping the overlay exits.
  function enterClockMode() {
    if (!clockOverlay) buildClockOverlay();
    clockOverlay.style.display = "flex";
    renderClockMode();
    clearInterval(clockTimer);
    clockTimer = setInterval(renderClockMode, OVERLAY_TICK_MS);
    acquireClockLock();
    renderButton();
    log("CLK", "clock mode on");
  }

  function exitClockMode(byTap) {
    if (!clockModeOn()) return;
    clockOverlay.style.display = "none";
    clearInterval(clockTimer);
    clockTimer = null;
    releaseClockLock();
    renderButton();
    log("CLK", "clock mode off" + (byTap ? " (tap)" : ""));
  }

  function toggleClockMode() {
    if (clockModeOn()) exitClockMode(false);
    else enterClockMode();
  }

  /*======================= BOOT ======================*/

  var booted = false, lastPath = "";

  /* Any one of these means "a game is on screen". Several are
   * tried because Lichess changes markup, and because
   * phone/tablet layouts and zen mode render different
   * subsets. Zen mode hides things with CSS, so the elements
   * still exist either way. */
  var PAGE_MARKERS = [".round__app", "main.round", "cg-board",
                      ".cg-wrap", "#main-wrap .round",
                      "main .rclock"];

  function gamePageMarker() {
    for (var i = 0; i < PAGE_MARKERS.length; i++) {
      if (document.querySelector(PAGE_MARKERS[i])) return PAGE_MARKERS[i];
    }
    return null;
  }

  // The boot line says what this build has switched on, so a
  // pasted log names its configuration (the flips are logged;
  // the starting state is named here).
  function settingsSummary() {
    return "moves=" + MOVE_SPEECH +
           " confirm=" + CONFIRM_MODE +
           (VOICE_NAME ? " voice=" + VOICE_NAME : " voice=system");
  }

  function tick() {
    var path = location.pathname;
    var isGame = !!gameIdFromUrl() && !!gamePageMarker();
    if (isGame && !booted) {
      booted = true;
      lastPath = path;
      buildUI();
      log(" UI", "game page detected via " + gamePageMarker());
    } else if (isGame && booted && path !== lastPath) {
      lastPath = path;
      log(" UI", "navigated to " + path);
      // A NEW GAME PAGE IS A NEW GAME. Practice is left
      // alone - it is not this page's game, and the practice
      // button is what ends it. Otherwise: reconnect if
      // the user had engaged - voice on, or a connection
      // already made. Never on a cold path change, because
      // connect() may raise the token prompt and a prompt
      // needs a tap behind it.
      if (!dryRun) {
        var wasConnected = !!api.gameId && api.gameId !== "PRACTICE";
        api.myColor = null; api.pos = null; api.moves = [];
        api.movesBefore = 0; api.over = false;
        if (running || wasConnected) connect();
      }
    } else if (!isGame && booted) {
      booted = false;
      running = false;
      if (dryRun) {
        // leaving the page ends practice too: its button is
        // gone with the UI, and a half-state with dryRun up
        // and no way to see it must not exist.
        dryRun = false;
        log("DRY", "practice mode OFF (left the game page)");
      }
      // the overlay is position:fixed over everything, so
      // leaving the game page with it up left a black
      // screen on whatever came next, with the wake lock
      // still held. Exiting here takes both down; byTap
      // is passed so nothing is spoken about it.
      exitClockMode(true);
      pauseMic();
      clearDialogue();
      clearTimeout(reconnectTimer);
      stopPolling();
      try { if (streamAbort) streamAbort.abort(); } catch (e) {}
      api.gameId = null; api.pos = null; api.moves = [];
      api.over = false;
      var ui = document.getElementById("voicemove-ui");
      if (ui) ui.remove();
      if (setPanel) { try { setPanel.remove(); } catch (e) {} setPanel = null; }
      if (logPanel) logPanel.remove();
      logBody = null;
      logPanelVisible = false;
    }
  }

  var mo = new MutationObserver(function () { tick(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1000);
  scrubDeadStorage();   /* deletes any stranded pre-extension
                           localStorage token */
  loadStoredSettings(); /* before any buildUI: the selects and the
                           first announcement read these */
  declareAudioSession();
  startStallWatch();
  loadStoredToken();    /* async (GM storage); cached by the time
                           a human can reach the button */
  tick();
  log(" UI", "script loaded " + VERSION);
  log("SET", "loaded: " + settingsSummary());
})();
