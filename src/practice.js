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
    api.lastSan = "";
    api.lastUci = "";
    // THE PRACTICE CLOCK IS REAL (w128, owner's ask, third
    // draft of this block - and a FOURTH at w139: the w138
    // v141 sync nulled it because the userscript's practice
    // has no rail to draw on, and the owner called that an
    // overstep here, where it does). w60 froze it at 10:00 -
    // a placeholder in the data, right when the only clock on
    // screen was the opt-in overlay. w127 read the frozen
    // number as fake and nulled it to dashes - and the owner
    // wanted the opposite: a clock that RUNS, like a game's.
    // So: ten minutes each, and the same remainingMs that
    // drains a live game's clock drains this one - same ply
    // gating (nothing moves until both sides have played),
    // same turn colours, same red under a minute. What a
    // server does for a real game, bankPracticeClock below
    // does here: the mover's drained value is written back
    // as their move applies, and the anchor resets. One
    // honest difference is left: nothing ends a practice
    // game on time. A flag sits at red 0:00 while play goes
    // on - practice has no referee, and losing on time is
    // not what practice is FOR.
    api.wtime = 600000;
    api.btime = 600000;
    api.clockAt = Date.now();
    // still re-anchored here explicitly (the w60 lesson): a
    // real game's stale anchor must never leak into practice
    // - it used to arrive minutes old and flag white on
    // entry. The banking resets it per move once play
    // starts; this covers the entry itself.
    api.movesBefore = 0;
    // AND NOBODY IS PLAYING (w68). Exactly the w60 hazard one
    // field over: play a real game, then practice, and the
    // panel would still name the opponent you just finished
    // with - beside a board they are not on. There is no
    // opponent here; the row says so by being empty.
    api.players = { w: null, b: null };
    log("DRY", "practice mode ON - nothing will be sent to Lichess");
    speakWhenAudioSettled("Practice mode. You are white.");
  }

  // What the server does for a real game's clock, done here
  // for practice (w128): at the moment a move applies, the
  // MOVER's clock stops - their drained value is banked into
  // wtime/btime - and the anchor resets so remainingMs
  // starts draining the other side. Called with the mover
  // still to move (before pos.apply), because remainingMs
  // reads api.pos.turn to decide whose clock is running.
  // Clamped at zero: a flagged practice clock shows 0:00 and
  // play continues (see the dryStart note).
  function bankPracticeClock() {
    if (api.gameId !== "PRACTICE" || api.over || !api.pos) return;
    var mover = api.pos.turn;
    var left = remainingMs(mover);
    if (left != null) {
      if (left < 0) left = 0;
      if (mover === "w") api.wtime = left;
      else api.btime = left;
    }
    api.clockAt = Date.now();
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
    bankPracticeClock();   /* the opponent's think drained their clock */
    api.pos.apply(m);
    api.moves.push(uci);
    api.lastSan = san;
    api.lastUci = uci;
    log("DRY", "opponent plays random legal move " + uci + " = " + san);
    speak(moveToSpeech(san, uci) + ".");
    if (!api.pos.legalMoves().length) {
      api.over = true;
      sayResult("Practice game over.");
    }
  }

