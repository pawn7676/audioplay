/*  ui.js - the page: what the board shows, the button row,
 *  the log panel, the clocks and names beside the board, the
 *  status line, sign-in, seek and challenge.
 *
 *  Every control is in audioplay.html, and every look is in
 *  audioplay.css, on top of the house style (theme.css, in
 *  the "shared" folder). This file wires the controls up
 *  and says which state is current, by setting classes
 *  (.on, .primary, .rec, .confirm, .picked) and the hidden
 *  attribute.
 *
 *  Sign-in owns the Lichess connection; the Microphone
 *  button owns only the mic. A game keeps streaming, and the
 *  board keeps updating, with voice off.
 *
 *  Play by (Voice, Hybrid or Keyboard) picks how you play.
 *  When typing (hybrid or keys mode) the Microphone button
 *  is greyed out and the mic is kept off; keys mode also
 *  greys out the speech settings and keeps the voice off.
 *  Nothing is hidden, so nothing on the page moves.
 *
 *  Hybrid mode has no button that turns sound on, so any
 *  tap or key press wakes it (see wakeOnInput).
 */

"use strict";

function el(id) { return document.getElementById(id); }

var voiceBtn, settingsBtn, clockBtn, logBtn, practiceBtn;
var signInBtn, seekBtn, seekCancelBtn, challengeBtn;
var settingsBackdrop, settingsMenu, logPanel, statusLine;
var clockTop, clockBottom, nameTop, nameBottom;

// ---- the button row ----

// Repaints the button row from the current state. A lit
// (green) button means that thing is on.
function renderButton() {
  if (!voiceBtn) return;
  practiceBtn.classList.toggle("on", dryRun);
  logBtn.classList.toggle("on", logPanelOpen());
  clockBtn.classList.toggle("on", clockViewOn());
  settingsBtn.classList.toggle("on", settingsMenuOpen());

  // The Microphone button says its state in words, with a
  // symbol in front that can be read from across the room.
  // Off it is blue (.primary, "press me"); on it is red
  // (.rec).
  voiceBtn.textContent = !running ? "▶ Microphone"
    : (listening ? "● Listening" : "○ On");
  // No mic when typing: the button stays in its place,
  // greyed out and plain, so the row never shifts.
  var typing = typingMode();
  voiceBtn.disabled = typing;
  voiceBtn.classList.toggle("primary", !running && !typing);
  voiceBtn.classList.toggle("rec", running);
}

// iOS only lets the page make sound after a tap, so every
// button that can lead to sound calls this first.
function wakeAudio() {
  wakeSpeech();
  primeChimes();
  setTimeout(loadVoices, 300);
}

// Hybrid mode: any tap or key press on the page wakes the
// sound, since there is no Microphone tap to do it. Until
// one comes the page is silent, which matters only after a
// reload mid-game: tapping Clock, or typing, is enough.
// The log says whether it worked, because iOS may not
// count a key press the way it counts a tap; a failed try
// is tried again on the next one.
//
// Once awake, each tap or key still checks the chime: a
// call, Siri or another app's sound can pause it mid-game,
// and the next tap or key then wakes it again.
var soundAwake = false, soundChecking = false;

// The chime's audio context running, with a clock that
// wasn't last found stuck (chimes.js), is the only sign
// there is that iOS allows the sound.
function soundRunning() {
  return !!chimeCtx && chimeCtx.state === "running" && !chimeStalled;
}

function wakeOnInput(how) {
  if (!hybridMode() || soundChecking) return;
  if (soundAwake) {
    if (soundRunning()) return;
    log("AUD", "sound paused (chime " +
        (chimeCtx ? chimeCtx.state : "missing") +
        (chimeStalled ? ", clock stuck" : "") + ") - waking again");
  }
  soundChecking = true;
  wakeAudio();

  setTimeout(function () {
    soundChecking = false;
    soundAwake = soundRunning();
    log("AUD", "sound " + (soundAwake ? "woken" : "not woken") +
        " by a " + how);

    // let wakeSpeech try again next time
    if (!soundAwake) speechReady = false;
    renderStatus();
  }, 300);
}

// In the capture phase, so the wake comes before the tap
// or key does anything else.
function wireWakeOnInput() {
  document.addEventListener("click", function () {
    wakeOnInput("tap");
  }, true);
  document.addEventListener("keydown", function () {
    wakeOnInput("key press");
  }, true);
}

