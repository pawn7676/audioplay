  /*========================== KEEP-ALIVE ==========================*/

  var keepAlive = null;
  var keepAliveWanted = false;   // w63: did WE stop it, or the OS?
  // w88: the re-pause ladder - see the pause handler's note.
  // A quiet stretch this long forgets the streak, so an
  // isolated pause months of ticks later still resumes at
  // full speed.
  var KA_CALM_MS = 10000;
  var KA_BASE_MS = 250, KA_MAX_MS = 8000;
  var kaPausedAt = 0, kaStreak = 0, kaRetryTimer = null;
  // A WebAudio oscillator does not hold the iOS audio
  // session; a PLAYING media element does. Without one, iOS
  // tears the session down between utterances and the next
  // one starts quiet while the route is re-established.
  // This is why the first announcements sound faint and it
  // settles after a few. Builds a half-second silent WAV
  // (w63: this said "1 second" while the code and the last
  // line of this comment both said half) rather than
  // carrying a large base64 blob in the file.
  // Safari rejected an 8-bit WAV with "operation is not
  // supported", so this builds 16-bit PCM, which every
  // browser decodes. Half a second, looped.
  function silentWavUrl() {
    var rate = 22050, frames = rate / 2, bytes = frames * 2;
    var buf = new Uint8Array(44 + bytes);
    var dv = new DataView(buf.buffer);
    function tag(off, str) {
      for (var i = 0; i < str.length; i++) buf[off + i] = str.charCodeAt(i);
    }
    tag(0, "RIFF"); dv.setUint32(4, 36 + bytes, true);
    tag(8, "WAVEfmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);          // PCM
    dv.setUint16(22, 1, true);          // mono
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * 2, true);   // byte rate
    dv.setUint16(32, 2, true);          // block align
    dv.setUint16(34, 16, true);         // bits per sample
    tag(36, "data"); dv.setUint32(40, bytes, true);
    // Safari answered "operation is not supported" to the
    // same bytes as a data: URI, so hand it a Blob instead.
    try {
      var blob = new Blob([buf], { type: "audio/wav" });
      return URL.createObjectURL(blob);
    } catch (e) {
      // ONLY NOW IS THE BASE64 NEEDED (w53). The chunked
      // string was built unconditionally, above the try, so
      // every start of the keep-alive assembled a ~22KB string
      // one 8192-character slice at a time and then, on every
      // browser that has Blob - which is all of them the page
      // supports - threw it away unused.
      var bin = "", CH = 8192;          // chunked: avoid arg limits
      for (var o = 0; o < buf.length; o += CH) {
        bin += String.fromCharCode.apply(null, buf.subarray(o, o + CH));
      }
      return "data:audio/wav;base64," + btoa(bin);
    }
  }

  function ensureHolder() {
    if (keepAlive) return;
    {
        keepAlive = document.createElement("audio");
        keepAlive.src = silentWavUrl();
        keepAlive.load();
        keepAlive.loop = true;
        keepAlive.volume = 0.02;
        keepAlive.setAttribute("playsinline", "");
        // THE OS CAN PAUSE THIS TOO, AND USED TO WIN (w63).
        // Siri, a phone call, another app taking the audio
        // session: iOS pauses the element, nothing observed
        // it, and the layer whose whole job is keeping the
        // session alive was silently dead until the next tap
        // of the voice button - with Control Center no help,
        // since the media-session "pause" key is mapped to
        // repeatLast. If the pause was not OURS, ask to play
        // again; a refusal is logged and the next user gesture
        // still heals it, as before.
        //
        // AND THE ASKING MUST BACK OFF (w88). w63 assumed the
        // OS pauses ONCE; the owner's iPad showed it refusing
        // CONTINUOUSLY, and on that build the abort of a
        // refused play() fires another pause event - which
        // made this handler a closed loop: pause -> play ->
        // abort -> pause, up to eighty-six log events a
        // second, for minutes, on the speaker with no
        // Bluetooth anywhere. The page's buttons died under
        // it: each cycle burned a native play() plus a log
        // line, and with the log panel open every line
        // rejoins and re-lays the whole three-thousand-line
        // panel. So: the FIRST pause of a streak still
        // resumes immediately - the Siri case is untouched -
        // but a RE-pause inside KA_CALM_MS waits, doubling
        // from KA_BASE_MS to a KA_MAX_MS ceiling, one pending
        // retry at a time, and the streak is narrated at
        // milestones instead of per cycle. A calm stretch
        // resets the ladder, so recovery is automatic the
        // moment the OS relents.
        keepAlive.addEventListener("pause", function () {
          if (!keepAliveWanted) return;
          var now = Date.now();
          if (now - kaPausedAt > KA_CALM_MS) kaStreak = 0;
          kaPausedAt = now;
          kaStreak++;
          if (kaStreak === 1) {
            log("AUD", "session holder paused externally - resuming");
            keepAlive.play().catch(function (e) {
              log("AUD", "resume blocked: " + e.message);
            });
            return;
          }
          if (kaStreak === 2 || kaStreak === 10 || kaStreak === 100 ||
              kaStreak === 1000) {
            log("AUD", "session holder re-paused x" + kaStreak +
                " - backing off");
          }
          if (kaRetryTimer) return;    /* one pending retry at a time */
          var wait = Math.min(KA_BASE_MS * Math.pow(2, kaStreak - 2),
                              KA_MAX_MS);
          kaRetryTimer = setTimeout(function () {
            kaRetryTimer = null;
            if (!keepAliveWanted) return;
            /* refusals inside a streak are counted, not logged */
            keepAlive.play().catch(function () {});
          }, wait);
        });
        document.body.appendChild(keepAlive);
        log("AUD", "audio session holder created");
    }
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: "Lichess voice play" });
        ["play", "pause", "nexttrack", "previoustrack"].forEach(function (a) {
          try { navigator.mediaSession.setActionHandler(a, repeatLast); } catch (e) {}
        });
      } catch (e) {}
    }
  }

  function startKeepAlive() {
    keepAliveWanted = true;
    try {
      ensureHolder();
      keepAlive.play().then(function () {
        log("AUD", "session holder playing");
      }).catch(function (e) {
        log("AUD", "session holder blocked: " + e.message);
      });
    } catch (e) { log("ERR", "keepalive: " + e.message); }
  }

  /*  THE HOLDER PLAYS ONLY WHILE THE PAGE IS HIDDEN (w89).
   *
   *  The w87-w88 iPad logs settled where the lag came from:
   *  iPadOS evicting this element - pause, refused play,
   *  abort, pause - while the mic and the synthesizer were
   *  live, whole games spent inside the refused state with
   *  the page's buttons dead under the churn. w88 made our
   *  side of that fight polite; w89 removes our side of it.
   *  The holder exists for ONE scenario - screen off, game
   *  running, the opponent's move still announced - and it
   *  was playing from the first button tap onward, including
   *  the whole time the user is LOOKING at the page, where it
   *  protects nothing and is exactly the thing iOS fights.
   *
   *  So the buttons now ARM it rather than start it: while
   *  the page is visible the element sits paused, and the
   *  visibilitychange listener starts it the moment the page
   *  goes hidden (screen sleeping, app backgrounded) and
   *  stops it - OUR pause, no resume fight - when the page
   *  returns. Arming happens inside a real button tap, and
   *  the prime below PLAYS THE ELEMENT ONCE in that gesture
   *  and pauses it at once: iOS is far more willing to replay
   *  an element a gesture has already blessed than to start a
   *  cold one with the screen going dark. Whether that
   *  blessing is honoured at the hidden moment is a thing
   *  only the device can prove - the prime-blocked and
   *  holder-blocked log lines are what to look for in a
   *  pasted log if screen-off play goes quiet.
   *
   *  THE KNOWN TRADE, on the record: the always-playing
   *  holder also kept the audio route warm BETWEEN utterances
   *  while the screen was on - the original v-era reason it
   *  exists at all ("the next one starts quiet while the
   *  route is re-established"). If first words start sounding
   *  faint again during screen-on play, this trade is where
   *  to look, and the answer will need a different shape than
   *  an always-on element the OS has started evicting.
   */
  var kaArmed = false;

  function armKeepAlive() {
    kaArmed = true;
    if (document.visibilityState === "hidden") { startKeepAlive(); return; }
    primeKeepAlive();
  }

  function disarmKeepAlive() {
    kaArmed = false;
    stopKeepAlive();
  }

  function primeKeepAlive() {
    try {
      ensureHolder();
      keepAlive.play().then(function () {
        // wanted can flip true if the screen went dark between
        // the play and this resolving; then the holder is
        // simply already doing its job and must not be paused
        if (!keepAliveWanted) {
          keepAlive.pause();
          log("AUD", "session holder primed for screen-off");
        }
      }).catch(function (e) {
        log("AUD", "session holder prime blocked: " + e.message);
      });
    } catch (e) { log("ERR", "keepalive: " + e.message); }
  }

  document.addEventListener("visibilitychange", function () {
    if (!kaArmed) return;
    if (document.visibilityState === "hidden") startKeepAlive();
    else stopKeepAlive();
  });

  /*  DECLARE THE SESSION instead of letting Safari guess
   *  (w89). Native apps name their AVAudioSession category
   *  and the OS arbitrates around them; the Audio Session
   *  API is the web's recent version of the same lever, and
   *  this page is the poster child for "play-and-record" -
   *  mic open, synthesizer speaking, a media element holding
   *  the session. Declared once at boot. A condition to
   *  DETECT, never the shape of the world: browsers without
   *  the API get a log line saying so, nothing else. */
  function declareAudioSession() {
    try {
      if (navigator.audioSession && "type" in navigator.audioSession) {
        navigator.audioSession.type = "play-and-record";
        log("AUD", "audio session declared play-and-record");
      } else {
        log("AUD", "no audio session API on this browser");
      }
    } catch (e) { log("AUD", "audio session declare failed: " + e.message); }
  }

  function stopKeepAlive() {
    keepAliveWanted = false;      /* w63: OUR pause, not the OS's */
    clearTimeout(kaRetryTimer);   /* w88: and no retry outlives us */
    kaRetryTimer = null;
    try { if (keepAlive) keepAlive.pause(); } catch (e) {}
  }

