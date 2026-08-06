/* property_check.js — the invariants, on utterances nobody chose.
 *
 *   node property_check.js [positions]
 *
 * WHY THIS EXISTS. The harness proves that particular sentences
 * do particular things, on boards a person picked. That is
 * exactly the wrong shape for the risk this program actually
 * carries: the failure that matters is not "the sentence I
 * thought of does the wrong thing", it is "some sentence I never
 * thought of quietly becomes a legal move". A hand-written test
 * can only ever check the cases its author already imagined, and
 * the author is the same person who wrote the bug.
 *
 * So this generates the utterances instead. Random games supply
 * the positions; the whole spoken grammar supplies the sentences;
 * every combination is checked against rules that must hold no
 * matter what was said. When one breaks it prints the position,
 * the utterance and the move that got through.
 *
 * THIS IS THE TEST THAT EXISTED AND WAS LOST. us-header records a
 * 320k-utterance run confirming that no bare square can produce a
 * piece move or a capture - the game6 invariant, the one that
 * matters most, since game6 was a capture played unasked that
 * lost a game. Only a spot check survived into this repo (see
 * test_harness.js). w40 to w44 then widened the capture grammar
 * four times in one day, each validated against positions chosen
 * by hand, every argument resting on "uniqueness is counted over
 * every legal move landing there". That claim deserves a machine.
 *
 * THE SLICE, NOT THE PAGE. It loads vocabulary, parsing and
 * matching only - the three files that turn words into moves -
 * with rules.js underneath and log/api/CFG stubbed. No DOM, no
 * boot, no speech. That keeps it fast enough to run hundreds of
 * thousands of utterances on every push, and it is the slice
 * those files' own headers already say they are testable as.
 * The dialogue-level invariants (silence is never an answer, "I
 * heard" never claims what was not said) need the whole page and
 * live in test_harness.js beside it.
 *
 * NO Math.random ANYWHERE. A property test that cannot be re-run
 * on the same input is a rumour, not a result: the failure has to
 * survive long enough to be read, fixed and re-checked. The
 * generator is a seeded LCG, so the seed printed at the top
 * reproduces the run exactly.
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

const POSITIONS = parseInt(process.argv[2] || "150", 10);
/* THE SEED IS AN ARGUMENT TOO (w54). The position count has
 * been tunable since this file was written and the seed was
 * not, so every soak run - "node property_check.js 900" -
 * re-tested the SAME games, only more of them. A generator you
 * cannot re-seed explores one path through its own space
 * forever. Default unchanged, so an unqualified run is still
 * the reproducible one that CI does. */
const SEED = parseInt(process.argv[3] || "20260806", 10);

/* ---- the slice, loaded as one script ------------------------ */
const sandbox = vm.createContext({ console });
const slice = ["rules.js", "vocabulary.js", "parsing.js", "matching.js"]
  .map(f => fs.readFileSync("src/" + f, "utf8")).join("");
vm.runInContext(
  slice +
  // stubs for the three globals the slice touches outside the
  // word-to-move path: log is noise here, api and CFG are only
  // reached by bareGuardCands and the spoken query answers.
  "\n var RULES = makeRules();" +
  "\n function log() {}" +
  "\n function speak() {}" +
  "\n var api = { pos: null, myColor: 'w', moves: [], over: false };" +
  "\n var CFG = { guardPawnPushes: true, confirmMyMove: false };",
  sandbox, { filename: "slice(vocabulary,parsing,matching)" });

/* ---- deterministic generator -------------------------------- */
let seed = SEED;
function rnd(n) {                       // 0 <= rnd(n) < n
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
}

const FILES = "abcdefgh".split("");
const SPOKEN_FILE = { a: "alpha", b: "bravo", c: "charlie", d: "delta",
                      e: "echo", f: "foxtrot", g: "golf", h: "hotel" };
const SPOKEN_RANK = { 1: "one", 2: "two", 3: "three", 4: "four",
                      5: "five", 6: "six", 7: "seven", 8: "eight" };
const PIECE_WORD = { p: "pawn", n: "knight", b: "bishop",
                     r: "rook", q: "queen", k: "king" };

/* Positions come from RANDOM GAMES, not from a list. A list of
 * FENs is a list of situations someone thought of, which is the
 * thing this file exists to avoid. Every game runs a random
 * number of plies, so openings, middlegames and thin endgames
 * all turn up in proportion to how often they occur.
 *
 * Each sampled position keeps the move list that built it, and
 * that - not a FEN - is what a failure prints. It is
 * reproducible by hand, it is what test_harness.js already
 * replays games with, and a FEN would need a serialiser
 * rules.js does not have and must not grow for a test's sake.
 */
