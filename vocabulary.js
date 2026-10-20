/*  vocabulary.js - the words the page understands.
 *
 *  Each table lists, for one value, every spelling Safari
 *  has been heard to return for it ("four for fore ford").
 *  Add new spellings from real logs: the HRD and PRS lines
 *  name any word that was not understood.
 *
 *  A word may mean only one thing. The page refuses to
 *  start if a word is listed under two values or in two
 *  tables, rather than quietly picking one.
 */

"use strict";

// Turns { value: "word word ..." } into a word -> value map,
// throwing on a word listed under two values.
function expand(groups) {
  var out = {};
  Object.keys(groups).forEach(function (val) {
    groups[val].split(/\s+/).forEach(function (w) {
      if (!w) return;
      if (out[w] && out[w] !== val) {
        throw new Error("vocab: \"" + w + "\" is both " +
                        out[w] + " and " + val);
      }
      out[w] = val;
    });
  });
  return out;
}

function wordSet(str) {
  var out = {};
  str.split(/\s+/).forEach(function (w) { if (w) out[w] = 1; });
  return out;
}

// Files, as NATO words.
var NATO = expand({
  a: "alpha alfa alpher ay eh apple elsa alsa ilsa alka alba " +
     "elba alva ulta olfa alfalfa adam",
  b: "bravo brava bravos bravado be bee beta",

  c: "charlie charley charly charlee shirley sharlie sea see " +
     "chan chang ching chong chung chin chino chinese " +
     "charlotte shortly channel chili chilly",
  d: "delta deltas dealt delt de dee",
  e: "echo ecko eco eggo echoes aiko",
  f: "foxtrot foxtrots foxtrott foxdrop fox ef eff " +
     "astra ostra otra austra oxtra",
  g: "golf golfs gulf gold goal gee call",
  h: "hotel hotels hotell motel aitch age"
});

// Ranks.
var NUMS = expand({
  1: "one won wan wand juan wun",
  2: "two too tu tue tew tube",
  3: "three tree free thee",
  4: "four for fore ford forth fourth foure forde",
  5: "five hive fife fiv",
  6: "six sex sicks seeks sics",
  7: "seven heaven sevin sevan",
  8: "eight ate hate ait eighth"
});

// Promotion pieces, only read after "equals".
var PIECES = expand({
  q: "queen queens quean quinn clean",
  r: "rook rooks rock rocks brook rooke",
  b: "bishop bishops bishup bish fish fisher",
  n: "knight knights night nights nite"
});

// A whole square heard as one word ("echo four" as
// "aquaphor").
var COMPOUND = {
  abbreviate: [["file", "b"], ["rank", "8"]],
  aquaphor: [["file", "e"], ["rank", "4"]],
  chariot: [["file", "c"], ["rank", "8"]],
  chariots: [["file", "c"], ["rank", "8"]],
  equate: [["file", "e"], ["rank", "8"]],
  gofer: [["file", "g"], ["rank", "4"]],
  golfer: [["file", "g"], ["rank", "4"]],
  golfers: [["file", "g"], ["rank", "4"]],
  gopher: [["file", "g"], ["rank", "4"]],
  gophers: [["file", "g"], ["rank", "4"]]
};

// No word may appear in two of the tables above. FILLER is
// left out on purpose: a value always wins over filler,
// which is how "a" can be the a-file.
(function crossCheckVocabulary() {
  var maps = { NATO: NATO, NUMS: NUMS, PIECES: PIECES,
               COMPOUND: COMPOUND };
  var owner = {};
  Object.keys(maps).forEach(function (name) {
    Object.keys(maps[name]).forEach(function (w) {
      if (owner[w] && owner[w] !== name) {
        throw new Error("vocab: \"" + w + "\" is in both " +
                        owner[w] + " and " + name);
      }
      owner[w] = name;
    });
  });
})();

// Words that mean nothing and are ignored ("play echo two
// echo four", "I resign").
var FILLER = wordSet("please move moves play plays the piece um " +
  "uh a an then and go goes on my is it to into onto i of");

// Answers to a yes/no question.
var YES_WORDS = wordSet("yes yeah yep yup correct right confirm " +
  "confirmed affirmative ok okay sure aye");
var NO_WORDS = wordSet("no nope wrong negative next nah");
var CANCEL_WORDS = wordSet("cancel nevermind forget stop abort");

// Commands: one word each.
var REPEAT_WORDS = wordSet("repeat");

var TIME_WORDS = wordSet("time");

var FLIP_WORDS = wordSet("flip flips");
var RESIGN_WORDS = wordSet("resign resigns");
var DRAW_WORDS = wordSet("draw");
var MEMO_WORDS = wordSet("memo memos");
