  /*========================== CLOCK MODE ==========================*/

  // A full-screen, pure black overlay showing only the two
  // clocks, SIDE BY SIDE (v97): yours on the side set by
  // PLAYER_ON_LEFT_OF_CLOCK, theirs on the other, the side
  // to move drawn HEAVIER (weight, not brightness, since
  // v81/v82; red still means under a minute). On an OLED
  // panel black pixels are OFF, so in a dark room the
  // display reduces to two faint numbers — four if
  // CFG.clockShowMoves is on. Everything else — the mic, speech,
  // the game — runs on underneath: this whole section is
  // only a second renderer over state the script already
  // keeps (remainingMs, lastSanW/B, api.pos.turn), and it
  // touches nothing outside itself.
  //
  // Each side's last move sat under its clock from v73 to
  // v92 and is now off by default: the moves are spoken
  // here, so the rows were repeating the ear. See
  // CFG.clockShowMoves in settings.js, which restores them.
  //
  // In: the "clock" button, and ONLY the button (v98).
  // Out: tap anywhere on it.
  //
  // A screen wake lock is held while the overlay is up, so
  // the iPad does not sleep into the lock screen mid-game.
  // iOS silently drops the lock whenever the app is
  // backgrounded; the visibilitychange listener retakes it
  // when the page returns. With the screen on, none of the
  // screen-off restrictions (mic restarts, audio loss)
  // apply, so this is also the script's most stable
  // operating state.

  var clockOverlay = null, clockTimer = null, clockLock = null;
  // the message strip (v129): the element, and what it
  // holds - { text, until }. Whether the text outlives
  // `until` is decided at tick time by questionOpen(), not
  // stored, so the strip clears itself the moment a
  // question resolves, whatever path resolved it.
  var clockMsgEl = null, clockMsg = null;
  var clockHalves = null;

  function clockModeOn() {
    return !!(clockOverlay && clockOverlay.style.display !== "none");
  }

  // One number only (v78): ticking seconds drew the eye,
  // so above a minute just the whole minutes remain,
  // changing once a minute — and under a minute the number
  // becomes the seconds and the number turns red
  // (LOW_TIME_COLOR). The spoken "clock" still gives
  // minutes and seconds exactly.
  function clockDigits(ms) {
    if (ms == null) return "--";
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    if (s < 60) return String(s);
    return String(Math.floor(s / 60));
  }

  function buildClockOverlay() {
    clockOverlay = document.createElement("div");
    clockOverlay.style.cssText =
      "position:fixed;inset:0;z-index:100000;background:#000;" +
      "display:flex;flex-direction:row;touch-action:none;" +
      "-webkit-user-select:none;user-select:none;cursor:default;";
    clockHalves = {};
    // the halves are LEFT and RIGHT (v97). Which one is
    // yours is PLAYER_ON_LEFT_OF_CLOCK, read at paint time,
    // so "flip clock" is a repaint and never a rebuild.
    ["left", "right"].forEach(function (k) {
      var half = document.createElement("div");
      half.style.cssText =
        "flex:1;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;";
      // weight is set by paintClockHalf every tick (v81:
      // it is the turn signal), so the value here is only
      // what shows for the instant before the first paint
      var time = document.createElement("div");
      time.style.cssText =
        "font-family:system-ui,sans-serif;font-weight:" +
        IDLE_WEIGHT + ";white-space:nowrap;" +
        "line-height:1;font-size:" +
        (CFG.clockShowMoves ? CLOCK_TIME_SIZE : bareDigitSizeCss()) +
        ";font-variant-numeric:tabular-nums;";
      half.appendChild(time);
      // with CFG.clockShowMoves off there is no move row at
      // all: not hidden, never built, so nothing downstream
      // can paint or size it. paintClockHalf tests h.move.
      var move = null;
      if (CFG.clockShowMoves) {
        move = document.createElement("div");
        move.style.cssText =
          "font-family:system-ui,sans-serif;font-weight:" +
          MOVE_WEIGHT + ";white-space:nowrap;" +
          "font-size:" + moveSizeCss("", CLOCK_MOVE_MAX_VW,
            CLOCK_MOVE_MAX_VH, CLOCK_MOVE_BUDGET_VW) +
          ";margin-top:2.5vh;" +
          "letter-spacing:.04em;";
        half.appendChild(move);
      }
      clockOverlay.appendChild(half);
      clockHalves[k] = { time: time, move: move, col: null, wt: null };
    });
    // THE MESSAGE STRIP (v129). Built ALWAYS, even with
    // clockShowMessages off: an empty div costs nothing,
    // and the toggle then gates only the WRITING, in
    // speak(), so it needs none of the teardown-for-
    // rebuild that clockShowMoves pays. Absolute at the
    // foot, so the centred halves never move when it
    // fills.
    clockMsgEl = document.createElement("div");
    clockMsgEl.style.cssText =
      "position:absolute;left:4vw;right:4vw;bottom:2vh;" +
      "text-align:center;font-family:system-ui,sans-serif;" +
      "font-weight:" + MOVE_WEIGHT + ";color:" + TEXT_COLOR + ";" +
      "font-size:" + CLOCK_MSG_SIZE + ";line-height:1.3;";
    clockOverlay.appendChild(clockMsgEl);
    clockOverlay.addEventListener("click", function () {
      exitClockMode(true);
    });
    document.body.appendChild(clockOverlay);
  }

  // The size the bare digits may have, for the widest
  // reading seen so far this session (v97). Monotonic: the
  // count only ever grows, so a game that ticks 100 -> 99
  // does not resize back up and the number never moves
  // under the eye while it is being read.
  var clockDigitsSeen = 2;

  function bareDigitSizeCss() {
    var vw = CLOCK_BARE_BUDGET_VW / (clockDigitsSeen * CLOCK_DIGIT_EM);
    return "min(" + vw.toFixed(2) + "vw," + CLOCK_BARE_MAX_VH + "vh)";
  }

  // Called with every reading painted. Returns true if the
  // size changed and the halves need restyling.
  function noteClockDigits(text) {
    var n = String(text).length;
    if (n <= clockDigitsSeen) return false;
    clockDigitsSeen = n;
    log("CLK", "digits grew to " + n + ", resizing");
    return true;
  }

  // The size a move of this length can have: as large as
  // the ceiling allows, shrunk only enough that its own
  // characters fit the budget (v84). Returns a CSS value;
  // the vh cap stays inside the min() so a tall-and-narrow
  // window cannot push the text past its row.
  function moveSizeCss(text, maxVw, maxVh, budgetVw) {
    var n = Math.max(1, String(text || "").length);
    var vw = Math.min(maxVw, budgetVw / (n * MOVE_CHAR_EM));
    return "min(" + vw.toFixed(2) + "vw," + maxVh + "vh)";
  }

  function paintClockHalf(h, color) {
    var ms = remainingMs(color);
    var digits = clockDigits(ms);
    var active = api.pos && !api.over && api.pos.turn === color;
    // one color for everything (v82); red is the only
    // exception and means "under a minute". The turn is
    // carried by weight alone, so low-and-waiting reads
    // both facts at once.
    var col = ms != null && ms < 60000 ? LOW_TIME_COLOR : TEXT_COLOR;
    // the clock alone carries the turn (v88)
    var wt = active ? ACTIVE_WEIGHT : IDLE_WEIGHT;
    if (h.time.textContent !== digits) {
      h.time.textContent = digits;
      if (!CFG.clockShowMoves && noteClockDigits(digits)) {
        var css = bareDigitSizeCss();
        clockHalves.left.time.style.fontSize = css;
        clockHalves.right.time.style.fontSize = css;
      }
    }
    if (h.move) {
      var mv = (color === "w" ? api.lastSanW : api.lastSanB) || "\u2014";
      if (h.move.textContent !== mv) {
        h.move.textContent = mv;
        h.move.style.fontSize = moveSizeCss(mv, CLOCK_MOVE_MAX_VW,
          CLOCK_MOVE_MAX_VH, CLOCK_MOVE_BUDGET_VW);
      }
    }
    if (h.col !== col) {
      h.col = col;
      h.time.style.color = col;
      if (h.move) h.move.style.color = col;
    }
    if (h.wt !== wt) {
      h.wt = wt;
      h.time.style.fontWeight = wt;
    }
  }

  // Is anything waiting on an answer? The FOUR dialogue
  // states, read live. This is the whole of the sticky
  // rule: no message is classified, the board state is.
  //
  // partialAsk was added to dialogue.js at v117 and never
  // added here, so "say the rank" and "say the target" - the
  // two questions that ask for the least and are easiest to
  // lose track of - were the two whose message expired off the
  // strip while they were still waiting to be answered. A list
  // of states is only right until the next state is added;
  // this one is now the same list dialogue.js keeps.
  function questionOpen() {
    return !!(pending || confirmAction || pieceAsk || partialAsk);
  }

  // SPOKEN TEXT IS WRITTEN FOR THE EAR (v134): lower case
  // throughout, colors and pieces included, because that is
  // what reads naturally out of a TTS engine and because
  // every string was written when speech was the only
  // output. On the strip it looks unfinished - "checkmate.
  // white wins." - so the first letter of each sentence is
  // raised HERE, at the one point where text becomes
  // pixels. Nothing upstream changes: the voice, the log
  // and the source strings all stay as they are, and the
  // strip cannot drift from them because it has no strings
  // of its own.
  //
  // Sentence = start of text, or a . ? ! followed by space.
  // Nothing spoken contains a decimal or an abbreviation
  // (times are "3 minutes 20 seconds"), so there is no
  // false boundary to guard against.
  function sentenceCase(text) {
    return String(text).replace(/(^\s*|[.?!]\s+)([a-z])/g,
      function (all, lead, ch) { return lead + ch.toUpperCase(); });
  }

  function showClockMessage(text) {
    var shown = sentenceCase(text);
    clockMsg = { text: shown, until: Date.now() + CLOCK_MSG_EXPIRE_MS };
    if (clockMsgEl) clockMsgEl.textContent = shown;
  }

  function clearClockMessage() {
    clockMsg = null;
    if (clockMsgEl) clockMsgEl.textContent = "";
  }

  // Called every overlay tick. A question holds the strip
  // for as long as it is open (v81-v88: passing messages
  // expire while questions stay); everything else fades
  // once CLOCK_MSG_EXPIRE_MS is up.
  function tickClockMessage() {
    if (!clockMsg) return;
    if (questionOpen()) return;
    if (Date.now() < clockMsg.until) return;
    clearClockMessage();
  }

  function renderClockMode() {
    if (!clockHalves) return;
    tickClockMessage();
    var mine = api.myColor || "w";
    var theirs = mine === "w" ? "b" : "w";
    var myHalf = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
    var oppHalf = PLAYER_ON_LEFT_OF_CLOCK ? "right" : "left";
    paintClockHalf(clockHalves[myHalf], mine);
    paintClockHalf(clockHalves[oppHalf], theirs);
  }

  // "flip clock" swaps the sides. Nothing is rebuilt: the
  // next tick paints the other way round, within
  // OVERLAY_TICK_MS, so the overlay is never disturbed —
  // which matters, because it cannot be retaken without
  // another tap. CONFIRMED in use.
  function flipClockSides() {
    PLAYER_ON_LEFT_OF_CLOCK = !PLAYER_ON_LEFT_OF_CLOCK;
    var side = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
    log("CLK", "my clock now on the " + side);
    renderClockMode();
  }

  function acquireClockLock() {
    try {
      if (!navigator.wakeLock || !navigator.wakeLock.request) {
        log("CLK", "wake lock unsupported");
        return;
      }
      navigator.wakeLock.request("screen").then(function (lock) {
        clockLock = lock;
        log("CLK", "wake lock held");
      }).catch(function (e) {
        log("CLK", "wake lock refused: " + e.message);
      });
    } catch (e) { log("CLK", "wake lock error: " + e.message); }
  }

  function releaseClockLock() {
    try { if (clockLock) clockLock.release(); } catch (e) {}
    clockLock = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (clockModeOn() && document.visibilityState === "visible") {
      acquireClockLock();
    }
  });

  // NO FULLSCREEN (v108). The overlay fills the viewport
  // under Safari's toolbar. It used to request fullscreen
  // for a black edge-to-edge screen, and the price was the
  // layout-viewport corruption in the header tombstone —
  // paid on every EXIT, curable only by force-quitting
  // Safari. Losing the toolbar's strip of screen is the
  // cheaper trade. Tapping the overlay exits.
  function enterClockMode() {
    if (!clockOverlay) buildClockOverlay();
    // whatever the strip held last time is stale now
    clearClockMessage();
    clockOverlay.style.display = "flex";
    renderClockMode();
    clearInterval(clockTimer);
    clockTimer = setInterval(renderClockMode, OVERLAY_TICK_MS);
    acquireClockLock();
    renderButton();
    if (setPanel) setPanel.style.display = "none";
    log("CLK", "clock mode on");
  }

  function exitClockMode(byTap) {
    if (!clockModeOn()) return;
    clockOverlay.style.display = "none";
    clearInterval(clockTimer);
    clockTimer = null;
    releaseClockLock();
    renderButton();
    log("CLK", "clock mode off" + (byTap ? " (tap)" : ""));
  }

  function toggleClockMode() {
    if (clockModeOn()) exitClockMode(false);
    else enterClockMode();
  }

