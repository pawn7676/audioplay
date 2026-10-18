/*  mic.js - speech recognition.
 *
 *  The mic only starts after a tap (an iOS rule), and never
 *  while the page is speaking: on iPadOS 27, speech that
 *  overlaps the mic starting up is lost and leaves the mic
 *  deaf. When speech ends, voice.js starts it again.
 *
 *  `running` means voice is switched on; `listening` means
 *  the recognizer is actually running right now.
 *
 *  Also here: telling Safari how the page uses sound
 *  (declareAudioSession), which depends on Play by.
 */

"use strict";

var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
var recognition = null, listening = false, running = false;
var restartTimer = null, micFails = 0, micCycles = 0;
var micBlockedLogged = false;

function startListening() {
  if (!running) return;
  if (listening) return;
  if (speaking || priming) {
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
  recognition.continuous = false;   // one phrase, then stop
  recognition.interimResults = false;

  // Safari sometimes ranks the right reading low ("echo
  // four" came back as "go for" first), so ask for many.
  // Each one is checked against the legal moves.
  recognition.maxAlternatives = 8;
  recognition.onstart = function () {
    micFails = 0;
    micCycles++;

    log("MIC", "listening (cycle " + micCycles + ")");
  };

  // Lifecycle lines, once per start. On iPadOS 27 the sound
  // and speech events no longer fire, so their absence
  // means nothing there.
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

    handleTranscripts(alts);
  };
  recognition.onerror = function (ev) {
    // "no-speech" is silence and "aborted" is our own stop;
    // neither is worth a log line.
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
    if (running && !speaking && !priming && !listening) startListening();
  }, ms);
}

// Tells Safari how this page uses sound. Voice mode both
// records and plays ("play-and-record"). The typing modes
// only play ("playback"): with play-and-record declared and
// no mic open, iOS held the chime's audio clock still, so
// in hybrid mode the chime never sounded, and in voice mode
// it could sound late. Called at start and whenever Play
// by changes (ui.js).
var audioSessionType = null;

function declareAudioSession() {
  var want = typingMode() ? "playback" : "play-and-record";
  if (want === audioSessionType) return;
  try {
    navigator.audioSession.type = want;
    audioSessionType = want;
    log("AUD", "audio session declared " + want);
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
