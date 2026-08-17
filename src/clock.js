  /*========================== CLOCK MODE ==========================*/

  // A full-screen, pure black overlay showing the two
  // clocks, SIDE BY SIDE (v97), AND NOTHING ELSE (w110):
  // yours on the side set by PLAYER_ON_LEFT_OF_CLOCK,
  // theirs on the other, the side to move drawn HEAVIER
  // (weight, not brightness, since v81/v82; red still
  // means under a minute). On an OLED panel black pixels
  // are OFF, so in a dark room the display reduces to two
  // faint numbers. Everything else — the mic, speech, the
  // game — runs on underneath: this whole section is only
  // a second renderer over state the script already keeps
  // (remainingMs, api.pos.turn), and it touches nothing
  // outside itself.
  //
  // TEXT ON THIS SCREEN IS A CLOSED CASE NOW (w110,
  // owner's decision). The move row (v73, off at v92, a
  // switch from v124) and the v129 message strip - with
  // its question stickiness, sentence-casing and two-way
  // channel routing in speak() - were built so the screen
  // could carry what the voice then need not say. Real
  // games settled it the other way: the owner caught
  // himself reading the overlay, eyes off the physical
  // board, which is the exact motion this program exists
  // to remove. All of it was deleted at w110, switches and
  // all; the voice is the one channel, and this screen is
  // numbers. The machinery is in git at w109 if text is
  // ever argued back - argue with the sentence above
  // first.
  //
  // In: the "clock" button, and ONLY the button (v98).
  // Out: tap anywhere on it.
  //
  // THIS FILE PAINTS FROM CODE, AND THAT IS THE EXCEPTION,
  // NOT THE RULE (w54). Rule 6 says the stylesheet owns what a
  // state looks like and the code only says which state is
  // current - and everywhere else it now does, including the
  // two page buttons that were breaking it. Here the whole
  // overlay is built from cssText and its colours are set on
  // the elements: red under a minute, dim for the side not to
  // move. It is left that way ON PURPOSE and the reason is
  // worth stating, because an undocumented exception is
  // indistinguishable from an oversight - which is how this
  // one got reported in the first place.
  //
  //   - the overlay is a SECOND RENDERER. It shares no markup
  //     with the page, sits outside .panel, and is created and
  //     destroyed whole, so there is no stylesheet cascade
  //     here to be the single source of anything.
  //   - it is the screen the owner READS at a glance across a
  //     room, and the sizes and colours in it were tuned on
  //     the device by eye. Moving them into the stylesheet
  //     cannot be verified by the harness and would need a
  //     real game to confirm - a bad trade for tidiness.
  //
  // If this overlay is ever rebuilt, move it to classes then.
  // Do not do it as a drive-by.
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
  var clockHalves = null;

  function clockModeOn() {
    return !!(clockOverlay && clockOverlay.style.display !== "none");
  }

  // One number only (v78): ticking seconds drew the eye,
  // so above a minute just the whole minutes remain,
  // changing once a minute — and under a minute the number
  // becomes the seconds and the number turns red
  // (LOW_TIME_COLOR). Since w133 the voice can say the same
  // reading ON DEMAND — "clock" or "time", speakClockTimes
  // below — in these same units; nothing speaks it
  // unprompted (see the spoken-clock note in header.js).
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
        "line-height:1;font-size:" + bareDigitSizeCss() +
        ";font-variant-numeric:tabular-nums;";
      half.appendChild(time);
      clockOverlay.appendChild(half);
      clockHalves[k] = { time: time, col: null, wt: null };
    });
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
      if (noteClockDigits(digits)) {
        var css = bareDigitSizeCss();
        clockHalves.left.time.style.fontSize = css;
        clockHalves.right.time.style.fontSize = css;
      }
    }
    if (h.col !== col) {
      h.col = col;
      h.time.style.color = col;
    }
    if (h.wt !== wt) {
      h.wt = wt;
      h.time.style.fontWeight = wt;
    }
  }

  function renderClockMode() {
    if (!clockHalves) return;
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
  // AND IT SAYS WHICH SIDE (w54). This repainted and said
  // nothing, which is fine while you are looking at the
  // overlay and is silence everywhere else - and "flip clock"
  // is a VOICE command, reachable with the overlay down, where
  // the repaint is invisible and nothing else happens at all.
  // That is constraint 5: silence reads as "not heard", so the
  // user says it again, and flips it back.
  //
  // It answers with the new state rather than "flipped",
  // because a confirmation has to carry information to earn
  // its airtime - the rule the whole sound arc ended in (see
  // the chimes tombstone in header.js).
  function flipClockSides() {
    PLAYER_ON_LEFT_OF_CLOCK = !PLAYER_ON_LEFT_OF_CLOCK;
    var side = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
    log("CLK", "my clock now on the " + side);
    renderClockMode();
    speak("your clock on the " + side + ".");
  }

  // THE SPOKEN CLOCK, back on demand at w133 (owner's
  // reversal - the whole story is the spoken-clock note in
  // header.js). "clock" or "time", said alone, answers with
  // both times, the player's own color FIRST - the number
  // the asker almost always wants - in the overlay's own
  // units: whole minutes, floored, exactly as the screen
  // shows them, and the seconds once a side is under a
  // minute. ON DEMAND ONLY: nothing here fires unprompted,
  // and the v92 refusal of a low-time alert still stands.
  function spokenClockReading(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    if (s < 60) return s + (s === 1 ? " second" : " seconds");
    var m = Math.floor(s / 60);
    return m + (m === 1 ? " minute" : " minutes");
  }

  function speakClockTimes() {
    var mine = api.myColor || "w";
    var theirs = mine === "w" ? "b" : "w";
    var myMs = remainingMs(mine), oppMs = remainingMs(theirs);
    // no game, or a game without clocks (correspondence):
    // rule 5, the refusal is said, not implied
    if (myMs == null || oppMs == null) {
      speak("no clock running.");
      return;
    }
    speak(colorWord(mine) + " " + spokenClockReading(myMs) + ", " +
          colorWord(theirs) + " " + spokenClockReading(oppMs) + ".");
  }

  function acquireClockLock() {
    try {
      if (!navigator.wakeLock || !navigator.wakeLock.request) {
        log("CLK", "wake lock unsupported");
        return;
      }
      navigator.wakeLock.request("screen").then(function (lock) {
        // THE REQUEST CAN OUTLIVE THE MODE (w63). Enter, tap
        // straight out, and this promise resolves with the
        // overlay already down: release() found null and did
        // nothing, then the lock landed here - held forever,
        // screen never sleeping. Worse, the next enter
        // OVERWROTE the sentinel and orphaned it. If the mode
        // is gone, let the lock go; if one is somehow already
        // held, release it before taking this one.
        if (!clockModeOn()) {
          try { lock.release(); } catch (e) {}
          log("CLK", "wake lock arrived after exit - released");
          return;
        }
        if (clockLock && clockLock !== lock) {
          try { clockLock.release(); } catch (e) {}
        }
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
    clockOverlay.style.display = "flex";
    renderClockMode();
    clearInterval(clockTimer);
    clockTimer = setInterval(renderClockMode, OVERLAY_TICK_MS);
    acquireClockLock();
    renderButton();
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