function onVoiceTap() {
  wakeAudio();
  running = !running;
  if (running) {
    // One spoken hint for where things stand. Practice
    // survives this button either way; only the Practice
    // button ends it.
    if (dryRun) speak("voice play on.");
    else if (!hasToken()) speak("sign in with Lichess first.");
    else if (!api.gameId) speak("voice on. waiting for a game.");

    // in a game: make sure the stream is still alive
    else if (!api.over) ensureStream();

    // After the hint, so the mic waits for it to finish;
    // with no hint, the mic starts at once.
    startListening();
  } else {
    // Voice off stops the mic only. Nothing is spoken:
    // the button's own look is the answer.
    pauseMic();
    clearDialogue();
    log("UI", "voice play off");
  }
  renderButton();
  renderStatus();
}

// When typing the mic never starts, and in keys mode
// practice is silent: no audio is woken.
function onPracticeTap() {
  if (!keysMode()) wakeAudio();
  if (dryRun) {
    dryRun = false; running = false;
    pauseMic(); clearDialogue();
    log("DRY", "practice mode OFF");

    // Hand the board back, then pick the account up again:
    // practice closed its connections to Lichess.
    clearGame();
    if (hasToken()) connectAccount();
    else uiStatus("Sign in to play.");
  } else {
    // dryStart queues "Practice mode." first; the mic
    // then waits for it to finish before starting.
    dryRun = true; running = !typingMode();
    dryStart();
    if (running) startListening();
  }
  uiGameChanged();
}

// ---- the log panel ----

function logPanelOpen() {
  return !!logPanel && !logPanel.hidden;
}

function showLog(open) {
  logPanel.hidden = !open;
  logPanelVisible = open;   // log.js only repaints while open
  if (open) paintLog();
  renderButton();
}

// The Copy button says for a moment whether it worked.
function copyLog(b) {
  function say(text) {
    b.textContent = text;
    setTimeout(function () { b.textContent = "Copy"; }, 1200);
  }
  try {
    navigator.clipboard.writeText(LOG.join("\n")).then(
      function () { say("Copied"); },
      function () { say("No clipboard"); });
  } catch (e) { say("No clipboard"); }
}

function wireLog() {
  logBtn.addEventListener("click", function () {
    showLog(!logPanelOpen());
  });
  el("logCopy").addEventListener("click", function () {
    copyLog(this);
  });
  el("logClear").addEventListener("click", clearLog);

  // A tap anywhere else on the log closes it, as in Clock
  // View. Scrolling is a drag, not a tap, so it doesn't.
  logPanel.addEventListener("click", function (e) {
    if (e.target.closest("button")) return;
    showLog(false);
  });
}

// ---- the board ----

// The board is drawn by board.js, which is shared with other
// projects, so it is in the "shared" folder next to this
// page's folder, with its look (board.css) and the font of
// its letters and numbers (theme.css); audioplay.html loads
// all three. The lines here tell it what to show: the
// position in api.pos (the start position before a game),
// the last move tinted, a checked king's square glowing red,
// and a tapped piece highlighted (touch.js). The board flips
// when you play black. Squares are rules.js's numbers (rank
// * 16 + file: a1 is 0, h8 is 119), and -1 is none.

// Black at the bottom when you play black.
function boardFlipped() {
  return !!api && api.myColor === "b";
}

// Turns the board the right way up for your colour. Done
// before every paint and every tap, so a new game's colour
// is never missed.
function orientBoard() {
  BOARD.setOrientation(boardFlipped() ? "b" : "w");
}

// A square's number from its name ("e4"), or -1.
function squareOf(name) {
  var f = name.charCodeAt(0) - 97, r = name.charCodeAt(1) - 49;
  return f >= 0 && f < 8 && r >= 0 && r < 8 ? r * 16 + f : -1;
}

// The last move's two squares, or null.
function lastMoveSquares() {
  if (!api || !api.moves || !api.moves.length) return null;
  var uci = api.moves[api.moves.length - 1];
  if (!uci || uci.length < 4) return null;
  var from = squareOf(uci.slice(0, 2)), to = squareOf(uci.slice(2, 4));
  return from >= 0 && to >= 0 ? [from, to] : null;
}

// The checked king's square, or -1.
function checkSquare() {
  if (!api || !api.pos || !api.pos.inCheck(api.pos.turn)) return -1;
  return api.pos.kingSq(api.pos.turn);
}

