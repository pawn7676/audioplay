/* property_check.js — the invariants, on utterances nobody chose.
 *
 *   node property_check.js [positions] [seed]
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
 * REWRITTEN WHOLE AT w118 with the grammar it checks. The old
 * grammar let a sentence underdescribe a move, so the old
 * properties were about disambiguation - bare squares staying
 * pawn pushes, take words meaning captures, named pieces moving.
 * The four-item grammar has one load-bearing promise instead,
 * and it has two directions:
 *
 *   SOUND:    nothing plays but a whole move, heard whole.
 *             No shorter shape, no longer shape, no unknown
 *             word beside it, ever - however uniquely a legal
 *             move might complete it. (The owner's rule: a
 *             system that never guesses cannot guess wrong.)
 *   COMPLETE: every legal move, spoken whole in any spelling
 *             the vocabulary knows, comes back as exactly that
 *             move and nothing else.
 *
 * THE SLICE, NOT THE PAGE. It loads vocabulary, parsing and
 * matching only - the files that turn words into moves - with
 * rules.js underneath and log stubbed. No DOM, no boot, no
 * speech. The dialogue-level invariants (silence is never an
 * answer, "Say again." on everything else) need the whole page
 * and live in test_harness.js beside it.
 *
 * NO Math.random ANYWHERE. A property test that cannot be re-run
 * on the same input is a rumour, not a result. The generator is
 * a seeded LCG, so the seed printed at the top reproduces the
 * run exactly.
 */
"use strict";
const fs = require("fs");
const vm = require("vm");

const POSITIONS = parseInt(process.argv[2] || "150", 10);
const SEED = parseInt(process.argv[3] || "20260806", 10);

/* ---- the slice, loaded as one script ------------------------ */
const sandbox = vm.createContext({ console });
const slice = ["rules.js", "vocabulary.js", "parsing.js", "matching.js"]
  .map(f => fs.readFileSync("src/" + f, "utf8")).join("");
vm.runInContext(
  slice +
  "\n var RULES = makeRules();" +
  "\n function log() {}",
  sandbox, { filename: "slice(vocabulary,parsing,matching)" });

/* ---- deterministic generator -------------------------------- */
let seed = SEED;
function rnd(n) {                       // 0 <= rnd(n) < n
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed % n;
}
function pick(arr) { return arr[rnd(arr.length)]; }

const SPOKEN_FILE = { a: "alpha", b: "bravo", c: "charlie", d: "delta",
                      e: "echo", f: "foxtrot", g: "golf", h: "hotel" };
const SPOKEN_RANK = { 1: "one", 2: "two", 3: "three", 4: "four",
                      5: "five", 6: "six", 7: "seven", 8: "eight" };
// a few logged homophones per value, exercised in place of the
// plain word so the tables stay wired into the parser
const ALT_FILE = { a: ["alfa", "apple"], b: ["beta", "be"],
                   c: ["charley", "chili"], d: ["dealt", "dee"],
                   e: ["ecko", "eggo"], f: ["foxtrott", "fox"],
                   g: ["gulf", "gold"], h: ["hotels", "motel"] };
const ALT_RANK = { 1: ["won"], 2: ["too", "to"], 3: ["tree", "free"],
                   4: ["for", "fore"], 5: ["fife"], 6: ["sicks"],
                   7: ["sevin"], 8: ["ate", "hate"] };
const PROMO_WORD = { q: "queen", r: "rook", b: "bishop", n: "knight" };

/* Positions come from RANDOM GAMES, not from a list; each keeps
 * the move trail that built it, which is what a failure prints. */
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
/* For every legal move, several spoken forms of the WHOLE move,
 * each tagged with the uci it must produce - and for every legal
 * move, mutilations of it that must produce NOTHING: an item
 * dropped, an item doubled, an unknown word inserted. The
 * mutilations are the file's real work. The old grammar's
 * repair chain would have completed most of them; the w118 rule
 * is that nothing ever is, and only a generator can check
 * "nothing ever" across shapes nobody thought of.
 */
function sayMove(uci, style) {
  const f1 = uci[0], r1 = uci[1], f2 = uci[2], r2 = uci[3];
  switch (style) {
    case 0:  // plain NATO
      return [SPOKEN_FILE[f1], SPOKEN_RANK[r1],
              SPOKEN_FILE[f2], SPOKEN_RANK[r2]].join(" ");
    case 1:  // homophones sprinkled in
      return [pick(ALT_FILE[f1].concat(SPOKEN_FILE[f1])),
              pick(ALT_RANK[r1].concat(SPOKEN_RANK[r1])),
              pick(ALT_FILE[f2].concat(SPOKEN_FILE[f2])),
              pick(ALT_RANK[r2].concat(SPOKEN_RANK[r2]))].join(" ");
    case 2:  // glued letter squares
      return f1 + r1 + " " + f2 + r2;
    case 3:  // one glued token
      return f1 + r1 + f2 + r2;
    case 4:  // bare letters and digits
      return [f1, r1, f2, r2].join(" ");
    case 5:  // leading filler absorbs the clipped first word
      return "please " + [SPOKEN_FILE[f1], SPOKEN_RANK[r1],
                          SPOKEN_FILE[f2], SPOKEN_RANK[r2]].join(" ");
    default: // digits as digits, files as NATO
      return [SPOKEN_FILE[f1], r1, SPOKEN_FILE[f2], r2].join(" ");
  }
}

