/*  voice.js - the page's voice.
 *
 *  Everything the page says goes through speak(): it is
 *  logged as a SAY line, split at punctuation so the pauses
 *  can be heard, and spoken one piece at a time. The voice
 *  is the only output channel; nothing that must be acted
 *  on is shown as text instead.
 *
 *  Keys mode is the exception: it is silent, so speak()
 *  hands the words to keys.js to show on screen, and
 *  nothing here makes a sound. Hybrid mode speaks just as
 *  voice mode does (only the moves come from the keyboard),
 *  and also prints what it says beside the board.
 *
 *  The mic is switched off while the page speaks and
 *  started again when it finishes: on iPadOS 27, speech
 *  played while the mic is open leaves the mic deaf.
 */

"use strict";

var SPOKEN_FILE = { a: "alpha", b: "bravo", c: "charlie", d: "delta",
  e: "echo", f: "fox", g: "golf", h: "hotel" };
var SPOKEN_PIECE = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };

var speechReady = false, speakQueue = [], speaking = false, speakGuard = null;
var voicePicked = null, spokeOnce = false;
var missLogged = null;

// iOS often reports no voices until speech has been used,
// and does not reliably say when they arrive, so the list
// is polled.
var voiceTries = 0;

// Picks VOICE_NAME from the voice list. Returns false while
// the list is still empty. Logs the English voices only when
// the named voice is missing.
function loadVoices() {
  var list = speechSynthesis.getVoices();
  if (!list.length) return false;

  voicePicked = null;
  if (!VOICE_NAME) {
    // no name: Safari uses the system voice, including
    // Premium voices it never lists by name
    return true;
  }
  var want = VOICE_NAME.toLowerCase();
  for (var i = 0; i < list.length; i++) {
    if (list[i].name.toLowerCase().indexOf(want) >= 0) {
      voicePicked = list[i];
      if (missLogged !== "ok:" + VOICE_NAME) {
        missLogged = "ok:" + VOICE_NAME;
        log("TTS", "using voice " + list[i].name +
            " (" + (list[i].lang || "?") + ")");
      }
      return true;
    }
  }
  if (missLogged === VOICE_NAME) return true;
  missLogged = VOICE_NAME;
  if (/siri/i.test(VOICE_NAME)) {
    log("TTS", "Siri voices are private to Apple and are " +
        "never offered to web pages");
  } else {
    log("TTS", "voice not found: " + VOICE_NAME);
  }

  var eng = list.filter(function (v) {
    return /^en/i.test(v.lang || "");
  });
  log("TTS", "English voices: " + (eng.length
    ? eng.map(function (v) { return v.name; }).join(", ")
    : "none"));
  return true;
}

function pollVoices() {
  if (loadVoices()) return;
  if (voiceTries++ < 40) setTimeout(pollVoices, 500);
  else log("TTS", "no voices reported by this browser");
}

pollVoices();
speechSynthesis.onvoiceschanged = loadVoices;

// Speech has to be used once during a tap before iOS will
// let the page speak; the buttons call this.
function wakeSpeech() {
  if (speechReady) return;
  speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
  speechReady = true;
}

// The voice barely pauses at punctuation, so sentences are
// split there and real silence is put between the pieces.
function splitForSpeech(text) {
  var parts = [], buf = "", i, c, gap;
  for (i = 0; i < text.length; i++) {
    c = text[i];
    buf += c;
    if (c === "." || c === "," || c === ";" || c === ":") {
      gap = (c === ",") ? GAP_CLAUSE_MS : GAP_SENTENCE_MS;
      if (buf.replace(/[.,;:\s]/g, "")) {
        parts.push({ text: buf.trim(), gap: gap });
      }
      buf = "";
    }
  }
  if (buf.replace(/[.,;:\s]/g, "")) {
    parts.push({ text: buf.trim(), gap: GAP_SENTENCE_MS });
  }
  return parts;
}

function speak(text) {
  if (!text) return;

  // typed moves are entered again, not said again
  if (typingMode()) {
    text = String(text).replace(/say the move again/i,
                                "enter the move again");
  }

  // keys mode: shown, never spoken
  if (keysMode()) { showMessage(text); return; }

  // hybrid mode: spoken, and printed beside the board
  if (hybridMode()) showSpoken(text);

  log("SAY", text);
  splitForSpeech(text).forEach(function (p) { speakQueue.push(p); });
  pumpSpeech();
}

