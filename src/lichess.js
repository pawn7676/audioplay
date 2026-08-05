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
   *  Everything between the transplants - syncMoves (with
   *  v134's stream-side readBackMine call), offers, clocks,
   *  results, gameFull/gameState, the stream and the polling
   *  fallback - is the userscript's VERBATIM. When the
   *  userscript moves, re-copy those parts; only the
   *  transplants are ours. This file was regenerated exactly
   *  that way when v134 landed (the read-back race fix and
   *  its pollOnce twin arrived by re-copy, untouched).
   *
   *  VERSION is reassigned here, not in settings.js (shared,
   *  and byte-frozen until the next joint bump): the w-series
   *  continues so no log dump ever collides with a v-number.
   *================================================================*/

  VERSION = "w42";

  var RULES = makeRules();

  var api = {
    gameId: null,
    myId: null,
    myName: null,        // shown on the sign-in button (web)
    myColor: null,
    pos: null,
    moves: [],            // uci list already applied
    lastSan: "", lastSanW: "", lastSanB: "",
    wtime: null, btime: null,
    over: false,
    mode: "none"          // "stream" | "poll"
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
    uiStatus("Signed out.");
    uiGameChanged();
  }

  function authHeaders() {
    return { Authorization: "Bearer " + (storedToken() || "") };
  }

  function apiGet(path) {
    return fetch("https://lichess.org" + path, { headers: authHeaders() })
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

  function postMove(uci) {
    var url = "https://lichess.org/api/board/game/" + api.gameId + "/move/" + uci;
    log("PST", "move " + uci);
    return fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) {
        return r.json().catch(function () { return { ok: r.ok }; })
          .then(function (j) { return { status: r.status, body: j }; });
      });
  }

  function postAction(action) {
    var url = "https://lichess.org/api/board/game/" + api.gameId + "/" + action;
    log("PST", action);
    return fetch(url, { method: "POST", headers: authHeaders() })
      .then(function (r) { return r.text().then(function (t) {
        log("PST", action + " -> " + r.status + " " + t.slice(0, 120));
      }); });
  }

  /* rebuild position from a uci move list, announcing only the new
   * tail */
  function syncMoves(uciString, announce) {
    var list = (uciString || "").trim() ? uciString.trim().split(/\s+/) : [];
    if (list.length < api.moves.length) {
      /* takeback or new game: rebuild from scratch, silently */
      api.pos = new RULES.Position();
      api.moves = [];
      announce = false;
    }
    for (var i = api.moves.length; i < list.length; i++) {
      var res = api.pos.applyUci(list[i]);
      if (!res) {
        log("ERR", "illegal uci from stream: " + list[i] + " (resyncing)");
        api.pos = new RULES.Position();
        api.moves = [];
        for (var j = 0; j < list.length; j++) {
          if (!api.pos.applyUci(list[j])) { log("ERR", "resync failed at " + list[j]); break; }
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

  /* An opponent's draw or takeback offer is invisible if you are not
   * looking at the screen, so it has to be spoken and answerable. */
  var offerState = { draw: false, takeback: false };

  function checkOffers(s) {
    if (!api.myColor) return;
    var oppDraw = api.myColor === "w" ? !!s.bdraw : !!s.wdraw;
    var oppTake = api.myColor === "w" ? !!s.btakeback : !!s.wtakeback;
    if (oppDraw && !offerState.draw && !api.over) {
      confirmAction = "drawoffer";
      log("API", "opponent offers a draw");
      speak(colorWord(api.myColor === "w" ? "b" : "w") +
            " offers a draw. Say yes to accept, no to decline.");
    }
    if (oppTake && !offerState.takeback && !api.over) {
      confirmAction = "takebackoffer";
      log("API", "opponent asks for a takeback");
      speak(colorWord(api.myColor === "w" ? "b" : "w") +
            " asks to take back a move. Say yes to accept, no to decline.");
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
    api.pos = new RULES.Position(g.initialFen && g.initialFen !== "startpos"
                               ? g.initialFen : undefined);
    api.moves = [];
    var whiteId = ((g.white && g.white.id) || "").toLowerCase();
    api.myColor = (whiteId && whiteId === api.myId) ? "w" : "b";
    log("API", "game " + api.gameId + " you are " +
        (api.myColor === "w" ? "white" : "black"));
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

  function handleGameState(s, announce) {
    if (!s) return;
    syncMoves(s.moves, announce !== false);
    api.wtime = s.wtime; api.btime = s.btime; api.clockAt = Date.now();
    checkOffers(s);
    if (s.status && s.status !== "started" && s.status !== "created") {
      if (!api.over) {
        api.over = true;
        log("API", "game over: " + s.status + " " + (s.winner || ""));
        speak(resultSpoken(s));
      }
      return;
    }
  }

  /* ---- streaming ---- */

  var streamAbort = null;

  function startStream() {
    if (!api.gameId || dryRun || api.gameId === "PRACTICE") return;
    api.mode = "stream";
    log("NET", "opening stream for " + api.gameId);
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    streamAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var opts = { headers: authHeaders() };
    if (streamAbort) opts.signal = streamAbort.signal;

    fetch("https://lichess.org/api/board/game/stream/" + api.gameId, opts)
      .then(function (r) {
        if (!r.ok) throw new Error("stream HTTP " + r.status);
        if (!r.body || !r.body.getReader) throw new Error("no streaming body");
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
              else if (ev.type === "chatLine") { /* ignore */ }
            });
            return pump();
          });
        }
        return pump();
      })
      .catch(function (e) {
        log("ERR", "stream: " + e.message);
        if (String(e.message).indexOf("no streaming body") >= 0) startPolling();
        else scheduleReconnect();
      });
  }

  var reconnectTimer = null;
  function scheduleReconnect() {
    if (api.over || !running || dryRun) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(startStream, 2000);
  }

  /* ---- polling fallback (if fetch streaming is unavailable) ---- */

  var pollTimer = null;
  function startPolling() {
    api.mode = "poll";
    log("NET", "falling back to polling /api/account/playing");
    clearInterval(pollTimer);
    pollTimer = setInterval(pollOnce, 1500);
    pollOnce();
  }

  function pollOnce() {
    if (!running || api.over || dryRun) return;
    apiGet("/api/account/playing?nb=10").then(function (d) {
      var g = (d.nowPlaying || []).filter(function (x) {
        return x.gameId === api.gameId || (x.fullId || "").indexOf(api.gameId) === 0;
      })[0];
      if (!g) return;
      if (!api.myColor) {
        api.myColor = g.color === "white" ? "w" : "b";
        api.pos = new RULES.Position();
        speak((everConnected ? "reconnected" : "connected") +
              ". You are " + g.color + ".");
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
          log("ERR", "poll desync on " + g.lastMove + "; reloading from fen");
          api.pos.load(g.fen + " " + (g.isMyTurn
            ? (api.myColor === "w" ? "w" : "b")
            : (api.myColor === "w" ? "b" : "w")) + " KQkq - 0 1");
        }
      }
      api.wtime = g.secondsLeft != null ? g.secondsLeft * 1000 : null;
    }).catch(function (e) { log("ERR", "poll: " + e.message); });
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
        scheduleEventReconnect();
      });
  }

  function scheduleEventReconnect() {
    if (!storedToken()) return;
    clearTimeout(eventTimer);
    eventTimer = setTimeout(watchEvents, 3000);
  }

  function handleAccountEvent(ev) {
    if (ev.type === "gameStart" && ev.game && ev.game.id) {
      log("EVT", "gameStart " + ev.game.id);
      cancelSeek();
      joinGame(ev.game.id);
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
    seekAbort = new AbortController();
    uiStatus("Seeking " + minutes + "+" + increment +
      (rated ? " rated" : " casual") + "...");
    log("API", "seek " + body);
    fetch(LICHESS_BASE + "/api/board/seek", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + storedToken(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body,
      signal: seekAbort.signal
    }).then(function (r) {
      if (!r.ok) {
        seekAbort = null;
        log("ERR", "seek refused (HTTP " + r.status + ")");
        uiStatus("Seek refused (HTTP " + r.status + ").");
        return;
      }
      // The seek lives as long as this request streams.
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

  function sendChallenge(who, minutes, increment, rated, color) {
    if (!storedToken() || api.gameId && !api.over) return;
    who = (who || "").trim();
    if (!who) { uiStatus("Name an opponent."); return; }
    minutes = Math.max(1, Number(minutes) || 15);
    increment = Math.max(0, Number(increment) || 0);
    var body = "rated=" + (rated ? "true" : "false") +
      "&clock.limit=" + (minutes * 60) +
      "&clock.increment=" + increment +
      "&color=" + (color || "random") +
      "&variant=standard";
    uiStatus("Challenging " + who + "...");
    log("API", "challenge " + who + " " + body);
    fetch(LICHESS_BASE + "/api/challenge/" + encodeURIComponent(who), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + storedToken(),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; })
          .then(function (j) {
            log("ERR", "challenge refused (HTTP " + r.status +
                (j.error ? ": " + j.error : "") + ")");
            uiStatus("Challenge refused" +
                (j.error ? " - " + j.error : "") + ".");
          });
      }
      uiStatus("Challenge sent to " + who + " - waiting.");
    }).catch(function (e) {
      log("ERR", "challenge: " + e.message);
      uiStatus("Challenge failed (" + e.message + ").");
    });
  }

  // Everything that holds a connection, stopped in one
  // place: sign-out and the voice-off path both use it.
  function stopEverything() {
    try { if (eventAbort) eventAbort.abort(); } catch (e) {}
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    cancelSeek();
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

