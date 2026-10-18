/*  settings.js - settings and constants.
 *
 *  Four settings are chosen on the page (the Settings menu)
 *  and stored in this browser: how you play (voice, hybrid
 *  or keys), show ratings, how moves are spoken, and how
 *  your move is confirmed.
 *  Everything else is a constant edited here.
 *
 *  Every key this page stores is named audioplay.<what>,
 *  and is read and written through stored() and store().
 */

"use strict";

var TOKEN_KEY = "audioplay.token";

// Remembered things live in localStorage, which can be
// blocked (private browsing, some settings). Then nothing
// is remembered, and the page still works.
function stored(key) {
  try { return localStorage.getItem(key) || ""; }
  catch (e) { return ""; }
}

// Saves a value, or removes the key when value is null.
function store(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    log("ERR", "could not save " + key + ": " + e.message);
  }
}

var LOG_MAX = 3000;   // lines kept in the log

// How you play, one of three (Play by in Settings):
//   voice   moves spoken, and the page speaks back
//   hybrid  moves typed on a keyboard, and the page
//           speaks back, as in voice: no mic. Beside the
//           board, the typed move and what was last said;
//           nothing extra in Clock View (keys.js)
//   keys    moves typed on a keyboard, and the page is
//           silent: no mic, no voice, no chime; what it
//           would say is shown instead (keys.js).
//           "Keyboard" in Settings.
var INPUT_MODE = "voice";
var INPUT_MODE_KEY = "audioplay.input";

function isInputMode(v) {
  return v === "voice" || v === "hybrid" || v === "keys";
}

// keysMode: typed and silent. hybridMode: typed and
// spoken. typingMode: typed, either way, so the mic is
// off and the keyboard is live.
function keysMode() { return INPUT_MODE === "keys"; }
function hybridMode() { return INPUT_MODE === "hybrid"; }
function typingMode() { return INPUT_MODE !== "voice"; }

// Show the players' ratings beside their names.
var SHOW_RATINGS = false;
var RATINGS_KEY = "audioplay.ratings";

// How the opponent's moves are spoken:
//   squares  "foxtrot 1, charlie 4" - the move's two squares
//            (the default)
//   pieces   "bishop charlie 4" - the piece and where it went
var MOVE_SPEECH = "squares";
var MOVE_SPEECH_KEY = "audioplay.movespeech";

// How your own accepted move is confirmed:
//   chime-quiet, chime, chime-loud  the chime at that level
//   voice                           the move read back
//   none                            nothing (errors still speak)
var CONFIRM_MODE = "chime";
var CONFIRM_MODE_KEY = "audioplay.confirm";

function isConfirmMode(v) {
  return v === "chime" || v === "chime-quiet" ||
         v === "chime-loud" || v === "voice" || v === "none";
}

// Reads the stored settings. A missing or unknown value
// means the default.
function loadStoredSettings() {
  var m = stored(INPUT_MODE_KEY);
  INPUT_MODE = isInputMode(m) ? m : "voice";
  SHOW_RATINGS = stored(RATINGS_KEY) === "on";
  var s = stored(MOVE_SPEECH_KEY);
  MOVE_SPEECH = (s === "pieces") ? "pieces" : "squares";
  var c = stored(CONFIRM_MODE_KEY);
  CONFIRM_MODE = isConfirmMode(c) ? c : "chime";
}

// The voice. Leave VOICE_NAME empty to use the system voice,
// chosen in iPad Settings > Accessibility > Spoken Content >
// Voices; that is the only way to get a Premium or Enhanced
// voice. Otherwise name one: Samantha, Daniel, Karen...
var VOICE_NAME = "";
var SPEAK_RATE = 1.0;
var SPEAK_PITCH = 1.0;

// Pauses between spoken pieces of a sentence.
var GAP_SENTENCE_MS = 450;   // after . ; :
var GAP_CLAUSE_MS = 220;     // after ,

// Logs how long each spoken piece took.
var SPEAK_DEBUG = false;

// Shows the Practice button.
var PRACTICE_MODE = true;

// Which side of Clock View your clock starts on. The
// "flip" command swaps it. (Clock View's colours and sizes
// are in audioplay.css.)
var PLAYER_ON_LEFT_OF_CLOCK = true;
