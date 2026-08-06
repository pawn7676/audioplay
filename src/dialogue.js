  /*=========================== DIALOGUE ===========================*/

  // practice mode: nothing is ever sent to Lichess
  var dryRun = false;

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
  var busy = false;

  /* ---- Practice Mode ---- 
   * Runs the whole pipeline locally: mic, NATO parsing, ambiguity
   * dialogue, speech, log. No token is used and nothing is
   * sent to Lichess. The "opponent" picks moves at random from
   * the list of legal moves. */

  function dryStart() {
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
    api.gameId = "PRACTICE";
    api.myColor = "w";
    api.pos = new RULES.Position();
    api.moves = [];
    api.over = false;
    api.lastSan = ""; api.lastSanW = ""; api.lastSanB = "";
    api.wtime = 600000;
    api.btime = 600000;
    api.mode = "practice";
    log("DRY", "practice mode ON - nothing will be sent to Lichess");
    speakWhenAudioSettled("Practice mode. You are white.");
  }

  function dryOpponentReply() {
    if (!dryRun || api.over) return;
    var legal = api.pos.legalMoves();
    if (!legal.length) {
      api.over = true;
      speak("Practice game over.");
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
      speak("Practice game over.");
    }
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
    if (busy) { log("DLG", "ignored, busy"); return; }
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
      setTimeout(dryOpponentReply, 1600);
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
      if (!m) return s + " seconds";
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
    return kept.map(function (m) {
      return { m: m, san: api.pos.sanOf(m) };
    });
  }

  function offer(cands, label) {
    var play = cands.length === 1 && !CFG.confirmMyMove;
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
  function narrowBySaid(cands, transcripts) {
    if (transcripts.some(saysCheck)) {
      var c = cands.filter(function (x) { return /[+#]$/.test(x.san); });
      if (c.length) cands = c;
    }
    if (transcripts.some(saysMate)) {
      var m = cands.filter(function (x) { return x.san.slice(-1) === "#"; });
      if (m.length) cands = m;
    }
    return cands;
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

  /* The question remembers the CONSTRAINT it was asked about,
   * with the hole still in it, not the raw request. What comes
   * back then merges instead of being reconstructed field by
   * field - see partialAnswer, which used to do exactly that
   * and could not be pointed at an origin-shaped question
   * because it read the stored fromFile as the target's.
   *
   * The half a question is about is always the TARGET's here:
   * every caller is the half-square repair or the capture
   * repair, and both read a dangling half as the destination's,
   * on the v116 evidence that it is the destination rank that
   * vanishes. That reading is now stated once, where the
   * question is stored, rather than implied by each filter. */
  function askPartial(req, want, chk, mate) {
    var c = constraintOf(req);
    c.from = { file: null, rank: null };
    c.to = { file: req.fromFile || null, rank: req.fromRank || null };
    partialAsk = { req: req, c: c, want: want, chk: !!chk, mate: !!mate,
                   ply: api.moves.length };
    speak("I heard " + heardSoFar(req) + ". Say the " +
          (want === "target" ? "target"
           : want === "rank" ? "rank" : "file") + ".");
  }

  // The moves completed by an answer to the open partial
  // question, or null if this is not an answer (v117).
  // An answer may be: a full square ("alpha one"), the
  // missing rank or file alone, a victim piece name for a
  // capture ("rook" -> queen takes rook), or a lone file
  // naming a capture's destination file. Anything with no
  // usable content is not an answer and returns null, so
  // stray noise leaves the question standing rather than
  // resolving it. Returns a possibly EMPTY list when the
  // user did answer but nothing fits, so the caller can
  // tell the truth (v96) instead of "I didn't hear you".
  function partialAnswer(req2, transcripts) {
    if (!partialAsk || partialAsk.ply !== api.moves.length) return null;
    var st = partialAsk.c, want = partialAsk.want;
    var ans = constraintOf(req2);
    var c = { castle: null, piece: st.piece, victim: st.victim,
              mustCapture: st.mustCapture || ans.mustCapture,
              promotion: null, promoKw: false,
              from: { file: st.from.file, rank: st.from.rank },
              to:   { file: st.to.file,   rank: st.to.rank } };

    // WHAT THE ANSWER SUPPLIES, in one place instead of six
    // mutually exclusive branches. A whole square is the
    // target; a lone half fills the hole the question left; a
    // bare piece name is the VICTIM when the target is what was
    // asked for (the v111 shorthand, "say the target" answered
    // "rook") and the MOVER otherwise (w43). Anything with no
    // usable content is not an answer at all and leaves the
    // question standing, so stray noise cannot resolve it.
    if (ans.to.file && ans.to.rank) {
      c.to = { file: ans.to.file, rank: ans.to.rank };
    } else if (ans.from.file && ans.from.rank) {
      c.to = { file: ans.from.file, rank: ans.from.rank };
    } else if (st.to.file && ans.from.rank) {
      c.to.rank = ans.from.rank;                 // "say the rank"
    } else if (st.to.rank && ans.from.file) {
      c.to.file = ans.from.file;                 // "say the file"
    } else if (ans.victim) {
      c.victim = ans.victim;
    } else if (want === "target" && ans.piece) {
      c.victim = ans.piece;
    } else if (want === "target" && ans.from.file) {
      c.to.file = ans.from.file;
    } else if (ans.piece) {
      c.piece = ans.piece;
    } else {
      return null;
    }

    var fits = api.pos.legalMoves().filter(function (m) {
      return fitsConstraint(m, c);
    });
    var chk = partialAsk.chk || transcripts.some(saysCheck);
    var mate = partialAsk.mate || transcripts.some(saysMate);
    if (chk) {
      var c2 = fits.filter(function (m) {
        return /[+#]$/.test(api.pos.sanOf(m));
      });
      if (c2.length) fits = c2;
    }
    if (mate) {
      var m2 = fits.filter(function (m) {
        return api.pos.sanOf(m).slice(-1) === "#";
      });
      if (m2.length) fits = m2;
    }
    return fits;
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
    var cmd = classifyCommand(primary);

    if (confirmAction) {
      var spec = CONFIRMS[confirmAction];
      if (cmd === "yes") {
        confirmAction = null;
        postAction(spec.yes); speak(spec.yesSay); return;
      }
      if (cmd === "no" || cmd === "cancel") {
        confirmAction = null;
        if (spec.no) postAction(spec.no);
        speak(spec.noSay); return;
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
      var re = collectCandidates(api.pos, transcripts);
      if (re.length === 1) {
        var reGuard = bareGuardCands(re[0]);
        if (reGuard) { pending = { cands: reGuard, idx: 0 };
          askCandidate(); return; }
        acceptMove(re[0]);
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
      // THE ORIGIN NAMED, THE VICTIM NOT (w40). "echo five
      // takes" and "echo takes" mean the pawn on e5, or the
      // one on the e-file, takes whatever it can - and until
      // now both died, one as "not a legal move" and one as
      // "Say again.", because a lone square is read as the
      // destination and nothing captures onto e5. See
      // originCapture in parsing.js for why word order settles
      // which square was meant.
      //
      // WHY A UNIQUE FIT PLAYS UNASKED. The filter below spans
      // EVERY legal capture from that origin - pawn, piece, en
      // passant alike - so uniqueness is counted over
      // everything the sentence could possibly have meant.
      // That is the same safety v111 and v121 leaned on, and
      // here it is stronger: a named origin SQUARE pins the
      // mover to the one piece standing on it, which is more
      // than "queen takes" ever knew. A named origin FILE
      // plays on the same count - in game w39-1 nothing else
      // on the e-file could capture at all, so "echo takes"
      // had exactly one meaning. Several fits ask, as always.
      //
      // IT SITS ABOVE THE HALF-SQUARE REPAIR ON PURPOSE.
      // "pawn echo takes" used to reach that repair, which
      // reads a dangling file as the DESTINATION's - a rule
      // learned from "queen alpha check me", a move with no
      // capture in it. With a take word the file is the
      // origin: findMoves has always read req.fromFile that
      // way, and the grammar's own capture form puts the
      // from-file first. Only a file that arrived BEFORE the
      // take word is diverted here; every other half-square
      // case is untouched.
      var origin = originCapture(req);
      if (origin) {
        var ocaps = api.pos.legalMoves().filter(function (m) {
          if (!m.captured) return false;
          var s = RULES.sqName(m.from);
          if (origin.length === 2 ? s !== origin
              : /[a-h]/.test(origin) ? s[0] !== origin
                                     : s[1] !== origin) return false;
          var t = RULES.sqName(m.to);
          if (req.toFile && t[0] !== req.toFile) return false;
          if (req.toRank && t[1] !== req.toRank) return false;
          if (req.piece && m.piece !== req.piece) return false;
          if (req.victim && m.captured !== req.victim) return false;
          return true;
        });
        if (!ocaps.length) {
          // Silence is not an answer, and neither is "not a
          // legal move" when we know exactly what is wrong -
          // the v117 shape of "the queen has nothing to take".
          // Name the target half too when one was heard, or
          // "no capture from the charlie file" is a lie the
          // moment cxb5 is sitting there legal and it was the
          // DELTA file that had nothing on it.
          // WHAT WAS MISSING, NOT WHAT WAS LOOKED THROUGH.
          // Three halves can each empty this list, and the
          // refusal has to name the one that did: the origin
          // ("no capture from the golf file"), the target
          // ("...onto the hotel file"), or the VICTIM. w45
          // fixed the victim case by appending "of a knight",
          // which was true but read badly once the lead
          // started repeating it - "I heard golf takes
          // knight. No capture from the golf file of a
          // knight." The victim belongs at the front of the
          // clause, where it is the subject of the sentence
          // rather than a qualifier trailing off the end.
          var what = req.victim
                ? "No " + PIECE_NAME[req.victim] + " to take"
                : "No capture";
          var whence = origin.length === 2
                ? " from " + spokenSquare(origin)
                : /[a-h]/.test(origin)
                    ? " from the " + SPOKEN_FILE[origin] + " file"
                    : " from rank " + origin;
          var whither = req.toFile
                ? " onto the " + SPOKEN_FILE[req.toFile] + " file"
                : req.toRank ? " onto rank " + req.toRank : "";
          refuse(req, what + whence + whither + ".");
          return;
        }
        var ocands = candidatesOf(ocaps, req);
        offer(narrowBySaid(ocands, transcripts), "origin capture");
        return;
      }
      // A PIECE WITH HALF A SQUARE (v116). Game20's mating
      // move took five tries: "queen alpha check me" lost
      // its rank every time, arrived as piece-plus-file
      // with no square, and died at "I didn't catch a
      // move". When a piece is named alongside a lone file
      // or rank, the missing half was almost certainly
      // eaten by the mic, so relax it into that piece's
      // legal moves TO that file or rank. The dangling
      // file is read as the destination's, not the
      // origin's, because in every observed loss it was
      // the destination rank that vanished.
      //
      // A spoken check word narrows the fits, "mate"
      // narrows further to mating moves - here "queen
      // alpha, check me" leaves exactly Qa8#. A UNIQUE
      // fit is offered as a yes/no, never played unasked.
      // SEVERAL fits ask for the missing half instead of
      // demanding the whole move again (v117): the file
      // arrived intact, so "I heard queen alpha. say the
      // rank." wastes nothing, and "eight" completes it.
      //
      // THE PIECE NAME IS NOT REQUIRED WHEN "TAKES" WAS HEARD
      // (w42). Game w41-1 said "takes charlie" TWICE, got
      // "Say again." both times, added the word "rook" and
      // played Rxc6 on the third - the sentence was complete
      // and the only thing missing was the word the mic eats
      // most often. Requiring a piece here made the repair
      // useless in exactly the case it was built for.
      //
      // Safe on the count this file has used since v111, and
      // on the one game6 taught: uniqueness is taken over
      // EVERY capture landing there, pawn and piece alike, so
      // a mover lost off the front cannot move the wrong
      // piece - it can only turn one candidate into several,
      // which asks. That is the same bar "echo takes" meets
      // in the origin repair above.
      //
      // A capture word is required for the piece-less form.
      // Without one this would relax a bare dangling file
      // into every piece's moves to that file, which is the
      // bare-square rule read backwards: a square with no
      // piece named is a pawn PUSH and must never become a
      // piece move. "takes" is what says otherwise.
      if (!req.squares.length && !req.victim &&
          (req.fromFile || req.fromRank) &&
          (req.piece || req.capture)) {
        var half = api.pos.legalMoves().filter(function (m) {
          if (req.piece && m.piece !== req.piece) return false;
          if (req.capture && !m.captured) return false;
          var t = RULES.sqName(m.to);
          if (req.fromFile && t[0] !== req.fromFile) return false;
          if (req.fromRank && t[1] !== req.fromRank) return false;
          return true;
        });
        if (half.length) {
          var narrowed = narrowBySaid(candidatesOf(half, req), transcripts);
          if (narrowed.length === 1) {
            // A UNIQUE FIT PLAYS AT ONCE (v119, was
            // mate-only in v118). Only one move fits
            // everything heard, which is exactly the v111
            // bar: "queen takes queen" has played
            // unconfirmed since then on the same evidence -
            // destination inferred by uniqueness.
            // Confirming here while v111 played was the
            // file disagreeing with itself. The residual
            // risk is the one v111 already accepted and
            // documented: thinking out loud with a move in
            // it. Watch the logs.
            //
            // w42 note: this used to add "and the piece was
            // NAMED", which was true then and is not now -
            // the piece-less capture form reaches here too.
            // What carries it is the count, not the naming:
            // the fits are drawn from every legal move that
            // lands there, so a lost mover widens the list
            // and asks rather than picking wrong. A
            // bare-square request with no take word still
            // confirms, because nothing there rules out a
            // push.
            offer(narrowed, "half-square repair");
            return;
          }
          // ASK FOR THE HALF THAT ACTUALLY NARROWS (w43).
          // Game w42-1, 16:51:44: "takes delta" with Nxd5 and
          // cxd5 on the board was answered "I heard takes
          // delta. Say the rank." - and the rank was never
          // the missing half. BOTH fits land on d5. The
          // question could not discriminate, so "three" and
          // "four" fit nothing, "five" only got back to where
          // it started, and the owner said "knight" in the
          // middle of it and was ignored. Three wasted
          // answers to a question with one possible answer.
          //
          // What was missing was the MOVER, and there is
          // already a question for that: askPiece offers the
          // pieces by name and the pawns by their file
          // ("knight, or charlie"), and takes either as the
          // answer. So count first, and ask about whichever
          // half still has more than one value.
          var dests = {}, movers = {};
          narrowed.forEach(function (c2) {
            dests[RULES.sqName(c2.m.to)] = 1;
            movers[c2.m.piece === "p" ? RULES.sqName(c2.m.from)[0]
                                      : c2.m.piece] = 1;
          });
          var nDest = Object.keys(dests).length;
          if (nDest === 1) {
            var onlySq = Object.keys(dests)[0];
            if (Object.keys(movers).length > 1) {
              log("CND", "half-square: " + narrowed.map(function (c2) {
                return c2.san;
              }).join(",") + " all land on " + onlySq +
                  ", asking which piece");
              askPiece(narrowed.map(function (c2) { return c2.m; }),
                       "I heard " + heardSoFar(req) + ".",
                       onlySq);
              return;
            }
            // one square AND one mover, so the fits differ by
            // something neither question can name - promotion
            // choices are the case. Walk them as yes/no.
            log("CND", "half-square: " + narrowed.map(function (c2) {
              return c2.san;
            }).join(",") + " differ only in promotion, asking");
            pending = { cands: narrowed, idx: 0 };
            askCandidate();
            return;
          }
          log("CND", "half-square: " + narrowed.map(function (c2) {
            return c2.san;
          }).join(",") + " fit, asking for the missing half");
          askPartial(req, req.fromFile ? "rank" : "file",
                     transcripts.some(saysCheck),
                     transcripts.some(saysMate));
          return;
        }
      }
      // "QUEEN TAKES", TARGET EATEN (v117). A piece and a
      // capture word with no square, victim, file or rank
      // used to die at "Say again." though half
      // the move arrived. Every capture that piece can
      // make is the candidate list: one is offered as a
      // yes/no, several ask for the target, and none gets
      // the truth - the piece has nothing to take, so the
      // piece name itself was probably the misheard word.
      if (req.piece && req.capture && !req.squares.length &&
          !req.victim && !req.fromFile && !req.fromRank) {
        var pcaps = api.pos.legalMoves().filter(function (m) {
          return m.piece === req.piece && m.captured;
        });
        if (!pcaps.length) {
          refuse(req, "It has nothing to take.");
          return;
        }
        var ncaps = narrowBySaid(candidatesOf(pcaps, req), transcripts);
        if (ncaps.length === 1) {
          // named mover, unique capture: the v111 bar is
          // met, so it plays - see the half-square repair
          // above. "queen takes" with one queen capture on
          // the board can only be that capture.
          offer(ncaps, "capture repair");
          return;
        }
        log("CND", "capture repair: " + ncaps.map(function (c2) {
          return c2.san;
        }).join(",") + " fit, asking for the target");
        askPartial(req, "target",
                   transcripts.some(saysCheck),
                   transcripts.some(saysMate));
        return;
      }
      // MATE NAMED, EVERYTHING ELSE EATEN (v117). "queen
      // checkmate" with no square at all still says two
      // true things: the piece, and that the move mates.
      // The mating moves by that piece ARE the candidate
      // list, and it is usually a list of one. Walked as
      // yes/no questions, every one - a mating move ends
      // the game, so it is never accepted on a guess. A
      // named piece is required: bare "checkmate" is table
      // talk, not a move.
      if (req.piece && !req.squares.length && !req.victim &&
          !req.fromFile && !req.fromRank && !req.capture &&
          transcripts.some(saysMate)) {
        var pmates = api.pos.legalMoves().filter(function (m) {
          return m.piece === req.piece &&
                 api.pos.sanOf(m).slice(-1) === "#";
        });
        if (pmates.length) {
          var nmates = candidatesOf(pmates, req);
          // one mate plays at once - every candidate here
          // mates by construction, so the only uncertainty
          // is WHICH mate, and with one there is none; see
          // the half-square repair for the full argument.
          // Several still ask, because choosing among
          // moves the user distinguished and we could not
          // is a guess, however harmless its outcome.
          offer(nmates, "mate repair");
          return;
        }
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
              caps.map(function (m) { return api.pos.sanOf(m); }).join(","));
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
            alt.map(function (m) { return api.pos.sanOf(m); }).join(",") +
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

