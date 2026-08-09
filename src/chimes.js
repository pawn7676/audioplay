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

  // THE NEW EVIDENCE ARRIVED, AND ONE CHIME IS BACK ON
  // TRIAL (w108, owner's decision, 9 Aug 2026). The
  // tombstone above stays: it is what the reopening was
  // argued against. What changed since it was written, and
  // what did not:
  //
  //  - the WebAudio generation (pre-v65) died with the
  //    SCREEN OFF - AudioContext suspends there. w90
  //    deleted screen-off play itself, so that killer no
  //    longer has a stage. No log ever showed a WebAudio
  //    chime lost with the screen ON.
  //  - the <audio> generation is deader than the tombstone
  //    knew: w88-w90 watched iPadOS evict a media element
  //    while the mic and the synthesizer were live, WITH
  //    the audio session declared. Nothing here may ever
  //    be a media element again.
  //  - the session is now declared play-and-record (mic.js,
  //    w91), which did not exist in the chime era.
  //  - what did NOT change: no API reports AUDIBILITY.
  //    game4's "SFX ok" on four silent chimes is permanent.
  //    Only ears at the board can judge this trial.
  //
  // Hence the one square inch: the chime plays ONLY as the
  // confirmation of a move the user just heard read aloud
  // as a question and answered "yes" - the one moment the
  // output route is proven live AND heard (the question
  // played through it seconds ago, and the yes is the
  // proof), and the one confirmation carrying no
  // information the user lacks, where the full read-back
  // was failing the sound arc's own rule that speech must
  // earn its airtime. Moves that play WITHOUT a question
  // keep the full read-back; see readBackMine in
  // dialogue.js, and the chimeConfirmed toggle is the
  // rollback if the device disagrees.
  //
  // RULE 5 STILL HOLDS. A chime that cannot even be
  // SCHEDULED - no WebAudio, context not running - is
  // answered with a spoken "okay." instead, never with
  // silence. A chime that was scheduled and went unheard
  // degrades to the user saying the move again, which
  // speaks an answer either way - a loud failure, not the
  // silent kind that killed the v67 generation.

  // Retune these by ear at the board: two short rising sine
  // notes. GAIN is the first thing to raise if the iPad
  // across the room is too quiet.
  var CHIME_FREQS = [988, 1319];    /* B5 then E6 */
  var CHIME_NOTE_S = 0.09;          /* per note, seconds */
  var CHIME_GAIN = 0.35;

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
  // Audibility is the trial's open question and nothing
  // here can answer it (see the header above); what CAN be
  // known is logged, because a pasted log has to separate
  // "spoke okay because the context was suspended" from
  // "chimed and the user did not hear it".
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
