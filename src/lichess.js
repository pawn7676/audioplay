  /*====================== LICHESS BOARD API =======================\
   *
   *  The page's Lichess layer. Built at w20 from the v134
   *  userscript's board-API section with exactly three
   *  transplants, all salvaged from the w19 site and proven
   *  in game 17:
   *    - the token block is PKCE sign-in (no pasted tokens;
   *      the token lives in THIS origin's localStorage, which
   *      is ours alone - the userscript's GM-storage reasoning
   *      does not apply off lichess.org)
   *    - the game id comes from the ACCOUNT EVENT STREAM, not
   *      the page URL (there is no lichess.org URL here); a
   *      gameStart event joins the game whether it began from
   *      this page's seek/challenge, the Lichess app, or a
   *      friend's challenge
   *    - seek and challenge, from BoardEye via w1
   *  Everything between the transplants - syncMoves, offers,
   *  clocks, results, gameFull/gameState, the stream and the
   *  polling fallback - CAME FROM the v134 userscript
   *  verbatim, and that is now history rather than a rule.
   *
   *  IT USED TO SAY "when the userscript moves, re-copy those
   *  parts". The userscript froze at v137 and will not move
   *  again, so there is nothing to re-copy from and no reason
   *  to keep these parts copy-shaped (w54). w50 and w52 both
   *  edited this region on their own merits - the AbortError
   *  filter, the reconnect ladder, the whole poll repair - and
   *  the old instruction would have argued against every one
   *  of them. Read the provenance above for WHY something
   *  looks the way it does; do not treat it as a constraint.
   *
   *  VERSION is assigned here rather than where it is
   *  declared: the w-series is the only version line, and
   *  keeping the number next to the note explaining the series
   *  is what stops it being set in two places again.
   *================================================================*/

  VERSION = "w68";

  var RULES = makeRules();

  var api = {
    gameId: null,
    myId: null,
    myName: null,        // shown on the sign-in button (web)
    myColor: null,
    /* WHO IS ON THE OTHER SIDE (w68). gameFull has carried
     * this since w1 and the page read one field of it -
     * white.id, to work out which colour you are - and threw
     * the rest away, so nothing on screen or in the log ever
     * said who you were playing. Keyed by COLOUR, not by
     * us/them, because that is how every other part of this
     * panel is keyed (w39) and it makes the render a lookup
     * rather than a branch. Each is {name, rating, title} or
     * null. */
    players: { w: null, b: null },
    pos: null,
    moves: [],            // uci list already applied
    lastSan: "", lastSanW: "", lastSanB: "",
    wtime: null, btime: null,
    clockAt: null,        // when wtime/btime were last true (w60:
                          // declared here so its lifecycle is
                          // visible; it was born dynamically and
                          // cleared by nothing, which is how
                          // practice inherited a real game's clock)
    over: false
  };

  var LICHESS_BASE = "https://lichess.org";
  // THE USER SEES THIS STRING. Lichess has no app
  // registry and no approval step: whatever goes here is
  // shown verbatim on the consent screen, and is the only
  // thing identifying this page to the person deciding
  // whether to trust it. So it is a NAME, not a
  // description — the reverse-domain shape it had at w1
  // was a convention borrowed without its reason (there
  // is no registry to namespace against, and no domain
  // here to reverse). Changing it later is safe: existing
  // tokens keep working, they just list under the old
  // name on lichess.org until re-granted.
  var LICHESS_CLIENT_ID = "audioplay";
  var LICHESS_SCOPES = "board:play challenge:write challenge:read";
  var VERIFIER_KEY = "audioplay.lichess.verifier";
  var VERIFIER_ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz" +
    "0123456789-._~";

  var cachedToken = null;

  function loadStoredToken() {
    try { cachedToken = localStorage.getItem(TOKEN_KEY) || null; }
    catch (e) { cachedToken = null; }
    log("API", cachedToken ? "token loaded from this browser"
                           : "no token stored yet");
    return cachedToken;
  }

  function storedToken() {
    return TOKEN || cachedToken || null;
  }

  function saveToken(t) {
    cachedToken = t;
    authGone = false;   /* w62: a NEW token re-arms the reconnects.
                           Today this only matters because sign-in
                           navigates away and back (fresh closure),
                           but nothing SAID the reset relied on
                           navigation, and an in-page refresh would
                           have inherited a stuck-true latch. */
    try { localStorage.setItem(TOKEN_KEY, t); } catch (e) {}
    log("API", "token saved in this browser");
  }

  function clearToken() {
    cachedToken = null;
    api.myId = null;
    api.myName = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    log("API", "token cleared from this browser");
  }

  function randomText(size) {
    var raw = new Uint8Array(size);
    crypto.getRandomValues(raw);
    var out = "";
    for (var i = 0; i < raw.length; i++) {
      out += VERIFIER_ALPHABET[raw[i] % VERIFIER_ALPHABET.length];
    }
    return out;
  }

  function base64Url(buffer) {
    var binary = "";
    var bytes = new Uint8Array(buffer);
    for (var i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  function redirectUri() {
    return window.location.origin + window.location.pathname;
  }

  // Leaves the page for lichess.org/oauth; Lichess sends
  // the user back to redirectUri() with ?code=..., which
  // finishSignIn picks up on the next load.
  function signIn() {
    var verifier = randomText(64);
    try { localStorage.setItem(VERIFIER_KEY, verifier); }
    catch (e) {
      log("ERR", "cannot store the sign-in secret");
      uiStatus("Cannot store the sign-in secret.");
      return;
    }
    crypto.subtle.digest("SHA-256",
      new TextEncoder().encode(verifier)).then(function (digest) {
        var query = "response_type=code" +
          "&client_id=" + encodeURIComponent(LICHESS_CLIENT_ID) +
          "&redirect_uri=" + encodeURIComponent(redirectUri()) +
          "&scope=" + encodeURIComponent(LICHESS_SCOPES) +
          "&code_challenge_method=S256" +
          "&code_challenge=" + base64Url(digest);
        window.location.href = LICHESS_BASE + "/oauth?" + query;
      });
  }

  // Returns true if this load was a sign-in return (with a
  // code or an error), whether or not it succeeded.
  function finishSignIn() {
    var params = new URLSearchParams(window.location.search);
    var code = params.get("code");
    var failed = params.get("error");
    if (!code && !failed) return Promise.resolve(false);
    var verifier = null;
    try {
      verifier = localStorage.getItem(VERIFIER_KEY);
      localStorage.removeItem(VERIFIER_KEY);
    } catch (e) {}
    window.history.replaceState({}, "", redirectUri());
    if (failed) {
      log("ERR", "sign-in refused (" + failed + ")");
      uiStatus("Sign-in refused (" + failed + ").");
      return Promise.resolve(true);
    }
    if (!verifier) {
      log("ERR", "sign-in secret missing - try again");
      uiStatus("Sign-in secret missing - try again.");
      return Promise.resolve(true);
    }
    var body = "grant_type=authorization_code" +
      "&code=" + encodeURIComponent(code) +
      "&code_verifier=" + encodeURIComponent(verifier) +
      "&redirect_uri=" + encodeURIComponent(redirectUri()) +
      "&client_id=" + encodeURIComponent(LICHESS_CLIENT_ID);
    return fetch(LICHESS_BASE + "/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    }).then(function (r) {
      if (!r.ok) throw new Error("token exchange failed (HTTP " +
                                 r.status + ")");
      return r.json();
    }).then(function (granted) {
      if (!granted.access_token) throw new Error("no token in the reply");
      saveToken(granted.access_token);
      return true;
    }).catch(function (e) {
      log("ERR", e.message);
      uiStatus(e.message + ".");
      return true;
    });
  }

  function signOut() {
    stopEverything();
    clearToken();
    api.myId = null;
    api.myName = null;
    api.gameId = null;
    api.myColor = null;
    api.pos = null;
    api.moves = [];
    api.over = false;
    api.wtime = null; api.btime = null; api.clockAt = null;  /* w60 */
    api.players = { w: null, b: null };   /* w68, and see w60 */
    uiStatus("Signed out.");
    uiGameChanged();
  }

  function authHeaders() {
    return { Authorization: "Bearer " + (storedToken() || "") };
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
      // capitalisation and is what the user is shown
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

  /* RESOLVES WITH WHAT HAPPENED, not with nothing (w60). This
   * used to log the status and resolve undefined whatever came
   * back, so its one caller - confirmedAction - could only
   * distinguish "the network worked" from "the network failed",
   * and spoke "resigning." on an HTTP 400. The Board API 400s
   * these paths in ordinary play: resign during the abortable
   * first moves, a takeback accepted after the opponent
   * withdrew it, a draw accepted after the offer expired. Each
   * was announced as done. w50 made the answer wait for the
   * POST; it waited for the wrong half - the catch, not the
   * status. */
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
    /* A TAKEBACK IS NOT ALWAYS SHORTER (w50). This asked only
     * whether the list had got shorter, which misses the case
     * where a takeback and its replacement move arrive in one
     * event, or where a takeback lands while a reconnect is in
     * flight: same length, different tail. The loop then began
     * at api.moves.length, applied nothing, and left the local
     * position quietly describing a game that is no longer on
     * the board - with no illegal uci to trip the resync
     * below, because no uci was ever applied. What we hold has
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
      armedUci = null;      /* it named a move in the old list */
      announce = false;
    }
    for (var i = api.moves.length; i < list.length; i++) {
      var res = api.pos.applyUci(list[i]);
      if (!res) {
        log("ERR", "illegal uci from stream: " + list[i] + " (resyncing)");
        api.pos = new RULES.Position();
        api.moves = [];
        /* REPLAY, KEEPING WHAT THE REPLAY SAYS (w50). The old
         * version threw the sans away, so after a resync the
         * clock overlay's move rows kept showing whatever was
         * last announced before it - and the arm survived,
         * pointing at a move in a position that no longer
         * exists, ready to read back against the wrong one. */
        api.lastSan = ""; api.lastSanW = ""; api.lastSanB = "";
        armedUci = null;
        for (var j = 0; j < list.length; j++) {
          var rr = api.pos.applyUci(list[j]);
          if (!rr) { log("ERR", "resync failed at " + list[j]); break; }
          api.lastSan = rr.san;
          if (rr.move.color === "w") api.lastSanW = rr.san;
          else api.lastSanB = rr.san;
        }
        api.moves = list.slice();
        return;
      }
      api.moves.push(list[i]);
      var moverIsMine = (res.move.color === api.myColor);
      api.lastSan = res.san;
      if (res.move.color === "w") api.lastSanW = res.san;
      else api.lastSanB = res.san;
      log("MOV", colorWord(res.move.color) + " " + list[i] + " = " + res.san +
          (announce ? "" : " (catch-up)"));
      if (announce && !moverIsMine && speakOpponentNow()) {
        speak(sanToSpeech(res.san) + ".", colorWord(res.move.color));
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

  /* AN OPPONENT WHO LEAVES IS INVISIBLE TOO (w61). The stream
   * has always sent opponentGone - gone plus claimWinInSeconds
   * counting down - and this page logged the event type and did
   * nothing, in an app whose header worries at length about the
   * claim-victory window from the OTHER side. A sighted player
   * watches the banner; an eyes-free one hears silence while
   * their own clock is the only one moving. Spoken once per
   * departure, and when the window opens it becomes a yes/no
   * through the same CONFIRMS machinery as every other
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
        pending = null;
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
   * (w50). This set confirmAction unconditionally, so an offer
   * arriving while a question was already open replaced it
   * without a word - ask "resign", hear "Resign the game? Yes
   * or no.", have the opponent offer a draw in the gap, say
   * "yes" meaning resign, and accept a draw instead. Both are
   * game-ending and they are not the same game-ending.
   *
   * The offer still has to be heard: it is invisible from
   * across the room and it expires. So it takes the slot and
   * SAYS it is doing so, naming what it displaced. The user
   * hears one sentence instead of two and answers the question
   * they were actually asked last.
   *
   * And an offer that goes away takes its question with it.
   * Nothing cleared confirmAction when the opponent withdrew,
   * so a "yes" arriving later posted an acceptance for an
   * offer that no longer existed and was told it had worked.
   */
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
      if (pending) return "that cancels the move question. ";
      return "";
    }

    if (oppDraw && !offerState.draw && !api.over) {
      var wasD = displaced();
      pending = null;
      confirmAction = "drawoffer";
      log("API", "opponent offers a draw" + (wasD ? " (displacing a question)" : ""));
      speak(them + " offers a draw. " + wasD +
            "Say yes to accept, no to decline.");
    }
    if (oppTake && !offerState.takeback && !api.over) {
      var wasT = displaced();
      pending = null;
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
  // events, for either color: clock mode paints both. The
  // clock is frozen once the game is over (v73 — before,
  // the side to move at mate kept counting down).
  function remainingMs(color) {
    var base = color === "w" ? api.wtime : api.btime;
    if (base == null) return null;
    if (api.pos && !api.over && api.pos.turn === color && api.clockAt) {
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

  // "connected" the first time, "reconnected" after that,
  // so a mid-game network drop that healed itself (game3,
  // 15:29:12) is announced as what it was: a resume, not a
  // fresh start.
  var everConnected = false;

  function handleGameFull(g) {
    // STANDARD CHESS ONLY, SAID IN SO MANY WORDS (w61). A
    // variant game (chess960, atomic, crazyhouse...) arriving
    // from the app would feed castling-as-king-takes-rook and
    // variant moves into rules.js, which would hit the
    // illegal-uci resync on every event - a loop of ERR lines
    // and a board that cannot be trusted, with nothing said
    // about WHY. fromPosition is allowed: it is standard chess
    // from a custom start, and initialFen below handles it.
    var vkey = (g.variant && (g.variant.key || g.variant.name)) || "standard";
    if (vkey !== "standard" && vkey !== "fromPosition") {
      api.over = true;
      log("API", "variant game (" + vkey + ") - not playable here");
      speak("this is a " + ((g.variant && g.variant.name) || vkey) +
            " game. this app plays standard chess only. play it on lichess.");
      try { if (streamAbort) streamAbort.abort(); } catch (e) {}
      return;
    }
    api.pos = new RULES.Position(g.initialFen && g.initialFen !== "startpos"
                               ? g.initialFen : undefined);
    api.moves = [];
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
      speak("This game is already finished. " + resultSpoken(g.state));
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
   * normalised here so nothing downstream has to know, and an
   * unrecognised slot becomes null rather than a row of
   * undefineds. Rating is left off when absent rather than
   * shown as 0 - an unrated game is a real case, not an
   * error. */
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

  // For the log line and nothing else - the panel builds its
  // own, because there the title is styled and here it is not.
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
        speak(resultSpoken(s));
      }
      return;
    }
  }

  /* ---- streaming ---- */

  var streamAbort = null;

  function startStream() {
    if (!api.gameId || dryRun || api.gameId === "PRACTICE") return;
    log("NET", "opening stream for " + api.gameId);
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    streamAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = { headers: authHeaders() };
    if (streamAbort) opts.signal = streamAbort.signal;

    fetch(LICHESS_BASE + "/api/board/game/stream/" + api.gameId, opts)
      .then(function (r) {
        if (!r.ok) throw new Error("stream HTTP " + r.status);
        if (!r.body || !r.body.getReader) throw new Error("no streaming body");
        streamFails = 0;          /* it opened: the ladder resets */
        stopPolling();            /* w62: one transport at a time - a
                                     transient body-less response must
                                     not leave stream and poll racing
                                     each other forever */
        var reader = r.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) { log("NET", "stream ended"); scheduleReconnect(); return; }
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
        // (w50). watchEvents has filtered this since it was
        // written; this catch never did, and the omission
        // built a loop that fed itself. startStream aborts the
        // previous stream on its way in, that abort rejects
        // the old reader, the rejection landed HERE, and
        // scheduleReconnect opened another stream two seconds
        // later - which aborted the one just opened. Every
        // turn of it re-delivered gameFull, so the page said
        // "reconnected. you are white. white to move." every
        // two seconds, for as long as the game lasted.
        if (String(e.name) === "AbortError") return;
        log("ERR", "stream: " + e.message);
        /* a 429 jumps the ladder straight to its cap (w63):
         * the spec asks for a minute's grace, and the early
         * rungs of the ladder are exactly the eager retrying
         * it is asking us to stop */
        if (/HTTP 429/.test(String(e.message))) {
          streamFails = Math.max(streamFails, 5);
        }
        if (String(e.message).indexOf("no streaming body") >= 0) startPolling();
        else if (!noteAuthFailure(e)) scheduleReconnect();
      });
  }

  /* A TOKEN THAT LICHESS NO LONGER ACCEPTS IS NOT A NETWORK
   * BLIP (w52). Every retry path here treated all failures the
   * same, so a revoked or expired token meant an HTTP 401 every
   * two seconds, forever, filling the log and telling the user
   * nothing - and the one thing they could actually DO about it
   * is the one thing nobody told them to do. Said once, and the
   * retrying stops, because retrying cannot fix it.
   */
  var authGone = false;
  function noteAuthFailure(e) {
    if (!/HTTP 40[13]/.test(String(e.message))) return false;
    if (authGone) return true;
    authGone = true;
    log("ERR", "lichess refused the token - signed out");
    uiStatus("Lichess refused the sign-in. Sign in again.");
    speak("lee chess signed you out. sign in again.");
    return true;
  }

  var reconnectTimer = null;
  var streamFails = 0;
  function scheduleReconnect() {
    // NOT GATED ON THE MIC (w50). This used to return unless
    // `running` - the voice loop's flag - was true, which tied
    // the game connection to the microphone. Turn voice off
    // (or let the mic give up after eight failures), have the
    // stream drop for any ordinary network reason, turn voice
    // back on: the mic restarts, nothing restarts the stream,
    // and the opponent's moves are never announced again.
    // Listening and being connected are different things. The
    // stream is cheap, every speaking path gates on its own
    // state, and being connected while silent costs nothing -
    // whereas being disconnected while listening is the
    // failure the keep-alive exists to prevent.
    if (api.over || dryRun || !api.gameId || api.gameId === "PRACTICE") return;
    if (authGone) return;
    // AND IT BACKS OFF (w52). A flat two seconds forever is
    // fine for the case this was written for - a stream that
    // drops once and comes straight back - and wrong for a
    // network that is simply gone, where it becomes a request
    // every two seconds for as long as the page is open,
    // draining a battery the owner is not looking at. Doubling
    // to a thirty-second ceiling keeps the first few retries
    // as quick as they ever were, which is the case that
    // actually matters.
    streamFails++;
    var wait = Math.min(2000 * Math.pow(2, streamFails - 1), 30000);
    log("NET", "reconnecting in " + (wait / 1000) + "s (try " + streamFails + ")");
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startStream, wait);
  }

  /* ---- polling fallback (if fetch streaming is unavailable) ----
   *
   * THIS PATH HAD NEVER SEEN A REAL GAME (w52). It exists for a
   * browser that cannot hold a streaming body open, which the
   * tested device can, so nothing here was ever exercised by
   * playing - and it showed. It reported the wrong player's
   * clock, it never noticed a game ending, and one bad move
   * put it in a reload loop until the next move arrived. The
   * review offered deleting it instead; the owner chose to
   * repair it, on the header's own rule that the page is
   * opened by whoever finds it, on whatever they own.
   *
   * WHAT THIS ENDPOINT CAN AND CANNOT SAY. /api/account/playing
   * is a list of the account's ONGOING games, so it carries
   * neither a status nor a result nor the opponent's clock, and
   * its `secondsLeft` is the account holder's. Everything below
   * is written to that limit rather than around it: what cannot
   * be known is left null and spoken as "unknown", and the end
   * of a game is inferred from the game leaving the list.
   */

  /* THE POLL IS THE WHOLE FALLBACK NOW, NOT HALF OF ONE (w62).
   * w52 repaired this path's arithmetic and never asked whether
   * it could be REACHED: gameStart arrives on the account event
   * stream, which needs the same streaming body these browsers
   * lack - so the fallback could FOLLOW a game that existed at
   * sign-in and could never START one, and startSeek's promise
   * that "the game arrives on the event stream anyway" was
   * false in exactly the browsers it was written for. A lodged
   * seek meant an opponent's clock running against a silent
   * page.
   *
   * So pollOnce now has two jobs, split on whether a game is
   * live: FOLLOW it (the w52 path, repaired again below), or
   * DISCOVER one - the most urgent entry in nowPlaying that we
   * are not already in becomes a join. watchEvents hands over
   * to polling when it has no streaming body, the same way
   * startStream always has. */
  var pollTimer = null;
  var pollSeen = false;      // has THIS game appeared in the list?
                             // (reset per game, in joinGame - a
                             // re-entry into polling for the same
                             // game must not forget it saw it)
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
    /* NOT GATED ON THE MIC (w62) - the same fault w50 removed
     * from scheduleReconnect was still here, four functions
     * down: voice off froze the poll, so moves, clocks and the
     * game-over inference all stopped, and a game that ended
     * during voice-off was missed forever. Listening and being
     * connected are different things, in this transport too. */
    if (dryRun) return;
    /* the ladder, poll-shaped (w62): with the network gone this
     * fired every 1.5s indefinitely. After four straight
     * failures, only every eighth tick goes out (~12s); one
     * success restores full cadence. */
    if (pollFails >= 4) {
      pollSkip++;
      if (pollSkip % 8 !== 0) return;
    }
    var forGame = api.gameId;   // w62: bail if the world changes
                                // while the request is in flight
    apiGet("/api/account/playing?nb=50").then(function (d) {
      pollFails = 0;
      /* THE WORLD MAY HAVE CHANGED UNDER THE REQUEST (w62).
       * Practice tapped, sign-out, or a join while this was in
       * flight: the landing response describes a game that is
       * no longer the question, and acting on it spoke a false
       * "game over" straight after "Practice mode." and killed
       * the practice game. */
      if (dryRun || api.gameId !== forGame) return;
      var live = api.gameId && api.gameId !== "PRACTICE" && !api.over;

      if (!live) {
        /* DISCOVERY (w62): no live game, so the most urgent
         * ongoing game IS the news. This is how a poll-only
         * browser ever starts a game: the seek or challenge is
         * lodged, the opponent arrives, and the game appears
         * here. nb=50 is the endpoint's maximum - at the old
         * nb=10 a correspondence account's live game could rank
         * off the page and read as nonexistent. */
        var g2 = (d.nowPlaying || [])[0];
        var gid2 = g2 && (g2.gameId ||
                          (g2.fullId || "").slice(0, 8));
        if (gid2 && gid2 !== api.gameId) joinGame(gid2);
        return;
      }

      var g = (d.nowPlaying || []).filter(function (x) {
        return x.gameId === api.gameId || (x.fullId || "").indexOf(api.gameId) === 0;
      })[0];
      if (!g) {
        /* The game left the list of ongoing games, so it is
         * over. The endpoint gives no status, so the sentence
         * does not guess a result. TWO consecutive missing
         * ticks are required (w62): the old one-shot inference
         * was irreversible, and a single anomalous response -
         * load-shedding, a stale cache - permanently ended a
         * live game. At 1.5s cadence the announcement still
         * lands within ~5 seconds. Polling continues afterwards
         * for DISCOVERY of the next game; it used to stop here,
         * which in a poll-only browser made the first game the
         * last. */
        if (pollSeen && !api.over) {
          pollMisses++;
          if (pollMisses < 2) return;
          api.over = true;
          clearDialogue();
          log("API", "game gone from nowPlaying - treating it as over");
          speak("game over. check lichess for the result.");
          uiGameChanged();
        }
        return;
      }
      pollSeen = true;
      pollMisses = 0;
      if (!api.myColor) {
        /* FIRST SIGHTING LOADS THE REAL POSITION (w62). This
         * built the START position and replayed only lastMove -
         * so joining mid-game (the COMMON poll case: a reload,
         * or connectAccount finding a game in progress), a
         * lastMove that happened to be legal from the start
         * position applied cleanly and the page silently held a
         * one-ply board against a thirty-move game. Every
         * refusal and every candidate match then ran against
         * the wrong board, for a user who cannot cross-check.
         * The endpoint's fen is FULL - side to move, castling,
         * ep, the lot - so load it and say whose move it is,
         * exactly as handleGameFull does. */
        api.myColor = g.color === "white" ? "w" : "b";
        api.pos = new RULES.Position();
        if (g.fen) api.pos.load(g.fen);
        api.moves = [];
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
          if (res.move.color === "w") api.lastSanW = res.san;
          else api.lastSanB = res.san;
          if (res.move.color !== api.myColor && speakOpponentNow()) {
            speak(sanToSpeech(res.san) + ".", colorWord(res.move.color));
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
           *
           * The fen is loaded WHOLE (w62). w52 appended a
           * fabricated turn and "KQkq" here and reasoned at
           * length about permissive castling rights - and the
           * reasoning was wrong twice over: the endpoint sends
           * a FULL fen, rights and all, and Position.load reads
           * fields from the front and ignored the appended
           * fabrication entirely. The code was accidentally
           * better than its comment, purely because load()
           * tolerates trailing junk. See the w62 HISTORY entry,
           * which corrects w52's claim. */
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
      /* A REVOKED TOKEN IN POLL MODE (w62): the exact failure
       * w52 cured for the streams - a 401 every tick, forever,
       * telling the user nothing - was untouched in the one
       * transport that has no stream. Same sentence, same halt. */
      if (noteAuthFailure(e)) { stopPolling(); return; }
      if (/HTTP 429/.test(String(e.message))) {
        pollFails = Math.max(pollFails, 4);      /* w63: back off now */
      }
      log("ERR", "poll: " + e.message);
    });
  }

  // The userscript read the game id from the lichess.org
  // URL. There is no such URL here, so the account's event
  // stream is watched instead: a gameStart event joins the
  // game whether it began from this page's seek/challenge
  // buttons, the Lichess app, or a friend's challenge.
  var eventAbort = null;
  var eventTimer = null;

  function watchEvents() {
    if (!storedToken()) return;
    try { if (eventAbort) eventAbort.abort(); } catch (e) {}
    eventAbort = (typeof AbortController !== "undefined")
      ? new AbortController() : null;
    var opts = { headers: authHeaders() };
    if (eventAbort) opts.signal = eventAbort.signal;
    log("NET", "opening the account event stream");
    fetch(LICHESS_BASE + "/api/stream/event", opts)
      .then(function (r) {
        if (!r.ok) throw new Error("event stream HTTP " + r.status);
        if (!r.body || !r.body.getReader) {
          throw new Error("no streaming body");
        }
        /* AFTER the body check (w62). It sat before it, the
         * opposite order from startStream, so a no-body browser
         * reset the ladder every attempt and retried flat at 3s
         * forever - the battery shape the ladder was built to
         * remove. Moot on this path now (no body hands over to
         * polling below), kept right for every other error. */
        eventFails = 0;
        var reader = r.body.getReader();
        var dec = new TextDecoder();
        var buf = "";
        function pump() {
          return reader.read().then(function (res) {
            if (res.done) {
              log("NET", "event stream ended");
              scheduleEventReconnect();
              return;
            }
            buf += dec.decode(res.value, { stream: true });
            var lines = buf.split("\n");
            buf = lines.pop();
            lines.forEach(function (ln) {
              if (!ln.trim()) return;
              var ev;
              try { ev = JSON.parse(ln); } catch (e) { return; }
              handleAccountEvent(ev);
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (e) {
        if (String(e.name) === "AbortError") return;
        log("ERR", "event stream: " + e.message);
        /* NO STREAMING BODY MEANS THE POLL IS THE ACCOUNT
         * FALLBACK TOO (w62). This used to reconnect forever -
         * fail, wait, fail - in a browser that can never hold
         * the stream open, and gameStart simply never arrived:
         * the fallback could follow a game and never start one.
         * pollOnce's discovery branch is the replacement. */
        if (String(e.message).indexOf("no streaming body") >= 0) {
          startPolling();
          return;
        }
        if (/HTTP 429/.test(String(e.message))) {
          eventFails = Math.max(eventFails, 4);   /* w63: cap, not eager */
        }
        if (!noteAuthFailure(e)) scheduleEventReconnect();
      });
  }

  var eventFails = 0;
  function scheduleEventReconnect() {
    if (!storedToken() || authGone) return;
    /* same ladder as the game stream, same reason (w52) */
    eventFails++;
    var wait = Math.min(3000 * Math.pow(2, eventFails - 1), 30000);
    clearTimeout(eventTimer);
    eventTimer = setTimeout(watchEvents, wait);
  }

  function handleAccountEvent(ev) {
    // gameId first, id as the fallback (w61): the spec marks
    // gameId/fullId required and id as the legacy spelling.
    if (ev.type === "gameStart" && ev.game &&
        (ev.game.gameId || ev.game.id)) {
      var gid = ev.game.gameId || ev.game.id;
      log("EVT", "gameStart " + gid);
      cancelSeek();
      // A GAME THIS APP CANNOT PLAY IS NAMED, NOT JOINED (w61).
      // gameStart carries compat.board: false for games the
      // Board API will not accept moves for - a bullet or
      // blitz game started from the Lichess app. Joining one
      // anyway meant every move 400'd with no explanation of
      // WHY; the user heard "Lichess rejected that move" for
      // every legal move they said, which reads as the
      // grammar breaking, not as the game being out of scope.
      if (ev.game.compat && ev.game.compat.board === false) {
        log("EVT", "game " + gid + " is not Board-API compatible");
        speak("a game has started that this app cannot play. " +
              "it is too fast. play it on lichess.");
        uiStatus("Game " + gid + " cannot be played here (too fast).");
        return;
      }
      // A REAL GAME OUTRANKS PRACTICE, AND SAYS SO (w50).
      // dryStart now closes this stream and cancels any seek,
      // so reaching here in practice means an event that was
      // already in flight, or an account reconnect after
      // practice began. Rare - and the old behaviour was to
      // join anyway with dryRun still true, which suppressed
      // every announcement the join would have made. A live
      // clock and no voice is the worst state this program
      // has, so practice loses, out loud. The mic is left as
      // it was: the user was speaking moves a moment ago and
      // is about to need to again.
      if (dryRun) {
        log("DRY", "real game " + gid + " started - leaving practice");
        dryRun = false;
        speak("a real game has started. leaving practice.");
        renderButton();
      }
      joinGame(gid);
    } else if (ev.type === "gameFinish") {
      log("EVT", "gameFinish");
      uiGameChanged();
    } else if (ev.type === "challengeDeclined" && ev.challenge) {
      var why = ev.challenge.declineReason || "declined";
      log("EVT", "challenge declined: " + why);
      uiStatus("Challenge declined - " + why);
      speak("challenge declined.");
    } else if (ev.type === "challengeCanceled") {
      log("EVT", "challenge cancelled");
      uiStatus("Challenge cancelled.");
    } else if (ev.type === "challenge" && ev.challenge &&
               ev.challenge.challenger &&
               (ev.challenge.challenger.id || "").toLowerCase()
                 !== (api.myId || "")) {
      log("EVT", "incoming challenge from " +
          (ev.challenge.challenger.name || "?"));
      uiStatus("Challenge from " +
          (ev.challenge.challenger.name || "someone") +
          " - accept it on Lichess or with the app.");
    }
  }

  function joinGame(gameId) {
    if (api.gameId === gameId && !api.over) return;
    api.gameId = gameId;
    api.myColor = null;
    api.pos = null;
    api.moves = [];
    api.over = false;
    offerState = { draw: false, takeback: false };
    oppGone = false; claimAsked = false;   /* w61 */
    pollSeen = false; pollMisses = 0;      /* w62: per-game, so a
                                              re-entry into polling
                                              cannot inherit the last
                                              game's sighting */
    // and the questions from whatever game came before this
    // one. api.moves going empty makes every ply guard read
    // "current" again, so the two ply-guarded asks would
    // survive into the new game rather than expire; the two
    // yes/no states never expired at all. See clearDialogue.
    clearDialogue();
    (api.myId ? Promise.resolve(api.myId) : fetchMyId())
      .then(startStream)
      .catch(function (e) {
        log("ERR", "join: " + e.message);
        speak("could not connect. check the log.");
      });
  }

  // Sign-in complete: learn who we are, watch for games,
  // and pick up a game already in progress if there is one.
  function connectAccount() {
    if (!storedToken()) return;
    fetchMyId().then(function () {
      // the account button carries the name (w10); this
      // line says only what is happening
      uiStatus("Waiting for a game.");
      // the account row shows the username and switches
      // the sign-in button's label, so it must repaint
      // once the name is known — without this the panel
      // still read "Sign in with Lichess" while connected
      renderAccount();
      watchEvents();
      return apiGet("/api/account/playing?nb=1");
    }).then(function (d) {
      var g = (d.nowPlaying || [])[0];
      if (g && g.gameId) {
        log("API", "already playing " + g.gameId);
        joinGame(g.gameId);
      }
    }).catch(function (e) {
      log("ERR", "connect: " + e.message);
      uiStatus("Could not connect - check the log.");
    });
  }

  /* ---- seek and challenge (from BoardEye) ---- */

  var seekAbort = null;

  function startSeek(minutes, increment, rated) {
    if (!storedToken() || seekAbort) return;
    minutes = Math.max(1, Number(minutes) || 15);
    increment = Math.max(0, Number(increment) || 0);
    var body = "rated=" + (rated ? "true" : "false") +
      "&time=" + minutes + "&increment=" + increment +
      "&variant=standard";
    // GUARDED LIKE EVERY OTHER AbortController HERE (w52).
    // startStream and watchEvents both test for it; this one
    // assumed it, which would throw on the very browsers the
    // polling fallback exists for - and the throw landed in
    // the catch below as "Seek failed", blaming the seek for a
    // missing browser feature.
    seekAbort = (typeof AbortController !== "undefined")
      ? new AbortController() : null;
    uiStatus("Seeking " + minutes + "+" + increment +
      (rated ? " rated" : " casual") + "...");
    log("API", "seek " + body);
    var seekOpts = {
      method: "POST",
      headers: {
        Authorization: "Bearer " + storedToken(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body
    };
    if (seekAbort) seekOpts.signal = seekAbort.signal;
    fetch(LICHESS_BASE + "/api/board/seek", seekOpts).then(function (r) {
      if (!r.ok) {
        seekAbort = null;
        // THE REASON, NOT JUST THE NUMBER (w61). The challenge
        // path has parsed the {error} body since w1; this one
        // said "HTTP 400" and left the user to guess. The guess
        // they could not make: the Board API only accepts
        // RAPID AND SLOWER for public seeks (blitz is fine for
        // direct challenges). At w61 half the preset row -
        // 3+0, 3+2, 5+0, 5+3 - was refusable here and fine
        // one button over; w64 removed those presets, but the
        // Custom box can still say 5+3, so the hint stays.
        // When a 400 lands on a blitz control, say which way
        // out exists.
        return r.json().catch(function () { return {}; })
          .then(function (j) {
            var why = j.error ? " - " + j.error : " (HTTP " + r.status + ")";
            var blitz = (minutes * 60 + 40 * increment) < 480;
            var hint = (r.status === 400 && blitz)
              ? " Blitz seeks are not allowed - challenge someone instead."
              : "";
            log("ERR", "seek refused" + why);
            uiStatus("Seek refused" + why + "." + hint);
            uiGameChanged();
          });
      }
      // The seek lives as long as this request streams - where
      // there IS a stream. Without one the seek is still
      // LODGED (Lichess has the POST); we simply cannot hold it
      // open or watch it, so say what is true rather than
      // throwing on r.body and reporting "Seek failed" for a
      // seek that is sitting in the pool right now.
      //
      // w52 ended this comment "the game arrives on the event
      // stream either way" - FALSE in exactly this browser,
      // which cannot hold the event stream open either. The
      // game arrives via pollOnce's discovery branch now
      // (w62), which is started below so a match is actually
      // noticed rather than promised.
      if (!r.body || !r.body.getReader) {
        seekAbort = null;
        log("NET", "seek posted, but this browser cannot hold it open");
        uiStatus("Seek sent. Waiting for a game.");
        startPolling();           /* w62: the watcher, not a hope */
        uiGameChanged();
        return;
      }
      var reader = r.body.getReader();
      function drain() {
        return reader.read().then(function (c) {
          if (!c.done) return drain();
        });
      }
      return drain().then(function () {
        seekAbort = null;
        uiGameChanged();
      });
    }).catch(function (e) {
      seekAbort = null;
      if (e.name !== "AbortError") {
        log("ERR", "seek: " + e.message);
        uiStatus("Seek failed (" + e.message + ").");
      }
      uiGameChanged();
    });
  }

  function cancelSeek() {
    if (!seekAbort) return;
    try { seekAbort.abort(); } catch (e) {}
    seekAbort = null;
    uiStatus("Seek cancelled.");
  }

  /* A CHALLENGE MUST BE KEPT ALIVE, OR IT QUIETLY DIES (w61).
   * The spec, verbatim: realtime challenges "expire after 20s
   * if not accepted. To prevent that, use the keepAliveStream
   * flag." This page never sent it, said "waiting.", and any
   * human who took half a minute to notice was accepting a
   * challenge that no longer existed - while the eyes-free
   * user waited on it. Never seen, because maia auto-accepts
   * within a second; the flaw was exactly the size of the gap
   * between a bot opponent and a human one.
   *
   * With the flag, the response is an ndjson stream and the
   * challenge lives as long as we hold it open - the seek's
   * own lifecycle, so it is handled the seek's way, abort
   * controller and drain and all. Aborting the stream CANCELS
   * the challenge (spec semantics), which is what
   * stopEverything and practice should do to one anyway. The
   * final {"done": ...} line is logged, not spoken: a decline
   * arrives as challengeDeclined on the event stream and an
   * accept arrives as gameStart, and both already speak -
   * saying it here too would say everything twice. */
  var challengeAbort = null;

  function sendChallenge(who, minutes, increment, rated, color) {
    if (!storedToken() || api.gameId && !api.over) return;
    if (challengeAbort) { uiStatus("Still waiting on the last challenge."); return; }
    who = (who || "").trim();
    if (!who) { uiStatus("Name an opponent."); return; }
    minutes = Math.max(1, Number(minutes) || 15);
    increment = Math.max(0, Number(increment) || 0);
    var body = "rated=" + (rated ? "true" : "false") +
      "&clock.limit=" + (minutes * 60) +
      "&clock.increment=" + increment +
      "&color=" + (color || "random") +
      "&variant=standard" +
      "&keepAliveStream=true";
    challengeAbort = (typeof AbortController !== "undefined")
      ? new AbortController() : null;
    uiStatus("Challenging " + who + "...");
    log("API", "challenge " + who + " " + body);
    var opts = {
      method: "POST",
      headers: {
        Authorization: "Bearer " + storedToken(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body
    };
    if (challengeAbort) opts.signal = challengeAbort.signal;
    fetch(LICHESS_BASE + "/api/challenge/" + encodeURIComponent(who), opts)
      .then(function (r) {
      if (!r.ok) {
        challengeAbort = null;
        return r.json().catch(function () { return {}; })
          .then(function (j) {
            log("ERR", "challenge refused (HTTP " + r.status +
                (j.error ? ": " + j.error : "") + ")");
            uiStatus("Challenge refused" +
                (j.error ? " - " + j.error : "") + ".");
          });
      }
      uiStatus("Challenge sent to " + who + " - waiting.");
      if (!r.body || !r.body.getReader) {
        // cannot hold it open: it is lodged, but on its 20s
        // clock. Say the true thing in the log at least.
        challengeAbort = null;
        log("NET", "challenge posted, but this browser cannot keep it " +
            "alive - it expires in 20s if not accepted");
        return;
      }
      var reader = r.body.getReader();
      var dec = new TextDecoder();
      var buf = "";
      function drain() {
        return reader.read().then(function (c) {
          if (c.done) return;
          buf += dec.decode(c.value, { stream: true });
          var lines = buf.split("\n");
          buf = lines.pop();
          lines.forEach(function (ln) {
            if (!ln.trim()) return;
            try {
              var ev = JSON.parse(ln);
              if (ev.done) log("EVT", "challenge " + ev.done);
            } catch (e) {}
          });
          return drain();
        });
      }
      return drain().then(function () { challengeAbort = null; });
    }).catch(function (e) {
      challengeAbort = null;
      if (e.name !== "AbortError") {
        log("ERR", "challenge: " + e.message);
        uiStatus("Challenge failed (" + e.message + ").");
      }
    });
  }

  function cancelChallenge() {
    if (!challengeAbort) return;
    try { challengeAbort.abort(); } catch (e) {}
    challengeAbort = null;
    log("API", "challenge cancelled");
  }

  // Everything that holds a connection, stopped in one place.
  // ONLY signOut CALLS THIS, and that is deliberate: voice off
  // deliberately tears down no network (web delta 2 in ui.js -
  // sign-in owns the connection, the button owns the voice),
  // and w50 leaned on that when it stopped gating the
  // reconnect on the mic. The comment here used to claim the
  // voice-off path used it too, which would have made those
  // two decisions contradict each other; it never did (w54).
  function stopEverything() {
    try { if (eventAbort) eventAbort.abort(); } catch (e) {}
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    cancelSeek();
    cancelChallenge();      /* aborting the keep-alive CANCELS it (w61) */
    clearTimeout(eventTimer);
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
  }


  // Leaving practice mode: the account stream only announces
  // NEW games, so a game that was already running when
  // practice took over the api state is picked up again the
  // same way connectAccount does at sign-in.
  function rejoinCurrent() {
    if (!storedToken()) return;
    apiGet("/api/account/playing?nb=1").then(function (d) {
      var g = (d.nowPlaying || [])[0];
      if (g && g.gameId) {
        log("API", "rejoining " + g.gameId);
        joinGame(g.gameId);
      } else {
        uiStatus("Waiting for a game.");
      }
    }).catch(function (e) { log("ERR", "rejoin: " + e.message); });
  }