function batteryFor(moves) {
  const utts = [];
  moves.forEach(m => {
    const uci4 = m.uci.slice(0, 4);
    const promo = m.uci.length > 4 ? m.uci[4] : null;
    for (let style = 0; style <= 6; style++) {
      let t = sayMove(uci4, style);
      let want = m.uci;
      if (promo) {
        // the bare four items are the QUEEN promotion; other
        // pieces must be named. Skip non-queen promos in the
        // bare form (they are the queen's utterance).
        if (promo === "q") {
          if (rnd(2)) t += " equals queen";
        } else {
          t += " equals " + PROMO_WORD[promo];
        }
      }
      utts.push({ t: t, want: want });

      // ---- mutilations: each must produce NOTHING ----
      const words = sayMove(uci4, 0).split(" ");
      // an item dropped (the clipped-first-word disease, and
      // every other hole) - unless what remains happens to be
      // a legal move's four items, which a 3-item utterance
      // never is
      const d = rnd(4);
      utts.push({ t: words.slice(0, d).concat(words.slice(d + 1)).join(" "),
                  want: null });
      // an unknown word beside the whole move (the "Patient"
      // disease: something was said that the grammar cannot
      // account for, so the hearing is damaged)
      const junk = ["patient", "relationship", "aquarium", "banana"];
      const ins = rnd(5);
      utts.push({ t: words.slice(0, ins).concat([pick(junk)])
                        .concat(words.slice(ins)).join(" "),
                  want: null });
      // a fifth item
      utts.push({ t: t + " " + pick(["five", "golf"]), want: null });
    }
  });
  // and some never-a-move noise, to hold the silent side
  utts.push({ t: "echo four", want: null });
  utts.push({ t: "knight foxtrot three", want: null });
  utts.push({ t: "queen takes delta five", want: null });
  utts.push({ t: "castle kingside", want: null });
  utts.push({ t: "see you at four", want: null });
  return utts;
}

/* ---- the check, inside the sandbox --------------------------- */
vm.runInContext(`
  function __check(pos, batch) {
    var bad = [];
    var realLegal = pos.legalMoves;
    var moves = realLegal.call(pos);
    pos.legalMoves = function () { return moves; };
    function note(rule, utt, detail) {
      if (bad.length < 12) bad.push([rule, utt, detail]);
    }
    for (var i = 0; i < batch.length; i++) {
      var u = batch[i], got;
      try {
        got = collectMoves(pos, [u.t]);
      } catch (e) {
        note("THREW: " + e.message, u.t, "");
        continue;
      }
      var ucis = got.map(function (c) { return c.uci; });

      // SOUND: nothing plays but the whole move. A mutilated
      // or foreign utterance yields nothing at all.
      if (u.want === null && ucis.length) {
        note("a non-move utterance produced a move", u.t, ucis.join(","));
      }
      // COMPLETE and EXACT: the whole move, in any spelling,
      // yields exactly that move.
      if (u.want && (ucis.length !== 1 || ucis[0] !== u.want)) {
        note("a whole legal move did not come back as itself", u.t,
             u.want + " (got " + (ucis.join(",") || "nothing") + ")");
      }
      // DETERMINISM: the same words mean the same thing twice.
      var again = collectMoves(pos, [u.t])
        .map(function (c) { return c.uci; }).join(",");
      if (again !== ucis.join(",")) {
        note("same utterance, different answer on re-parse", u.t, again);
      }
      // AND EVERYTHING OFFERED IS LEGAL, whatever was asked.
      for (var j = 0; j < got.length; j++) {
        if (moves.indexOf(got[j].m) < 0) {
          note("candidate is not a legal move", u.t, got[j].uci);
        }
      }
    }
    // RIVALS THAT DISAGREE ARE BOTH REPORTED, so the dialogue
    // can refuse: two readings naming two legal moves must come
    // back as two, never quietly one.
    if (moves.length >= 2) {
      var a = pos.uciOf(moves[0]).slice(0, 4);
      var b = pos.uciOf(moves[1]).slice(0, 4);
      if (a !== b) {
        var pair = collectMoves(pos, [
          a[0] + a[1] + " " + a[2] + a[3],
          b[0] + b[1] + " " + b[2] + b[3]
        ]);
        if (pair.length < 2) {
          note("two disagreeing readings collapsed to " + pair.length,
               a + " | " + b, pair.map(function (c) { return c.uci; }).join(","));
        }
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
  console.log("seed " + SEED + ", " + trails.length + " positions, " +
              "every legal move spoken whole seven ways, " +
              "each with its mutilations");

  trails.forEach((trail, pi) => {
    vm.runInContext("var __pos = __positions[" + pi + "];", sandbox);
    const where = trail.length ? trail.join(" ") : "(start position)";
    const moves = vm.runInContext(`
      __pos.legalMoves().map(function (m) {
        return { uci: __pos.uciOf(m) };
      })`, sandbox);
    sandbox.__batch = batteryFor(moves);
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
