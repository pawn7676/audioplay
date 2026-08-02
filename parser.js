/*  audioplay-web — parser.js
 *  Read the app.js header first: it carries the project
 *  story, the hard constraints, and the file map.
 *
 *  This file is sections 3-6 of the userscript, ported
 *  verbatim: VOCABULARY, PARSING, MATCHING AND RANKING,
 *  and DIALOGUE, with handleTranscripts as the entry
 *  point the mic (speech.js) calls. It is the most-edited
 *  code in the project, which is why it lives alone.
 *
 *  Tested in node by loading this file with log, speak,
 *  api, RULES and the silent-mode stubs provided by the
 *  harness, then driving handleTranscripts with real
 *  transcripts from game logs. The property test (no bare
 *  square can ever produce a piece move or a capture)
 *  runs against this same file.
 *
 *  House rules, unchanged: comment lines are kept to 70
 *  characters so they read on an iPad, and NOTHING is
 *  added to the vocabulary tables speculatively — every
 *  entry came from a real mishearing in a real log.
 *
 *  The numbered section headers keep their userscript
 *  numbers (3, 4, 5, 6) so that log dumps, the version
 *  history and old conversations stay unambiguous.
 */

  /*-------------------- settings for this file --------------------*/

  // ask yes/no when a phrase matches >1 move
  var CONFIRM_AMBIGUOUS = true;

  // Your own move read back in full once Lichess accepts
  // it ("knight foxtrot 3.") — ON since v70 as the chosen
  // move confirmation: unlike the chimes it is never lost,
  // and unlike the flat "ok." of v67-68 it varies with
  // every move and confirms WHAT was played. At w2 the
  // single constant became PER-MODE: the two accept sites
  // below ask readBackMyMove() (modes.js), which answers
  // from the settings panel — voice only defaults ON,
  // clock mode defaults OFF (the turn flip on the visible
  // clocks already confirms the move). "repeat" always
  // works either way.

  // Safari sometimes clips the first word, so that "knight
  // foxtrot three" arrives as "foxtrot three", with the
  // full version further down the alternatives. When one
  // reading is another with its leading piece name removed,
  // the fuller one is ranked first.
  //
  // It is only ever RANKED first, never played unasked. A
  // move is irreversible, so anything uncertain is put as a
  // question BEFORE it is sent, never announced after.
  //
  // To sidestep the guesswork entirely, name the pawn:
  // "pawn foxtrot three" can only be f3.
  var PREFER_FULLER_READING = true;

  // A bare square is interpreted as a pawn push, which is
  // correct unless Safari has dropped the piece name
  // from the reading: "rook echo four" arriving as plain
  // "echo four" would push the e-pawn. However, if a piece
  // could also legally reach the same square, then the pawn
  // push is confirmed first: "did you mean echo four? yes
  // or no". Answering "no" then walks through the piece
  // moves to that square. A pawn push to a square that no
  // piece could move to still plays instantly, so most
  // pawn moves cost nothing extra. Saying "pawn echo four"
  // skips the question, since the piece was named. Naming a
  // promotion ("golf one equals knight") also skips it:
  // only a pawn can promote, so the pawn was named too. In
  // game3 the guard still asked about Bg1 after "g1 equals
  // knight" had ruled every bishop move out; fixed in v65.
  //
  // Since v71 the same guard covers bare pawn CAPTURES:
  // "takes f3" with neither a piece nor the from-file
  // named, when a piece could also capture f3, is confirmed
  // first ("queen takes f3" heard as "takes f3" cost
  // game6). "golf takes f3" names the file and plays at
  // once, exactly as "pawn e4" does for pushes.
  // Set false to always play bare pawn moves at once.
  var GUARD_PAWN_PUSHES = true;

  // true asks "did you mean ...? yes or no" before EVERY
  // move, not only ambiguous ones. Slower, but nothing is
  // ever sent without being read back first.
  var CONFIRM_ALL_MOVES = false;
  // Spoken "ok." after each accepted move. OFF since v69:
  // it wore thin fast in game5 ("really hated the OK, got
  // super annoying"). Confirmation is the full move
  // read-back now, see READ_BACK_MY_MOVE above. Sound is a
  // settled question, and the answer is speech; the whole
  // history is in the section 8 tombstone and the handoff:
  // the script's own chimes died to iOS (v68), and driving
  // Lichess's own move sounds instead (v69) was built and
  // reverted the same day, because they are WebAudio too
  // and vanish with the screen off, which is the one
  // condition this script exists for.
  var SPOKEN_OK = false;

  /*======================== 3. VOCABULARY =========================*/

  var NATO = {
    alpha: "a", alfa: "a", alpher: "a", ay: "a", eh: "a", apple: "a",
      elsa: "a", alsa: "a", ilsa: "a", alka: "a", alba: "a", elba: "a",
      alva: "a", ulta: "a", olfa: "a", alfalfa: "a", adam: "a",
    bravo: "b", brava: "b", bravos: "b", bravado: "b", be: "b", bee: "b",
      // beta agrees with NATO on b, so it opens no Greek
      // door; it cost five retries at Bb1 in game4
      beta: "b",
    charlie: "c", charley: "c", charly: "c", charlee: "c", shirley: "c",
      sharlie: "c", sea: "c", see: "c",
    delta: "d", deltas: "d", dealt: "d", delt: "d", de: "d", dee: "d",
    echo: "e", ecko: "e", eco: "e", eggo: "e", echoes: "e", aiko: "e",
    foxtrot: "f", foxtrots: "f", foxtrott: "f", foxdrop: "f", fox: "f",
      ef: "f", eff: "f",
    golf: "g", golfs: "g", gulf: "g", gold: "g", goal: "g", gee: "g",
    hotel: "h", hotels: "h", hotell: "h", motel: "h", aitch: "h", age: "h"
  };
  var NUMS = {
    one: "1", won: "1", wan: "1", juan: "1", wun: "1",
    two: "2", too: "2", tu: "2", tue: "2", tew: "2", tube: "2",
    three: "3", tree: "3", free: "3", thee: "3",
    four: "4", "for": "4", fore: "4", ford: "4", forth: "4", fourth: "4",
      foure: "4", forde: "4",
    five: "5", hive: "5", fife: "5", fiv: "5",
    six: "6", sex: "6", sicks: "6", seeks: "6", sics: "6",
    seven: "7", heaven: "7", sevin: "7", sevan: "7",
    eight: "8", ate: "8", hate: "8", ait: "8", eighth: "8"
  };
  var PIECES = {
    king: "k", kings: "k", kin: "k",
    queen: "q", queens: "q", green: "q", quean: "q", creed: "q",
    quinn: "q",
    rook: "r", rooks: "r", rock: "r", rocks: "r", brook: "r", ruck: "r",
      roof: "r", rooke: "r", brooke: "r",
    bishop: "b", bishops: "b", bishoff: "b", bishup: "b",
      fish: "b", fisher: "b", fishop: "b", ship: "b", bish: "b",
    knight: "n", knights: "n", night: "n", nights: "n", nite: "n",
    pawn: "p", pawns: "p", prawn: "p", pond: "p", palm: "p", porn: "p",
      ponte: "p", ponta: "p", pote: "p", potes: "p", pons: "p",
      poon: "p", paun: "p", poan: "p", ponn: "p", pawnd: "p",
      born: "p", pon: "p"
  };
  // Safari runs a piece name into the file that follows it:
  // "rook e one" comes back as "rookie one", where "rook
  // e" has fused into a single word. Splitting these back
  // into their parts is the only way to recover the move.
  var COMPOUND = {
    rookie: [["piece", "r"], ["file", "e"]],
    rookies: [["piece", "r"], ["file", "e"]],
    rooky: [["piece", "r"], ["file", "e"]],
    bishopy: [["piece", "b"], ["file", "e"]],
    knightie: [["piece", "n"], ["file", "e"]]
  };

  var TAKE_WORDS = { takes: 1, take: 1, taking: 1, tates: 1, tanks: 1,
    captures: 1, capture: 1, capturing: 1, x: 1, times: 1, "\u00d7": 1 };
  var CASTLE_WORDS = { castle: 1, castles: 1, castling: 1, cassel: 1,
    cattle: 1, castel: 1, hassle: 1 };
  // whose/whos/who/which joined in v65 so that "whose time
  // is it" reaches the clock and "whose turn" the turn
  // answer, instead of counting as unknown words. Filler is
  // consumed before the fuzzy matcher runs, so none of them
  // can be bent into part of a move.
  var FILLER = { please: 1, move: 1, moves: 1, play: 1, plays: 1, the: 1,
    piece: 1, um: 1, uh: 1, then: 1, and: 1, go: 1, goes: 1, on: 1, my: 1,
    is: 1, it: 1, to: 1, into: 1, onto: 1, how: 1, much: 1, many: 1,
    left: 1, remaining: 1, whats: 1, hows: 1, got: 1, have: 1, has: 1,
    do: 1, does: 1, me: 1, we: 1, us: 1, i: 1,
    whose: 1, whos: 1, who: 1, which: 1 };

  var YES_WORDS = { yes: 1, yeah: 1, yep: 1, yup: 1, correct: 1, right: 1,
    confirm: 1, confirmed: 1, affirmative: 1, ok: 1, okay: 1, sure: 1, aye: 1 };
  var NO_WORDS = { no: 1, nope: 1, wrong: 1, negative: 1, next: 1, nah: 1 };
  var CANCEL_WORDS = { cancel: 1, nevermind: 1, forget: 1, stop: 1, abort: 1 };
  var REPEAT_WORDS = { repeat: 1, again: 1, pardon: 1, what: 1, say: 1 };
  var CLOCK_WORDS = { clock: 1, clocks: 1, time: 1, timer: 1 };
  var FLIP_WORDS = { flip: 1, flips: 1, swap: 1, swaps: 1,
    switch: 1, reverse: 1, mirror: 1 };
  var RESIGN_WORDS = { resign: 1, resigns: 1, surrender: 1 };
  var DRAW_WORDS = { draw: 1 };
  // Only as the FIRST word of an utterance: everything after
  // it goes to the log untouched. The keyword was "note"
  // through v67, but Safari kept hearing it as "no" (and
  // "no" as "note"), a collision with the most loaded
  // answer word in the grammar; "memo" shares a sound with
  // nothing that matters. The early exit in
  // handleTranscripts keeps memos from ever reaching the
  // parser.
  var MEMO_WORDS = { memo: 1, memos: 1 };

  // Which reading, if any, is a memo. All alternatives are
  // scanned, not just the primary: in game4 (19:02:38) a
  // note arrived primarily as "No the actual clocks..."
  // with the real reading second, and was dropped. The memo
  // word must open the reading, and the reading must be
  // longer than one word, so a stray one-word alternative
  // can never swallow an answer to a pending question.
  function memoTranscript(transcripts) {
    for (var i = 0; i < transcripts.length; i++) {
      var toks = wordsOf(transcripts[i]);
      if (toks.length > 1 && MEMO_WORDS[toks[0]]) return transcripts[i];
    }
    return null;
  }

  // "flip clock" (or "swap clocks", "switch the clock")
  // swaps which side of the screen your clock is on. As
  // strict as its neighbours: a flip word AND a clock word,
  // and any other content word disqualifies. It cannot
  // collide with bare "clock", which needs no other content
  // word at all. It is the ONLY spoken clock-screen command
  // (v98) — see the tombstone for what it replaced.
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


  // Saying "check" or "mate" narrows things down: it is the
  // difference between dxe7 and Rxe7+. Without this the
  // wrong one gets offered first and needs a no, then a yes.
  // Words that describe a move rather than form part of
  // one. They narrow the candidates when spoken inside a
  // move, and are barred from fuzzy matching: "mate" is one
  // edit from "hate", a homophone of rank 8, which used to
  // add a phantom from-rank and kill the match.
  //
  // Said on their own they need no special handling. The
  // stray-talk rule already ignores anything with no move
  // in it while the opponent is thinking, and on your own
  // turn "I did not catch a move" is the right answer: it
  // means the move itself never landed.
  var CHECK_WORDS = { check: 1, checks: 1, checked: 1, mate: 1,
    checkmate: 1, "check-mate": 1, mates: 1 };

  // Ordinary words sit one edit from vocabulary words and
  // were being converted silently: "good" became "gold", a
  // golf homophone, and "lord" became "ford", a four
  // homophone. Both invent a move component out of ordinary
  // speech. These are never guessed at. To disable this
  // guard, empty the list and delete the FUZZY_NEVER line
  // in fuzzyToken, in section 4.
  var FUZZY_NEVER = {
    lord: 1, load: 1, word: 1, ward: 1, cord: 1, form: 1,
    good: 1, goods: 1, gone: 1, going: 1, cold: 1, hold: 1,
    told: 1, sold: 1, bold: 1, fold: 1, food: 1, wood: 1,
    hood: 1, mood: 1, door: 1, does: 1, done: 1, some: 1,
    same: 1, come: 1, time: 1, like: 1, make: 1, made: 1,
    more: 1, most: 1, that: 1, this: 1, than: 1, them: 1,
    they: 1, then: 1, what: 1, when: 1, were: 1, well: 1,
    will: 1, with: 1, here: 1, hear: 1, near: 1, year: 1,
    your: 1, yeah: 1, have: 1, give: 1, live: 1, love: 1,
    over: 1, only: 1, just: 1, must: 1, back: 1, been: 1,
    best: 1, nice: 1, mine: 1, name: 1, note: 1, wait: 1,
    want: 1, damn: 1, hell: 1, crap: 1, oops: 1
  };

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
  // In game3 "who's turn" fell through to "I didn't catch a
  // move" because the apostrophe survived tokenising.
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

  /* ---- Answers to an on-screen numbered list (silent mode) ----
   *
   * The escape vocabulary was chosen by phonetic distance from
   * the digits, not by natural phrasing, because a misheard
   * answer PLAYS A MOVE:
   *
   *   - bare "none" is REFUSED, never accepted as cancel. It
   *     is one soft consonant from "one", and one clipped
   *     opening syllable turns it INTO "one" — the exact
   *     failure the clipped-reading machinery exists for.
   *     Saying it gets a correction on screen, nothing more.
   *   - "none of these" is fine: clipped, it leaves "of
   *     these", which still cancels and can never be a digit.
   *   - "never mind" clipped leaves "mind", which collides
   *     with nothing, so bare "mind" also cancels.
   *   - a digit and a cancel word in ONE utterance is
   *     ambiguous and re-asks. Nothing is ever guessed at.
   *   - the digit must be essentially the whole utterance:
   *     a digit inside a sentence is stray talk (the mic is
   *     open to the whole room, and "one" from a television
   *     must not play a move). Yes-words and the neutral
   *     "number"/"option" survive as prefixes, so "okay two"
   *     works, matching the header's advice to open with a
   *     throwaway word that absorbs iOS's clipping.
   *
   * Returns {kind:"pick",idx,raw} | {kind:"cancel",raw} |
   * {kind:"bare-none",raw} | {kind:"ambiguous",why,raw} |
   * null (nothing answer-like: caller ignores, list stays up).
   */
  function classifyListAnswer(transcripts, count) {
    for (var i = 0; i < transcripts.length; i++) {
      var r = classifyListAnswerOne(transcripts[i], count);
      if (r) return r;
    }
    return null;
  }

  function classifyListAnswerOne(raw, count) {
    var toks = wordsOf(raw);
    var digits = {}, cancel = 0, none = 0, these = 0, ofw = 0,
        mind = 0, other = 0;
    toks.forEach(function (t) {
      if (NUMS[t]) digits[NUMS[t]] = 1;
      else if (/^[1-8]$/.test(t)) digits[t] = 1;
      else if (CANCEL_WORDS[t]) cancel++;
      else if (t === "none") none++;
      else if (t === "these" || t === "those" || t === "this") these++;
      else if (t === "of") ofw++;
      else if (t === "never" || t === "no") { /* pairs with mind;
        bare "no" alone is handled by the caller */ }
      else if (t === "mind") mind++;
      else if (t === "number" || t === "option") { /* neutral */ }
      else if (YES_WORDS[t]) { /* neutral prefix: "okay two" */ }
      else if (!FILLER[t]) other++;
    });
    var dk = Object.keys(digits);
    var cancelish = cancel || (none && these) || (ofw && these) || mind;
    if (!dk.length && !cancelish && !none) return null;
    if (other) return null;   // embedded in real talk: not an answer
    if (dk.length && cancelish) {
      return { kind: "ambiguous", raw: raw,
               why: "heard a number and a cancel word" };
    }
    if (dk.length > 1) {
      return { kind: "ambiguous", raw: raw,
               why: "heard more than one number" };
    }
    if (dk.length === 1) {
      var d = parseInt(dk[0], 10);
      if (d >= 1 && d <= count) return { kind: "pick", idx: d - 1, raw: raw };
      return { kind: "ambiguous", raw: raw, why: "there is no option " + d };
    }
    if (cancelish) return { kind: "cancel", raw: raw };
    return { kind: "bare-none", raw: raw };
  }

  function parseTranscript(raw) {
    var toks = wordsOf(raw);
    var req = { castle: null, piece: null, capture: false, squares: [],
                fromFile: null, fromRank: null, trailingPiece: null,
                promoKw: false };
    var syms = [], i, tk;
    for (i = 0; i < toks.length; i++) {
      tk = toks[i];
      if (CASTLE_WORDS[tk]) { req.castle = "?"; continue; }
      if (tk === "kingside" || tk === "short") { req.castle = "k"; continue; }
      if (tk === "queenside" || tk === "long") { req.castle = "q"; continue; }
      if (tk === "side") continue;
      if (tk === "promote" || tk === "promotes" || tk === "promotion" ||
          tk === "equals" || tk === "equal") { syms.push({ t: "promo-kw" }); continue; }
      if (tk === "to" && syms.length && syms[syms.length - 1].t === "promo-kw") continue;
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
      var fz = fuzzyToken(tk);
      if (fz) {
        log("PRS", "near-miss \"" + tk + "\" read as \"" + fz.w + "\"");
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
      if (s.t === "take") { req.capture = true; continue; }
      if (s.t === "piece") {
        if (afterPromoKw || req.squares.length) req.trailingPiece = s.v;
        else req.piece = s.v;
        continue;
      }
      if (s.t === "file") {
        if (i + 1 < syms.length && syms[i + 1].t === "rank") {
          req.squares.push(s.v + syms[i + 1].v);
          i++;
        } else req.fromFile = s.v;
        continue;
      }
      if (s.t === "rank") req.fromRank = s.v;
    }
    return req;
  }

  function reqIsEmpty(req) { return !req.castle && !req.squares.length; }

  function saysCheck(raw) {
    var toks = wordsOf(raw);
    for (var i = 0; i < toks.length; i++) {
      if (CHECK_WORDS[toks[i]]) return true;
    }
    return false;
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
    if (!api.pos) { speak("no game loaded."); return; }
    if (api.over) { speak("the game is over."); return; }

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
        speak("no " + side + " " + PIECE_PLURAL[q.piece] + " left.");
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
    return [req.piece || "-", req.capture ? "x" : "-",
            req.squares.join(">") || "-",
            (req.fromFile || "") + (req.fromRank || "") || "-",
            req.trailingPiece || "-"].join(" ");
  }

  /*=================== 5. MATCHING AND RANKING ====================*/

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
   * "did you mean ...? yes or no". Nothing is ever sent to
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
      if (reqIsEmpty(req)) return;
      var namedPiece = !!req.piece;
      findMoves(pos, req).forEach(function (m) {
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
      // fused words split the same way the parser splits them
      if (COMPOUND[tk]) {
        COMPOUND[tk].forEach(function (pair) {
          out.push((pair[0] === "piece" ? "p" : "f") + pair[1]);
        });
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
    if (!PREFER_FULLER_READING) return out;
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
  // named flag in collectCandidates). See GUARD_PAWN_PUSHES
  // in the config.
  function bareGuardCands(c) {
    if (!GUARD_PAWN_PUSHES) return null;
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

  /*========================= 6. DIALOGUE ==========================*/

  // practice mode: nothing is ever sent to Lichess
  var dryRun = false;

  var pending = null;        // { cands: [{m,san}], idx }
  var confirmAction = null;  // key into CONFIRMS

  // THE PIECE QUESTION IS ANSWERABLE (v92). When a bare
  // square can only be reached by a piece, section 6 says
  // so and names the pieces — "no pawn can go there. say
  // queen, king or bishop." Through v91 that question had
  // nowhere to land: the branch spoke and returned, so the
  // square was gone, and the one-word answer arrived as a
  // request with no square at all. reqIsEmpty counts that
  // as nothing heard, so game11 answered "Bishop" exactly
  // as asked and got "I didn't catch a move. say again."
  // CONFIRMED in practice: "echo two" after 1.e4 raises the
  // question, and "Night" plays Ne2 with no yes/no. That
  // position is the standing test — e2 is unreachable by
  // any pawn and reachable by three pieces.
  // A prompt must be able to receive its own answer.
  // The square is kept here with the ply it was asked at,
  // so it expires by itself the moment the position moves
  // on and no clearing is needed anywhere else.
  var pieceAsk = null;       // { moves, ply, capture, sq }

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
    speakWhenAudioSettled("practice mode. you are white.");
  }

  function dryOpponentReply() {
    if (!dryRun || api.over) return;
    var legal = api.pos.legalMoves();
    if (!legal.length) {
      api.over = true;
      speak("practice game over.");
      return;
    }
    var m = legal[Math.floor(Math.random() * legal.length)];
    var san = api.pos.sanOf(m);
    var uci = api.pos.uciOf(m);
    api.pos.apply(m);
    api.moves.push(uci);
    api.lastSan = san; api.lastSanB = san;
    log("DRY", "opponent plays random legal move " + uci + " = " + san);
    if (!silentModeOn()) speak(sanToSpeech(san) + ".");
    if (!api.pos.legalMoves().length) {
      api.over = true;
      speak("practice game over.");
    }
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
      // in silent mode the lower-right quadrant IS the
      // read-back: the move appears there, and the info
      // area under it is cleared of any finished dialogue
      if (silentModeOn()) silentClearFinishedDialogue();
      else if (readBackMyMove()) speak(sanToSpeech(c.san));
      else if (SPOKEN_OK) speak("ok.");
      setTimeout(dryOpponentReply, 1600);
      return;
    }

    postMove(uci).then(function (r) {
      busy = false;
      var ok = r.status === 200 && r.body && r.body.ok !== false && !r.body.error;
      log("PST", uci + " -> " + r.status + " " + JSON.stringify(r.body).slice(0, 120));
      if (ok) {
        // spoken, because speech is the one channel iOS
        // never dropped: see SPOKEN_OK in section 1. In
        // silent mode the quadrant shows the move itself,
        // so the read-back is redundant, not rerouted.
        // THIS RESOLVES LATE (v91). The gameState event for
        // the same move usually arrives before this promise
        // does — on the mating move, always — so the clear
        // below can land after something more important has
        // already been written. It must never stomp it.
        // The same lateness is why api.over silences the
        // read-back (v95): on the mating move game13 heard
        // "checkmate. white wins." and THEN "queen takes
        // gawlf 7, checkmate", learning the result before
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
        // first, so it is never read back at all.
        if (silentModeOn()) silentClearFinishedDialogue();
        else if (api.over || /#$/.test(c.san)) {
          /* the result line says it, and says it better */
        }
        else if (readBackMyMove()) speak(sanToSpeech(c.san));
        else if (SPOKEN_OK) speak("ok.");
      } else {
        var msg = (r.body && r.body.error) ? String(r.body.error) : ("error " + r.status);
        speak("Lichess rejected that move. " + msg);
      }
    }).catch(function (e) {
      busy = false;
      log("ERR", "post: " + e.message);
      speak("could not reach Lichess.");
    });
  }

  // Selection by content, the second channel when the mic is
  // being difficult with digits: while a list is up, a lone
  // piece word ("knight") picks the only listed move by that
  // piece. It is self-confirming — a misheard piece name
  // almost always matches nothing rather than the wrong
  // entry — and it reuses vocabulary the parser already has.
  function pieceListPick(transcripts, cands) {
    for (var i = 0; i < transcripts.length; i++) {
      var toks = wordsOf(transcripts[i]).filter(function (t) {
        return !FILLER[t] && !YES_WORDS[t];
      });
      if (toks.length !== 1 || !PIECES[toks[0]]) continue;
      var p = PIECES[toks[0]];
      var hit = cands.filter(function (c) { return c.m.piece === p; });
      if (hit.length === 1) return { cand: hit[0], raw: transcripts[i] };
    }
    return null;
  }

  // The silent-mode counterpart of the yes/no walk below:
  // one numbered list, answered in one breath. The raw
  // transcript of every accepted answer is logged, so the
  // game logs show which phrasings the mic transcribes
  // cleanly and which arrive mangled — the same loop that
  // drove the earlier vocabulary fixes.
  function handleListAnswer(transcripts) {
    var ans = classifyListAnswer(transcripts, pending.cands.length);
    if (ans) {
      if (ans.kind === "pick") {
        log("LST", "picked " + (ans.idx + 1) + " (heard \"" +
            ans.raw + "\")");
        acceptMove(pending.cands[ans.idx]);
        return;
      }
      if (ans.kind === "cancel") {
        log("LST", "cancelled (heard \"" + ans.raw + "\")");
        pending = null;
        silentSetInfo(["cancelled. say the move again."]);
        return;
      }
      if (ans.kind === "bare-none") {
        // refused on purpose: "none" is one clipped
        // syllable from "one" — see classifyListAnswer
        log("LST", "bare \"none\" refused (heard \"" + ans.raw + "\")");
        silentSetInfo(silentListLines().concat(
          ["", "say cancel, or none of these."]));
        return;
      }
      log("LST", "ambiguous: " + ans.why + " (heard \"" +
          ans.raw + "\")");
      silentSetInfo(silentListLines().concat(
        ["", ans.why + " \u2014 say one number, or cancel."]));
      return;
    }
    var pk = pieceListPick(transcripts, pending.cands);
    if (pk) {
      log("LST", "picked by piece (heard \"" + pk.raw + "\")");
      acceptMove(pk.cand);
      return;
    }
    var cmd = classifyCommand(transcripts[0] || "");
    if (pending.cands.length === 1) {
      // a one-entry list is really the old yes/no question,
      // so yes and no keep working on it
      if (cmd === "yes") { acceptMove(pending.cands[0]); return; }
      if (cmd === "no" || cmd === "cancel") {
        pending = null;
        silentSetInfo(["that was the only legal fit.",
                       "say the whole move again."]);
        return;
      }
    } else if (cmd === "yes" || cmd === "no") {
      // yes/no against a multi-entry list answers nothing:
      // point at the numbers instead of guessing
      silentSetInfo(silentListLines().concat(["", "say the number."]));
      return;
    }
    // a full re-say replaces the list, same as the voice flow
    var re = collectCandidates(api.pos, transcripts);
    if (re.length === 1) {
      var g = bareGuardCands(re[0]);
      if (g) { pending = { cands: g, idx: 0 }; presentPendingList(); return; }
      acceptMove(re[0]);
      return;
    }
    if (re.length > 1) {
      pending = { cands: re, idx: 0 };
      presentPendingList();
      return;
    }
    // stray talk. The list is not ephemeral like speech: it
    // is still on screen, so nothing needs re-asking.
    log("LST", "ignored, not an answer");
  }

  function askCandidate() {
    // in silent mode the alternatives are not walked one
    // yes/no at a time: they all go on screen at once as a
    // numbered list (section 16), answered in one utterance
    if (silentModeOn()) { presentPendingList(); return; }
    if (!pending || pending.idx >= pending.cands.length) {
      // "no" to a one-entry list deserves the truth: there
      // was nothing else it could have been. Game7 rejected
      // a correct Qxf7 repair expecting to hear
      // alternatives, and "no more options" read as a
      // malfunction rather than the answer.
      var lone = pending && pending.cands.length === 1;
      pending = null;
      speak(lone
        ? "that was the only legal move fitting what I " +
          "heard. say the whole move again."
        : "no more options. say the whole move again.");
      return;
    }
    var c = pending.cands[pending.idx];
    speak("did you mean " + sanToSpeech(c.san) + "? yes or no.");
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
    } else speak("no clock information.");
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
  // separates them with pieceAskOpen. A named PAWN is
  // never a fit: the question exists because no pawn can.
  function pieceAskAnswer(req) {
    if (!pieceAskOpen(req)) return null;
    var ms;
    if (req.piece && req.piece !== "p") {
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

  function repeatLast() {
    // In silent mode the answer is the quadrant itself, so
    // "repeat" gives the screen back rather than saying
    // anything: it clears a passing message and shows the
    // move again. With a list up it redraws the list,
    // since that is what the user is being asked about.
    if (silentModeOn()) {
      if (pending) { presentPendingList(); return; }
      silentSetInfo([]);
      return;
    }
    speak(api.lastSan ? "last move: " + sanToSpeech(api.lastSan)
                      : "no move to repeat yet.");
  }

  function handleTranscripts(rawList) {
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
    // memoTranscript in section 4. A pending yes/no
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
      speak("say yes or no.");
      return;
    }

    if (pending) {
      // silent mode answers a numbered list, not a yes/no
      // walk; everything else about pending is unchanged
      if (silentModeOn()) { handleListAnswer(transcripts); return; }
      if (cmd === "yes") { acceptMove(pending.cands[pending.idx]); return; }
      if (cmd === "no") { pending.idx++; askCandidate(); return; }
      if (cmd === "cancel") { pending = null; speak("cancelled. say the move again."); return; }
      var re = collectCandidates(api.pos, transcripts);
      if (re.length === 1) {
        var reGuard = bareGuardCands(re[0]);
        if (reGuard) { pending = { cands: reGuard, idx: 0 };
          askCandidate(); return; }
        acceptMove(re[0]);
        return;
      }
      speak("please say yes or no.");
      var c = pending.cands[pending.idx];
      speak("did you mean " + sanToSpeech(c.san) + "?");
      return;
    }

    if (cmd === "repeat") { repeatLast(); return; }
    if (classifyFlipClock(primary)) { flipClockSides(); return; }
    if (cmd === "clock") { speakClocks(); return; }

    /* Questions about the position work on either side's clock */
    var q = classifyQuery(primary);
    if (q) { log("QRY", q.kind + " " + (q.sq || q.piece || "")); answerQuery(q); return; }

    if (cmd === "resign") { confirmAction = "resign";
      speak("resign the game? yes or no."); return; }
    if (cmd === "draw") { confirmAction = "offerdraw";
      speak("offer a draw? yes or no."); return; }
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
      if (!api.pos) speak("not connected to a game yet.");
      else if (api.over) speak("the game is over.");
      else speak(colorWord(api.pos.turn) + " to move.");
      return;
    }

    var req = parseTranscript(primary);
    log("PRS", describeReq(req));
    var cands = collectCandidates(api.pos, transcripts);
    log("CND", cands.map(function (c) { return c.san; }).join(",") || "(none)");

    if (cands.length === 1 && !CONFIRM_ALL_MOVES) {
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
      pending = { cands: cands, idx: 0 };
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
      var answered = pieceAskAnswer(req);
      if (answered) {
        var acs = answered.map(function (m) {
          return { m: m, san: api.pos.sanOf(m) };
        });
        log("CND", "piece answer: " +
            acs.map(function (c) { return c.san; }).join(","));
        pieceAsk = null;
        // no bare-square guard here: it fires only on pawn
        // moves, and this question is only ever asked about
        // a square no pawn can reach
        if (acs.length === 1 && !CONFIRM_ALL_MOVES) {
          acceptMove(acs[0]);
          return;
        }
        pending = { cands: acs, idx: 0 };
        askCandidate();
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
      if (reqIsEmpty(req)) {
        speak("I didn't catch a move. say again.");
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
        // in the section 6 state block for why it is kept
        askPiece(alt, "no pawn can go there.");
        return;
      }
      speak("that's not a legal move. say again.");
      return;
    }
    if (!CONFIRM_AMBIGUOUS) { acceptMove(cands[0]); return; }
    pending = { cands: cands, idx: 0 };
    askCandidate();
  }

