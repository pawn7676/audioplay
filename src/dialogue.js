  /*=========================== DIALOGUE ===========================\
   *
   *  WHAT THIS FILE IS. Everything between "some words arrived"
   *  and "a move was sent, or a sentence was spoken". matching.js
   *  reduces the readings to at most one legal move; this decides
   *  what to do about it - play it, or say "Say again." - and it
   *  is the file that owes the user a sentence on every path out.
   *
   *  IT WAS 1,270 LINES THE DAY BEFORE w118, and its size WAS
   *  the old grammar: four kinds of open question, a repair
   *  chain, a candidate walk, a piece prompt, a partial prompt -
   *  all machinery for finishing sentences the mic had half
   *  delivered. The four-item grammar (parsing.js) does not
   *  allow half a sentence, so the machinery went with the
   *  hazard it managed. What survives is the one question that
   *  is not a move (resign/draw/claim, yes or no), the busy
   *  guard, the post pipeline, and the chime.
   *
   *  THE ORDER OF handleTranscripts IS STILL LOAD-BEARING:
   *  memo first (a memo naming a move must never be played),
   *  then the open yes/no, then commands, then the move.
   *
   *  SILENCE IS NOT AN ANSWER (constraint 5, header.js). Every
   *  path out of here speaks or chimes, except the two
   *  deliberate exceptions documented where they live: stray
   *  talk with no square in it, and yes/no/cancel with nothing
   *  open.
   *
   *  "Say again." IS THE WHOLE REFUSAL, verbatim, for
   *  everything that is not a clean legal four-item move
   *  (owner's decision, w118). The previous grammar's refusals
   *  read the hearing back ("I heard queen takes...") so a
   *  mishearing could be told from a bad move - worth it when
   *  a question hung on the answer, all talk now that nothing
   *  is ever asked. The log still carries what was heard, for
   *  afterwards; the room gets three words.
   *================================================================*/

  var confirmAction = null;  // key into CONFIRMS

  var CONFIRMS = {
    resign:        { yes: "resign", yesSay: "resigning.",
                     no: null, noSay: "cancelled." },
    offerdraw:     { yes: "draw/yes", yesSay: "draw offered.",
                     no: null, noSay: "cancelled." },
    drawoffer:     { yes: "draw/yes", yesSay: "draw accepted.",
                     no: "draw/no", noSay: "draw declined." },
    takebackoffer: { yes: "takeback/yes", yesSay: "takeback accepted.",
                     no: "takeback/no", noSay: "takeback declined." },
    // claim-victory (w61): offered when the opponent has been
    // gone past Lichess's window. "no" sends nothing - the
    // window stays open, and handleOpponentGone only re-arms
    // the question on a FRESH departure, so declining is
    // declining, not snoozing. "waiting." is the honest word.
    claimvictory:  { yes: "claim-victory", yesSay: "claiming the win.",
                     no: null, noSay: "waiting." }
  };

  var busy = false;

  /* NO QUESTION OUTLIVES THE GAME IT WAS ASKED IN (w50). The
   * bad case is not hypothetical: ask "resign", get "Resign
   * the game? Yes or no.", have the opponent mate you before
   * you answer, let the next game auto-join off the event
   * stream - and the first "yes" of the new game resigns it.
   * Called from everywhere a game begins or ends: joinGame,
   * the game-over branch, practice on and off, voice off. The
   * armed read-back goes too, since it refers to a move posted
   * in a game that is no longer the current one. (Four kinds
   * of question stood here until w118; the move questions died
   * with the grammar that needed them.)
   */
  function clearDialogue() {
    confirmAction = null;
    armedUci = null;
  }

  // THE CONFIRMATION BELONGS TO WHICHEVER EVENT ARRIVES FIRST
  // (v134). Two things confirm a move we posted - the stream
  // carrying our own uci back, and the 200 - and they arrive
  // in either order within the same second. armedUci is set by
  // acceptMove to the move we sent, and the first caller to
  // match it takes it. The loser finds it null and says
  // nothing, so nothing is doubled and nothing depends on who
  // won.
  //
  // ONLY A MOVE WE POSTED IS ARMED. A move made by hand on
  // the Lichess board arrives through the same syncMoves
  // path with no arm behind it and stays unspoken, as it
  // always has been. A TAPPED move (w86) is posted by us and
  // still not armed, on purpose: two taps prove the eyes are
  // on the screen, where the piece appearing is the answer.
  var armedUci = null;

  // The post-move feedback (w108 shape; the whole own-move
  // channel since w116): the chime when it can be scheduled, a
  // spoken "okay." when it cannot (rule 5 - never silence).
  // Under the w118 grammar the chime confirms a move the user
  // spoke WHOLE - all four items - so the one bit it carries
  // is the bit that is owed: heard exactly, legal, played.
  function confirmFeedback() {
    if (playConfirmChime()) return;
    speak("okay.");
  }

  // announce=false is a catch-up replay (reconnect,
  // takeback rebuild): it still DISARMS - that move is
  // history now and must not be confirmed when some later
  // event happens to match - but speaks nothing.
  function readBackMine(san, uci, announce) {
    if (!armedUci || armedUci !== uci) return;
    armedUci = null;
    if (!announce) return;
    // v104's rule: a SAN ending in # ends the game whoever
    // gets there first, and the result line says it better
    // than a confirmation can. api.over alone was not enough
    // then and is not now.
    if (api.over || /#$/.test(san)) return;
    confirmFeedback();
  }

  /* quiet=true is a tapped move (touch.js): no confirmation,
   * no arming - but every ERROR below still speaks, because a
   * failure must be heard whichever way the move went in.
   *
   * SINCE w118 THE ONLY OTHER CALLER IS THE FOUR-ITEM MATCH in
   * handleTranscripts: a reading that reduced to exactly one
   * legal move, spoken whole by the user. Nothing arrives here
   * inferred, repaired, or picked from a list - that machinery
   * is gone, and if a new path ever wants in without the whole
   * move behind it, that is the 11-Aug conversation to have
   * again, and the answer is no. */
  function acceptMove(c, quiet) {
    if (busy) {
      // SILENCE IS NOT AN ANSWER, not even for "I am still
      // working on the last one" (w50). It is a short window
      // normally; it was an unbounded one until postMove grew
      // a timeout.
      log("DLG", "ignored, busy");
      speak("still sending the last move.");
      return;
    }
    busy = true;
    var uci = api.pos.uciOf(c.m);

    if (dryRun) {
      api.pos.apply(c.m);
      api.moves.push(uci);
      api.lastSan = c.san; api.lastSanW = c.san;
      api.lastUci = uci;
      busy = false;
      log("DRY", "you play " + uci + " = " + c.san + " (not sent)");
      // same one-bit feedback as the live path, so practice
      // is where the chime can be heard without a game at
      // stake
      if (!quiet) confirmFeedback();
      // CALLED BY NAME, NOT BY REFERENCE (w54): late binding
      // costs nothing and means the current definition is the
      // one that runs.
      setTimeout(function () { dryOpponentReply(); }, 1600);
      return;
    }

    armedUci = quiet ? null : uci;        /* v134: see readBackMine */
    postMove(uci).then(function (r) {
      busy = false;
      var ok = r.status === 200 && r.body && r.body.ok !== false && !r.body.error;
      log("PST", uci + " -> " + r.status + " " + JSON.stringify(r.body).slice(0, 120));
      if (ok) {
        // THIS RESOLVES LATE. The gameState event for the same
        // move usually arrives before this promise does - on
        // the mating move, always - so whichever got here first
        // confirms, the other finds it disarmed (v134, v104:
        // see readBackMine).
        readBackMine(c.san, uci, true);
      } else {
        armedUci = null;     /* rejected: nothing to confirm */
        // A DEAD TOKEN IS NOT A BAD MOVE (w60). Mid-game
        // revocation used to speak "Lichess rejected that
        // move. error 401" per move - true words, wrong
        // diagnosis, and the one useful instruction (sign in
        // again) never said.
        if (r.status === 401 || r.status === 403) {
          var firstAuthFail = !authGone;
          noteAuthFailure(new Error("move HTTP " + r.status));
          if (!firstAuthFail) speak("still signed out. sign in again.");
          return;
        }
        if (r.status === 429) {
          // the one wrong answer to a 429 is trying again at
          // once, and "rejected" invites exactly that (w63)
          speak("Lichess asks us to slow down. " +
                "wait a moment, then say the move again.");
          return;
        }
        var msg = (r.body && r.body.error) ? String(r.body.error) : ("error " + r.status);
        speak("Lichess rejected that move. " + msg);
      }
    }).catch(function (e) {
      busy = false;
      armedUci = null;
      log("ERR", "post: " + e.message);
      speak("Could not reach Lichess.");
    });
  }

  /* Send a confirmed yes/no action and report what actually
   * happened (w50). In practice mode there is nothing to send
   * and nothing to fail, so it just says the line. */
  function confirmedAction(path, saidWhenSent) {
    if (dryRun) { speak(saidWhenSent); return; }
    postAction(path).then(function (r) {
      if (r.ok) { speak(saidWhenSent); return; }
      // THE STATUS IS PART OF THE ANSWER (w60). Lichess 400s
      // these paths in ordinary play - resign in the abortable
      // phase, a takeback the opponent just withdrew, a draw
      // offer that expired - and this spoke "resigning." over
      // every one of them.
      if (r.status === 401 || r.status === 403) {
        var firstFail = !authGone;
        noteAuthFailure(new Error("action HTTP " + r.status));
        if (!firstFail) speak("still signed out. sign in again.");
        return;
      }
      if (r.status === 429) {
        speak("Lichess asks us to slow down. try that again in a moment.");
        return;
      }
      var why = "";
      try { why = String(JSON.parse(r.body).error || ""); } catch (e) {}
      log("ERR", "action " + path + " refused: " + r.status +
          (why ? " " + why : ""));
      speak("Lichess refused that." + (why ? " " + why : ""));
    }).catch(function (e) {
      log("ERR", "action " + path + ": " + e.message);
      speak("could not reach Lichess. that did not go through.");
    });
  }

  function repeatLast() {
    speak(api.lastSan ? "Last move: " + moveToSpeech(api.lastSan, api.lastUci)
                      : "No move to repeat yet.");
  }

  function handleTranscripts(rawList) {
    nearMissLogged = {};  // one near-miss line per utterance (v116)
    var transcripts = dedupeTranscripts(rawList);
    var primary = transcripts[0] || "";
    var dropped = (rawList ? rawList.length : 0) - transcripts.length;
    log("HRD", transcripts.map(function (t, i) {
      return i + ":" + t;
    }).join(" | ") + (dropped ? "   (" + dropped + " dup)" : ""));

    // A verbal memo for the log. Checked before ANYTHING
    // else, because a memo that mentions a move must never
    // be parsed as one: in game3 a note containing a
    // currently legal move would have been PLAYED. Any
    // reading may carry the memo word. A pending yes/no
    // question survives a memo untouched.
    var memoText = memoTranscript(transcripts);
    if (memoText) {
      log("MEMO", memoText);
      speak("Memo recorded in log.");
      return;
    }
    // COMMANDS ARE READ FROM THE PRIMARY TRANSCRIPT ONLY, and
    // that is a decision, not an oversight (documented at
    // w54): "resign", "yes" and "draw" all END something, and
    // a command invented from a reading the mic ranked second
    // could resign a game the user is winning. A missed
    // command costs one repetition.
    var cmd = classifyCommand(primary);

    if (confirmAction) {
      var spec = CONFIRMS[confirmAction];
      // THE ANSWER WAITS FOR THE POST (w50): nothing is
      // claimed until the send succeeds, and a failed send
      // says so.
      if (cmd === "yes") {
        confirmAction = null;
        confirmedAction(spec.yes, spec.yesSay);
        return;
      }
      if (cmd === "no" || cmd === "cancel") {
        confirmAction = null;
        if (spec.no) confirmedAction(spec.no, spec.noSay);
        else speak(spec.noSay);      /* nothing to send: local */
        return;
      }
      speak("Say yes or no.");
      return;
    }

    if (cmd === "repeat") { repeatLast(); return; }
    if (classifyFlipClock(primary)) { flipClockSides(); return; }

    if (cmd === "resign") { confirmAction = "resign";
      speak("Resign the game? Yes or no."); return; }
    if (cmd === "draw") { confirmAction = "offerdraw";
      speak("Offer a draw? Yes or no."); return; }
    // YES, NO AND CANCEL WITH NOTHING OPEN ARE SILENT, ON
    // PURPOSE (documented at w54; the behaviour is older). It
    // looks like a constraint-5 violation and it is the
    // stray-talk exemption: the mic is open the whole game,
    // and CANCEL_WORDS includes "stop" and "forget", which
    // land in ordinary speech at the board more often than as
    // commands. The trade is only safe because it is narrow: a
    // yes or no that has a question to answer always speaks,
    // in the confirmAction block above.
    if (cmd === "yes" || cmd === "no" || cmd === "cancel") return;

    // Is there anything move-shaped in ANY reading - a
    // complete square, file and rank together. The mic is
    // open the whole game, so stray talk arrives here
    // constantly, and it should not be answered out loud.
    var moveLike = transcripts.some(hasSquare);

    if (!api.pos || api.over || api.pos.turn !== api.myColor) {
      if (!moveLike) {
        // ordinary talk, a cough, the television. Nothing
        // was being asked of us, so say nothing.
        log("HRD", "ignored, not a move: " + primary);
        return;
      }
      // a real move at the wrong moment IS worth answering
      if (!api.pos) speak("Not connected to a game yet.");
      else if (api.over) speak("The game is over.");
      else speak(colorWord(api.pos.turn) + " to move.");
      return;
    }

    log("PRS", describeItems(primary));
    var cands = collectMoves(api.pos, transcripts);
    log("CND", cands.map(function (c) { return c.san; }).join(",") ||
        "(none)");

    // EXACTLY ONE legal four-item move across every reading:
    // play it. The chime that follows the post is the whole
    // confirmation - see confirmFeedback.
    if (cands.length === 1) {
      acceptMove(cands[0]);
      return;
    }
    // More than one means rival readings disagree about which
    // legal move was said - a mishearing by definition, and
    // never a pick (w118; the log above names them both).
    // Zero with a square in the utterance means damaged,
    // incomplete, or illegal. ONE ANSWER FOR ALL OF IT
    // (owner's decision, w118): no read-back of the hearing,
    // no legality lecture, no filling the gap however unique
    // the completion. "If we get too fancy with using logic to
    // fix mishears, we're going down the wrong path."
    if (moveLike || cands.length > 1) {
      speak("Say again.");
      return;
    }
    // no square anywhere: stray talk, logged and left alone
    log("HRD", "ignored, not a move: " + primary);
  }
