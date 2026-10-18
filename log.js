/*  log.js - the debug log shown by the Log button.
 *
 *  Each line is "time  TAG  message". The tags:
 *
 *    UI   page and buttons        SET  settings
 *    API  Lichess requests        NET  streams opening/closing
 *    EVT  stream events           MOV  moves applied
 *    HRD  what the mic heard      PRS  what it parsed to
 *    CND  legal moves matched     PST  a move or action sent
 *    SAY  what the voice said     TTS  the voice's own state
 *    CHM  the confirm chime       MIC  the mic
 *    AUD  the audio session       CLK  Clock View
 *    TCH  tapped moves            DRY  practice mode
 *    KEY  typed entries           MSG  shown, not said (keys)
 *    DLG  refusals                LAG  page freezes
 *    WAK  the screen kept on      MEMO spoken memos
 *    ERR  errors
 *
 *  The log is also kept in this browser, so a reload or a
 *  Safari crash doesn't lose what led up to it. On load the
 *  saved lines come back, then a line marking the reload.
 *  Clear empties both.
 *
 *  The sign-in token never appears here: lichess.js keeps
 *  it to itself.
 */

"use strict";

var LOG = [];
var logBody = null;

// Repainting a long log is slow, so the panel is only
// repainted while it is open. The Log button sets this.
var logPanelVisible = false;

function paintLog() {
  if (!logBody || !logPanelVisible) return;
  logBody.textContent = LOG.join("\n");
  logBody.scrollTop = logBody.scrollHeight;
}

function log(tag, msg) {
  tag = String(tag);
  while (tag.length < 3) tag = tag + " ";   // keep the column even
  var t = new Date().toTimeString().slice(0, 8);
  var line = t + "  " + tag + "  " + msg;
  LOG.push(line);
  if (LOG.length > LOG_MAX) LOG.shift();
  paintLog();
  console.log(line);
  saveLogSoon();
}

// ---- keeping the log ----

// Saved LOG_SAVE_MS after a new line, so one save covers a
// burst of lines, and at once when the page is hidden, the
// last chance before iOS may close it. A crash can lose
// only the last couple of seconds.
//
// localStorage is used directly rather than through
// store(): store() logs a failed save, which would ask for
// another save, which would fail again.
var LOG_KEY = "audioplay.log";
var LOG_SAVE_MS = 2000;
var logSaveTimer = null;
var logSaveFailed = false;

function saveLogSoon() {
  if (!logSaveTimer) logSaveTimer = setTimeout(saveLogNow, LOG_SAVE_MS);
}

function saveLogNow() {
  clearTimeout(logSaveTimer);
  logSaveTimer = null;
  try {
    localStorage.setItem(LOG_KEY, LOG.join("\n"));
    logSaveFailed = false;
  } catch (e) {
    // said once, in the browser console only
    if (!logSaveFailed) console.log("log not saved: " + e.message);
    logSaveFailed = true;
  }
}

// The Clear button (ui.js).
function clearLog() {
  LOG.length = 0;
  clearTimeout(logSaveTimer);
  logSaveTimer = null;
  try { localStorage.removeItem(LOG_KEY); } catch (e) {}
  if (logBody) logBody.textContent = "";
}

// Brings the saved lines back. Log lines carry the time
// but not the date, so the reload line gives the date.
(function restoreLog() {
  var saved = "";
  try { saved = localStorage.getItem(LOG_KEY) || ""; } catch (e) {}
  if (saved) {
    var lines = saved.split("\n");
    Array.prototype.push.apply(LOG, lines.slice(-LOG_MAX));
    log("UI", "---- page loaded " + new Date().toDateString() +
        " - the lines above are from before ----");
  }
})();

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") saveLogNow();
});
window.addEventListener("pagehide", saveLogNow);

window.addEventListener("error", function (e) {
  var file = String(e.filename || "").split("/").pop() || "?";
  log("ERR", (e.message || "?") + " @" + file + ":" + (e.lineno || "?"));
});