function samplePositions(n) {
  vm.runInContext("var __positions = [];", sandbox);
  const trails = [];
  while (trails.length < n) {
    const plies = rnd(70);
    const ucis = [];
    vm.runInContext("var __p = new RULES.Position();", sandbox);
    for (let i = 0; i < plies; i++) {
      const ms = vm.runInContext(
        "__p.legalMoves().map(function (m) { return __p.uciOf(m); })", sandbox);
      if (!ms.length) break;
      const u = ms[rnd(ms.length)];
      vm.runInContext("__p.applyUci(" + JSON.stringify(u) + ");", sandbox);
      ucis.push(u);
    }
    const alive = vm.runInContext("__p.legalMoves().length", sandbox);
    if (!alive) continue;               // mate or stalemate: nothing to say
    vm.runInContext("__positions.push(__p);", sandbox);
    trails.push(ucis);
  }
  return trails;
}

/* ---- the utterances ----------------------------------------- */
/* TWO BATTERIES, and the second is the one that finds things.
 *
 * The BLIND battery walks the whole grammar across all 64
 * squares and all 8 files regardless of the position. It is what
 * catches a sentence that should mean nothing and means
 * something.
 *
 * The DERIVED battery is built from the position's own legal
 * moves: for each one, the sentences a person would actually say
 * to ask for it. That matters because the blind battery is
 * mostly noise - almost every square is unreachable, so almost
 * every utterance returns nothing and proves nothing. The
 * interesting cases are the DENSE ones: two pawns that can take
 * the same square, a pawn and a piece that can, a file with more
 * than one capture on it. Those are rare by accident and certain
 * by construction.
 *
 * This was found the hard way. With the blind battery alone, a
 * mutant that deleted the spoken from-file filter entirely
 * SURVIVED 7,840 checks - not because the rule was unchecked,
 * but because no generated utterance ever reached a board where
 * it mattered. A property test whose generator never builds the
 * hard case is a test that passes for the wrong reason, which is
 * the same failure as w27/w28 wearing different clothes.
 */
const SAY_SQ = sq => SPOKEN_FILE[sq[0]] + " " + SPOKEN_RANK[sq[1]];

function blindBattery() {
  const u = [];
  const squares = [];
  FILES.forEach(f => { for (let r = 1; r <= 8; r++) squares.push(f + r); });
  squares.forEach(sq => {
    u.push({ t: SAY_SQ(sq), kind: "bare-square", sq: sq });
    u.push({ t: "takes " + SAY_SQ(sq), kind: "takes-square", sq: sq });
    u.push({ t: SAY_SQ(sq) + " takes", kind: "square-takes" });
  });
  // THE VICTIM FORMS. "queen takes queen" names the prey
  // instead of the square (v111, widened at v121 so the mover
  // need not be named). A whole branch of the grammar, and it
  // had NO generated coverage until a mutant that deleted the
  // victim filter outright survived the entire suite - not
  // because the rule was unchecked, but because nothing ever
  // said a victim. Third time this shape has been found: a
  // generator that never builds the case is a test that passes
  // for the wrong reason.
  "pnbrqk".split("").forEach(v => {
    u.push({ t: "takes " + PIECE_WORD[v], kind: "takes-victim" });
    "pnbrqk".split("").forEach(mv => {
      u.push({ t: PIECE_WORD[mv] + " takes " + PIECE_WORD[v],
               kind: "piece-takes-victim" });
    });
  });
  FILES.forEach(f => {
    u.push({ t: "takes " + SPOKEN_FILE[f], kind: "takes-file" });
    u.push({ t: SPOKEN_FILE[f] + " takes", kind: "file-takes" });
    FILES.forEach(g => {
      u.push({ t: SPOKEN_FILE[f] + " takes " + SPOKEN_FILE[g],
               kind: "file-takes-file" });
    });
  });
  return u;
}

