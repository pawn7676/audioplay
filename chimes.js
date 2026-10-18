/*  chimes.js - the two-note chime that confirms your move.
 *
 *  Played with WebAudio. The loudness comes from the Confirm
 *  setting (quiet, standard, loud). If the chime cannot be
 *  played, the caller says "okay." instead, so a confirmed
 *  move is never silent.
 *
 *  It isn't an <audio> element because iOS silently drops
 *  their output while the mic is open.
 *
 *  iOS can report the chime's audio as running while its
 *  clock stands still: then a chime waits, and sounds late
 *  or never. In hybrid mode the page's own speech does
 *  this: the clock often stops while the voice plays, and
 *  asking it to resume doesn't restart it. A new audio
 *  context, made during a tap or key press, always works.
 *  So:
 *  - In hybrid mode only, the clock is watched twice a
 *    second (watchChimeClock). Once it stops, the next tap
 *    or key (usually the first key of your next move)
 *    builds the chime's audio afresh (primeChimes), in
 *    time for the move's Enter.
 *  - Each prime also starts a tiny silent sound
 *    (unlockChimes), the usual way to get iOS to really
 *    start WebAudio.
 *  - In hybrid mode, a chime with a stopped clock isn't
 *    tried: the caller says "okay." instead. And after
 *    each chime, in every mode, the clock is checked
 *    again: if it hasn't moved, the chime is called off
 *    (so it can't sound late) and the caller says "okay.".
 */

"use strict";

var CHIME_FREQS = [988, 1319];    // B5 then E6
var CHIME_NOTE_S = 0.09;          // seconds per note
var CHIME_GAINS = { "chime-quiet": 0.09,
                    "chime":       0.18,
                    "chime-loud":  0.35 };

// How long after a chime its clock must have moved.
var CHIME_CHECK_MS = 250;

function chimeGain() {
  return CHIME_GAINS[CONFIRM_MODE] || CHIME_GAINS["chime"];
}

var chimeCtx = null;

// The clock is standing still (watchChimeClock, or a
// chime's own check). The next prime builds a new context
// rather than trusting this one. ui.js reads this too
// (soundRunning).
var chimeStalled = false;

// iOS only lets an AudioContext start during a tap or key
// press, so the buttons, and in hybrid mode any tap or
// key, call this. Safe to call often. A context that is
// stuck, or that iOS interrupted (for the page's own
// speech, say), is replaced rather than resumed.
function primeChimes() {
  try {
    if (chimeCtx && (chimeStalled || chimeCtx.state === "interrupted")) {
      log("CHM", "chime clock " + (chimeStalled ? "stuck" : "interrupted") +
          " - building it afresh");
      try { chimeCtx.close(); } catch (e) {}
      chimeCtx = null;
    }
    chimeStalled = false;
    if (!chimeCtx) {
      chimeCtx = new AudioContext();
      log("CHM", "chime context created (" + chimeCtx.state + ")");
    }
    if (chimeCtx.state !== "running") {
      chimeCtx.resume().catch(function () {});
    }
    unlockChimes();
  } catch (e) { log("CHM", "chime prime failed: " + e.message); }
}

// A one-sample silent sound, started during the tap: the
// usual way to get iOS to really start WebAudio.
function unlockChimes() {
  var buf = chimeCtx.createBuffer(1, 1, chimeCtx.sampleRate);
  var src = chimeCtx.createBufferSource();
  src.buffer = buf;
  src.connect(chimeCtx.destination);
  src.start(0);
}

// True if the chime was handed to the audio system. If its
// clock then turns out not to be moving, the chime is
// called off and onSilent (if given) is called, a moment
// later, so the caller can say something instead.
function playConfirmChime(onSilent) {
  try {
    // Known to be stopped: don't queue a chime that would
    // sound late, or not at all. Hybrid mode only: in
    // voice mode the clock can pause between mic restarts
    // and go on in time, and chimes there test fine.
    if (chimeCtx && chimeStalled && hybridMode()) {
      log("CHM", "chime clock stopped - speaking instead");
      return false;
    }
    if (!chimeCtx || chimeCtx.state !== "running") {
      if (chimeCtx) {
        log("CHM", "chime context " + chimeCtx.state +
            " - speaking instead");

        // may wake it in time for the next chime
        chimeCtx.resume().catch(function () {});
      }
      return false;
    }
    var ctx = chimeCtx;
    var t = ctx.currentTime;
    var gain = chimeGain();
    var notes = [];
    for (var i = 0; i < CHIME_FREQS.length; i++) {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      var t0 = t + i * CHIME_NOTE_S, t1 = t0 + CHIME_NOTE_S;
      o.type = "sine";
      o.frequency.value = CHIME_FREQS[i];

      // short ramps in and out, so the notes don't click
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
      g.gain.setValueAtTime(gain, t1 - 0.025);
      g.gain.linearRampToValueAtTime(0, t1);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t0);
      o.stop(t1);
      notes.push(g);
    }
    log("CHM", "confirm chime");
    setTimeout(function () { checkChimeClock(ctx, t, notes, onSilent); },
               CHIME_CHECK_MS);
    return true;
  } catch (e) {
    log("CHM", "chime failed: " + e.message);
    return false;
  }
}

// The clock hasn't moved since the chime was handed over:
// disconnect its notes, so it can't sound late, and let
// the caller say something instead.
function checkChimeClock(ctx, t, notes, onSilent) {
  if (ctx.currentTime !== t) {
    if (ctx === chimeCtx) chimeStalled = false;   // all well
    return;
  }
  chimeStalled = true;
  notes.forEach(function (g) {
    try { g.disconnect(); } catch (e) {}
  });
  log("CHM", "chime clock not moving (" + ctx.state +
      ") - chime called off" + (onSilent ? ", speaking instead" : ""));
  if (onSilent) onSilent();
}

// Hybrid mode only, twice a second: has the running
// context's clock moved since last time? A running
// context's clock always moves, even with nothing playing,
// so one that hasn't is stuck. Only hybrid mode needs
// this: its speech stops the clock between chimes. Voice
// mode has each chime's own check, and keys mode never
// chimes. ui.js starts and stops the watch as Play by
// changes (setChimeWatch).
var CHIME_WATCH_MS = 500;
var chimeWatch = null;
var watchedCtx = null, watchedAt = -1;

function setChimeWatch(on) {
  if (on && !chimeWatch) {
    chimeWatch = setInterval(watchChimeClock, CHIME_WATCH_MS);
  } else if (!on && chimeWatch) {
    clearInterval(chimeWatch);
    chimeWatch = null;
    watchedCtx = null;
  }
}

function watchChimeClock() {
  var ctx = chimeCtx;
  if (!ctx || ctx.state !== "running") {
    watchedCtx = null;
    return;
  }
  var now = ctx.currentTime;
  if (ctx === watchedCtx) {
    var stuck = now === watchedAt;
    if (stuck !== chimeStalled) {
      log("CHM", stuck ? "chime clock stopped"
                       : "chime clock moving again");
    }
    chimeStalled = stuck;
  }
  watchedCtx = ctx;
  watchedAt = now;
}
