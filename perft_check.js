/* Perft for rules.js. Run whenever it changes, alongside
 * test_harness.js. Expected:
 *   startpos  depth 4 = 197281
 *   Kiwipete  depth 3 = 97862
 *   position3 depth 4 = 43238
 *   position4 depth 4 = 422333
 *
 * The depths are the shallowest that still say something. One
 * ply deeper on position3 is 674624 nodes and takes the whole
 * check from four seconds to thirteen, for a pin shape depth 4
 * already reaches; the check runs in CI on every push, and a
 * gate nobody minds waiting for is a gate that keeps running.
 *
 * WHY FOUR POSITIONS AND NOT TWO. The first two were the whole
 * check for the life of the v-series, and between them they
 * never promote a single pawn: startpos cannot reach the last
 * rank in four plies, and Kiwipete's pawns are nowhere near it
 * in three. So the generator's promotion code - four moves per
 * promoting pawn, times capture-promotions, and the "=Q" that
 * sanOf writes - was covered by nothing at all, while the note
 * at the top of rules.js told every reader that perft was the
 * gate on ANY edit there. A gate with a hole in it is worse
 * than no gate, because it is trusted.
 *
 * position4 is the standard promotion-heavy position: a white
 * pawn on a7 promoting straight and by capture, a black pawn on
 * b2 doing the same at the other end, under check pressure. Its
 * number moves if any of the four promotion pieces is dropped,
 * or if a capture-promotion is missed.
 *
 * position3 is the standard en-passant-pin position. The ep-pin
 * (a capture that would expose the king along the rank, and so
 * is illegal despite looking legal) cannot arise here by
 * construction - legality is decided by cloning and testing
 * inCheck, so a pin of any shape falls out for free - but that
 * is exactly the reasoning a future rewrite might discard for
 * speed. This number is what would catch it.
 */
"use strict";
const fs = require("fs");
// rules.js is closure-style source; run it inside a
// Function scope and lift makeRules out (a bare eval under
// "use strict" would keep the declaration to itself)
const makeRules = new Function(
  fs.readFileSync("src/rules.js", "utf8") + "\nreturn makeRules;")();
const R = makeRules();
function perft(p, d) {
  if (d === 0) return 1;
  let n = 0;
  for (const m of p.legalMoves()) {
    const q = p.clone(); q.apply(m); n += perft(q, d - 1);
  }
  return n;
}

const CASES = [
  { name: "startpos  d4", fen: null, depth: 4, want: 197281 },
  { name: "Kiwipete  d3", depth: 3, want: 97862,
    fen: "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1" },
  { name: "position3 d4", depth: 4, want: 43238,
    fen: "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1" },
  { name: "position4 d4", depth: 4, want: 422333,
    fen: "r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1" }
];

let bad = 0;
CASES.forEach(c => {
  const got = perft(c.fen ? new R.Position(c.fen) : new R.Position(), c.depth);
  const ok = got === c.want;
  if (!ok) bad++;
  console.log(c.name, "=", got, ok ? "OK" : "WRONG (want " + c.want + ")");
});
process.exit(bad ? 1 : 0);
