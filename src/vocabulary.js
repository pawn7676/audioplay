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
    c: "charlie charley charly charlee shirley sharlie sea see " +
       "chan chang ching chong chung chin chino chinese " +
       "charlotte shortly channel",
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
    q: "queen queens green quean creed quinn",
    r: "rook rooks rock rocks brook ruck roof rooke brooke ruts",
    b: "bishop bishops bishoff bishup fish fisher fishop ship bish " +
       "vision visions bitch",
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
  var COMPOUND = {
    rookie: [["piece", "r"], ["file", "e"]],
    rookies: [["piece", "r"], ["file", "e"]],
    rooky: [["piece", "r"], ["file", "e"]],
    bishopy: [["piece", "b"], ["file", "e"]],
    knightie: [["piece", "n"], ["file", "e"]],
    politics: [["piece", "p"], ["take"]],
    pontic: [["piece", "p"], ["take"]],
    pontics: [["piece", "p"], ["take"]],
    pontikes: [["piece", "p"], ["take"]],
    pontakes: [["piece", "p"], ["take"]]
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
    var maps = { NATO: NATO, NUMS: NUMS, PIECES: PIECES,
                 TAKE_WORDS: TAKE_WORDS, CASTLE_WORDS: CASTLE_WORDS };
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
  var FILLER = wordSet("please move moves play plays the piece um " +
    "uh a an then and go goes on my is it to into onto how much " +
    "many left remaining whats hows got have has do does me we us " +
    "i whose whos who which");

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
    "channel");

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

