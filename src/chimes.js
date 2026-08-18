  /*============================ CHIMES ============================*/

  // REMOVED in v68, deliberately and after real testing: do
  // not bring chimes back without new evidence. Ten chimes
  // (WAV-rendered, played through <audio> elements for
  // screen-off survival) lived here through v67. Games 3
  // and 4 proved iOS silently discards media-element audio
  // while the mic is open: game4 logged SFX ok on all 39
  // accepted moves with zero playback errors, yet four were
  // inaudible, and neither a post-ack delay nor a doubled
  // length helped. Speech was never once lost in four
  // games, so every signal a chime carried is now spoken
  // ("ok.", the rejection sentence, the yes/no question)
  // and the renderer, BEEPS table, element cache, beep()
  // and warmChimes() were deleted. The keep-alive silent
  // WAV was unrelated and outlived them by design - it held
  // the iOS audio session, it was not a chime - until w90
  // removed it too, for its own reasons (see the keep-alive
  // tombstone in header.js).

  // REOPENED AT w108, CLOSED AT w112, REOPENED AT w116 - and
  // this is not flip-flopping, because each turn answered a
  // different question. w108 answered AUDIBILITY: WebAudio
  // with the screen on, the session declared, the context
  // born in a gesture - every chime scheduled, every chime
  // heard, the thing that killed the v67 generation
  // disproved for this narrow shape. w112 answered
  // INFORMATION: with every accepted move read back in full
  // AFTER it played, a chime in the yes-answered slot
  // carried nothing the read-back did not, and "a tone
  // cannot say WHICH move" ended it.
  //
  // w116 changed the premise w112 stood on. Every voice move
  // is now confirmed BEFORE it posts - the question IS the
  // read-back, spoken while the move can still be refused -
  // and the owner ruled that after his "yes" the move is not
  // repeated a second time. So the post-yes signal must
  // carry exactly ONE bit: your yes landed. That is the
  // signal w112 proved a chime cannot outperform speech on -
  // and the one it cannot be beaten at either, because
  // repeating the move was ruled out by the same order that
  // brought this back. The w112 verdict stands for any slot
  // where WHICH is still owed; no such slot exists any more.
  //
  // What did NOT change: no API reports AUDIBILITY. game4's
  // "SFX ok" on four silent chimes is permanent, media
  // elements stay banned (v67, reproven w88-w90), and only
  // ears at the board can judge this. RULE 5 STILL HOLDS: a
  // chime that cannot even be SCHEDULED - no WebAudio,
  // context not running - is answered with a spoken "okay."
  // instead, never with silence. A chime that was scheduled
  // and went unheard degrades to the opponent's reply being
  // the next thing heard, or to asking "repeat" - loud
  // failures, not the silent kind.

  // Retune these by ear at the board: two short rising sine
  // notes. GAIN is the knob for loudness, either direction -
  // 0.35 was the first guess and the owner's ears said too
  // loud (w136), so it came down. Only ears at the board can
  // judge the next step too.
  var CHIME_FREQS = [988, 1319];    /* B5 then E6 */
  var CHIME_NOTE_S = 0.09;          /* per note, seconds */
  var CHIME_GAIN = 0.18;

  var chimeCtx = null, chimeNoApiLogged = false;

  // Called from the voice and practice taps (ui.js): an
  // AudioContext created outside a user gesture starts
  // suspended on iOS, so it is created - and woken - where
  // the gestures are. Safe to call any number of times, and
  // a browser without the API gets a log line and speech,
  // never an error: a condition to detect, not the shape of
  // the world.
  function primeChimes() {
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) {
        if (!chimeNoApiLogged) {
          chimeNoApiLogged = true;
          log("CHM", "no WebAudio on this browser - " +
              "confirmations will be spoken");
        }
        return;
      }
      if (!chimeCtx) {
        chimeCtx = new AC();
        log("CHM", "chime context created (" + chimeCtx.state + ")");
      }
      if (chimeCtx.state !== "running") {
        var p = chimeCtx.resume();
        if (p && p.catch) p.catch(function () {});
      }
    } catch (e) { log("CHM", "chime prime failed: " + e.message); }
  }

  // True means the chime was handed to the audio stack.
  // Audibility is the open question and nothing here can
  // answer it (see the header above); what CAN be known is
  // logged, because a pasted log has to separate "spoke okay
  // because the context was suspended" from "chimed and the
  // user did not hear it".
  function playConfirmChime() {
    try {
      if (!chimeCtx || chimeCtx.state !== "running") {
        if (chimeCtx) {
          log("CHM", "chime context " + chimeCtx.state +
              " - speaking instead");
          /* may rescue the NEXT chime, never this one */
          var p = chimeCtx.resume();
          if (p && p.catch) p.catch(function () {});
        }
        return false;
      }
      var t = chimeCtx.currentTime;
      for (var i = 0; i < CHIME_FREQS.length; i++) {
        var o = chimeCtx.createOscillator();
        var g = chimeCtx.createGain();
        var t0 = t + i * CHIME_NOTE_S, t1 = t0 + CHIME_NOTE_S;
        o.type = "sine";
        o.frequency.value = CHIME_FREQS[i];
        /* ramps, not steps: a bare start/stop clicks */
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(CHIME_GAIN, t0 + 0.012);
        g.gain.setValueAtTime(CHIME_GAIN, t1 - 0.025);
        g.gain.linearRampToValueAtTime(0, t1);
        o.connect(g);
        g.connect(chimeCtx.destination);
        o.start(t0);
        o.stop(t1);
      }
      log("CHM", "confirm chime");
      return true;
    } catch (e) {
      log("CHM", "chime failed: " + e.message);
      return false;
    }
  }
