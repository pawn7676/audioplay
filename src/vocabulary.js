  /*========================== VOCABULARY ==========================*/

  /* The lists below are written ONE ENTRY PER VALUE: every
   * spelling iOS has been heard to return for the a-file, for
   * the rank 4, for the knight, on one line together. expand()
   * flips that into the flat word -> value map the parser looks
   * words up in.
   *
   * Written flat, a word could sit on the "c" line and be typed
   * : "b" with nothing to show for it, and the same word could
   * appear under two letters with the last one silently winning.
   * Grouped, the first cannot happen and the second throws at
   * load. Both were routes to a quiet wrong move.
   *
   * expand() must stay INSIDE this file, because property_check.js
   * loads a SLICE of the program - rules, vocabulary, parsing and
   * matching, the four files that turn words into moves - and
   * anything expand() needed from outside that set would not be
   * there. (Through w53 this said the slice was taken "from the
   * 3. VOCABULARY header to 6. DIALOGUE": that was true when the
   * files were numbered sections of one scroll, and the numbers
   * went away with the userscript. The rule it was justifying
   * still holds; the mechanism it described stopped existing.) */
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

  /* The command lists are sets, not maps: only membership is
   * ever asked. Same shape of win, without the repeated ": 1". */
  function wordSet(str) {
    var out = {};
    str.split(/\s+/).forEach(function (w) { if (w) out[w] = 1; });
    return out;
  }

  var NATO = expand({
    a: "alpha alfa alpher ay eh apple elsa alsa ilsa alka alba " +
       "elba alva ulta olfa alfalfa adam",
    b: "bravo brava bravos bravado be bee beta",
    // "chili" and "chilly" joined at w114 from the owner's
    // 9 Aug practice log, where a rival transcript wrote
    // "charlie" as "chili" ("Light chili three"). Both meet
    // the criterion above: Safari's own output for the
    // spoken word. Exact-only, everyday words.
    c: "charlie charley charly charlee shirley sharlie sea see " +
       "chan chang ching chong chung chin chino chinese " +
       "charlotte shortly channel chili chilly",
    d: "delta deltas dealt delt de dee",
    e: "echo ecko eco eggo echoes aiko",
    f: "foxtrot foxtrots foxtrott foxdrop fox ef eff " +
       "astra ostra otra austra oxtra",
    g: "golf golfs gulf gold goal gee",
    h: "hotel hotels hotell motel aitch age"
  });

  // Keys are digits, so Object.keys hands them back in numeric
  // order whatever order they are written in. Nothing reads the
  // order, but do not rely on it either.
  var NUMS = expand({
    1: "one won wan juan wun",
    2: "two too tu tue tew tube",
    3: "three tree free thee",
    4: "four for fore ford forth fourth foure forde",
    5: "five hive fife fiv",
    6: "six sex sicks seeks sics",
    7: "seven heaven sevin sevan",
    8: "eight ate hate ait eighth"
  });

  /* PIECE NAMES LEFT THE MOVE GRAMMAR AT w118 (owner's
   * design: moves are four coordinate items, nothing else),
   * and this table shrank from the program's largest scar
   * tissue to one job: naming the PROMOTION piece after an
   * "equals" keyword. Every spelling here was paid for with
   * a real game's mishearing - the history is in git at w117
   * - but the promotion word is spoken next to "equals",
   * which no other sentence contains, so the risky spellings
   * ("clean", "patient", "rug") are not carried forward:
   * they existed to catch piece names in open sentences, and
   * there are no open sentences left. What remains is each
   * piece's plain name and the transcriptions Safari returns
   * for it when spoken clearly.
   */
  var PIECES = expand({
    q: "queen queens quean quinn",
    r: "rook rooks rock rocks brook rooke",
    b: "bishop bishops bishup bish",
    n: "knight knights night nights nite"
  });

  /* A WHOLE SQUARE CAN FUSE INTO ONE WORD, and these are the
   * recoveries. The piece+file fusions (rookie, rugby, knife,
   * queenie...) died with the piece grammar at w118; what
   * survives is the family the four-item grammar still needs,
   * file+rank heard as one word. Each entry either cost a
   * real move (aquaphor, w84: "echo four" came back as
   * "Aquaphor" in BOTH readings and the move was lost) or
   * came from the w85 search of that proven mechanism - the
   * swallowed consonant and the o-becomes-w glide. Two bars,
   * as ever: a tight rendering of the sound, and not a word
   * said near numbers at a board.
   */
  var COMPOUND = {
    aquaphor: [["file", "e"], ["rank", "4"]],
    golfer: [["file", "g"], ["rank", "4"]],
    golfers: [["file", "g"], ["rank", "4"]],
    gopher: [["file", "g"], ["rank", "4"]],
    gophers: [["file", "g"], ["rank", "4"]],
    gofer: [["file", "g"], ["rank", "4"]],
    chariot: [["file", "c"], ["rank", "8"]],
    chariots: [["file", "c"], ["rank", "8"]],
    equate: [["file", "e"], ["rank", "8"]],
    // The owner's own hearing of bravo+8, looser than the
    // rest of the batch - it grows a leading syllable - but
    // it is not a word anyone says at a board, so a line
    // that never fires costs nothing.
    abbreviate: [["file", "b"], ["rank", "8"]]
  };

  // (TAKE_WORDS and CASTLE_WORDS died at w118 with the piece
  // grammar: a capture is just the to-square holding their
  // piece, and castling is the king's own two-square move -
  // "echo one golf one". The spellings they held - "text" for
  // takes, "cassel" - are in git at w117 with the games that
  // earned them.)

  /* AND NOW ACROSS THE TABLES, NOT JUST WITHIN THEM (w54).
   *
   * expand() throws when one word is given two values inside a
   * single map - that is what the grouped shape above is for -
   * and nothing checked the same word appearing in two
   * DIFFERENT maps, where it is just as wrong and quieter.
   * readItems tries the tables in a fixed order; a word in two
   * of them is decided by that order, silently, and the
   * loser's meaning simply never happens. These tables only ever grow, one real log at a
   * time - "cakes" at w48, "text" at w44, the whole plant
   * family - and a homophone landing in two of them is exactly
   * the kind of thing that gets added twice by two different
   * sessions reading two different game logs.
   *
   * Checked at load, throwing like expand() does, because a
   * grammar that is wrong should refuse to start rather than
   * quietly mean something else. FILLER is deliberately NOT in
   * the set: it is consumed last on purpose, so a word in both
   * FILLER and a value map reads as the value, which is how
   * "a" works.
   */
  (function crossCheckVocabulary() {
    // COMPOUND joined the check at w65. The reason is
    // structural, not about any one entry: it is consumed
    // BEFORE the others in readItems, so a word in both wins
    // here and the other meaning silently never happens - the
    // loudest version of exactly the bug this guard exists
    // for.
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
  // THE QUERY-ERA FILLER LEFT AT w133. "whose whos who
  // which" (v65) and "how much many left remaining whats
  // hows got have has do does me we us" existed to soak up
  // the framing of the position and time queries - "whose
  // turn", "how much time is left" - and the queries died
  // at w118. The owner's 17 Aug 2026 vocabulary trim
  // cleared them: the two ways to ask for the time are the
  // bare words "clock" and "time", and a framed sentence
  // around them is now stray talk like any other. "i"
  // STAYS, though it arrived with that family: "I resign"
  // is natural speech, and a filler word that guards a
  // game-ending command earns its line.
  // "a" and "an" joined in v121: game21 said "resign" and
  // Safari returned "A resign", which classifyCommand
  // counted as a content word and refused, so the resign
  // needed saying twice. Every command classifier requires
  // no other content, so a stray article breaks all of
  // them. readItems is untouched: its own "a" branch runs
  // BEFORE the filler check, so the a-file still reads as
  // the a-file when a rank follows it.
  // "of" joined at w115: Safari wrote the owner's "bishop
  // charlie four" as "Patient OF Charlie four", and since
  // w115 an unaccounted word next to a bare square raises a
  // question, a stray "of" would have raised one on its own.
  // It carries no meaning here in any sentence this grammar
  // accepts, so it is filler like "the" and "on".
  var FILLER = wordSet("please move moves play plays the piece um " +
    "uh a an then and go goes on my is it to into onto i of");

  var YES_WORDS = wordSet("yes yeah yep yup correct right confirm " +
    "confirmed affirmative ok okay sure aye");
  var NO_WORDS = wordSet("no nope wrong negative next nah");
  var CANCEL_WORDS = wordSet("cancel nevermind forget stop abort");
  // ONE WORD PER COMMAND SINCE w133 (owner's trim, made
  // while rewriting the instructions): the accepted
  // vocabulary is kept as small as it can be, so the
  // instructions can say "repeat" and mean exactly that.
  // "again pardon what say" are in git at w132 - "what" and
  // "say" especially were command words made of ordinary
  // room talk.
  var REPEAT_WORDS = wordSet("repeat");
  // CLOCK_WORDS is the word "clock" itself; TIME_WORDS is
  // the other way to ask for the remaining time (w133).
  // They are separate sets because "flip clock" requires a
  // CLOCK word specifically - the owner killed "swap time"
  // by name, and "timer" with it.
  var CLOCK_WORDS = wordSet("clock clocks");
  var TIME_WORDS = wordSet("time");
  // "flip" alone since w134: the owner learned "swap clock"
  // had survived the w133 trim and killed the whole synonym
  // family ("swap swaps switch reverse mirror") - "flip
  // clock" is the phrase, as the instructions say. The
  // plural stays for the same reason "clocks" does: a
  // spelling the mic plausibly returns for the word spoken.
  var FLIP_WORDS = wordSet("flip flips");
  var RESIGN_WORDS = wordSet("resign resigns surrender");
  var DRAW_WORDS = wordSet("draw");
  var MEMO_WORDS = wordSet("memo memos");

  // (CHECK_WORDS and MATE_WORDS died at w118: check is a fact
  // about the position after a move, and the four-item grammar
  // carries no adjectives. The announcements still SAY check
  // and mate - that is sanToSpeech's, on the way out.)

  // MATCHED AS SPELLED, NEVER USED AS A FUZZY TARGET.
  // These are spellings iOS has actually returned, not
  // words anyone says, so an exact hit is all they are for.
  // Left in the fuzzy dictionary they seed a halo of their
  // own: the eight c-file spellings alone pulled 86
  // ordinary English words onto the c-file, "change",
  // "chance", "coming", "coin", "thing" and "hang" among
  // them, each one edit from "ching" or "chan". Since "for"
  // is a homophone of four, "are you coming for tea" parsed
  // as c4. Listed here they still match when spoken and
  // seed nothing.
  var FUZZY_EXACT_ONLY = wordSet("chan chang ching chong chung " +
    "chin chino chinese charlotte shortly " +
    // v121, game21. Each would drag ordinary words in as
    // a fuzzy target: "astra"/"ostra" sit one edit from
    // "extra" and "ultra", "ruts" from "rats", "cuts",
    // "nuts" and "ruth", "bitch" from "pitch", "ditch" and
    // "witch", "shortly" from "shorty". Named as spellings
    // they still match when spoken and seed nothing.
    "astra ostra otra austra oxtra ruts bitch vision visions " +
    // v134, game24. "channel" is the first c-file spelling
    // that is an everyday word, and the worst-shaped one:
    // "channels", "chapel", "change" and "chancel" are all
    // one or two edits away and none of them is the file.
    "channel " +
    // w59, game w58-1. "clean" is the first QUEEN spelling
    // that is an everyday word, and it is badly shaped: six
    // ordinary words sit one edit away - clear, clan, lean,
    // glean, cleans, cleat - and "clear" and "lean" are both
    // things a person says at a board. As a fuzzy target it
    // would turn all six into queens; named as a spelling it
    // matches when spoken and seeds nothing.
    "clean " +
    // w114. "chili" and "chilly" are everyday words with an
    // everyday neighbourhood - chill, chills, child, hilly,
    // dilly - and none of that family is the c-file. Named
    // as spellings they match when spoken and seed nothing.
    "chili chilly " +
    // w115. "patient" is the bishop by the same rule and the
    // same hazard, one size worse: at seven letters the fuzzy
    // matcher allows TWO edits, which reaches "patients",
    // "patience", "ancient" and "impatient".
    "patient");

  // Ordinary words sit one edit from vocabulary words and
  // were being converted silently: "good" became "gold", a
  // golf homophone, and "lord" became "ford", a four
  // homophone. Both invent a move component out of ordinary
  // speech. These are never guessed at. To disable this
  // guard, empty the list and delete the FUZZY_NEVER line
  // in fuzzyToken, in parsing.js.
  var FUZZY_NEVER = wordSet(
    "lord load word ward cord form good goods gone going cold " +
    "hold told sold bold fold food wood hood mood door " +
    "done some same come time like make made more most that " +
    "this than them they what when were well will with " +
    "here hear near year your yeah give live love over " +
    "only just must back been best nice mine name wait " +
    "want damn hell crap oops");

