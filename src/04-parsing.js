  /*========================== 4. PARSING ==========================*/

  /* Safari mangles words the homophone lists cannot all anticipate
   * ("foxtrott", "delter", "charlies"). As a LAST resort, accept a
   * token that is one edit away from exactly one vocabulary word.
   * Ambiguous near-misses are rejected rather than guessed. */
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

  var FUZZY_SETS = [[NATO, "file"], [NUMS, "rank"], [PIECES, "piece"]];

  function fuzzyToken(tk) {
    if (tk.length < 4) return null;
    if (FUZZY_NEVER[tk]) return null;
    /* "mate" sits one edit from "hate", a homophone of the
     * rank 8. Left alone, "queen alpha one mate" grew a
     * phantom from-rank and matched nothing. Check words
     * describe a move, they are never part of one. */
    if (CHECK_WORDS[tk]) return null;
    /* short words are dense with collisions, long ones are not */
    var tol = tk.length >= 6 ? 2 : 1;
    var hits = [];
    FUZZY_SETS.forEach(function (pair) {
      var dict = pair[0], kind = pair[1];
      Object.keys(dict).forEach(function (w) {
        if (w.length < 4) return;
        if (FUZZY_EXACT_ONLY[w]) return;
        if (editDistance(tk, w, tol) <= tol) hits.push({ t: kind, v: dict[w], w: w });
      });
    });
    if (!hits.length) return null;
    var distinct = {};
    hits.forEach(function (h) { distinct[h.t + h.v] = h; });
    var keys = Object.keys(distinct);
    // ambiguous, refuse to guess
    if (keys.length !== 1) return null;
    return distinct[keys[0]];
  }

  // Apostrophes are deleted, not turned into spaces, so
  // "who's" becomes "whos" and matches the question words.
  function wordsOf(raw) {
    return String(raw).toLowerCase().replace(/['\u2019]/g, "")
      .replace(/[.,!?;:]/g, " ")
      .split(/\s+/).filter(Boolean);
  }

  function classifyCommand(raw) {
    var toks = wordsOf(raw);
    var yes = 0, no = 0, cancel = 0, repeat = 0, clock = 0,
        resign = 0, draw = 0, other = 0;
    toks.forEach(function (t) {
      if (YES_WORDS[t]) yes++;
      else if (NO_WORDS[t]) no++;
      else if (CANCEL_WORDS[t]) cancel++;
      else if (REPEAT_WORDS[t]) repeat++;
      else if (CLOCK_WORDS[t]) clock++;
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
    if (clock && !other) return "clock";
    if (repeat && !other) return "repeat";
    return null;
  }

  // See the near-miss logging note inside parseTranscript.
  // Declared here so the parser test slice (sections 3-5)
  // contains it; handleTranscripts resets it per utterance.
  var nearMissLogged = {};

  /* A SECOND HALF-SQUARE, PAST THE TAKE WORD, IS THE TARGET'S
   * (w41). "charlie takes delta" is a whole move to the ear -
   * the c-pawn takes on the d-file - but through w40 the two
   * dangling files landed in the same slot and the second
   * simply erased the first, leaving "- x - d -", a request
   * with nothing to say, answered "Say again."
   *
   * It fires only where an origin was ALREADY spoken before
   * the take word, which is what makes it safe: with no
   * origin behind it, a lone file after "takes" is still the
   * destination-file guess the half-square repair has always
   * made of "queen takes delta", and that reading is
   * untouched. Two halves straddling the take word could not
   * mean anything at all before this, so nothing that worked
   * can change.
   */
  function danglingIsTarget(req) {
    return !!(req.capture &&
              (req.squares.length || req.fromFile || req.fromRank));
  }

  function parseTranscript(raw, noFuzzy) {
    var toks = wordsOf(raw);
    var req = { castle: null, piece: null, capture: false, squares: [],
                fromFile: null, fromRank: null, trailingPiece: null,
                promoKw: false, victim: null,
                takeAt: -1, fromBeforeTake: false,
                toFile: null, toRank: null };
    var syms = [], i, tk;
    for (i = 0; i < toks.length; i++) {
      tk = toks[i];
      if (CASTLE_WORDS[tk]) { req.castle = "?"; continue; }
      if (tk === "kingside" || tk === "short") { req.castle = "k"; continue; }
      if (tk === "queenside" || tk === "long") { req.castle = "q"; continue; }
      if (tk === "side") continue;
      if (tk === "promote" || tk === "promotes" || tk === "promotion" ||
          tk === "equals" || tk === "equal") { syms.push({ t: "promo-kw" }); continue; }
      // "to" is filler ("knight to f3") EXCEPT in two spots.
      // After a promotion keyword it is part of "promote to
      // queen" and is simply consumed, as before. Directly
      // after a FILE it is the rank 2 (v116): Safari writes
      // "two" as "to", and "King h to" (game20, 18:12) lost
      // its rank to the filler list. Nothing but a rank can
      // legally follow a lone file, so the reading is safe;
      // "knight to f3" and "e2 to e4" are untouched because
      // there "to" follows a piece and a rank.
      if (tk === "to") {
        if (syms.length && syms[syms.length - 1].t === "promo-kw") continue;
        if (syms.length && syms[syms.length - 1].t === "file") {
          syms.push({ t: "rank", v: "2" });
        }
        continue;
      }
      if (COMPOUND[tk]) {
        COMPOUND[tk].forEach(function (pair) {
          syms.push({ t: pair[0], v: pair[1] });
        });
        continue;
      }
      if (TAKE_WORDS[tk]) { syms.push({ t: "take" }); continue; }
      /* Bare "a" is usually the article, since the a-file is
       * normally spoken as "alpha". It counts as the FILE only
       * when a rank or a capture word follows it:
       *   "a four"             -> a4
       *   "a takes bravo five" -> axb5
       *   "a hotel four"       -> h4, the "a" was just an article
       *   "a knight to f3"     -> Nf3, likewise
       * Without the capture case, "a takes bravo five" lost its
       * from-file and became ambiguous whenever two pawns could
       * capture the same square.
       */
      if (tk === "a") {
        var nx = toks[i + 1];
        if (nx && (NUMS[nx] || /^[1-8]$/.test(nx) || TAKE_WORDS[nx])) {
          syms.push({ t: "file", v: "a" });
        }
        continue;
      }
      if (NATO[tk]) { syms.push({ t: "file", v: NATO[tk] }); continue; }
      if (NUMS[tk]) { syms.push({ t: "rank", v: NUMS[tk] }); continue; }
      if (PIECES[tk]) { syms.push({ t: "piece", v: PIECES[tk] }); continue; }
      var m2 = /^([a-h][1-8])([a-h][1-8])$/.exec(tk);
      if (m2) {
        syms.push({ t: "file", v: m2[1][0] }, { t: "rank", v: m2[1][1] },
                  { t: "file", v: m2[2][0] }, { t: "rank", v: m2[2][1] });
        continue;
      }
      var m = /^([a-h])([1-8])$/.exec(tk);
      if (m) { syms.push({ t: "file", v: m[1] }, { t: "rank", v: m[2] }); continue; }
      if (/^[a-h]$/.test(tk)) { syms.push({ t: "file", v: tk }); continue; }
      if (/^[1-8]$/.test(tk)) { syms.push({ t: "rank", v: tk }); continue; }
      if (FILLER[tk]) continue;
      if (noFuzzy) continue;
      var fz = fuzzyToken(tk);
      if (fz) {
        req.usedFuzzy = true;
        // Logged ONCE per utterance (v116). Each transcript
        // is parsed several times on its way through - the
        // move-like scan, candidate collection, the PRS
        // line - and game20 printed one near-miss seven
        // times (17:57). handleTranscripts clears the seen
        // set at the top of every utterance; parses outside
        // that loop (the parser test, classifyQuery) just
        // log each distinct near-miss once, which is still
        // the truth.
        var nmsg = "near-miss \"" + tk + "\" read as \"" + fz.w + "\"";
        if (!nearMissLogged[nmsg]) {
          nearMissLogged[nmsg] = 1;
          log("PRS", nmsg);
        }
        syms.push({ t: fz.t, v: fz.v });
      }
    }

    if (req.castle === "?") {
      for (i = 0; i < syms.length; i++) {
        if (syms[i].t === "piece" && syms[i].v === "k") req.castle = "k";
        if (syms[i].t === "piece" && syms[i].v === "q") req.castle = "q";
      }
    }
    if (req.castle) return req;

    var afterPromoKw = false;
    for (i = 0; i < syms.length; i++) {
      var s = syms[i];
      if (s.t === "promo-kw") {
        afterPromoKw = true; req.promoKw = true; continue;
      }
      if (s.t === "take") {
        // WHERE THE TAKE WORD FELL (w40). takeAt is how many
        // whole squares had already been spoken when the
        // FIRST take word arrived, and fromBeforeTake (below)
        // says the same about a dangling file or rank. Nothing
        // reads them but originCapture; see the note there for
        // why word order is worth remembering.
        if (req.takeAt < 0) req.takeAt = req.squares.length;
        req.capture = true;
        continue;
      }
      if (s.t === "piece") {
        // A SECOND PIECE NAME, AFTER "TAKES" AND BEFORE ANY
        // SQUARE, IS THE VICTIM (v111): "queen takes queen".
        // Through v110 there was ONE piece slot and the last
        // name won, so "queen takes rook" parsed as a rook
        // move. Harmless only while no square was spoken,
        // since findMoves drops a squareless request on its
        // first line. WITH a square it was live and silent:
        // "queen takes rook delta four" — and "the" and "on"
        // are filler, so "queen takes the rook on d4" is the
        // same tokens — parsed as r x d4 and PLAYED Rxd4,
        // unconfirmed, because naming a piece sets the named
        // flag and skips the bare-square guard. Right square,
        // wrong piece, no question asked: the game6 shape.
        // Never seen in nineteen games because it needs two
        // piece names in one utterance, which nobody says
        // until this grammar invites it. The mover must
        // already be named for the victim reading to fire;
        // see the victim branch in findMoves for why.
        // A PIECE NAME AFTER "TAKES" IS THE VICTIM, mover
        // named or not (v121; v111 required the mover).
        // Game21 lost two moves to the old rule: "Note
        // takes paw" (19:02) and "Delta takes night"
        // (19:03) both had the mover misheard or spoken as
        // a bare file, so the ONE piece name landed in the
        // mover slot - "the pawn has nothing to take", and
        // a knight that was meant as the prey.
        //
        // Safe for the reason v111 wrote down itself:
        // uniqueness in the victim branch is counted over
        // EVERY legal capture of that piece type, so a
        // mover that never arrived cannot move the wrong
        // piece - it can only turn one candidate into
        // several, which asks. A spoken from-file still
        // narrows the mover ("delta takes knight" is the
        // d-pawn), which is how game21's dxc3 resolves.
        //
        // THE COST, again knowingly: "takes the rook" now
        // needs no piece name at all to be a move, so the
        // ordinary-English exposure v111 accepted is a
        // little wider. Uniqueness still gates it, and a
        // room with one player in it is the environment
        // this is tuned for. If it ever fires unasked, the
        // log line is the victim branch in findMoves.
        if (afterPromoKw || req.squares.length) req.trailingPiece = s.v;
        else if (req.capture && !req.victim) req.victim = s.v;
        else req.piece = s.v;
        continue;
      }
      if (s.t === "file") {
        if (i + 1 < syms.length && syms[i + 1].t === "rank") {
          req.squares.push(s.v + syms[i + 1].v);
          i++;
        } else if (danglingIsTarget(req)) {
          req.toFile = s.v;
        } else {
          // recomputed, not or-ed: a later dangling file
          // OVERWRITES an earlier one, so the flag must
          // describe the file that survived, not the one that
          // did not.
          req.fromFile = s.v;
          req.fromBeforeTake = !req.capture;
        }
        continue;
      }
      if (s.t === "rank") {
        if (danglingIsTarget(req)) req.toRank = s.v;
        else {
          req.fromRank = s.v;
          req.fromBeforeTake = !req.capture;
        }
      }
    }
    return req;
  }

  function reqIsEmpty(req) {
    return !req.castle && !req.squares.length && !req.victim;
  }

  /* A CAPTURE MAY NAME THE ORIGIN INSTEAD OF THE TARGET (w40).
   *
   * Game w39-1 lost four utterances in forty seconds to one
   * gap. With a pawn on e5 and a knight on f6 the owner said
   * "echo takes", "echo five takes", "pawn echo five takes"
   * and "echo five takes night" - and was refused each time,
   * because findMoves reads a lone square as the DESTINATION
   * and nothing captures onto e5. He was naming the pawn and
   * leaving out what the board already made obvious.
   *
   * WORD ORDER IS THE WHOLE DISCRIMINATOR, and it is free:
   * every capture form that works today puts the destination
   * AFTER the take word - "foxtrot takes golf five", "takes
   * echo five", "echo five takes foxtrot six". So a square or
   * a dangling file spoken BEFORE it cannot be the
   * destination, and reading it as the origin cannot change
   * the meaning of anything that already worked. That is why
   * the parser now remembers where the take word fell rather
   * than guessing from what is on the board.
   *
   * Returns what was named - a square "e5", a file "e", a
   * rank "5" - or null when this is not that shape. The
   * repair that uses it is in section 6; it fires only where
   * the ordinary reading found nothing.
   *
   * KNOWN AND LEFT STANDING: "echo five takes knight" puts
   * the knight in trailingPiece, the PROMOTION slot, because
   * the piece branch above treats any piece name after a
   * square as a promotion choice - which quietly contradicts
   * v121's "a piece name after takes is the VICTIM". The
   * origin repair resolves that utterance anyway, by
   * uniqueness, and unpicking the slot risks "bravo takes
   * alpha eight queen". Worth fixing the day a log needs it.
   */
  function originCapture(req) {
    if (!req.capture || req.castle) return null;
    if (req.squares.length === 1 && req.takeAt === 1) return req.squares[0];
    if (!req.squares.length && req.fromBeforeTake &&
        (req.fromFile || req.fromRank)) {
      return req.fromFile || req.fromRank;
    }
    return null;
  }

  function saysCheck(raw) {
    var toks = wordsOf(raw);
    for (var i = 0; i < toks.length; i++) {
      if (CHECK_WORDS[toks[i]]) return true;
    }
    return false;
  }

  // Was MATE spoken, as opposed to mere check (v116). The
  // pair "check me" counts: it is how Safari spelled
  // checkmate three times in game20's mating sequence.
  function saysMate(raw) {
    var toks = wordsOf(raw);
    for (var i = 0; i < toks.length; i++) {
      if (MATE_WORDS[toks[i]]) return true;
      if ((toks[i] === "check" || toks[i] === "checks") &&
          toks[i + 1] === "me") return true;
    }
    return false;
  }

  // A LONE PIECE NAME, offered as the answer to an open
  // question (v116). Used by the pending yes/no chain and
  // by the strict prompt's suffix repair; both only look
  // here AFTER a question has been asked, so ordinary talk
  // never reaches this.
  //
  // A reading qualifies when every word is a piece name,
  // filler, or a yes-word ("yes, knight"), and all the
  // piece names agree. Words of six letters or more ending
  // in "ship" read as bishop: game20 answered "Bishop" to
  // "say queen, or bishop" and Safari returned
  // "Relationship | Leadership" (17:49), which parsed as
  // nothing. The suffix rule lives ONLY here, in answer
  // position, so a stray "relationship" in conversation
  // still cannot grow a piece.
  function answerPieceOf(transcripts) {
    for (var i = 0; i < transcripts.length; i++) {
      var toks = wordsOf(transcripts[i]);
      if (!toks.length) continue;
      var found = null, ok = true;
      for (var j = 0; j < toks.length; j++) {
        var t = toks[j], p = null;
        if (PIECES[t]) p = PIECES[t];
        else if (t.length >= 6 && /ship$/.test(t)) p = "b";
        else if (FILLER[t] || YES_WORDS[t]) continue;
        else { ok = false; break; }
        if (found && found !== p) { ok = false; break; }
        found = p;
      }
      if (ok && found) return found;
    }
    return null;
  }

  /* ---- Spoken questions about the position ---- 
   * Reads out what is already on the screen. No evaluation of
   * any kind: these answer "what is where", never "what should
   * I play". */

  var THEIR_WORDS = { their: 1, theirs: 1, they: 1, them: 1, his: 1, her: 1,
    hers: 1, opponent: 1, opponents: 1 };
  var MY_WORDS = { my: 1, mine: 1, me: 1, i: 1, our: 1, ours: 1 };

  var COLOR_WORDS = { white: "w", whites: "w", black: "b", blacks: "b" };

  function classifyQuery(raw) {
    var toks = wordsOf(raw);
    var i, t;
    var has = function (w) { return toks.indexOf(w) >= 0; };

    // "turn" on its own used to be enough, so any sentence
    // containing the word was answered: "maybe at some
    // point it'll turn off" got "black to move, move 6".
    // Now it must either be asked as a question or be
    // short enough to be one.
    if (has("turn") || has("turns")) {
      var asked = has("whose") || has("whos") || has("who") ||
                  has("which") || has("what") || has("its") ||
                  has("is");
      // their/your joined the strip list in v65: "their
      // turn" and "your turn" carried one content word each
      // and fell through to "I didn't catch a move" (game3,
      // 15:34:52). Possessives around "turn" are part of
      // the question, never part of a move.
      var content = toks.filter(function (w) {
        return !FILLER[w] && w !== "turn" && w !== "turns" &&
               w !== "whose" && w !== "whos" && w !== "who" &&
               w !== "which" && w !== "what" && w !== "its" &&
               w !== "their" && w !== "theirs" &&
               w !== "your" && w !== "yours";
      });
      if (asked ? content.length <= 1 : content.length === 0) {
        return { kind: "turn" };
      }
      return null;
    }

    /* whose pieces: an explicit color beats "my"/"their", which
     * beats mine */
    var color = null;
    for (i = 0; i < toks.length; i++) {
      if (COLOR_WORDS[toks[i]]) { color = COLOR_WORDS[toks[i]]; break; }
    }
    if (!color) {
      for (i = 0; i < toks.length; i++) {
        if (THEIR_WORDS[toks[i]]) {
          color = api.myColor === "w" ? "b" : "w"; break;
        }
        if (MY_WORDS[toks[i]]) { color = api.myColor || "w"; break; }
      }
    }
    if (!color) color = api.myColor || "w";

    if (has("where")) {
      for (i = 0; i < toks.length; i++) {
        t = PIECES[toks[i]];
        if (t) return { kind: "where", piece: t, color: color };
      }
      return null;
    }

    if (has("what") || has("whats") || has("which") || has("occupies")) {
      var req = parseTranscript(raw);
      if (req.squares.length) return { kind: "square", sq: req.squares[0] };
    }
    return null;
  }

  var PIECE_NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook",
                     q: "queen", k: "king" };
  var PIECE_PLURAL = { p: "pawns", n: "knights", b: "bishops", r: "rooks",
                       q: "queens", k: "king" };

  function pieceColorAt(ch) { return ch === ch.toUpperCase() ? "w" : "b"; }

  function scanBoard(type, color) {
    var out = [];
    for (var r = 7; r >= 0; r--) {
      for (var f = 0; f < 8; f++) {
        var ch = api.pos.board[r * 16 + f];
        if (!ch) continue;
        if (type && ch.toLowerCase() !== type) continue;
        if (color && pieceColorAt(ch) !== color) continue;
        out.push({ sq: RULES.sqName(r * 16 + f), ch: ch });
      }
    }
    return out;
  }

  function joinSpoken(list) {
    if (!list.length) return "none";
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(", ") + ", and " + list[list.length - 1];
  }

  function colorWord(c) { return c === "w" ? "white" : "black"; }

  function answerQuery(q) {
    if (!api.pos) { speak("No game loaded."); return; }
    if (api.over) { speak("The game is over."); return; }

    if (q.kind === "turn") {
      var n = Math.floor(api.moves.length / 2) + 1;
      speak(colorWord(api.pos.turn) + " to move, move " + n + ".");
      return;
    }

    if (q.kind === "square") {
      var ch = api.pos.board[RULES.nameSq(q.sq)];
      if (!ch) { speak(spokenSquare(q.sq) + " is empty."); return; }
      speak(spokenSquare(q.sq) + " has a " + colorWord(pieceColorAt(ch)) +
            " " + PIECE_NAME[ch.toLowerCase()] + ".");
      return;
    }

    if (q.kind === "where") {
      var found = scanBoard(q.piece, q.color);
      var side = colorWord(q.color);
      if (!found.length) {
        speak("No " + side + " " + PIECE_PLURAL[q.piece] + " left.");
        return;
      }
      speak(side + " " + (found.length === 1 ? PIECE_NAME[q.piece]
                                             : PIECE_PLURAL[q.piece]) + " on " +
            joinSpoken(found.map(function (x) { return spokenSquare(x.sq); })) + ".");
      return;
    }
  }

  function describeReq(req) {
    if (req.castle) return "castle:" + req.castle;
    // The half-square field carries BOTH halves now (w41):
    // "charlie takes delta" prints "- x - c>d -", the same
    // from>to shape the square field uses, so a pasted log
    // still shows which end of the move each one was.
    var half = (req.fromFile || "") + (req.fromRank || "");
    var target = (req.toFile || "") + (req.toRank || "");
    return [req.piece || "-", req.capture ? "x" : "-",
            req.squares.join(">") ||
              (req.victim ? "<" + req.victim + ">" : "-"),
            (half + (target ? ">" + target : "")) || "-",
            req.trailingPiece || "-"].join(" ");
  }