// Drops everything waiting to be spoken and cuts off the
// piece being spoken, when keys mode is switched on. The
// cut-off piece still finishes through pumpSpeech's usual
// end, which then leaves the mic off (voice is off too).
function stopSpeech() {
  speakQueue.length = 0;
  try { speechSynthesis.cancel(); } catch (e) {}
}

// Respellings so the voice says words right ("lichess" is
// otherwise "LITCH-ess"). Applied only to what is handed to
// the voice; the log keeps the real spelling. Safari takes
// plain text only, so respelling is the only tool.
function forTheEar(text) {
  return String(text)
    .replace(/lichess/gi, "lee chess")
    .replace(/\bbravo\b/gi, "brawvo");
}

// iOS reports the end of an utterance while it is still
// playing, so wait for the voice to really go quiet before
// timing the pause.
function waitUntilQuiet(ceiling, cb) {
  var t0 = Date.now();
  (function check() {
    var busy = speechSynthesis.speaking || speechSynthesis.pending;
    if (!busy || Date.now() - t0 > ceiling) return cb();
    setTimeout(check, 50);
  })();
}

// Speaks the next queued piece. When the queue is empty,
// the mic is started again.
function pumpSpeech() {
  if (speaking || !speakQueue.length) return;
  speaking = true;
  pauseMic();
  var item = speakQueue.shift();
  var text = item.text;
  var gap = item.gap || 0;
  var t0 = Date.now();
  var tStart = 0;
  var settled = false;

  // how: "end" or "error" (the voice's own events),
  // "guard" (no word from the voice in time) or "throw".
  // Only the guard can lead to a reset: iPadOS 27 can skip
  // the "started" event, so a piece that ends without one
  // is normal, not stuck.
  var advance = function (how) {
    if (settled) return;
    settled = true;
    clearTimeout(speakGuard);
    if (how === "guard") guardTimedOut();

    var ceiling = Math.max(2500, text.length * 140);
    waitUntilQuiet(ceiling, function () {
      speaking = false;
      if (SPEAK_DEBUG) {
        log("TTS", "lag " + (tStart ? (tStart - t0) : -1) +
            "ms, spoke " + (Date.now() - t0) + "ms, gap " +
            gap + "ms  \"" + text + "\"");
      }
      if (speakQueue.length) {
        // stays "speaking" through the pause, so nothing
        // new jumps in and cuts it short
        speaking = true;
        setTimeout(function () { speaking = false; pumpSpeech(); }, gap);
      }
      else {
        resumeMicSoon();
      }
    });
  };

  try {
    var u = new SpeechSynthesisUtterance(forTheEar(text));
    u.rate = SPEAK_RATE;
    u.pitch = SPEAK_PITCH;
    u.volume = 1;
    if (voicePicked) u.voice = voicePicked;
    if (SPEAK_DEBUG && !spokeOnce) {
      spokeOnce = true;
      log("TTS", "first utterance voice: " +
          (u.voice ? u.voice.name : "system default"));
    }
    u.onstart = function () { tStart = Date.now(); };
    u.onend = function () { advance("end"); };
    u.onerror = function (e) {
      // our own cancel (keys mode, a reset) reports these
      if (e.error !== "interrupted" && e.error !== "canceled") {
        log("TTS", "voice error: " + e.error);
      }
      advance("error");
    };
    speechSynthesis.speak(u);
    speakGuard = setTimeout(function () { advance("guard"); },
                            1200 + text.length * 90);
  } catch (err) { advance("throw"); }

  // No end or error came in time. What decides is whether
  // the piece ever started:
  //   - started, still speaking: only the voice's events
  //     went missing, so let it finish (waitUntilQuiet
  //     waits for it)
  //   - started, now quiet: move on
  //   - never started: the voice is stuck (Siri, a call,
  //     or iOS jamming it). Reset it, and say the piece
  //     once more, so an opponent's move isn't lost; a
  //     second failure drops it.
  // The voice's own "speaking" flag can't decide this: a
  // stuck iOS voice reports speaking=true while nothing
  // plays and every new piece queues behind it (seen as
  // started=no speaking=true pending=true). The log line
  // gives all three.
  function guardTimedOut() {
    var state = "started=" + (tStart ? "yes" : "no") +
                " speaking=" + speechSynthesis.speaking +
                " pending=" + speechSynthesis.pending;
    if (tStart && speechSynthesis.speaking) {
      log("TTS", "no end from the voice yet (" + state +
          ") - letting it finish");
      return;
    }
    if (tStart) {
      log("TTS", "no end from the voice (" + state + ") - moving on");
      return;
    }
    log("TTS", "utterance never started (" + state +
        ") - resetting speech synthesis, " +
        (item.retried ? "dropping \"" + text + "\""
                      : "then saying it again"));
    speechSynthesis.cancel();
    speechSynthesis.resume();
    if (!item.retried) {
      item.retried = true;
      speakQueue.unshift(item);
    }
  }
}

