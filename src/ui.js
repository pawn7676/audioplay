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


  var wrapEl, bigBtn, logPanel, logBtn, practiceBtn, clockBtn,
      settingsBtn;

  /* THE SHARED UI'S PAINT POTS - the stylesheet's values, in
   * the one place that cannot read the stylesheet.
   *
   * buildUI() builds its buttons with inline styles because it
   * was written to float over lichess.org, where no CSS of
   * ours could reach them. On our own page that means every
   * colour it uses is a SECOND copy of a value :root already
   * holds - "duplicated where no stylesheet could see them
   * drift", as the stylesheet's own w54 note put it. At w92 it
   * did drift: --button-on moved and this file's copy did not,
   * so the settings pills wore last week's green until the
   * owner caught it in a screenshot (w93).
   *
   * Until w102 only two of them were named; the rest were
   * hex literals sprinkled through the style strings below -
   * six copies of the blue, six of the border, three of the
   * amber. Now every value that :root also holds is named
   * here, once, and the harness compares this block against
   * the stylesheet. To change one of these colours, change
   * both files; the suite says so if you forget. */
  var BUTTON_OFF = "#242220";       /* = --btn-bg  */
  var BUTTON_ON = "#3a5a2a";        /* = --button-on (w101) */
  var BUTTON_TEXT_ON = "#f2f2ef";   /* = --bright  */
  var BLUE = "#91bddf";             /* = --blue, w102's rename */
  var BORDER = "#3a3530";           /* = --border */
  var AMBER = "#d0a24c";            /* = --amber (w104) */
  /* UI-ONLY, with no twin in :root and so nothing to pin: the
   * settings panel's own surface and its two text weights, and
   * the log body's green-grey. They exist only inside the
   * built panels. */
  var PANEL_BG = "#171513";
  var PANEL_HEAD = "#7d766e";
  var PANEL_LABEL = "#c9c2b8";
  var LOG_TEXT = "#9fb0a0";

  // A lit button means that thing is currently ON, matching
  // the voice button. Called from renderButton so every
  // control is repainted from one place.
  function paintButton(el, on, offColor) {
    if (!el) return;
    el.style.background = on ? BUTTON_ON : BUTTON_OFF;
    // the clock box's own white (w94), softened with it at
    // w95: one --bright for everything lit, and the clock is
    // the standard the buttons follow
    el.style.color = on ? BUTTON_TEXT_ON : offColor;
  }

  function renderButton() {
    paintButton(practiceBtn, dryRun, AMBER);
    paintButton(logBtn, !!(logPanel && logPanel.style.display !== "none"),
              BLUE);
    paintButton(clockBtn, clockModeOn(), BLUE);
    paintButton(settingsBtn, settingsRowOpen(), BLUE);
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
        // WEB (delta 3): dryStart took over the api state;
        // hand it back and pick up a live game if one exists
        api.gameId = null; api.pos = null;
        api.moves = []; api.over = false; api.overText = "";
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
    clockBtn.textContent = "Clock";   /* WEB w30: capitalised */
    clockBtn.style.cssText = logBtn.style.cssText;
    clockBtn.addEventListener("click", function () {
      toggleClockMode();
    });

    // THE SETTINGS BUTTON DIED AT w117 AND RETURNED AT w120,
    // the owner's order both times. w117 ("dump the settings
    // menu. not needed") killed a panel that had shrunk to
    // one cosmetic switch carrying a button, a fixed-position
    // panel, an outside-tap closer and a localStorage blob.
    // w120 added a second choice - how moves are spoken
    // (settings.js) - and the owner wanted both on the page,
    // not in the source. What returned is smaller than what
    // died: the button shows and hides a plain row in the
    // page markup (#settingsRow, wired by wireSettings
    // below), so the button is its own exit - the w69 lesson
    // - and there is no panel, no anchor, no blob. It is lit
    // while the row is open, like the log button beside it.
    settingsBtn = document.createElement("button");
    settingsBtn.textContent = "Settings";
    settingsBtn.style.cssText = logBtn.style.cssText;
    settingsBtn.addEventListener("click", function () {
      toggleSettingsRow();
    });

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
    // WEB: no "token" button - sign-in is PKCE, Sign out is on
    // the page (delta 1 in the header)
    // WEB (w30): capitalised, like every other button on
    // the page. `name` stays lower case - it is the switch
    // value below, not a label.
    ["copy", "clear", "close"].forEach(function (name) {
      var b = document.createElement("button");
      b.textContent = name.charAt(0).toUpperCase() + name.slice(1);
      b.style.cssText =
        "font-size:12px;padding:6px 12px;border-radius:8px;background:" + BUTTON_OFF + ";" +
        "color:" + BLUE + ";border:1px solid " + BORDER + ";";
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
      "margin:0;padding:8px;flex:1;overflow:auto;color:" + LOG_TEXT + ";font-size:11px;" +
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
        // and the same halfway flip lived here (w90): voice
        // back ON during practice dropped dryRun with the
        // practice board still up. Practice now survives the
        // voice button in BOTH directions; the practice
        // button is what ends it.
        startListening();
        // WEB (delta 2): no connect() - sign-in owns the
        // connection; the button owns the voice. The two
        // spoken hints cover the states a blind start hits.
        // SPELLED FOR THE EAR, NOT THE EYE (w39): every
        // English voice reads "lichess" as "LITCH-ess". It
        // is spoken text, so it is spelled the way it
        // should sound; the site's name is still written
        // correctly everywhere it is READ.
        // IN PRACTICE, THE ONLY TRUE HINT IS "VOICE ON" (w92).
        // The sign-in and waiting-for-a-game lines below assume
        // voice-on means heading into a real game; they predate
        // practice surviving this button (w90). Mid-practice,
        // "sign in first" is a non-sequitur - practice needs no
        // token - and the owner heard exactly that and asked.
        if (dryRun) speak("voice on.");
        else if (!storedToken()) speak("sign in with lee chess first.");
        else if (!api.gameId) speak("voice on. waiting for a game.");
        // AND PICK THE GAME BACK UP (w50). Voice off leaves the
        // stream alone by design, but the stream can still die
        // on its own while voice is off - and scheduleReconnect
        // used to refuse to act unless voice was on, so nothing
        // was left to notice. Turning voice back on is the one
        // moment we know the user expects to be connected, so
        // it is the right place to make sure we are. This
        // called startStream directly until w81, reasoning
        // that aborting its own predecessor meant it "cannot
        // double up" - true of the STREAMS, false of the
        // announcements: restarting a healthy stream
        // re-delivers gameFull, and a game joined seconds
        // before the tap heard "connected... reconnected..."
        // back to back. ensureStream restarts only a stream
        // that has actually gone quiet (see lichess.js).
        else if (api.gameId && api.gameId !== "PRACTICE" && !api.over) {
          ensureStream();
        }
      } else {
        // VOICE OFF NO LONGER ENDS PRACTICE (w90). dryRun was
        // flipped false here, which did two wrong things at
        // once. It ended practice SILENTLY and HALFWAY: the
        // practice board and gameId stayed up, only the flag
        // dropped - unreachable while voice was the only way
        // to move, but from w86 a board TAP in that half-state
        // would have POSTed a move to a "game" called PRACTICE
        // on the real Lichess API, token and all. And it stood
        // in the way of the mic-isolation experiment the owner
        // asked for during the lag hunt: practice with the mic
        // CLOSED is now a mode that works - taps move, the
        // opponent still replies aloud - and the practice
        // button remains the one thing that ends practice,
        // tearing it down properly (rejoinCurrent) instead of
        // halfway.
        pauseMic();
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
  // THE WORDS WERE SHORT BECAUSE THE PANEL WAS THE SUBJECT
  // (w30): the heading above said VOICE, so the button said
  // only "Start". w76 dropped the heading - the account
  // button joined the row, so VOICE no longer named the
  // panel's contents - and the noun moved into the label:
  // "Voice Mode", the owner's wording, with the triangle
  // already carrying "start". The on-states keep w30's
  // choice: "Listening" and "On" are STATES, and the useful
  // fact is whether the mic is live - which "Stop" would
  // hide.
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
    bigBtn.textContent = !running ? "\u25B6 Voice Mode"
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
    bigBtn.style.minWidth = "140px";
    bigBtn.style.textAlign = "center";
    paintVoiceButton();
  }

  var statusLine;
  var clockTop, clockBottom, nameTop, nameBottom;   /* w70 rail */

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

  /* THE BOARD'S OWN SHAPE (w70). Two clocks and two names in
   * a rail beside the board, far side at the top and yours at
   * the bottom - the Lichess arrangement, and the reason is
   * the one the owner gave: not that the small clocks are read
   * from across the room (clock mode is what that is for) but
   * that the page should LOOK like the thing it talks to.
   *
   * ORDERED BY THE BOARD, NOT BY COLOUR, which reverses w39
   * for this one layout and is worth saying why. w39 chose
   * white-then-black for a HORIZONTAL line, where left and
   * right mean nothing and "you and them" made the reader
   * translate twice. A rail beside the board is different in
   * kind: top and bottom here DO mean something, because the
   * board next to it is drawn from your side and flips with
   * your colour. A rail that ignored that would put your clock
   * level with their pieces.
   *
   * THE COLOUR WORDS ARE GONE (w71). w70 wrote White and
   * Black beside the digits and the owner called it
   * superfluous on sight - the board is right there, and the
   * rail is ordered by it. What w39 was protecting (never
   * "you/them") is not betrayed; the sides are simply not
   * captioned at all, as on Lichess itself.
   *
   * ONE PAIR OF FUNCTIONS FOR BOTH ROWS, because clocks and
   * names are one block, positioned relative to each other.
   */
  function sideOf(top) {
    var mine = api.myColor || "w";
    return top ? (mine === "w" ? "b" : "w") : mine;
  }

  /* ESCAPED, because these strings come from Lichess and are
   * chosen by other people: a username cannot contain markup
   * today, but this is built with innerHTML and the cost of
   * being sure is four replaces. */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* THE CLOCK IS THE TURN INDICATOR (w71), as on Lichess:
   * white digits always, box colour carrying the state.
   * Green = that side to move; red = under a minute; dark
   * grey = waiting. Dimming is ORTHOGONAL to colour (w72):
   * the waiting side dims whatever colour its box is, so a
   * low clock stays red through the opponent's move - just
   * noticeably darker. w71 tied red to the running clock and
   * the owner overruled it, with Lichess as the precedent:
   * below the threshold the box turns red and STAYS red. A
   * finished game shows its boxes at full brightness -
   * nobody is to move, nobody is "waiting". */
  function clockCell(colour) {
    var left = remainingMs(colour);
    var toMove = !api.over && api.pos && api.pos.turn === colour;
    var low = left != null && left < 60000;
    var colourCls = low ? "low" : (toMove ? "turn" : "");
    var dimCls = (!toMove && !api.over) ? "idle" : "";
    var cls = ("cbox " + colourCls + " " + dimCls)
      .replace(/\s+/g, " ").trim();
    return '<span class="' + cls + '">' + fmtClock(left) + "</span>";
  }

  /* THE OPPONENT HAD NO NAME ANYWHERE until w68. gameFull has
   * carried both players since w1; the page read white.id to
   * decide your colour and dropped the rest, so the one thing
   * you could not learn from this page was who you were
   * playing. */
  function nameCell(colour) {
    var pl = (api.players || {})[colour];
    if (!pl) return "";
    // The name is unconditional since w75 - the switch that
    // could hide it is gone, so the rating can never be the
    // only thing here and needs no guard of its own.
    // BOT IS ITS OWN KIND OF TITLE (w105), and Lichess says so
    // in fuchsia while the human ranks stay gold. The class
    // carries WHICH, the stylesheet owns what each looks like
    // (constraint 6). Compared against the literal Lichess
    // sends, which is upper-case "BOT".
    var titleCls = pl.title === "BOT" ? "title bot" : "title";
    var parts = [(pl.title
      ? '<span class="' + titleCls + '">' + esc(pl.title) + "</span> " : "") +
      esc(pl.name)];
    if (SHOW_RATINGS && pl.rating != null) {
      parts.push('<span class="rating">' + esc(pl.rating) + "</span>");
    }
    // THE NAME ROW NEVER DIMS (w81). w72's idle class was
    // mirrored here from the clocks, and on the device the
    // waiting side's name and rating sank below readable -
    // .55 on the row times .65 on the rating. Dimming is the
    // CLOCK's turn signal; whose turn it is says nothing
    // about who the players ARE.
    //
    // AND IT NO LONGER MARKS WHICH ONE IS YOURS (w103). This
    // wrapped the parts in a span carrying a "mine" class for
    // one CSS rule that tinted your own name; both are gone,
    // so the wrapper has nothing left to carry.
    return parts.join(" ");
  }

  function renderPageClocks() {
    if (!clockTop || !clockBottom) return;
    var live = api.pos && api.wtime != null;
    clockTop.innerHTML = live ? clockCell(sideOf(true)) : "";
    clockBottom.innerHTML = live ? clockCell(sideOf(false)) : "";
  }

  function renderPlayers() {
    if (!nameTop || !nameBottom) return;
    var live = api.pos && (api.players.w || api.players.b);
    nameTop.innerHTML = live ? nameCell(sideOf(true)) : "";
    nameBottom.innerHTML = live ? nameCell(sideOf(false)) : "";
  }

  // Once a game exists, THE GAME IS THE STATUS (w13). Seek and
  // challenge messages stand only while there is no game to
  // report. It also carries THE ONE THING A NEW PLAYER CANNOT
  // GUESS: iOS will not open a microphone without a real tap,
  // so the voice button must be pressed once per session - a
  // rule of the platform, not a choice here (see mic.js).
  /* Spoken sentences are written in lower case for the ear;
   * on screen every sentence in one wants its capital (w106).
   * Two of them are two sentences long - "checkmate. white
   * wins." - so this capitalises after each stop, not just at
   * the front. */
  function sentenceCase(s) {
    return String(s).replace(/(^|[.!?]\s+)([a-z])/g,
      function (_, lead, ch) { return lead + ch.toUpperCase(); });
  }

  function renderStatus() {
    if (!api.gameId || api.gameId === "PRACTICE") {
      if (dryRun) uiStatus("Practice mode.");
      return;                     // no game: leave the
                                  // seek/challenge message
    }
    // THE RESULT IS SHOWN, NOT ONLY SPOKEN (w106). This said
    // "Game over." - true of every ending and descriptive of
    // none, so the one thing a finished game is FOR was
    // available solely to whoever heard the announcement. The
    // sentence api.overText holds is the same one that was
    // spoken; sentenceCase is the only thing done to it,
    // because it was written for the ear in lower case. Voice
    // stays off when it is off: the screen picks up the slack,
    // the speaker does not override the button.
    if (api.over) {
      uiStatus(api.overText ? sentenceCase(api.overText) : "Game over.");
      return;
    }
    if (!running) {
      uiStatus("Playing. Tap the Voice Mode button to turn on voice.");
      return;
    }
    uiStatus("Playing.");
  }

  // The one hook for "the game state moved": board, clocks,
  // turn line, buttons, status, all from one place.
  function uiGameChanged() {
    renderMiniBoard();
    renderPageClocks();
    renderPlayers();
    renderAccount();
    renderButton();
    renderStatus();
  }

  // The signed-in green is the SAME green the buttons use for
  // "on", because it means the same thing: this is running.
  // It lives in the stylesheet as .panel button.on since w54 -
  // it was a pair of hex constants here, which is how it came
  // to be typed out twice.
  var signInBtn, seekBtn, seekCancelBtn, challengeBtn;

  // THE SIGN-OUT IS A QUESTION FIRST (w77). w76 merged
  // sign-in and sign-out into this one button and wrote the
  // action into the resting label - "name - Sign out" -
  // which fixed the dead button (w12's tappable-but-inert
  // name) and cost two smaller things: a stray tap signed
  // you out on the spot, and the label said two things at
  // once. Both end the same way: at rest the button is the
  // NAME alone - w12's label, made honest - and the first
  // tap only ASKS. "Sign out?" stands for SIGNOUT_ARM_MS;
  // the second tap answers, and any other tap or the timer
  // cancels, because a question that can be asked must be
  // cancellable (rule 5). Precedents: the Copy button's
  // timed revert, the challenge button doubling as its own
  // cancel (w71), the settings panel's tap-outside (w69).
  // The flag is CONSULTED BY renderAccount, not painted
  // over it, so the twice-a-second repaint tick cannot
  // un-ask the question.
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

  function renderAccount() {
    var signedIn = !!storedToken();
    if (signInBtn) {
      // Signed out, the way in, and says so (w9/w12). Signed
      // in, the name - not repeated in the status line: that
      // line says what is HAPPENING, this says WHO - or the
      // standing question while armed. WHICH state is a
      // class; what each looks like is the stylesheet's
      // (w54): blue primary = press me, green on = running,
      // warn confirm = this tap acts, and it is a leaving.
      signInBtn.textContent = !api.myName ? "Sign in with Lichess"
        : (signOutArmed ? "Sign out?" : api.myName);
      signInBtn.classList.toggle("primary", !api.myName);
      signInBtn.classList.toggle("on", !!api.myName && !signOutArmed);
      signInBtn.classList.toggle("confirm", !!api.myName && signOutArmed);
    }
    var inGame = !!api.gameId && api.gameId !== "PRACTICE" && !api.over;
    if (seekBtn) seekBtn.disabled = !signedIn || inGame || !!seekAbort;
    if (seekCancelBtn) seekCancelBtn.disabled = !seekAbort;
    // THE SAME BUTTON IS THE WAY OUT (w71). While a challenge
    // waited - and a human, unlike maia, can take a while to
    // accept - the page offered no way to take it back: this
    // button answered "Still waiting on the last challenge."
    // The seek row has a whole second button for this; the
    // challenge row's own button was sitting there disabled-in-
    // spirit, so it becomes the cancel, labelled for what it
    // now does. cancelChallenge aborts the keep-alive stream,
    // which is what actually revokes the challenge on Lichess
    // (w61), so the label is the truth.
    if (challengeBtn) {
      challengeBtn.disabled = !signedIn || inGame;
      challengeBtn.textContent = challengeAbort
        ? "Cancel challenge" : "Challenge";
    }
  }

  function el(id) { return document.getElementById(id); }

  // The opponent dropdown remembers its choice - the one
  // stored per-page preference left, now that the settings
  // panel and its blob are gone (w117; see settings.js).
  //
  // These three carried a ".web." infix until the w111
  // storage audit - minted when "web" distinguished this
  // site from the userscript, which is frozen now, so the
  // infix distinguished nothing. Renamed without
  // migration; the cost was re-picking three dropdowns
  // once, and the old names are scrubbed on boot
  // (scrubDeadStorage, settings.js).
  var OPPONENT_KEY = "audioplay.opponent";
  var RATED_KEY = "audioplay.rated";

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
  var TIME_KEY = "audioplay.timecontrol";
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

  // THE SETTINGS ROW (w120): the truth of "open" is the row's
  // own display, asked, never mirrored in a flag a repaint
  // could drift from. Starts closed every load - a settings
  // row is a place you visit, not a state to remember.
  function settingsRowOpen() {
    var r = el("settingsRow");
    return !!r && r.style.display !== "none";
  }

  function toggleSettingsRow() {
    var r = el("settingsRow");
    if (!r) return;
    r.style.display = settingsRowOpen() ? "none" : "";
    renderButton();
  }

  // Two stored choices, each under its own flat audioplay.*
  // key (the w111 scheme) - NEVER the old blob, which stays
  // dead and scrubbed (settings.js has the story). The
  // selects show the loaded values, so a return visit is the
  // tested second use (w37); loadStoredSettings has already
  // run by the time this wires (boot.js). Each flip is
  // logged, as the userscript always logged its flips, so a
  // pasted log says what the device was set to and when it
  // changed.
  function wireSettings() {
    var row = el("settingsRow");
    var ratings = el("setRatings"), speech = el("setSpeech");
    if (!row || !ratings || !speech) return;
    row.style.display = "none";
    ratings.value = SHOW_RATINGS ? "on" : "off";
    speech.value = MOVE_SPEECH;
    ratings.addEventListener("change", function () {
      SHOW_RATINGS = ratings.value === "on";
      try { localStorage.setItem(RATINGS_KEY, SHOW_RATINGS ? "on" : "off"); }
      catch (e) { log("ERR", "could not save ratings: " + e.message); }
      log("SET", "ratings " + (SHOW_RATINGS ? "on" : "off"));
      // the setting's whole effect is something already on
      // screen, so the flip repaints on the spot
      renderPlayers();
    });
    speech.addEventListener("change", function () {
      if (speech.value === "chess" || speech.value === "hybrid" ||
          speech.value === "nato") {
        MOVE_SPEECH = speech.value;
      }
      try { localStorage.setItem(MOVE_SPEECH_KEY, MOVE_SPEECH); }
      catch (e) { log("ERR", "could not save move speech: " + e.message); }
      log("SET", "moves spoken " + MOVE_SPEECH);
    });
  }

  // the restore half of the rated dropdown (w99), top-level
  // like wireTimeRow for the same reason: the return visit is
  // the second use, and the harness drives it by name
  function wireRated() {
    var savedRated = "";
    try { savedRated = localStorage.getItem(RATED_KEY) || ""; }
    catch (e) {}
    el("seekRated").value = savedRated === "rated" ? "rated" : "casual";
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
      // ONLY IF ITS BUTTON STILL EXISTS (w64). The blitz row
      // was removed, and a device that had 5+3 saved would
      // otherwise restore an INVISIBLE pick: nothing lit,
      // selectedTimeControl() quietly 5+3, and the seek
      // button refusing for a reason nothing on screen
      // shows. A retired preset restores as never chosen.
      var row = document.querySelectorAll("#timeRow button.tc");
      for (var i = 0; i < row.length; i++) {
        if (row[i].getAttribute("data-tc") === saved) {
          pickedTime = saved;
          break;
        }
      }
    }
    paintTimeRow();
  }

  function buildWebUI() {
    buildUI();                    // the shared button row et al
    statusLine = el("lichessLine");
    clockTop = el("clockTop");
    clockBottom = el("clockBottom");
    nameTop = el("nameTop");
    nameBottom = el("nameBottom");
    signInBtn = el("btnSignIn");
    seekBtn = el("btnSeek");
    seekCancelBtn = el("btnSeekCancel");
    challengeBtn = el("btnChallenge");

    // The tap is the whole account UI (w76): the way in when
    // signed out; signed in, the first tap asks and the
    // second answers (w77) - armSignOut, by renderAccount.
    signInBtn.addEventListener("click", function () {
      if (!api.myName) { signIn(); return; }
      if (signOutArmed) { disarmSignOut(); signOut(); }
      else armSignOut();
    });
    // The question's tap-anywhere cancel - the settings
    // panel's w69 exit, on the same reasoning: guarded on
    // the button itself, whose own listener above already
    // owns what a tap on it means. Cheap while disarmed,
    // which is nearly always.
    document.addEventListener("click", function (e) {
      if (!signOutArmed) return;
      var t = e.target;
      while (t) {
        if (t === signInBtn) return;
        t = t.parentNode;
      }
      disarmSignOut();
    });

    seekBtn.addEventListener("click", function () {
      var tc = selectedTimeControl();
      if (!tc) {
        uiStatus(pickedTime ? "Custom time looks like 10+5."
                            : "Pick a time control first.");
        return;
      }
      startSeek(tc.minutes, tc.increment,
                el("seekRated").value === "rated");
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
    // RATED IS A DROPDOWN, AND IT COMES BACK (w99). Three
    // versions tried to dress the native checkbox (w95 green,
    // w97 native, w98 accent blue - a white checkmark on
    // light blue, no contrast) and the control itself was the
    // problem: most of a checkbox is the OS's to paint. A
    // two-option select wears the page's clothes like
    // everything beside it, says it in Lichess's own words -
    // Rated, Casual - and rides the same storage the opponent
    // row does. Casual unless the stored value says exactly
    // "rated": a missing or junk key must never quietly rate
    // a game.
    el("seekRated").addEventListener("change", function () {
      try { localStorage.setItem(RATED_KEY, el("seekRated").value); }
      catch (e) {}
    });
    wireSettings();
    wireRated();
    wireTimeRow();
    syncOpponent();
    oppSel.addEventListener("change", syncOpponent);
    oppOther.addEventListener("change", syncOpponent);

    challengeBtn.addEventListener("click", function () {
      if (challengeAbort) {          /* w71: the button is the cancel */
        cancelChallenge();
        uiStatus("Challenge cancelled.");
        renderAccount();
        return;
      }
      var tc = selectedTimeControl();
      if (!tc) {
        uiStatus(pickedTime ? "Custom time looks like 10+5."
                            : "Pick a time control first.");
        return;
      }
      sendChallenge(opponentName(), tc.minutes, tc.increment,
                    el("seekRated").value === "rated",
                    el("challengeColour").value);
      renderAccount();
    });

    // WEB (w21): the button row joins the page. Floating
    // bottom-right was the right shape OVER lichess.org;
    // over our own page it covered the hints and the
    // challenge row. buildUI() is untouched - the row is
    // re-parented into the top panel and restyled to
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
      // from buildUI's append sequence: the voice button
      // first, then the two riskiest taps LAST, furthest
      // from the button pressed every game: Practice
      // quietly stops moves reaching Lichess, and the
      // account button (from the markup, joined at w76) is
      // the door to Sign out once signed in, at the end.
      // Settings is back in its old second place (held
      // until w117, returned at w120). appendChild moves a
      // node that already has a parent, so re-appending in
      // order IS the reorder - and it is also how the
      // sign-in button leaves the markup spot it boots in.
      var buttonRow = wrapEl.firstChild;
      if (buttonRow && buttonRow.appendChild) {
        [bigBtn, settingsBtn, clockBtn, logBtn, practiceBtn, signInBtn]
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
    }

    // NO DOUBLE-TAP ZOOM ON THE OVERLAYS (w25). Two quick
    // taps on two panel pills read as a double-tap and
    // Safari zoomed the page. The page's own buttons are
    // covered by the scoped .panel button CSS, and the button
    // row picked that up when it moved into the top panel
    // (w21) - but the log panel attaches to document.body,
    // OUTSIDE any .panel, so the same w21 scoping that fixed
    // its pill sizes also took touch-action away from it.
    // Set inline, on the panel and every button in it.
    // (user-scalable=no in the viewport meta does not help:
    // iOS ignores it for accessibility, by design.)
    [logPanel].forEach(function (p) {
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
  // already carries. (Since w120 the Instructions panel is
  // the only <details> left - the board and the merged
  // controls panel are always open, by the owner's redesign -
  // but the machinery stays general: it walks whatever the
  // markup has, and a stored id the markup no longer folds
  // is simply never asked about.)
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