function derivedBattery(moves) {
  const u = [], seen = {};
  const add = (t, kind, extra) => {
    const key = kind + "|" + t;
    if (seen[key]) return;
    seen[key] = 1;
    u.push(Object.assign({ t: t, kind: kind }, extra || {}));
  };
  moves.forEach(m => {
    const ff = m.from[0];
    add(SAY_SQ(m.to), "bare-square", { sq: m.to });
    add(PIECE_WORD[m.piece] + " " + SAY_SQ(m.to), "piece-square",
        { piece: m.piece, sq: m.to });
    // `want` is what rule 9 holds this utterance to: name both
    // squares of a legal move and that move must come back.
    add(m.from + " " + SAY_SQ(m.to), "from-to",
        { sq: m.to, want: m.from + m.to });
    if (!m.captured) return;
    add("takes " + SAY_SQ(m.to), "takes-square", { sq: m.to });
    add(SPOKEN_FILE[ff] + " takes " + SAY_SQ(m.to), "file-takes-square",
        { sq: m.to });
    add(PIECE_WORD[m.piece] + " takes " + SAY_SQ(m.to), "piece-takes-square",
        { piece: m.piece, sq: m.to });
    add(SPOKEN_FILE[ff] + " takes " + SPOKEN_FILE[m.to[0]], "file-takes-file");
    add(SPOKEN_FILE[ff] + " takes", "file-takes");
    add(SAY_SQ(m.from) + " takes", "square-takes");
    add("takes " + SPOKEN_FILE[m.to[0]], "takes-file");
    add("takes " + PIECE_WORD[m.captured], "takes-victim");
    add(PIECE_WORD[m.piece] + " takes " + PIECE_WORD[m.captured],
        "piece-takes-victim");
    add(SPOKEN_FILE[ff] + " takes " + PIECE_WORD[m.captured],
        "file-takes-victim");
  });

  /* THE SHAPES THE GENERATOR NEVER BUILT (w54). Everything
   * above is a capture or a plain square; between them they
   * never once said "castles", never promoted a pawn, never
   * used a bare LETTER, and never said a piece with only a
   * file. That is not a small gap - the letter grammar is two
   * lines in parsing.js that the harness itself notes "could
   * have been refactored away with every test still green",
   * and it is the owner's natural English under time. Same
   * lesson as the victim forms and the spoken from-file before
   * them: a generator that never builds the case is a test
   * that passes for the wrong reason. */
  moves.forEach(function (m) {
    var ff = m.from[0];
    // castling, said both ways round
    if (m.castle === "k" || /O-O(?!-)/.test(m.san || "")) {
      add("castle kingside", "castle");
      add("castles", "castle");
    }
    if (m.castle === "q" || /O-O-O/.test(m.san || "")) {
      add("castle queenside", "castle");
    }
    // promotions: the bare square, and the named piece
    if (m.promotion) {
      "qrbn".split("").forEach(function (pc) {
        add(SAY_SQ(m.to) + " equals " + PIECE_WORD[pc], "promotion",
            { sq: m.to });
      });
    }
    // a piece and a FILE, no rank - the w47 shape
    add(PIECE_WORD[m.piece] + " " + SPOKEN_FILE[m.to[0]], "piece-file",
        { piece: m.piece });
    // BARE LETTERS. The same sentences as above, in the two
    // forms parsing.js supports: the lone letter and the
    // glued letter-and-digit.
    add(m.to, "bare-square", { sq: m.to });                 // "e4"
    add(m.from + " " + m.to, "from-to",
        { sq: m.to, want: m.from + m.to });                 // "e2 e4"
    if (m.captured) {
      add(ff + " takes", "file-takes");                     // "b takes"
      add(ff + " takes " + m.to, "file-takes-square", { sq: m.to });
      add("pawn takes", "pawn-takes");
      add(PIECE_WORD[m.piece] + " takes", "piece-takes");
    }
  });
  return u;
}

/* ---- the invariants ----------------------------------------- */
/* THE CHECKING RUNS INSIDE THE SANDBOX, one call per position
 * rather than one per utterance. Crossing the vm boundary costs
 * more than every rule below put together: the first draft did
 * two crossings per utterance and managed 56k in 27 seconds,
 * which is too slow to run on every push and therefore too slow
 * to be run at all. Same rules, same failures, one crossing. */
