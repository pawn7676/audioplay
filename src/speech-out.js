  /*================== SPEECH OUT (gates the mic) ==================*/

  var SPOKEN_FILE = { a: "alpha", b: "bravo", c: "charlie", d: "delta",
    e: "echo", f: "foxtrot", g: "golf", h: "hotel" };
  var SPOKEN_PIECE = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };

  var speechReady = false, speakQueue = [], speaking = false, speakGuard = null;
  var voicePicked = null, spokeOnce = false, noSynthLogged = false;
  var missLogged = null;

  // iOS often returns an empty voice list until speech has
  // actually been used once, and Safari does not reliably
  // fire onvoiceschanged. So poll, and re-check after the
  // first tap, instead of trusting a single early call.
  var voiceTries = 0;

  // SILENT WHEN IT WORKS (v106). This used to log the
  // installed and English voice counts once, and again
  // that VOICE_NAME was unset - both printed every
  // session and said the same thing every time, which is
  // noise in a log read to find bugs. The counts had one
  // job: making a missing voice diagnosable. That is now
  // the job of the miss path below, which prints the full
  // list only when VOICE_NAME was set and did not match -
  // the only moment the names are actually wanted.
  function loadVoices() {
    // An empty list is not a failure: iOS returns nothing
    // until speech has been used once, and the false
    // return is what tells the boot poller to keep trying.
    var list = [];
    try { list = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!list.length) return false;
    // cleared so a reloaded voice list cannot leave a
    // stale pick behind
    voicePicked = null;
    if (!VOICE_NAME) {
      // THE EMPTY STRING IS THE RECOMMENDED SETTING, and
      // the mechanism is the whole reason: Safari uses the
      // voice for the PAGE language rather than whichever
      // entry carries the default flag, and iOS then
      // substitutes the best installed variant of it. So
      // whatever is chosen as the SYSTEM voice arrives
      // here - including a downloaded Premium or Enhanced
      // voice that getVoices() never lists by name. See
      // the note above VOICE_NAME for the Settings path.
      return true;
    }
    var want = VOICE_NAME.toLowerCase();
    for (var i = 0; i < list.length; i++) {
      if (list[i].name.toLowerCase().indexOf(want) >= 0) {
        voicePicked = list[i];
        if (missLogged !== "ok:" + VOICE_NAME) {
          missLogged = "ok:" + VOICE_NAME;
          log("TTS", "using voice " + list[i].name +
              " (" + (list[i].lang || "?") + ")");
        }
        return true;
      }
    }
    if (missLogged === VOICE_NAME) return true;
    missLogged = VOICE_NAME;
    if (/siri/i.test(VOICE_NAME)) {
      log("TTS", "Siri voices are private to Apple and are " +
          "never offered to web pages");
    } else {
      log("TTS", "voice not found: " + VOICE_NAME);
    }
    // built HERE, not at the top: v106 removed the
    // per-session voice counts and took the list with
    // them, leaving these two uses referencing nothing.
    // This path is the only one that wants the names.
    var eng = list.filter(function (v) {
      return /^en/i.test(v.lang || "");
    });
    log("TTS", "English voices: " + (eng.length
      ? eng.map(function (v) { return v.name; }).join(", ")
      : "none"));
    return true;
  }

  function pollVoices() {
    if (loadVoices()) return;
    if (voiceTries++ < 40) setTimeout(pollVoices, 500);
    else log("TTS", "no voices reported by this browser");
  }

  try {
    if (window.speechSynthesis) {
      pollVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  } catch (e) {}

  function wakeSpeech() {
    if (speechReady || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.speak(new SpeechSynthesisUtterance(" "));
      speechReady = true;
    } catch (err) { log("TTS", "wake failed: " + err.message); }
  }

  // One long utterance comes out as a run-on sentence, because
  // the browser voice barely pauses at punctuation. So split on
  // punctuation and put real silence between the pieces.
  // commaGapMs (w123) is an optional override for what a comma
  // buys - the chess style's item commas take GAP_ITEM_MS
  // through it; left out, a comma is the clause gap as ever.
  function splitForSpeech(text, commaGapMs) {
    var parts = [], buf = "", i, c, gap;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      buf += c;
      if (c === "." || c === "," || c === ";" || c === ":") {
        gap = (c === ",") ? (commaGapMs || GAP_CLAUSE_MS)
                          : GAP_SENTENCE_MS;
        if (buf.replace(/[.,;:\s]/g, "")) {
          parts.push({ text: buf.trim(), gap: gap });
        }
        buf = "";
      }
    }
    if (buf.replace(/[.,;:\s]/g, "")) {
      parts.push({ text: buf.trim(), gap: GAP_SENTENCE_MS });
    }
    return parts;
  }

  // THE COLOR ANNOTATION IS GONE (w119). From w113 to w118
  // a move announcement carried a color word, written to
  // the log as "[black] ..." and never spoken. It earned
  // its place when a recapture made the read-back of your
  // own move and the announcement of the reply the same
  // sentence - game18 17:12 and 17:24 were both "queen
  // takes delta 4" - and the neighbouring MOV line could
  // not settle whose it was, since the 200 and the
  // gameState event arrive in either order. w118 ended the
  // spoken read-back (your own move confirms with the
  // chime, or "okay."), so the opponent is the only side
  // whose moves are spoken now: every SAY sentence is
  // theirs, and the MOV line beside it already names the
  // color. The owner read a game log, asked what the
  // bracket was still for, and the answer was nothing.
  function speak(text, commaGapMs) {
    if (!text) return;
    // EVERY output funnels through here, and since w110 it
    // all goes ONE way: to the voice. This point has twice
    // hosted a second, on-screen channel - silent mode
    // (v80-v108, see the v109 entry for why it went) and
    // the v129 clock-mode message strip with its channel
    // routing - and both died the same death: text on a
    // screen pulls the eyes off the physical board. The
    // strip and its switches were deleted at w110 (see the
    // clock.js header). If a third channel is ever
    // proposed, this comment is its history.
    log("SAY", text);
    splitForSpeech(text, commaGapMs).forEach(function (p) {
      speakQueue.push(p);
    });
    pumpSpeech();
  }

  // Which comma gap a move announcement carries (w123): the
  // chess style's commas separate single items and take the
  // short gap; the other styles' commas are clause commas -
  // NATO's from-then-to breath, "promotes to queen, check" -
  // and keep the standard pause. Every announcement call
  // site passes this, so the style's pacing travels with the
  // style.
  function moveGapMs() {
    return MOVE_SPEECH === "chess" ? GAP_ITEM_MS : GAP_CLAUSE_MS;
  }

  /* SPOKEN FOR THE EAR, LOGGED FOR THE EYE (w121). Three
   * pronunciation problems share one shape: every English
   * voice reads "lichess" as "LITCH-ess" (the w39 finding);
   * Ava reads "bravo" as "BRO-vo" (the owner's 13 Aug
   * report); and the chess announcement style's bare file
   * letters only sometimes carry the letter - "A 5" came
   * back "a five", the article, and "G 6" came back
   * "gram 6", the unit, while "rook G 6" was fine. The
   * capital was supposed to force the letter's name and
   * does not.
   *
   * The old fix respelled the SENTENCES: "lee chess" was
   * written into the source strings, so every SAY line
   * carried the phonetic form into the log this project
   * asks users to paste. The owner asked for the log to
   * read normally - Lichess and bravo, not their phonetic
   * forms. So the sentences are now written with the real
   * words, log("SAY") records them as written, and this
   * table is applied at the LAST moment, on the text handed
   * to the synthesizer and nowhere else (pumpSpeech).
   *
   * The letter row matches a capital heading toward a digit
   * - "C, 4", with an optional second square letter between
   * for the disambiguated "knight, B, D, 2" - a shape only
   * the chess style's squares produce in spoken text.
   *
   * WHY RESPELLING AND NOT PROPER PHONETICS: the standard
   * for saying a pronunciation precisely EXISTS - SSML's
   * <phoneme> tag carries IPA, and dictionary notation like
   * a-macron means the same thing - but Safari's
   * speechSynthesis takes plain text only: SSML is read out
   * as markup or stripped, and there is no lexicon hook.
   * (The W3C spec permits SSML input; no iOS Safari has
   * shipped it.) Respelling in ordinary spelling-to-sound
   * English is the one lever this platform offers, which is
   * why this table exists instead of a phoneme field.
   *
   * A IS "eh", NOT "ay" (second listen, 13 Aug): "ay" came
   * back from Ava as "aye"/"I", the wrong vowel entirely.
   * "eh" is the spelling this platform already equates with
   * the letter's sound - it is what Safari's own recognizer
   * writes for a spoken a (vocabulary.js lists it under the
   * a-file) - so the voice is being handed the recognizer's
   * own transcription back. */
  var EAR_LETTER = { A: "eh", B: "bee", C: "see", D: "dee",
                     E: "ee", F: "eff", G: "gee", H: "aitch" };
  function forTheEar(text) {
    return String(text)
      .replace(/lichess/gi, "lee chess")
      .replace(/\bbravo\b/gi, "brahvo")
      .replace(/\b([A-H])(?=,? (?:[A-H],? )?\d)/g, function (_, l) {
        return EAR_LETTER[l];
      });
  }

  // iOS fires onend while the audio is still playing. If the
  // next chunk is handed over then, the synthesizer queues it
  // internally and plays it back to back, so the gap elapses
  // silently underneath chunk one and is never heard. Wait for
  // the synthesizer to actually go quiet before timing the gap.
  function waitUntilQuiet(ceiling, cb) {
    var synth = window.speechSynthesis;
    var t0 = Date.now();
    (function check() {
      var busy = false;
      try { busy = synth.speaking || synth.pending; } catch (e) {}
      if (!busy || Date.now() - t0 > ceiling) return cb();
      setTimeout(check, 50);
    })();
  }

  function pumpSpeech() {
    if (speaking || !speakQueue.length) return;
    if (!window.speechSynthesis) {
      // nothing can be spoken here, but the panel this project
      // tells users to paste should say so rather than the
      // queue just emptying (w63)
      if (!noSynthLogged) {
        noSynthLogged = true;
        log("TTS", "no speechSynthesis in this browser - " +
            "spoken output is off");
      }
      speakQueue = [];
      return;
    }
    speaking = true;
    if (!MIC_ALWAYS_ON) pauseMic();
    var item = speakQueue.shift();
    var text = item.text;
    var gap = item.gap || 0;
    var t0 = Date.now();
    var tStart = 0;
    var settled = false;

    var advance = function (guardFired) {
      if (settled) return;
      settled = true;
      clearTimeout(speakGuard);
      // A WEDGED SYNTHESIZER IS RESET, NOT WALKED PAST (w63). An iOS
      // audio-session interruption mid-utterance - Siri, a
      // call, an alarm - can leave speechSynthesis stuck:
      // speaking forever, new utterances queued inside it and
      // never started. Every item here then died the same way:
      // onstart never fired, the guard advanced past it, and
      // the page went PERMANENTLY SILENT while looking, to
      // every test we have, like it was speaking. The detection
      // signal was already computed for the debug log and used
      // for nothing: the guard firing with tStart still 0 means
      // this utterance NEVER STARTED. cancel() flushes the
      // synthesizer's internal backlog (our own queue is
      // untouched - items are handed over one at a time),
      // resume() clears a stuck paused flag, and the cancelled
      // utterance's late onerror lands on `settled` harmlessly.
      if (guardFired && tStart === 0) {
        log("TTS", "utterance never started - resetting speech synthesis");
        try {
          window.speechSynthesis.cancel();
          window.speechSynthesis.resume();
        } catch (e) {}
      }
      var ceiling = Math.max(2500, text.length * 140);
      waitUntilQuiet(ceiling, function () {
        speaking = false;
        if (SPEAK_DEBUG) {
          // lag is how long the voice took to START talking,
          // which is the part that varies between voices.
          // spoke is mostly just how long the words take.
          log("TTS", "lag " + (tStart ? (tStart - t0) : -1) +
              "ms, spoke " + (Date.now() - t0) + "ms, gap " +
              gap + "ms  \"" + text + "\"");
        }
        if (speakQueue.length) {
          // speaking stays TRUE across the gap (w63): it was
          // cleared above first, so a speak() arriving inside
          // the gap window pumped immediately and the
          // deliberate pause between chunks was lost. The
          // delayed pump clears it itself.
          speaking = true;
          setTimeout(function () { speaking = false; pumpSpeech(); }, gap);
        }
        else {
          if (!MIC_ALWAYS_ON) resumeMicSoon();
          // THE MIC MAY NEVER HAVE STARTED (v105, game17,
          // found on the website build). startListening()
          // refuses while speech is in flight, and with
          // MIC_ALWAYS_ON nothing above resumes it. Here
          // the button starts the mic BEFORE connect()'s
          // announcement returns over the network, so the
          // race is narrow - but it exists any time the
          // button is tapped while anything is being
          // spoken, and on the website it left the mic
          // dead for half a minute with the button lit.
          // startListening() returns early if already
          // listening, so this costs nothing normally.
          else if (running && !listening) {
            log("MIC", "starting after speech (was blocked by it)");
            startListening();
          }
        }
      });
    };

    try {
      // the one place the phonetic respellings apply (w121):
      // the queue, the log and the debug line all carry the
      // text as written
      var u = new SpeechSynthesisUtterance(forTheEar(text));
      u.rate = SPEAK_RATE;
      u.pitch = SPEAK_PITCH;
      u.volume = 1;
      if (voicePicked) u.voice = voicePicked;
      if (SPEAK_DEBUG && !spokeOnce) {
        spokeOnce = true;
        log("TTS", "first utterance voice: " +
            (u.voice ? u.voice.name : "system default"));
      }
      u.onstart = function () { tStart = Date.now(); };
      u.onend = advance;
      u.onerror = advance;
      window.speechSynthesis.speak(u);
      speakGuard = setTimeout(function () { advance(true); },
                              1200 + text.length * 90);
    } catch (err) { advance(); }
  }

  // Only for the FIRST announcement after a tap. Waits
  // until the recogniser is actually running, so its grab
  // of the audio route cannot cut the words in half, and
  // then lets the SILENT PRIMER below be what settles the
  // route - the real utterance goes out on the next tick
  // after the primer has ended.
  //
  // (This said "leaves a further gap for the route to settle"
  // until w54, and there is no gap: the setTimeout that
  // follows the primer has no delay. The primer IS the
  // settling, which is the whole point of it - a comment
  // describing a second mechanism that does not exist would
  // send anyone debugging a clipped first word looking for a
  // timing bug instead of at the primer.)
  // iOS loses the FIRST thing spoken after the audio route
  // comes up. Not clipped, lost outright. Something has to
  // be spoken before the route is really live, so this
  // speaks a SILENT utterance and lets that be the one that
  // disappears. No extra words are ever heard.
  function primeAudioRoute(done) {
    var fired = false;
    var once = function () {
      if (fired) return;
      fired = true;
      done();
    };
    try {
      var u = new SpeechSynthesisUtterance("ready");
      u.volume = 0;
      u.rate = 2;
      u.onend = once;
      u.onerror = once;
      window.speechSynthesis.speak(u);
      setTimeout(once, 800);
    } catch (e) { once(); }
  }

  function speakWhenAudioSettled(text) {
    var waited = 0;
    (function check() {
      if (listening || waited >= 4000) {
        if (!listening) log("AUD", "mic never started, speaking anyway");
        primeAudioRoute(function () {
          log("AUD", "route primed silently");
          setTimeout(function () { speak(text); });
        });
        return;
      }
      waited += 100;
      setTimeout(check, 100);
    })();
  }

  // The file letter as the chosen style speaks it (w120):
  // the NATO word for hybrid and nato, the bare letter for
  // chess - upper-cased, which nudges a synthesizer toward
  // the letter's NAME ("bee four", not the article in
  // "a 4"). Output only: what the MIC accepts is
  // vocabulary.js's business and does not move with this.
  function fileWord(letter) {
    if (MOVE_SPEECH === "chess") return letter.toUpperCase();
    return SPOKEN_FILE[letter] || letter;
  }

  // A square in NATO regardless of the style: the nato
  // style speaks squares even when chess is not picked
  // anywhere near it, so it cannot ride fileWord.
  function natoSquare(square) {
    return (SPOKEN_FILE[square[0]] || square[0]) + " " + square[1];
  }

  // the check/mate suffix, which every shape below reaches at
  // the end and castling used to return past. "O-O+" was
  // announced as a bare "castles kingside" - the one move that
  // could give check without saying so, and the opponent's
  // castling is exactly the move being listened to rather than
  // watched.
  function checkWord(san) {
    if (san.slice(-1) === "#") return ", checkmate";
    if (san.slice(-1) === "+") return ", check";
    return "";
  }

  function sanToSpeech(san) {
    if (!san) return "";
    if (san.indexOf("O-O-O") === 0) return "castles queenside" + checkWord(san);
    if (san.indexOf("O-O") === 0) return "castles kingside" + checkWord(san);
    var text = san.replace(/[+#]$/, "").replace(/=([QRBN])/, "");
    var promoted = /=([QRBN])/.exec(san);
    // BUILT AS ITEMS, JOINED BY STYLE (w122): the chess
    // style puts a comma between every item - GAP_CLAUSE_MS
    // of real silence, via splitForSpeech - because "rook
    // D 7" spoken flat ran on (owner's second listen, the
    // same run-on NATO's squares had). hybrid keeps the flat
    // join it has always had; its NATO words carry their own
    // syllables.
    var items = [];
    var piece = SPOKEN_PIECE[text[0]];
    if (piece) { items.push(piece); text = text.slice(1); }
    var takes = text.indexOf("x") >= 0;
    var parts = text.split("x");
    var target = parts[parts.length - 1].slice(-2);
    var from = parts[0].slice(0, parts[0].length - (takes ? 0 : 2));
    if (from) {
      items.push(fileWord(from[0]));
      if (from.length > 1) items.push(from[1]);
    }
    if (takes) items.push("takes");
    items.push(fileWord(target[0]), target[1]);
    var words = items.join(MOVE_SPEECH === "chess" ? ", " : " ");
    if (promoted) words += ", promotes to " + SPOKEN_PIECE[promoted[1]];
    words += checkWord(san);
    return words;
  }

  /* HOW A MOVE IS SPOKEN IS THE MOVE_SPEECH SETTING (w120,
   * the owner's three-way switch - settings.js has the
   * table). chess and hybrid are sanToSpeech in two
   * spellings of the file letter (fileWord above). nato
   * drops the piece talk entirely and speaks the move's own
   * two squares, from then to - the same four items the
   * grammar asks the user to SAY, so what the page announces
   * is exactly what could be spoken back at it. The uci is
   * the truth for those squares: castling in uci is the
   * king's own move ("echo 1 golf 1"), which is also how it
   * is spoken IN. Promotion and the check suffix still come
   * off the san, the only place they are written.
   *
   * Every announcement funnels through here; sanToSpeech is
   * called directly only where no uci exists to offer.
   */
  function moveToSpeech(san, uci) {
    if (MOVE_SPEECH === "nato" && uci && uci.length >= 4) {
      // A COMMA BETWEEN THE SQUARES (w121): spoken flat,
      // "delta 7 delta 5" ran on as one breathless phrase
      // (owner's report, first game on the style). The comma
      // buys the same GAP_CLAUSE_MS pause every spoken comma
      // gets (splitForSpeech), so the two squares land as
      // two things - from, then to.
      var words = natoSquare(uci.slice(0, 2)) + ", " +
                  natoSquare(uci.slice(2, 4));
      if (uci.length > 4 && SPOKEN_PIECE[uci[4].toUpperCase()]) {
        words += ", promotes to " + SPOKEN_PIECE[uci[4].toUpperCase()];
      }
      words += checkWord(san || "");
      return words;
    }
    return sanToSpeech(san);
  }

