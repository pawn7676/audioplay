  /*===================== MATCHING AND RANKING =====================*/

  function findMoves(pos, req, ignoreStrict) {
    var legal = pos.legalMoves();
    var out;
    if (req.castle) {
      return legal.filter(function (m) {
        if (m.flags.indexOf("k") >= 0) return req.castle !== "q";
        if (m.flags.indexOf("q") >= 0) return req.castle !== "k";
        return false;
      });
    }
    // NAMING THE VICTIM INSTEAD OF THE SQUARE (v111):
    // "queen takes queen", when there is only one way to do
    // it, PLAYS AT ONCE. A yes/no on the unique case would
    // cost more breath than saying the square, which is the
    // whole point of the shorthand.
    //
    // Safe because it can only fire where nothing could be
    // played before: a request with no square never reached
    // past the line below, so no utterance that means
    // something today changes meaning. It only converts
    // "Say again" into a move.
    //
    // The filter is on m.captured, not on what stands on the
    // destination, so en passant is included for free — the
    // generator sets captured "p" on a move to an empty
    // square.
    //
    // Ambiguity needs no special handling: two takeable
    // queens, or two knights able to take the same rook,
    // simply return two moves and reach the ordinary
    // question. Uniqueness is counted over EVERY legal
    // capture of that piece, so a mover lost off the front
    // of the utterance cannot move the wrong piece — it can
    // only turn one candidate into several, which asks.
    //
    // THE COST, ACCEPTED KNOWINGLY: this is the first form
    // in the grammar that is also ordinary English. Thinking
    // out loud on your own turn — "if queen takes queen,
    // then..." — is now a move. The mover must be named to
    // fire, which excludes "that takes the queen" and most
    // conversational shapes, but not this one. Watch for it
    // in the logs; if it ever fires unasked, requiring a
    // check word or dropping the form entirely are both
    // cheaper than a wrong move.
    if (!req.squares.length && req.victim) {
      return legal.filter(function (m) {
        if (m.captured !== req.victim) return false;
        if (req.piece && m.piece !== req.piece) return false;
        if (req.fromFile && RULES.sqName(m.from)[0] !== req.fromFile) return false;
        if (req.fromRank && RULES.sqName(m.from)[1] !== req.fromRank) return false;
        return true;
      });
    }
    if (!req.squares.length) return [];
    var to = req.squares[req.squares.length - 1];
    var from = req.squares.length > 1 ? req.squares[0] : null;
    out = legal.filter(function (m) {
      if (RULES.sqName(m.to) !== to) return false;
      if (from && RULES.sqName(m.from) !== from) return false;
      if (!from && req.fromFile && RULES.sqName(m.from)[0] !== req.fromFile) return false;
      if (!from && req.fromRank && RULES.sqName(m.from)[1] !== req.fromRank) return false;
      if (req.piece && m.piece !== req.piece) return false;
      if (req.capture && !m.captured) return false;
      return true;
    });
    // A PAWN MOVE WITHOUT "TAKES" IS A PUSH. "charlie five"
    // and "pawn charlie five" mean exactly the same thing: a
    // pawn stepping forward onto c5, never a diagonal
    // capture onto it. To capture, say so: "bravo takes
    // charlie five", naming the file when two pawns could.
    //
    // A bare square additionally rules out every piece, so
    // "charlie five" can never be Nc5 either.
    //
    // An explicit from-square ("bravo one charlie three") is
    // a separate, fully spelled out form and stays exempt.
    // ignoreStrict only works out what to suggest after a
    // rejection.
    if (!ignoreStrict && !from) {
      if (!req.piece) {
        out = out.filter(function (m) { return m.piece === "p"; });
      }
      if (!req.capture) {
        out = out.filter(function (m) {
          return m.piece !== "p" || !m.captured;
        });
      }
    }
    if (out.length && out.every(function (m) { return m.promotion; })) {
      var want = (req.trailingPiece && req.trailingPiece !== "p")
               ? req.trailingPiece : "q";
      var chosen = out.filter(function (m) { return m.promotion === want; });
      if (chosen.length) out = chosen;
    }
    return out;
  }

  /* ================= HOW CANDIDATES ARE RANKED =================
   *
   * Safari returns up to 8 rival transcriptions of one utterance.
   * Each is parsed, and each may yield legal moves, so several
   * moves can compete. They are put in order, and the first is
   * either played (if it is the only one) or offered as
   * "did you mean ...?". Nothing is ever sent to
   * Lichess without being either unambiguous or confirmed.
   *
   * Ordering happens in two stages.
   *
   * STAGE 1 - TIER. Two groups, and every tier 0 beats every
   * tier 1, whatever the scores inside them.
   *
   *   tier 0  a complete reading
   *   tier 1  a reading that is another one with its leading
   *           piece name missing, e.g. "foxtrot three" next to
   *           "night foxtrot three". iOS drops opening words, so
   *           this is the same utterance damaged, not a rival.
   *           Kept, but below everything complete, so a wrong
   *           guess can still be reached by answering "no".
   *
   * A tier is used rather than a large penalty because the score
   * range grows with the number of alternatives: any fixed
   * penalty can be beaten by a complete reading far enough down
   * Safari's list.
   *
   * STAGE 2 - SCORE, within a tier. Lower is offered first.
   *
   *   + 100 per step down Safari's confidence list. Its own
   *         first choice starts at 0, its second at 100, and so
   *         on. This dominates, so Safari's opinion is followed
   *         unless something below overrides it.
   *   -   5 the move is a pawn move AND no piece was named.
   *         "foxtrot three" is f3 in notation, not Nf3, so the
   *         pawn is offered first. Small, so it only breaks ties
   *         inside one alternative, never across two.
   *   -   2 the move is a capture. Captures are the moves people
   *         notice, so among equals they come first.
   *
   * The gaps matter more than the values: 100 separates
   * alternatives, and 5 and 2 only reorder moves that came from
   * the SAME alternative and would otherwise be tied.
   *
   * AFTER SORTING, one filter can override all of it. If the
   * word "check" or "mate" was spoken and some candidates give
   * check, the rest cannot be what was meant and are dropped.
   * This is a filter, not a score, because it is a statement of
   * fact about the move rather than a preference.
   * ============================================================== */

  var SCORE_PER_ALTERNATIVE = 100;
  var SCORE_BONUS_PAWN = -5;
  var SCORE_BONUS_CAPTURE = -2;

  function collectCandidates(pos, transcripts) {
    var seen = {}, ranked = [];
    var legal = pos.legalMoves();
    var clipped = clippedIndexes(transcripts);
    transcripts.forEach(function (raw, altIdx) {
      var req = parseTranscript(raw);
      // FUZZY MATCHING MAY ADD, NEVER SUBTRACT (v121). A
      // near-miss can invent a component and POISON a
      // reading that was otherwise complete: game21's
      // "Charlotte ticks bravo three" had a good b3, and
      // "ticks" bent into "sicks" - the rank 6 - which
      // pinned the mover to a rank it was not on and left
      // no legal move at all. The named spellings fix that
      // pair; this fixes the CLASS. An audit against 61,961
      // English words found 971 of them one edit from some
      // spelling in the tables, so there are more of these
      // waiting.
      //
      // So: if a reading that used a near-miss yields no
      // move, parse it again with near-misses off and use
      // that instead. Strictly additive - it can only turn
      // no candidates into candidates, never rewrite a
      // reading that already worked - and it costs one
      // extra parse of one transcript, only on failure.
      var found = findMoves(pos, req);
      if (!found.length && req.usedFuzzy) {
        var plain = parseTranscript(raw, true);
        if (!reqIsEmpty(plain)) {
          var pf = findMoves(pos, plain);
          if (pf.length) {
            log("PRS", "near-miss poisoned the reading, " +
                "retrying without it");
            req = plain;
            found = pf;
          }
        }
      }
      if (reqIsEmpty(req)) return;
      var namedPiece = !!req.piece;
      found.forEach(function (m) {
        // An explicit promotion ("g1 equals knight", or any
        // promote/equals keyword) can only describe a pawn
        // move, so it names the pawn as surely as saying
        // "pawn", and the bare-push guard is skipped. In
        // game3 (15:27:08) the guard still asked about Bg1
        // after "equals knight" had ruled every bishop move
        // out. A bare square that happens to promote
        // ("g1" alone) sets neither flag and is still
        // guarded, as before.
        //
        // A spoken from-file on a pawn capture ("golf takes
        // foxtrot three") is the grammar's full capture
        // form, and a full from-square ("bravo one charlie
        // three") is fully spelled: both name the pawn the
        // same way (v71), so they skip the guard.
        var named = namedPiece ||
            !!(m.promotion && (req.trailingPiece || req.promoKw)) ||
            !!(m.piece === "p" && m.captured && req.fromFile) ||
            req.squares.length > 1;
        var uci = pos.uciOf(m);
        if (seen[uci]) {
          // a later reading that names the piece still counts
          // as naming it, for the bare-push guard below
          if (named) seen[uci].named = true;
          return;
        }
        var score = altIdx * SCORE_PER_ALTERNATIVE;
        if (!namedPiece && m.piece === "p") score += SCORE_BONUS_PAWN;
        if (m.captured) score += SCORE_BONUS_CAPTURE;
        var entry = { m: m, san: pos.sanOf(m, legal), score: score,
                      tier: clipped[altIdx] ? 1 : 0,
                      named: named };
        seen[uci] = entry;
        ranked.push(entry);
      });
    });
    var wantCheck = transcripts.some(saysCheck);
    if (wantCheck) {
      var checking = ranked.filter(function (r) {
        var last = r.san.slice(-1);
        return last === "+" || last === "#";
      });
      if (checking.length && checking.length < ranked.length) {
        log("CND", "\"check\" narrowed " + ranked.length + " to " +
            checking.length);
        ranked = checking;
      }
    }
    // "mate" narrows harder than "check" (v116): among
    // checking moves only the mating ones can be meant.
    // Same shape as above - a statement of fact, so a
    // filter, not a score.
    if (transcripts.some(saysMate)) {
      var mating = ranked.filter(function (r) {
        return r.san.slice(-1) === "#";
      });
      if (mating.length && mating.length < ranked.length) {
        log("CND", "\"mate\" narrowed " + ranked.length + " to " +
            mating.length);
        ranked = mating;
      }
    }
    // stage 1 tier, then stage 2 score: see the block above
    ranked.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.score - b.score;
    });
    if (ranked.length > 1) {
      log("CND", "order: " + ranked.map(function (r) {
        return r.san + "(t" + r.tier + "/" + r.score + ")";
      }).join(" "));
    }
    return ranked;
  }

  // Safari returns the same reading several times over,
  // differing only in spelling: capitals ("Night Delta five"
  // vs "Night delta five"), or digits against words ("bravo
  // 8" vs "bravo eight"). Comparing the raw strings only
  // catches the first kind.
  //
  // So reduce each reading to what it MEANS first. Every
  // word becomes the file, rank, piece or capture it stands
  // for, and filler is dropped. Two readings that would
  // produce the same move collapse into one, however they
  // happen to be spelled.
  function semanticKey(text) {
    var toks = wordsOf(text), out = [], m;
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      // fused words split the same way the parser splits
      // them, including the valueless ["take"] pair (v116)
      if (COMPOUND[tk]) {
        COMPOUND[tk].forEach(function (pair) {
          out.push(pair[0] === "take" ? "x" :
                   (pair[0] === "piece" ? "p" : "f") + pair[1]);
        });
        continue;
      }
      // mirror of the parser's file-then-"to" rule (v116),
      // so "hotel to" and "hotel two" collapse to one key
      if (tk === "to") {
        if (out.length && out[out.length - 1].charAt(0) === "f" &&
            out[out.length - 1].length === 2) {
          out.push("r2");
        }
        continue;
      }
      if (NATO[tk]) { out.push("f" + NATO[tk]); continue; }
      if (NUMS[tk]) { out.push("r" + NUMS[tk]); continue; }
      if (PIECES[tk]) { out.push("p" + PIECES[tk]); continue; }
      if (TAKE_WORDS[tk]) { out.push("x"); continue; }
      if (CASTLE_WORDS[tk]) { out.push("castle"); continue; }
      m = /^([a-h])([1-8])$/.exec(tk);
      if (m) { out.push("f" + m[1], "r" + m[2]); continue; }
      if (/^[a-h]$/.test(tk)) { out.push("f" + tk); continue; }
      if (/^[1-8]$/.test(tk)) { out.push("r" + tk); continue; }
      if (FILLER[tk]) continue;
      // Near-misses reduce to what the parser will read them
      // as, so "Brooke bravo four" and "rook bravo four"
      // collapse to one key. Before this the clipped-reading
      // check compared raw words, missed that pair, and the
      // bare "bravo four" was never demoted: the pawn was
      // offered first when the rook move was meant (game1,
      // 19:40:18). Same rules as parsing, so the key still
      // matches what the move would be.
      var fz = fuzzyToken(tk);
      if (fz) {
        out.push((fz.t === "file" ? "f" :
                  fz.t === "rank" ? "r" : "p") + fz.v);
        continue;
      }
      out.push(tk);
    }
    return out.join(" ");
  }

  // Which readings are another reading with the leading
  // piece name missing. These are not rival guesses, they
  // are the same utterance with a word lost, so their moves
  // are ranked below the fuller reading's. Nothing is
  // discarded: if the guess is wrong the other move is
  // still offered, and either way a question is asked
  // before anything is sent.
  function clippedIndexes(list) {
    var keys = list.map(semanticKey), out = {};
    keys.forEach(function (shortKey, i) {
      keys.forEach(function (longKey, j) {
        if (i === j || out[i]) return;
        var parts = longKey.split(" ");
        if (parts.length < 2) return;
        if (parts[0].charAt(0) !== "p") return;
        if (parts.slice(1).join(" ") !== shortKey) return;
        out[i] = true;
        // name the damaged reading first, so the log says
        // plainly which one is being pushed down
        log("HRD", "demoting \"" + list[i] + "\": it is \"" +
            list[j] + "\" minus its first word");
      });
    });
    return out;
  }

  function dedupeTranscripts(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (t) {
      if (!String(t).trim()) return;
      var key = semanticKey(t);
      if (seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  // THE ONE SILENT PATH is a lone candidate played with no
  // question. If that candidate is a pawn move from a bare
  // utterance and a piece could also legally have been
  // meant, the piece name may have been lost by the mic,
  // and playing the pawn would be silent and irreversible.
  // Two forms of the same hazard:
  //   push:    "rook echo four" heard as "echo four"
  //   capture: "queen takes f3" heard as "takes f3"
  //            (game6, 21:20:47: gxf3 played, Qxf3 meant,
  //            game resigned — captures were exempt until
  //            v71)
  // Returns the list to confirm, pawn first then the piece
  // moves so answering no reaches them, or null when playing
  // at once is safe. Naming the piece, the pawn, the
  // capture's from-file, or a promotion all skip it (the
  // named flag in collectCandidates). See guardPawnPushes
  // in SETTING_DEFAULTS.
  function bareGuardCands(c) {
    if (!CFG.guardPawnPushes) return null;
    if (c.named || c.m.piece !== "p") return null;
    var to = RULES.sqName(c.m.to);
    var legal = api.pos.legalMoves();
    var isCap = !!c.m.captured;
    var shadows = legal.filter(function (m) {
      if (m.piece === "p" || RULES.sqName(m.to) !== to) return false;
      // a capture utterance can only have meant a capture
      return isCap ? !!m.captured : true;
    });
    if (!shadows.length) return null;
    log("CND", "guard: " + shadows.map(function (m) {
      return api.pos.sanOf(m, legal);
    }).join(",") + " could also reach " + to + ", asking first");
    return [c].concat(shadows.map(function (m) {
      return { m: m, san: api.pos.sanOf(m, legal) };
    }));
  }

