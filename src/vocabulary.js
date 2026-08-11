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

  var PIECES = expand({
    k: "king kings kin",
    // "clean" joined at w59 from game w58-1, where "queen
    // check" came back as "Clean check" twice running. The
    // fuzzy matcher could never have reached it: "clean" is
    // three edits from "queen" and two from "quean", and a
    // five-letter word is only allowed one. Exact-only below,
    // because it is an everyday word with everyday neighbours.
    q: "queen queens green quean creed quinn clean",
    // "rug" joined at w65 from game w64-1, where Safari
    // returned it four times in one game - "Rug B8", "Rug
    // takes Echo for", "Rug D2", "Rug takes foxtrot five" -
    // and every one survived only because a rival reading
    // spelled the same move "Rock". Alone it would have been
    // a lost move. Three letters, so the fuzzy matcher cannot
    // reach it or seed from it either way (both ends of
    // fuzzyToken require four).
    r: "rook rooks rock rocks brook ruck roof rooke brooke ruts rug",
    // "patient" joined at w115 from the game of 11 Aug, where
    // "bishop charlie four" came back as "Patient Charlie four"
    // and "Patient of Charlie four" - BOTH readings, so there
    // was no undamaged rival, and what played was the c-pawn.
    // Exact-only, like "clean": it is an everyday word with an
    // everyday neighbourhood, and a seven-letter fuzzy target
    // gets two edits of room - enough to swallow "patients",
    // "patience", "ancient" and "impatient", none of which is
    // a bishop.
    b: "bishop bishops bishoff bishup fish fisher fishop ship bish " +
       "vision visions bitch patient",
    // WHAT EARNS A WORD A PLACE IN THESE TABLES, stated
    // after w113 got it wrong for a day: a spelling joins
    // because Safari RETURNED it when a vocabulary word was
    // SPOKEN - "note" is here because saying "knight"
    // produced it, "clean" because saying "queen" did -
    // never because a word merely rhymes with or resembles
    // a piece name. "light" was added on that misreading
    // and REVERTED at w114: the owner had said "light" ON
    // PURPOSE, as a test, and mapping it here would have
    // made the program mishear him by design. Every rhyme
    // (sight, bite, kite) is the same reductio. A deliberate
    // non-vocabulary word is DROPPED, and since w114 an
    // ambiguous near-miss drop is at least logged - see
    // fuzzyToken.
    n: "knight knights night nights nite note notes",
    // "plant" and its family joined at w48 from game w47-1,
    // where the owner spent four minutes failing to say the
    // word: Safari returned pawn as Plants, Plant, Plantains,
    // Fontes, Pontes and Po across six utterances, three of
    // which lost a move outright. They are the reason "push"
    // exists (v120) and the reason it is still the better
    // word to say - but the log has them, so the table has
    // them. Exact-only, like every entry here.
    p: "pawn pawns prawn pond palm porn ponte ponta pote potes " +
       "pons poon paun poan ponn pot pawnd born pon pollen " +
       "plant plants plantain plantains fontes pontes po " +
       "paw paws pan push pushes pushed"
  });

  // Safari runs a piece name into the file that follows it:
  // "rook e one" comes back as "rookie one", where "rook
  // e" has fused into a single word. Splitting these back
  // into their parts is the only way to recover the move.
  // Left in its own shape: the value is a sequence, not a
  // single symbol, so it does not invert.
  // w65, game w64-1: the same fusion, but onto BRAVO rather
  // than the e-file. "Rook b8" came back as "Rugby" and
  // "Rugby eight" - BOTH readings of one utterance, so there
  // was no undamaged rival to fall back on and the move was
  // simply lost ("Say again."). That, not the word, is what
  // was new: an entry here calling rugby "an ordinary English
  // word, unlike the rest" was wrong on sight, since rookie
  // and politics are sitting right beside it.
  //
  // THE FUSION FOLLOWS THE VOWEL. Every entry below runs a
  // piece word into a letter whose spoken name ends in the
  // "ee" sound - e ("ee"), b ("bee") - which is exactly the
  // sound that has nothing to separate it from the tail of
  // "rook" or "bishop". That makes c ("cee"), d ("dee") and
  // g ("gee") the untested rest of the same family.
  var COMPOUND = {
    rookie: [["piece", "r"], ["file", "e"]],
    rookies: [["piece", "r"], ["file", "e"]],
    rooky: [["piece", "r"], ["file", "e"]],
    rugby: [["piece", "r"], ["file", "b"]],
    rugbys: [["piece", "r"], ["file", "b"]],
    bishopy: [["piece", "b"], ["file", "e"]],
    // KNIGHT+E WAS SPELLED THE ONE WAY SAFARI WILL NOT WRITE
    // IT (w66). "knightie" has been the only entry for this
    // fusion since the userscript, and PIECES three tables up
    // records what Safari actually does with the word: it
    // writes knight as NIGHT, silent k gone, every time. So
    // the fused form arrives as "nightie" or "nighty" and hit
    // neither. Not a new fusion - the same one, finally
    // spelled the way it turns up. "knightie" stays: it costs
    // one line and something may yet produce it.
    knightie: [["piece", "n"], ["file", "e"]],
    nightie: [["piece", "n"], ["file", "e"]],
    nighty: [["piece", "n"], ["file", "e"]],
    politics: [["piece", "p"], ["take"]],
    pontic: [["piece", "p"], ["take"]],
    pontics: [["piece", "p"], ["take"]],
    pontikes: [["piece", "p"], ["take"]],
    pontakes: [["piece", "p"], ["take"]],
    // SEARCHED FOR, NOT STUMBLED ON (w78). Every entry above
    // was paid for with a lost move in a real game before it
    // earned its line. But the family was never mysterious -
    // the fusion rule three comments up names its own untested
    // members - so for once English was searched ahead of the
    // log: a word list run against every piece+file fusion,
    // and the snug fits added before some accent pays for them
    // one game at a time. Two bars, and a word must clear
    // both. It must be a TIGHT rendering of the fusion, and it
    // must not be a word said near numbers at a board: "nice"
    // and "knee" are exactly the sound of knight+c and
    // knight+e and stayed out, because this table is consumed
    // first and asks no questions - "nice one" must never
    // become a knight to c1. The d-file stays empty: English
    // offered nothing snug. Exact-only by construction, like
    // every compound - none of these can seed the fuzzy
    // matcher.
    roxy: [["piece", "r"], ["file", "c"]],
    roxie: [["piece", "r"], ["file", "c"]],
    // "rock" has been the rook since w65, so rock+ee is the
    // rookie fusion in that spelling.
    rocky: [["piece", "r"], ["file", "e"]],
    // The one the search was worth doing for: "knight f
    // three" is Nf3, the commonest move in chess, one
    // swallowed t away from coming back as "knife three".
    knife: [["piece", "n"], ["file", "f"]],
    ponzi: [["piece", "p"], ["file", "c"]],
    pansy: [["piece", "p"], ["file", "c"]],
    pony: [["piece", "p"], ["file", "e"]],
    pawnee: [["piece", "p"], ["file", "e"]],
    pontiff: [["piece", "p"], ["file", "f"]],
    punchy: [["piece", "p"], ["file", "g"]],
    quincy: [["piece", "q"], ["file", "c"]],
    quincey: [["piece", "q"], ["file", "c"]],
    queenie: [["piece", "q"], ["file", "e"]],
    queeny: [["piece", "q"], ["file", "e"]],
    cringy: [["piece", "q"], ["file", "g"]],
    cringey: [["piece", "q"], ["file", "g"]],
    kinsey: [["piece", "k"], ["file", "c"]],
    kingie: [["piece", "k"], ["file", "e"]],
    kingy: [["piece", "k"], ["file", "e"]],
    clingy: [["piece", "k"], ["file", "e"]],
    // A WHOLE SQUARE CAN FUSE TOO (w84, game of 7 Aug):
    // "echo four" came back as "Aquaphor" - in BOTH readings
    // of the utterance, so as with rugby there was no
    // undamaged rival and the move was lost outright ("Say
    // again."). The first entry to emit file+rank rather
    // than piece+file; the parser replays any symbol
    // sequence, so the shape costs nothing new. Both bars
    // hold: a tight rendering of the sound, and a skin-cream
    // brand is not a word said near numbers at a board.
    aquaphor: [["file", "e"], ["rank", "4"]],
    // AND THE SQUARE FAMILY WAS THEN SEARCHED, AS w78
    // SEARCHED THE PIECE+FILE ONE (w85, owner's ask). Same
    // two bars, and the logged mechanisms as the guide: the
    // swallowed-consonant run-on (rugby, knife) and the o
    // that becomes w before a vowel, which is what aquaphor
    // proved for echo. "golfer" is the tightest here - golf
    // and four share the f outright. What the search
    // REJECTED is in HISTORY.md at w85; two rejections are
    // load-bearing enough to restate: "alone" (alpha+1) is
    // an everyday word said in asides near a live mic, and
    // "bravado", a snug bravo+2, already sits in NATO
    // meaning bare "bravo" - a logged meaning is never
    // traded for a guessed one.
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

  // "text" and "texts" are the take word with its k gone
  // (w44, game w43-1): "Texts bravo" survived at 17:27:38
  // only because a rival transcript got it right, and "Text
  // Delta" at 17:31:04 lost the move outright - "- - - d -",
  // no capture, "Say again." Exact-only like every other
  // risky entry, v114 style: three of these are ordinary
  // English words, and the fuzzy matcher must never reach
  // for them. Nothing in this grammar says "text" otherwise.
  var TAKE_WORDS = wordSet("takes take taking tates tanks tags tag " +
    "ticks tick text texts cakes cake captures capture capturing");
  var CASTLE_WORDS = wordSet("castle castles castling cassel cattle " +
    "castel hassle");

  /* AND NOW ACROSS THE TABLES, NOT JUST WITHIN THEM (w54).
   *
   * expand() throws when one word is given two values inside a
   * single map - that is what the grouped shape above is for -
   * and nothing checked the same word appearing in two
   * DIFFERENT maps, where it is just as wrong and quieter.
   * parseTranscript tries NATO, then NUMS, then PIECES, then
   * the take words; a word in two of them is decided by that
   * order, silently, and the loser's meaning simply never
   * happens. These tables only ever grow, one real log at a
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
    // BEFORE all four of the others in parseTranscript, so a
    // word in both wins here and the other meaning silently
    // never happens - the loudest version of exactly the bug
    // this guard exists for. That the table is full of real
    // English words (rookie, politics, rugby) is what makes
    // the collision reachable at all.
    var maps = { NATO: NATO, NUMS: NUMS, PIECES: PIECES,
                 TAKE_WORDS: TAKE_WORDS, CASTLE_WORDS: CASTLE_WORDS,
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
  // whose/whos/who/which joined in v65 so that "whose time
  // is it" reaches the clock and "whose turn" the turn
  // answer, instead of counting as unknown words. Filler is
  // consumed before the fuzzy matcher runs, so none of them
  // can be bent into part of a move.
  // "a" and "an" joined in v121: game21 said "resign" and
  // Safari returned "A resign", which classifyCommand
  // counted as a content word and refused, so the resign
  // needed saying twice. Every command classifier requires
  // no other content, so a stray article breaks all of
  // them. parseTranscript is untouched: its own "a" branch
  // runs BEFORE the filler check, so the a-file still
  // reads as the a-file in "a takes bravo five".
  // "of" joined at w115: Safari wrote the owner's "bishop
  // charlie four" as "Patient OF Charlie four", and since
  // w115 an unaccounted word next to a bare square raises a
  // question, a stray "of" would have raised one on its own.
  // It carries no meaning here in any sentence this grammar
  // accepts, so it is filler like "the" and "on".
  var FILLER = wordSet("please move moves play plays the piece um " +
    "uh a an then and go goes on my is it to into onto how much " +
    "many left remaining whats hows got have has do does me we us " +
    "i whose whos who which of");

  var YES_WORDS = wordSet("yes yeah yep yup correct right confirm " +
    "confirmed affirmative ok okay sure aye");
  var NO_WORDS = wordSet("no nope wrong negative next nah");
  var CANCEL_WORDS = wordSet("cancel nevermind forget stop abort");
  var REPEAT_WORDS = wordSet("repeat again pardon what say");
  var CLOCK_WORDS = wordSet("clock clocks time timer");
  var FLIP_WORDS = wordSet("flip flips swap swaps switch reverse mirror");
  var RESIGN_WORDS = wordSet("resign resigns surrender");
  var DRAW_WORDS = wordSet("draw");
  var MEMO_WORDS = wordSet("memo memos");

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
  var CHECK_WORDS = wordSet("check checks checked checking mate " +
    "checkmate checkmates check-mate mates");

  // The subset that means MATE, not merely check. "mate"
  // narrows harder than "check": among candidates that all
  // give check, only the mating ones can be what was meant.
  // Game20's mate took five tries (18:18) partly because
  // Safari spells checkmate as "check me" - three times in
  // one game - so saysMate() below also reads that pair.
  var MATE_WORDS = wordSet("mate mates checkmate checkmates " +
    "check-mate");

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

