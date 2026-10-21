/*  awake.js - keeps the screen on.
 *
 *  With the screen off, iOS suspends the page: the mic
 *  stops and the connections to Lichess die. So the screen
 *  is kept on while any of these holds:
 *    - a game is on (practice too)
 *    - a seek or challenge is waiting for an answer
 *    - Clock View is up
 *  and is let go otherwise, so the device can sleep
 *  between games. It is the same in Board View and Clock
 *  View.
 *
 *  One rule, in keepAwakeCheck(). boot.js runs it on every
 *  repaint tick (twice a second), which also takes the
 *  lock back after iOS drops it (it does whenever the page
 *  is hidden). Clock View, and every tap or key, run it at
 *  once as well, in case iOS only grants the lock during a
 *  tap.
 *
 *  The lock is the browser's Screen Wake Lock. WAK lines in
 *  the log say when it is taken, let go, lost or refused.
 */

"use strict";

// A refused request isn't asked again for this long, so a
// browser that keeps refusing doesn't fill the log.
var AWAKE_RETRY_MS = 10000;

var awakeLock = null;       // the lock, while held
var awakeAsking = false;    // a request is on its way
var awakeRetryAt = 0;       // after a refusal, not before this
var awakeMissingLogged = false;

// Why the screen should stay on now, or "" if it needn't.
function awakeReason() {
  if (clockViewOn()) return "Clock View";
  if (api.gameId && !api.over) return dryRun ? "practice" : "a game";
  if (seekAbort) return "a seek";
  if (challengeAbort) return "a challenge";
  return "";
}

function keepAwakeCheck() {
  var why = awakeReason();
  if (why && !awakeLock) takeAwakeLock(why);
  else if (!why && awakeLock) dropAwakeLock();
}

function takeAwakeLock(why) {
  if (awakeAsking || Date.now() < awakeRetryAt) return;
  if (!navigator.wakeLock) {
    if (!awakeMissingLogged) {
      awakeMissingLogged = true;
      log("WAK", "no wake lock in this browser - the screen may sleep");
    }
    return;
  }

  // a hidden page is always refused; the tick after it
  // comes back asks again
  if (document.visibilityState !== "visible") return;
  awakeAsking = true;
  navigator.wakeLock.request("screen").then(function (lock) {
    awakeAsking = false;
    awakeLock = lock;
    log("WAK", "screen kept on (" + why + ")");

    // iOS lets go of the lock when the page is hidden
    lock.addEventListener("release", function () {
      if (awakeLock !== lock) return;   // our own release
      awakeLock = null;
      log("WAK", "screen lock lost (page hidden?)");
    });

    // no longer wanted while it was on its way: let it go
    keepAwakeCheck();
  }).catch(function (e) {
    awakeAsking = false;
    awakeRetryAt = Date.now() + AWAKE_RETRY_MS;
    log("WAK", "wake lock refused: " + e.message);
  });
}

function dropAwakeLock() {
  var lock = awakeLock;
  awakeLock = null;
  lock.release().catch(function () {});
  log("WAK", "screen free to sleep");
}

// In the capture phase, so the check comes during the tap
// or key, whatever else it does.
function wireKeepAwake() {
  document.addEventListener("click", keepAwakeCheck, true);
  document.addEventListener("keydown", keepAwakeCheck, true);
}
