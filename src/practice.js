  /*=========================== PRACTICE ===========================\
   *
   *  A WHOLE GAME, LOCALLY, WITH NOTHING SENT TO LICHESS. The
   *  entire pipeline runs - mic, parsing, the ambiguity
   *  dialogue, speech, the log - and the "opponent" picks
   *  uniformly at random from the legal moves. It is how the
   *  grammar is exercised without spending a real game, and it
   *  is what the harness drives.
   *
   *  SPLIT OUT OF dialogue.js AT w57. It had lived there since
   *  the v-series and it is not dialogue: dialogue decides what
   *  a sentence means and what to say back, and this simulates
   *  an opponent. The file it was in had grown three jobs, and
   *  this was the most separable of them - it shares exactly
   *  one flag with the rest of the program.
   *
   *  THAT FLAG IS dryRun, and it is declared here because this
   *  is what owns it. Everything else only ever ASKS: lichess.js
   *  refuses to send while it is true, ui.js toggles it, the
   *  harness sets it directly. It is read in a dozen places and
   *  written in three, all of which are about entering or
   *  leaving this mode.
   *
   *  W50 IS THE ENTRY WORTH READING before touching dryStart.
   *  Practice must put down everything that could deliver a
   *  real game - the game stream, the ACCOUNT event stream, any
   *  outstanding seek - because dryRun gags every announcement,
   *  and a real game arriving while it is on is a live clock in
   *  silence.
   *================================================================*/

  // practice mode: nothing is ever sent to Lichess
  var dryRun = false;

  function dryStart() {
    // EVERYTHING THAT COULD DELIVER A REAL GAME IS PUT DOWN
    // FIRST (w50). This used to close the game stream and the
    // timers and stop there, leaving the ACCOUNT event stream
    // open and any outstanding seek live. Both of those exist
    // precisely to start a game without being asked, and
    // dryRun then gagged the result: the join happened, the
    // real position replaced the practice one, and every
    // announcement was suppressed because practice mode was
    // still on. A real game with a running clock, in silence,
    // while the board in front of you says something else.
    // Practice is a mode where nothing is sent to Lichess, so
    // nothing may arrive from it either.
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    try { if (eventAbort) eventAbort.abort(); } catch (e) {}
    clearTimeout(eventTimer);
    cancelSeek();
    cancelChallenge();      /* an open challenge dies with practice too (w61) */
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
    clearDialogue();
    api.gameId = "PRACTICE";
    api.myColor = "w";
    api.pos = new RULES.Position();
    api.moves = [];
    api.over = false; api.overText = "";
    api.lastSan = ""; api.lastSanW = ""; api.lastSanB = "";
    api.wtime = 600000;
    api.btime = 600000;
    // AND NO TICKING (w60). remainingMs extrapolates for the
    // side to move whenever clockAt is set - and clockAt is set
    // by every real-game clock event and was cleared by
    // NOTHING. Play a real game, practice later, enter clock
    // mode: white's "10:00" had minutes-or-hours of elapsed
    // time subtracted and clamped to a red 0:00 - a flagged
    // clock in a mode that has no clock. Never seen only
    // because practice has always been a fresh signed-out page.
    // Null here, both halves show a frozen 10, which is what a
    // practice clock is.
    api.clockAt = null;
    // AND NOBODY IS PLAYING (w68). Exactly the w60 hazard one
    // field over: play a real game, then practice, and the
    // panel would still name the opponent you just finished
    // with - beside a board they are not on. There is no
    // opponent here; the row says so by being empty.
    api.players = { w: null, b: null };
    log("DRY", "practice mode ON - nothing will be sent to Lichess");
    speakWhenAudioSettled("Practice mode. You are white.");
  }

  function dryOpponentReply() {
    // it is scheduled 1.6s ahead, so it can land after
    // practice has ended - including after a real game took
    // the board. dryRun alone was the guard; the game id is
    // added because this function APPLIES A MOVE, and the one
    // thing it must never apply it to is a real position.
    if (!dryRun || api.over || api.gameId !== "PRACTICE") return;
    var legal = api.pos.legalMoves();
    if (!legal.length) {
      api.over = true;
      sayResult("Practice game over.");
      return;
    }
    var m = legal[Math.floor(Math.random() * legal.length)];
    var san = api.pos.sanOf(m);
    var uci = api.pos.uciOf(m);
    api.pos.apply(m);
    api.moves.push(uci);
    api.lastSan = san; api.lastSanB = san;
    log("DRY", "opponent plays random legal move " + uci + " = " + san);
    if (speakOpponentNow())
      speak(sanToSpeech(san) + ".", colorWord(api.myColor === "b" ? "w" : "b"));
    if (!api.pos.legalMoves().length) {
      api.over = true;
      sayResult("Practice game over.");
    }
  }

