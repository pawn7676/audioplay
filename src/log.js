  /*========================== DEBUG LOG ===========================*/

  var LOG = [];
  var logBody = null;

  /* THE PANEL IS REPAINTED ONLY WHEN IT CAN BE SEEN (w53).
   * This joined up to LOG_MAX lines - three thousand - and
   * reassigned textContent on EVERY log line, whether or not
   * the panel was open. The log is chatty during a game (every
   * heard utterance, every parse, every move, every net event),
   * so that is a few hundred kilobytes of string built and
   * thrown away per move, on a device that is also running
   * speech recognition and a synthesiser. The panel's own
   * toggle already repaints on open, so a hidden panel loses
   * nothing by being skipped; logPanelVisible is what the
   * toggle sets. */
  var logPanelVisible = false;

  function paintLog() {
    if (!logBody || !logPanelVisible) return;
    logBody.textContent = LOG.join("\n");
    logBody.scrollTop = logBody.scrollHeight;
  }

  function log(tag, msg) {
    var t = new Date().toTimeString().slice(0, 8);
    var line = t + "  " + tag + "  " + msg;
    LOG.push(line);
    if (LOG.length > LOG_MAX) LOG.shift();
    paintLog();
    try { console.log("[voice] " + line); } catch (e) {}
  }

  window.addEventListener("error", function (e) {
    log("ERR", (e.message || "?") + " @" + (e.lineno || "?"));
  });