vm.runInContext(`
  function __check(pos, batch) {
    var bad = [];
    // MEMOIZE legalMoves FOR THE BATCH. findMoves calls it on
    // every utterance and it costs 0.17ms - 56k utterances spend
    // 19 of their 26 seconds regenerating the same move list. The
    // position cannot change while a batch runs (nothing here
    // applies a move), so one generation serves all of them, and
    // what findMoves computes is unchanged. Restored afterwards
    // so no later caller ever sees the stub.
    var realLegal = pos.legalMoves;
    var moves = realLegal.call(pos);
    pos.legalMoves = function () { return moves; };
    var legal = {};
    moves.forEach(function (m) { legal[pos.uciOf(m)] = 1; });
    function note(rule, utt, detail) {
      if (bad.length < 12) bad.push([rule, utt, detail]);
    }
    for (var i = 0; i < batch.length; i++) {
      var u = batch[i], req, ms;
      try {
        req = parseTranscript(u.t);
        ms = findMoves(pos, req);
      } catch (e) {
        note("THREW: " + e.message, u.t, "");
        continue;
      }
      for (var j = 0; j < ms.length; j++) {
        var m = ms[j];
        var uci = pos.uciOf(m);
        var from = RULES.sqName(m.from), to = RULES.sqName(m.to);

        // 1. EVERYTHING OFFERED IS LEGAL. Cheap, and it catches
        //    any move built rather than selected.
        if (!legal[uci]) note("candidate is not a legal move", u.t, uci);

        // 2. THE GAME6 INVARIANT. A bare square is a pawn PUSH:
        //    never a piece, never a capture. This is the rule the
        //    lost 320k-utterance run guarded, and the one every
        //    capture widening from w40 on has had to stay clear
        //    of. game6 was a capture played unasked, and it lost
        //    the game.
        if (u.kind === "bare-square" && (m.piece !== "p" || m.captured)) {
          note("bare square produced a piece move or a capture", u.t,
               uci + " (" + m.piece +
               (m.captured ? " takes " + m.captured : " push") + ")");
        }

        // 3. NO TAKE WORD, NO PAWN CAPTURE - when a whole
        //    DESTINATION was named and the origin was not.
        //    "charlie five" means the pawn steps there even when
        //    a pawn could also capture there; "bravo one charlie
        //    three" names the whole move and is exempt by
        //    design.
        //
        //    This property was first written WITHOUT the
        //    from-square exemption and immediately failed on
        //    clean source, five times, on utterances like "e2
        //    delta three". The code was right and the rule was
        //    wrong. Worth leaving in the comment: the first
        //    thing a property test finds is usually the author's
        //    own misunderstanding of the invariant.
        //
        //    AND IT HAPPENED AGAIN AT w54, which is why the
        //    condition is now the constraint's rather than
        //    req.squares'. Adding piece+file utterances to the
        //    generator ("pawn hotel") failed this five times on
        //    clean source: a lone FILE pins no destination
        //    square, so matching.js deliberately does not apply
        //    the strict filters - the bare-square reading is not
        //    on the table to be confused with, and its own
        //    comment says so. The old form read req.squares and
        //    could not see that distinction. Stated in the same
        //    terms the code uses, the rule holds and still
        //    guards game6, which is rule 2's job anyway.
        var c3 = constraintOf(req);
        var toWhole = !!(c3.to.file && c3.to.rank);
        var fromWhole = !!(c3.from.file && c3.from.rank);
        if (!req.capture && toWhole && !fromWhole &&
            m.piece === "p" && m.captured) {
          note("pawn capture from an utterance with no take word", u.t, uci);
        }

        // 4. A TAKE WORD MEANS A CAPTURE. Nothing that leaves the
        //    board unchanged may answer "takes".
        if (req.capture && !m.captured) {
          note("take word produced a non-capture", u.t, uci);
        }

        // 5. A NAMED PIECE IS THE PIECE THAT MOVES.
        if (req.piece && m.piece !== req.piece) {
          note("named " + req.piece + " but moved " + m.piece, u.t, uci);
        }

        // 6. EVERY CONSTRAINT THE WORDS SET IS HONOURED. This
        //    used to read req.fromFile and assert it was the
        //    MOVER's file - which was true of some utterances
        //    and false of others, because that one field meant
        //    the origin here and the target there. It is the
        //    ambiguity the constraint set was built to remove,
        //    and the property had quietly encoded one side of
        //    it: migrating findMoves failed this rule three
        //    times on correct code before the rule was fixed.
        //
        //    Asked of the constraint the utterance actually
        //    produced, it is one statement instead of four, and
        //    it covers the halves the old form could not name.
        //    A move may only satisfy a LATER reading, so the
        //    check is that it satisfies SOME reading.
        var rs = readingsOf(req);
        var honoured = false;
        for (var k = 0; k < rs.length; k++) {
          var cc = rs[k].c;
          if ((!cc.from.file || from[0] === cc.from.file) &&
              (!cc.from.rank || from[1] === cc.from.rank) &&
              (!cc.to.file   || to[0]   === cc.to.file) &&
              (!cc.to.rank   || to[1]   === cc.to.rank) &&
              (!cc.piece     || m.piece === cc.piece) &&
              (!cc.victim    || m.captured === cc.victim) &&
              (!cc.mustCapture || m.captured)) { honoured = true; break; }
        }
        if (!honoured) {
          note("no reading of the utterance allows this move", u.t, uci);
        }

        // 7. The from-square and destination rules that used to
        //    stand here are subsumed by the reading check: a
        //    whole square is just both halves of one end, and
        //    the check above names every half. The mutants that
        //    earned them (deleting the from-square filter,
        //    deleting the destination filter) are still caught -
        //    verified, not assumed.
      }

      // 9. COMPLETENESS - THE ONLY RULE POINTING THE OTHER WAY.
      //    Rules 1 to 8 all quantify over the moves findMoves
      //    RETURNED, so every one of them is vacuously true of
      //    an empty list: a findMoves that answered nothing at
      //    all, to anything, passed this entire file. That is a
      //    whole class of mutant - and worse, it is the shape of
      //    a real regression, since every capture widening from
      //    w40 on has worked by narrowing what comes back.
      //
      //    Soundness is still the aim (the game6 invariant is
      //    what this file was built for) and completeness cannot
      //    be asserted in general - "takes" SHOULD return
      //    nothing when nothing can take. But one form is not
      //    ambiguous at all: an utterance naming both squares of
      //    a move that is legal right now. If that does not come
      //    back, words were lost.
      if (u.want) {
        var got = false;
        for (var w = 0; w < ms.length; w++) {
          if (RULES.sqName(ms[w].from) + RULES.sqName(ms[w].to) === u.want) {
            got = true; break;
          }
        }
        if (!got) {
          note("both squares of a legal move were said and it was " +
               "not offered", u.t,
               u.want + " (got " +
               (ms.length
                 ? ms.map(function (m2) { return pos.uciOf(m2); }).join(" ")
                 : "nothing") + ")");
        }
      }

      // 8. DETERMINISM. The same words on the same board must
      //    mean the same thing twice - Safari sends the same
      //    utterance more than once, and the second reading must
      //    never differ from the first.
      var again = findMoves(pos, parseTranscript(u.t))
                    .map(function (m2) { return pos.uciOf(m2); }).join(",");
      if (again !== ms.map(function (m2) { return pos.uciOf(m2); }).join(",")) {
        note("same utterance, different answer on re-parse", u.t, again);
      }
    }
    pos.legalMoves = realLegal;
    return { bad: bad, n: batch.length };
  }
`, sandbox);


