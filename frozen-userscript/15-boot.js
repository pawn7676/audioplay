  /*=========================== 15. BOOT ===========================*/

  var booted = false, lastPath = "";

  /* The ONLY DOM dependency left. Any one of these means "a game is
   * on screen". Several are tried because Lichess changes markup, and
   * because phone/tablet layouts and zen mode render different
   * subsets. Zen mode hides things with CSS, so the elements still
   * exist either way. */
  var PAGE_MARKERS = [".round__app", "main.round", "cg-board", ".cg-wrap",
                      "#main-wrap .round", "main .rclock"];

  function gamePageMarker() {
    for (var i = 0; i < PAGE_MARKERS.length; i++) {
      if (document.querySelector(PAGE_MARKERS[i])) return PAGE_MARKERS[i];
    }
    return null;
  }

  function tick() {
    var path = location.pathname;
    var isGame = !!gameIdFromUrl() && !!gamePageMarker();
    if (isGame && !booted) {
      booted = true;
      lastPath = path;
      buildUI();
      log("UI", "game page detected via " + gamePageMarker());
    } else if (isGame && booted && path !== lastPath) {
      lastPath = path;
      log("UI", "navigated to " + path);
      api.myColor = null; api.pos = null; api.moves = []; api.over = false;
      if (running) connect();
    } else if (!isGame && booted) {
      booted = false;
      running = false;
      // the overlay is position:fixed over everything, so
      // leaving the game page with it up left a black
      // screen on whatever came next, with the wake lock
      // still held. Exiting here takes both down; byTap
      // is passed so nothing is spoken about it.
      exitClockMode(true);
      pauseMic();
      stopKeepAlive();
      clearInterval(pollTimer);
      try { if (streamAbort) streamAbort.abort(); } catch (e) {}
      var ui = document.getElementById("voicemove-ui");
      if (ui) ui.remove();
      if (logPanel) logPanel.remove();
      logBody = null;
    }
  }

  var mo = new MutationObserver(function () { tick(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1000);
  tick();
  // Every switch, one line, at load (v135): the log records
  // FLIPS but never recorded the starting state, so a dump
  // reader had to guess six of the eight switches. Written
  // at boot, not in loadSettings: log() lives in section 2
  // and its buffer does not exist yet when CFG is built.
  function settingsSummary() {
    return Object.keys(CFG).map(function (k) {
      return k + "=" + (CFG[k] ? "on" : "off");
    }).join(" ") + (VOICE_NAME ? " voice=" + VOICE_NAME : " voice=system");
  }

  log("UI", "script loaded " + VERSION);
  log("SET", "loaded: " + settingsSummary());
  loadStoredToken();

