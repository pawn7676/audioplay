/*  audioplay-web — speech.js
 *  Read the app.js header first: it carries the project
 *  story, the hard constraints, and the file map.
 *
 *  This file is sections 7-10 of the userscript, ported
 *  verbatim: SPEECH OUT, the CHIMES tombstone, the MIC
 *  loop, and the KEEP-ALIVE. Every iOS platform finding
 *  lives here, next to the code it produced. Do not "fix"
 *  that code without reproducing the behaviour first:
 *
 *  - iOS SUSPENDS AudioContext with the screen off, and
 *    silently DISCARDS <audio> output while the mic is
 *    open. Chimes died to this over three versions (the
 *    section 8 tombstone). Only TTS speech is reliably
 *    audible, so any confirmation or alert MUST be spoken.
 *  - A PLAYING media element keeps the tab alive. The
 *    silent looping WAV in section 10 holds the iOS audio
 *    session; without it the page suspends with the screen
 *    off. It is NOT a chime and must not go with them.
 *  - A STOPPED RECOGNISER CANNOT RESTART with the screen
 *    off: it returns "not-allowed" and stays dead for the
 *    rest of the game. MIC_ALWAYS_ON = true is required,
 *    not a preference.
 *  - STARTING/STOPPING THE RECOGNISER plays iOS dictation
 *    tones. Also solved by MIC_ALWAYS_ON.
 *  - THE FIRST UTTERANCE after the audio route comes up
 *    is swallowed outright. A silent primer utterance
 *    absorbs it (primeAudioRoute, section 7).
 *  - onend FIRES WHILE AUDIO IS STILL PLAYING, so speech
 *    gaps poll speechSynthesis.speaking before timing the
 *    pause (waitUntilQuiet).
 *  - SAFARI CLIPS THE FIRST WORD of an utterance.
 *    Readings missing a leading piece name are demoted in
 *    parser.js, never deleted.
 *  - ONLY BUNDLED VOICES are exposed. Downloaded voices
 *    (Ava, Allison) and every Siri voice are unreachable
 *    from a web page.
 *  - data: URIs WERE REJECTED for audio; Blob URLs work.
 *
 *  BLUETOOTH IS A DIFFERENT ROUTE. Measured, not
 *  theorised: the opening announcement lost its first
 *  word and everything was painfully loud on BLUETOOTH
 *  HEADPHONES, and both went away entirely on the iPad's
 *  own speaker, same build, minutes apart. iOS switches a
 *  Bluetooth device to its hands-free profile when the
 *  microphone opens, and that switch costs both a moment
 *  of audio and a level change the page has no say in.
 *  SPEAKER PLAY IS THE TESTED CONFIGURATION. Do not chase
 *  a clipping report without asking what the audio was
 *  coming out of first.
 */

  /*-------------------- settings for this file --------------------*/

  // LEAVING VOICE_NAME EMPTY. With no voice set,
  // Safari uses the page-language default and iOS quietly
  // substitutes the highest quality variant you have
  // installed. Downloading "Samantha (Enhanced)" improves the
  // sound even though "Samantha (Enhanced)" never shows up
  // as a selectable name. Naming a voice explicitly can pin
  // the plain compact version instead, which sounds worse.
  // Only set this if the default is the wrong voice.
  //
  // HOW TO GET A GOOD VOICE ON iOS — do this once, on
  // the device, and every voice on this page improves.
  // Confirmed on an iPad with Ava (Premium):
  //
  //   Settings > General > Accessibility >
  //     Read & Speak > Voices > English > Voice
  //   pick a (Premium) or (Enhanced) entry and let it
  //   download, then leave THIS page's dropdown on
  //   "default".
  //
  // The menu has moved between iOS versions — older ones
  // call it Accessibility > Spoken Content > Voices — so
  // if the path above is wrong, look for Voices under
  // whichever Accessibility section mentions speech.
  //
  // THE LAST STEP IS THE COUNTERINTUITIVE ONE and it
  // CORRECTS AN EARLIER FINDING here, which said flatly
  // that downloaded voices could never be reached from a
  // web page. Half true: they are not offered by name in
  // getVoices(), so the dropdown cannot select them —
  // but Safari uses the voice for the PAGE LANGUAGE, and
  // iOS resolves that to whatever the system voice is
  // set to. So choosing Ava (Premium) in Settings makes
  // "default" here mean Ava (Premium). Naming a voice
  // explicitly does the opposite: it pins the plain
  // compact build, which is the 1990s-sounding one.
  //
  // Siri voices remain genuinely unreachable, and that
  // part of the old finding stands.
  //
  // Two cautions. AFTER AN iOS UPGRADE a downloaded
  // voice can still be listed while no longer actually
  // installed, silently reverting to the compact build —
  // if the sound gets worse after an update, re-download
  // it. And the Rate and Pitch sliders on that Settings
  // screen belong to VoiceOver and Speak Screen; this
  // page sets its own (SPEAK_RATE, SPEAK_PITCH below),
  // so change those here, not there.
  //
  // At w3 this became the STARTING value only: the Voice
  // panel offers whatever English voices the device
  // actually reports (they differ per device, so a
  // hardcoded list of "good" names would mostly name
  // voices that are not installed), and the choice is
  // saved. setVoiceName() below is what the dropdown
  // calls; empty string means "browser default", which
  // stays the default for the reasons above.
  var VOICE_NAME = "";

  // NO ALLOWLIST. The dropdown offers whatever English
  // voices the device reports, and this is the settled
  // answer after two wrong ones: w4 hardcoded six Apple
  // names (Windows and Android then saw an EMPTY list),
  // w7 hardcoded three vendor families (better, but still
  // a guess about hardware nobody here has). Any allowlist
  // is a claim about someone else's device, and it fails
  // silently and totally when the claim is wrong. What
  // the device reports is the only thing that is true
  // everywhere.
  //
  // THE ONE EXCLUSION is Apple's novelty voices: a fixed,
  // shipped set of joke voices — Bubbles, Zarvox, Bad
  // News — that are sound effects rather than accents or
  // alternatives, and that report en-US like any real
  // voice, since the Web Speech API exposes no quality or
  // category flag. This is a BLOCKLIST, not an allowlist,
  // and the difference is the whole point: on Windows,
  // Android or anything unknown, none of these names
  // exist, so nothing is filtered and every voice comes
  // through. It can subtract junk; it can never withhold
  // a real voice from a platform nobody anticipated.
  // Delete the list to see literally everything.
  var NOVELTY_VOICES = {
    albert: 1, "bad news": 1, bahh: 1, bells: 1, boing: 1,
    bubbles: 1, cellos: 1, deranged: 1, "good news": 1,
    jester: 1, organ: 1, "pipe organ": 1, superstar: 1,
    trinoids: 1, whisper: 1, wobble: 1, zarvox: 1,
    hysterical: 1
  };

  function isEnglishVoice(v) {
    return !!(v && v.lang && v.lang.toLowerCase().indexOf("en") === 0);
  }

  // What the dropdown SHOWS. The stored value is always
  // the platform's real name; this only tidies the label,
  // since "Microsoft Ravi - English (India)" is unreadable
  // on a phone. If tidying would empty the name, the real
  // one is kept.
  function voiceLabel(realName) {
    var n = String(realName || "");
    n = n.replace(/^Microsoft\s+/i, "");
    n = n.replace(/^Google\s+/i, "");
    n = n.replace(/\s*Online\s*\(Natural\)/i, "");
    n = n.replace(/\s*[-\u2014]\s*English.*$/i, "");
    return n.trim() || String(realName);
  }

  // Every English voice this device has, minus the joke
  // voices, in a stable order: the page-language matches
  // first, then the rest alphabetically. Empty until the
  // list arrives — iOS reports nothing until speech has
  // been used once, which is why loadVoices is polled and
  // re-run after the first tap.
  function englishVoices() {
    var list = [];
    try { list = window.speechSynthesis.getVoices() || []; } catch (e) {}
    var page = "en-us";
    try {
      if (navigator.language &&
          navigator.language.toLowerCase().indexOf("en") === 0) {
        page = navigator.language.toLowerCase();
      }
    } catch (e) {}
    var out = list.filter(function (v) {
      if (!isEnglishVoice(v)) return false;
      var n = String(v.name || "").toLowerCase().trim();
      return !NOVELTY_VOICES[n];
    }).map(function (v) {
      return { name: v.name, label: voiceLabel(v.name), voice: v };
    });
    out.sort(function (a, b) {
      var al = String(a.voice.lang || "").toLowerCase();
      var bl = String(b.voice.lang || "").toLowerCase();
      var ap = al === page ? 0 : 1, bp = bl === page ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return a.label.localeCompare(b.label);
    });
    return out;
  }

  // Called by the dropdown. Re-runs the picker at once so
  // the next utterance uses the new voice, and returns
  // whether the name was found.
  function setVoiceName(name) {
    VOICE_NAME = name || "";
    missLogged = null;
    defaultLogged = false;
    var ok = loadVoices();
    log("TTS", "voice set to " + (VOICE_NAME || "browser default"));
    return ok;
  }

  var SPEAK_RATE = 0.9;
  var SPEAK_PITCH = 1.0;

  // Starting the recogniser makes iOS take over the audio
  // route, which cuts off anything already speaking: the
  // opening line came out as one syllable. So the first
  // announcement waits for the mic to be running, then for
  // this long again before it says anything. Raise it if
  // the first words are still clipped or faint.
  var AUDIO_WARMUP_MS = 700;

  // Silence inserted between spoken chunks. Raise these if it
  // still runs together, lower them if it feels slow.
  var GAP_SENTENCE_MS = 450;   // after . ; :
  var GAP_CLAUSE_MS = 220;     // after ,

  // Logs the real duration of every spoken chunk to the log
  // panel. Set false once the pacing sounds right.
  var SPEAK_DEBUG = false;

  // Maximum number of lines in the log
  var LOG_MAX = 3000; 
  // Superseded by MIC_ALWAYS_ON below, which implies this.
  // Left here only so the recogniser can be made continuous
  // without also keeping the mic open during speech.
  var MIC_CONTINUOUS = false;

  // KEEP THIS ON IF YOU PLAY WITH THE SCREEN OFF. iOS will
  // not let a stopped recogniser start again while the
  // screen is off: the first time speech pauses the mic it
  // comes back "not-allowed" and stays dead for the rest of
  // the game. Leaving the mic running avoids the restart
  // entirely, so screen-off play works.
  //
  // ON by default, and the reason the dictation tones are
  // gone. Switching the mic off before speaking and back on
  // afterwards makes iOS play its own tone each time: those
  // were the chimes at the start and end of every sentence.
  //
  // Leaving the mic running avoids both. Anything heard
  // while speaking is thrown away instead, logged as
  // "ignored while speaking". Implies MIC_CONTINUOUS.
  //
  // Costs, both small with headphones: the mic can hear the
  // announcements on a speaker, and one long session has no
  // restart to recover from if Safari stops delivering
  // results. Watch "MIC listening (cycle N)": if it stops
  // climbing and moves stop registering, tap the button off
  // and on. Set false to go back to switching the mic.
  var MIC_ALWAYS_ON = true;

  // How long after speech ends to keep ignoring the mic, so
  // the tail of a sentence is not taken as a move.
  var MIC_IGNORE_TAIL_MS = 400;

  /*================ 7. SPEECH OUT (gates the mic) =================*/

  // How each file is SPOKEN back. Nothing here affects what
  // is understood, only what is heard, so any of these can
  // be respelled until the voice says it cleanly. Samantha
  // turns "golf" into something like "gwo-olf", so it is
  // spelled phonetically below. Others to try if a letter
  // sounds wrong: "gulf", "gawf", "alfa", "brah-vo",
  // "charly", "delta", "eck-oh", "fox trot", "ho-tell".
  var SPOKEN_FILE = { a: "alpha", b: "bravo", c: "charlie", d: "delta",
    e: "echo", f: "foxtrot", g: "gawlf", h: "hotel" };
  var SPOKEN_PIECE = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };

  var speechReady = false, speakQueue = [], speaking = false, speakGuard = null;
  var voicePicked = null, voicesLogged = false, spokeOnce = false;
  var missLogged = null, defaultLogged = false;

  // iOS often returns an empty voice list until speech has
  // actually been used once, and Safari does not reliably
  // fire onvoiceschanged. So poll, and re-check after the
  // first tap, instead of trusting a single early call.
  var voiceTries = 0;

  // Quiet by default. The full voice list is only printed
  // when VOICE_NAME was set and did not match, which is the
  // only time the names are actually needed.
  function loadVoices() {
    var list = [];
    try { list = window.speechSynthesis.getVoices() || []; } catch (e) {}
    if (!list.length) return false;
    var eng = list.filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf("en") === 0;
    });
    if (!voicesLogged) {
      voicesLogged = true;
      log("TTS", list.length + " voices installed, " + eng.length +
          " English");
    }
    voicePicked = null;
    if (!VOICE_NAME) {
      if (!defaultLogged) {
        defaultLogged = true;
        // Safari uses the voice for the PAGE language rather
        // than whichever entry carries the default flag, and
        // iOS then substitutes the best installed variant of
        // it. On an en-US page that is Samantha, and
        // Samantha (Enhanced) if it has been downloaded.
        log("TTS", "no VOICE_NAME set: using the browser " +
            "default for this page (en-US)");
      }
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

  function speak(text) {
    if (!text) return;
    // SILENT MODE (v80): every call site funnels through
    // here, so intercepting at this one point guarantees
    // that nothing the script has to say can escape as
    // sound — anything that would have been spoken is
    // rendered into the lower-right info area instead.
    // The few call sites whose content the overlay already
    // shows in a quadrant (my-move read-back, opponent move
    // announcements) skip speak() in silent mode at the
    // call site rather than duplicating themselves here.
    if (silentModeOn()) {
      log("SAY", "[shown] " + text);
      silentShowText(text);
      return;
    }
    log("SAY", text);
    splitForSpeech(text).forEach(function (p) { speakQueue.push(p); });
    pumpSpeech();
  }

  // iOS fires onend while the audio is still playing. If the
  // next chunk is handed over then, the engine queues it
  // internally and plays it back to back, so the gap elapses
  // silently underneath chunk one and is never heard. Wait for
  // the engine to actually go quiet before timing the gap.
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
    if (!window.speechSynthesis) { speakQueue = []; return; }
    speaking = true;
    if (!MIC_ALWAYS_ON) pauseMic();
    var item = speakQueue.shift();
    var text = item.text;
    var gap = item.gap || 0;
    var t0 = Date.now();
    var tStart = 0;
    var settled = false;

    var advance = function () {
      if (settled) return;
      settled = true;
      clearTimeout(speakGuard);
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
        if (speakQueue.length) { setTimeout(pumpSpeech, gap); }
        else {
          ignoreMicUntil = Date.now() + MIC_IGNORE_TAIL_MS;
          if (!MIC_ALWAYS_ON) resumeMicSoon();
          // THE MIC MAY NEVER HAVE STARTED (w14, game17).
          // startListening() refuses while speech is in
          // flight, and with MIC_ALWAYS_ON nothing above
          // resumes it, because the userscript could
          // assume the mic was already running by the
          // time anything was spoken: its button called
          // connect(), and the announcement came back
          // over the network long after startListening().
          //
          // The website broke that assumption. The game
          // connection belongs to SIGN-IN now, so the
          // "connected. you are white." announcement can
          // be mid-sentence when the round button is
          // first tapped. In game17 it was: the tap at
          // 23:17:24 started the keep-alive and then
          // bailed out of startListening, no cycle was
          // ever logged, and the mic stayed dead with the
          // button lit until voice was switched off and
          // on again at 23:17:54.
          //
          // So the end of speech is where the mic gets
          // re-checked. startListening() is idempotent —
          // it returns early if already listening — so
          // this costs nothing in the normal case.
          else if (running && !listening) {
            log("MIC", "starting after speech (was blocked by it)");
            startListening();
          }
        }
      });
    };

    try {
      var u = new SpeechSynthesisUtterance(text);
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
      speakGuard = setTimeout(advance, 1200 + text.length * 90);
    } catch (err) { advance(); }
  }

  // Only for the FIRST announcement after a tap. Waits
  // until the recogniser is actually running, so its grab
  // of the audio route cannot cut the words in half, then
  // leaves a further gap for the route to settle.
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

  // THE FIRST WORD IS EATEN, so let it be one that does not
  // matter (v100). primeAudioRoute already spends a SILENT
  // utterance on the route coming up, but the audible line
  // after it lost its opening syllable too — "practice
  // mode. you are white." arrived as "-ractice mode". A
  // short throwaway in front takes the damage instead.
  //
  // ON BLUETOOTH ONLY, as it turned out (v102): on the
  // iPad's speaker "starting." comes through whole and this
  // is a word you do not need. It is kept because headphones
  // are one pairing away and it costs a syllable; see the
  // BLUETOOTH block near the top. Set it to "" to hear the
  // announcements raw.
  var OPENING_THROWAWAY = "starting.";

  function speakWhenAudioSettled(text) {
    if (OPENING_THROWAWAY) text = OPENING_THROWAWAY + " " + text;
    var waited = 0;
    (function check() {
      if (listening || waited >= 4000) {
        if (!listening) log("AUD", "mic never started, speaking anyway");
        primeAudioRoute(function () {
          log("AUD", "route primed silently");
          setTimeout(function () { speak(text); }, AUDIO_WARMUP_MS);
        });
        return;
      }
      waited += 100;
      setTimeout(check, 100);
    })();
  }

  function spokenSquare(square) {
    return (SPOKEN_FILE[square[0]] || square[0]) + " " + square[1];
  }

  function sanToSpeech(san) {
    if (!san) return "";
    if (san.indexOf("O-O-O") === 0) return "castles queenside";
    if (san.indexOf("O-O") === 0) return "castles kingside";
    var text = san.replace(/[+#]$/, "").replace(/=([QRBN])/, "");
    var promoted = /=([QRBN])/.exec(san);
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
    if (san.slice(-1) === "#") words += ", checkmate";
    else if (san.slice(-1) === "+") words += ", check";
    return words;
  }

  /*========================== 8. CHIMES ===========================*/

  // REMOVED in v68, deliberately and after real testing: do
  // not bring chimes back without new evidence. Ten chimes
  // (WAV-rendered, played through <audio> elements for
  // screen-off survival) lived here through v67. Games 3
  // and 4 proved iOS silently discards media-element audio
  // while the mic is open: game4 logged SFX ok on all 39
  // accepted moves with zero playback errors, yet four were
  // inaudible, and neither a post-ack delay nor a doubled
  // length helped. Speech was never once lost in four
  // games, so every signal a chime carried is now spoken
  // ("ok.", the rejection sentence, the yes/no question)
  // and the renderer, BEEPS table, element cache, beep()
  // and warmChimes() were deleted. The keep-alive silent
  // WAV in section 10 is unrelated and stays: it holds the
  // iOS audio session, it is not a chime.

  /*================= 9. MIC / SPEECH RECOGNITION ==================*/

  var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null, listening = false, running = false;
  var restartTimer = null, micFails = 0, micCycles = 0, noSpeech = 0;
  var micBlockedLogged = false;
  var ignoreMicUntil = 0;

  function startListening() {
    if (!Rec) { log("MIC", "SpeechRecognition unavailable in this browser"); return; }
    // A REFUSAL USED TO BE SILENT, and that is how the
    // game17 dead mic hid: the button was lit, nothing in
    // the log said the mic had declined to start. Speech
    // blocking it is normal and self-healing (the speech
    // end re-checks), so it is logged once rather than
    // every time; anything else is worth seeing.
    if (!running) return;
    if (listening) return;
    if (speaking) {
      if (!micBlockedLogged) {
        micBlockedLogged = true;
        log("MIC", "not starting yet: speech in flight");
      }
      return;
    }
    micBlockedLogged = false;
    try {
      recognition = new Rec();
    } catch (e) { log("ERR", "new SpeechRecognition: " + e.message); return; }
    recognition.lang = "en-US";
    recognition.continuous = MIC_CONTINUOUS || MIC_ALWAYS_ON;
    recognition.interimResults = false;
    // Safari sometimes buries the correct reading: "echo
    // four" came back as "go for", "I go for", "go four"
    // with the right one fourth. More alternatives to sift
    // costs nothing, since every one is checked for a legal
    // move and only real matches survive.
    recognition.maxAlternatives = 8;
    recognition.onstart = function () {
      micFails = 0;
      micCycles++;
      /* proof the loop is alive, without one line per utterance */
      if (micCycles === 1 || micCycles % 10 === 0) {
        log("MIC", "listening (cycle " + micCycles + ")" +
            (MIC_CONTINUOUS ? " continuous" : ""));
      }
    };
    recognition.onresult = function (ev) {
      var res = ev.results[ev.results.length - 1];
      if (!res) return;
      if (speaking || Date.now() < ignoreMicUntil) {
        log("MIC", "ignored while speaking: " +
            (res[0] ? res[0].transcript : "?"));
        return;
      }
      var alts = [];
      for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
      handleTranscripts(alts);
    };
    recognition.onerror = function (ev) {
      /* "aborted" is self-inflicted: speak() aborts the mic so we
       * never transcribe our own voice. "no-speech" is just silence.
       * Neither is worth a log line, and together they drowned out
       * the real events. */
      if (ev.error === "no-speech") noSpeech++;
      else if (ev.error !== "aborted") log("MIC", "error " + ev.error);
      if (ev.error === "not-allowed" || ev.error === "service-not-allowed") {
        running = false;
        speak("microphone blocked.");
      } else if (ev.error !== "no-speech" && ev.error !== "aborted") {
        micFails++;
        if (micFails >= 8) {
          running = false;
          log("MIC", "giving up after " + micFails +
              " failures - tap the button to restart");
          speak("microphone stopped. tap the button to restart.");
        }
      }
    };
    recognition.onend = function () {
      listening = false;
      renderButton();
      scheduleRestart(300);
    };
    try {
      recognition.start();
      listening = true;
    } catch (e) {
      log("ERR", "rec.start: " + e.message);
      listening = false;
      scheduleRestart(800);
    }
    renderButton();
  }

  function scheduleRestart(ms) {
    clearTimeout(restartTimer);
    restartTimer = setTimeout(function () {
      if (running && !speaking && !listening) startListening();
    }, ms);
  }

  function pauseMic() {
    clearTimeout(restartTimer);
    if (recognition) { try { recognition.abort(); } catch (e) {} }
    recognition = null;
    listening = false;
    renderButton();
  }

  function resumeMicSoon() { scheduleRestart(400); }

  /*======================== 10. KEEP-ALIVE ========================*/

  var keepAlive = null;
  // A WebAudio oscillator does not hold the iOS audio
  // session; a PLAYING media element does. Without one, iOS
  // tears the session down between utterances and the next
  // one starts quiet while the route is re-established.
  // This is why the first announcements sound faint and it
  // settles after a few. Builds a 1 second silent WAV rather
  // than carrying a large base64 blob in the file.
  // Safari rejected an 8-bit WAV with "operation is not
  // supported", so this builds 16-bit PCM, which every
  // browser decodes. Half a second, looped.
  function silentWavUrl() {
    var rate = 22050, frames = rate / 2, bytes = frames * 2;
    var buf = new Uint8Array(44 + bytes);
    var dv = new DataView(buf.buffer);
    function tag(off, str) {
      for (var i = 0; i < str.length; i++) buf[off + i] = str.charCodeAt(i);
    }
    tag(0, "RIFF"); dv.setUint32(4, 36 + bytes, true);
    tag(8, "WAVEfmt "); dv.setUint32(16, 16, true);
    dv.setUint16(20, 1, true);          // PCM
    dv.setUint16(22, 1, true);          // mono
    dv.setUint32(24, rate, true);
    dv.setUint32(28, rate * 2, true);   // byte rate
    dv.setUint16(32, 2, true);          // block align
    dv.setUint16(34, 16, true);         // bits per sample
    tag(36, "data"); dv.setUint32(40, bytes, true);
    var bin = "", CH = 8192;            // chunked: avoid arg limits
    for (var o = 0; o < buf.length; o += CH) {
      bin += String.fromCharCode.apply(null, buf.subarray(o, o + CH));
    }
    // Safari answered "operation is not supported" to the
    // same bytes as a data: URI, so hand it a Blob instead.
    try {
      var blob = new Blob([buf], { type: "audio/wav" });
      return URL.createObjectURL(blob);
    } catch (e) {
      return "data:audio/wav;base64," + btoa(bin);
    }
  }

  function startKeepAlive() {
    try {
      if (!keepAlive) {
        keepAlive = document.createElement("audio");
        keepAlive.src = silentWavUrl();
        keepAlive.load();
        keepAlive.loop = true;
        keepAlive.volume = 0.02;
        keepAlive.setAttribute("playsinline", "");
        document.body.appendChild(keepAlive);
        log("AUD", "audio session holder created");
      }
      keepAlive.play().then(function () {
        log("AUD", "session holder playing");
      }).catch(function (e) {
        log("AUD", "session holder blocked: " + e.message);
      });
      if ("mediaSession" in navigator) {
        try {
          navigator.mediaSession.metadata = new MediaMetadata({ title: "Lichess voice play" });
          ["play", "pause", "nexttrack", "previoustrack"].forEach(function (a) {
            try { navigator.mediaSession.setActionHandler(a, repeatLast); } catch (e) {}
          });
        } catch (e) {}
      }
    } catch (e) { log("ERR", "keepalive: " + e.message); }
  }

  function stopKeepAlive() {
    try { if (keepAlive) keepAlive.pause(); } catch (e) {}
  }

