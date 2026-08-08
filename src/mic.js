  /*=================== MIC / SPEECH RECOGNITION ===================*/

  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null, listening = false, running = false;
  var restartTimer = null, micFails = 0, micCycles = 0;
  var micBlockedLogged = false;

  function startListening() {
    if (!Rec) { log("MIC", "SpeechRecognition unavailable in this browser"); return; }
    // A REFUSAL USED TO BE SILENT (v105), and that is how
    // the game17 dead mic hid: the button was lit and
    // nothing in the log said the mic had declined to
    // start. Speech blocking it is normal and now
    // self-healing (the end of speech re-checks), so it
    // is logged once rather than every time; anything
    // else refusing is worth seeing.
    if (!running) return;
    if (listening) return;
    if (speaking) {
      if (!micBlockedLogged) {
        micBlockedLogged = true;
        log("MIC", "not starting yet: speech in flight");
      }
      return;
    }
    micBlockedLogged = false;
    try {
      recognition = new Rec();
    } catch (e) { log("ERR", "new SpeechRecognition: " + e.message); return; }
    recognition.lang = "en-US";
    recognition.continuous = MIC_ALWAYS_ON;
    recognition.interimResults = false;
    // Safari sometimes buries the correct reading: "echo
    // four" came back as "go for", "I go for", "go four"
    // with the right one fourth. More alternatives to sift
    // costs nothing, since every one is checked for a legal
    // move and only real matches survive.
    recognition.maxAlternatives = 8;
    recognition.onstart = function () {
      micFails = 0;
      micCycles++;
      /* Proof the loop is alive. Safari ends and restarts on
         its own, so cycles are rare now - rare enough to log
         each one. The %10 throttle (gone in v127) was for the
         switching mode, where onstart fired once per
         utterance. */
      log("MIC", "listening (cycle " + micCycles + ")" +
          (MIC_ALWAYS_ON ? "" : " switching"));
    };
    // THE WEDGE IS OTHERWISE INVISIBLE (w91). The w90 log
    // showed "listening (cycle 1)" and then nothing at all -
    // no result, no error, no end - while spoken moves went
    // unheard. A recognizer in that state fires none of the
    // handlers below, so nothing could say WHERE voice died:
    // no audio reaching it is a different disease from audio
    // arriving and nothing recognised, and the two point at
    // different culprits (the audio session vs the service).
    // These lifecycle lines are the difference, at most one
    // apiece per cycle. A healthy start shows "audio route
    // open" within a moment of "listening"; its absence in a
    // pasted log is the diagnosis.
    var sawSound = false, sawSpeech = false;
    recognition.onaudiostart = function () {
      log("MIC", "audio route open");
    };
    recognition.onsoundstart = function () {
      if (sawSound) return;
      sawSound = true;
      log("MIC", "sound reaching the recogniser");
    };
    recognition.onspeechstart = function () {
      if (sawSpeech) return;
      sawSpeech = true;
      log("MIC", "speech detected");
    };
    recognition.onresult = function (ev) {
      var res = ev.results[ev.results.length - 1];
      if (!res) return;
      var alts = [];
      for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
      // no speaking gate here since v132: AEC keeps our own
      // announcements out of the mic (platform finding), so
      // every result is the room, and a move said over an
      // announcement lands as said.
      handleTranscripts(alts);
    };
    recognition.onerror = function (ev) {
      /* "aborted" is self-inflicted: speak() aborts the mic so we
       * never transcribe our own voice. "no-speech" is just silence.
       * Neither is worth a log line, and together they drowned out
       * the real events. */
      /* "no-speech" was counted into a variable nothing ever
       * read (w54); silence is not an event worth a number. */
      if (ev.error !== "no-speech" && ev.error !== "aborted") {
        log("MIC", "error " + ev.error);
      }
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        running = false;
        speak("Microphone blocked.");
      } else if (ev.error !== "no-speech" && ev.error !== "aborted") {
        micFails++;
        if (micFails >= 8) {
          running = false;
          log("MIC", "giving up after " + micFails +
              " failures - tap the button to restart");
          speak("Microphone stopped. Tap the button to restart.");
        }
      }
    };
    recognition.onend = function () {
      listening = false;
      renderButton();
      scheduleRestart(300);
    };
    try {
      recognition.start();
      listening = true;
    } catch (e) {
      log("ERR", "rec.start: " + e.message);
      listening = false;
      scheduleRestart(800);
    }
    renderButton();
  }

  function scheduleRestart(ms) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(function () {
      if (running && !speaking && !listening) startListening();
    }, ms);
  }

  /* DECLARE THE SESSION instead of letting Safari guess
   * (w89; removed with the keep-alive at w90; RESTORED at
   * w91, and moved here because it is MIC code, not
   * keep-alive code). "play-and-record" is the web's version
   * of the AVAudioSession category a native mic-and-speaker
   * app names, and this page is exactly that: mic open,
   * synthesizer speaking. It rode out in w90 only because it
   * lived in the deleted file - and w90, the one build since
   * the iPad trouble began with neither a declared session
   * nor a session-holding element, is also the build where
   * spoken moves went unheard. Suspicion, not proof; the
   * lifecycle lines above are what will tell either way. A
   * condition to DETECT, never the shape of the world:
   * browsers without the API get a log line and nothing
   * else. */
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

  function pauseMic() {
    clearTimeout(restartTimer);
    if (recognition) { try { recognition.abort(); } catch (e) {} }
    recognition = null;
    listening = false;
    renderButton();
  }

  function resumeMicSoon() { scheduleRestart(400); }

