/*  stall.js - notices when the page freezes.
 *
 *  A timer expects to run every STALL_TICK_MS. If it runs
 *  more than STALL_LOG_MS late, the page was frozen, and a
 *  LAG line says for how long. Hidden pages are skipped:
 *  iOS slows timers in the background on purpose, and that
 *  is not a freeze.
 */

"use strict";

var STALL_TICK_MS = 250;
var STALL_LOG_MS = 600;
var stallLast = 0, stallWasHidden = false;

function startStallWatch() {
  stallLast = Date.now();
  setInterval(function () {
    var now = Date.now();
    var hidden = document.visibilityState === "hidden";
    var late = now - stallLast - STALL_TICK_MS;
    if (!hidden && !stallWasHidden && late > STALL_LOG_MS) {
      log("LAG", "main thread stalled ~" +
          (late / 1000).toFixed(1) + "s");
    }
    stallLast = now;
    stallWasHidden = hidden;
  }, STALL_TICK_MS);
}