// With no game yet, the start position is drawn, white at
// the bottom. It is set out here rather than by rules.js, so
// the board still shows it with rules.js missing. (Every path
// that sets myColor also sets pos, so a flipped board with no
// position cannot happen.)
var startBoard = null;
function startPosition() {
  if (!startBoard) {
    var b = new Array(128).fill(null), back = "rnbqkbnr";
    for (var f = 0; f < 8; f++) {
      b[f] = back[f].toUpperCase();   // rank 1
      b[16 + f] = "P";                // rank 2
      b[96 + f] = "p";                // rank 7
      b[112 + f] = back[f];           // rank 8
    }
    startBoard = { board: b };
  }
  return startBoard;
}

// What the board shows, asked on every paint (board.js,
// TALKING TO A PROJECT at its top).
function describeBoard() {
  return {
    pos: api && api.pos ? api.pos : startPosition(),
    lastMove: lastMoveSquares(),
    selected: touchSelectedSq(),
    check: checkSquare()
  };
}

// False with board.js missing: then there is no board on the
// page, and the log says why (an ERR line); the game itself
// still plays.
var boardReady = false;

// Starts the board once, from boot.js. A problem the board
// finds (pieces.js or board.css missing, say) goes in the log
// as an ERR line.
function initBoard() {
  var cv = el("mini");
  if (!cv) return;
  if (typeof BOARD === "undefined") {
    log("ERR", "board.js is missing - no board (keep it in the " +
        "\"shared\" folder, next to this page's folder)");
    return;
  }
  // theme.css is the house style - the font, the house
  // colours (--bg, --panel...) - and sets --font-family;
  // without it, that's unset.
  if (!BOARD.cssVar("--font-family", "")) {
    log("ERR", "theme.css is missing - the page has no house colours " +
        "or font (keep it in the \"shared\" folder, next to this " +
        "page's folder)");
  }
  boardReady = true;
  orientBoard();
  BOARD.init(cv, {
    describe: describeBoard,
    report: function (text) { log("ERR", text); }
  });
}

// Paints the board again, the right way up.
function renderMiniBoard() {
  if (!boardReady) return;
  orientBoard();
  BOARD.render();
}

// ---- clocks, names and the status line ----

function uiStatus(text) {
  if (statusLine) statusLine.textContent = text;
}

