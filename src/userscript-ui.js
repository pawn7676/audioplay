  /*======================= UI (USERSCRIPT) ========================\
   *
   *  The floating row over lichess.org: practice, log, clock,
   *  settings, and the 72px round button - the userscript's
   *  own home, where the circle is right (ui.js's w29 note:
   *  it floats bottom-right, where a thumb finds it without
   *  looking). Rebuilt at v138 from the v137 shell with the
   *  website's behaviour carried across:
   *
   *  - THE BUTTON OWNS THE VOICE, NOT THE CONNECTION (w50's
   *    lesson, the website's delta 2). Voice off tears down
   *    no network: the stream keeps announcing, the reconnect
   *    ladder keeps working, and turning voice back on is
   *    just the mic. What still lives on the ON tap is the
   *    FIRST connection - the tap is also the iOS gesture
   *    that unlocks mic, audio and (if needed) the token
   *    prompt.
   *  - PRACTICE SURVIVES THE VOICE BUTTON in both directions
   *    (w90); the practice button is what ends it.
   *  - THE SETTINGS PANEL IS TWO SELECTS, the website's
   *    Settings row (w120/w131) in the userscript's floating
   *    clothes: how moves are spoken, and how your move is
   *    confirmed. Stored under the same audioplay.* keys -
   *    this origin's localStorage, which is fine for a
   *    cosmetic choice and would be wrong for the token
   *    (userscript-lichess has that reasoning).
   *  - THE LOG PANEL KEEPS ITS token BUTTON - the
   *    userscript's one door to replacing a dead token - and
   *    gains the w53 repaint gate (logPanelVisible).
   *
   *  INLINE STYLES ARE CORRECT HERE, not a rule-6 violation:
   *  this UI floats over lichess.org, where no stylesheet of
   *  ours exists to own anything. Same paint pots the site's
   *  buildUI names (ui.js).
   *================================================================*/

  var wrapEl, bigBtn, logPanel, logBtn, practiceBtn, clockBtn,
      settingsBtn, setPanel;

  var BUTTON_OFF = "#242220";
  var BUTTON_ON = "#3a5a2a";
  var BUTTON_TEXT_ON = "#f2f2ef";
  var BLUE = "#91bddf";
  var BORDER = "#3a3530";
  var AMBER = "#d0a24c";
  var PANEL_BG = "#171513";
  var PANEL_HEAD = "#7d766e";
  var PANEL_LABEL = "#c9c2b8";
  var LOG_TEXT = "#9fb0a0";

  // A lit button means that thing is currently ON, matching
  // the round button. Called from renderButton so every
  // control is repainted from one place.
  function paintButton(el, on, offColor) {
    if (!el) return;
    el.style.background = on ? BUTTON_ON : BUTTON_OFF;
    el.style.color = on ? BUTTON_TEXT_ON : offColor;
  }

  function renderButton() {
    paintButton(practiceBtn, dryRun, AMBER);
    paintButton(logBtn, !!(logPanel && logPanel.style.display !== "none"),
              BLUE);
    paintButton(clockBtn, clockModeOn(), BLUE);
    paintButton(settingsBtn, !!(setPanel && setPanel.style.display !== "none"),
              BLUE);
    if (!bigBtn) return;
    if (!running) { bigBtn.textContent = "▶"; bigBtn.style.background = BUTTON_OFF; }
    else if (listening) { bigBtn.textContent = "●"; bigBtn.style.background = BUTTON_ON; }
    else { bigBtn.textContent = "○"; bigBtn.style.background = BUTTON_ON; }
  }

  // The website's page furniture does not exist here, and the
  // shared/copied code still narrates through these two names.
  // The log is the userscript's status line - it is the panel
  // this project asks users to paste - so the sentences land
  // there instead of nowhere (rule 5 is about SPOKEN paths;
  // every caller of uiStatus has already spoken or logged the
  // urgent version).
  function uiStatus(text) {
    log("UI", text);
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
    practiceBtn.textContent = "practice";
    practiceBtn.style.cssText =
      "font-size:12px;padding:6px 12px;border-radius:10px;" +
      "background:" + BUTTON_OFF + ";color:" + AMBER + ";" +
      "border:1px solid " + BORDER + ";";
    practiceBtn.addEventListener("click", function () {
      wakeSpeech();
      primeChimes();   /* an AudioContext must be born in a gesture (w108) */
      setTimeout(loadVoices, 300);
      if (dryRun) {
        dryRun = false; running = false;
        pauseMic(); clearDialogue();
        log("DRY", "practice mode OFF");
        // dryStart took over the api state; hand it back and
        // pick the page's game up again if there is one. The
        // website rejoins through the account API; here the
        // URL is the account API. Guarded on the token so
        // leaving practice never raises a prompt.
        api.gameId = null; api.pos = null;
        api.moves = []; api.over = false; api.overText = "";
        uiGameChanged();
        if (gameIdFromUrl() && storedToken()) connect();
      } else {
        // dryRun goes up FIRST so nothing in flight can
        // reconnect behind us, then dryStart owns the whole
        // teardown (w50).
        dryRun = true; running = true;
        startListening();
        dryStart();
      }
      renderButton();
    });
  }

  /* THE SETTINGS PANEL, v138: the website's two stored choices
   * (settings.js has each one's story), presented the
   * userscript way - a floating panel above the row. The
   * third website choice, Show ratings, is not here: nothing
   * in this shell draws a name, Lichess's own page does.
   * Each flip is logged, as every settings flip has been
   * since v135, so a pasted log says what the device was set
   * to and when it changed. */
  function settingRow(labelText, select) {
    var row = document.createElement("div");
    row.style.cssText =
      "display:flex;align-items:center;justify-content:space-between;" +
      "gap:14px;margin:6px 0;";
    var lab = document.createElement("div");
    lab.textContent = labelText;
    lab.style.cssText = "color:" + PANEL_LABEL + ";font-size:13px;";
    select.style.cssText =
      "font-size:12px;padding:4px 6px;border-radius:8px;" +
      "background:" + BUTTON_OFF + ";color:" + BLUE + ";" +
      "border:1px solid " + BORDER + ";";
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
      "position:fixed;right:10px;bottom:118px;z-index:99990;" +
      "display:none;background:" + PANEL_BG + ";border:1px solid " +
      BORDER + ";border-radius:14px;padding:10px 12px;min-width:230px;" +
      "font-family:-apple-system,system-ui,sans-serif;" +
      "-webkit-user-select:none;user-select:none;";

    var head = document.createElement("div");
    head.textContent = "settings";
    head.style.cssText =
      "color:" + PANEL_HEAD + ";font-size:11px;letter-spacing:.08em;" +
      "text-transform:uppercase;margin:0 0 4px;";
    setPanel.appendChild(head);

    // loadStoredSettings has already run (userscript-boot), so
    // the selects show what storage says - the return visit is
    // the tested second use (w37).
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
      // CHOOSING THE CHIME IS ITSELF A GESTURE (w132), so it
      // wakes the context on the spot. AND THE PICK PLAYS THE
      // PICK (w137): three loudnesses are only choosable by
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

    wrapEl = document.createElement("div");
    wrapEl.id = "voicemove-ui";
    wrapEl.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:99999;display:flex;" +
      "flex-direction:column;align-items:flex-end;gap:6px;" +
      "font-family:system-ui,-apple-system,sans-serif;";

    var row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;";

    if (PRACTICE_MODE) buildPracticeButton();

    logBtn = document.createElement("button");
    logBtn.textContent = "log";
    logBtn.style.cssText =
      "font-size:12px;padding:6px 12px;border-radius:10px;" +
      "background:" + BUTTON_OFF + ";color:" + BLUE + ";" +
      "border:1px solid " + BORDER + ";";

    bigBtn = document.createElement("button");
    bigBtn.style.cssText =
      "width:72px;height:72px;border-radius:50%;font-size:26px;line-height:1;" +
      "display:flex;align-items:center;justify-content:center;padding:0;" +
      "background:" + BUTTON_OFF + ";color:" + BLUE + ";" +
      "border:1px solid " + BORDER + ";touch-action:manipulation;" +
      "-webkit-user-select:none;user-select:none;";

    clockBtn = document.createElement("button");
    clockBtn.textContent = "clock";
    clockBtn.style.cssText = logBtn.style.cssText;
    clockBtn.addEventListener("click", function () {
      toggleClockMode();
    });

    settingsBtn = document.createElement("button");
    settingsBtn.textContent = "settings";
    settingsBtn.style.cssText = logBtn.style.cssText;
    settingsBtn.addEventListener("click", function () {
      var open = setPanel.style.display !== "none";
      if (!open) {
        // anchor just above the tallest thing in the row -
        // the round button
        try {
          var top = bigBtn.getBoundingClientRect().top;
          setPanel.style.bottom =
            Math.max(60, window.innerHeight - top + 8) + "px";
        } catch (e) {}
      }
      setPanel.style.display = open ? "none" : "block";
      renderButton();
    });

    buildSettingsPanel();

    if (practiceBtn) row.appendChild(practiceBtn);
    row.appendChild(logBtn);
    row.appendChild(clockBtn);
    row.appendChild(settingsBtn);
    row.appendChild(bigBtn);
    wrapEl.appendChild(row);
    document.body.appendChild(wrapEl);

    // BUTTON POSITIONING IS A CLOSED CASE — leave this alone.
    // The row is plain position:fixed, bottom/right. iOS
    // rubber-band overscroll can leave it sitting low until
    // the next real page interaction or reload; that is a
    // cosmetic iOS quirk and the accepted cost. Two fixes
    // were tried and REMOVED (v75, v76); do not reopen
    // without a fundamentally different approach.

    /* ---- debug panel ---- */

    logPanel = document.createElement("div");
    logPanel.style.cssText =
      "position:fixed;left:8px;right:8px;top:8px;bottom:110px;z-index:99998;" +
      "display:none;flex-direction:column;background:rgba(12,12,11,.97);" +
      "border:1px solid " + BORDER + ";border-radius:12px;overflow:hidden;";
    var verLabel = document.createElement("div");
    verLabel.textContent = "Audioplay " + VERSION;
    verLabel.style.cssText =
      "color:" + AMBER + ";font-size:12px;padding:6px 4px;margin-left:auto;" +
      "font-family:system-ui,sans-serif;";

    var bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:8px;padding:8px;border-bottom:1px solid " + BORDER + ";" +
      "font-family:system-ui,sans-serif;";
    // "token" is the userscript's door to the stored token
    // (manageToken, userscript-lichess) - the button the
    // website deliberately does not have.
    ["token", "copy", "clear", "close"].forEach(function (name) {
      var b = document.createElement("button");
      b.textContent = name;
      b.style.cssText =
        "font-size:12px;padding:6px 12px;border-radius:8px;background:" +
        BUTTON_OFF + ";color:" + BLUE + ";border:1px solid " + BORDER + ";";
      b.addEventListener("click", function () {
        if (name === "token") {
          manageToken();
          return;
        }
        if (name === "copy") {
          try {
            navigator.clipboard.writeText(LOG.join("\n"));
            b.textContent = "copied";
            setTimeout(function () { b.textContent = "copy"; }, 1200);
          } catch (e) { b.textContent = "no clipboard"; }
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
      "margin:0;padding:8px;flex:1;overflow:auto;color:" + LOG_TEXT +
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
      // log.js repaints only while this is true (w53), so the
      // toggle owns it and the open case paints once, here
      logPanelVisible = !open;
      if (!open) paintLog();
      renderButton();
    });

    bigBtn.addEventListener("click", function () {
      wakeSpeech();
      primeChimes();   /* an AudioContext must be born in a gesture (w108) */
      setTimeout(loadVoices, 300);
      running = !running;
      if (running) {
        // practice survives the voice button in BOTH
        // directions (w90); the practice button is what
        // ends it.
        startListening();
        if (dryRun) speak("voice on.");
        // THE FIRST TAP OF A GAME IS THE CONNECT (delta 2's
        // userscript half): sign-in does not exist here, so
        // the connection belongs to the first tap - which is
        // also the gesture the token prompt needs. Already
        // connected to this page's game, the tap is only the
        // mic: ensureStream restarts a stream only if it has
        // actually gone quiet (w81).
        else if (api.gameId && api.gameId === gameIdFromUrl() && !api.over) {
          ensureStream();
        } else {
          connect();
        }
      } else {
        // VOICE OFF TEARS DOWN NO NETWORK (w50, the website's
        // delta 2): listening and being connected are
        // different things. The stream keeps announcing; the
        // page-watcher in userscript-boot is what tears down,
        // when the game page itself goes away.
        pauseMic();
        clearDialogue();
        // nothing spoken: the button's own state is the
        // signal, and the user just pressed it. Speaking
        // after being switched off is the wrong last word
        // from a thing that has been told to stop.
        log("UI", "voice play off");
      }
      renderButton();
    });
    renderButton();
    log("UI", "ready");
  }
