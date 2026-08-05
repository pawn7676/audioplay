/* Perft for rules.js (FROZEN). Run whenever it changes,
 * alongside test_harness.js. Expected:
 *   startpos depth 4 = 197281
 *   Kiwipete depth 3 = 97862  */
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
const a = perft(new R.Position(), 4);
const kiwi = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1";
const b = perft(new R.Position(kiwi), 3);
console.log("startpos d4 =", a, a === 197281 ? "OK" : "WRONG (want 197281)");
console.log("Kiwipete d3 =", b, b === 97862 ? "OK" : "WRONG (want 97862)");
process.exit(a === 197281 && b === 97862 ? 0 : 1);
