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
  function splitForSpeech(text) {
    var parts = [], buf = "", i, c, gap;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      buf += c;
      if (c === "." || c === "," || c === ";" || c === ":") {
        gap = (c === ",") ? GAP_CLAUSE_MS : GAP_SENTENCE_MS;
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
  function speak(text) {
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
    splitForSpeech(text).forEach(function (p) { speakQueue.push(p); });
    pumpSpeech();
  }

  /* SPOKEN FOR THE EAR, LOGGED FOR THE EYE (w121). Every
   * English voice reads "lichess" as "LITCH-ess" (the w39
   * finding), and Ava reads "bravo" with the wrong first
   * vowel (13 Aug: "BRO-vo", and the first fix "brahvo"
   * came back "BRE-vo" - the vowel the owner specified is
   * the o of octopus, whose stable English spelling is aw).
   *
   * The old fix respelled the SENTENCES: "lee chess" was
   * written into the source strings, so every SAY line
   * carried the phonetic form into the log this project
   * asks users to paste. The owner asked for the log to
   * read normally - Lichess and bravo, not their phonetic
   * forms. So the sentences are written with the real
   * words, log("SAY") records them as written, and this
   * table is applied at the LAST moment, on the text handed
   * to the synthesizer and nowhere else (pumpSpeech).
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
   * AND ITS LIMIT IS WHY THE "CHESS" STYLE DIED (w126).
   * That style spoke bare file letters, and three listens
   * chased them through the table: "A 5" was the article,
   * "G 6" the unit gram, "ay" came back "aye", "ee" came
   * back as two e-sounds. Letter names are one mouth-moment
   * long - there is nothing for spelling-to-sound rules to
   * grip - and the owner ended it: he could not hear the
   * letters clearly, whatever they were fed as. The
   * EAR_LETTER table and its capital-before-digit matcher
   * are deleted with the style. Do not reintroduce spoken
   * bare letters; the NATO words exist precisely because
   * single letters fail this way in both directions, ear
   * and mouth alike. */
  function forTheEar(text) {
    return String(text)
      .replace(/lichess/gi, "lee chess")
      .replace(/\bbravo\b/gi, "brawvo");
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

  // Both surviving styles speak NATO files (w126, chess
  // deleted): a square is its NATO word and its rank.
  function spokenSquare(square) {
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
    // ONE FLAT PHRASE, AND THAT IS A CLOSED CASE (w122-w124,
    // two tries, owner's verdict both ways). A comma between
    // every item was tried at the full clause gap (staccato)
    // and at a dedicated 110ms (still choppy) - and the
    // chunking had a cost no number could fix: splitting
    // hands the synthesizer each item as its own utterance,
    // which changes how the words themselves are voiced.
    // "queen" and "takes" stopped sounding like words in a
    // sentence. Do not re-propose comma-pacing inside a move
    // announcement; a future fix has to change what the
    // synthesizer is HANDED (forTheEar above is that lever),
    // not how the sentence is chopped.
    var words = "";
    var piece = SPOKEN_PIECE[text[0]];
    if (piece) { words = piece + " "; text = text.slice(1); }
    var takes = text.indexOf("x") >= 0;
    var parts = text.split("x");
    var target = parts[parts.length - 1].slice(-2);
    var from = parts[0].slice(0, parts[0].length - (takes ? 0 : 2));
    if (from) {
      words += (SPOKEN_FILE[from[0]] || from[0]) + " ";
      if (from.length > 1) words += from[1] + " ";
    }
    if (takes) words += "takes ";
    words += spokenSquare(target);
    if (promoted) words += ", promotes to " + SPOKEN_PIECE[promoted[1]];
    words += checkWord(san);
    return words;
  }

  /* HOW A MOVE IS SPOKEN IS THE MOVE_SPEECH SETTING (w120;
   * two-way since w126 - settings.js has the table). pieces
   * is sanToSpeech: the piece and where it landed. squares
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
    if (MOVE_SPEECH === "squares" && uci && uci.length >= 4) {
      // A COMMA BETWEEN THE SQUARES (w121): spoken flat,
      // "delta 7 delta 5" ran on as one breathless phrase
      // (owner's report, first game on the style). The comma
      // buys the same GAP_CLAUSE_MS pause every spoken comma
      // gets (splitForSpeech), so the two squares land as
      // two things - from, then to.
      var words = spokenSquare(uci.slice(0, 2)) + ", " +
                  spokenSquare(uci.slice(2, 4));
      if (uci.length > 4 && SPOKEN_PIECE[uci[4].toUpperCase()]) {
        words += ", promotes to " + SPOKEN_PIECE[uci[4].toUpperCase()];
      }
      words += checkWord(san || "");
      return words;
    }
    return sanToSpeech(san);
  }

