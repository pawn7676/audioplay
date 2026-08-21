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

  /*------------- THE SETTINGS PANEL IS GONE (w117) -----------
   * v124 built it: a "settings" button, a panel of switches,
   * values persisted under "audioplay.settings", and this
   * file holding only first-run defaults. It shrank for two
   * years as choices became rules - ten rows to three at
   * w110, three to one at w116, when confirming every move
   * stopped being optional and took "confirm my move" and
   * "guard pawn pushes" with it (a system that can post a
   * silently wrong move once does not get to decide which
   * moves deserve a question, and after the yes nothing is
   * repeated - the chime answers it). With one row left the
   * owner called the whole apparatus not needed, and he was
   * right: a panel, a persistence layer and a stored blob,
   * all to flip one cosmetic bit.
   *
   * So settings are CODE again, like VOICE_NAME below always
   * was: constants in this file, edited here, no storage.
   * The stored blob is a dead key now and scrubDeadStorage
   * removes it. The dead switch names stay barred - if any
   * of confirmMyMove, readBackMine, confirmMine or
   * guardPawnPushes ever reads from anywhere again, some
   * old save's false is steering behaviour that stopped
   * being a choice.
   *
   * What the panel-era tombstones guarded is now one line
   * each, and the reasoning lives where it acts:
   *   the move grammar     parsing.js (four items, w118)
   *   the chime           chimes.js (three acts)
   *   clock-mode text     w110 HISTORY entry; strip in git
   *                       at w109
   *
   * AND A SETTINGS BUTTON RETURNED AT w120 - the owner's
   * order, both times. w117 killed a panel that had shrunk
   * to one cosmetic switch; w120 added a second choice (how
   * moves are spoken, below) and the owner wanted both on
   * the page, not in the source. What returned is smaller
   * than what died: a plain row in the page (#settingsRow,
   * wired by wireSettings in ui.js) and one flat
   * audioplay.* key per choice, the w111 naming scheme.
   * The blob stays dead: audioplay.settings is still
   * scrubbed on boot, and the four barred switch names
   * above stay barred.
   *------------------------------------------------------*/

  // (SHOW_RATINGS is GONE at w138, and this time for good:
  // a code constant w117-w119, a stored Settings-row choice
  // w120-w137, and the owner's own trim of the userscript
  // dropped it - a rating is a number he stopped wanting to
  // see, and a switch nobody flips is apparatus. The names
  // still show beside the board; the rating never does. The
  // stored key is dead and scrubDeadStorage removes it.)

  // HOW A MOVE IS ANNOUNCED (w120, owner's design; two-way
  // since w126) - the Settings row's other choice. Named for
  // WHAT IS ANNOUNCED, because both styles speak NATO files:
  //   pieces   "bishop charlie 4" - the piece and where it
  //            landed; what every game before w120 spoke,
  //            and the default
  //   squares  "foxtrot 1, charlie 4" - the move's own two
  //            squares, from then to: exactly the four-item
  //            shape the grammar asks the USER to speak
  //            (parsing.js), so the page and the player use
  //            one language
  // A third style, chess ("bishop C 4"), lived w120-w125 and
  // was DELETED at w126: the owner could not hear bare file
  // letters clearly from any spelling - four listens chased
  // A, G, and E through the respelling table (see forTheEar,
  // speech-out.js) - and a style whose letters cannot be
  // heard is not a style. The old stored values (hybrid,
  // nato, chess) read as junk below and fall back to the
  // default: one re-pick, no migration shim, the w111 way.
  // moveToSpeech in speech-out.js is the one consumer.
  var MOVE_SPEECH = "pieces";
  var MOVE_SPEECH_KEY = "audioplay.movespeech";

  // HOW AN ACCEPTED MOVE IS CONFIRMED (w131, owner's request)
  // - the Settings row's third choice. The signal itself is
  // one bit ("heard exactly, legal, played" - confirmFeedback,
  // dialogue.js); this picks what carries it:
  //   chime-quiet, chime, chime-loud
  //           two rising notes (chimes.js) at one of three
  //           loudnesses - one axis folded into the other
  //           (w137, owner's design) rather than a volume
  //           control of its own, because the only chime
  //           question is "what plays, and how loud" and
  //           one select asks all of it. "chime" is the
  //           middle loudness and the default, and keeps its
  //           w131 stored value so no saved choice moves.
  //           All three fall back to a spoken "okay." when
  //           no chime can even be scheduled.
  //   voice   the move read back whole (moveToSpeech), for
  //           ears the chime has gone missing on - it is
  //           speech, so it is never silently lost
  //   none    nothing on success. An explicit waiver of
  //           rule 5 by the one person it protects; errors
  //           still speak. Silence is THIS choice, never a
  //           volume of zero - a chime "played" at nothing
  //           is the inaudible-success bug (chimes.js) made
  //           configurable.
  var CONFIRM_MODE = "chime";
  var CONFIRM_MODE_KEY = "audioplay.confirm";

  function isConfirmMode(v) {
    return v === "chime" || v === "chime-quiet" ||
           v === "chime-loud" || v === "voice" || v === "none";
  }

  // Loaded on boot, before the page builds, so the selects
  // and the first announcement both agree with storage. Junk
  // or a missing key reads as the default - the rated
  // dropdown's rule (w99): storage must never quietly change
  // behaviour.
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

  /* THE STORAGE AUDIT (w111, owner's request): every key
   * this program keeps is named audioplay.<what it is> -
   * token, verifier, panels, opponent, rated, timecontrol,
   * since w120 movespeech, and since w131 confirm -
   * and storage holds NOTHING else of ours. This list is
   * every name a previous era wrote on this origin, removed
   * on boot so no dead key sits behind the program to
   * puzzle over in twenty versions:
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
   *                             from the userscript
   *   audioplay.settings        the panel's blob, v124-w116;
   *                             the panel died at w117 and
   *                             settings are code constants
   *                             again
   *   audioplay.ratings         the Show-ratings choice,
   *                             w120-w137; the setting died
   *                             at w138 (see the tombstone
   *                             above)
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
                "audioplay.web.timecontrol",
                "audioplay.settings",
                "audioplay.ratings"];
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

  // (GUARD_PAWN_PUSHES and CONFIRM_ALL_MOVES lived here as
  // constants until v128, as panel toggles until w110/w116,
  // and are gone - see the panel tombstone above.)

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
  // (GAP_ITEM_MS lived here for one version, w123, and is
  // GONE at w124 with the whole chess-item-gap experiment -
  // the tombstone is in speech-out.js, at sanToSpeech.)

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
  // w110 - see the w110 HISTORY entry. The digits below
  // are all the overlay draws now.)

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
  // is why "flip" flips it live instead of this being
  // a constant you must reload to change.
  var PLAYER_ON_LEFT_OF_CLOCK = true;

