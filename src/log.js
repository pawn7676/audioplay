  /*========================== DEBUG LOG ===========================*/

  /* THE TAGS, for reading a pasted log (w119 - the owner asked
   * what PST meant, which means the log was not carrying its
   * own key). Nothing enforces this list; it is the convention
   * the log() calls follow, and a new tag belongs here too.
   *
   *   UI   page chrome: buttons, panels     SET  settings loaded or changed
   *   API  a Lichess REST call              NET  streams opening and closing
   *   EVT  an event a stream delivered      MOV  a move applied to the board
   *   HRD  what the recognizer heard        PRS  the items parsed out of it
   *   CND  candidate legal moves matched    PST  a move POSTed + the answer
   *   SAY  what the voice spoke             TTS  the synthesizer's own state
   *   CHM  the confirm chime                MIC  recognizer lifecycle
   *   AUD  the audio session and route      CLK  clock mode
   *   TCH  tap moves on the board           DRY  practice mode
   *   DLG  dialogue-level refusals          LAG  main-thread stalls
   *   ERR  page errors
   *
   * The one worth knowing cold: a PST line is the POST of your
   * move to Lichess and, on its second line, the HTTP status
   * that came back - "d2d4 -> 200 {"ok":true}" is Lichess
   * saying yes. The EVT gameState that lands beside it is the
   * same move returning on the game stream; both are logged
   * because they race (see acceptMove), and which one wins
   * differs move to move even within one game. */
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

