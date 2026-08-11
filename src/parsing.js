  /*=========================== PARSING ============================*/

  /*===================== THE SPOKEN GRAMMAR =======================
   *
   *  WHAT CAN BE SAID, and what it means. Rewritten whole at
   *  w118, on the owner's design, after the piece-name grammar
   *  lost one game too many (the 11 Aug "Patient Charlie four"
   *  resignation, and w116's confirm-every-move answer to it,
   *  which traded the danger for a question on every move).
   *  This grammar deletes the danger instead.
   *
   *  A MOVE IS FOUR ITEMS: from-file, from-rank, to-file,
   *  to-rank.
   *
   *    "echo two echo four"        e2e4
   *    "golf one foxtrot three"    Ng1-f3, no piece name needed
   *    "echo four delta five"      the capture exd5 - captures
   *                                are not special, the board
   *                                knows what stands on d5
   *    "echo one golf one"         castles kingside: castling
   *                                is the KING's move, spoken
   *                                as the king's two squares
   *    "echo seven echo eight"     promotion, a queen unless...
   *    "... equals knight"         ...a piece is named after
   *                                an equals word
   *
   *  THE VOCABULARY IS SIXTEEN WORDS - alpha through hotel,
   *  one through eight - plus their logged homophones, and
   *  that is the whole point: every catastrophic mishearing
   *  in this project's history was a PIECE NAME (bishop as
   *  "Patient", pawn as "Plants", rook as "Rug", queen as
   *  "Clean"). The NATO alphabet exists because its words
   *  share no neighbours; the piece names were never chosen
   *  for the ear at all.
   *
   *  AND THE FORMAT IS ITS OWN GUARD. Four items name one
   *  move with no legal-move disambiguation, so nothing is
   *  ever inferred; the from-square must hold the mover's own
   *  piece and the whole move must be legal, so most
   *  mishearings produce an illegal move and are refused
   *  rather than played. A legal four-item move plays AT ONCE
   *  and the chime confirms it - no read-back, no yes. The
   *  user said all four items; the chime says they landed.
   *
   *  ANYTHING LESS IS "Say again." - all of it, on purpose
   *  (owner's decision, w118). Not "I heard X", not "that is
   *  not legal", no filling in a missing item by what is
   *  legal, however unique the completion. The old grammar's
   *  repair chain could turn half a hearing into the right
   *  move most days, and into c4-instead-of-Bc4 once - and
   *  once was the whole game. A system that never guesses
   *  cannot guess wrong: the ONLY thing that plays is four
   *  items heard whole, and the one answer to everything else
   *  is the same three words. If several rival readings parse
   *  to DIFFERENT legal moves, that is a mishearing by
   *  definition, and it is "Say again." too.
   *
   *  SINGLE LETTERS work as well as NATO words ("E two E
   *  four"), and glued squares work ("e2 e4", "e2e4"), since
   *  Safari often returns them fused. But the letters b, c,
   *  d, e, g are one vowel apart across a room, and a letter
   *  that lands as an ordinary word lands as nothing - "B
   *  four" comes back as "before". NATO words are the ones
   *  that survive the distance.
   *
   *  IF THE FIRST WORD KEEPS GETTING LOST, start with one
   *  that does not matter and let it absorb the loss:
   *  "move", "play", "please", "okay", "um" are ignored.
   *
   *  COMMANDS: "repeat" (or "say again"), "flip clock",
   *  "cancel", "memo ...", "resign", "draw" - the last two
   *  still ask their yes/no, because they end a game and are
   *  not moves. (The position queries - "whose turn", "what
   *  is on foxtrot three" - were deleted at w118 with the
   *  rest: the owner never used them.)
   *
   *  STRAY TALK. The mic is open all game, so everything said
   *  in the room reaches it. An utterance with no complete
   *  square in it is ignored silently and only logged; one
   *  with a square in it was probably aimed at us, and gets
   *  its "Say again." - or, spoken out of turn, the true
   *  answer ("black to move.", "The game is over.").
   *================================================================*/


  /* Safari mangles words the homophone lists cannot all anticipate
   * ("foxtrott", "delter", "charlies"). As a LAST resort, accept a
   * token that is one edit away from exactly one vocabulary word.
   * Ambiguous near-misses are rejected rather than guessed. Since
   * w118 the targets are FILES and RANKS only - there is nothing
   * else left to be near - and a false positive cannot play a
   * move: it makes a fifth item, or a wrong item in an illegal
   * move, and both are "Say again." */
  function editDistance(a, b, cap) {
    if (Math.abs(a.length - b.length) > (cap || 1)) return 99;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[b.length];
  }

  var FUZZY_SETS = [[NATO, "file"], [NUMS, "rank"]];

  /* THE CANDIDATE LIST IS BUILT ONCE (w53): the tables are
   * constants, so the eligible spellings are flattened at load. */
  var FUZZY_TARGETS = (function () {
    var out = [];
    FUZZY_SETS.forEach(function (pair) {
      var dict = pair[0], kind = pair[1];
      Object.keys(dict).forEach(function (w) {
        if (w.length < 4) return;
        if (FUZZY_EXACT_ONLY[w]) return;
        out.push({ t: kind, v: dict[w], w: w });
      });
    });
    return out;
  })();

  function fuzzyToken(tk) {
    if (tk.length < 4) return null;
    if (FUZZY_NEVER[tk]) return null;
    /* short words are dense with collisions, long ones are not */
    var tol = tk.length >= 6 ? 2 : 1;
    var hits = [];
    for (var fi = 0; fi < FUZZY_TARGETS.length; fi++) {
      var cand = FUZZY_TARGETS[fi];
      if (editDistance(tk, cand.w, tol) <= tol) hits.push(cand);
    }
    if (!hits.length) return null;
    var distinct = {};
    hits.forEach(function (h) { distinct[h.t + h.v] = h; });
    var keys = Object.keys(distinct);
    if (keys.length !== 1) {
      // AMBIGUOUS, REFUSE TO GUESS - but say so in the log
      // (w114): the owner's deliberate "light" vanished
      // without a trace once, and the refusal was right but
      // the silence read as the word never being seen.
      var words = keys.map(function (k) {
        return "\"" + distinct[k].w + "\"";
      }).join(" or ");
      var rmsg = "near-miss \"" + tk + "\" dropped: could be " + words;
      if (!nearMissLogged[rmsg]) {
        nearMissLogged[rmsg] = 1;
        log("PRS", rmsg);
      }
      return null;
    }
    return distinct[keys[0]];
  }

  // Apostrophes are deleted, not turned into spaces, so
  // "who's" becomes "whos" and matches the filler words.
  function wordsOf(raw) {
    return String(raw).toLowerCase().replace(/['’]/g, "")
      .replace(/[.,!?;:]/g, " ")
      .split(/\s+/).filter(Boolean);
  }

  /* THE CLASSIFIERS (w57): they read an utterance and decide
   * what KIND of thing it is. */
  function memoTranscript(transcripts) {
    for (var i = 0; i < transcripts.length; i++) {
      var toks = wordsOf(transcripts[i]);
      if (toks.length > 1 && MEMO_WORDS[toks[0]]) return transcripts[i];
    }
    return null;
  }

  // "flip clock" (or "swap clocks", "switch the clock")
  // swaps which side of the screen your clock is on. As
  // strict as its neighbors: a flip word AND a clock word,
  // and any other content word disqualifies.
  function classifyFlipClock(raw) {
    var toks = wordsOf(raw);
    var flip = 0, clk = 0, other = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (FLIP_WORDS[t]) flip++;
      else if (CLOCK_WORDS[t]) clk++;
      else if (!FILLER[t]) other++;
    }
    return !!(flip && clk && !other);
  }

  function classifyCommand(raw) {
    var toks = wordsOf(raw);
    var yes = 0, no = 0, cancel = 0, repeat = 0,
        resign = 0, draw = 0, other = 0;
    toks.forEach(function (t) {
      if (YES_WORDS[t]) yes++;
      else if (NO_WORDS[t]) no++;
      else if (CANCEL_WORDS[t]) cancel++;
      else if (REPEAT_WORDS[t]) repeat++;
      else if (RESIGN_WORDS[t]) resign++;
      else if (DRAW_WORDS[t]) draw++;
      else if (t === "offer" || t === "offers") { /* neutral */ }
      else if (!FILLER[t]) other++;
    });
    if (cancel && !other) return "cancel";
    if (resign && !other) return "resign";
    if (draw && !other) return "draw";
    if (yes && !no && !other) return "yes";
    if (no && !yes && !other) return "no";
    if (repeat && !other) return "repeat";
    return null;
  }

  /* A WORD THAT IS NOT PART OF A MOVE BUT IS NOT UNKNOWN
   * EITHER (w115). The command tables hold every word the
   * program recognises without it being a file or a rank;
   * the move parser has no use for them, but their presence
   * must not damn a reading the way a genuinely unknown word
   * does - "yeah, echo two echo four" is not a damaged
   * hearing. */
  function knownNonMoveWord(tk) {
    return !!(YES_WORDS[tk] || NO_WORDS[tk] || CANCEL_WORDS[tk] ||
              REPEAT_WORDS[tk] || CLOCK_WORDS[tk] || FLIP_WORDS[tk] ||
              RESIGN_WORDS[tk] || DRAW_WORDS[tk] || MEMO_WORDS[tk]);
  }

  // See the near-miss logging note in fuzzyToken; declared
  // here so the parser test slice (vocabulary, parsing and
  // matching) contains it. handleTranscripts resets it per
  // utterance.
  var nearMissLogged = {};

  /* ONE READING, REDUCED TO ITS ITEMS. Returns
   *   { items: [{t:"file"|"rank", v}...],
   *     promo:  "q"|"r"|"b"|"n"|null,
   *     unknown: first unaccounted content word or null }
   * The caller decides what the shape means; this only
   * translates words. An unknown content word marks the
   * reading DAMAGED - something was said that the grammar
   * cannot account for, and w115's lesson is that the
   * commonest such something is a word the mic mangled. A
   * damaged reading never plays; whether it earns a "Say
   * again." depends on whether any reading held a square.
   */
  function readItems(raw) {
    var toks = wordsOf(raw);
    var items = [], promo = null, unknown = null;
    var afterPromoKw = false;
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      if (tk === "promote" || tk === "promotes" || tk === "promotion" ||
          tk === "equals" || tk === "equal") {
        afterPromoKw = true;
        continue;
      }
      if (afterPromoKw && PIECES[tk]) {
        promo = PIECES[tk];
        afterPromoKw = false;
        continue;
      }
      // "to" is filler EXCEPT directly after a file, where it
      // is the rank 2 (v116): Safari writes "two" as "to", and
      // the four-item grammar says a rank follows every file,
      // so "echo to echo four" MUST read as e2e4. This rule
      // predates w118 and matters more now than it ever did.
      if (tk === "to") {
        if (items.length && items[items.length - 1].t === "file") {
          items.push({ t: "rank", v: "2" });
        }
        continue;
      }
      // SAFARI WRITES "delta" AS "down to" (w84): "down to"
      // DIRECTLY BEFORE A RANK is the d-file, the "to"
      // consumed as part of the word.
      if (tk === "down" && toks[i + 1] === "to") {
        var nxr = toks[i + 2];
        if (nxr && (NUMS[nxr] || /^[1-8]$/.test(nxr))) {
          items.push({ t: "file", v: "d" });
          i++;
          continue;
        }
      }
      if (COMPOUND[tk]) {
        COMPOUND[tk].forEach(function (pair) {
          items.push({ t: pair[0], v: pair[1] });
        });
        continue;
      }
      /* Bare "a" is usually the article. It counts as the
       * a-FILE only when a rank follows it, which in this
       * grammar is the only place a file can stand:
       *   "a four e four"   -> a4e4 (well, half of one)
       *   "a knight..."     -> the article, ignored
       */
      if (tk === "a") {
        var nx = toks[i + 1];
        if (nx && (NUMS[nx] || /^[1-8]$/.test(nx))) {
          items.push({ t: "file", v: "a" });
        }
        continue;
      }
      if (NATO[tk]) { items.push({ t: "file", v: NATO[tk] }); continue; }
      if (NUMS[tk]) { items.push({ t: "rank", v: NUMS[tk] }); continue; }
      // a glued whole move ("e2e4") or a glued square ("b4")
      var m2 = /^([a-h][1-8])([a-h][1-8])$/.exec(tk);
      if (m2) {
        items.push({ t: "file", v: m2[1][0] }, { t: "rank", v: m2[1][1] },
                   { t: "file", v: m2[2][0] }, { t: "rank", v: m2[2][1] });
        continue;
      }
      var m1 = /^([a-h])([1-8])$/.exec(tk);
      if (m1) {
        items.push({ t: "file", v: m1[1] }, { t: "rank", v: m1[2] });
        continue;
      }
      if (/^[a-h]$/.test(tk)) { items.push({ t: "file", v: tk }); continue; }
      if (/^[1-8]$/.test(tk)) { items.push({ t: "rank", v: tk }); continue; }
      if (FILLER[tk]) continue;
      if (knownNonMoveWord(tk)) continue;
      var fz = fuzzyToken(tk);
      if (fz) {
        var nmsg = "near-miss \"" + tk + "\" read as \"" + fz.w + "\"";
        if (!nearMissLogged[nmsg]) {
          nearMissLogged[nmsg] = 1;
          log("PRS", nmsg);
        }
        items.push({ t: fz.t, v: fz.v });
        continue;
      }
      if (!unknown) unknown = tk;
    }
    return { items: items, promo: promo, unknown: unknown };
  }

  /* THE FOUR-ITEM TEST. A reading plays only if it reduces to
   * EXACTLY file rank file rank, in that order, with no
   * unknown word beside them. Returns "e2e4"-style UCI (the
   * promotion letter appended by the caller once legality is
   * known), or null. No shorter or longer shape is ever
   * completed or trimmed: the owner's rule is that the system
   * never guesses, so a hearing that is not the whole move is
   * not a move.
   */
  function parseMove(raw) {
    var r = readItems(raw);
    if (r.unknown) return null;
    if (r.items.length !== 4) return null;
    var t = r.items.map(function (s) { return s.t; }).join(" ");
    if (t !== "file rank file rank") return null;
    return { uci: r.items[0].v + r.items[1].v +
                  r.items[2].v + r.items[3].v,
             promo: r.promo };
  }

  /* MOVE-SHAPED is what separates "Say again." from silence:
   * a complete square (a file with its rank beside it) in any
   * reading means the utterance was probably aimed at us. A
   * lone file or lone rank is not enough - "see you at four"
   * carries a four. */
  function hasSquare(raw) {
    var items = readItems(raw).items;
    for (var i = 0; i + 1 < items.length; i++) {
      if (items[i].t === "file" && items[i + 1].t === "rank") return true;
    }
    return false;
  }

  function colorWord(c) { return c === "w" ? "white" : "black"; }

  // The PRS log line: what the reading reduced to, so a
  // pasted log shows why it played or was refused.
  function describeItems(raw) {
    var r = readItems(raw);
    return r.items.map(function (s) { return s.v; }).join(" ") +
           (r.promo ? " =" + r.promo : "") +
           (r.unknown ? "   (\"" + r.unknown + "\" not understood)" : "");
  }
