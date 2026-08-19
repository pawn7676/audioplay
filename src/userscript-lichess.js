  /*================ LICHESS BOARD API (USERSCRIPT) ================\
   *
   *  The userscript's Lichess layer. Re-cut at v138 from
   *  src/lichess.js as it stood at w137, so every repair the
   *  website earned in real games travels here too: the
   *  prefix-checked syncMoves (w50), the departed-opponent
   *  announcements (w61), offers that displace questions out
   *  loud (w50), the auth latch that stops retrying a dead
   *  token (w52/w60), the backoff ladders (w52/w63), the
   *  variant refusal (w61), the repaired poll (w52/w62), the
   *  ply-gated clock (w83). Where the two files say the same
   *  thing they should STAY the same thing: fix a bug in one,
   *  re-copy the block into the other.
   *
   *  THE DELTAS, and why each exists:
   *  1. THE TOKEN IS PASTED, NOT PKCE. This script runs on
   *     lichess.org, where a PKCE redirect back "to the page"
   *     means nothing - there is no page of ours to return
   *     to. The v-series answer stands: a personal API token,
   *     asked for once, kept ONLY in the Userscripts app's
   *     own storage (GM.setValue) - not in localStorage,
   *     which on this origin belongs to the site and can be
   *     read by anything running on it (rule 4). The
   *     Userscripts app provides only the PROMISE forms, so
   *     the value is read once at startup and held in memory.
   *  2. THE GAME ID COMES FROM THE URL. The website has no
   *     lichess.org URL and watches the account event stream;
   *     here the user is STANDING on the game page - Lichess
   *     itself was the lobby. userscript-boot watches for the
   *     page, connect() reads the id out of it.
   *  3. NO SEEK, NO CHALLENGE, NO ACCOUNT STREAM. Games are
   *     started with Lichess's own buttons. The two cancel
   *     stubs at the bottom keep practice.js shared verbatim:
   *     its dryStart puts down everything that could deliver
   *     a real game, and here two of those things simply
   *     never exist.
   *================================================================*/

  VERSION = "v138";

  var RULES = makeRules();

  var api = {
    gameId: null,
    myId: null,
    myName: null,        // for the log line, nothing draws it here
    myColor: null,
    /* WHO IS ON THE OTHER SIDE (w68). Nothing on this shell
     * draws the names - Lichess's own page does - but the
     * join log line names the opponent, which is what a
     * pasted log needs. Keyed by COLOUR (w39). */
    players: { w: null, b: null },
    overText: "",         // the result sentence, kept (w106);
                          // read here only by whoever reads the log
    pos: null,
    moves: [],            // uci list already applied
    movesBefore: 0,       // plies played before this list began -
                          // zero except a mid-game poll join (w83:
                          // the pair's sum is the true ply count,
                          // which is what says whether the clocks run)
    lastSan: "", lastSanW: "", lastSanB: "",
    lastUci: "",          // the same move as lastSan, in the
                          // coordinates the squares speech style
                          // reads (w120)
    wtime: null, btime: null,
    clockAt: null,        // when wtime/btime were last true (w60)
    over: false
  };

  var LICHESS_BASE = "https://lichess.org";

  // The token is kept ONLY in the Userscripts app's own
  // storage. Not in localStorage, which belongs to the site
  // and can be read by anything running on lichess.org,
  // including other extensions.
  //
  // The Safari Userscripts app provides the PROMISE form,
  // GM.setValue, and deliberately never implemented the old
  // synchronous GM_setValue. So the stored value is read
  // once at startup and held in memory, which keeps the
  // rest of the script synchronous.
  //
  // UNDER THE v137 KEY, NOT THE w111 NAME - deliberately.
  // The shared TOKEN_KEY ("audioplay.token") names the
  // website's localStorage slot; the w111 audit that named
  // it audited THAT namespace. GM storage is a different
  // store, where "audioplay_lichess_token" is the key the
  // installed v137 has been keeping the owner's token under
  // since the v-series - so v138 installed over it finds the
  // token where it already is, and "later versions do not
  // need it pasted in again" (the header's promise since
  // v-era) stays true across the un-freeze. Renaming here
  // would strand a live credential under the old name (rule
  // 4) to buy nothing but tidiness.
  var GM_TOKEN_KEY = "audioplay_lichess_token";
  var cachedToken = null;

  function gmAvailable() {
    return typeof GM !== "undefined" && GM &&
           typeof GM.setValue === "function" &&
           typeof GM.getValue === "function";
  }

  function loadStoredToken() {
    if (!gmAvailable()) {
      log("ERR", "no extension storage: GM.setValue missing");
      return Promise.resolve(null);
    }
    try {
      return Promise.resolve(GM.getValue(GM_TOKEN_KEY, "")).then(function (v) {
        cachedToken = v || null;
        log("API", cachedToken
          ? "token loaded from extension storage"
          : "no token stored yet");
        return cachedToken;
      }).catch(function (e) {
        log("ERR", "could not read token: " + e);
        return null;
      });
    } catch (e) {
      log("ERR", "could not read token: " + e.message);
      return Promise.resolve(null);
    }
  }

  function storedToken() {
    return TOKEN || cachedToken || null;
  }

  function saveToken(t) {
    cachedToken = t;
    authGone = false;   /* w62: a NEW token re-arms the reconnects.
                           Here it is the whole point of the token
                           button - replace a dead token mid-session
                           and the retries come back to life. */
    if (!gmAvailable()) return Promise.resolve(false);
    try {
      return Promise.resolve(GM.setValue(GM_TOKEN_KEY, t)).then(function () {
        log("API", "token saved in extension storage");
        return true;
      }).catch(function (e) {
        log("ERR", "could not save token: " + e);
        return false;
      });
    } catch (e) {
      log("ERR", "could not save token: " + e.message);
      return Promise.resolve(false);
    }
  }

  function clearToken() {
    cachedToken = null;
    api.myId = null;
    api.myName = null;
    if (!gmAvailable()) return Promise.resolve(false);
    try {
      var p = (typeof GM.deleteValue === "function")
        ? GM.deleteValue(GM_TOKEN_KEY)
        : GM.setValue(GM_TOKEN_KEY, "");
      return Promise.resolve(p).then(function () {
        log("API", "token cleared from this device");
        return true;
      }).catch(function (e) {
        log("ERR", "could not clear token: " + e);
        return false;
      });
    } catch (e) { return Promise.resolve(false); }
  }

  // Asked for once. Kept only by the Userscripts app on this
  // device. Never sent anywhere except to Lichess itself in
  // the Authorization header. Resolves with the token, or
  // null if there is nowhere to keep it or none was given.
  // A confirm box only has two buttons, so checking what was
  // stored meant either replacing it or deleting it, with no
  // way out. A prompt has three outcomes: type something to
  // replace, type CLEAR to delete, or Cancel to leave it be.
  function manageToken() {
    var have = storedToken();
    if (!have) { ensureToken(); return; }
    var tail = have.length > 4 ? have.slice(-4) : have;
    var t = null;
    try {
      t = window.prompt(
        "A token ending " + tail + " is saved.\n\n" +
        "Paste a new token to replace it,\n" +
        "type CLEAR to delete it,\n" +
        "or press Cancel to leave it alone.", "");
    } catch (e) { return; }
    if (t === null) { log("API", "token left unchanged"); return; }
    t = t.replace(/\s+/g, "");
    if (!t) { log("API", "token left unchanged"); return; }
    if (/^clear$/i.test(t)) { clearToken(); return; }
    saveToken(t);
  }

  function ensureToken() {
    var have = storedToken();
    if (have) return Promise.resolve(have);
    if (!gmAvailable()) {
      log("ERR", "not asking for a token: nowhere safe to put it");
      try {
        window.alert("This script cannot store your token.\n\n" +
          "The Userscripts app is not providing GM.setValue. " +
          "Check the @grant lines at the top of the file.");
      } catch (e) {}
      return Promise.resolve(null);
    }
    var t = null;
    try {
      t = window.prompt(
        "Lichess API token (needs the board:play scope).\n\n" +
        "Create one at lichess.org/account/oauth/token/create\n\n" +
        "It is stored on this device only.");
    } catch (e) {}
    if (!t) return Promise.resolve(null);
    t = t.replace(/\s+/g, "");
    if (!t) return Promise.resolve(null);
    return saveToken(t).then(function (ok) { return ok ? t : null; });
  }

  function authHeaders() {
    return { Authorization: "Bearer " + (storedToken() || "") };
  }

  // The one DOM-adjacent read this layer makes, and it reads
  // the URL, not the page (constraint 2 is about game STATE).
  // A game path is /8chars, sometimes /12 with the player
  // suffix; the first 8 are the game id.
  function gameIdFromUrl() {
    var seg = location.pathname.split("/")[1] || "";
    if (/^[A-Za-z0-9]{8,12}$/.test(seg)) return seg.slice(0, 8);
    return null;
  }

  function apiGet(path) {
    return fetch(LICHESS_BASE + path, { headers: authHeaders() })
      .then(function (r) {
        if (!r.ok) throw new Error(path + " -> HTTP " + r.status);
        return r.json();
      });
  }

  function fetchMyId() {
    return apiGet("/api/account").then(function (a) {
      api.myId = (a.id || "").toLowerCase();
      // the id is lowercased for comparing against
      // game.white.id; the username keeps its real
      // capitalisation and is what the log shows
      api.myName = a.username || a.id || "";
      log("API", "account = " + api.myName);
      return api.myId;
    });
  }

  /* A POST THAT NEVER SETTLES MUST STILL SETTLE (w50). The
   * caller sets busy = true and clears it in this promise's
   * handlers, so a fetch that hangs - a dead cell, a captive
   * wifi portal, the radio asleep - leaves busy stuck true
   * forever, and from then on EVERY accepted move is dropped
   * with nothing said. That is a mode the user cannot see, and
   * the only way out is the button. Twelve seconds is long
   * enough that a slow-but-alive request still wins the race,
   * and short enough to be inside the time a person waits
   * before assuming they were not heard. */
  var MOVE_POST_TIMEOUT_MS = 12000;

  function postMove(uci) {
    var url = LICHESS_BASE + "/api/board/game/" + api.gameId + "/move/" + uci;
    log("PST", "move " + uci);
    var timer = null;
    var live = fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) {
        return r.json().catch(function () { return { ok: r.ok }; })
          .then(function (j) { return { status: r.status, body: j }; });
      });
    var timeout = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        reject(new Error("no reply from Lichess in " +
                         (MOVE_POST_TIMEOUT_MS / 1000) + " seconds"));
      }, MOVE_POST_TIMEOUT_MS);
    });
    // whichever wins, the timer is done with - otherwise every
    // move leaves one armed for the full timeout behind it
    function done(v) { clearTimeout(timer); return v; }
    return Promise.race([live, timeout])
      .then(done, function (e) { done(); throw e; });
  }

  /* RESOLVES WITH WHAT HAPPENED, not with nothing (w60). The
   * Board API 400s these paths in ordinary play: resign during
   * the abortable first moves, a takeback accepted after the
   * opponent withdrew it, a draw accepted after the offer
   * expired. Each used to be announced as done. */
  function postAction(action) {
    var url = LICHESS_BASE + "/api/board/game/" + api.gameId + "/" + action;
    log("PST", action);
    return fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) { return r.text().then(function (t) {
        log("PST", action + " -> " + r.status + " " + t.slice(0, 120));
        return { ok: r.ok, status: r.status, body: t };
      }); });
  }

  /* rebuild position from a uci move list, announcing only the new
   * tail */
  function syncMoves(uciString, announce) {
    var list = (uciString || "").trim() ? uciString.trim().split(/\s+/) : [];
    /* A TAKEBACK IS NOT ALWAYS SHORTER (w50). What we hold has
     * to be a PREFIX of what the server sent; anything else is
     * a rebuild. The list is a few hundred entries at most and
     * this runs once per event. */
    var diverged = list.length < api.moves.length;
    for (var k = 0; !diverged && k < api.moves.length; k++) {
      if (list[k] !== api.moves[k]) diverged = true;
    }
    if (diverged) {
      /* takeback or new game: rebuild from scratch, silently */
      log("MOV", "move list diverged - rebuilding");
      api.pos = new RULES.Position();
      api.moves = [];
      api.lastSan = ""; api.lastSanW = ""; api.lastSanB = "";
      api.lastUci = "";
      armedUci = null;      /* it named a move in the old list */
      announce = false;
    }
    for (var i = api.moves.length; i < list.length; i++) {
      var res = api.pos.applyUci(list[i]);
      if (!res) {
        log("ERR", "illegal uci from stream: " + list[i] + " (resyncing)");
        api.pos = new RULES.Position();
        api.moves = [];
        /* REPLAY, KEEPING WHAT THE REPLAY SAYS (w50). */
        api.lastSan = ""; api.lastSanW = ""; api.lastSanB = "";
        api.lastUci = "";
        armedUci = null;
        for (var j = 0; j < list.length; j++) {
          var rr = api.pos.applyUci(list[j]);
          if (!rr) { log("ERR", "resync failed at " + list[j]); break; }
          api.lastSan = rr.san;
          api.lastUci = list[j];
          if (rr.move.color === "w") api.lastSanW = rr.san;
          else api.lastSanB = rr.san;
        }
        api.moves = list.slice();
        return;
      }
      api.moves.push(list[i]);
      var moverIsMine = (res.move.color === api.myColor);
      api.lastSan = res.san;
      api.lastUci = list[i];
      if (res.move.color === "w") api.lastSanW = res.san;
      else api.lastSanB = res.san;
      log("MOV", colorWord(res.move.color) + " " + list[i] + " = " + res.san +
          (announce ? "" : " (catch-up)"));
      if (announce && !moverIsMine) {
        speak(moveToSpeech(res.san, list[i]) + ".");
      }
      // OUR OWN MOVE, CONFIRMED BY THE STREAM (v134). This
      // is the earlier of the two confirmations whenever
      // the stream wins the race with the 200, and it must
      // speak HERE: the opponent's reply can be in the very
      // same event batch, and the read-back has to be out
      // before it. readBackMine ignores anything we did not
      // post, and takes the arm so the 200 stays quiet.
      if (moverIsMine) readBackMine(res.san, list[i], announce);
    }
  }

  /* AN OPPONENT WHO LEAVES IS INVISIBLE TOO (w61). Spoken once
   * per departure, and when the window opens it becomes a
   * yes/no through the same CONFIRMS machinery as every other
   * game-ending question. The event repeats as the countdown
   * ticks, so oppGone/claimAsked keep each sentence to once. */
  var oppGone = false, claimAsked = false;

  function handleOpponentGone(ev) {
    if (api.over || dryRun) return;
    if (ev.gone) {
      if (!oppGone) {
        oppGone = true;
        log("EVT", "opponent gone" + (ev.claimWinInSeconds != null
            ? ", claim in " + ev.claimWinInSeconds + "s" : ""));
        speak("your opponent has left the game.");
      }
      if (ev.claimWinInSeconds != null && ev.claimWinInSeconds <= 0 &&
          !claimAsked) {
        claimAsked = true;
        confirmAction = "claimvictory";
        speak("you can claim the win. say yes to claim it, " +
              "no to keep waiting.");
      }
    } else if (oppGone) {
      oppGone = false;
      claimAsked = false;
      if (confirmAction === "claimvictory") confirmAction = null;
      log("EVT", "opponent back");
      speak("your opponent is back.");
    }
  }

  /* An opponent's draw or takeback offer is invisible if you are not
   * looking at the screen, so it has to be spoken and answerable. */
  var offerState = { draw: false, takeback: false };

  /* AN OFFER MAY NOT QUIETLY INHERIT SOMEBODY ELSE'S "YES"
   * (w50). The offer still has to be heard: it is invisible
   * from across the room and it expires. So it takes the slot
   * and SAYS it is doing so, naming what it displaced. And an
   * offer that goes away takes its question with it. */
  function checkOffers(s) {
    if (!api.myColor) return;
    var oppDraw = api.myColor === "w" ? !!s.bdraw : !!s.wdraw;
    var oppTake = api.myColor === "w" ? !!s.btakeback : !!s.wtakeback;
    var them = colorWord(api.myColor === "w" ? "b" : "w");

    function displaced() {
      // only a question the user is mid-way through needs
      // naming; an earlier offer being replaced by a later one
      // is the same kind of thing and needs no apology.
      if (confirmAction === "resign") return "that cancels the resign question. ";
      if (confirmAction === "offerdraw") return "that cancels your draw offer question. ";
      if (confirmAction === "claimvictory") return "that cancels the claim question. ";
      return "";
    }

    if (oppDraw && !offerState.draw && !api.over) {
      var wasD = displaced();
      confirmAction = "drawoffer";
      log("API", "opponent offers a draw" + (wasD ? " (displacing a question)" : ""));
      speak(them + " offers a draw. " + wasD +
            "Say yes to accept, no to decline.");
    }
    if (oppTake && !offerState.takeback && !api.over) {
      var wasT = displaced();
      confirmAction = "takebackoffer";
      log("API", "opponent asks for a takeback" +
          (wasT ? " (displacing a question)" : ""));
      speak(them + " asks to take back a move. " + wasT +
            "Say yes to accept, no to decline.");
    }
    // WITHDRAWN: the question goes with the offer, and says so,
    // because the user may be holding a "yes" ready for it.
    if (!oppDraw && offerState.draw && confirmAction === "drawoffer") {
      confirmAction = null;
      log("API", "draw offer withdrawn");
      speak(them + " withdrew the draw offer.");
    }
    if (!oppTake && offerState.takeback && confirmAction === "takebackoffer") {
      confirmAction = null;
      log("API", "takeback request withdrawn");
      speak(them + " withdrew the takeback request.");
    }
    offerState.draw = oppDraw;
    offerState.takeback = oppTake;
  }

  // Extrapolates the running side's clock between server
  // events, for either color: clock mode paints both. Frozen
  // once the game is over (v73), AND FROZEN BEFORE BOTH SIDES
  // HAVE MOVED (w83): Lichess does not start the clocks until
  // each player has made their first move. The ply count is
  // movesBefore + moves.length so a mid-game poll join, whose
  // move list starts empty against a game already underway,
  // still knows the clocks are long since running.
  function remainingMs(color) {
    var base = color === "w" ? api.wtime : api.btime;
    if (base == null) return null;
    if (api.pos && !api.over && api.pos.turn === color && api.clockAt &&
        api.movesBefore + api.moves.length >= 2) {
      return base - (Date.now() - api.clockAt);
    }
    return base;
  }

  function myRemainingMs() { return remainingMs(api.myColor); }

  /* stated in colors, never "you" or "they" */
  function resultSpoken(s2) {
    var status = (s2 && s2.status) || "over";
    // "white" | "black" | undefined
    var winner = s2 && s2.winner;
    var loser = winner === "white" ? "black" : "white";
    var how = { mate: "checkmate", resign: "resignation", outoftime: "time",
                timeout: "timeout", stalemate: "stalemate", draw: "agreement",
                aborted: "abort", cheat: "cheat detection",
                variantEnd: "variant end" }[status] || status;
    if (status === "aborted") return "game aborted.";
    if (status === "stalemate") return "stalemate. drawn.";
    if (!winner) return "drawn by " + how + ".";
    if (status === "mate") return "checkmate. " + winner + " wins.";
    if (status === "resign") return loser + " resigned. " + winner + " wins.";
    if (status === "outoftime") {
      return loser + " ran out of time. " + winner + " wins.";
    }
    return winner + " wins by " + how + ".";
  }

  /* Speak the result AND keep it (w106). Here nothing draws
   * overText - Lichess's own page shows the result - but the
   * sentence is kept anyway so the shared shape stays the
   * shared shape. */
  function sayResult(sentence) {
    api.overText = sentence;
    speak(sentence);
  }

  // "connected" the first time, "reconnected" after that,
  // so a mid-game network drop that healed itself (game3,
  // 15:29:12) is announced as what it was: a resume, not a
  // fresh start.
  var everConnected = false;

  function handleGameFull(g) {
    // STANDARD CHESS ONLY, SAID IN SO MANY WORDS (w61). A
    // variant game would feed variant moves into rules.js,
    // which would hit the illegal-uci resync on every event -
    // a loop of ERR lines and a board that cannot be trusted,
    // with nothing said about WHY. fromPosition is allowed: it
    // is standard chess from a custom start.
    var vkey = (g.variant && (g.variant.key || g.variant.name)) || "standard";
    if (vkey !== "standard" && vkey !== "fromPosition") {
      api.over = true;
      log("API", "variant game (" + vkey + ") - not playable here");
      sayResult("this is a " + ((g.variant && g.variant.name) || vkey) +
            " game. this script plays standard chess only. play it by hand.");
      try { if (streamAbort) streamAbort.abort(); } catch (e) {}
      return;
    }
    api.pos = new RULES.Position(g.initialFen && g.initialFen !== "startpos"
                               ? g.initialFen : undefined);
    api.moves = [];
    api.movesBefore = 0;    // gameFull carries the WHOLE game;
                            // syncMoves below rebuilds the list
                            // from ply one, so nothing predates it
    var whiteId = ((g.white && g.white.id) || "").toLowerCase();
    api.myColor = (whiteId && whiteId === api.myId) ? "w" : "b";
    api.players.w = playerOf(g.white);
    api.players.b = playerOf(g.black);
    log("API", "game " + api.gameId + " you are " +
        (api.myColor === "w" ? "white" : "black") + ", " +
        playerLabel(api.players[api.myColor === "w" ? "b" : "w"]) +
        " on the other side");
    syncMoves(g.state && g.state.moves, false);   // catch up silently
    var st = g.state && g.state.status;
    if (st && st !== "started" && st !== "created") {
      api.over = true;
      log("API", "joined a finished game: " + st);
      sayResult("This game is already finished. " + resultSpoken(g.state));
      return;
    }
    handleGameState(g.state, false);
    speakWhenAudioSettled((everConnected ? "reconnected" : "connected") +
          ". You are " + colorWord(api.myColor) + ". " +
          colorWord(api.pos.turn) + " to move.");
    everConnected = true;
  }

  /* A gameFull player slot is one of two shapes: a human or
   * bot has {id, name, title, rating}, and one of Lichess's
   * own opponents has {aiLevel} and NO name at all. Both are
   * normalised here so nothing downstream has to know. */
  function playerOf(p) {
    if (!p) return null;
    if (p.aiLevel != null) {
      return { name: "computer level " + p.aiLevel, rating: null, title: null };
    }
    var name = p.name || p.id;
    if (!name) return null;
    return { name: name,
             rating: (typeof p.rating === "number") ? p.rating : null,
             title: p.title || null };
  }

  // For the log line and nothing else.
  function playerLabel(pl) {
    if (!pl) return "unknown opponent";
    return (pl.title ? pl.title + " " : "") + pl.name +
           (pl.rating != null ? " (" + pl.rating + ")" : "");
  }

  function handleGameState(s, announce) {
    if (!s) return;
    syncMoves(s.moves, announce !== false);
    api.wtime = s.wtime; api.btime = s.btime; api.clockAt = Date.now();
    checkOffers(s);
    if (s.status && s.status !== "started" && s.status !== "created") {
      if (!api.over) {
        api.over = true;
        log("API", "game over: " + s.status + " " + (s.winner || ""));
        // every open question dies with the game (w50). A
        // "yes" held over from a finished game had nothing
        // good to do: post to a game Lichess has closed and
        // hear "draw accepted." for a draw that was not.
        clearDialogue();
        sayResult(resultSpoken(s));
      }
      return;
    }
  }

  /* ---- streaming ---- */

  var streamAbort = null;

  /* A LIVE STREAM IS LEFT ALONE (w81). The voice button calls
   * this rather than startStream: restarting a HEALTHY stream
   * re-delivers gameFull, and the page announced "connected"
   * and "reconnected" back to back. Lichess keeps the stream
   * warm with a newline every few seconds, so bytes within the
   * last fifteen mean it is alive and there is nothing to
   * restart. */
  var streamBeatAt = 0;
  var streamGameId = null;

  function ensureStream() {
    if (streamGameId === api.gameId && streamBeatAt &&
        Date.now() - streamBeatAt < 15000) {
      log("NET", "stream is live - leaving it alone");
      return;
    }
    startStream();
  }

  function startStream() {
    if (!api.gameId || dryRun || api.gameId === "PRACTICE") return;
    log("NET", "opening stream for " + api.gameId);
    streamGameId = api.gameId;
    streamBeatAt = 0;
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    streamAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = { headers: authHeaders() };
    if (streamAbort) opts.signal = streamAbort.signal;

    fetch(LICHESS_BASE + "/api/board/game/stream/" + api.gameId, opts)
      .then(function (r) {
        if (!r.ok) throw new Error("stream HTTP " + r.status);
        if (!r.body || !r.body.getReader) throw new Error("no streaming body");
        streamBeatAt = Date.now();
        streamFails = 0;          /* it opened: the ladder resets */
        stopPolling();            /* w62: one transport at a time */
        var reader = r.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) {
              log("NET", "stream ended");
              streamBeatAt = 0;      /* w81: dead means dead */
              scheduleReconnect();
              return;
            }
            streamBeatAt = Date.now();   /* keep-alives count too (w81) */
            buf += dec.decode(res.value, { stream: true });
            var lines = buf.split("\n");
            buf = lines.pop();
            lines.forEach(function (ln) {
              if (!ln.trim()) return;            // keep-alive
              var ev;
              try { ev = JSON.parse(ln); }
              catch (e) { log("ERR", "bad ndjson: " + ln.slice(0, 80)); return; }
              log("EVT", ev.type || "?");
              if (ev.type === "gameFull") handleGameFull(ev);
              else if (ev.type === "gameState") handleGameState(ev, true);
              else if (ev.type === "opponentGone") handleOpponentGone(ev);
              else if (ev.type === "chatLine") { /* ignore */ }
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (e) {
        // AN ABORT IS OUR OWN DOING, NOT A DROPPED STREAM
        // (w50). Without this filter, startStream aborting its
        // predecessor fed a reconnect loop that re-delivered
        // gameFull every two seconds for a whole game.
        if (String(e.name) === "AbortError") return;
        streamBeatAt = 0;         /* w81: a failed stream is not live */
        log("ERR", "stream: " + e.message);
        /* a 429 jumps the ladder straight to its cap (w63) */
        if (/HTTP 429/.test(String(e.message))) {
          streamFails = Math.max(streamFails, 5);
        }
        if (String(e.message).indexOf("no streaming body") >= 0) startPolling();
        else if (!noteAuthFailure(e)) scheduleReconnect();
      });
  }

  /* A TOKEN THAT LICHESS NO LONGER ACCEPTS IS NOT A NETWORK
   * BLIP (w52). A revoked or expired token meant an HTTP 401
   * every two seconds, forever, filling the log and telling
   * the user nothing. Said once, and the retrying stops,
   * because retrying cannot fix it. The remedy here is the
   * userscript's: the token button, not a sign-in page. */
  var authGone = false;
  function noteAuthFailure(e) {
    if (!/HTTP 40[13]/.test(String(e.message))) return false;
    if (authGone) return true;
    authGone = true;
    log("ERR", "lichess refused the token - tap token in the log panel");
    speak("Lichess refused the token. " +
          "tap the token button in the log panel and paste a new one.");
    return true;
  }

  var reconnectTimer = null;
  var streamFails = 0;
  function scheduleReconnect() {
    // NOT GATED ON THE MIC (w50): listening and being
    // connected are different things. The stream is cheap,
    // every speaking path gates on its own state, and being
    // connected while silent costs nothing - whereas being
    // disconnected while listening is the failure that loses
    // games.
    if (api.over || dryRun || !api.gameId || api.gameId === "PRACTICE") return;
    if (authGone) return;
    // AND IT BACKS OFF (w52): doubling to a thirty-second
    // ceiling keeps the first few retries as quick as they
    // ever were, which is the case that actually matters.
    streamFails++;
    var wait = Math.min(2000 * Math.pow(2, streamFails - 1), 30000);
    log("NET", "reconnecting in " + (wait / 1000) + "s (try " + streamFails + ")");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startStream, wait);
  }

  /* ---- polling fallback (if fetch streaming is unavailable) ----
   *
   * The w52/w62 repairs, kept: this path exists for a browser
   * that cannot hold a streaming body open, which the tested
   * device can, so it must not be trusted on faith. What the
   * endpoint can and cannot say: /api/account/playing carries
   * neither a status nor a result nor the opponent's clock,
   * and its `secondsLeft` is the account holder's. What
   * cannot be known is left null, and the end of a game is
   * inferred from the game leaving the list - twice in a row
   * (w62), because a single anomalous response must not end a
   * live game.
   *
   * THE WEBSITE'S DISCOVERY BRANCH IS NOT HERE: there, a
   * poll-only browser had no other way to notice a seek had
   * matched. Here the URL is the discovery - the user is
   * standing on the game page - so the poll only ever FOLLOWS
   * the game it was started for. */
  var pollTimer = null;
  var pollSeen = false;      // has THIS game appeared in the list?
                             // (reset per game, in joinGame)
  var pollMisses = 0;        // consecutive ticks the game was gone
  var pollFails = 0;         // consecutive failed requests
  var pollSkip = 0;

  function startPolling() {
    if (pollTimer) return;   // already the fallback; keep cadence
    log("NET", "falling back to polling /api/account/playing");
    pollTimer = setInterval(pollOnce, 1500);
    pollOnce();
  }

  function stopPolling() {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function pollOnce() {
    /* NOT GATED ON THE MIC (w62) - listening and being
     * connected are different things, in this transport too. */
    if (dryRun) return;
    /* the ladder, poll-shaped (w62): after four straight
     * failures, only every eighth tick goes out (~12s); one
     * success restores full cadence. */
    if (pollFails >= 4) {
      pollSkip++;
      if (pollSkip % 8 !== 0) return;
    }
    var forGame = api.gameId;   // w62: bail if the world changes
                                // while the request is in flight
    if (!forGame || forGame === "PRACTICE" || api.over) return;
    apiGet("/api/account/playing?nb=50").then(function (d) {
      pollFails = 0;
      /* THE WORLD MAY HAVE CHANGED UNDER THE REQUEST (w62). */
      if (dryRun || api.gameId !== forGame || api.over) return;

      var g = (d.nowPlaying || []).filter(function (x) {
        return x.gameId === api.gameId || (x.fullId || "").indexOf(api.gameId) === 0;
      })[0];
      if (!g) {
        /* The game left the list of ongoing games, so it is
         * over. The endpoint gives no status, so the sentence
         * does not guess a result. TWO consecutive missing
         * ticks are required (w62). */
        if (pollSeen && !api.over) {
          pollMisses++;
          if (pollMisses < 2) return;
          api.over = true;
          clearDialogue();
          log("API", "game gone from nowPlaying - treating it as over");
          sayResult("game over. check lichess for the result.");
          uiGameChanged();
        }
        return;
      }
      pollSeen = true;
      pollMisses = 0;
      if (!api.myColor) {
        /* FIRST SIGHTING LOADS THE REAL POSITION (w62). The
         * endpoint's fen is FULL - side to move, castling,
         * ep, the lot - so load it and say whose move it is,
         * exactly as handleGameFull does. */
        api.myColor = g.color === "white" ? "w" : "b";
        api.pos = new RULES.Position();
        if (g.fen) api.pos.load(g.fen);
        api.moves = [];
        /* THE FEN SAYS HOW FAR ALONG THE GAME IS (w83). */
        var fp = String(g.fen || "").split(" ");
        var fm = parseInt(fp[5], 10);
        api.movesBefore = fm > 0
          ? (fm - 1) * 2 + (fp[1] === "b" ? 1 : 0) : 2;
        speak((everConnected ? "reconnected" : "connected") +
              ". You are " + g.color + ". " +
              colorWord(api.pos.turn) + " to move.");
        everConnected = true;
      }
      /* poll gives fen + lastMove only; replay lastMove onto our
       * position */
      if (g.lastMove && api.moves[api.moves.length - 1] !== g.lastMove) {
        var res = api.pos.applyUci(g.lastMove);
        if (res) {
          api.moves.push(g.lastMove);
          api.lastSan = res.san;
          api.lastUci = g.lastMove;
          if (res.move.color === "w") api.lastSanW = res.san;
          else api.lastSanB = res.san;
          if (res.move.color !== api.myColor) {
            speak(moveToSpeech(res.san, g.lastMove) + ".");
          }
          /* the stream's rule, kept identical here (v134) */
          if (res.move.color === api.myColor)
            readBackMine(res.san, g.lastMove, true);
          log("MOV", "poll " + g.lastMove + " = " + res.san);
        } else {
          /* RELOAD, THEN REMEMBER THAT WE DID: the uci is
           * pushed so the next tick's comparison moves on (w52)
           * and the ply guards keep counting; the list is a
           * position marker in poll mode, not a game record.
           * The fen is loaded WHOLE (w62). */
          log("ERR", "poll desync on " + g.lastMove + "; reloading from fen");
          api.pos.load(g.fen);
          api.moves.push(g.lastMove);
          armedUci = null;          /* it named the old position */
        }
      }
      /* secondsLeft IS THE ACCOUNT HOLDER'S CLOCK, not white's.
       * The other side is unknowable from this endpoint and
       * stays null - "unknown" is the honest answer (w52). */
      if (g.secondsLeft != null) {
        if (api.myColor === "w") api.wtime = g.secondsLeft * 1000;
        else api.btime = g.secondsLeft * 1000;
        api.clockAt = Date.now();
      }
    }).catch(function (e) {
      pollFails++;
      /* A REVOKED TOKEN IN POLL MODE (w62): same sentence,
       * same halt as the streams. */
      if (noteAuthFailure(e)) { stopPolling(); return; }
      if (/HTTP 429/.test(String(e.message))) {
        pollFails = Math.max(pollFails, 4);      /* w63: back off now */
      }
      log("ERR", "poll: " + e.message);
    });
  }

  /* ---- connecting ---- */

  function joinGame(gameId) {
    if (api.gameId === gameId && !api.over) return;
    api.gameId = gameId;
    api.myColor = null;
    api.pos = null;
    api.moves = [];
    api.movesBefore = 0;
    api.over = false; api.overText = "";
    api.wtime = null; api.btime = null; api.clockAt = null;
    api.players = { w: null, b: null };
    offerState = { draw: false, takeback: false };
    oppGone = false; claimAsked = false;   /* w61 */
    pollSeen = false; pollMisses = 0;      /* w62: per-game */
    // and the questions from whatever game came before this
    // one (w50) - see clearDialogue.
    clearDialogue();
    (api.myId ? Promise.resolve(api.myId) : fetchMyId())
      .then(startStream)
      .catch(function (e) {
        log("ERR", "join: " + e.message);
        speak("could not connect. check the log.");
      });
  }

  // The round button's way in: the game id is the URL's, the
  // token is asked for if none is stored (the tap that got us
  // here is the gesture a prompt needs).
  function connect() {
    var gid = gameIdFromUrl();
    if (!gid) {
      speak("Open a game first.");
      log("ERR", "no game id in " + location.pathname);
      return;
    }
    ensureToken().then(function (tok) {
      if (!tok) {
        speak("No API token set.");
        log("ERR", "no token set");
        return;
      }
      joinGame(gid);
    });
  }

  /* ---- what the shared files expect and this shell has no
   * use for. practice.js's dryStart puts down everything that
   * could deliver a real game - on the website that includes
   * the account event stream, an outstanding seek and an open
   * challenge. None of those exist here (games start on
   * Lichess's own page), so the names it calls are satisfied
   * with nothing behind them, and practice.js stays shared
   * verbatim rather than forked over four lines. */
  var eventAbort = null;
  var eventTimer = null;
  function cancelSeek() { /* no seeks here: Lichess's own lobby */ }
  function cancelChallenge() { /* no challenges here either */ }
