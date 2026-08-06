  /*========= EMBEDDED CHESS RULES / LEGAL MOVE GENERATOR ==========*/

  /* FROZEN. Verified by perft: startpos depth 4 = 197281,
   * Kiwipete depth 3 = 97862. Re-run both after ANY edit here.
   * Nothing in this section may evaluate, score, search, or
   * recommend: it knows only which moves are LEGAL and what
   * they are CALLED. */

  /* Minimal self-contained chess RULES (0x88 board). No dependencies.
   * This knows which moves are LEGAL and what they are CALLED. It
   * does not evaluate, score, search, or recommend anything. Exposes:
   * Position(startFen?) with .applyUci, .legalMoves, .san, .turn,
   * .isGameOver, .inCheck */
  function makeRules() {
    "use strict";

    var FILES = "abcdefgh";
    var KNIGHT = [33, 31, 18, 14, -33, -31, -18, -14];
    var BISHOP = [17, 15, -17, -15];
    var ROOK = [16, 1, -16, -1];
    var ROYAL = [17, 16, 15, 1, -17, -16, -15, -1];

    /* the two slider families, built once. attacked() used to
     * write these as literals in its own body, so every call
     * allocated two arrays purely to be read twice (w53). */
    var BISHOPQ = ["b", "q"], ROOKQ = ["r", "q"];

    /* Does a slider of one of `types` sit on a clear ray from
     * `sq`? Lifted out of attacked() (w53): it was a closure
     * declared INSIDE the hottest predicate in the program, so
     * a new function object was allocated on every call - and
     * attacked() is called at least once per pseudo-move, which
     * is once per clone, which is a million times in a perft.
     * It closed over sq/by/d/i/p; they are parameters and
     * locals now, which is also why it can be read on its own.
     */
    function raySees(b, sq, by, dirs, types) {
      for (var m = 0; m < dirs.length; m++) {
        var d = dirs[m], i = sq + d;
        while ((i & 0x88) === 0) {
          var p = b[i];
          if (p) {
            if (colorOf(p) === by && types.indexOf(typeOf(p)) >= 0) return true;
            break;
          }
          i += d;
        }
      }
      return false;
    }

    function sqName(i) { return FILES[i & 15] + ((i >> 4) + 1); }
    function nameSq(s) { return (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97); }
    function isWhite(p) { return p && p === p.toUpperCase(); }
    function colorOf(p) { return isWhite(p) ? "w" : "b"; }
    function typeOf(p) { return p ? p.toLowerCase() : null; }
    function onBoard(i) { return (i & 0x88) === 0; }

    var START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    function Position(fen) {
      this.board = new Array(128).fill(null);
      this.turn = "w";
      this.castle = { K: false, Q: false, k: false, q: false };
      this.ep = -1;
      this.half = 0;
      this.full = 1;
      this.load(fen || START);
    }

    Position.prototype.load = function (fen) {
      var parts = fen.trim().split(/\s+/);
      this.board = new Array(128).fill(null);
      var rows = parts[0].split("/");
      for (var r = 0; r < 8; r++) {
        var i = (7 - r) * 16, row = rows[r];
        for (var k = 0; k < row.length; k++) {
          var c = row[k];
          if (/[1-8]/.test(c)) i += parseInt(c, 10);
          else { this.board[i] = c; i++; }
        }
      }
      this.turn = parts[1] === "b" ? "b" : "w";
      var cs = parts[2] || "-";
      this.castle = {
        K: cs.indexOf("K") >= 0, Q: cs.indexOf("Q") >= 0,
        k: cs.indexOf("k") >= 0, q: cs.indexOf("q") >= 0
      };
      this.ep = (parts[3] && parts[3] !== "-") ? nameSq(parts[3]) : -1;
      this.half = parseInt(parts[4] || "0", 10);
      this.full = parseInt(parts[5] || "1", 10);
    };

    /* THE HOTTEST FUNCTION IN THE FILE, and it used to parse a
     * FEN (w53). legalMoves clones once per pseudo-move to test
     * the king - about 35 times per position, and perft alone
     * does it a million times - and every one of those went
     * through new Position(START), which fills a 128-slot array
     * and then splits and regexes the start FEN character by
     * character, before the six lines below overwrite every
     * field it just set. Object.create skips the constructor
     * entirely; the fields are all assigned here anyway, so
     * nothing is left undefined. */
    Position.prototype.clone = function () {
      var p = Object.create(Position.prototype);
      p.board = this.board.slice();
      p.turn = this.turn;
      p.castle = { K: this.castle.K, Q: this.castle.Q, k: this.castle.k, q: this.castle.q };
      p.ep = this.ep; p.half = this.half; p.full = this.full;
      return p;
    };

    Position.prototype.kingSq = function (color) {
      var want = color === "w" ? "K" : "k";
      for (var i = 0; i < 128; i++) {
        if (!onBoard(i)) { i += 7; continue; }
        if (this.board[i] === want) return i;
      }
      return -1;
    };

    /* is square `sq` attacked by side `by` */
    Position.prototype.attacked = function (sq, by) {
      var b = this.board, i, j, p;    /* `d` left with raySees */
      /* pawns */
      var pd = by === "w" ? [-17, -15] : [17, 15];
      for (j = 0; j < 2; j++) {
        i = sq + pd[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "p" && colorOf(p) === by) return true; }
      }
      /* knights */
      for (j = 0; j < 8; j++) {
        i = sq + KNIGHT[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "n" && colorOf(p) === by) return true; }
      }
      /* king */
      for (j = 0; j < 8; j++) {
        i = sq + ROYAL[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "k" && colorOf(p) === by) return true; }
      }
      /* sliders - see raySees, lifted out of here at w53 */
      if (raySees(b, sq, by, BISHOP, BISHOPQ)) return true;
      if (raySees(b, sq, by, ROOK, ROOKQ)) return true;
      return false;
    };

    Position.prototype.inCheck = function (color) {
      var c = color || this.turn;
      var k = this.kingSq(c);
      if (k < 0) return false;
      return this.attacked(k, c === "w" ? "b" : "w");
    };

    /* pseudo-legal move objects:
     * {from,to,piece,color,captured,promotion,flags} */
    Position.prototype.pseudoMoves = function () {
      var out = [], b = this.board, us = this.turn, them = us === "w" ? "b" : "w";
      var self = this;

      function add(from, to, extra) {
        var m = {
          from: from, to: to,
          piece: typeOf(b[from]), color: us,
          captured: b[to] ? typeOf(b[to]) : null,
          promotion: null, flags: ""
        };
        if (extra) for (var k in extra) m[k] = extra[k];
        if (m.captured) m.flags += "c";
        out.push(m);
      }

      for (var from = 0; from < 128; from++) {
        if (!onBoard(from)) { from += 7; continue; }
        var pc = b[from];
        if (!pc || colorOf(pc) !== us) continue;
        var t = typeOf(pc), to, d, j;

        if (t === "p") {
          var fwd = us === "w" ? 16 : -16;
          var startRank = us === "w" ? 1 : 6;
          var lastRank = us === "w" ? 7 : 0;
          to = from + fwd;
          if (onBoard(to) && !b[to]) {
            if ((to >> 4) === lastRank) {
              ["q", "r", "b", "n"].forEach(function (pr) {
                add(from, to, { promotion: pr, flags: "p" });
              });
            } else {
              add(from, to, {});
              var dbl = from + 2 * fwd;
              if ((from >> 4) === startRank && !b[dbl]) add(from, dbl, { flags: "b" });
            }
          }
          var caps = us === "w" ? [17, 15] : [-17, -15];
          for (j = 0; j < 2; j++) {
            to = from + caps[j];
            if (!onBoard(to)) continue;
            if (b[to] && colorOf(b[to]) === them) {
              if ((to >> 4) === lastRank) {
                ["q", "r", "b", "n"].forEach(function (pr) {
                  add(from, to, { promotion: pr, flags: "p" });
                });
              } else add(from, to, {});
            } else if (to === this.ep) {
              out.push({
                from: from, to: to, piece: "p", color: us,
                captured: "p", promotion: null, flags: "ce"
              });
            }
          }
          continue;
        }

        if (t === "n" || t === "k") {
          var offs = t === "n" ? KNIGHT : ROYAL;
          for (j = 0; j < 8; j++) {
            to = from + offs[j];
            if (!onBoard(to)) continue;
            if (b[to] && colorOf(b[to]) === us) continue;
            add(from, to, {});
          }
          continue;
        }

        var dirs = t === "b" ? BISHOP : t === "r" ? ROOK : ROYAL;
        for (j = 0; j < dirs.length; j++) {
          d = dirs[j]; to = from + d;
          while (onBoard(to)) {
            if (!b[to]) { add(from, to, {}); }
            else {
              if (colorOf(b[to]) === them) add(from, to, {});
              break;
            }
            to += d;
          }
        }
      }

      /* castling */
      var kSq = us === "w" ? nameSq("e1") : nameSq("e8");
      var kRight = us === "w" ? this.castle.K : this.castle.k;
      var qRight = us === "w" ? this.castle.Q : this.castle.q;
      var king = b[kSq];
      if (king && typeOf(king) === "k" && colorOf(king) === us && !this.inCheck(us)) {
        if (kRight && !b[kSq + 1] && !b[kSq + 2] &&
            !this.attacked(kSq + 1, them) && !this.attacked(kSq + 2, them)) {
          out.push({ from: kSq, to: kSq + 2, piece: "k", color: us,
                     captured: null, promotion: null, flags: "k" });
        }
        if (qRight && !b[kSq - 1] && !b[kSq - 2] && !b[kSq - 3] &&
            !this.attacked(kSq - 1, them) && !this.attacked(kSq - 2, them)) {
          out.push({ from: kSq, to: kSq - 2, piece: "k", color: us,
                     captured: null, promotion: null, flags: "q" });
        }
      }
      return out;
    };

    /* mutate in place; assumes move is pseudo-legal for current turn
     */
    Position.prototype.apply = function (m) {
      var b = this.board, us = this.turn;
      b[m.to] = m.promotion ? (us === "w" ? m.promotion.toUpperCase() : m.promotion)
                            : b[m.from];
      b[m.from] = null;

      if (m.flags.indexOf("e") >= 0) {
        b[m.to + (us === "w" ? -16 : 16)] = null;
      }
      if (m.flags.indexOf("k") >= 0) {
        b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null;
      }
      if (m.flags.indexOf("q") >= 0) {
        b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null;
      }

      /* castling rights */
      if (m.piece === "k") {
        if (us === "w") { this.castle.K = this.castle.Q = false; }
        else { this.castle.k = this.castle.q = false; }
      }
      var h1 = nameSq("h1"), a1 = nameSq("a1"), h8 = nameSq("h8"), a8 = nameSq("a8");
      if (m.from === h1 || m.to === h1) this.castle.K = false;
      if (m.from === a1 || m.to === a1) this.castle.Q = false;
      if (m.from === h8 || m.to === h8) this.castle.k = false;
      if (m.from === a8 || m.to === a8) this.castle.q = false;

      /* ep square */
      this.ep = (m.flags.indexOf("b") >= 0)
        ? m.from + (us === "w" ? 16 : -16) : -1;

      this.half = (m.piece === "p" || m.captured) ? 0 : this.half + 1;
      if (us === "b") this.full++;
      this.turn = us === "w" ? "b" : "w";
    };

    Position.prototype.legalMoves = function () {
      var self = this, out = [];
      this.pseudoMoves().forEach(function (m) {
        var p = self.clone();
        p.apply(m);
        if (!p.inCheck(m.color)) out.push(m);
      });
      return out;
    };

    Position.prototype.uciOf = function (m) {
      return sqName(m.from) + sqName(m.to) + (m.promotion || "");
    };

    /* SAN with disambiguation and check/mate suffix */
    Position.prototype.sanOf = function (m, legalList) {
      var legal = legalList || this.legalMoves();
      var san;
      if (m.flags.indexOf("k") >= 0) san = "O-O";
      else if (m.flags.indexOf("q") >= 0) san = "O-O-O";
      else {
        var s = "";
        if (m.piece !== "p") {
          s += m.piece.toUpperCase();
          var same = legal.filter(function (o) {
            return o.piece === m.piece && o.to === m.to && o.from !== m.from;
          });
          if (same.length) {
            var sameFile = same.some(function (o) { return (o.from & 15) === (m.from & 15); });
            var sameRank = same.some(function (o) { return (o.from >> 4) === (m.from >> 4); });
            if (!sameFile) s += FILES[m.from & 15];
            else if (!sameRank) s += String((m.from >> 4) + 1);
            else s += sqName(m.from);
          }
        } else if (m.captured) {
          s += FILES[m.from & 15];
        }
        if (m.captured) s += "x";
        s += sqName(m.to);
        if (m.promotion) s += "=" + m.promotion.toUpperCase();
        san = s;
      }
      var after = this.clone();
      after.apply(m);
      if (after.inCheck(after.turn)) {
        san += after.legalMoves().length ? "+" : "#";
      }
      return san;
    };

    /* legalList is optional and is passed by anything that has
     * already generated one (w53) - see applyUci, which used to
     * make the list here and then make it AGAIN inside sanOf. */
    Position.prototype.findUci = function (uci, legalList) {
      var moves = legalList || this.legalMoves();
      for (var i = 0; i < moves.length; i++) {
        if (this.uciOf(moves[i]) === uci) return moves[i];
      }
      /* lichess sends castling as e1g1; some sources use e1h1
       * (chess960 style) */
      for (i = 0; i < moves.length; i++) {
        var m = moves[i];
        if (m.piece === "k" && m.flags.indexOf("k") >= 0 &&
            uci === sqName(m.from) + sqName(m.to + 1)) return m;
        if (m.piece === "k" && m.flags.indexOf("q") >= 0 &&
            uci === sqName(m.from) + sqName(m.to - 2)) return m;
      }
      return null;
    };

    Position.prototype.applyUci = function (uci) {
      /* ONE LIST, USED TWICE (w53). findUci generated the legal
       * moves and threw them away, then sanOf generated the
       * same list again from the same untouched position -
       * doubling the cost of every move replayed from the
       * stream, which is how the board is rebuilt after any
       * reconnect. */
      var moves = this.legalMoves();
      var m = this.findUci(uci, moves);
      if (!m) return null;
      var san = this.sanOf(m, moves);
      this.apply(m);
      return { move: m, san: san };
    };

    Position.prototype.isGameOver = function () {
      return this.legalMoves().length === 0;
    };

    return {
      Position: Position,
      sqName: sqName,
      nameSq: nameSq,
      START: START
    };
  }

