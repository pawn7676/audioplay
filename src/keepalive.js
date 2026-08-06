  /*========================== KEEP-ALIVE ==========================*/

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
    // Safari answered "operation is not supported" to the
    // same bytes as a data: URI, so hand it a Blob instead.
    try {
      var blob = new Blob([buf], { type: "audio/wav" });
      return URL.createObjectURL(blob);
    } catch (e) {
      // ONLY NOW IS THE BASE64 NEEDED (w53). The chunked
      // string was built unconditionally, above the try, so
      // every start of the keep-alive assembled a ~22KB string
      // one 8192-character slice at a time and then, on every
      // browser that has Blob - which is all of them the page
      // supports - threw it away unused.
      var bin = "", CH = 8192;          // chunked: avoid arg limits
      for (var o = 0; o < buf.length; o += CH) {
        bin += String.fromCharCode.apply(null, buf.subarray(o, o + CH));
      }
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