// Always MM:SS, so the colon never moves. "00:00" when
// there is no clock (shown dimmed).
function fmtClock(ms) {
  if (ms == null) return "00:00";
  if (ms < 0) ms = 0;
  var total = Math.floor(ms / 1000);
  var m = Math.floor(total / 60), s = total % 60;
  return (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
}

// The clocks and names beside the board follow the board,
// as on Lichess: the opponent at the top, you at the
// bottom.
function sideOf(top) {
  var mine = api.myColor || "w";
  return top ? (mine === "w" ? "b" : "w") : mine;
}

// Names come from Lichess and are put in with innerHTML,
// so they are escaped.
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The clock box shows whose turn it is: green for the side
// to move, red under a minute, dimmed while waiting.
function clockCell(colour) {
  var left = remainingMs(colour);
  var toMove = !api.over && api.pos && api.pos.turn === colour;
  var cls = ["cbox"];
  if (left != null && left < 60000) cls.push("low");
  else if (toMove) cls.push("turn");
  if (!toMove && !api.over) cls.push("idle");
  return '<span class="' + cls.join(" ") + '">' + fmtClock(left) +
         "</span>";
}

// A player's title (BOT in its own colour), name, and
// rating if Show ratings is on.
function nameCell(colour) {
  var pl = api.players[colour];
  if (!pl) return "";
  var out = esc(pl.name);
  if (pl.title) {
    out = '<span class="title' + (pl.title === "BOT" ? " bot" : "") +
          '">' + esc(pl.title) + "</span> " + out;
  }
  if (SHOW_RATINGS && pl.rating != null) {
    out += ' <span class="rating">' + esc(pl.rating) + "</span>";
  }
  return out;
}

function renderPageClocks() {
  if (!clockTop) return;
  if (!api.pos || api.wtime == null) {
    var none = '<span class="cbox idle">' + fmtClock(null) + "</span>";
    clockTop.innerHTML = none;
    clockBottom.innerHTML = none;
    return;
  }
  clockTop.innerHTML = clockCell(sideOf(true));
  clockBottom.innerHTML = clockCell(sideOf(false));
}

function renderPlayers() {
  if (!nameTop) return;
  var live = api.pos && (api.players.w || api.players.b);
  nameTop.innerHTML = live ? nameCell(sideOf(true)) : "";
  nameBottom.innerHTML = live ? nameCell(sideOf(false)) : "";
}

// Spoken sentences are lower case; on screen each sentence
// gets its capital ("checkmate. white wins.").
function sentenceCase(s) {
  return String(s).replace(/(^|[.!?]\s+)([a-z])/g,
    function (_, lead, ch) { return lead + ch.toUpperCase(); });
}

// Once there is a game, the status line describes it,
// including the result when it ends. Before that it keeps
// whatever seek or challenge message was last shown.
function renderStatus() {
  if (!api.gameId || api.gameId === "PRACTICE") {
    if (dryRun) uiStatus("Practice mode.");
  } else if (api.over) {
    uiStatus(api.overText ? sentenceCase(api.overText) : "Game over.");
  } else if (!running && !typingMode()) {
    uiStatus("Playing. Tap the Microphone button to turn it on.");
  } else if (hybridMode() && !soundAwake) {
    uiStatus("Playing. Tap the page or press a key to turn on sound.");
  } else {
    uiStatus("Playing.");
  }
}

// Repaints everything that shows the game state.
function uiGameChanged() {
  renderMiniBoard();
  renderPageClocks();
  renderPlayers();
  renderAccount();
  renderButton();
  renderStatus();
}

// ---- the account button ----

// Signed in, the button shows your name. The first tap
// asks "Sign out?" for a few seconds; a second tap signs
// out, and any other tap or the timer cancels.
var signOutArmed = false;
var signOutArmTimer = null;
var SIGNOUT_ARM_MS = 4000;

function disarmSignOut() {
  clearTimeout(signOutArmTimer);
  signOutArmTimer = null;
  if (!signOutArmed) return;
  signOutArmed = false;
  renderAccount();
}

function armSignOut() {
  signOutArmed = true;
  clearTimeout(signOutArmTimer);
  signOutArmTimer = setTimeout(disarmSignOut, SIGNOUT_ARM_MS);
  renderAccount();
}

// Also sets which of Seek and Challenge can be pressed.
// Neither can during practice: practice closes the
// connection that would hear the new game start.
function renderAccount() {
  if (!signInBtn) return;
  var named = !!api.myName;
  signInBtn.textContent = !named ? "Sign in with Lichess"
    : (signOutArmed ? "Sign out?" : api.myName);
  signInBtn.classList.toggle("primary", !named);
  signInBtn.classList.toggle("on", named && !signOutArmed);
  signInBtn.classList.toggle("confirm", named && signOutArmed);

  var inGame = !!api.gameId && api.gameId !== "PRACTICE" && !api.over;
  var blocked = !hasToken() || inGame || dryRun;
  seekBtn.disabled = blocked || !!seekAbort;
  seekCancelBtn.disabled = !seekAbort;

  // while a challenge waits, the same button cancels it
  challengeBtn.disabled = blocked;
  challengeBtn.textContent = challengeAbort
    ? "Cancel challenge" : "Challenge";
}

function wireAccount() {
  // signed out: sign in; signed in: ask, then sign out
  signInBtn.addEventListener("click", function () {
    if (!api.myName) { signIn(); return; }
    if (signOutArmed) { disarmSignOut(); signOut(); }
    else armSignOut();
  });

  // a tap anywhere else cancels "Sign out?"
  document.addEventListener("click", function (e) {
    if (signOutArmed && !signInBtn.contains(e.target)) {
      disarmSignOut();
    }
  });
}

// ---- time control ----

// The picked time control: a preset like "15+10", "custom"
// (read from the Custom box), or null for nothing picked.
// A first visit has nothing picked; later visits restore
// the last choice.
var TIME_KEY = "audioplay.timecontrol";
var pickedTime = null;

// "10+5" -> {minutes: 10, increment: 5}, or null.
function parseTimeControl(text) {
  var m = /^\s*(\d{1,3})\s*\+\s*(\d{1,3})\s*$/.exec(text || "");
  if (!m) return null;
  var mins = +m[1], inc = +m[2];
  if (mins < 1 || mins > 180 || inc > 60) return null;
  return { minutes: mins, increment: inc };
}

function timePresets() {
  return document.querySelectorAll("#timeRow button.tc");
}

// The picked time control, or null after saying on the
// status line what is missing.
function timeControlForGame() {
  var tc = !pickedTime ? null
    : parseTimeControl(pickedTime === "custom"
                       ? el("timeCustom").value : pickedTime);
  if (!tc) {
    uiStatus(pickedTime ? "Custom time looks like 10+5."
                        : "Pick a time control first.");
  }
  return tc;
}

function paintTimeRow() {
  Array.prototype.forEach.call(timePresets(), function (b) {
    b.classList.toggle("picked", b.dataset.tc === pickedTime);
  });
  el("timeCustom").classList.toggle("picked", pickedTime === "custom");
}

function pickTime(value) {
  pickedTime = value;
  store(TIME_KEY, value === "custom"
    ? "custom:" + el("timeCustom").value : value);
  paintTimeRow();
}

function wireTimeRow() {
  Array.prototype.forEach.call(timePresets(), function (b) {
    b.addEventListener("click", function () {
      pickTime(b.dataset.tc);
    });
  });

  // The Custom box picks itself once its text is a valid
  // time like 10+5, and again when tapped back into.
  var box = el("timeCustom");
  box.addEventListener("input", function () {
    if (parseTimeControl(box.value)) pickTime("custom");
    else if (pickedTime === "custom") pickTime(null);
  });
  box.addEventListener("focus", function () {
    if (parseTimeControl(box.value)) pickTime("custom");
  });

  // Restore the last choice, if it still makes sense: a
  // valid custom time, or a preset that still has a button.
  var saved = stored(TIME_KEY);
  if (saved.indexOf("custom:") === 0) {
    if (parseTimeControl(saved.slice(7))) {
      box.value = saved.slice(7);
      pickedTime = "custom";
    }
  } else {
    Array.prototype.forEach.call(timePresets(), function (b) {
      if (b.dataset.tc === saved) pickedTime = saved;
    });
  }
  paintTimeRow();
}

// ---- seek and challenge ----

// The opponent and rated/casual choices are remembered.
var OPPONENT_KEY = "audioplay.opponent";
var RATED_KEY = "audioplay.rated";
var MAIA_BOTS = ["maia1", "maia5", "maia9"];

function wireGames() {
  var rated = el("seekRated");
  var oppSel = el("challengeWho"), oppOther = el("challengeOther");

  // Casual unless "rated" was stored: a missing or odd
  // value never makes a game rated.
  rated.value = stored(RATED_KEY) === "rated" ? "rated" : "casual";
  rated.addEventListener("change", function () {
    store(RATED_KEY, rated.value);
  });

  // A stored name that isn't one of the bots goes in the
  // "Someone else" box, which only shows when picked.
  var savedOpp = stored(OPPONENT_KEY);
  if (MAIA_BOTS.indexOf(savedOpp) >= 0) {
    oppSel.value = savedOpp;
  } else if (savedOpp) {
    oppSel.value = "other";
    oppOther.value = savedOpp;
  }
  function opponentName() {
    return oppSel.value === "other" ? oppOther.value : oppSel.value;
  }
  function syncOpponent() {
    oppOther.hidden = oppSel.value !== "other";
    store(OPPONENT_KEY, opponentName());
  }
  syncOpponent();
  oppSel.addEventListener("change", syncOpponent);
  oppOther.addEventListener("change", syncOpponent);

  seekBtn.addEventListener("click", function () {
    var tc = timeControlForGame();
    if (!tc) return;
    startSeek(tc.minutes, tc.increment, rated.value === "rated");
    renderAccount();
  });
  seekCancelBtn.addEventListener("click", function () {
    cancelSeek();
    renderAccount();
  });

  challengeBtn.addEventListener("click", function () {
    if (challengeAbort) {
      cancelChallenge();
      uiStatus("Challenge cancelled.");
      renderAccount();
      return;
    }
    var tc = timeControlForGame();
    if (!tc) return;
    sendChallenge(opponentName(), tc.minutes, tc.increment,
                  rated.value === "rated", el("challengeColour").value);
    renderAccount();
  });
}

// ---- the Settings menu ----

// A pop-up menu over the dimmed page. Starts closed on
// every load.
function settingsMenuOpen() {
  return !!settingsBackdrop && !settingsBackdrop.hidden;
}

// Places the menu with its bottom edge just above the
// button row and its left edge at the row's start, kept
// MENU_EDGE from the screen's edges. Too tall for the
// room above the buttons, it stops there and its rows
// scroll under the title (theme.css). With less than
// MENU_MIN_HEIGHT of room (the page scrolled down), it
// takes the screen's whole height instead.
var MENU_EDGE = 12, MENU_MIN_HEIGHT = 240;

function placeSettingsMenu() {
  var row = el("panelControls").getBoundingClientRect();
  var high = window.innerHeight;
  var bottom = Math.min(row.top - 8, high - MENU_EDGE);
  if (bottom - MENU_EDGE < MENU_MIN_HEIGHT) bottom = high - MENU_EDGE;
  settingsMenu.style.bottom = Math.round(high - bottom) + "px";
  settingsMenu.style.maxHeight =
    Math.max(0, Math.round(bottom - MENU_EDGE)) + "px";
  var maxLeft = window.innerWidth - settingsMenu.offsetWidth - MENU_EDGE;
  settingsMenu.style.left =
    Math.round(Math.max(MENU_EDGE, Math.min(row.left, maxLeft))) + "px";
}

function openSettings() {
  settingsBackdrop.hidden = false;
  placeSettingsMenu();
  settingsMenu.scrollTop = 0;   // opens at the top every time
  renderButton();
}

// A switch or button tapped in the menu keeps the focus,
// and typing leaves alone keys aimed at a form control,
// so the focus is dropped as the menu closes.
function closeSettings() {
  if (!settingsMenuOpen()) return;
  settingsBackdrop.hidden = true;
  if (document.activeElement && document.activeElement.blur) {
    document.activeElement.blur();
  }
  renderButton();
}

function wireSettingsMenu() {
  settingsBtn.addEventListener("click", openSettings);

  // A tap outside the menu closes it. "click" on purpose:
  // closing any earlier would let the tap go through to
  // what is underneath, so tapping Settings would close
  // the menu and open it again.
  settingsBackdrop.addEventListener("click", function (e) {
    if (e.target === settingsBackdrop) closeSettings();
  });

  // Escape closes it too. Caught before keys.js hears it,
  // so it doesn't also clear a typed entry.
  window.addEventListener("keydown", function (e) {
    if (e.key !== "Escape" || !settingsMenuOpen()) return;
    e.preventDefault();
    e.stopPropagation();
    closeSettings();
  }, true);

  window.addEventListener("resize", function () {
    if (settingsMenuOpen()) placeSettingsMenu();
  });
}

// Shows what the picked way of playing needs and hides the
// rest:
//   voice          nothing extra
//   hybrid, keys   your typed entry beside the board,
//                  with the latest message under it; in
//                  Clock View, each side's last move, your
//                  entry and the message (.typing on body)
// The two typing modes look the same; they differ only in
// sound. Typing stops the mic, and keys mode also cuts off
// the voice. Going back to voice waits for the Microphone
// button, as on a fresh load. An open yes/no question
// survives the switch, and is shown or spoken as fits.
function applyInputMode() {
  var keys = keysMode(), typing = typingMode();
  document.body.classList.toggle("typing", typing);

  // greyed out rather than hidden, so the open menu keeps
  // its size
  el("voiceSettings").classList.toggle("off", keys);
  el("keysPage").hidden = !typing;
  el("keysClock").hidden = !typing;
  el("setInput").value = INPUT_MODE;
  if (typing) {
    running = false;
    pauseMic();
  }
  if (keys) stopSpeech();
  declareAudioSession();   // playback only, when typing
  setChimeWatch(hybridMode());   // see chimes.js
  renderButton();
  renderStatus();
  keysRender();
}

function setInputMode(mode) {
  if (!isInputMode(mode)) return;
  if (mode === INPUT_MODE) return;
  INPUT_MODE = mode;
  store(INPUT_MODE_KEY, mode);
  log("SET", "input " + mode);
  applyInputMode();

  // picking Hybrid was a tap, so it can wake the sound
  wakeOnInput("tap on Play by");
}

// The two sides of the SQUARES | PIECES switch, the picked
// one lit.
function speechButtons() {
  return document.querySelectorAll("#setSpeech button");
}

function paintSpeech() {
  Array.prototype.forEach.call(speechButtons(), function (b) {
    b.classList.toggle("picked", b.dataset.speech === MOVE_SPEECH);
  });
}

// Each change is stored and logged.
function wireSettings() {
  var ratings = el("setRatings"), confirm = el("setConfirm");
  var input = el("setInput");
  input.value = INPUT_MODE;
  input.addEventListener("change", function () {
    setInputMode(input.value);
  });
  ratings.checked = SHOW_RATINGS;
  confirm.value = CONFIRM_MODE;
  paintSpeech();

  ratings.addEventListener("change", function () {
    SHOW_RATINGS = ratings.checked;
    store(RATINGS_KEY, SHOW_RATINGS ? "on" : "off");
    log("SET", "ratings " + (SHOW_RATINGS ? "on" : "off"));
    renderPlayers();
  });
  Array.prototype.forEach.call(speechButtons(), function (b) {
    b.addEventListener("click", function () {
      MOVE_SPEECH = b.dataset.speech === "pieces" ? "pieces" : "squares";
      store(MOVE_SPEECH_KEY, MOVE_SPEECH);
      log("SET", "moves spoken " + MOVE_SPEECH);
      paintSpeech();
    });
  });
  confirm.addEventListener("change", function () {
    var picked = confirm.value;
    if (isConfirmMode(picked)) CONFIRM_MODE = picked;
    store(CONFIRM_MODE_KEY, CONFIRM_MODE);
    log("SET", "confirm " + CONFIRM_MODE);

    // Picking a chime is a tap, so it wakes the chime, and
    // plays the picked level so it can be judged by ear
    // (only if the chime is already awake).
    if (CONFIRM_MODE.indexOf("chime") === 0) {
      primeChimes();
      if (picked === CONFIRM_MODE &&
          chimeCtx && chimeCtx.state === "running") {
        playConfirmChime();
      }
    }
  });
}

// ---- folding sections ----

// Which folding sections (<details>) are open is
// remembered across reloads. Today that is just
// Instructions.
var PANELS_KEY = "audioplay.panels";

function panelDetails() {
  return document.querySelectorAll(".panel[id] > details");
}

function savePanels() {
  var state = {};
  Array.prototype.forEach.call(panelDetails(), function (d) {
    state[d.parentNode.id] = d.open;
  });
  store(PANELS_KEY, JSON.stringify(state));
}

function restorePanels() {
  var state = {};
  try { state = JSON.parse(stored(PANELS_KEY) || "{}"); }
  catch (e) { log("ERR", "could not read panel state: " + e.message); }
  Array.prototype.forEach.call(panelDetails(), function (d) {
    var id = d.parentNode.id;
    if (id in state) d.open = !!state[id];
    d.addEventListener("toggle", savePanels);
  });
}

// ---- start ----

// Finds the page's controls and wires them up. boot.js
// calls this once, before anything else touches the page.
function buildWebUI() {
  voiceBtn = el("btnVoice");
  settingsBtn = el("btnSettings");
  clockBtn = el("btnClock");
  logBtn = el("btnLog");
  practiceBtn = el("btnPractice");
  signInBtn = el("btnSignIn");
  seekBtn = el("btnSeek");
  seekCancelBtn = el("btnSeekCancel");
  challengeBtn = el("btnChallenge");
  settingsBackdrop = el("settingsBackdrop");
  settingsMenu = el("settingsMenu");
  logPanel = el("logPanel");
  logBody = el("logBody");   // log.js writes into this
  statusLine = el("lichessLine");
  clockTop = el("clockTop");
  clockBottom = el("clockBottom");
  nameTop = el("nameTop");
  nameBottom = el("nameBottom");

  practiceBtn.hidden = !PRACTICE_MODE;
  voiceBtn.addEventListener("click", onVoiceTap);
  practiceBtn.addEventListener("click", onPracticeTap);
  clockBtn.addEventListener("click", toggleClockView);

  wireLog();
  wireAccount();
  wireTimeRow();
  wireGames();
  wireSettingsMenu();
  wireSettings();
  wireWakeOnInput();
  applyInputMode();
  restorePanels();
  renderButton();
  fixVoiceBtnWidth();
  renderAccount();
  log("UI", "page ready");
}

// The Microphone button's longest label, "▶ Microphone",
// is the one it shows at load (voice is off). Its width is
// kept as the button's least width, so "● Listening" and
// "○ On" never make the button, or the row, change size.
// Measured rather than set in audioplay.css, since text
// widths differ from browser to browser.
function fixVoiceBtnWidth() {
  voiceBtn.style.minWidth = "";
  var w = Math.ceil(voiceBtn.getBoundingClientRect().width);
  if (w > 0) voiceBtn.style.minWidth = w + "px";
}
