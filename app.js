/*  audioplay-web — app.js
 *  THIS HEADER IS THE PROJECT'S FRONT DOOR. Every other
 *  file's header points here. The comments ARE the
 *  handoff — there is no separate document, a decision
 *  made at userscript v90 and kept: a second source of
 *  truth needed syncing on every change, so it was folded
 *  into the code it described.
 *
 *  WHAT THIS IS
 *  Eyes-free voice chess on Lichess, as a plain website.
 *  The third chapter of the project: BoardEye read a real
 *  board with a camera; the Lichess Audioplay userscript
 *  (v104, where this code comes from) played by voice but
 *  demanded the Userscripts app, which kept the audience
 *  to people who know what a userscript is. This site is
 *  the same voice pipeline with the barrier removed: open
 *  the page, tap "Sign in with Lichess", approve once,
 *  play. No token to create, nothing to install. Hosted
 *  on GitHub Pages — it is static files, which is the
 *  whole trick: the OAuth PKCE flow runs in the browser,
 *  so no server exists anywhere in this project.
 *
 *  WHO THIS IS FOR
 *  THE WEBSITE WIDENED THE AUDIENCE, and that is the
 *  point of it. The userscript was built for one user,
 *  one board: he plays WITHOUT READING GLASSES, at a real
 *  board, standing, with a 13-inch iPad across the room.
 *  That fact still explains most of the display decisions
 *  in modes.js and should not be undone — it is why the
 *  clocks are enormous, why weight carries the turn, why
 *  anything that must be acted on is SPOKEN.
 *
 *  But the site is opened by whoever finds it, on
 *  whatever they own. So: NO CODE HERE MAY ASSUME AN
 *  IPAD, or Safari, or a US English voice. w4 shipped a
 *  six-name voice list chosen by ear on the owner's own
 *  iPad, and on Windows or Android it offered nothing at
 *  all — the exact mistake to watch for. Platform
 *  findings stay written down (the iOS ones in speech.js
 *  are real and hard-won), but they are handled as
 *  conditions to detect, never as the shape of the world.
 *
 *  THE FILE MAP (load order in index.html)
 *    rules.js    section 13, FROZEN, perft-verified.
 *                Changes least. Never evaluates.
 *    board.js    BoardEye's canvas board, camera code
 *                stripped, oriented to the player.
 *    speech.js   sections 7-10: TTS out, the mic loop,
 *                the keep-alive WAV. All iOS platform
 *                findings live there. Do not "fix" that
 *                code without reproducing the behaviour.
 *    parser.js   sections 3-6: vocabulary, parsing,
 *                matching, dialogue. Changes most.
 *    lichess.js  section 11 plus the website's two
 *                reworks: PKCE sign-in (no more tokens by
 *                hand) and the account event stream (no
 *                more game id from the URL).
 *    modes.js    sections 15-16 verbatim (the clock and
 *                silent screens), the mode selector, the
 *                per-mode read-back, the low-time
 *                watcher and its reopened tombstone.
 *    app.js      this file: settings, the log, UI glue,
 *                boot.
 *    index.html  layout only. Quarantined: the CSS and
 *                markup nobody touches. Version bumps and
 *                history happen HERE, not there.
 *
 *  Files share plain globals — script tags, no modules,
 *  no build step. Load order matters only for top-level
 *  code; every cross-file call happens at runtime. The
 *  section numbers (3-11, 13) keep their userscript
 *  numbers so old logs and conversations stay readable.
 *
 *  HARD CONSTRAINTS, revised for the website
 *  1. FAIR PLAY. Unchanged and permanent. rules.js may
 *     only answer which moves are LEGAL and what they are
 *     CALLED. No evaluation, no search, no opening book,
 *     no move recommendation. Lichess bans analysis
 *     assistance; adding any would make this a cheating
 *     tool. The word "engine" is deliberately absent.
 *  2. THE BOARD API IS THE ONLY TRUTH. The userscript's
 *     "no DOM scraping" rule, now structural: there is no
 *     Lichess page to scrape. Everything comes from
 *     /api/board/game/stream and POST .../move.
 *  3. NO EXTERNAL LIBRARIES. Still none: rules.js does
 *     what chess.js would, and the piece art ships in
 *     index.html. Nothing is fetched from a CDN, so the
 *     page works the moment it loads and never breaks to
 *     someone else's deploy.
 *  4. TOKENS ARE INVISIBLE. Nobody creates, sees, or
 *     pastes a token. Sign-in is the PKCE flow; the token
 *     it yields lives in localStorage — OUR origin's
 *     localStorage, which is why the userscript's
 *     GM-storage apparatus could retire (on lichess.org,
 *     localStorage belonged to the site and every
 *     extension on it; here it belongs to us).
 *  5. ONE FILE is retired, and its REASON kept. The rule
 *     existed because the Userscripts app made splitting
 *     dangerous. On our own origin the danger is gone,
 *     and the 5000-line ceiling was real: the answer to
 *     size is still organisation — it just gets file
 *     boundaries now, drawn where the tests are (perft
 *     loads rules.js whole; the parser tests load
 *     parser.js whole; no more slicing by header).
 *
 *  CLOSED CASES carried over whole from the userscript
 *  (the detail lives in speech.js and the v104 source):
 *  sound is settled — confirmation must be speech, chimes
 *  are dead on iOS; no fullscreen repairs; nothing
 *  speculative in the vocabulary. The v92 no-unprompted-
 *  clock-speech case was REOPENED BY THE OWNER at w2 as
 *  an opt-in — the amended tombstone is in modes.js.
 *
 *  CLOCK MODE AND SILENT MODE returned at w2 as chosen
 *  modes (w1 had left them out, reasoning that this page
 *  is a standing clock mode — still true of the page, but
 *  the black screens earn their keep in a dark room and
 *  across-the-room reading, and the owner asked). The
 *  thirteen-game findings travel with them, in modes.js:
 *  screen-off voice-only was the weakest setting, silent
 *  mode demands looking at the iPad. As chosen modes
 *  rather than defaults, that is now the user's trade to
 *  make per game.
 *
 *  VERSIONS. The website counts w1, w2, ... so no number
 *  ever collides with the userscript's v-series in a log
 *  dump. Bump per behavioural change, revert freely.
 *    w1  the port: userscript v104 voice pipeline +
 *        BoardEye's board, PKCE and seek/challenge, on
 *        GitHub Pages.
 *    w2  the three viewing modes — voice only, clock,
 *        silent — as a per-game choice, with sections 15
 *        and 16 ported verbatim into modes.js. Per-mode
 *        move read-back (voice ON, clock OFF by default:
 *        the turn flip on the clocks is the free
 *        confirmation). Low-time callouts in voice-only
 *        mode: a CLOSED CASE REOPENED BY THE OWNER,
 *        opt-in and default off; the amended tombstone is
 *        in modes.js. Also fixes w1's missing
 *        flipClockSides stub.
 *    w3  FULLSCREEN RETIRED from both black screens —
 *        the v75/v76/v79 tombstone's own stated one-line
 *        out, taken after the owner reported glitchy
 *        transitions; the overlays now fill the visible
 *        viewport under Safari's toolbar, and the exit
 *        that corrupted the layout viewport no longer
 *        happens at all. A voice dropdown built from the
 *        voices the DEVICE reports (never a hardcoded
 *        list of names that may not be installed), with
 *        a test button. An opponent dropdown: maia1,
 *        maia5, maia9, or someone else by name.
 *    w4  the voice dropdown cut to a SHORTLIST the owner
 *        chose by ear on his own iPad — Samantha, Daniel,
 *        Karen, Moira, Rishi, Tessa — shown as bare
 *        names. w3 offered every English voice the device
 *        reported, which on iOS is dozens, most of them
 *        unusable. The list is in speech.js.
 *    w5  index.html stops carrying a version number. It
 *        held one in the heading and in a ?v= on all
 *        seven script tags, so every bump forced an
 *        edit and re-upload of a file whose layout had
 *        not changed — pure churn for whoever is copying
 *        files into GitHub by hand. Both displays now
 *        read VERSION from here. RULE: index.html
 *        changes only when the LAYOUT changes.
 *    w6  the version comes off the screen entirely — the
 *        heading and the log-bar label both go. VERSION
 *        stays in app.js and in the log lines, so a
 *        pasted dump still identifies its build; that is
 *        the only reader who ever needed it.
 *    w7  the voice list goes CROSS-PLATFORM, fixing a w4
 *        bug: six Apple names meant Windows and Android
 *        users saw an empty dropdown. Apple, Microsoft
 *        and Google families are all matched, by prefix
 *        so version suffixes cannot break it, labels
 *        tidied for display, and if nothing matches at
 *        all every English voice is offered rather than
 *        none. WHO THIS IS FOR was rewritten to say what
 *        w4 forgot: the site is not the userscript, and
 *        no code here may assume an iPad.
 *    w8  THE ALLOWLIST GOES. w4 and w7 both hardcoded
 *        which voices to offer, and both were claims
 *        about hardware nobody here owns — the failure is
 *        silent and total when the claim is wrong. The
 *        dropdown now offers whatever English voices the
 *        device reports. The one exclusion is Apple's
 *        joke voices, and it is a BLOCKLIST: it can only
 *        subtract known junk, never withhold a real voice
 *        from an unanticipated platform. THE LESSON, for
 *        anything added later: prefer detecting what is
 *        there to declaring what should be.
 *    w9  the signed-in username is SHOWN. It was fetched
 *        all along and only kept lowercased for matching
 *        game.white.id, never displayed, so a connected
 *        page could not tell you whose account it was on
 *        — which matters most on a shared device. The
 *        same fix repairs a real bug: connectAccount set
 *        the status text but never repainted the account
 *        row, so the button still read "Sign in with
 *        Lichess" while signed in.
 *   w10  the username stops being said twice. w9 put it
 *        in a line of its own AND in the status line
 *        under it. Now the account button IS the
 *        identity — the name is its label and the green
 *        is its state (the same green the round button
 *        uses for "on", because it means the same
 *        thing) — and the status line is left to say
 *        only what is happening.
 *   w11  a churn fix, not a feature. w10 needed THREE
 *        files to change one button: a CSS class in
 *        index.html, the toggle here, and a status
 *        string in lichess.js. State appearance now
 *        lives in app.js as inline style, the way the
 *        userscript always did it, so index.html is out
 *        of that loop entirely. RULE: index.html holds
 *        the RESTING look; anything that changes with
 *        what the program is doing is styled from here.
 *        Still outstanding, and the next churn source
 *        to fix: 19 uiStatus() strings sit in
 *        lichess.js, which should report STATE and let
 *        this file choose the WORDS.
 *
 *  WORKING STYLE THAT WORKS, unchanged: log dumps are the
 *  best source of bugs; verify before asserting; nothing
 *  speculative; bump the version per behavioural change
 *  and revert freely; say what is unproven. UNPROVEN as
 *  of w1: everything — the whole port awaits its first
 *  real game. The pipeline is v104's verbatim, but the
 *  boot, sign-in and game discovery are new code.
 */

  /*========================= 1. SETTINGS ==========================*/
  /* Only the cross-cutting ones. Parser settings sit in
   * parser.js, speech and mic settings in speech.js —
   * each knob next to the code it turns. */

  var VERSION = "w11";

  // LEAVE TOKEN EMPTY. Sign-in fills localStorage; this
  // override exists only for testing and means the token
  // lives in the file.
  var TOKEN = "";

  var TOKEN_KEY = "audioplay.lichess.token";

  // Maximum number of lines in the log
  var LOG_MAX = 3000;

  /*========================= 2. DEBUG LOG =========================*/

  var LOG = [];
  var logBody = null;

  function log(tag, msg) {
    var t = new Date().toTimeString().slice(0, 8);
    var line = t + "  " + tag + "  " + msg;
    LOG.push(line);
    if (LOG.length > LOG_MAX) LOG.shift();
    if (logBody) {
      logBody.textContent = LOG.join("\n");
      logBody.scrollTop = logBody.scrollHeight;
    }
    try { console.log("[voice] " + line); } catch (e) {}
  }

  window.addEventListener("error", function (e) {
    log("ERR", (e.message || "?") + " @" + (e.lineno || "?"));
  });

  /*================= OVERLAYS LIVE IN modes.js (w2) ===============*/
  /* w1 stubbed sections 15 and 16 here so the dialogue
   * could stay verbatim; w2 ports them for real. modes.js
   * loads just before this file and owns silentModeOn,
   * clockModeOn, the enter/exit pairs, flipClockSides —
   * which w1's stubs had in fact MISSED, so "flip clock"
   * would have thrown; found by the w2 port — and the
   * per-mode readBackMyMove() plus the low-time watcher. */

  /*============================ 12. UI ============================*/
  /* The userscript built its buttons with createElement
   * because it had no page of its own. This page is ours,
   * so the elements live in index.html and this section
   * only wires them. The round button means what it meant:
   * play triangle = off, hollow circle = on, filled circle
   * = listening right now. One tap is required by iOS to
   * unlock the mic and audio — that is why voice cannot
   * simply start itself after sign-in. */

  var bigBtn, testChip, statusLine, clockLine, turnLine;

  // w2: the mode selector row. Lit = current mode, one
  // always lit. modes.js calls uiModeChanged from every
  // enter/exit so a tap-to-leave repaints this too.
  var modeBtns = {};

  function renderModeButtons() {
    var m = currentMode();
    ["voice", "clock", "silent"].forEach(function (k) {
      if (modeBtns[k]) modeBtns[k].classList.toggle("on", m === k);
    });
  }

  function uiModeChanged() { renderModeButtons(); }

  function renderButton() {
    if (testChip) {
      testChip.classList.toggle("on", dryRun);
    }
    if (!bigBtn) return;
    if (!running) { bigBtn.textContent = "\u25B6"; bigBtn.classList.remove("on"); }
    else if (listening) { bigBtn.textContent = "\u25CF"; bigBtn.classList.add("on"); }
    else { bigBtn.textContent = "\u25CB"; bigBtn.classList.add("on"); }
  }

  function uiStatus(text) {
    if (statusLine) statusLine.textContent = text;
  }

  function fmtClock(ms) {
    if (ms == null) return "-:--";
    if (ms < 0) ms = 0;
    var total = Math.floor(ms / 1000);
    var m = Math.floor(total / 60), s = total % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function renderClocks() {
    if (!clockLine) return;
    if (!api.pos || api.wtime == null) { clockLine.innerHTML = ""; return; }
    var mine = api.myColor || "w";
    var theirs = mine === "w" ? "b" : "w";
    var mineLeft = fmtClock(remainingMs(mine));
    var low = remainingMs(mine) != null && remainingMs(mine) < 60000;
    clockLine.innerHTML =
      '<span class="mine' + (low ? " low" : "") + '">you ' +
      mineLeft + "</span> &nbsp; them " + fmtClock(remainingMs(theirs));
  }

  function renderTurn() {
    if (!turnLine) return;
    if (!api.pos) { turnLine.textContent = ""; return; }
    if (api.over) { turnLine.textContent = "Game over."; return; }
    var yours = api.pos.turn === api.myColor;
    turnLine.textContent = colorWord(api.pos.turn) + " to move" +
      (api.myColor ? (yours ? " - that is you." : ".") : ".");
  }

  // The one hook lichess.js calls whenever the game state
  // moves: board, clocks, turn line, buttons, all from one
  // place, the way renderButton always worked.
  function uiGameChanged() {
    renderMiniBoard();
    renderClocks();
    renderTurn();
    renderAccount();
    renderButton();
  }

  // The signed-in green is the SAME green the round
  // button uses for "on", because it means the same
  // thing: this is running. Kept here as a constant so
  // the one idea has one home.
  var SIGNED_IN_BG = "#3a5a2a";
  var SIGNED_IN_FG = "#e6efe0";

  var signInBtn, signOutBtn, seekBtn, seekCancelBtn, challengeBtn;

  function renderAccount() {
    var signedIn = !!storedToken();
    if (signInBtn) {
      // ONE control, both facts. Signed out it is the way
      // in and says so. Signed in it becomes the account
      // itself: the name is the label and the green is
      // the state, matching the round button's "on" —
      // tapping it switches accounts, which is what a
      // name in an account row is expected to do.
      //
      // The name is NOT repeated in the status line
      // below; that line says what is HAPPENING, this
      // button says WHO. w9 had it in both places and
      // read as a stutter.
      signInBtn.textContent = api.myName || "Sign in with Lichess";
      signInBtn.title = api.myName ? "Sign in as someone else" : "";
      // styled HERE, not by a class in index.html (w11):
      // appearance that changes with state belongs beside
      // the code that knows the state, or every tweak
      // edits two files for one idea.
      if (api.myName) {
        signInBtn.style.background = SIGNED_IN_BG;
        signInBtn.style.color = SIGNED_IN_FG;
        signInBtn.style.borderColor = SIGNED_IN_BG;
      } else {
        signInBtn.style.background = "";
        signInBtn.style.color = "";
        signInBtn.style.borderColor = "";
      }
      signInBtn.classList.toggle("primary", !api.myName);
    }
    if (signOutBtn) signOutBtn.disabled = !signedIn;
    var inGame = !!api.gameId && !api.over;
    if (seekBtn) seekBtn.disabled = !signedIn || inGame || !!seekAbort;
    if (seekCancelBtn) seekCancelBtn.disabled = !seekAbort;
    if (challengeBtn) challengeBtn.disabled = !signedIn || inGame;
  }

  function el(id) { return document.getElementById(id); }

  function buildUI() {
    bigBtn = el("bigBtn");
    testChip = el("chipPractice");
    statusLine = el("lichessLine");
    clockLine = el("clockLine");
    turnLine = el("turnLine");
    signInBtn = el("btnSignIn");
    signOutBtn = el("btnSignOut");
    seekBtn = el("btnSeek");
    seekCancelBtn = el("btnSeekCancel");
    challengeBtn = el("btnChallenge");
    logBody = el("logBody");
    logBody.textContent = LOG.join("\n");
    // NO VERSION ON SCREEN (w6). VERSION lives on in the
    // log lines, which is where it earns its place: a
    // pasted dump says which build produced it. On screen
    // it only told the owner what he had just uploaded.

    signInBtn.addEventListener("click", function () { signIn(); });
    signOutBtn.addEventListener("click", function () {
      signOut();
      renderButton();
    });

    seekBtn.addEventListener("click", function () {
      startSeek(el("seekMinutes").value, el("seekIncrement").value,
                el("seekRated").checked);
      renderAccount();
    });
    seekCancelBtn.addEventListener("click", function () {
      cancelSeek();
      renderAccount();
    });
    challengeBtn.addEventListener("click", function () {
      sendChallenge(MODE_SETTINGS.opponent,
                    el("seekMinutes").value, el("seekIncrement").value,
                    el("seekRated").checked, el("challengeColour").value);
    });

    // ---- voice: the round button, verbatim in spirit ----
    // One difference from the userscript, deliberate: OFF
    // no longer tears down the game connection. Sign-in
    // owns the connection; this button owns the voice. A
    // game keeps streaming (and the board keeps drawing)
    // with the mic off.
    bigBtn.addEventListener("click", function () {
      wakeSpeech();
      setTimeout(loadVoices, 300);
      running = !running;
      if (running) {
        dryRun = false;
        startKeepAlive();
        startListening();
        if (!storedToken()) speak("sign in with lichess first.");
        else if (!api.gameId) speak("voice on. waiting for a game.");
      } else {
        dryRun = false;
        pauseMic();
        stopKeepAlive();
        pending = null; confirmAction = null;
        // nothing spoken: the button's own state is the
        // signal, and the user just pressed it. Speaking
        // after being switched off is the wrong last word
        // from a thing that has been told to stop.
        log("UI", "voice play off");
      }
      renderButton();
    });

    // ---- practice chip, verbatim from the userscript ----
    testChip.addEventListener("click", function () {
      wakeSpeech();
      setTimeout(loadVoices, 300);
      if (dryRun) {
        dryRun = false; running = false;
        pauseMic(); pending = null; confirmAction = null;
        // nothing spoken: the chip's own colour is the
        // signal, and this is a state the user just chose
        log("DRY", "practice mode OFF");
      } else {
        dryRun = true; running = true;
        pending = null; confirmAction = null;
        startKeepAlive();
        startListening();
        dryStart();
      }
      renderButton();
    });

    // ---- w2: mode selector and per-mode settings ----
    ["voice", "clock", "silent"].forEach(function (k) {
      var b = el("mode" + k.charAt(0).toUpperCase() + k.slice(1));
      modeBtns[k] = b;
      b.addEventListener("click", function () { setMode(k); });
    });

    function bindCheck(id, key) {
      var box = el(id);
      box.checked = !!MODE_SETTINGS[key];
      box.addEventListener("change", function () {
        MODE_SETTINGS[key] = box.checked;
        saveModeSettings();
      });
    }
    // ---- w3: voice dropdown ----
    // Filled from what the DEVICE reports, not a
    // hardcoded list: installed voices differ per device
    // and per iOS version, and naming one that is absent
    // just silently falls back. iOS reports an empty list
    // until speech has been used once, so this is
    // refilled after the first tap as well as at boot.
    var voiceSel = el("optVoice");
    function fillVoices() {
      var have = englishVoices();
      var want = MODE_SETTINGS.voiceName || "";
      if (voiceSel.options.length === have.length + 1) return;
      voiceSel.innerHTML = "";
      var d = document.createElement("option");
      d.value = ""; d.textContent = "default";
      voiceSel.appendChild(d);
      have.forEach(function (v) {
        var o = document.createElement("option");
        // the bare name only: the language tag is noise
        // once the list is six voices the owner chose
        // the stored value is the platform's real name;
        // the label is the tidied one (voiceLabel)
        o.value = v.name;
        o.textContent = v.label || v.name;
        voiceSel.appendChild(o);
      });
      voiceSel.value = want;
      if (voiceSel.value !== want) voiceSel.value = "";
      log("TTS", have.length + " voices offered");
    }
    fillVoices();
    voiceSel.addEventListener("change", function () {
      MODE_SETTINGS.voiceName = voiceSel.value;
      saveModeSettings();
      setVoiceName(voiceSel.value);
    });
    el("btnVoiceTest").addEventListener("click", function () {
      wakeSpeech();
      setTimeout(function () {
        loadVoices();
        fillVoices();
        // a real sentence, not "testing": the point is how
        // this voice says the words it will actually say
        speak("knight foxtrot 3. black to move.");
      }, 300);
    });
    // iOS hands over the list only after speech has run
    setTimeout(fillVoices, 1500);
    setInterval(fillVoices, 4000);

    // ---- w3: opponent dropdown ----
    // The maia bots are the standing opponents: maia1 is
    // the gentlest, maia9 the strongest. "someone else"
    // reveals the name box rather than having two
    // controls compete for the same job.
    var oppSel = el("challengeWho"), oppOther = el("challengeOther");
    function syncOpponent() {
      var custom = oppSel.value === "other";
      oppOther.style.display = custom ? "" : "none";
      MODE_SETTINGS.opponent = custom ? oppOther.value : oppSel.value;
      saveModeSettings();
    }
    if (MODE_SETTINGS.opponent &&
        !["maia1", "maia5", "maia9"].includes(MODE_SETTINGS.opponent)) {
      oppSel.value = "other";
      oppOther.value = MODE_SETTINGS.opponent;
    } else {
      oppSel.value = MODE_SETTINGS.opponent || "maia1";
    }
    syncOpponent();
    oppSel.addEventListener("change", syncOpponent);
    oppOther.addEventListener("change", syncOpponent);

    bindCheck("optReadBackVoice", "readBackVoice");
    bindCheck("optReadBackClock", "readBackClock");
    bindCheck("optLowTime", "lowTimeOn");
    var lvls = el("optLowTimeLevels");
    lvls.value = MODE_SETTINGS.lowTimeLevels;
    lvls.addEventListener("change", function () {
      MODE_SETTINGS.lowTimeLevels = lvls.value;
      saveModeSettings();
      log("CLK", "low-time levels set to " +
          lowTimeLevels().join(",") + "s");
    });
    renderModeButtons();

    // ---- log panel buttons ----
    el("btnLogCopy").addEventListener("click", function () {
      var b = el("btnLogCopy");
      try {
        navigator.clipboard.writeText(LOG.join("\n"));
        b.textContent = "copied";
        setTimeout(function () { b.textContent = "copy"; }, 1200);
      } catch (e) { b.textContent = "no clipboard"; }
    });
    el("btnLogClear").addEventListener("click", function () {
      LOG.length = 0; logBody.textContent = "";
    });

    renderButton();
    log("UI", "ready");
  }

  /*=========================== 14. BOOT ===========================*/
  /* The userscript watched lichess.org for a game page.
   * There is no page to watch: boot is now (1) finish a
   * PKCE return if this load is one, (2) load the stored
   * token, (3) connect the account and watch its event
   * stream. The clock repaint interval matches the
   * userscript's overlay tick spirit: cheap, and the only
   * thing on the page that moves between server events. */

  function boot() {
    buildUI();
    initBoard();
    finishSignIn().then(function (returned) {
      loadStoredToken();
      if (storedToken()) {
        connectAccount();
        if (returned) uiStatus("Signed in.");
      } else {
        uiStatus("Not signed in.");
      }
      uiGameChanged();
    });
    setInterval(function () {
      renderClocks();
    }, 500);
    log("UI", "script loaded " + VERSION);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
