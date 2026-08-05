  /*========================== DEBUG LOG ===========================*/

  var LOG = [];
  var logBody = null;

  function log(tag, msg) {
    var t = new Date().toTimeString().slice(0, 8);
    var line = t + "  " + tag + "  " + msg;
    LOG.push(line);
    if (LOG.length > LOG_MAX) LOG.shift();
    if (logBody) {
      logBody.textContent = LOG.join("\n");
      logBody.scrollTop = logBody.scrollHeight;
    }
    try { console.log("[voice] " + line); } catch (e) {}
  }

  window.addEventListener("error", function (e) {
    log("ERR", (e.message || "?") + " @" + (e.lineno || "?"));
  });

