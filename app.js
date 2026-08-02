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
 *  One user, one board, and the fact that explains nearly
 *  every choice: HE PLAYS WITHOUT READING GLASSES. A real
 *  board, standing, with a 13-inch iPad across the room.
 *  The screen exists to be glanced at, not read; the ears
 *  carry the game. Anything that must be acted on MUST be
 *  spoken.
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
 *    app.js      this file: settings, the log, the
 *                overlay stubs, UI glue, boot.
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
 *  are dead on iOS; no unprompted clock speech of any
 *  kind, asked for and declined at v92 ("clock" answers
 *  on demand and stays the whole answer); no fullscreen
 *  repairs; nothing speculative in the vocabulary.
 *
 *  CLOCK MODE AND SILENT MODE (userscript 15 and 16) ARE
 *  NOT PORTED, and the reasoning should save someone a
 *  rebuild: this page IS clock mode. The userscript drew
 *  a black overlay because the Lichess page underneath
 *  was unreadable clutter; here the page is ours, the
 *  clocks are already on it in large type, and the moves
 *  are spoken. Silent mode was the userscript's own
 *  deletion candidate ("it demands constant looking at
 *  the iPad, the one thing this project exists to
 *  avoid"). The stubs below keep the dialogue code
 *  verbatim; if either overlay is ever wanted, port it
 *  behind them.
 *
 *  VERSIONS. The website counts w1, w2, ... so no number
 *  ever collides with the userscript's v-series in a log
 *  dump. Bump per behavioural change, revert freely.
 *    w1  the port: userscript v104 voice pipeline +
 *        BoardEye's board, PKCE and seek/challenge, on
 *        GitHub Pages.
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

  var VERSION = "w1";

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

  /*=================== OVERLAY STUBS (15 and 16) ==================*/
  /* The dialogue in parser.js and speak() in speech.js
   * still ask these questions, verbatim from v104. The
   * answers here mean "voice mode, always": no overlay is
   * up, everything is spoken. This is the v78-parity
   * guarantee by construction — with silentModeOn() false,
   * every silent-mode branch is dead code, byte-identical
   * to what shipped and tested in the userscript. */

  function silentModeOn() { return false; }
  function clockModeOn() { return false; }
  function silentShowText() {}
  function silentSetInfo() {}
  function silentListLines() { return []; }
  function silentClearFinishedDialogue() {}
  function presentPendingList() {}
  function toggleClockMode() {}
  function toggleSilentMode() {}
  function classifyFlipClockAvailable() { return false; }

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

  var signInBtn, signOutBtn, seekBtn, seekCancelBtn, challengeBtn;

  function renderAccount() {
    var signedIn = !!storedToken();
    if (signInBtn) {
      signInBtn.textContent = api.myId
        ? "Sign in as someone else" : "Sign in with Lichess";
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
    el("verLabel").textContent = "Audioplay " + VERSION;

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
      sendChallenge(el("challengeWho").value,
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
