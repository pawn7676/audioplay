  /*=========================== REPAIRS ============================\
   *
   *  WHAT HAPPENS WHEN A SENTENCE ALMOST WORKED. If an
   *  utterance yields no candidates, this is the chain that
   *  tries to turn "Say again." into a question the user can
   *  answer - and that bar is the whole design. w40 set it for
   *  the origin repair and every widening since has had to
   *  clear it: a repair may only ever turn nothing into
   *  something answerable. It may not change what a sentence
   *  that already worked means.
   *
   *  SPLIT OUT OF dialogue.js AT w57, and it is the half that
   *  had grown its own doctrine:
   *
   *    ORDER IS DATA. REPAIRS is a list, tried in order, each
   *    stating its own constraint rather than filtering by
   *    hand. Reordering it changes the grammar, which is why
   *    it is a list you can read and not a chain of ifs.
   *
   *    A REPAIR MAY BE FIRED BY A RIVAL READING, BUT THEN IT
   *    MAY ONLY ASK (w49). Safari returns up to eight rival
   *    transcriptions. A question raised from one of them is
   *    safe because nothing plays until the user answers;
   *    playing from one is not. repairMayPlay carries that.
   *
   *    ASK ABOUT WHICHEVER HALF STILL NARROWS (w43, w48).
   *    Asking for a rank that has one possible answer wastes
   *    the question. This was proved inside one repair and
   *    left there, and the repair next door went on asking
   *    unconditionally for five days - so askWhichever is
   *    shared, and that is the rule this file exists to keep
   *    in one place.
   *
   *  WHAT STAYED IN dialogue.js: refuse and heardSoFar, which
   *  the repairs use heavily but handleTranscripts uses too -
   *  they are how the program says what it heard, not part of
   *  repairing it.
   *================================================================*/

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
    // the check said in THIS half, or in the half that raised
    // the question - see narrowByCheck, which both callers
    // share since w57
    var chk = partialAsk.chk || transcripts.some(saysCheck);
    var mate = partialAsk.mate || transcripts.some(saysMate);
    if (chk || mate) {
      var legalNow = api.pos.legalMoves();
      fits = narrowByCheck(fits, function (m) {
        return api.pos.sanOf(m, legalNow);
      }, chk, mate);
    }
    return fits;
  }

  /* ASK ABOUT THE HALF THAT ACTUALLY NARROWS.
   *
   *  w43 taught this to the half-square repair, after "takes
   *  delta" was answered "say the rank" with Nxd5 and cxd5 on
   *  the board - both landing on d5, so the rank had exactly
   *  one possible answer and could not tell the moves apart.
   *  It was written INSIDE that repair, and the capture repair
   *  next door went on asking for the target unconditionally.
   *
   *  Game w47-1, 20:09:24: "pawn takes" with bxc6 and dxc6
   *  available was answered "Say the target". Both take on c6.
   *  The owner said so in a memo mid-game - "both of my pawns
   *  are attacking one single knight on C6 so asking for the
   *  target didn't make any sense" - and he is exactly right.
   *  Same rule, same evidence, and only one repair had it.
   *
   *  It lives here now and both call it: count first, then ask
   *  about whichever half still has more than one value.
   */
  function askWhichever(cands, req, transcripts, want) {
    var dests = {}, movers = {};
    cands.forEach(function (c2) {
      dests[RULES.sqName(c2.m.to)] = 1;
      movers[c2.m.piece === "p" ? RULES.sqName(c2.m.from)[0]
                                : c2.m.piece] = 1;
    });
    var sans = cands.map(function (c2) { return c2.san; }).join(",");
    if (Object.keys(dests).length === 1) {
      var onlySq = Object.keys(dests)[0];
      if (Object.keys(movers).length > 1) {
        log("CND", sans + " all land on " + onlySq + ", asking which piece");
        askPiece(cands.map(function (c2) { return c2.m; }),
                 "I heard " + heardSoFar(req) + ".", onlySq);
        return;
      }
      // one square AND one mover: they differ by something
      // neither question can name, so walk them as yes/no.
      log("CND", sans + " differ by neither half, asking");
      pending = { cands: cands, idx: 0 };
      askCandidate();
      return;
    }
    log("CND", sans + " fit, asking for the " + want);
    askPartial(req, want, transcripts.some(saysCheck),
               transcripts.some(saysMate));
  }

  function tryOriginCapture(req, transcripts) {
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
      // WHAT THIS REPAIR MEANS, stated rather than filtered:
      // a capture, from the origin that was named, honouring
      // any mover, victim or target half that came with it.
      var oc = anyMove();
      oc.mustCapture = true;
      oc.piece = req.piece;
      oc.victim = req.victim;
      oc.to.file = req.toFile;
      oc.to.rank = req.toRank;
      if (origin.length === 2) {
        oc.from.file = origin[0]; oc.from.rank = origin[1];
      } else if (/[a-h]/.test(origin)) { oc.from.file = origin; }
      else { oc.from.rank = origin; }
      var ocaps = movesFor(api.pos, oc);
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
        return true;
      }
      var ocands = candidatesOf(ocaps, req);
      offer(narrowBySaid(ocands, transcripts), "origin capture");
      return true;
    }
    return false;
  }

  function tryHalfSquare(req, transcripts) {
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
      // The dangling half read as the TARGET's - the v116
      // reading, now said in one place instead of implied by
      // a filter here and by askPartial's stored constraint
      // over there.
      var hc = anyMove();
      hc.piece = req.piece;
      hc.mustCapture = !!req.capture;
      hc.to.file = req.fromFile;
      hc.to.rank = req.fromRank;
      var half = movesFor(api.pos, hc);
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
          return true;
        }
        askWhichever(narrowed, req, transcripts,
                     req.fromFile ? "rank" : "file");
        return true;
      }
    }
    return false;
  }

  function tryCaptureRepair(req, transcripts) {
    // "QUEEN TAKES", TARGET EATEN (v117). A piece and a
    // capture word with no square, victim, file or rank
    // used to die at "Say again." though half
    // the move arrived. Every capture that piece can
    // make is the candidate list: one is offered as a
    // yes/no, several ask for the target, and none gets
    // the truth - the piece has nothing to take, so the
    // piece name itself was probably the misheard word.
    // A NAMED VICTIM BELONGS HERE TOO (w49). The gate used to
    // exclude it, so "queen takes pawn" with no queen-takes-
    // pawn on the board fell past every repair and got the
    // generic "That is not a legal move" - game w47-1 heard
    // that three times (20:14:26, 20:14:36, 20:15:03). The
    // VICTIM was what ruled the move out, and w45 settled that
    // a refusal has to name the half that did. The same
    // widening answers "takes knight" with no knight to take,
    // mover named or not.
    if (req.capture && !req.squares.length &&
        !req.fromFile && !req.fromRank && (req.piece || req.victim)) {
      // every capture matching what was named, and nothing
      // else was heard to narrow it
      var cc = anyMove();
      cc.piece = req.piece;
      cc.victim = req.victim;
      cc.mustCapture = true;
      var pcaps = movesFor(api.pos, cc);
      if (!pcaps.length) {
        refuse(req, req.victim
                 ? "No " + PIECE_NAME[req.victim] + " for it to take."
                 : "It has nothing to take.");
        return true;
      }
      var ncaps = narrowBySaid(candidatesOf(pcaps, req), transcripts);
      if (ncaps.length === 1) {
        // named mover, unique capture: the v111 bar is
        // met, so it plays - see the half-square repair
        // above. "queen takes" with one queen capture on
        // the board can only be that capture.
        offer(ncaps, "capture repair");
        return true;
      }
      askWhichever(ncaps, req, transcripts, "target");
      return true;
    }
    return false;
  }

  function tryMateRepair(req, transcripts) {
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
      // MATE IS NOT A CONSTRAINT ON THE MOVE, it is a fact
      // about the position after it, so only the piece half
      // goes through movesFor and the mate test stays here.
      var mc = anyMove();
      mc.piece = req.piece;
      var legalMate = api.pos.legalMoves();
      var pmates = movesFor(api.pos, mc, false, legalMate)
        .filter(function (m) {
          return api.pos.sanOf(m, legalMate).slice(-1) === "#";
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
        return true;
      }
    }
    return false;
  }

  /* THE ORDER OF THE REPAIRS, WRITTEN DOWN.
   *
   *  Origin-capture goes first for a reason that used to live
   *  only in a comment inside it: "pawn echo takes" reaches
   *  the half-square repair too, and that one reads a dangling
   *  file as the DESTINATION's. With a take word the file is
   *  the origin. Nothing enforced that ordering - it was the
   *  position of two if-blocks in a 700-line function, and
   *  moving either silently changed the grammar.
   *
   *  Mate goes last because it is the weakest evidence: a
   *  piece and the word "mate", with everything else eaten.
   */
  var REPAIRS = [tryOriginCapture, tryHalfSquare,
                 tryCaptureRepair, tryMateRepair];

