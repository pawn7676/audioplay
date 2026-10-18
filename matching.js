/*  matching.js - turns what the mic heard into one legal
 *  move, or none.
 *
 *  The mic returns several guesses ("readings") for each
 *  thing said. Every reading that parses to a whole
 *  four-item move is checked against the legal moves. If
 *  exactly one legal move comes out, it is played; if two
 *  readings give two different legal moves, the mic is
 *  guessing, and the answer is "Say again."
 */

"use strict";

// Drops empty readings and readings that parse to the same
// items as an earlier one.
function dedupeTranscripts(list) {
  var seen = {}, out = [];
  (list || []).forEach(function (t) {
    if (!String(t).trim()) return;

    var r = readItems(t);
    var key = r.items.map(function (s) { return s.t + s.v; }).join("|") +
              "|" + (r.promo || "") + "|" + (r.unknown ? "?" : "");
    if (seen[key]) return;
    seen[key] = true;
    out.push(t);
  });
  return out;
}

// Every distinct legal move the readings produce, as
// {m, san, uci}.
function collectMoves(pos, transcripts) {
  var legal = pos.legalMoves();
  var byUci = {};
  legal.forEach(function (m) { byUci[pos.uciOf(m)] = m; });
  var seen = {}, out = [];
  transcripts.forEach(function (raw, ti) {
    var pm = parseMove(raw);
    if (!pm) return;
    var uci = pm.uci;

    // A pawn reaching the last rank becomes a queen unless
    // another piece was named. A promotion word on a move
    // that does not promote is a mishearing.
    if (byUci[uci + (pm.promo || "q")]) uci = uci + (pm.promo || "q");
    else if (pm.promo) return;
    var m = byUci[uci];
    if (!m) return;
    if (seen[uci]) return;
    seen[uci] = true;
    if (ti > 0) log("PRS", "move came from reading " + ti);
    out.push({ m: m, san: pos.sanOf(m, legal), uci: uci });
  });
  return out;
}

// True if some reading was a whole, clean four-item move
// whose squares match no legal move. The caller then says
// "That is not a legal move." instead of "Say again."
function namesIllegalMove(pos, transcripts) {
  var fromTo = {};
  pos.legalMoves().forEach(function (m) {
    fromTo[pos.uciOf(m).slice(0, 4)] = true;
  });
  return transcripts.some(function (raw) {
    var pm = parseMove(raw);
    return !!pm && !fromTo[pm.uci];
  });
}
