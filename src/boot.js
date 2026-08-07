  /*============================= BOOT =============================\
   *
   *  The userscript watched lichess.org for a game page.
   *  There is no page to watch: boot is (1) finish a PKCE
   *  return if this load is one, (2) load the stored token,
   *  (3) connect the account and watch its event stream.
   *
   *  THE REPAINT INTERVAL IS A DIRTY CHECK, and that is a
   *  w20 decision worth keeping: the v133 game handlers in
   *  lichess.js are carried VERBATIM and know nothing about
   *  a board or a page, so instead of threading repaint
   *  calls through ported code (the churn that would undo
   *  the sharing), the tick compares a cheap fingerprint of
   *  the game state and repaints everything through
   *  uiGameChanged when it moves. Clocks repaint every tick
   *  regardless - they are the only thing on the page that
   *  moves between server events. */

  function settingsSummary() {
    return Object.keys(CFG).map(function (k) {
      return k + "=" + (CFG[k] ? "on" : "off");
    }).join(" ") + (VOICE_NAME ? " voice=" + VOICE_NAME : " voice=system");
  }

  var paintedState = "";

  function repaintTick() {
    renderPageClocks();
    // myColor and pos joined the fingerprint at w60. Joining a
    // game as black changed neither gameId (already consumed by
    // the join tick) nor moves.length (still 0), so the glance
    // board sat white-side-up - directly after the page SAID
    // "you are black" - until the first move bumped the count.
    // The board's whole job is confirming the pipeline and
    // Lichess agree; orientation is part of what it confirms.
    var now = [api.gameId, api.moves.length, api.over,
               api.myName, !!seekAbort, running, dryRun,
               api.myColor, !!api.pos].join("|");
    if (now !== paintedState) {
      paintedState = now;
      uiGameChanged();
    }
  }

  function boot() {
    buildWebUI();
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
    setInterval(repaintTick, 500);
    log("UI", "script loaded " + VERSION);
    // same line as the userscript's boot (v135): the flips
    // were logged, the starting state never was
    log("SET", "loaded: " + settingsSummary());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

