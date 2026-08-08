  /*========================= STALL WATCH ==========================\
   *
   *  A heartbeat that notices the main thread freezing (w90).
   *
   *  Born of the w87-w89 lag hunt: three fixes aimed at the
   *  keep-alive eviction fight, and the w89 log disproved the
   *  whole line - the holder never played at all, the session
   *  was declared, and the page still froze for seconds at a
   *  time. "It felt laggy around then" cannot pick between
   *  the mic, the synthesizer, and the OS; a log line saying
   *  the main thread stalled, HOW LONG, and WHEN, sits right
   *  next to the SAY/MIC/AUD lines that name what was running.
   *  Measure first; the next theory has to fit the numbers.
   *
   *  A setInterval beat expects itself every STALL_TICK_MS;
   *  arriving later than STALL_LOG_MS beyond that is a stall
   *  worth a line. The interval is being throttled rather
   *  than blocked whenever the page is HIDDEN - iOS slows
   *  background timers on purpose - so a beat that wakes
   *  hidden, or wakes from hidden, only resets its clock:
   *  screen-off play must not fill the log with stalls that
   *  are really naps.
   */

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
