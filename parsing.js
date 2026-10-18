/*  parsing.js - reads what was said.
 *
 *  A MOVE IS FOUR ITEMS: from-file, from-rank, to-file,
 *  to-rank, with NATO words for the files.
 *
 *    "echo two echo four"       e2e4
 *    "golf one foxtrot three"   Ng1-f3 - no piece names
 *    "echo one golf one"        castling is the king's move
 *    "echo seven echo eight"    promotes to a queen...
 *    "... equals knight"        ...unless a piece is named
 *
 *  Anything less than a whole move is never completed or
 *  guessed at: it gets "Say again." A whole move that is
 *  not legal gets "That is not a legal move." Piece names,
 *  "takes", "check" and "castles" are not accepted.
 *
 *  Single letters ("E two E four") and glued squares
 *  ("e2e4") work too, but NATO words survive distance best.
 *  Filler words ("play", "move", "um") are ignored, which
 *  also lets a throwaway first word absorb Safari clipping
 *  the start of a sentence.
 *
 *  COMMANDS, one word each: repeat, time, flip, cancel,
 *  memo, resign, draw. Resign and draw ask yes or no first.
 *
 *  A word that is in no table makes its reading unusable;
 *  the log names it, which is how new spellings get added
 *  to vocabulary.js.
 */

"use strict";

// Lower case, apostrophes dropped ("who's" -> "whos"),
// punctuation to spaces, split into words.
function wordsOf(raw) {
  return String(raw).toLowerCase().replace(/['’]/g, "")
    .replace(/[.,!?;:]/g, " ")
    .split(/\s+/).filter(Boolean);
}

// The reading that starts with "memo", if any.
function memoTranscript(transcripts) {
  for (var i = 0; i < transcripts.length; i++) {
    var toks = wordsOf(transcripts[i]);
    if (toks.length > 1 && MEMO_WORDS[toks[0]]) return transcripts[i];
  }
  return null;
}

// The command a reading is, or null. A command must stand
// alone: any other content word makes it not a command.
function classifyCommand(raw) {
  var toks = wordsOf(raw);
  var yes = 0, no = 0, cancel = 0, repeat = 0,
      resign = 0, draw = 0, time = 0, flip = 0, other = 0;
  toks.forEach(function (t) {
    if (YES_WORDS[t]) yes++;
    else if (NO_WORDS[t]) no++;
    else if (CANCEL_WORDS[t]) cancel++;
    else if (REPEAT_WORDS[t]) repeat++;
    else if (RESIGN_WORDS[t]) resign++;
    else if (DRAW_WORDS[t]) draw++;

    else if (TIME_WORDS[t]) time++;

    else if (FLIP_WORDS[t]) flip++;
    else if (!FILLER[t]) other++;
  });
  if (cancel && !other) return "cancel";
  if (resign && !other) return "resign";
  if (draw && !other) return "draw";
  if (yes && !no && !other) return "yes";
  if (no && !yes && !other) return "no";
  if (repeat && !other) return "repeat";
  if (time && !flip && !other) return "time";
  if (flip && !time && !other) return "flip";
  return null;
}

// Command words are not part of a move, but they are not
// unknown either, so they don't spoil a reading ("yeah,
// echo two echo four").
function knownNonMoveWord(tk) {
  return !!(YES_WORDS[tk] || NO_WORDS[tk] || CANCEL_WORDS[tk] ||
            REPEAT_WORDS[tk] || TIME_WORDS[tk] ||
            FLIP_WORDS[tk] || RESIGN_WORDS[tk] || DRAW_WORDS[tk] ||
            MEMO_WORDS[tk]);
}

// One reading, reduced to its items:
//   { items: [{t: "file"|"rank", v}...],
//     promo: "q"|"r"|"b"|"n"|null,
//     unknown: the first word not understood, or null }
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

    // Safari writes "two" as "to". Right after a file, "to"
    // is the rank 2; anywhere else it is filler.
    if (tk === "to") {
      if (items.length && items[items.length - 1].t === "file") {
        items.push({ t: "rank", v: "2" });
      }
      continue;
    }

    // Safari writes "delta" as "down to": before a rank,
    // that is the d-file.
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

    // "a" is the a-file only when a rank follows it;
    // otherwise it is the article.
    if (tk === "a") {
      var nx = toks[i + 1];
      if (nx && (NUMS[nx] || /^[1-8]$/.test(nx))) {
        items.push({ t: "file", v: "a" });
      }
      continue;
    }
    if (NATO[tk]) { items.push({ t: "file", v: NATO[tk] }); continue; }
    if (NUMS[tk]) { items.push({ t: "rank", v: NUMS[tk] }); continue; }

    // a glued move ("e2e4") or square ("b4")
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

    if (!unknown) unknown = tk;
  }
  return { items: items, promo: promo, unknown: unknown };
}

// A reading that is exactly file rank file rank, with no
// unknown word, as {uci: "e2e4", promo}; otherwise null.
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

// True if the reading holds a whole square (a file with its
// rank). That marks it as aimed at us: it gets an answer,
// where other talk in the room is ignored.
function hasSquare(raw) {
  var items = readItems(raw).items;
  for (var i = 0; i + 1 < items.length; i++) {
    if (items[i].t === "file" && items[i + 1].t === "rank") return true;
  }
  return false;
}

function colorWord(c) { return c === "w" ? "white" : "black"; }

// The PRS log line: what a reading reduced to.
function describeItems(raw) {
  var r = readItems(raw);
  return r.items.map(function (s) { return s.v; }).join(" ") +
         (r.promo ? " =" + r.promo : "") +
         (r.unknown ? "   (\"" + r.unknown + "\" not understood)" : "");
}
