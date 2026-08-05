  /*============================ 12. UI ============================*/

  var wrapEl, bigBtn, logPanel, logBtn, practiceBtn, clockBtn, settingsBtn, setPanel;

  var BUTTON_OFF = "#242220";
  var BUTTON_ON = "#3a5a2a";

  // A lit button means that thing is currently ON, matching
  // the round button. Called from renderButton so every
  // control is repainted from one place.
  function paintButton(el, on, offColor) {
    if (!el) return;
    el.style.background = on ? BUTTON_ON : BUTTON_OFF;
    el.style.color = on ? "#e6efe0" : offColor;
  }

  function renderButton() {
    paintButton(practiceBtn, dryRun, "#d0a24c");
    paintButton(logBtn, !!(logPanel && logPanel.style.display !== "none"),
              "#91bddf");
    paintButton(clockBtn, clockModeOn(), "#91bddf");
    paintButton(settingsBtn, !!(setPanel && setPanel.style.display !== "none"),
              "#91bddf");
    if (!bigBtn) return;
    if (!running) { bigBtn.textContent = "\u25B6"; bigBtn.style.background = BUTTON_OFF; }
    else if (listening) { bigBtn.textContent = "\u25CF"; bigBtn.style.background = BUTTON_ON; }
    else { bigBtn.textContent = "\u25CB"; bigBtn.style.background = BUTTON_ON; }
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
      "background:" + BUTTON_OFF + ";color:#d0a24c;" +
      "border:1px solid #3a3530;";
    practiceBtn.addEventListener("click", function () {
      wakeSpeech();
      setTimeout(loadVoices, 300);
      if (dryRun) {
        dryRun = false; running = false;
        pauseMic(); pending = null; confirmAction = null;
        log("DRY", "practice mode OFF");
      } else {
        try { if (streamAbort) streamAbort.abort(); } catch (e) {}
        clearInterval(pollTimer); clearTimeout(reconnectTimer);
        dryRun = true; running = true;
        pending = null; confirmAction = null;
        startKeepAlive();
        startListening();
        dryStart();
      }
      renderButton();
    });
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
      "background:" + BUTTON_OFF + ";color:#91bddf;" +
      "border:1px solid #3a3530;";

    bigBtn = document.createElement("button");
    bigBtn.style.cssText =
      "width:72px;height:72px;border-radius:50%;font-size:26px;line-height:1;" +
      "display:flex;align-items:center;justify-content:center;padding:0;" +
      "background:" + BUTTON_OFF + ";color:#91bddf;" +
      "border:1px solid #3a3530;touch-action:manipulation;-webkit-user-select:none;user-select:none;";

    clockBtn = document.createElement("button");
    clockBtn.textContent = "clock";
    clockBtn.style.cssText = logBtn.style.cssText;
    clockBtn.addEventListener("click", function () {
      toggleClockMode();
    });

    // THE SETTINGS PANEL (v124). One "settings" button, one
    // panel of switches. Every persisted setting lives
    // here so nothing behavioural is buried in the source
    // any more; the file's values are first-run defaults
    // only. The panel follows the button aesthetic - a lit
    // pill is ON, same colors as everything else - and the
    // rows are grouped the way the modes are grouped:
    // all modes, voice mode, clock mode. Clock
    // mode's full-screen overlay sits above it, and
    // enterClockMode() closes it besides, so the switches
    // are only ever seen with the clock down.
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

    setPanel = document.createElement("div");
    setPanel.style.cssText =
      "position:fixed;right:10px;bottom:118px;z-index:99990;" +
      "display:none;background:#171513;border:1px solid #3a3530;" +
      "border-radius:14px;padding:10px 12px;min-width:230px;" +
      "font-family:-apple-system,system-ui,sans-serif;" +
      "-webkit-user-select:none;user-select:none;";

    function settingHeader(text) {
      var h = document.createElement("div");
      h.textContent = text;
      h.style.cssText =
        "color:#7d766e;font-size:11px;letter-spacing:.08em;" +
        "text-transform:uppercase;margin:8px 0 4px;";
      setPanel.appendChild(h);
    }

    // each row's pill painter, keyed by setting, so one
    // row's onFlip can repaint another - the message pair
    // flips its partner back on (v129)
    var settingPaints = {};

    function settingRow(key, label, onFlip, headerStyle) {
      var row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;" +
        "gap:14px;margin:4px 0;";
      var lab = document.createElement("div");
      lab.textContent = label;
      lab.style.cssText = headerStyle
        ? "color:#7d766e;font-size:11px;letter-spacing:.08em;" +
          "text-transform:uppercase;"
        : "color:#c9c2b8;font-size:13px;";
      var pill = document.createElement("button");
      pill.style.cssText =
        "font-size:11px;min-width:52px;padding:5px 0;" +
        "text-align:center;border-radius:10px;" +
        "border:1px solid #3a3530;";
      var paint = function () {
        pill.textContent = CFG[key] ? "on" : "off";
        paintButton(pill, CFG[key], "#91bddf");
      };
      pill.addEventListener("click", function () {
        CFG[key] = !CFG[key];
        saveSettings();
        log("SET", key + " = " + CFG[key]);
        paint();
        if (onFlip) onFlip();
      });
      paint();
      settingPaints[key] = paint;
      row.appendChild(lab);
      row.appendChild(pill);
      setPanel.appendChild(row);
    }

    // the headphones row led the panel from v125 to v131;
    // deleted at v132 with the setting.
    settingHeader("all modes");
    settingRow("confirmMyMove", "confirm my move");
    settingRow("guardPawnPushes", "guard pawn pushes");
    settingHeader("voice mode");
    settingRow("readBackMine", "speak my move");
    settingHeader("clock mode");
    // rows grouped by content, speak before show in each
    // group (v130): moves then messages, two stanzas of
    // the same shape.
    settingRow("clockReadBackMine", "speak my move");
    settingRow("clockSpeakOpponent", "speak opponent's move");
    settingRow("clockShowMoves", "show moves", function () {
      // the overlay is built once; tear it down so the next
      // clock entry rebuilds with or without the move row
      if (clockOverlay) {
        try { clockOverlay.remove(); } catch (e) {}
        clockOverlay = null;
      }
    });
    // the message pair (v129). Any three of the four
    // states, never off/off: switching the second one off
    // switches the other back on, so a question always has
    // a channel. The invariant lives HERE and in
    // loadSettings, not in speak(), which just obeys.
    function keepOneMessageChannel(other) {
      if (CFG.clockSpeakMessages || CFG.clockShowMessages) return;
      CFG[other] = true;
      saveSettings();
      log("SET", other + " forced on: messages need one channel");
      settingPaints[other]();
    }
    settingRow("clockSpeakMessages", "speak messages", function () {
      keepOneMessageChannel("clockShowMessages");
    });
    settingRow("clockShowMessages", "show messages", function () {
      keepOneMessageChannel("clockSpeakMessages");
    });
    document.body.appendChild(setPanel);

    if (practiceBtn) row.appendChild(practiceBtn);
    row.appendChild(logBtn);
    row.appendChild(clockBtn);
    row.appendChild(settingsBtn);
    row.appendChild(bigBtn);
    wrapEl.appendChild(row);
    document.body.appendChild(wrapEl);

    // BUTTON POSITIONING IS A CLOSED CASE — leave this alone.
    // The row is plain position:fixed, bottom/right, as it
    // was through v74. iOS rubber-band overscroll can leave
    // it sitting low until the next real page interaction
    // or reload; that is a cosmetic iOS quirk and the
    // accepted cost. Two fixes were tried and REMOVED:
    // v75 re-composited the row after overscroll (no
    // effect: the layout viewport itself is what shifts),
    // and v76 pinned it to visualViewport on every scroll
    // event, which made the buttons visibly jump around
    // during normal scrolling — worse than the bug. Do not
    // reopen without a fundamentally different approach.

    /* ---- debug panel ---- */

    logPanel = document.createElement("div");
    logPanel.style.cssText =
      "position:fixed;left:8px;right:8px;top:8px;bottom:110px;z-index:99998;" +
      "display:none;flex-direction:column;background:rgba(12,12,11,.97);" +
      "border:1px solid #3a3530;border-radius:12px;overflow:hidden;";
    var verLabel = document.createElement("div");
    verLabel.textContent = "Audioplay " + VERSION;
    verLabel.style.cssText =
      "color:#d0a24c;font-size:12px;padding:6px 4px;margin-left:auto;" +
      "font-family:system-ui,sans-serif;";

    var bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:8px;padding:8px;border-bottom:1px solid #3a3530;" +
      "font-family:system-ui,sans-serif;";
    ["token", "copy", "clear", "close"].forEach(function (name) {
      var b = document.createElement("button");
      b.textContent = name;
      b.style.cssText =
        "font-size:12px;padding:6px 12px;border-radius:8px;background:#242220;" +
        "color:#91bddf;border:1px solid #3a3530;";
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
        else { logPanel.style.display = "none"; renderButton(); }
      });
      bar.appendChild(b);
    });
    bar.appendChild(verLabel);

    logBody = document.createElement("pre");
    logBody.style.cssText =
      "margin:0;padding:8px;flex:1;overflow:auto;color:#9fb0a0;font-size:11px;" +
      "line-height:1.35;white-space:pre-wrap;word-break:break-word;" +
      "font-family:ui-monospace,Menlo,monospace;-webkit-overflow-scrolling:touch;";
    logBody.textContent = LOG.join("\n");
    logPanel.appendChild(bar);
    logPanel.appendChild(logBody);
    document.body.appendChild(logPanel);

    logBtn.addEventListener("click", function () {
      var open = logPanel.style.display !== "none";
      logPanel.style.display = open ? "none" : "flex";
      if (!open) {
        logBody.textContent = LOG.join("\n");
        logBody.scrollTop = logBody.scrollHeight;
      }
      renderButton();
    });

    bigBtn.addEventListener("click", function () {
      wakeSpeech();
      setTimeout(loadVoices, 300);
      running = !running;
      if (running) {
        dryRun = false;
        startKeepAlive();
        connect();
        startListening();
      } else {
        dryRun = false;
        pauseMic();
        stopKeepAlive();
        clearInterval(pollTimer);
        clearTimeout(reconnectTimer);
        try { if (streamAbort) streamAbort.abort(); } catch (e) {}
        pending = null; confirmAction = null;
        // nothing spoken, as with practice mode off: the
        // button's own state is the signal, and the user
        // just pressed it. Speaking after being switched
        // off is the wrong last word from a thing that has
        // been told to stop.
        log("UI", "voice play off");
      }
      renderButton();
    });
    renderButton();
    log("UI", "ready");
  }