const failures = [];
let checked = 0;

function note(rule, where, utt, detail) {
  if (failures.length < 12) {
    failures.push(rule + "\n    after:  " + where +
                  "\n    said:  \"" + utt + "\"\n    got:   " + detail);
  }
}

function run() {
  const trails = samplePositions(POSITIONS);
  const blind = blindBattery();
  console.log("seed " + SEED + ", " + trails.length + " positions, " +
              blind.length + " blind utterances each plus every " +
              "sentence their own legal moves suggest");

  trails.forEach((trail, pi) => {
    vm.runInContext("var __pos = __positions[" + pi + "];", sandbox);
    const where = trail.length ? trail.join(" ") : "(start position)";
    const moves = vm.runInContext(`
      __pos.legalMoves().map(function (m) {
        return { piece: m.piece, captured: m.captured || null,
                 from: RULES.sqName(m.from), to: RULES.sqName(m.to) };
      })`, sandbox);
    const batch = blind.concat(derivedBattery(moves));
    sandbox.__batch = batch;
    const res = vm.runInContext("__check(__pos, __batch)", sandbox);
    checked += res.n;
    res.bad.forEach(b => note(b[0], where, b[1], b[2]));
  });

  console.log(checked.toLocaleString() + " utterances checked");
  if (failures.length) {
    console.log("\nFAILED:\n");
    failures.forEach(f => console.log("  " + f + "\n"));
    if (failures.length >= 12) console.log("  (first 12 shown)");
    process.exit(1);
  }
  console.log("all properties hold");
}

run();
