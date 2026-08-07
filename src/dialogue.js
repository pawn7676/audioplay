  /*=========================== DIALOGUE ===========================\
   *
   *  WHAT THIS FILE IS. Everything between "some words arrived"
   *  and "a move was sent, or a question was asked". matching.js
   *  decides which moves a sentence COULD mean; this decides
   *  what to do about it - play it, ask about it, repair it, or
   *  refuse it - and it is the file that owes the user a
   *  sentence on every path out.
   *
   *  It had no header at all until w54, which is the only file
   *  of this size that did. The reasoning was all here, but as
   *  fifty local comments with no map over them, so the shape
   *  of the thing had to be reconstructed by reading it end to
   *  end. This is the map.
   *
   *  THE FOUR QUESTIONS IT CAN HAVE OPEN, and they are the
   *  file's real state:
   *    pending     - a walk through candidate moves, yes/no
   *    confirmAction - a yes/no on resign, draw, takeback
   *    pieceAsk    - "no pawn can go there, say queen or rook"
   *    partialAsk  - half a move heard, "say the rank"
   *  The last two carry the ply they were asked at, so they
   *  expire when the position moves on. None of them may
   *  outlive their GAME - see clearDialogue, and w50, which is
   *  what happens when they do.
   *
   *  THE ORDER OF handleTranscripts IS LOAD-BEARING, and every
   *  step of it was paid for: memo first (a memo naming a move
   *  must never be played), then an open question's answer,
   *  then commands, then moves, then the repair chain. Moving
   *  any of these changes the grammar.
   *
   *  SILENCE IS NOT AN ANSWER (constraint 5, header.js). Every
   *  path out of here speaks, including the refusals, the
   *  busy path and the failures. Two deliberate exceptions are
   *  documented where they live: stray talk on the opponent's
   *  clock, and a filler-only utterance.
   *
   *  THE REPAIR CHAIN is an ordered list of named repairs, each
   *  stating its own constraint, tried in order until one can
   *  ask something answerable. A repair may be fired by a RIVAL
   *  transcription, but then it may only ask, never play (w49).
   *
   *  This file has grown three jobs - the dialogue proper,
   *  practice mode, and the repair chain - and the review that
   *  produced w50 to w54 recommends splitting the last two out.
   *  That is deliberately NOT done yet: it is pure motion, and
   *  pure motion belongs on its own, after the behaviour has
   *  settled.
   *================================================================*/

  var pending = null;        // { cands: [{m,san}], idx }
  var confirmAction = null;  // key into CONFIRMS

  // THE PIECE QUESTION IS ANSWERABLE (v92). When a bare
  // square can only be reached by a piece, this file says
  // so and names the pieces — "no pawn can go there. say
  // queen, king or bishop." Through v91 that question had
  // nowhere to land: the branch spoke and returned, so the
  // square was gone, and the one-word answer arrived as a
  // request with no square at all. reqIsEmpty counts that
  // as nothing heard, so game11 answered "Bishop" exactly
  // as asked and got "Say again."
  // CONFIRMED in practice: "echo two" after 1.e4 raises the
  // question, and "Night" plays Ne2 with no yes/no. That
  // position is the standing test — e2 is unreachable by
  // any pawn and reachable by three pieces.
  // A prompt must be able to receive its own answer.
  // The square is kept here with the ply it was asked at,
  // so it expires by itself the moment the position moves
  // on and no clearing is needed anywhere else.
  var pieceAsk = null;       // { moves, ply, capture, sq }

  // HALF A MOVE IS KEPT AS A QUESTION (v117). When the mic
  // delivers a recognisable half - "queen alpha" with the
  // rank eaten, "queen takes" with the target eaten - and
  // MORE than one move fits, re-saying the whole move
  // wastes the half that arrived. The half is stored here
  // with the ply it was heard at, exactly as pieceAsk keeps
  // its square, and the prompt asks for ONLY the missing
  // part: "say the rank", "say the target". The answer
  // completes the move; both halves came from the user, so
  // a unique fit is accepted the v92 way. Ply-guarded, so
  // it expires by itself when the position moves on.
  //
  // "BOTH HALVES CAME FROM THE USER" IS ALMOST TRUE (w54).
  // Since w49 a repair may also be raised by a RIVAL reading -
  // one the mic ranked second - and in that case the first
  // half came from a guess, not from the user. The question
  // is still the whole safeguard: the rival reading may only
  // ASK, so nothing plays until the user has answered, and the
  // answer is unambiguously theirs. The claim is left standing
  // because it says what matters - a completed move has been
  // confirmed by the person - but it is not literally the
  // provenance of both halves, and the difference is worth
  // knowing before widening this again.
  var partialAsk = null;     // { req, want, chk, mate, ply }

  var CONFIRMS = {
    resign:        { yes: "resign", yesSay: "resigning.",
                     no: null, noSay: "cancelled." },
    offerdraw:     { yes: "draw/yes", yesSay: "draw offered.",
                     no: null, noSay: "cancelled." },
    drawoffer:     { yes: "draw/yes", yesSay: "draw accepted.",
                     no: "draw/no", noSay: "draw declined." },
    takebackoffer: { yes: "takeback/yes", yesSay: "takeback accepted.",
                     no: "takeback/no", noSay: "takeback declined." }
  };
  /* A REPAIR MAY BE FIRED BY A RIVAL READING, BUT THEN IT MAY
   * ONLY ASK (w49).
   *
   * Safari returns up to eight rival transcriptions.
   * collectCandidates has read all of them since the v-series -
   * scored by which alternative they came from, demoted a tier
   * if they lost a word. The repair chain never saw past the
   * first: handleTranscripts parsed transcripts[0] and every
   * repair worked from that one request.
   *
   * Game w47-1, 20:09:06: six readings arrived and the SECOND
   * was "Pond takes", which parses cleanly and would have
   * played. The primary was "Plants". The move was lost.
   *
   * The rule for what a rival reading may do is v119's, applied
   * one level out. There the line was that a request whose
   * PIECE is inferred rather than heard still confirms. Here
   * the whole REQUEST is inferred - it is not what the mic
   * ranked first - so it may raise a question and may not
   * play a move. That keeps this strictly additive: it can
   * only ever turn "Say again." into something answerable,
   * which is the same bar w40 set for the origin repair.
   */
  var repairMayPlay = true;
  var busy = false;

  /* NO QUESTION OUTLIVES THE GAME IT WAS ASKED IN (w50).
   *
   * There are four dialogue states and, until now, no single
   * place that put them down. The two ply-guarded ones expire
   * by themselves WHILE a game runs - that is what the ply is
   * for - but joinGame resets api.moves to empty, so a question
   * asked at ply 0 of one game is still "current" at ply 0 of
   * the next. The two yes/no states had no expiry at all.
   *
   * The bad case is not hypothetical and it is not small: ask
   * "resign", get "Resign the game? Yes or no.", have the
   * opponent mate you or flag you before you answer, let the
   * next game auto-join off the event stream - and the first
   * "yes" of the new game resigns it. Nothing in the old code
   * stood between those two events.
   *
   * Called from everywhere a game begins or ends: joinGame,
   * the game-over branch, practice on and off, voice off. The
   * armed read-back goes with them, since it refers to a move
   * posted in a game that is no longer the current one.
   */
  function clearDialogue() {
    pending = null;
    confirmAction = null;
    pieceAsk = null;
    partialAsk = null;
    armedUci = null;
    repairMayPlay = true;
  }

  // WHICH VOICE SETTINGS APPLY DEPENDS ON WHICH RENDERER IS
  // UP (v124). The panel keeps separate switches for voice
  // mode and clock mode; these read the right one at the
  // moment of speaking, so flipping a toggle or entering
  // clock mode changes behaviour immediately.
  function readBackMineNow() {
    return clockModeOn() ? CFG.clockReadBackMine : CFG.readBackMine;
  }
  function speakOpponentNow() {
    return clockModeOn() ? CFG.clockSpeakOpponent : true;
  }

  // THE READ-BACK BELONGS TO WHICHEVER EVENT ARRIVES FIRST
  // (v134). Two things confirm a move we posted - the
  // stream carrying our own uci back, and the 200 - and
  // they arrive in either order within the same second (see
  // the note in acceptMove). Hanging the read-back on the
  // 200 alone meant that when the stream won AND the
  // opponent replied instantly, their move was announced
  // first: game24 14:18:58 said "black charlie 5" before
  // "white echo 4", an answer before the question.
  //
  // armedUci is set by acceptMove to the move we sent, and
  // the first caller to match it takes it. The loser finds
  // it null and says nothing, so nothing is doubled and
  // nothing depends on who won.
  //
  // ONLY A MOVE WE POSTED IS ARMED. A move made by hand on
  // the Lichess board arrives through the same syncMoves
  // path with no arm behind it and stays unspoken, as it
  // always has been.
  var armedUci = null;

  // announce=false is a catch-up replay (reconnect,
  // takeback rebuild): it still DISARMS - that move is
  // history now and must not be read back when some later
  // event happens to match - but speaks nothing.
  function readBackMine(san, uci, announce) {
    if (!armedUci || armedUci !== uci) return;
    armedUci = null;
    if (!announce) return;
    // v104's rule, moved here whole: a SAN ending in # ends
    // the game whoever gets there first, and the result
    // line says it better than a read-back can. api.over
    // alone was not enough then and is not now.
    if (api.over || /#$/.test(san)) return;
    if (readBackMineNow()) speak(sanToSpeech(san), colorWord(api.myColor));
  }

  function acceptMove(c) {
    if (busy) {
      // SILENCE IS NOT AN ANSWER, not even for "I am still
      // working on the last one" (w50). This logged and
      // returned, so a move dictated while the previous post
      // was still in flight produced nothing at all - and
      // nothing is the same sound as not heard, which is an
      // invitation to say it again and to keep saying it. It
      // is a short window normally; it was an unbounded one
      // until postMove grew a timeout.
      log("DLG", "ignored, busy");
      speak("still sending the last move.");
      return;
    }
    busy = true;
    pending = null;
    var uci = api.pos.uciOf(c.m);

    if (dryRun) {
      api.pos.apply(c.m);
      api.moves.push(uci);
      api.lastSan = c.san; api.lastSanW = c.san;
      busy = false;
      log("DRY", "you play " + uci + " = " + c.san + " (not sent)");
      if (readBackMineNow())
        speak(sanToSpeech(c.san), colorWord(api.myColor || "w"));
      // CALLED BY NAME, NOT BY REFERENCE (w54). Passing the
      // function itself captures whatever it is bound to RIGHT
      // NOW, so a reply already in flight could not be called
      // off - the harness stubs dryOpponentReply out and the
      // scheduled one ran the original anyway, which is why it
      // then had to sleep 1.7 seconds to absorb it, once, in
      // the middle of the suite. Late binding costs nothing and
      // means the current definition is the one that runs.
      setTimeout(function () { dryOpponentReply(); }, 1600);
      return;
    }

    armedUci = uci;                       /* v134: see readBackMine */
    postMove(uci).then(function (r) {
      busy = false;
      var ok = r.status === 200 && r.body && r.body.ok !== false && !r.body.error;
      log("PST", uci + " -> " + r.status + " " + JSON.stringify(r.body).slice(0, 120));
      if (ok) {
        // THIS RESOLVES LATE. The gameState event for
        // the same move usually arrives before this promise
        // does — on the mating move, always — so the clear
        // below can land after something more important has
        // already been written. It must never stomp it.
        // The same lateness is why api.over silences the
        // read-back: on the mating move game13 heard
        // "checkmate. white wins." and THEN "queen takes
        // golf 7, checkmate", learning the result before
        // the move that caused it and hearing checkmate
        // twice. Once the game is over the read-back has
        // nothing left to confirm — the result confirms it.
        // CONFIRMED: a one-move mate played on purpose, the
        // 200 landing after the game-over line exactly as
        // before, and nothing spoken after "checkmate.
        // white wins."
        //
        // api.over ALONE WAS NOT ENOUGH (v104). It is only
        // true here when the stream won the race; game15
        // had the 200 come back FIRST, so the flag was
        // still false and the read-back went out ahead of
        // the result — "rook delta 8, checkmate. checkmate.
        // white wins." Both orderings happen within the
        // same second and neither can be predicted. The SAN
        // itself is the signal that does not race: a move
        // ending in # ENDS THE GAME, whoever gets there
        // first, so it is never read back at all. Both
        // rules now live in readBackMine, which this branch
        // and the stream both call; whichever got here
        // first speaks, the other finds it disarmed.
        readBackMine(c.san, uci, true);
      } else {
        armedUci = null;     /* rejected: nothing to read back */
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
    postAction(path).then(function () {
      speak(saidWhenSent);
    }).catch(function (e) {
      log("ERR", "action " + path + ": " + e.message);
      speak("could not reach lee chess. that did not go through.");
    });
  }

  function askCandidate() {
    if (!pending || pending.idx >= pending.cands.length) {
      // "no" to a one-entry list deserves the truth: there
      // was nothing else it could have been. Game7 rejected
      // a correct Qxf7 repair expecting to hear
      // alternatives, and "no more options" read as a
      // malfunction rather than the answer.
      var lone = pending && pending.cands.length === 1;
      pending = null;
      speak(lone
        ? "That was the only legal move fitting what I " +
          "heard. Say the whole move again."
        : "No more options. Say the whole move again.");
      return;
    }
    var c = pending.cands[pending.idx];
    // When the list mixes piece types - the bare-square
    // guard's pawn-plus-shadows shape - the question says
    // the shortcut exists, ONCE, on the first ask. Game20
    // walked pawn-no, queen-no, knight-yes at 17:38; one
    // "knight" now does it (v116, see the piece-answer
    // branch in handleTranscripts).
    var kinds = {};
    pending.cands.forEach(function (x) { kinds[x.m.piece] = 1; });
    if (pending.idx === 0 && Object.keys(kinds).length > 1) {
      speak("Did you mean " + sanToSpeech(c.san) +
            "? Yes, no, or name the piece.");
    } else {
      speak("Did you mean " + sanToSpeech(c.san) + "?");
    }
  }

  // "black 5 15. white 6 35." — own clock first, minutes
  // then seconds, no unit words (v65, was "black has 5
  // minutes 15 seconds"). Seconds under ten are spoken with
  // "oh" so 5:06 is "5 oh 6", not "5 6" which sounds like
  // 56. Under a minute the minutes are dropped and the unit
  // returns: "black 53 seconds." An exact minute count does
  // the same the other way: "black 10 minutes", since v66 —
  // 10:00 came out as the nonsense "10 oh 0". Seconds are
  // FLOORED since v67: rounding spoke one second ahead of
  // the screen (game4 note, 19:02:38), because Lichess
  // truncates — 34:07.6 shows as 34:07 and must be spoken
  // as "34 oh 7", not "34 oh 8".
  function speakClocks() {
    function fmt(ms) {
      if (ms == null) return null;
      var s = Math.max(0, Math.floor(ms / 1000));
      var m = Math.floor(s / 60);
      s = s % 60;
      if (!m) return s + (s === 1 ? " second" : " seconds");
      if (!s) return m + (m === 1 ? " minute" : " minutes");
      return m + " " + (s < 10 ? "oh " + s : s);
    }
    var mine = fmt(myRemainingMs());
    var theirs = fmt(api.myColor === "w" ? api.btime : api.wtime);
    if (mine || theirs) {
      speak(colorWord(api.myColor) + " " + (mine || "unknown") + ". " +
            colorWord(api.myColor === "w" ? "b" : "w") + " " +
            (theirs || "unknown") + ".");
    } else speak("No clock information.");
  }

  // The moves matching a one-word answer to an outstanding
  // piece question, or null if this is not one (v92). A
  // named PAWN is never an answer: the question is only
  // ever asked because no pawn can reach the square.
  // Is a piece question outstanding, and is this utterance
  // shaped like an answer to it — a piece and nothing else?
  function pieceAskOpen(req) {
    if (!pieceAsk || !api.pos) return false;
    if (pieceAsk.ply !== api.moves.length) return false;
    if (req.squares.length || req.castle) return false;
    // "A PIECE AND NOTHING ELSE" HAS TO MEAN IT (w51). The
    // comment above said that and the code excluded only
    // squares and castling, so a capture word, a named victim
    // or a trailing piece all sailed through. With a push
    // question open ("no pawn can go there. say queen, king or
    // bishop.") an unrelated "queen takes rook" that finds no
    // move of its own reached here FIRST - handleTranscripts
    // tries the answer before the move - and was swallowed as
    // the one-word answer "queen", offering, or with confirm
    // off PLAYING, a quiet queen move nobody asked for. An
    // answer is a word; this is a sentence.
    if (req.capture && !pieceAsk.capture) return false;
    if (req.victim || req.trailingPiece) return false;
    // a capture question can also be answered with a FILE,
    // because that is how it offers its pawn options
    // ("echo takes delta 5" -> "echo"). A bare file lands in
    // fromFile, as game13's "Rock Charli" showed.
    if (pieceAsk.capture && req.fromFile && !req.fromRank) return true;
    return !!req.piece;
  }

  // What the user just named, in the words the question
  // used: a piece name, or a file for a pawn capture.
  function pieceAskNamed(req) {
    if (req.piece) return PIECE_NAME[req.piece];
    if (req.fromFile) {
      return (SPOKEN_FILE[req.fromFile] || req.fromFile) + " pawn";
    }
    return "that";
  }

  // ...and can that piece actually go there. Null covers
  // both "not an answer" and "wrong piece"; the caller
  // separates them with pieceAskOpen.
  //
  // A NAMED PAWN USED TO BE REFUSED OUTRIGHT, on the grounds
  // that "the question exists because no pawn can" - which was
  // true of the only question that existed when that was
  // written (v92's "no pawn can go there. say queen, king or
  // bishop"). w43 gave askPiece a second job: asking WHICH
  // piece captures, where the options routinely include pawns,
  // offered by their file because that is how a pawn capture is
  // spoken. Game w44-1 at 17:50:11 answered such a question
  // with "pawn" - two of the three options were pawn captures -
  // and was told "no pawn can take there", which was both false
  // and a dead end.
  //
  // So a named pawn narrows to the pawn moves on offer, the
  // same way naming any other piece does. One pawn move left
  // plays it; several walk the ordinary yes/no, which names
  // each capture in full - "did you mean charlie takes delta
  // 6?" - so the files still reach the ear.
  function pieceAskAnswer(req) {
    if (!pieceAskOpen(req)) return null;
    var ms;
    if (req.piece === "p") {
      ms = pieceAsk.moves.filter(function (m) { return m.piece === "p"; });
    } else if (req.piece) {
      ms = pieceAsk.moves.filter(function (m) {
        return m.piece === req.piece;
      });
    } else if (pieceAsk.capture && req.fromFile) {
      // a file answers for the pawn that stands on it
      ms = pieceAsk.moves.filter(function (m) {
        return m.piece === "p" &&
               RULES.sqName(m.from)[0] === req.fromFile;
      });
    } else return null;
    return ms.length ? ms : null;
  }

  // THE QUESTION AND ITS RE-ASK IN ONE PLACE (v96), so the
  // two wordings cannot drift apart and both leave the same
  // state behind. Answering with a piece that cannot reach
  // the square used to fall through to "I didn't catch a
  // move", which is a lie — "Rook" was caught exactly, it
  // simply does not fit — and it dropped the question on
  // the floor, so the user was left re-saying a whole move
  // to a script that had just asked them a question.
  // CONFIRMED in practice from the e2 position: "Rook"
  // twice in a row re-asked twice and left the question
  // standing, then "King" played Ke2. Worth knowing when
  // reading these logs — Safari hears "Rock", so HRD shows
  // that while PRS shows the r it parsed to. The rook was
  // always recognised; it simply cannot reach e2, which is
  // exactly why that square is the test.
  function askPiece(moves, lead, sq) {
    var seen = {}, list = [];
    moves.forEach(function (m) {
      var w;
      if (sq && m.piece === "p") {
        var f = RULES.sqName(m.from)[0];
        w = SPOKEN_FILE[f] || f;
      } else w = PIECE_NAME[m.piece];
      if (seen[w]) return;
      seen[w] = 1;
      list.push(sq ? w + " takes " + spokenSquare(sq) : w);
    });
    pieceAsk = { moves: moves, ply: api.moves.length,
                 capture: !!sq, sq: sq || null };
    // ", or " not " or ": splitForSpeech gives a comma
    // GAP_CLAUSE_MS, and the boundary between the options
    // is where a pause helps most
    speak(lead + " say " +
      (list.length === 1 ? list[0]
                         : list.slice(0, -1).join(", ") + ", or " +
                           list[list.length - 1]) + ".");
  }

  /* ONE PLACE DECIDES PLAY OR ASK, AND ONE NARROWS BY CHECK.
   *
   * Six repairs carried a copy of each. The play-or-ask copy was
   * always the same three lines - one candidate and confirmation
   * off means play it, anything else asks - re-decided six times,
   * each with its own log line saying the same thing in slightly
   * different words. The check/mate copy was five lines, pasted
   * verbatim; the w40 origin repair got its copy by pasting the
   * w116 one, which is how a seventh would have arrived.
   *
   * Nothing behavioural changes here. The point is that the rule
   * for when a move may be played WITHOUT being confirmed is the
   * most consequential rule in this file - game6 was that rule
   * getting it wrong once - and a rule worth that much should be
   * readable in one place rather than reconstructed from six.
   *
   * The one caller NOT folded in is the main candidate path,
   * which runs bareGuardCands first: that guard exists precisely
   * because an ordinary reading is the one shape a misheard piece
   * name can slip through, and the repairs below have already
   * counted over every legal move landing where they are looking.
   * Different decision, kept separate.
   */
  /* MOVES BECOME CANDIDATES IN ONE PLACE, and the promotion
   * variants collapse on the way.
   *
   * Game w46-1, 19:19:24: answering "pawn" to a half-square
   * question offered bxa4 and then bxa8 FOUR TIMES over -
   * queen, rook, bishop, knight - so five questions stood
   * between the owner and two moves he could name. findMoves
   * has collapsed promotions since long before today, but six
   * repair sites each built their own candidate list and none
   * of them did.
   *
   * THE TRADEOFF, and it is a real one: underpromotion is no
   * longer reachable by saying "no" four times. It is reachable
   * the way the grammar has always offered it, by naming the
   * piece - "echo takes delta 8 equals rook" - which the owner
   * already says fluently. Four questions to reach a rook, on
   * every promotion, to keep a path that duplicates a phrase
   * that already works, is the wrong side of that trade. If a
   * game ever wants the old behaviour back this is the comment
   * to argue with.
   */
  function candidatesOf(moves, req) {
    var want = (req && req.trailingPiece && req.trailingPiece !== "p")
             ? req.trailingPiece : "q";
    var at = {}, kept = [];
    moves.forEach(function (m) {
      if (!m.promotion) { kept.push(m); return; }
      var key = RULES.sqName(m.from) + RULES.sqName(m.to);
      if (!(key in at)) { at[key] = kept.length; kept.push(m); return; }
      // same pawn, same square, different piece: keep whichever
      // was asked for, in the position the first one held
      if (m.promotion === want) kept[at[key]] = m;
    });
    var legal = api.pos.legalMoves();
    return kept.map(function (m) {
      return { m: m, san: api.pos.sanOf(m, legal) };
    });
  }

  /* NAMING SEVERAL MOVES FROM ONE POSITION (w53). sanOf
   * regenerates the legal move list whenever it is not handed
   * one - it needs it for disambiguation - so a map or filter
   * that names N moves generated the list N times, from a
   * position that cannot have changed inside the loop. Every
   * such place now generates it once and passes it down. */
  function sansOf(moves) {
    var legal = api.pos.legalMoves();
    return moves.map(function (m) { return api.pos.sanOf(m, legal); });
  }

  function offer(cands, label) {
    var play = cands.length === 1 && !CFG.confirmMyMove && repairMayPlay;
    if (label) {
      log("CND", label + ": " +
          cands.map(function (c) { return c.san; }).join(",") +
          (cands.length === 1 ? " fits, " : " fit, ") +
          (play ? "playing" : "asking"));
    }
    if (play) {
      acceptMove(cands[0]);
      return;
    }
    pending = { cands: cands, idx: 0 };
    askCandidate();
  }

  /* A spoken check word narrows the fits to checks, "mate"
   * narrows further to mates - but only when something survives,
   * so a misheard check word can never empty the list. */
  /* SAYING "CHECK" OR "MATE" NARROWS A LIST, and there was one
   * copy of that per SHAPE of list (w57): this one over
   * candidates, which carry their san, and a second inside
   * partialAnswer over raw moves, which have to be named
   * first. Ten lines each, the same ten lines, in two places
   * that would be edited for different reasons - and check and
   * mate are the two words in this grammar that describe the
   * position AFTER a move rather than the move, so they are
   * exactly the kind of thing whose handling should not fork.
   *
   * One rule, given a way to name whatever it is filtering.
   * Neither caller's behaviour changes: chk and mate stay the
   * callers' to decide, because partialAnswer also honours a
   * check that was said in the EARLIER half of the utterance
   * (partialAsk.chk), and this one does not have one.
   */
  function narrowByCheck(list, sanOf, chk, mate) {
    if (chk) {
      var c = list.filter(function (x) { return /[+#]$/.test(sanOf(x)); });
      if (c.length) list = c;
    }
    if (mate) {
      var m = list.filter(function (x) { return sanOf(x).slice(-1) === "#"; });
      if (m.length) list = m;
    }
    return list;
  }

  function narrowBySaid(cands, transcripts) {
    return narrowByCheck(cands, function (c) { return c.san; },
                         transcripts.some(saysCheck),
                         transcripts.some(saysMate));
  }

  function repeatLast() {
    speak(api.lastSan ? "Last move: " + sanToSpeech(api.lastSan)
                      : "No move to repeat yet.");
  }

  // THE v122 HOLD-AND-RECOVER MACHINERY STOOD HERE -
  // heldAlts, spokenRecent, isEchoOf, flushHeard - and was
  // deleted at v132 with the gate it served: the mic never
  // receives our own voice (AEC, see the platform finding),
  // so nothing needs holding, testing, or recovering.

  // The targeted question for a half-heard move (v117).
  // Speaks back what WAS heard, then asks for only the
  // missing part, and leaves the state open to receive it.
  // chk and mate remember whether the original utterance
  // said check or mate, so the answer inherits the
  // narrowing ("queen alpha checkmate" answered with "8"
  // still prefers the mating move).
  // WHAT WAS ACTUALLY HEARD, IN THE WORDS IT WAS HEARD IN.
  //
  // "I heard ..." is a claim about the user, not about the
  // board, and it has to be true or it is worse than saying
  // nothing: the owner is standing away from the screen with
  // this sentence as his only evidence of what landed. w42
  // wrote that rule down here after "I heard undefined
  // charlie" - and w43 then broke it in askPiece one commit
  // later, telling game w43-1 "I heard takes delta 5" when
  // what was said was "takes delta". The 5 was deduced from
  // the board. Right move, false sentence, and the owner
  // caught it immediately.
  //
  // So the rule gets one implementation instead of being
  // restated in each place that needs it. Anything DEDUCED
  // belongs in the options that follow, never in the lead -
  // askPiece names the whole move in each option, so the
  // square still reaches the ear, as something offered
  // rather than something claimed.
  function heardSoFar(req) {
    if (req.castle) {
      return "castle" + (req.castle === "k" ? " kingside"
                       : req.castle === "q" ? " queenside" : "");
    }
    // IN THE ORDER IT WAS SPOKEN. The first version rendered
    // piece, take word and dangling half and stopped there,
    // because the only callers were the half-square questions
    // and those cannot have a whole square in them. Used
    // anywhere else it silently dropped one: "queen delta
    // four" came back as "queen". A read-back that quietly
    // omits half the sentence is the w44 fault from the other
    // side - it does not claim something unsaid, it swallows
    // something said, and either one leaves the owner unable
    // to tell a mishearing from a bad move.
    //
    // takeAt is how many squares had arrived when the take
    // word did, so it puts the halves back on the right sides
    // of it without guessing.
    var bits = [], i;
    var n = req.takeAt < 0 ? req.squares.length : req.takeAt;
    if (req.piece) bits.push(PIECE_NAME[req.piece]);
    for (i = 0; i < n; i++) bits.push(spokenSquare(req.squares[i]));
    if (req.fromBeforeTake) {
      if (req.fromFile) bits.push(SPOKEN_FILE[req.fromFile] || req.fromFile);
      if (req.fromRank) bits.push("rank " + req.fromRank);
    }
    if (req.capture) bits.push("takes");
    if (req.victim) bits.push(PIECE_NAME[req.victim]);
    for (; i < req.squares.length; i++) bits.push(spokenSquare(req.squares[i]));
    if (!req.fromBeforeTake) {
      if (req.fromFile) bits.push(SPOKEN_FILE[req.fromFile] || req.fromFile);
      if (req.fromRank) bits.push("rank " + req.fromRank);
    }
    if (req.toFile) bits.push(SPOKEN_FILE[req.toFile] || req.toFile);
    if (req.toRank) bits.push("rank " + req.toRank);
    if (req.trailingPiece) bits.push(PIECE_NAME[req.trailingPiece]);
    // LAST, BECAUSE IT IS SAID LAST (w58). "Queen check" was
    // read back as "I heard queen" - the same w44 fault from
    // the swallowing side, and it appeared twice in one game
    // log while the owner was trying to find a move that the
    // program was in fact refusing for a different reason.
    if (req.saidMate) bits.push("checkmate");
    else if (req.saidCheck) bits.push("check");
    return bits.join(" ") || "that";
  }

  /* EVERY REFUSAL SAYS TWO THINGS: what was heard, and what
   * ruled it out. Neither is usable alone, and the missing
   * one is always the same missing one.
   *
   * "That's not a legal move. Say again." was the whole
   * sentence until now, and it answers the wrong question.
   * Standing at a board across the room, what the owner needs
   * to know first is whether the MACHINE misheard him or
   * whether HIS MOVE is wrong - and those want opposite next
   * actions: say it again more clearly, or look at the board.
   * The old sentence cannot be told apart in either case, so
   * it was worth nothing on the one occasion it was heard.
   * Saying the reading back settles it in three words.
   *
   * The same rule caught w44 (a lead claiming an unspoken
   * rank) and w45 (a refusal blaming the file when the victim
   * was what was missing). Third time it is a function.
   */
  function refuse(req, because) {
    speak("I heard " + heardSoFar(req) + ". " + because + " Say again.");
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
    // be parsed as one: in game3 a note containing the word
    // "castles" was answered "that's not a legal move", and
    // one naming a currently legal move would have been
    // PLAYED. Any reading may carry the memo word, see
    // memoTranscript in parsing.js. A pending yes/no
    // question survives a memo untouched.
    var memoText = memoTranscript(transcripts);
    if (memoText) {
      log("MEMO", memoText);
      speak("Memo recorded in log.");
      return;
    }
    // COMMANDS ARE READ FROM THE PRIMARY TRANSCRIPT ONLY, and
    // that is a decision, not an oversight (documented at w54).
    // answerPieceOf and memoTranscript scan every rival
    // reading; this does not, so a "yes" that appears only in
    // Safari's second guess is missed and the question is
    // asked again.
    //
    // That is the safe direction. w49 settled what a rival
    // reading may do - raise a question, never play a move -
    // and a command is further from a question than a move is:
    // "resign", "yes" and "draw" all END something, some of
    // them a game. A missed command costs one repetition; a
    // command invented from a reading the mic ranked second
    // could resign a game the user is winning.
    var cmd = classifyCommand(primary);

    if (confirmAction) {
      var spec = CONFIRMS[confirmAction];
      // THE ANSWER WAITS FOR THE POST (w50). These spoke
      // "resigning." and "draw accepted." the instant the
      // request left, and postAction has no catch of its own,
      // so a failed send was an unhandled rejection and the
      // user was told a game-ending action had happened when
      // it had not. acceptMove has said "Could not reach
      // Lichess." on the same shape of failure since the
      // v-series; there is no reason the yes/no path should
      // be the one that lies. The wording is unchanged when
      // it works.
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

    if (pending) {
      if (cmd === "yes") { acceptMove(pending.cands[pending.idx]); return; }
      if (cmd === "no") { pending.idx++; askCandidate(); return; }
      if (cmd === "cancel") { pending = null; speak("Cancelled. Say the move again."); return; }
      // A PIECE NAME PICKS ITS CANDIDATE (v116). The guard
      // used to walk its list one yes/no at a time, which
      // cost game20 three questions on "foxtrot three":
      // pawn? no. queen? no. knight? yes. The strict prompt
      // has taken a one-word piece answer since v92; the
      // same shape of question now takes the same answer.
      // Both halves came from the user - the square from
      // the utterance that raised the question, the piece
      // from this one - so a UNIQUE fit is accepted, like
      // the v92 path. Two candidates of the named piece
      // (two knights to one square) jump the walk to the
      // first of them and ask as before.
      var pa = answerPieceOf(transcripts);
      if (pa) {
        var fits = [], firstFit = -1;
        for (var pi = 0; pi < pending.cands.length; pi++) {
          if (pending.cands[pi].m.piece === pa) {
            fits.push(pending.cands[pi]);
            if (firstFit < 0) firstFit = pi;
          }
        }
        if (fits.length === 1) {
          log("DLG", "piece answer picked " + fits[0].san);
          acceptMove(fits[0]);
          return;
        }
        if (fits.length > 1) {
          pending.idx = firstFit;
          askCandidate();
          return;
        }
        // named a piece that is not among the options: say
        // so and re-ask, never "I didn't hear you" (v96)
        speak("No " + PIECE_NAME[pa] + " among the options.");
        askCandidate();
        return;
      }
      // SAYING THE MOVE AGAIN REPLACES THE QUESTION, and does
      // it by the same rules the move would get if no question
      // were open (w51). This branch played a unique re-said
      // move outright, ignoring confirmMyMove - so the one
      // setting whose entire job is "ask me even when you are
      // sure" was silently off for every move said over a
      // question, which is exactly when the user is already
      // being misheard. And a re-said AMBIGUOUS move was
      // thrown away in favour of "Say yes or no.", re-asking
      // about the OLD list while the new one went in the bin.
      // Both now go where the main path sends them.
      var re = collectCandidates(api.pos, transcripts);
      if (re.length === 1) {
        var reGuard = bareGuardCands(re[0]);
        if (reGuard) { pending = { cands: reGuard, idx: 0 };
          askCandidate(); return; }
        if (CFG.confirmMyMove) {
          pending = { cands: re, idx: 0 };
          askCandidate();
          return;
        }
        acceptMove(re[0]);
        return;
      }
      if (re.length > 1) {
        pending = { cands: re, idx: 0 };
        askCandidate();
        return;
      }
      speak("Say yes or no.");
      var c = pending.cands[pending.idx];
      speak("Did you mean " + sanToSpeech(c.san) + "?");
      return;
    }

    if (cmd === "repeat") { repeatLast(); return; }
    if (classifyFlipClock(primary)) { flipClockSides(); return; }
    if (cmd === "clock") { speakClocks(); return; }

    /* Questions about the position work on either side's clock */
    var q = classifyQuery(primary);
    if (q) { log("QRY", q.kind + " " + (q.sq || q.piece || "")); answerQuery(q); return; }

    if (cmd === "resign") { confirmAction = "resign";
      speak("Resign the game? Yes or no."); return; }
    if (cmd === "draw") { confirmAction = "offerdraw";
      speak("Offer a draw? Yes or no."); return; }
    // CANCEL CLOSES A REPAIR QUESTION TOO (v136, game
    // w25-1 at 18:42:58). The yes/no walk and the
    // confirmations have taken "cancel" since v92, but the
    // two REPAIR questions - askPartial's "say the rank"
    // and askPiece's "which piece" - kept their state in
    // partialAsk/pieceAsk and fell through to the silent
    // return below. The owner said "cancel" twice into an
    // open "say the rank" and heard NOTHING either time,
    // then waited a hundred seconds before playing
    // something else. Silence is the one answer an
    // eyes-free user cannot read: it is indistinguishable
    // from not being heard at all. Same words as the
    // pending path, because it is the same act.
    if (cmd === "cancel" && (partialAsk || pieceAsk)) {
      partialAsk = null; pieceAsk = null;
      log("CND", "repair question cancelled");
      speak("Cancelled. Say the move again.");
      return;
    }
    // YES, NO AND CANCEL WITH NOTHING OPEN ARE SILENT, ON
    // PURPOSE (documented at w54; the behaviour is older). It
    // looks like a constraint-5 violation and it is the
    // stray-talk exemption: the mic is open the whole game, and
    // CANCEL_WORDS includes "stop" and "forget", which land in
    // ordinary speech at the board more often than as commands.
    // Answering every one of them with "nothing to cancel"
    // would be flat, repeated speech that carries no
    // information - the exact thing the sound arc ended by
    // deleting (see the chimes tombstone).
    //
    // The trade is only safe because it is narrow: a cancel
    // that has something to cancel always speaks, four lines
    // up and in the pending path, and those are the cases the
    // user is actually waiting on an answer for.
    if (cmd === "yes" || cmd === "no" || cmd === "cancel") return;

    // Is there anything move-shaped in ANY reading. The mic
    // is open the whole game, so stray talk arrives here
    // constantly, and it should not be answered out loud.
    var moveLike = transcripts.some(function (tt) {
      return !reqIsEmpty(parseTranscript(tt));
    });

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

    var req = parseTranscript(primary);
    log("PRS", describeReq(req));
    var cands = collectCandidates(api.pos, transcripts);
    log("CND", cands.map(function (c) { return c.san; }).join(",") || "(none)");

    if (cands.length === 1 && !CFG.confirmMyMove) {
      var guarded = bareGuardCands(cands[0]);
      if (guarded) {
        pending = { cands: guarded, idx: 0 };
        askCandidate();
        return;
      }
      acceptMove(cands[0]);
      return;
    }
    if (cands.length === 1) {
      // confirmMyMove asks even the unambiguous - but the
      // bare-square guard must still widen the list first
      // (v133), or "no" to the pawn push dead-ends with the
      // piece move standing right there. One question
      // serves both settings: yes plays the pawn, no walks
      // the pieces, exactly as the guard alone would.
      pending = { cands: bareGuardCands(cands[0]) || cands, idx: 0 };
      askCandidate();
      return;
    }
    if (cands.length === 0) {
      // Before anything else: is this the answer to the
      // piece question (v92)? It arrives as a piece and
      // nothing else, which every other path reads as
      // silence. Both halves came from the user — the
      // square from the utterance that raised the
      // question, the piece from this one — so a single
      // fit is a complete move and goes through the
      // ordinary accept path, not a second yes/no. The
      // ply guard means a stale answer, after the position
      // has moved on, is simply not an answer.
      // Before checking: if a question is open and this
      // reading has NO piece in it, see whether it is a
      // "-ship" word - "Relationship", "Leadership" - which
      // is how Safari returned "Bishop" as an answer in
      // game20 (17:49). answerPieceOf applies the suffix
      // rule; only the piece slot is filled, so a wrong
      // guess lands in the ordinary "no bishop can go
      // there" re-ask, never in a move.
      if (!req.piece && !req.squares.length && !req.castle &&
          !req.victim && pieceAsk &&
          pieceAsk.ply === api.moves.length) {
        var sfx = answerPieceOf(transcripts);
        if (sfx) {
          log("PRS", "answer read as " + PIECE_NAME[sfx]);
          req.piece = sfx;
        }
      }
      var answered = pieceAskAnswer(req);
      if (answered) {
        var acs = candidatesOf(answered, req);
        log("CND", "piece answer: " +
            acs.map(function (c) { return c.san; }).join(","));
        pieceAsk = null;
        // no bare-square guard here: it fires only on pawn
        // moves, and this question is only ever asked about
        // a square no pawn can reach
        offer(acs);
        return;
      }
      // A piece was named, the question is still open, and
      // that piece cannot go there. Say so and ask again
      // with the same list: the question stays open, and
      // the user is never told they were not heard when
      // they were (v96).
      if (pieceAskOpen(req)) {
        var named = pieceAskNamed(req);
        log("CND", "piece answer: no " + named + " fits, re-asking");
        askPiece(pieceAsk.moves,
                 "no " + named +
                 (pieceAsk.capture ? " can take there." : " can go there."),
                 pieceAsk.sq);
        return;
      }
      // Is this the answer to an open PARTIAL question
      // (v117)? "say the rank" answered "eight", "say the
      // target" answered "alpha one" or "rook". Both
      // halves came from the user, so a unique fit is
      // accepted the v92 way; several fits walk the
      // ordinary yes/no; an answer that fits nothing is
      // told so and the question is asked again (v96).
      var pAns = partialAnswer(req, transcripts);
      if (pAns) {
        if (pAns.length) {
          var pcs = candidatesOf(pAns, req);
          log("CND", "partial answer: " + pcs.map(function (c2) {
            return c2.san;
          }).join(","));
          partialAsk = null;
          offer(pcs);
          return;
        }
        log("CND", "partial answer: nothing fits, re-asking");
        var pk = partialAsk;
        speak("That does not fit.");
        askPartial(pk.req, pk.want, pk.chk, pk.mate);
        return;
      }
      // THE REPAIR CHAIN, IN ORDER, AS DATA (see REPAIRS above).
      // Each one is asked in turn and answers "I handled this"
      // or "not mine". They were 294 lines inline here, and
      // their order - which is load-bearing, and which I had to
      // reason about carefully when the origin repair was added
      // - was their position in this function and nothing else.
      // EVERY READING GETS A LOOK, primary first. A later one
      // is only reached when every repair has declined every
      // earlier one, so nothing that works today changes; and
      // it may only ask, never play (see repairMayPlay).
      for (var ti = 0; ti < transcripts.length; ti++) {
        var rq = ti === 0 ? req : parseTranscript(transcripts[ti]);
        if (ti > 0) {
          // nothing in it at all is not a reading worth trying
          if (reqIsEmpty(rq) && !rq.piece &&
              !rq.fromFile && !rq.fromRank) continue;
          log("PRS", "rival reading " + ti + ": " + describeReq(rq));
        }
        repairMayPlay = (ti === 0);
        for (var ri = 0; ri < REPAIRS.length; ri++) {
          if (REPAIRS[ri](rq, transcripts)) { repairMayPlay = true; return; }
        }
        repairMayPlay = true;
      }

      if (reqIsEmpty(req)) {
        // an open partial question deserves its re-ask, not
        // "Say again." - the v96 principle again
        if (partialAsk && partialAsk.ply === api.moves.length) {
          var pk2 = partialAsk;
          askPartial(pk2.req, pk2.want, pk2.chk, pk2.mate);
          return;
        }
        // NOTHING BUT FILLER IS NOT A FAILED MOVE (v122).
        // Game22 heard a lone "A" (19:48) and answered "I
        // didn't catch a move" - and that sentence then ate
        // the real move spoken over it. On the opponent's
        // clock the stray-talk rule already keeps quiet;
        // this extends the same judgement to our own turn
        // for an utterance with no content word at all,
        // which is a mic artifact rather than a move that
        // failed to land. A garbled WORD still gets the
        // sentence: there something was said, and silence
        // would leave the user waiting.
        var anyContent = transcripts.some(function (tt) {
          return wordsOf(tt).some(function (w) { return !FILLER[w]; });
        });
        if (!anyContent) {
          log("HRD", "ignored, nothing but filler: " + primary);
          return;
        }
        // THIS ONE STAYS BARE, and it is the exception that
        // shows the rule. Everywhere else a refusal says the
        // reading back, so the owner can tell a mishearing
        // from a bad move. Here there IS no reading - words
        // arrived and no move came out of them - and we
        // cannot tell whether they were misheard or simply
        // were not a move. "No move in that" would claim the
        // second. "Say again." claims neither, which is the
        // only true thing available.
        // WAS THERE A READING TO GIVE BACK? reqIsEmpty asks
        // only about castle, squares and victim, so "rook
        // delta" - a piece and a file, said plainly - counted
        // as nothing heard and got this bare sentence twice in
        // game w46-1 (19:12:51), as did "text delta" at
        // 19:22:19. w46's rule is that a refusal says the
        // reading back unless there is no reading, and there
        // plainly was one.
        //
        // reqIsEmpty is left alone: collectCandidates uses it
        // to decide what counts as a move at all, and widening
        // it there would change which utterances are
        // candidates. This is a different question - "is there
        // anything to repeat" - and it gets its own answer.
        if (req.piece || req.fromFile || req.fromRank) {
          refuse(req, "That is not a legal move.");
          return;
        }
        speak("Say again.");
        return;
      }
      // Relax the pawn-only reading of a bare square and see
      // what fits. If EXACTLY one move does, the piece name
      // was almost certainly lost by the mic, so offer that
      // move as a yes/no question instead of demanding the
      // whole move again: "takes echo one" with only Rxe1 on
      // the board becomes "did you mean rook takes echo one?"
      // Still never sent to Lichess without a yes. With
      // several fits, the old teaching prompt names the pieces,
      // since guessing an order among them helps less than one
      // clean re-say.
      //
      // A NAMED PAWN gets the same relaxation (v72): "pawn
      // takes delta five" heard as "Ponte delta five"
      // arrives as a pawn push, illegal, though exd5 was
      // meant and unique — game8 answered it with a bare
      // "not a legal move". A named pawn can only relax
      // into pawn captures, so named-piece requests are
      // otherwise untouched.
      var all = [];
      if ((!req.piece || req.piece === "p") &&
          req.squares.length === 1) {
        all = findMoves(api.pos, req, true);
      }
      if (all.length === 1) {
        var only = all[0];
        log("CND", "repair: only " + api.pos.sanOf(only) +
            " fits, asking");
        pending = { cands: [{ m: only, san: api.pos.sanOf(only) }],
                    idx: 0 };
        askCandidate();
        return;
      }
      // If a piece could have reached that square, say which,
      // rather than a bare "illegal" that teaches nothing.
      var alt = [];
      if (all.length) {
        // EVERY WAY TO TAKE THERE, not just the pawn's
        // (v95). Through v94 this listed pawn captures
        // alone, so game13 said "Queen takes delta six",
        // lost the queen off the reading, and was told to
        // say "echo takes delta 6" — naming the one move
        // the user had not asked for, while the queen
        // capture sat legal and unmentioned. Obeying the
        // prompt would have played the wrong piece. A
        // prompt that recommends must recommend all of it.
        // CONFIRMED in practice on a bare "delta five" with
        // both Nxd5 and exd5 legal: both were offered. Note
        // they come out in move-generation order, which is
        // not order of likelihood — deliberately, since a
        // bare square is pawn-shaped but game13 meant the
        // queen, and there is no honest way to rank them.
        // The lead says what actually went wrong, since
        // being told about a move you did not ask for,
        // without being told why, is alarming mid-game.
        // A NAMED PAWN cannot reach here with piece moves
        // in hand: findMoves relaxes a named pawn into
        // pawn captures only (v72), so that case still
        // lists exactly the files, and keeps its wording.
        var caps = all.filter(function (m) { return m.captured; });
        if (!req.capture && caps.length) {
          log("CND", "push-only: capture available " +
              sansOf(caps).join(","));
          // THE ANSWER MAY BE ONE WORD (v103). Through v102
          // this spoke and returned, leaving nothing behind,
          // so game14 answered "Bishop" — twice — and was
          // told nothing was heard, while the other prompt
          // three lines below had accepted exactly that
          // since v92. Two questions of the same shape must
          // take the same answers. Passing the square makes
          // askPiece phrase the options as captures and
          // accept a FILE as well as a piece name, since
          // that is how it offers the pawn.
          askPiece(caps, req.piece ? "that would be a capture."
                                   : "no piece heard.",
                   req.squares[0]);
          return;
        }
        alt = all.filter(function (m) { return m.piece !== "p"; });
      }
      if (alt.length) {
        log("CND", "strict: pawn cannot, but " +
            sansOf(alt).join(",") +
            " could");
        // askPiece leaves the question open: see pieceAsk
        // in the state block at the top of this file for why
        // "go there" is a PUSH. Game w46-1, 19:26:49: "takes
        // golf five" was refused with "No pawn can go there",
        // and he had said takes. The verb has to match the
        // sentence it is answering.
        askPiece(alt, req.capture ? "No pawn can take there."
                                  : "No pawn can go there.");
        return;
      }
      refuse(req, "That is not a legal move.");
      return;
    }
    pending = { cands: cands, idx: 0 };
    askCandidate();
  }

