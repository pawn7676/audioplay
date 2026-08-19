  /*======================= BOOT (USERSCRIPT) ======================\
   *
   *  The website's boot signs in and watches the account
   *  event stream; this one watches lichess.org for a game
   *  page, which is the userscript's one surviving DOM
   *  dependency (constraint 2 is about game STATE - the
   *  moves, the clocks - and every one of those still comes
   *  from the Board API alone).
   *================================================================*/

  var booted = false, lastPath = "";

  /* Any one of these means "a game is on screen". Several are
   * tried because Lichess changes markup, and because
   * phone/tablet layouts and zen mode render different
   * subsets. Zen mode hides things with CSS, so the elements
   * still exist either way. */
  var PAGE_MARKERS = [".round__app", "main.round", "cg-board", ".cg-wrap",
                      "#main-wrap .round", "main .rclock"];

  function gamePageMarker() {
    for (var i = 0; i < PAGE_MARKERS.length; i++) {
      if (document.querySelector(PAGE_MARKERS[i])) return PAGE_MARKERS[i];
    }
    return null;
  }

  // The boot line still says what this build has switched on,
  // so a pasted log names its configuration (v135's rule: the
  // flips were logged, the starting state never was). The
  // website's line carries ratings too; nothing here draws a
  // rating, so the line carries only what this shell can act
  // on.
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
      log("UI", "game page detected via " + gamePageMarker());
    } else if (isGame && booted && path !== lastPath) {
      lastPath = path;
      log("UI", "navigated to " + path);
      // A NEW GAME PAGE IS A NEW GAME. Practice is left
      // alone - it is not this page's game, and the practice
      // button is what ends it (w90). Otherwise: reconnect if
      // the user had engaged - voice on, or a connection
      // already made. Never on a cold path change, because
      // connect() may raise the token prompt and a prompt
      // needs a tap behind it.
      if (!dryRun) {
        var wasConnected = !!api.gameId && api.gameId !== "PRACTICE";
        api.myColor = null; api.pos = null; api.moves = [];
        api.movesBefore = 0; api.over = false; api.overText = "";
        if (running || wasConnected) connect();
      }
    } else if (!isGame && booted) {
      booted = false;
      running = false;
      if (dryRun) {
        // leaving the page ends practice too: its button is
        // gone with the UI, and a half-state with dryRun up
        // and no way to see it is the w90 shape.
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
      api.over = false; api.overText = "";
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

  scrubDeadStorage();   /* the w111 audit; on THIS origin it also
                           deletes the pre-GM era's stranded
                           localStorage token, which is rule 4's
                           whole point */
  loadStoredSettings(); /* before any buildUI: the selects and the
                           first announcement read these (w120) */
  declareAudioSession();
  startStallWatch();
  loadStoredToken();    /* async (GM storage); cached by the time
                           a human can reach the button */
  tick();
  log("UI", "script loaded " + VERSION);
  log("SET", "loaded: " + settingsSummary());