// iOS loses the first thing spoken after the audio starts
// up, so a silent utterance goes first and is the one lost.
function primeAudioRoute(done) {
  var fired = false;
  var once = function () {
    if (fired) return;
    fired = true;
    done();
  };
  var u = new SpeechSynthesisUtterance("ready");
  u.volume = 0;
  u.rate = 2;
  u.onend = once;
  u.onerror = once;
  speechSynthesis.speak(u);
  setTimeout(once, 800);   // in case neither event comes
}

// True while the silent primer plays, before speak() takes
// over - the mic must wait for this too.
var priming = false;

// For the first announcement after a tap: the silent
// primer, then the words. The mic waits until both are done.
// Keys mode has no audio to prime, so the words just go.
function speakWhenAudioSettled(text) {
  if (keysMode()) { speak(text); return; }
  priming = true;
  primeAudioRoute(function () {
    log("AUD", "route primed silently");
    setTimeout(function () {
      priming = false;
      speak(text);
    });
  });
}

// "e4" -> "echo 4"
function spokenSquare(square) {
  return (SPOKEN_FILE[square[0]] || square[0]) + " " + square[1];
}

function checkWord(san) {
  if (san.slice(-1) === "#") return ", checkmate";
  if (san.slice(-1) === "+") return ", check";
  return "";
}

// The "pieces" style: "bishop charlie 4", "queen takes
// delta 5, check". Spoken as one phrase - commas between
// the words make the voice choppy.
function sanToSpeech(san) {
  if (!san) return "";
  if (san.indexOf("O-O-O") === 0) return "castles queenside" + checkWord(san);
  if (san.indexOf("O-O") === 0) return "castles kingside" + checkWord(san);
  var text = san.replace(/[+#]$/, "").replace(/=([QRBN])/, "");
  var promoted = /=([QRBN])/.exec(san);

  var words = "";
  var piece = SPOKEN_PIECE[text[0]];
  if (piece) { words = piece + " "; text = text.slice(1); }
  var takes = text.indexOf("x") >= 0;
  var parts = text.split("x");
  var target = parts[parts.length - 1].slice(-2);
  var from = parts[0].slice(0, parts[0].length - (takes ? 0 : 2));
  if (from) {
    words += (SPOKEN_FILE[from[0]] || from[0]) + " ";
    if (from.length > 1) words += from[1] + " ";
  }
  if (takes) words += "takes ";
  words += spokenSquare(target);
  if (promoted) words += ", promotes to " + SPOKEN_PIECE[promoted[1]];
  words += checkWord(san);
  return words;
}

// Every move announcement comes through here, in the style
// the Moves spoken setting picks.
function moveToSpeech(san, uci) {
  if (MOVE_SPEECH === "squares" && uci && uci.length >= 4) {
    // "fox 1, charlie 4": the same four items the
    // player speaks. The comma gives a short pause.
    var words = spokenSquare(uci.slice(0, 2)) + ", " +
                spokenSquare(uci.slice(2, 4));
    if (uci.length > 4 && SPOKEN_PIECE[uci[4].toUpperCase()]) {
      words += ", promotes to " + SPOKEN_PIECE[uci[4].toUpperCase()];
    }
    words += checkWord(san || "");
    return words;
  }
  return sanToSpeech(san);
}
