/*  boot.js - starts the page.
 *
 *  On load: read the stored settings, wire up the page,
 *  start the watches (page freezes, dead connections, the
 *  screen lock), finish a Lichess sign-in if this load is
 *  the return from one, then connect the account if a
 *  token is stored.
 *
 *  First, though, it checks that rules.js has loaded: it is
 *  the one file kept outside this page's folder (see
 *  rulesLoaded), so the one most likely to go missing.
 */

"use strict";

// One line naming the stored settings, so a copied log
// says how this device was set up.
function settingsSummary() {
  return "input=" + INPUT_MODE +
         " ratings=" + (SHOW_RATINGS ? "on" : "off") +
         " moves=" + MOVE_SPEECH +
         " confirm=" + CONFIRM_MODE +
         (VOICE_NAME ? " voice=" + VOICE_NAME : " voice=system");
}

// The game state changes in many places (Lichess events,
// spoken, typed and tapped moves, practice, the mic), and
// none of them touch the page. Instead, a timer checks a
// fingerprint of the state twice a second and repaints
// everything when it changes. One check here is simpler
// than a repaint call in every one of those places, and
// costs next to nothing. The clocks repaint on every tick,
// since they move between server events, and so do the
// keys-mode lines, which only write what has changed. The
// screen lock (awake.js) is checked on every tick too.
var paintedState = "";

function repaintTick() {
  renderPageClocks();
  keysRender();
  keepAwakeCheck();
  var now = [api.gameId, api.moves.length, api.over,
             api.myName, !!seekAbort, !!challengeAbort, running, dryRun,
             api.myColor, !!api.pos,
             (api.players.w && api.players.w.name) || "",
             (api.players.b && api.players.b.name) || ""].join("|");
  if (now !== paintedState) {
    paintedState = now;
    uiGameChanged();
  }
}

// rules.js is shared with other projects, so it lives in
// the "shared" folder next to this page's folder, and
// audioplay.html loads it from there. A missing script
// file makes no error of its own, so this check is the
// only sign of it. Without it nothing can play: joining a
// game, practice, a seek or a challenge would all fail. So
// the page stops here, before signing in or connecting:
// the status line and the log say why, the controls are
// switched off (but Log, so the log can be read), and
// nothing else starts. Fixing it means putting rules.js
// back and reloading.
function rulesLoaded() {
  if (typeof RULES !== "undefined") return true;
  var why = "rules.js is missing - the page can't play without it " +
            "(keep it in the \"shared\" folder, next to this page's folder).";
  log("ERR", why);
  uiStatus(why);
  var controls = document.querySelectorAll(
    "#panelLichess button, #panelLichess input, #panelLichess select");
  Array.prototype.forEach.call(controls, function (c) {
    if (c.id !== "btnLog") c.disabled = true;
  });
  return false;
}

function boot() {
  log("UI", "script loaded");
  loadStoredSettings();   // before the page is wired up
  log("SET", "loaded: " + settingsSummary());
  buildWebUI();
  initBoard();
  initTouch();
  initKeys();
  declareAudioSession();
  startStallWatch();
  if (!rulesLoaded()) return;
  startConnectionWatch();
  wireKeepAwake();
  // A failed sign-in has already said why on the status
  // line, so that is left in place of "Sign in to play."
  finishSignIn().then(function (result) {
    loadStoredToken();
    if (hasToken()) {
      connectAccount();
      if (result === "ok") uiStatus("Signed in.");
    } else if (result !== "failed") {
      uiStatus("Sign in to play.");
    }
    uiGameChanged();
  });
  setInterval(repaintTick, 500);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}