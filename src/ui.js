  /*============================== UI ==============================\
   *
   *  The page's furniture: the v133 userscript's button row,
   *  settings panel and floating log panel VERBATIM except for
   *  three web deltas marked "WEB:" below, plus the page
   *  furniture appended at the bottom (account, seek,
   *  challenge, status, clocks, panels - salvaged from the w19
   *  site, where it played game 17).
   *
   *  TWO UI IDIOMS ON ONE PAGE, on purpose: the floating buttons
   *  are the userscript's, kept byte-close so v-series UI work
   *  ports by re-copying; the panels are the page's own. The
   *  cosmetic mismatch is the price of sharing, and it was
   *  chosen with eyes open at w20. Unifying the look would
   *  mean reimplementing the settings panel per target - the
   *  exact churn the shared sections exist to avoid.
   *
   *  THE WEB DELTAS, and why each exists:
   *  1. The log panel has no "token" button: sign-in is PKCE
   *     (lichess.js) and Sign out lives on the page.
   *  2. The voice button no longer owns the connection - the
   *     w19 site decided this and game 17 proved it: SIGN-IN
   *     OWNS THE CONNECTION, THE BUTTON OWNS THE VOICE. A game
   *     keeps streaming (and the board keeps drawing) with the
   *     mic off, so the off path tears down no network.
   *  4. The voice button is a labelled pill, not the
   *     userscript's 72px circle (w29) - paintVoiceButton
   *     and restyleVoiceButton, with the page furniture.
   *  3. Leaving practice mode rejoins a live game via
   *     rejoinCurrent() (11W): dryStart took the api state
   *     over, and the account stream only announces NEW games.
   *================================================================*/


  var wrapEl, bigBtn, logPanel, logBtn, practiceBtn, clockBtn, settingsBtn, setPanel;

  var BUTTON_OFF = "#242220";
  var BUTTON_ON = "#3a5a2a";

  // A lit button means that thing is currently ON, matching
  // the voice button. Called from renderButton so every
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
    // WEB (delta 4): a labelled pill, not a 72px circle -
    // see paintVoiceButton with the page furniture below.
    paintVoiceButton();
  }

  // Built only when PRACTICE_MODE = true. practiceBtn stays null
  // otherwise, which every other reference already tolerates:
  // paintButton returns on a falsy element, and the button is the
  // only thing that ever sets dryRun true.
  function buildPracticeButton() {
    practiceBtn = document.createElement("button");
    practiceBtn.textContent = "Practice";   /* WEB w30: capitalised */
    practiceBtn.style.cssText =
      "font-size:12px;padding:6px 12px;border-radius:10px;" +
      "background:" + BUTTON_OFF + ";color:#d0a24c;" +
      "border:1px solid #3a3530;";
    practiceBtn.addEventListener("click", function () {
      wakeSpeech();
      setTimeout(loadVoices, 300);
      if (dryRun) {
        dryRun = false; running = false;
        pauseMic(); clearDialogue();
        log("DRY", "practice mode OFF");
        // WEB (delta 3): dryStart took over the api state;
        // hand it back and pick up a live game if one exists
        api.gameId = null; api.pos = null;
        api.moves = []; api.over = false;
        uiGameChanged();
        rejoinCurrent();
      } else {
        // dryRun goes up FIRST so nothing in flight can
        // reconnect behind us, then dryStart owns the whole
        // teardown - game stream, account stream, seek, timers
        // and the open questions. It used to be split between
        // here and there, which is how the account stream came
        // to be closed by neither (w50).
        dryRun = true; running = true;
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
    logBtn.textContent = "Log";   /* WEB w30: capitalised */
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
    clockBtn.textContent = "Clock";   /* WEB w30: capitalised */
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
    settingsBtn.textContent = "Settings";   /* WEB w30: capitalised */
    settingsBtn.style.cssText = logBtn.style.cssText;
    // THIS LISTENER OWNS THE TOGGLE, AND ONLY THE TOGGLE (w54).
    // It used to anchor the panel above the voice button as
    // well, and that work was always thrown away: buildWebUI
    // registers a SECOND listener on this same button which
    // re-anchors to top/left within the same click dispatch,
    // so the value computed here survived for no time at all
    // and its correctness rested entirely on the order the two
    // listeners happened to be registered in. One anchoring,
    // in the file that knows where the button actually is.
    settingsBtn.addEventListener("click", function () {
      var open = setPanel.style.display !== "none";
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
        clockHalves = null; clockMsgEl = null;  /* w63: all three */
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
      /* bottom:110px until w54, reserving room for the floating
         button row - which has lived inside the page since w21,
         so the strip was blank. It is the log panel; the space
         is better spent on log. */
      "position:fixed;left:8px;right:8px;top:8px;bottom:8px;z-index:99998;" +
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
    // WEB: no "token" button - sign-in is PKCE, Sign out is on
    // the page (delta 1 in the header)
    // WEB (w30): capitalised, like every other button on
    // the page. `name` stays lower case - it is the switch
    // value below, not a label.
    ["copy", "clear", "close"].forEach(function (name) {
      var b = document.createElement("button");
      b.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      b.style.cssText =
        "font-size:12px;padding:6px 12px;border-radius:8px;background:#242220;" +
        "color:#91bddf;border:1px solid #3a3530;";
      b.addEventListener("click", function () {
        if (name === "copy") {
          try {
            navigator.clipboard.writeText(LOG.join("\n"));
            b.textContent = "Copied";
            setTimeout(function () { b.textContent = "Copy"; }, 1200);
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
      // log.js repaints only while this is true (w53), so the
      // toggle owns it and the open case paints once, here
      logPanelVisible = !open;
      if (!open) paintLog();
      renderButton();
    });

    bigBtn.addEventListener("click", function () {
      wakeSpeech();
      setTimeout(loadVoices, 300);
      running = !running;
      if (running) {
        dryRun = false;
        startKeepAlive();
        startListening();
        // WEB (delta 2): no connect() - sign-in owns the
        // connection; the button owns the voice. The two
        // spoken hints cover the states a blind start hits.
        // SPELLED FOR THE EAR, NOT THE EYE (w39): every
        // English voice reads "lichess" as "LITCH-ess". It
        // is spoken text, so it is spelled the way it
        // should sound; the site's name is still written
        // correctly everywhere it is READ.
        if (!storedToken()) speak("sign in with lee chess first.");
        else if (!api.gameId) speak("voice on. waiting for a game.");
        // AND PICK THE GAME BACK UP (w50). Voice off leaves the
        // stream alone by design, but the stream can still die
        // on its own while voice is off - and scheduleReconnect
        // used to refuse to act unless voice was on, so nothing
        // was left to notice. Turning voice back on is the one
        // moment we know the user expects to be connected, so
        // it is the right place to make sure we are. startStream
        // is a no-op in practice and on no game, and aborts its
        // own predecessor, so calling it here cannot double up.
        else if (api.gameId && api.gameId !== "PRACTICE" && !api.over) {
          startStream();
        }
      } else {
        dryRun = false;
        pauseMic();
        stopKeepAlive();
        clearDialogue();
        // WEB (delta 2): no stream/poll teardown here.
        // nothing spoken, as with practice mode off: the
        // button's own state is the signal, and the user
        // just pressed it. Speaking after being switched
        // off is the wrong last word from a thing that has
        // been told to stop.
        log("UI", "voice play off");
      }
      renderButton();
      renderStatus();
    });
    renderButton();
    log("UI", "ready");
  }


  /* ------------- the page furniture (from the w19 site) -----------
   * Everything below is the page's own: status, clocks, turn,
   * account, seek, challenge, remembered panels. The w-series
   * decisions each block carries (w6 no version on screen,
   * w9/w12 the sign-in button, w13 the-game-is-the-status,
   * w19 remembered panels) were made on the real page and
   * travel with the code. */

  // THE VOICE BUTTON IS A PILL HERE (w29). The userscript's
  // 72px circle is right in its own home: it floats over
  // lichess.org at the bottom-right, where a thumb finds it
  // without looking. In a panel at the top of our own page
  // it only forces a 72px-tall row, leaving gaps above and
  // below every button beside it - the owner asked whether it
  // was earning that space, and it was not.
  //
  // WHAT IT MUST STILL DO is say that it is not one button
  // among five: it is the one control that MUST be pressed
  // before anything speaks or listens (iOS gives no
  // microphone without a real tap - mic.js). So the
  // distinction moves from SIZE to LANGUAGE THE PAGE
  // ALREADY SPEAKS: off, it wears the same blue as "Sign in
  // with Lichess", the page's other must-press; on, it
  // wears the same green as a signed-in account and a lit
  // button. Both times it says what it is in words, because
  // a triangle assumes the reader knows the convention.
  //
  // The symbol stays as a prefix - it carries the state at
  // a glance from across the room, where the words will not
  // be readable - and the pill has a fixed width so the
  // buttons beside it never shift as the label changes.
  //
  // THE WORDS ARE SHORT BECAUSE THE PANEL IS THE SUBJECT
  // (w30): the heading above already says VOICE, so the
  // button says only what it does or what it is doing -
  // "Start", then "Listening" or "On". Note the small
  // inconsistency the owner chose, and it is the right
  // choice: "Start" is an ACTION and the other two are
  // STATES. Off, the only thing worth saying is what will
  // happen if you press it, because nothing is happening
  // yet; on, the useful fact is whether the mic is live -
  // which "Stop" would hide.
  // THE CODE SAYS WHICH STATE, THE STYLESHEET SAYS WHAT IT
  // LOOKS LIKE (w54). This wrote #91bddf and #3a5a2a into the
  // element by hand - the same two values --accent and
  // --button-on already hold, duplicated where nothing could
  // see them drift apart, and set from a place that cannot see
  // what colour the text ended up. That is the w21/w24/w36
  // shape three times over, and the rule those cost was
  // written down and then not followed here.
  //
  // The inline properties are CLEARED rather than overwritten,
  // which is the same move adoptPageButtonLook makes just
  // below and for the same reason: the stylesheet can only be
  // the single source of the look if nothing inline is
  // competing with it. buildUI sets a background on this
  // button when it builds it, so there IS something to clear.
  function paintVoiceButton() {
    if (!bigBtn) return;
    bigBtn.textContent = !running ? "\u25B6 Start"
      : (listening ? "\u25CF Listening" : "\u25CB On");
    bigBtn.style.background = "";
    bigBtn.style.color = "";
    bigBtn.style.borderColor = "";
    bigBtn.classList.toggle("primary", !running);
    bigBtn.classList.toggle("on", !!running);
  }

  // THE VOICE BUTTONS LOOK LIKE THE PAGE'S BUTTONS (w32).
  // The shared UI sizes its buttons inline - 12px text, 6px
  // padding - which is right floating over lichess.org and
  // wrong in a panel above "Find an opponent", where they
  // read as a smaller, different kind of control. The inline
  // sizing is CLEARED rather than overwritten, so the
  // stylesheet is the single place the look is decided; only
  // what a stylesheet cannot know is set from here - a fixed
  // width so the row does not twitch as the label changes.
  //
  // THIS USED TO SAY "the state colour" TOO, and it was wrong
  // (w54): the stylesheet knew that colour perfectly well, in
  // --accent and --button-on, and the code was writing the
  // same two hex values in by hand a few lines up. A comment
  // that names an exception keeps the exception alive long
  // after it has stopped being one.
  function adoptPageButtonLook(b) {
    if (!b || !b.style) return;
    ["fontSize", "padding", "borderRadius", "lineHeight",
     "width", "height", "minHeight", "fontWeight",
     "border", "borderColor", "display", "gap"].forEach(function (k) {
      b.style[k] = "";
    });
    b.style.flex = "0 0 auto";
    b.style.touchAction = "manipulation";
  }

  function restyleVoiceButton() {
    if (!bigBtn) return;
    adoptPageButtonLook(bigBtn);
    bigBtn.style.minWidth = "124px";
    bigBtn.style.textAlign = "center";
    paintVoiceButton();
  }

  // colorWord (parsing.js) is the SPOKEN form and stays lower
  // case - a voice does not read capitals. This is the same
  // word for the eye, where a colour is a proper name on a
  // score sheet.
  function colourLabel(c) {
    var w = colorWord(c);
    return w.charAt(0).toUpperCase() + w.slice(1);
  }

  var statusLine, clockLine, turnLine;

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

  function renderPageClocks() {
    if (!clockLine) return;
    if (!api.pos || api.wtime == null) { clockLine.innerHTML = ""; return; }
    // WHITE AND BLACK, NOT YOU AND THEM (w39). The board
    // above is drawn from your side and the colours are what
    // the game is actually about; "you/them" made the reader
    // translate twice. White is always first, as it is in
    // every score sheet ever written. WHICH ONE IS YOURS is
    // still marked - the "mine" class, and its low-time
    // colour - so nothing was lost by naming them properly.
    var mine = api.myColor || "w";
    function side(colour) {
      var left = remainingMs(colour);
      var isMine = colour === mine;
      var low = isMine && left != null && left < 60000;
      return '<span class="' + (isMine ? "mine" : "") +
        (low ? " low" : "") + '">' + colourLabel(colour) + " " +
        fmtClock(left) + "</span>";
    }
    clockLine.innerHTML = side("w") + " &nbsp; " + side("b");
  }

  function renderTurn() {
    if (!turnLine) return;
    if (!api.pos) { turnLine.textContent = ""; return; }
    if (api.over) { turnLine.textContent = "Game over."; return; }
    // "- that is you" REMOVED at w21 by the owner: the board
    // is drawn from your side and the clocks say you/them, so
    // the suffix repeated what the whole panel already shows.
    turnLine.textContent = colourLabel(api.pos.turn) + " to move.";
  }

  // Once a game exists, THE GAME IS THE STATUS (w13). Seek and
  // challenge messages stand only while there is no game to
  // report. It also carries THE ONE THING A NEW PLAYER CANNOT
  // GUESS: iOS will not open a microphone without a real tap,
  // so the voice button must be pressed once per session - a
  // rule of the platform, not a choice here (see mic.js).
  function renderStatus() {
    if (!api.gameId || api.gameId === "PRACTICE") {
      if (dryRun) uiStatus("Practice mode.");
      return;                     // no game: leave the
                                  // seek/challenge message
    }
    if (api.over) { uiStatus("Game over."); return; }
    if (!running) {
      uiStatus("Playing. Tap the Start button to turn on voice.");
      return;
    }
    uiStatus("Playing.");
  }

  // The one hook for "the game state moved": board, clocks,
  // turn line, buttons, status, all from one place.
  function uiGameChanged() {
    renderMiniBoard();
    renderPageClocks();
    renderTurn();
    renderAccount();
    renderButton();
    renderStatus();
  }

  // The signed-in green is the SAME green the buttons use for
  // "on", because it means the same thing: this is running.
  // It lives in the stylesheet as .panel button.on since w54 -
  // it was a pair of hex constants here, which is how it came
  // to be typed out twice.
  var signInBtn, signOutBtn, seekBtn, seekCancelBtn, challengeBtn;

  function renderAccount() {
    var signedIn = !!storedToken();
    if (signInBtn) {
      // ONE control, both facts (w9/w12). Signed out it is
      // the way in and says so. Signed in it becomes the
      // account itself: the name is the label, the green is
      // the state, and it is NOT a button any more - tapping
      // a name should not do anything. Sign out is how you
      // leave. The name is not repeated in the status line:
      // that line says what is HAPPENING, this says WHO.
      // BOTH STATES BY CLASS (w54). This element carried both
      // idioms at once - an inline colour for signed IN, a
      // class toggle for signed OUT - on the same button, so
      // which one decided the look depended on which branch
      // ran last. That is exactly the split ownership w36 was
      // about. The green is the same green the voice button
      // uses, because it means the same thing, and now they
      // are the same rule rather than the same hex typed twice.
      signInBtn.textContent = api.myName || "Sign in with Lichess";
      signInBtn.style.cursor = api.myName ? "default" : "";
      signInBtn.style.background = "";
      signInBtn.style.color = "";
      signInBtn.style.borderColor = "";
      signInBtn.classList.toggle("primary", !api.myName);
      signInBtn.classList.toggle("on", !!api.myName);
    }
    if (signOutBtn) signOutBtn.disabled = !signedIn;
    var inGame = !!api.gameId && api.gameId !== "PRACTICE" && !api.over;
    if (seekBtn) seekBtn.disabled = !signedIn || inGame || !!seekAbort;
    if (seekCancelBtn) seekCancelBtn.disabled = !seekAbort;
    if (challengeBtn) challengeBtn.disabled = !signedIn || inGame;
  }

  function el(id) { return document.getElementById(id); }

  // The opponent dropdown remembers its choice (the one
  // per-page setting; everything behavioural is CFG in the
  // shared settings panel).
  var OPPONENT_KEY = "audioplay.web.opponent";

  // TIME CONTROL IS A PICKED PRESET (w33), remembered like
  // the opponent. The truth lives in one place - the picked
  // state - and seek and challenge both read it through
  // selectedTimeControl(), never the DOM. The Custom box
  // selects itself the moment its text parses as #+#, and
  // holds the selection while being edited even when
  // invalid; only ACTING on an invalid custom (seek or
  // challenge) says so, in the status line, because
  // interrupting typing to complain is worse than waiting
  // to be asked.
  // NO DEFAULT, BUT THE LAST CHOICE IS REMEMBERED (w35).
  // The distinction the owner drew, and it is a real one:
  // a FIRST visit has nothing picked, because the page has
  // no business guessing; a LATER visit restores what you
  // chose, because you already told it. w33 had a built-in
  // 15+10 default (wrong: never chosen by anyone), w34
  // removed the memory with it (wrong the other way: it
  // made you re-pick something you had already decided).
  // Null means "not chosen yet" and nothing else, which is
  // why clearing the Custom box un-picks rather than
  // falling back to anything.
  var TIME_KEY = "audioplay.web.timecontrol";
  var pickedTime = null;

  function parseTimeControl(text) {
    var m = /^\s*(\d{1,3})\s*\+\s*(\d{1,3})\s*$/.exec(text || "");
    if (!m) return null;
    var mins = +m[1], inc = +m[2];
    if (mins < 1 || mins > 180 || inc > 60) return null;
    return { minutes: mins, increment: inc };
  }

  function selectedTimeControl() {
    if (!pickedTime) return null;
    if (pickedTime === "custom") {
      return parseTimeControl(el("timeCustom").value);
    }
    return parseTimeControl(pickedTime);
  }

  function paintTimeRow() {
    var box = el("timeCustom");
    Array.prototype.forEach.call(
      document.querySelectorAll("#timeRow button.tc"),
      function (b) {
        b.classList.toggle("picked",
          b.getAttribute("data-tc") === pickedTime);
      });
    // the same class the presets use, so one CSS rule
    // decides what "picked" looks like for all ten
    if (box && box.classList) {
      box.classList.toggle("picked", pickedTime === "custom");
    }
  }

  function pickTime(value) {
    pickedTime = value;
    try {
      if (!value) localStorage.removeItem(TIME_KEY);
      else localStorage.setItem(TIME_KEY, value === "custom"
        ? "custom:" + el("timeCustom").value : value);
    } catch (e) {
      // Safari refuses localStorage in some privacy modes.
      // The pick still works for this session; only the
      // remembering is lost, and saying so beats silence.
      log("ERR", "could not save time control: " + e.message);
    }
    paintTimeRow();
  }

  function wireTimeRow() {
    Array.prototype.forEach.call(
      document.querySelectorAll("#timeRow button.tc"),
      function (b) {
        b.addEventListener("click", function () {
          pickTime(b.getAttribute("data-tc"));
        });
      });
    var box = el("timeCustom");
    if (box) {
      box.addEventListener("input", function () {
        if (parseTimeControl(box.value)) pickTime("custom");
        else if (pickedTime === "custom") pickTime(null);
      });
      // TAPPING BACK INTO A CUSTOM TIME RE-PICKS IT (w37).
      // "input" fires only when the text CHANGES, so a box
      // that already said 40+30 could not be chosen again
      // after a preset was pressed: it took the cursor and
      // stayed dark, with no way back to green short of
      // retyping. Focus is the missing event - the box is a
      // button you type in, and pressing a button that
      // already holds a valid time is a choice like any
      // other. An EMPTY box on focus changes nothing: the
      // current pick stands until the typing parses.
      box.addEventListener("focus", function () {
        if (parseTimeControl(box.value)) pickTime("custom");
      });
    }

    // A LATER VISIT PICKS UP WHERE THE LAST ONE LEFT OFF.
    // Anything unreadable is treated as never chosen, not
    // as an error: a stale or hand-edited value should
    // leave a clean row, not a broken one.
    var saved = "";
    try { saved = localStorage.getItem(TIME_KEY) || ""; }
    catch (e) { log("ERR", "could not read time control: " + e.message); }
    if (saved.indexOf("custom:") === 0) {
      var custom = saved.slice(7);
      if (parseTimeControl(custom)) {
        if (box) box.value = custom;
        pickedTime = "custom";
      }
    } else if (parseTimeControl(saved)) {
      pickedTime = saved;
    }
    paintTimeRow();
  }

  function buildWebUI() {
    buildUI();                    // the shared button row et al
    statusLine = el("lichessLine");
    clockLine = el("clockLine");
    turnLine = el("turnLine");
    signInBtn = el("btnSignIn");
    signOutBtn = el("btnSignOut");
    seekBtn = el("btnSeek");
    seekCancelBtn = el("btnSeekCancel");
    challengeBtn = el("btnChallenge");

    signInBtn.addEventListener("click", function () {
      if (api.myName) return;     // a label when signed in (w12)
      signIn();
    });
    signOutBtn.addEventListener("click", function () {
      signOut();
      renderButton();
    });

    seekBtn.addEventListener("click", function () {
      var tc = selectedTimeControl();
      if (!tc) {
        uiStatus(pickedTime ? "Custom time looks like 10+5."
                            : "Pick a time control first.");
        return;
      }
      startSeek(tc.minutes, tc.increment, el("seekRated").checked);
      renderAccount();
    });
    seekCancelBtn.addEventListener("click", function () {
      cancelSeek();
      renderAccount();
    });

    // "someone else" reveals the name box rather than having
    // two controls compete for the same job (w3)
    var oppSel = el("challengeWho"), oppOther = el("challengeOther");
    function opponentName() {
      return oppSel.value === "other" ? oppOther.value : oppSel.value;
    }
    function syncOpponent() {
      oppOther.style.display = oppSel.value === "other" ? "" : "none";
      try { localStorage.setItem(OPPONENT_KEY, opponentName()); }
      catch (e) {}
    }
    var savedOpp = "";
    try { savedOpp = localStorage.getItem(OPPONENT_KEY) || ""; }
    catch (e) {}
    if (savedOpp && ["maia1", "maia5", "maia9"].indexOf(savedOpp) < 0) {
      oppSel.value = "other";
      oppOther.value = savedOpp;
    } else if (savedOpp) {
      oppSel.value = savedOpp;
    }
    wireTimeRow();
    syncOpponent();
    oppSel.addEventListener("change", syncOpponent);
    oppOther.addEventListener("change", syncOpponent);

    challengeBtn.addEventListener("click", function () {
      var tc = selectedTimeControl();
      if (!tc) {
        uiStatus(pickedTime ? "Custom time looks like 10+5."
                            : "Pick a time control first.");
        return;
      }
      sendChallenge(opponentName(), tc.minutes, tc.increment,
                    el("seekRated").checked, el("challengeColour").value);
    });

    // WEB (w21): the button row joins the page. Floating
    // bottom-right was the right shape OVER lichess.org;
    // over our own page it covered the hints and the
    // challenge row. buildUI() is untouched - the row is
    // re-parented into the Voice panel and restyled to
    // flow. The settings and log panels stay overlays
    // (transient, closable), but the settings anchor
    // assumed the button was near the bottom, so opening
    // now pins the panel BELOW the button instead.
    var host = el("panelControls");
    if (host && wrapEl) {
      // REVERSED (w27, fixed w28): the userscript builds the
      // row with the buttons first and the voice button last,
      // because there it sits in the bottom-right corner
      // where the button lands nearest the thumb. On the
      // page the row starts at the left margin and the
      // owner wants the button first. row-reverse flips the
      // ORDER without touching buildUI's append sequence,
      // so the shared code stays re-copyable.
      //
      // IT MUST GO ON THE INNER ROW. wrapEl is a wrapper
      // whose only child is the row that actually holds the
      // buttons and the button (see buildUI: row.appendChild
      // x5, then wrapEl.appendChild(row)). w27 styled
      // wrapEl, reversing a list of ONE, and nothing moved
      // on screen. Reached as firstChild rather than by
      // name because `row` is a local inside buildUI.
      wrapEl.style.cssText =
        "display:flex;align-items:center;gap:8px;flex-wrap:wrap;";
      restyleVoiceButton();
      // BUTTON FIRST BY MOVING THE NODE, NOT BY REVERSING
      // THE ROW (w31). w27-w30 flipped the row with
      // row-reverse, which is fine on one line and wrong
      // the moment it wraps: reverse fills lines in reverse
      // too, so on an iPhone in portrait the first line
      // came out "Clock Log Practice" and Start fell to the
      // LAST line - the opposite of the point. Moving the
      // node makes the DOM order the reading order, so
      // wrapping does the obvious thing at any width.
      // buildUI is still untouched; this is the same kind
      // of after-the-fact move as re-parenting the row.
      // The order is stated outright rather than inherited
      // from buildUI's append sequence: Start first, then
      // Settings, and Practice LAST - it is the one button
      // that quietly stops moves reaching Lichess, so it
      // sits furthest from the button pressed every game.
      // appendChild moves a node that already has a parent,
      // so re-appending in order IS the reorder.
      var buttonRow = wrapEl.firstChild;
      if (buttonRow && buttonRow.appendChild) {
        [bigBtn, settingsBtn, clockBtn, logBtn, practiceBtn]
          .forEach(function (b) {
            if (!b) return;
            if (b !== bigBtn) adoptPageButtonLook(b);
            buttonRow.appendChild(b);
          });
        buttonRow.style.flexWrap = "wrap";
        buttonRow.style.gap = "8px";
        buttonRow.style.rowGap = "8px";
      }
      host.appendChild(wrapEl);
      if (settingsBtn && setPanel) {
        settingsBtn.addEventListener("click", function () {
          if (setPanel.style.display === "none") return;
          // ANCHORED TO THE BUTTON IN BOTH AXES (w24). The
          // userscript pins the panel right:10px because its
          // buttons live in the bottom-right corner, so the
          // right edge WAS the button. Here the button is top
          // left; w21 fixed the vertical half and left the
          // panel opening "below the button but at the far
          // right" - the owner rightly asked if that was on
          // purpose. It opens under the button, left-aligned,
          // clamped so it never runs off a narrow screen.
          var r = settingsBtn.getBoundingClientRect();
          var w = window.innerWidth || 1024;
          setPanel.style.bottom = "auto";
          setPanel.style.top = Math.max(8, r.bottom + 8) + "px";
          setPanel.style.right = "auto";
          setPanel.style.left =
            Math.max(8, Math.min(r.left, w - 270)) + "px";
        });
      }
    }

    // NO DOUBLE-TAP ZOOM ON THE OVERLAYS (w25). Two quick
    // taps on two settings pills read as a double-tap and
    // Safari zoomed the page. The page's own buttons are
    // covered by the scoped .panel button CSS, and the button
    // row picked that up when it moved into the Voice panel
    // (w21) - but the settings and log panels attach to
    // document.body, OUTSIDE any .panel, so the same w21
    // scoping that fixed their pill sizes also took
    // touch-action away from them. Set inline, on the
    // panels and every button in them. (user-scalable=no in
    // the viewport meta does not help: iOS ignores it for
    // accessibility, by design.)
    [setPanel, logPanel].forEach(function (p) {
      if (!p) return;
      p.style.touchAction = "manipulation";
      if (!p.querySelectorAll) return;   // harness stub
      Array.prototype.forEach.call(
        p.querySelectorAll("button"), function (b) {
          b.style.touchAction = "manipulation";
        });
    });

    restorePanels();
    renderAccount();
    log("UI", "page ready");
  }

  // WHICH PANELS ARE OPEN IS REMEMBERED (w19). The <details>
  // elements reset to their markup state on every load, and
  // refreshes are frequent here - a hard reload is how a new
  // build is picked up. Keyed by the PANEL id the markup
  // already carries.
  var PANELS_KEY = "audioplay.panels";

  function panelDetails() {
    return document.querySelectorAll(".panel[id] > details");
  }

  function savePanels() {
    var state = {};
    Array.prototype.forEach.call(panelDetails(), function (d) {
      state[d.parentNode.id] = d.open;
    });
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(state));
    } catch (e) {
      // Safari refuses localStorage in some privacy modes,
      // and silence here would look exactly like the
      // feature not working at all
      log("ERR", "could not save panel state: " + e.message);
    }
  }

  function restorePanels() {
    var state = null;
    try {
      var raw = localStorage.getItem(PANELS_KEY);
      if (raw) state = JSON.parse(raw);
    } catch (e) {
      log("ERR", "could not read panel state: " + e.message);
    }
    Array.prototype.forEach.call(panelDetails(), function (d) {
      var id = d.parentNode.id;
      if (state && id in state) d.open = !!state[id];
      d.addEventListener("toggle", savePanels);
    });
  }
