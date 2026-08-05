// ==UserScript==
// @name         Lichess Audioplay
// @version      137
// @description  Eyes-free voice play on Lichess (Board API)
// @match        https://lichess.org/*
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM.deleteValue
// @run-at       document-idle
// ==/UserScript==

/*  SETUP
 *  1. Create a token at
 *     https://lichess.org/account/oauth/token/create
 *     Tick "board:play". The script asks for it the first
 *     time and remembers it, so later versions do not need
 *     it pasted in again. It is kept in the Userscripts
 *     app's own storage, out of reach of anything running
 *     on the page. Tap "token" in the log panel to replace
 *     or clear it.
 *  2. Save this file in the Userscripts app folder and
 *     enable it for lichess.org.
 *  3. Open a game, tap the round button ONCE (iOS needs
 *     one touch to unlock mic and audio), then walk to
 *     your board.
 *
 *  SPEAKING MOVES
 *    "echo four"
 *    "knight takes delta five"
 *    "castle kingside"
 *    "echo eight equals knight"
 *    "bravo one charlie three"
 *
 *    A bare square is always a pawn move: "foxtrot three" is
 *    f3. Say "pawn foxtrot three" or "push foxtrot three" to
 *    be explicit and rule out any chance of it being heard
 *    as a piece move.
 *
 *    Either way it means the pawn PUSHES to that square. A
 *    pawn capture always needs "takes" and the file it
 *    comes from: "foxtrot takes golf five".
 *
 *    One safeguard: if a PIECE could also legally reach
 *    that square, a bare square is confirmed as a pawn move,
 *    in case the piece name was lost by the mic. Answering
 *    "no" then offers the piece moves. Saying "pawn foxtrot
 *    three" skips the question. So does naming a promotion
 *    ("golf one equals knight"): only a pawn can promote,
 *    so the pawn was named as surely as saying "pawn".
 *
 *    A capture can name the VICTIM instead of the square:
 *      "queen takes queen"
 *      "knight takes rook"
 *    Only when it can mean one thing. Two takeable rooks,
 *    or two knights able to take the one rook, and it asks
 *    which — so it is worth saying only where it is
 *    obviously unique, which is where it saves the most.
 *    The moving piece must be named: "takes queen" alone is
 *    not this form.
 *
 *    The same safeguard covers a bare "takes": if a piece
 *    could also capture that square, "takes foxtrot three"
 *    is confirmed as the pawn capture first, in case it was
 *    "queen takes foxtrot three" missing its first word.
 *    Naming the from-file ("golf takes foxtrot three")
 *    skips the question, as the grammar always asked.
 *
 *  STRAY TALK
 *    The mic stays open all game, so everything said in the
 *    room reaches it. Anything with no move in it is
 *    ignored silently while the opponent is thinking, and
 *    only logged. A real move spoken at the wrong moment
 *    still gets an answer, so a mistimed move is never
 *    swallowed without a word.
 *
 *  SAYING "CHECK"
 *    Say it as part of the move, not after a pause:
 *      "rook takes echo three check"
 *    Said that way it helps, ruling out any candidate that
 *    does not give check. Said on its own a moment later it
 *    is just a word with no move in it, and is ignored like
 *    any other stray talk.
 *
 *  IF A LETTER KEEPS BEING MISHEARD
 *    Single letters work as well as NATO words, and are
 *    sometimes clearer: "A four" is the same as "alpha
 *    four", "B takes charlie five" the same as "bravo
 *    takes charlie five". Use whichever iOS hears best;
 *    they can be mixed freely in one move.
 *
 *  IF THE FIRST WORD KEEPS GETTING LOST
 *    iOS needs a moment to notice speech has started, and
 *    can miss the opening syllable. Start with a word
 *    that does not matter and let it absorb the loss:
 *      "move knight foxtrot three"
 *      "okay rook takes echo seven"
 *    "move", "play", "please", "okay", "um" are all ignored.
 *
 *  COMMANDS
 *    "repeat"      repeats last move ("say again" also works)
 *    "clock"       time remaining ("time" also works)
 *    "cancel"      drop out of a yes/no question
 *    "resign"      asks yes or no first
 *    "offer draw"  asks yes or no first
 *    "flip clock"  swaps which side of the clock screen
 *                  your own clock is on, to match the side
 *                  of the board the iPad is standing on.
 *    "memo"        text is written to the log, never parsed
 *                  as a move. Answered "Memo recorded in log".
 *                  Memo must be spoken in a continuous manner.
 *                  A pause ends the memo.
 * 
 *  QUESTIONS
 *    "whose turn"
 *    "what is on delta four"
 *    "where are my knights"
 *    "where are the black rooks"
 *
 *  PRACTICE MODE
 *    Tap "practice" instead of the round button. Nothing
 *    is sent and no token is used. Moves are parsed and
 *    read back, and a random legal reply is announced.
 *    On a game page, from the button. PRACTICE_MODE in
 *    section 1 removes the button and the mode with it.
 *
 *  DEBUG
 *    Tap "log" for the on-screen log. Everything heard,
 *    sent and received is recorded, with the reply from
 *    Lichess to every move. "copy" puts it on the
 *    clipboard so it can be pasted elsewhere.
 */

(function () {
  "use strict";

  /*========================= CONTENTS =============================
   *
   *   1. SETTINGS       every knob, gathered in one place
   *   2. DEBUG LOG      the log buffer and log()
   *   3. VOCABULARY     NATO, numbers, pieces, homophones
   *   4. PARSING        transcript -> move request; commands,
   *                     questions about the position
   *   5. MATCHING AND RANKING
   *                     request -> candidate moves, ordering,
   *                     dedupe, clipped readings, bare-push guard
   *   6. DIALOGUE       yes/no confirmations, practice mode, and
   *                     handleTranscripts, the main entry point
   *   7. SPEECH OUT     TTS, pacing, spoken spellings
   *   8. CHIMES         removed in v68; tombstone only
   *   9. MIC            the speech recognition loop
   *  10. KEEP-ALIVE     silent audio holding the iOS session
   *  11. LICHESS API    token, stream, polling, game state
   *  12. UI             buttons and the log panel
   *  13. CHESS RULES    legal move generator (FROZEN)
   *  14. CLOCK MODE     black screen: the two clocks
   *  15. BOOT           page detection and startup
   *================================================================*/

  /*=================== HARD CONSTRAINTS ===========================
   * 1. FAIR PLAY. This file contains a legal-move generator
   *    and nothing else: no evaluation, no search, no
   *    opening book, no move recommendation. Lichess bans
   *    analysis assistance. The word "engine" is
   *    deliberately absent; it is called RULES. Section 13
   *    is the whole of it, and it may only answer which
   *    moves are LEGAL and what they are CALLED.
   *
   * 2. NO DOM SCRAPING. Everything comes from the Lichess
   *    Board API (/api/board/game/stream/{id} and
   *    POST .../move/{uci}). An earlier version scraped the
   *    move list from the page and broke every time Lichess
   *    changed its markup. Exactly ONE DOM dependency
   *    survives, in section 15: detecting that a game page
   *    is on screen (PAGE_MARKERS).
   *
   * 3. NO EXTERNAL LIBRARIES. The move generator is
   *    embedded, about 350 lines. A CDN @require was tried
   *    and removed: Lichess's Content Security Policy
   *    blocks it.
   *
   * 4. @name MUST NEVER CHANGE. The Userscripts app uses
   *    @name as the script's identity and keys GM storage
   *    to it. Putting a version number in @name created a
   *    NEW script with empty storage on every release, which
   *    meant re-pasting the API token each time. The version
   *    goes in @version and the VERSION constant, nowhere
   *    else.
   *
   * 5. ONE FILE. The answer to size is organization, hence
   *    the numbered sections above.
   *================================================================*/

  /*================ PLATFORM: iPad, Safari, iOS ===================
   * Findings from real games, each of which cost time to
   * discover. Stated as behaviour, then its consequence
   * here. Do not "fix" the code these produced without
   * reproducing the behaviour first.
   *
   * - iPadOS ECHO-CANCELS OUR OWN TTS out of the mic while
   *   speech recognition is active: at maximum speaker
   *   volume the recogniser delivers no transcript of
   *   anything we say, tested both gated and ungated
   *   (v132, two logged practice sessions). The whole
   *   self-hearing defense of v122-v123 guarded a failure
   *   AEC already prevents, and was deleted at v132. The
   *   signal that this finding has expired: a move playing
   *   unbidden immediately after a spoken question.
   *
   * - iOS SUSPENDS AudioContext with the screen off, and
   *   silently DISCARDS <audio> output while the mic is
   *   open. Chimes died to this over three versions (see
   *   the section 8 tombstone). Only TTS speech is reliably
   *   audible, so any confirmation or alert MUST be spoken.
   *   (v80-v108 could also show it on screen in silent
   *   mode; that screen was deleted at v109.)
   * - A PLAYING media element keeps the tab alive. The
   *   silent looping WAV in section 10 holds the iOS audio
   *   session; without it the page suspends with the screen
   *   off. It is NOT a chime and must not be removed with
   *   them.
   * - A STOPPED RECOGNISER CANNOT RESTART with the screen
   *   off: it returns "not-allowed" and stays dead for the
   *   rest of the game. MIC_ALWAYS_ON = true is required,
   *   not a preference.
   * - STARTING/STOPPING THE RECOGNISER plays iOS dictation
   *   tones. Also solved by MIC_ALWAYS_ON.
   * - THE FIRST UTTERANCE after the audio route comes up is
   *   swallowed outright. A silent primer utterance absorbs
   *   it (primeAudioRoute, section 7).
   * - onend FIRES WHILE AUDIO IS STILL PLAYING, so speech
   *   gaps poll speechSynthesis.speaking before timing the
   *   pause (waitUntilQuiet).
   * - SAFARI CLIPS THE FIRST WORD of an utterance. Readings
   *   missing a leading piece name are demoted, never
   *   deleted (clippedIndexes, section 5). The same clipping
   *   sank bare "none" as a list answer in the deleted
   *   silent mode: clipped, it became "one". Any future
   *   answer vocabulary must be chosen by phonetic
   *   distance from what it can play.
   * - data: URIs WERE REJECTED for audio; Blob URLs work.
   * - FULLSCREEN EXIT CORRUPTS THE LAYOUT VIEWPORT until
   *   Safari is force-quit. Closed case, three failed
   *   repairs; see the guard comments in sections 12 and
   *   14.
   *================================================================*/

  /*===================== HOW THIS IS TESTED =======================
   * There is no browser in the loop, so the logic is
   * extracted FROM THIS FILE and run in node — never from a
   * separate copy, so the tests always exercise what ships.
   * Slices are located by the numbered section headers
   * above. Sections are numbered in FILE ORDER, so BOOT is
   * last and stays last; renumbering means re-checking the
   * markers named below and every "section N" in the file.
   *
   *   perft         the rules slice, from makeRules() to the
   *                 14. CLOCK MODE header. startpos depth 4 =
   *                 197281, Kiwipete depth 3 = 97862. Re-run
   *                 BOTH after any edit to section 13.
   *   parser        the 3. VOCABULARY to 6. DIALOGUE slice,
   *                 driven with real transcripts from game
   *                 logs, with log/api/settings stubbed
   *   property      every bare-square utterance across
   *                 hundreds of random games; 320k generated
   *                 utterances confirmed that no bare square
   *                 can produce a piece move or a capture
   *   harness       a stubbed-DOM boot of the WHOLE file
   *                 that clicks the buttons and drives
   *                 handleTranscripts, covering the display
   *                 geometry and a v78-parity check that
   *                 voice mode is unchanged
   *
   * NONE OF THESE PERSIST. There is no stored test suite:
   * each session rebuilds them from this file, runs them,
   * and throws them away, which is what "never from a
   * separate copy" means above. Do not ask the user to
   * update tests; there are none to update.
   *
   * Two house rules: comment lines are kept to 70 characters
   * so they read on an iPad, and nothing is added to the
   * vocabulary tables speculatively — every entry came from
   * a real mishearing in a real log.
   *================================================================*/

  /*================== BLUETOOTH IS A DIFFERENT ROUTE ==============
   * Measured, not theorised: the opening announcement lost
   * its first word and everything was painfully loud on
   * BLUETOOTH HEADPHONES, and both went away entirely on
   * the iPad's own speaker, same build, minutes apart. iOS
   * switches a Bluetooth device to its hands-free profile
   * when the microphone opens, and that switch costs both
   * a moment of audio and a level change the page has no
   * say in. Nothing here can fix it: output volume is the
   * system's, and utterance.volume is unreliable on iOS.
   *
   * What this means in practice: SPEAKER PLAY IS THE TESTED
   * CONFIGURATION. If headphones are used, expect the
   * first word of an announcement to suffer. Do not chase
   * a clipping report without asking what the audio was
   * coming out of first.
   *================================================================*/

  /*=================== CLOSED CASES / TOMBSTONES ==================
   * Things that were BUILT and REMOVED. They leave no code
   * to hang a comment on, which is exactly why they are
   * recorded here: each has been re-proposed at least once,
   * and each would cost days to re-disprove.
   *
   * SOUND IS SETTLED — do not propose it again. The whole
   * arc: WebAudio chimes (died with the screen off) ->
   * WAV-in-<audio> chimes (silently eaten by iOS with the
   * mic open; game4 logged SFX ok on all 39 moves with zero
   * errors while four were inaudible, and neither a delay
   * nor a doubled length helped) -> a spoken "ok." (never
   * lost, but forty a game was hated) -> driving Lichess's
   * OWN move sounds (built and reverted the same day: they
   * are WebAudio too) -> the full spoken read-back of each
   * accepted move, which is what READ_BACK_MY_MOVE does
   * today. Confirmation on this platform must be speech,
   * and flat repeated speech grates: it must carry
   * information to earn its airtime. Section 8 is the
   * detailed tombstone.
   *
   * FULLSCREEN-EXIT CORRUPTION — SOLVED AT v108 BY NOT
   * GOING FULLSCREEN. After any element fullscreen EXIT the
   * layout viewport stayed offset until Safari was
   * force-quit, and pull-down overscroll then left the button
   * row displaced. THREE in-page repairs were built and all
   * removed: v75 re-composited the row (no effect — the
   * layout viewport itself is what shifts), v76 pinned it
   * to visualViewport on every scroll (the buttons visibly
   * jumped during normal scrolling: worse than the bug),
   * and v79 tried scroll-home plus a forced root reflow at
   * the exit (no effect on device, deleted the same day).
   * This block then recorded a one-line out — stop calling
   * the enter-fullscreen helpers — and v108 took it, after
   * the same fix worked on the website build. The four
   * helpers are DELETED, not disabled.
   *
   * WHY IT WORKS: the corruption is caused by the EXIT, and
   * there is no longer an exit. The overlays run under
   * Safari's toolbar instead, which costs the toolbar's
   * strip of screen and nothing else. CLOCK_BARE_MAX_VH
   * dropped from 80 to 62 to suit; see its note.
   *
   * DO NOT REINSTATE fullscreen, and do not attempt another
   * in-page repair, without a fundamentally different
   * theory.
   *
   * THE KEEP-ALIVE STAYS. With the screen-on overlays as
   * the primary way of playing, stripping section 10 was
   * considered. Measured: only about 3% of the file is
   * truly screen-off specific. It is kept as the FALLBACK
   * LAYER — iOS may drop the wake lock at will, and with
   * the keep-alive present a dropped lock plus a sleeping
   * screen still leaves a fully alive game. Without it the
   * page suspends silently, and the ugly case is a sleep
   * during the OPPONENT'S think: their move arrives
   * unannounced, the user waits deaf at the board, and the
   * clock burns into Lichess's claim-victory window.
   *
   * NO SPOKEN LOW-TIME WARNING — asked for and DECLINED,
   * v92. Game11 was lost on the clock in voice mode with
   * the screen off, where the two overlays' red under-a-
   * minute color cannot be seen and "clock" is the only
   * way to know the time. A warning at thresholds was
   * proposed on exactly that evidence and refused as too
   * distracting, which settles it: an alert that fires
   * while the user is thinking, and that gates the mic
   * when it speaks, costs more than the flag it prevents.
   * "clock" answers on demand and stays the whole answer.
   * Do not add unprompted clock speech of any kind.
   *
   * THE SPOKEN "CLOCK MODE" IS GONE (v98), and with it
   * classifyClockMode. It could not go fullscreen — Safari
   * grants that only from a real gesture — so entering by
   * voice put the clock screen under the toolbar, which was
   * then the wrong thing to look at; tried once and never
   * used again. (v108 removed fullscreen altogether, so
   * that particular asymmetry no longer exists; the phrase
   * stays deleted on the separate ground below.) What
   * remains in the clock vocabulary is bare "clock", which
   * SPEAKS the times, and "flip clock", which swaps the
   * sides. Deleting the third phrase removed the only real
   * collision risk between them. Anything that changes the
   * SCREEN is now a tap, and anything spoken either answers
   * or rearranges — a cleaner line than the one it replaced.
   * SPOKEN "SILENT MODE" WENT THE SAME WAY one version
   * later, once it turned out the user had never known it
   * existed — which is why no log ever showed it used. It
   * had the same fullscreen defect and the same one-tap
   * button beside it. Both screens are now tap-only, in and
   * out, and the rule is worth keeping: A SPOKEN COMMAND
   * THAT NEEDS A GESTURE IT CANNOT MAKE SHOULD NOT EXIST.
   *
   * THE GRAMMAR'S REJECTED IDEAS. Greek letters are barred
   * on purpose: NATO and Greek share alpha and delta, which
   * tempts a slide into Greek, but "gamma" sounds like g
   * while meaning c — a wrong-but-legal move played
   * silently is worse than a clean failure. "note" was
   * renamed "memo" in v68 because Safari kept confusing it
   * with "no", the most loaded answer word in the grammar.
   * A list-only nine/ten digit table was considered for
   * silent mode and rejected as speculative vocabulary;
   * the cap stayed at 8 because NUMS stops at 8, as ranks
   * do. Moot since v109 deleted the list with silent mode.
   *================================================================*/

  /*=================== WHERE THE VERSIONS WENT ====================
   *  Arranged from newest to oldest:
   *
   *  v137     THEY ARE BUTTONS, NOT "CHIPS". A rename,
   *           nothing else: testChip/logChip/clkChip/
   *           setChip -> practiceBtn/logBtn/clockBtn/
   *           settingsBtn, chipRow -> buttonRow, CHIP_ON/
   *           CHIP_OFF -> BUTTON_ON/BUTTON_OFF, paintChip
   *           -> paintButton, and the word itself out of
   *           every comment. The owner's point: the borrowed
   *           word made a plain button sound like a special
   *           kind of thing, in the one file a newcomer
   *           reads first. NO BEHAVIOUR CHANGED - installing
   *           v137 is optional, and a v136 install stays
   *           correct.
   *  v136     "CANCEL" WAS SILENT AT A REPAIR QUESTION.
   *           The website's second full game (w25-1,
   *           18:42:58): a half-square repair asked "say
   *           the rank", the owner said cancel TWICE and
   *           heard nothing either time, then waited a
   *           hundred seconds. cancel had been handled for
   *           the yes/no walk and the confirmations since
   *           v92, but askPartial and askPiece keep their
   *           state in partialAsk/pieceAsk and fell through
   *           to a bare return. Both now close on cancel
   *           with the pending path's own words. THE
   *           GENERAL LESSON, worth more than the fix: a
   *           question that can be asked must be
   *           cancellable, and every path an eyes-free user
   *           can reach must SAY something - silence reads
   *           as "not heard", not as "done".
   *  v135     THE LOG RECORDS THE STARTING SWITCHES. Every
   *           settings FLIP was logged since v124, but the
   *           state they started from never was, so a dump
   *           reader had to guess six of the eight. One
   *           "SET loaded:" line at boot now lists every
   *           switch and the voice. Asked for by the owner
   *           after the website's first game log showed
   *           two flips with no baseline. FIRST VERSION
   *           BUILT FROM THE SHARED TREE: v134 was cut
   *           into section files and this change was made
   *           there, flowing into the userscript and the
   *           website (w23) from the same edit.
   *  v134     THE READ-BACK STOPPED WAITING FOR THE 200.
   *           game24 14:18:58: e4 posted, the stream
   *           carried our own move back, then the reply,
   *           and only THEN did the POST promise resolve -
   *           so the board heard "black charlie 5" before
   *           "white echo 4", the answer to a move it had
   *           not yet been told was played. Nothing was
   *           wrong with the ordering rule; the read-back
   *           was simply hung on the slower of the two
   *           events. It now fires from WHICHEVER ARRIVES
   *           FIRST - syncMoves seeing our own uci, or the
   *           200 - through readBackMine(), which is armed
   *           by acceptMove with that uci and disarms
   *           itself on the first call, so the loser of
   *           the race says nothing. The mate rule is
   *           carried inside it unchanged (v104: a SAN
   *           ending in # is never read back, the result
   *           line says it better), and only a move WE
   *           posted is ever armed, so a move made on the
   *           Lichess board by hand is still silent as
   *           before. The stream's SAN is used when the
   *           stream wins: same generator, same string,
   *           and it is the authoritative copy.
   *           "channel" JOINS THE C-FILE, the ninth
   *           spelling iOS has for Charlie (14:19:39, five
   *           of six readings) and the first to be an
   *           ordinary English word, so it goes into
   *           FUZZY_EXACT_ONLY beside the other eight -
   *           "channels", "chapel" and "change" all sit
   *           within one or two edits and none of them
   *           means the c-file.
   *           AND THE STRIP CAPITALISES ITS SENTENCES.
   *           Everything spoken is written lower case,
   *           which is right for TTS and wrong on screen:
   *           "checkmate. white wins." now paints as
   *           "Checkmate. White wins." sentenceCase() sits
   *           in showClockMessage alone, so the voice, the
   *           log and every string in the file are
   *           untouched - one display transform at the one
   *           place text reaches the glass.
   *  v133     CONFIRM WAS ECLIPSING THE GUARD (13:33 log,
   *           found the day v132 shipped). With
   *           confirmMyMove on, a lone candidate went
   *           straight to pending WITHOUT the bare-square
   *           expansion - that call lived only in the
   *           confirm-off branch - so "hotel three" asked
   *           about h3 alone and "no" dead-ended on "that
   *           was the only legal move", with Nh3 sitting
   *           right there unreachable. Both settings on
   *           made the knight unplayable by bare square.
   *           Now the confirm branch guards too:
   *           pending gets bareGuardCands' expanded list
   *           when it applies, the plain single when not.
   *           Confirm still confirms everything; "no" now
   *           walks to the pieces instead of a wall. One
   *           question serves both settings, so both-on
   *           costs the same single ask as guard alone.
   *  v132     THE SELF-HEARING APPARATUS IS DELETED, all
   *           of it: the headphones toggle, the speaking
   *           gate, the 400ms tail, the v122 hold-and-
   *           recover echo test, spokenRecent, flushHeard.
   *           The failure the lot guarded against - the
   *           mic transcribing our own TTS and the parser
   *           playing a move out of it - was HUNTED AND
   *           NOT FOUND on the device: two practice
   *           sessions, iPad speaker at maximum volume,
   *           first with the gate live (zero "held while
   *           speaking" lines - the mic delivered NOTHING
   *           under speech, so there was nothing to bin)
   *           and then with headphones on, the mic wholly
   *           ungated, the guard question spoken into
   *           open air and twenty silent seconds after it:
   *           not one transcript of our own words. iPadOS
   *           echo cancellation eats the TTS before the
   *           recogniser sees it. The behaviour shipped is
   *           the old headphones=on on every audio route.
   *           The gate also had a record of friendly fire
   *           - game22 (v122) lost a real move to it - so
   *           what is deleted is a defense that cost a
   *           move and was never once seen to earn one.
   *           IF A MOVE EVER PLAYS UNBIDDEN right after an
   *           announcement, AEC has stopped covering us
   *           (an iPadOS update, or hardware this device
   *           does not represent): restore by taking the
   *           apparatus back from v131, the last version
   *           that carries it. The token trick of the old
   *           semantics: v131 headphones=OFF equals
   *           nothing shippable at all now, and
   *           headphones=ON equals this version.
   *  v131     THE KEY FOLLOWS THE LABEL after all.
   *           confirmAllMoves -> confirmMyMove, every
   *           read, reversing the v130 call to let them
   *           diverge: one name is one grep, and future
   *           confusion outweighs a semantic nuance the
   *           comment above the default carries anyway.
   *           loadSettings migrates a stored
   *           confirmAllMoves into the new key ONCE, so
   *           no saved panel silently resets - the line
   *           can be deleted after the panel has been
   *           saved once on the device. Older changelog
   *           entries keep the old name: they are history.
   *  v130     PANEL POLISH III, from the v129 screenshot.
   *           "confirm all moves" reads as "confirm my
   *           move": under the ALL MODES header the old
   *           label made "all" carry two meanings at once
   *           - all modes, which the header already says,
   *           and every-move-not-just-ambiguous, which is
   *           the setting. The KEY stays confirmAllMoves:
   *           renaming it would drop the stored value from
   *           every saved panel, and the internal name
   *           still records the real semantic. And the
   *           clock rows regroup by content, speak before
   *           show within each: speak my move, speak
   *           opponent's move, show moves, then speak
   *           messages, show messages. Two stanzas of the
   *           same shape, and the coupled message pair
   *           stays adjacent, so the forced flip of one
   *           pill lights up next to the finger that
   *           caused it, a rule seen rather than a glitch
   *           suspected.
   *  v129     THE SECOND CHANNEL RETURNS, clock mode only.
   *           clockSpeakMessages and clockShowMessages
   *           split every non-move output - the yes/no
   *           questions, "say again", command answers,
   *           game over - between the voice and a new
   *           message strip along the foot of the overlay.
   *           A move announcement is marked by the color
   *           word speak() has always taken; everything
   *           without one is a message and obeys the pair.
   *           THE PAIR CANNOT BOTH BE OFF: flipping the
   *           second one off flips the other back on, in
   *           the panel and in loadSettings for a stored
   *           off/off - a question with no channel would
   *           hang the game in silence, and enforcing the
   *           invariant in the toggles spares speak() from
   *           classifying sentences. On the strip a
   *           question stays until answered - pending,
   *           confirmAction or pieceAsk open, read every
   *           tick, so it clears itself whatever path
   *           resolved it - and anything else fades after
   *           CLOCK_MSG_EXPIRE_MS: the v81-v88 rule,
   *           relearned from the changelog it was written
   *           in. The strip is BUILT ALWAYS, unlike the
   *           move row: an empty div costs nothing, and
   *           the toggle then needs no overlay teardown.
   *           And spokenRecent moved below the new gate:
   *           text routed to the screen alone must not
   *           feed the echo test, or it could bin a real
   *           utterance that happened to match.
   *  v128     TWO MORE SETTINGS SURFACE. GUARD_PAWN_PUSHES
   *           and CONFIRM_ALL_MOVES join the panel under a
   *           new ALL MODES header, between headphones and
   *           voice mode, because unlike every row below
   *           them they act whichever screen is up. Read
   *           as CFG.guardPawnPushes and
   *           CFG.confirmAllMoves; first-run defaults
   *           unchanged (guard on, confirm off), persisted
   *           with the rest under "audioplay.settings".
   *           They earn the panel the same way headphones
   *           did: which to want depends on the day - how
   *           well the mic is hearing, blitz against a
   *           slow game - not on the file.
   *  v127     THREE SETTINGS THAT WERE NOT SETTINGS.
   *           CONFIRM_AMBIGUOUS, PREFER_FULLER_READING and
   *           MIC_CONTINUOUS are gone, and what each
   *           guarded is now unconditional. None had a
   *           second value worth shipping.
   *           CONFIRM_AMBIGUOUS = false played cands[0]
   *           when a phrase fitted several moves, and
   *           move-generation order is not likelihood
   *           order - a coin flip on the one act this file
   *           cannot take back. More than one fit now
   *           always asks.
   *           PREFER_FULLER_READING = false left Safari's
   *           own order standing, and Safari's first
   *           choice IS the clipped reading, since the
   *           word was lost before ranking ever saw it.
   *           Turning the demotion off restored exactly
   *           the failure it was written for (game1,
   *           19:40:18). The mechanism - clippedIndexes
   *           and the tiers - is untouched.
   *           MIC_CONTINUOUS did reach one state
   *           MIC_ALWAYS_ON cannot: continuous while still
   *           pausing the mic around speech. That state is
   *           the one the section 2 quirks list rules out
   *           on the device - pausing is what kills
   *           screen-off play and rings the dictation
   *           tones - so its only unique setting was a
   *           known-bad one. recognition.continuous now
   *           reads MIC_ALWAYS_ON directly.
   *           THE CYCLE LINE CHANGED MEANING, and old logs
   *           read opposite to new ones. The " continuous"
   *           suffix was gated on MIC_CONTINUOUS, so it
   *           stayed silent through every normal session
   *           while the recogniser was in fact continuous:
   *           a log understating what was running. It now
   *           prints " switching" when MIC_ALWAYS_ON is
   *           off, flagging the unusual mode rather than
   *           the normal one. The %10 throttle went with
   *           it. Cycles were once per utterance under
   *           switching and are rare under always-on, so
   *           the throttle had stopped saving noise and
   *           started hiding the climb the MIC_ALWAYS_ON
   *           comment tells you to watch: a session dying
   *           at cycle 4 logged the same "cycle 1" as a
   *           healthy one.
   *  v126     PANEL POLISH II. The panel now MEASURES the
   *           round button and anchors 8px above it on
   *           every open, ending the guessed offsets that
   *           two screenshots disproved in opposite
   *           directions. Headphones renders in the header
   *           face - uppercase, same font as VOICE MODE
   *           and CLOCK MODE - with its pill beside it,
   *           and the "(talk over voice)" clutter is gone;
   *           the meaning lives in the comment and the
   *           startup log line.
   *  v125     PANEL POLISH, from the first screenshot on
   *           the device: the pill text is centred, the
   *           panel sits above the round button instead of
   *           under its shoulder, and headphones moved to
   *           the top of the list, headerless - the most
   *           consequential switch should be the first
   *           thing seen, and MICROPHONE over a row
   *           reading headphones said it twice.
   *  v124     THE SETTINGS COME UP FOR AIR. Five
   *           behavioural switches were true/false
   *           constants buried hundreds of lines deep, and
   *           the mode tree they express - voice mode with
   *           or without read-back; clock mode with the
   *           move row, its own read-back and its own
   *           opponent speech; headphones against speaker -
   *           had outgrown editing source on an iPad. A
   *           "set" button now opens a panel of switches in
   *           the button aesthetic (lit pill = on), grouped
   *           voice / clock / microphone, persisted in
   *           localStorage under "audioplay.settings".
   *           The file's values are FIRST-RUN DEFAULTS
   *           only; every behavioural read goes through
   *           CFG.x, so the panel is live - including
   *           headphones, which logs its mode when
   *           flipped, and show-moves, which tears the
   *           once-built overlay down for rebuild on the
   *           next clock entry. Clock mode closes the
   *           panel on entry and its overlay covers the
   *           buttons regardless: the switches exist only
   *           with the clock down, as befits a
   *           distraction-free screen. New besides the
   *           panel itself: clock mode's read-back and
   *           opponent speech are now their OWN settings
   *           rather than inheriting voice mode's, because
   *           with the move row on screen the eye can do
   *           the confirming and the voice can be spared.
   *  v123     A HEADPHONES SWITCH. Everything v122 built -
   *           the gate that drops what the mic hears while
   *           we speak, its 400ms tail, the holding, the
   *           echo test - exists for one case: the iPad
   *           speaker, where the script can hear itself
   *           say "did you mean delta 3?" and play d3. In
   *           headphones the mic is deaf to us and all of
   *           it is dead weight that costs a real move
   *           every time the user answers before the
   *           announcement finishes. HEADPHONES = true
   *           bypasses the lot: talk over the
   *           announcements, moves land as they are said.
   *           SET IT FALSE ON SPEAKER DAYS - the v122
   *           behaviour is still there, unchanged, and the
   *           startup log says which mode is live.
   *  v122     OUR OWN VOICE NO LONGER EATS A MOVE. Game22
   *           was nearly clean - one repeat in 27 moves -
   *           and it was a cascade worth closing. A stray
   *           "A" drew "Say again.", the real
   *           move was spoken over that sentence, and the
   *           mic's speaking gate binned it. Both halves
   *           are fixed. (1) An utterance with no content
   *           word at all - a lone article, pure filler -
   *           is ignored in silence on our own turn, the
   *           judgement the stray-talk rule already makes
   *           on the opponent's clock. A garbled WORD
   *           still gets the sentence: something was said,
   *           and silence would leave the user waiting.
   *           (2) What the mic hears under our speech is
   *           HELD rather than binned. Our own words are
   *           known, so when the queue drains, a reading
   *           whose meaning is entirely contained in what
   *           we just said is an echo and dropped, and
   *           anything else is the user and is offered as
   *           a question. Always a question, never played:
   *           the echo test is a heuristic, and a user who
   *           repeats the move answers the question with
   *           it, so a repeat cannot double-play. The
   *           speaking gate itself is untouched - it is
   *           still true that we never transcribe our own
   *           voice, we just no longer throw away the
   *           user's along with it.
   *  v121     GAME 21: THE VICTIM NEEDS NO MOVER, AND SIX
   *           MORE SPELLINGS. Two root causes, five lost
   *           moves. (1) A piece name after "takes" is now
   *           the VICTIM whether or not the mover was
   *           named. v111 required the mover, so when the
   *           mover was misheard ("Note takes paw") or
   *           spoken as a bare file ("Delta takes night"),
   *           the one piece name landed in the mover slot
   *           and the move died - once as "the pawn has
   *           nothing to take", once as nothing at all.
   *           Uniqueness is still counted over every legal
   *           capture of that piece type, which is the
   *           safety v111 already relied on for a clipped
   *           mover, and a spoken from-file still picks
   *           the capturing pawn. (2) Spellings, all from
   *           this log: "note" is the knight (three times
   *           in four minutes); "astra", "ostra", "otra"
   *           are foxtrot with its f gone; "charlotte" and
   *           "shortly" are Charlie, still the worst file;
   *           "ruts" is the rook; "bitch" is the bishop
   *           and "ticks" is takes - those last two were
   *           ACTIVE harm, not silence, since they
   *           fuzzy-matched "aitch" and "sicks" and put a
   *           phantom h-file and rank 6 into otherwise
   *           good readings. All the risky ones are
   *           exact-only, v114 style. (3) "a" and "an" are
   *           filler: "A resign" was refused because the
   *           article counted as content, and every
   *           command classifier demands no content.
   *           (4) A NEAR-MISS MAY ADD, NEVER SUBTRACT. The
   *           "ticks" case was not silence but poison: a
   *           good reading of b3 was killed by a phantom
   *           rank 6 bent out of a word next to it. An
   *           audit of the tables against 61,961 English
   *           words found 971 one edit from some spelling,
   *           so the pair fixed here is a sample, not the
   *           set. Now, when a reading that used a
   *           near-miss finds no move, it is parsed again
   *           with near-misses off and that reading is
   *           used instead. Strictly additive: it can only
   *           turn no candidates into candidates, never
   *           rewrite one that already worked. The audit
   *           script lives with the tests.
   *  v120     THE PAWN GETS A NAME THE MIC CAN HEAR. The
   *           escape from the bare-square guard has always
   *           been "name the pawn", but Safari returned
   *           "pawn" as pollen, pond, pot, pontic,
   *           politics, paw and pan across game20 alone -
   *           the word itself is the problem, and growing
   *           the homophone list is a losing race. "push",
   *           "pushes", "pushed" now mean the pawn:
   *           phonetically unlike every file, rank and
   *           piece word, natural to say, and one syllable.
   *           "push delta four" names the piece, skips the
   *           guard, and plays at once; a lone "push"
   *           answers the guard's question. One vocabulary
   *           line; the guard, the grammar and the
   *           bare-square rule are untouched.
   *  v119     A UNIQUE FIT WITH A NAMED PIECE PLAYS AT
   *           ONCE, mate or not. v118 drew the line at
   *           mating moves, but v111 had already crossed
   *           it: "queen takes queen" plays unconfirmed on
   *           the same evidence - a NAMED mover and a
   *           destination inferred by uniqueness. Keeping
   *           the question on "queen alpha" while playing
   *           "queen takes queen" was the file disagreeing
   *           with itself. The half-square and capture
   *           repairs now play their unique fit
   *           immediately. The line that remains, and it
   *           is the game6 line: a request whose PIECE is
   *           inferred rather than heard - a bare square,
   *           a bare "takes" - still confirms, and several
   *           fits still ask. The residual risk is v111's,
   *           accepted there in writing: thinking out loud
   *           with a piece name in it. Watch the logs.
   *           CONFIRM_ALL_MOVES overrides, as everywhere.
   *  v118     A REPAIRED MATE PLAYS AT ONCE. The v116/117
   *           repairs offered even a UNIQUE fit as a
   *           yes/no, honoring the rule that an inferred
   *           component is never sent unconfirmed. But the
   *           # in the SAN is computed by the rules, not
   *           heard: if the one fitting move mates, then
   *           playing it wins the game WHATEVER was really
   *           said - a misheard piece, thinking out loud -
   *           so that confirmation protected against
   *           nothing, on the final move of the game where
   *           it cost the most patience. Unique mating
   *           fits from the half-square, capture and mate
   *           repairs now play immediately ("queen alpha
   *           eight checkmate", heard as "queen alpha
   *           check me", is ONE utterance and done). A
   *           unique NON-mate fit keeps its question: a
   *           misheard word there can hang a piece, which
   *           is the game6 class. Several fits, even all
   *           mates, still ask - choosing among moves the
   *           user distinguished and we could not is a
   *           guess, however harmless its outcome.
   *           CONFIRM_ALL_MOVES overrides, as everywhere.
   *  v117     HALF A MOVE IS KEPT, AND ONLY THE MISSING
   *           HALF IS ASKED FOR. v116 repaired a piece
   *           with half a square when exactly ONE move
   *           fit; with several it still demanded the
   *           whole move again, wasting the half that
   *           arrived. Now: "queen alpha" with two queen
   *           moves on the a-file asks "I heard queen
   *           alpha. say the rank." and "eight" completes
   *           it; "queen takes" with the target eaten
   *           asks "I heard queen takes. say the target."
   *           and takes a square, a lone file, or a
   *           victim piece name ("rook" -> queen takes
   *           rook, the v111 shorthand) as the answer.
   *           The open half lives in partialAsk beside
   *           pieceAsk, ply-guarded the same way, with
   *           the original utterance's check and mate
   *           words remembered so the answer inherits
   *           their narrowing. A unique completion is
   *           accepted the v92 way - both halves came
   *           from the user - several walk the ordinary
   *           yes/no, and an answer that fits nothing is
   *           told so and re-asked, never "I didn't hear
   *           you" (v96). Also: "queen checkmate" with
   *           everything else eaten offers the queen's
   *           mating moves as yes/no questions - the
   *           mate names its own candidate list - and a
   *           capture request whose piece has nothing to
   *           take says exactly that, since the piece
   *           name itself was probably the misheard
   *           word.
   *  v116     GAME 20'S REPEATS, EACH TRACED AND CLOSED.
   *           Five changes, all from one log:
   *           (1) A PENDING YES/NO TAKES A PIECE NAME.
   *           "foxtrot three" cost three questions at
   *           17:38 - pawn? no. queen? no. knight? yes -
   *           because the guard walked its list one yes/no
   *           at a time. Answering with the piece picks
   *           the matching candidate at once, the same
   *           shape of answer the strict prompt has taken
   *           since v92. Two questions of the same kind
   *           now take the same answers everywhere.
   *           (2) A PIECE WITH HALF A SQUARE IS REPAIRED.
   *           The mating move took five tries at 18:18:
   *           "queen alpha check me" arrived with the rank
   *           lost, no square, and died at "I didn't catch
   *           a move". A piece plus a lone file or rank now
   *           relaxes into that piece's legal moves to that
   *           file or rank; the spoken check word narrows
   *           them, "mate" narrows further to mating moves,
   *           and a UNIQUE fit is offered as a yes/no -
   *           never played unasked.
   *           (3) "-SHIP" WORDS ANSWER FOR THE BISHOP.
   *           17:49 asked "say queen, or bishop", heard
   *           "Relationship | Leadership", and answered
   *           "Say again."
   *           While a question is open, a long word ending
   *           in "ship" reads as bishop. Scoped to answers
   *           only, so ordinary talk cannot grow a piece.
   *           (4) "TO" AFTER A FILE IS THE RANK 2. "King
   *           h to" at 18:12 lost its rank because "to" is
   *           filler (for "knight to f3"). Directly after
   *           a FILE symbol nothing but the rank fits, so
   *           it reads as 2 there and only there.
   *           (5) VOCABULARY FROM THE LOG: "paw", "paws",
   *           "pan" join the pawn (three-letter words are
   *           under the fuzzy matcher's radar, so "Paw
   *           takes pawn" lost its mover and the unique
   *           dxc6 with it); "vision" joins the bishop as
   *           an exact-only spelling, v114 style ("Rock
   *           takes vision"); "politics", "pontic" and kin
   *           join COMPOUND as the fused "pawn takes"
   *           ("Politics night" was pawn takes knight);
   *           "checking" and "checkmates" join the check
   *           words, and "check me" - Safari's spelling of
   *           checkmate, three times in one game - is read
   *           as mate. Near-miss log lines are also logged
   *           once per utterance instead of once per parse,
   *           which had printed one line seven times.
   *  v115     "x", "\u00d7", and "times" LEAVE TAKE_WORDS.
   *  v114     THE C-FILE ANSWERS TO WHAT iOS CALLS IT.
   *           game19 lost five moves in eight minutes to
   *           "Charlie" coming back as chan, chang, ching,
   *           chong, chung and chinese; no other file ever
   *           failed. All eight spellings join the c line,
   *           and FUZZY_EXACT_ONLY keeps them out of the
   *           fuzzy dictionary, where they would otherwise
   *           have dragged 86 ordinary English words onto
   *           the c-file — "change", "coming", "coin",
   *           "thing" — each one edit from "ching" or
   *           "chan". Measured against 40,349 words: no
   *           reading changes but the eight themselves.
   *  v113     THE VOCABULARY IS WRITTEN BY VALUE, NOT BY
   *           WORD. Every spelling of the a-file, the rank
   *           4, the knight now sits on one line together,
   *           and expand() flips that into the flat word ->
   *           value map the parser reads. Written flat, a
   *           word could sit on the "c" line and be typed
   *           : "b" with nothing to show for it, and the
   *           same word could appear under two values with
   *           the last silently winning; both were routes
   *           to a quiet wrong move, and expand() now
   *           throws on the second at load. The command
   *           lists take a wordSet() of the same shape.
   *           Behaviour is unchanged: all 18 tables expand
   *           to what v112 built, word for word.
   *  v112     PRACTICE MODE HAS ONE DOOR AND A SWITCH.
   *           The #voicetest hash booted the whole UI on
   *           any Lichess page, which made PRACTICE_MODE
   *           unable to mean what it says, so it went.
   *           The button is now built by its own function
   *           and only when the flag is on; practiceBtn stays
   *           null otherwise, which paintButton and the row
   *           append both tolerate. The dryRun branches
   *           are untouched and simply never taken — see
   *           the note in section 1 for why the code stays
   *           rather than going the way of silent mode.
   *  v111     A CAPTURE MAY NAME THE VICTIM: "queen takes
   *           queen" plays Qxh3 when that is the only way
   *           to take a queen, with no confirmation — a
   *           yes/no would cost more than saying the
   *           square and the shorthand would go unused.
   *           One new slot in parseTranscript (a piece
   *           named after "takes", with the mover already
   *           named) and one branch in findMoves, which
   *           together can only fire where a request had
   *           no square and therefore died. Fixes a REAL
   *           bug on the way, not a latent one: one piece
   *           slot meant the last name won, so "queen
   *           takes the rook on d4" parsed as r x d4 and
   *           played Rxd4 unconfirmed. Squareless forms
   *           died harmlessly; that one did not.
   *  v110     THE LOG SAYS WHOSE MOVE A SPOKEN MOVE WAS.
   *           speak() takes an optional second argument
   *           written to the SAY line and never spoken;
   *           the move sites pass a color word, and MOV
   *           dropped "me  "/"opp " for the same colors —
   *           both five characters, so no column moved.
   *           A recapture makes the read-back and the
   *           announcement the same sentence, and game18
   *           17:12/17:24 were two indistinguishable
   *           "queen takes delta 4" lines. Reading the
   *           neighbouring MOV line does not work: the
   *           200 and the gameState event race, so SAY is
   *           not reliably adjacent to its own MOV.
   *           SPEECH IS UNCHANGED, deliberately — the two
   *           lines describe the same move and should
   *           sound alike; only the log needed to tell
   *           them apart.
   *  v109     SILENT MODE DELETED — the old section 16 and
   *           every reach-back into sections 1, 4, 6, 7,
   *           11 and 12. The games after v102 settled the open
   *           question exactly as posed there: the user
   *           never wanted to be looking at the iPad,
   *           which was the one thing the screen required.
   *           The numbered-list dialogue went with it
   *           (handleListAnswer, classifyListAnswer, the
   *           "none of these" vocabulary): a list exists
   *           to be SHOWN, and nothing shows one now.
   *           Every prompt in section 6 simply speaks
   *           again instead of forking between speaking
   *           and showing. NO TOMBSTONE WAS WRITTEN: what
   *           survives is this entry and the spoken
   *           "silent mode" note in CLOSED CASES. Clock
   *           mode moved 15 -> 14 so BOOT stays last, and
   *           the append-only rule went with the section
   *           it existed to protect.
   *  v108     THE OVERLAYS NO LONGER GO FULLSCREEN, which
   *           retires the fullscreen-exit corruption by
   *           removing the exit rather than repairing what
   *           it broke. The button row stops going wonky and
   *           Safari no longer needs force-quitting. Cost:
   *           the toolbar stays on screen, so the bare
   *           digit cap drops from 80vh to 62vh. Same fix
   *           the website build took at w3.
   *  v107     the opening throwaway word is gone. It was
   *           v100's answer to a clipped first syllable,
   *           which v102 then found to be Bluetooth-only;
   *           on the speaker it was a word spoken every
   *           session for nothing.
   *  v106     loadVoices goes quiet. The voice counts and
   *           the "no VOICE_NAME set" line printed every
   *           session and never varied, and a log read to
   *           find bugs is worth keeping clean. The names
   *           are still printed on the one occasion they
   *           are wanted: VOICE_NAME set and not matched.
   *  v105     back-ported from the website chapter (which
   *           now lives at pawn7676.github.io/audioplay).
   *           "tags"/"tag" join the takes words: game17,
   *           heard twice, played correctly only by luck.
   *           The mic can no longer stay dead behind a lit
   *           button: startListening()'s refusal during
   *           speech is logged, and the end of speech
   *           re-checks the mic (game17 found it dead for
   *           half a minute this way). The section 7 voice
   *           note is CORRECTED: a downloaded Premium or
   *           Enhanced voice DOES reach the page when set
   *           as the system voice with VOICE_NAME left
   *           empty - proven with Ava (Premium); the path
   *           is written above VOICE_NAME. And the game17
   *           latency measurement is recorded with its
   *           rule: the speech is not overhead.
   *  v104     a mating move is never read back: game15
   *           won the same race the other way and said
   *           checkmate twice. The SAN's # decides it,
   *           where api.over could not.
   *  v103     the capture question can be answered in one
   *           word too, by piece or by file. It was the
   *           only prompt left that could not take its own
   *           answer.
   *  v102     "voice play off." goes the way of "practice
   *           mode off." — a thing switched off should not
   *           answer back. The opening clipping turns out
   *           to be Bluetooth, and is now written down as
   *           such.
   *  v101     a real gutter between the two clocks: at the
   *           old width they read as one number.
   *  v100     your clock starts on the LEFT, practice mode
   *           stops announcing its own exit, and the first
   *           announcement leads with a throwaway word so
   *           the syllable iOS eats is never a real one.
   *  v98-v99  the spoken "clock mode" and "silent mode"
   *           deleted: the screens are buttons, the voice
   *           says only what it can say well.
   *  v97      the clocks stand SIDE BY SIDE, as a real
   *           clock does beside a board, and "flip clock"
   *           puts yours on the side the iPad is actually
   *           sitting. The digits are sized for the two
   *           they really show rather than a three-digit
   *           game that never happens, which is what pays
   *           for the halved width.
   *  v96      answering the piece question with a piece
   *           that cannot go there re-asks it, instead of
   *           claiming nothing was heard and dropping the
   *           question. Found by testing v92 rather than
   *           by losing a game to it.
   *  v95      two late-callback repairs, both found in
   *           game13. The move read-back is silent once
   *           the result has been announced, so checkmate
   *           is not said twice and in the wrong order.
   *           And the capture prompt names every way to
   *           take the square, not the pawn's alone: it
   *           had told the user to play a move they had
   *           not asked for, with no hint why.
   *  v94      the bare clock digits take the rest of the
   *           half. Entering clock mode by voice cannot go
   *           fullscreen, and that entry turned out to be
   *           unused for exactly that reason, so the space
   *           held back for the toolbar was held back for
   *           nobody.
   *  v93      clock mode loses the move rows and the digits
   *           take the space: it is the middle setting
   *           between silent mode, which makes you look at
   *           the iPad for everything, and voice mode,
   *           which hides the clock. The moves are spoken
   *           there, so the rows repeated the ear.
   *  v92      the piece question can be answered. "no pawn
   *           can go there. say queen, king or bishop."
   *           had nowhere to put the reply, so game11 said
   *           "Bishop" and was told nothing was heard. The
   *           square is now held for one ply.
   *  v91      the game-over line survives in silent mode.
   *           Games 9 and 10 both ended in mate and the
   *           screen showed the move instead: the move
   *           acknowledgement cleared the info area from a
   *           callback that lands after the game-over
   *           message is written. Clears that are merely
   *           tidying now yield to anything sticky.
   *  v89-v90  the separate handoff document folded into
   *           this file. It had become a second source of
   *           truth that needed syncing on every change;
   *           everything it said now lives in these blocks.
   *  v81-v88  the display, driven entirely by real games:
   *           turn by weight not brightness, one color,
   *           per-move text sizing, the move hidden whenever
   *           there is something to read, passing messages
   *           expiring while questions stay, and weight
   *           confined to the clocks.
   *  v80      silent mode: four quadrants, every output
   *           routed through speak() to the lower right,
   *           and ambiguity answered as a numbered list in
   *           one breath instead of a walked yes/no chain.
   *  v73-v79  clock mode, fullscreen, and three failed
   *           repairs of an iOS layout bug. v79 is skipped.
   *  v64-v72  the voice pipeline stabilising: the memo
   *           command, the bare-push and bare-capture
   *           guards, clipped-reading recovery, homophones
   *           grown from real logs. Game6 was RESIGNED over
   *           a wrongly played capture; v71 is that fix, and
   *           it is why nothing is sent unconfirmed.
   *================================================================*/

  /*========================= 1. SETTINGS ==========================*/

  var VERSION = "v137";

  // LEAVE TOKEN EMPTY. The token is asked for once and kept
  // by the Userscripts app, so a new version of the script
  // does not need it pasted in again. Tap "token" in the
  // log panel to replace or clear it.
  //
  // Anything put here is used instead, which is handy for
  // testing but means the token lives in the file.
  var TOKEN = "";
  var TOKEN_KEY = "audioplay_lichess_token";

  // Maximum number of lines in the log
  var LOG_MAX = 3000;

  /*--------------- PERSISTED SETTINGS (v124) ----------------
   * Everything below in SETTING_DEFAULTS is a TOGGLE ON THE
   * SCREEN: the "settings" button in section 12 opens a panel
   * of switches, changes persist in localStorage, and these
   * values are only the FIRST-RUN defaults. Flipping a value
   * here does nothing once the panel has saved - clear the
   * "audioplay.settings" localStorage key to return to
   * defaults. Every read in the code goes through CFG.x,
   * never these names, so the panel is always live.
   *
   * The mode tree these express:
   *   all modes: the two guards on the act this file
   *     cannot take back, sending a move. They act in
   *     voice mode and clock mode alike, hence the group.
   *   voice mode (clock off): the opponent's move is ALWAYS
   *     spoken - that is the product - and readBackMine
   *     decides whether your own move is spoken back too.
   *   clock mode: clockShowMoves puts the move row on the
   *     overlay; clockReadBackMine and clockSpeakOpponent
   *     choose what is SPOKEN there, independently of voice
   *     mode, because at the board with the clock up you
   *     may want the screen doing the telling.
   *     clockSpeakMessages and clockShowMessages route
   *     everything ELSE - questions, errors, command
   *     answers - to the voice, the message strip, or
   *     both; never neither, see v129.
   *--------------------------------------------------------*/
  var SETTING_DEFAULTS = {
    // HEADPHONES DELETED (v132). The system-wide echo
    // cancellation was found doing the job on every audio
    // route - see the platform finding and the v132 entry.
    // A stored value under this name is simply ignored.

    // On asks "Confirm:" before EVERY move, not only
    // ambiguous ones. Slower, but nothing is ever sent to
    // Lichess without being read back first. Named
    // confirmAllMoves until v131.
    confirmMyMove: false,

    // A bare square is interpreted as a pawn push, which is
    // correct unless Safari has dropped the piece name
    // from the reading: "rook echo four" arriving as plain
    // "echo four" would push the e-pawn. However, if a piece
    // could also legally reach the same square, then the pawn
    // push is confirmed first: "did you mean echo four? yes
    // or no". Answering "no" then walks through the piece
    // moves to that square. A pawn push to a square that no
    // piece could move to still plays instantly, so most
    // pawn moves cost nothing extra. Saying "pawn echo four"
    // skips the question, since the piece was named - and
    // since v120 "push echo four" does the same, because
    // Safari mishears "pawn" constantly and "push" almost
    // never. Naming a promotion ("golf one equals knight")
    // also skips it: only a pawn can promote, so the pawn
    // was named too. In game3 the guard still asked about
    // Bg1 after "g1 equals knight" had ruled every bishop
    // move out; fixed in v65.
    //
    // Since v71 the same guard covers bare pawn CAPTURES:
    // "takes f3" with neither a piece nor the from-file
    // named, when a piece could also capture f3, is confirmed
    // first ("queen takes f3" heard as "takes f3" cost
    // game6). "golf takes f3" names the file and plays at
    // once, exactly as "pawn e4" does for pushes.
    // Off plays every bare pawn move at once, unasked.
    guardPawnPushes: true,

    // Your own move read back in full once Lichess accepts
    // it ("knight foxtrot 3."). ON since v70 as the chosen
    // move confirmation, OFF by default since v113 for
    // silent success with the opponent's reply as implicit
    // confirmation; "repeat" always works either way.
    readBackMine: true,

    // The same choice inside clock mode. Separate because
    // the overlay's move row can do the confirming there.
    clockReadBackMine: true,

    // Speak the opponent's move while clock mode is up.
    // Voice mode always speaks it; here the move row can
    // carry it instead, so it is a choice.
    clockSpeakOpponent: true,

    // The move row on the clock overlay. The cost is digit
    // size: with the row present the clocks take
    // CLOCK_TIME_SIZE instead of the larger
    // bareDigitSizeCss(). Toggling it tears the overlay
    // down for rebuild on next entry - the overlay is
    // otherwise built once and reused.
    clockShowMoves: true,

    // Everything spoken that is NOT a move, while clock
    // mode is up: the yes/no questions, "say again",
    // command answers, game over. This pair CANNOT BOTH BE
    // OFF - the panel flips the other back on, and
    // loadSettings repairs a stored off/off - because a
    // question with no channel left would hang the game in
    // silence. speak() routes by these (v129).
    clockSpeakMessages: true,

    // The same messages painted on a strip along the foot
    // of the clock overlay. A question stays up until
    // answered; anything else fades after
    // CLOCK_MSG_EXPIRE_MS. The strip is built ALWAYS and
    // this only gates writing to it, so unlike
    // clockShowMoves the toggle needs no overlay rebuild.
    clockShowMessages: true
  };

  var SETTINGS_KEY = "audioplay.settings";

  function loadSettings() {
    var out = {};
    Object.keys(SETTING_DEFAULTS).forEach(function (k) {
      out[k] = SETTING_DEFAULTS[k];
    });
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        Object.keys(SETTING_DEFAULTS).forEach(function (k) {
          if (typeof saved[k] === "boolean") out[k] = saved[k];
        });
      }
    } catch (e) { /* defaults stand */ }
    // confirmAllMoves became confirmMyMove at v131; carry
    // a stored value across once. Deletable after the
    // panel has been saved once on the device.
    try {
      var prior = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      if (typeof prior.confirmAllMoves === "boolean" &&
          typeof prior.confirmMyMove !== "boolean") {
        out.confirmMyMove = prior.confirmAllMoves;
      }
    } catch (e) { /* the default stands */ }
    // messages must keep one channel (v129): a stored
    // off/off - an old save, a hand-edit - would let a
    // question hang silently. Voice is the channel that
    // works with the eyes closed, so it is the one
    // restored.
    if (!out.clockSpeakMessages && !out.clockShowMessages) {
      out.clockSpeakMessages = true;
    }
    return out;
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(CFG)); }
    catch (e) { /* private mode etc; the session still works */ }
  }

  var CFG = loadSettings();

  // GUARD_PAWN_PUSHES and CONFIRM_ALL_MOVES moved to
  // SETTING_DEFAULTS (v128): panel toggles now, read as
  // CFG.guardPawnPushes and CFG.confirmMyMove (named
  // confirmAllMoves until v131) everywhere.

  // LEAVE VOICE_NAME = "" TO USE SYSTEM DEFAULT.
  // To pick system default voice on iOS or iPadOS device:
  // Settings > General > Accessibility > Read & Speak >
  //   Voices > English > Voice
  // Ava (Premium) is my preferred voice on current iPadOS.
  // Other English voices that can be explicitly chosen here:
  // Samantha, Daniel, Karen, Moira, Rishi, Tessa
  var VOICE_NAME = "";
  var SPEAK_RATE = 1.0;
  var SPEAK_PITCH = 1.0;

  // Silence inserted between spoken chunks. Raise these if it
  // still runs together, lower them if it feels slow.
  var GAP_SENTENCE_MS = 450;   // after . ; :
  var GAP_CLAUSE_MS = 220;     // after ,

  // Logs the real duration of every spoken chunk to the log
  // panel. Set false once the pacing sounds right.
  var SPEAK_DEBUG = false;

  // The practice button. False builds the UI without it, and
  // the mode becomes unreachable — the #voicetest hash that
  // was its second door is gone (v112), so the button is the
  // only one. dryRun then stays false for the whole session
  // and every branch that tests it is simply never taken.
  // The code stays: it is how the grammar gets exercised
  // without spending a real game, which is what it was
  // written for.
  var PRACTICE_MODE = true;

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
  // Leaving the mic running avoids both. The mic hears
  // nothing of our own announcements either way: iPadOS
  // echo cancellation removes them (the v132 finding), so
  // the open mic transcribes only the room.
  //
  // One cost: a long session has no restart to recover
  // from if Safari stops delivering results. Watch "MIC
  // listening (cycle N)": if it stops climbing and moves
  // stop registering, tap the button off and on. Set false
  // to go back to switching the mic.
  //
  // That line SAYS NOTHING EXTRA while this is on, and adds
  // " switching" when it is off, so the suffix marks the
  // unusual mode. It marked the opposite before v127, where
  // " continuous" was gated on the deleted MIC_CONTINUOUS
  // and so never printed in a normal session: logs from
  // v126 and earlier read the other way round.
  var MIC_ALWAYS_ON = true;

  // MIC_IGNORE_TAIL_MS and the whole speaking gate deleted
  // at v132 with the headphones setting: AEC keeps our own
  // voice out of the mic, so there is nothing to gate.

  // ---- overlay: clock mode ----
  // ONE color for all overlay text (v82); the only color
  // change left is the under-a-minute red.
  var TEXT_COLOR = "#a8a29a"; // grey
  var LOW_TIME_COLOR = "#b0503e"; // red

  // CLOCK NUMBER FONT WEIGHT IS THE SIGNAL FOR WHOSE TURN
  var ACTIVE_WEIGHT = "750";   // clock: side to move
  var IDLE_WEIGHT = "200";     // clock: waiting side
  var MOVE_WEIGHT = "300";     // the move row, always
  var OVERLAY_TICK_MS = 100;   // overlay redraw period

  // ---- clock mode, message strip (v129) ----
  // Sized to be read at arm's length across the board, not
  // across the room: a sentence, unlike the clocks, is a
  // glance target. Wraps as it must; the strip sits below
  // the centred halves, so a two-line question overlaps
  // nothing.
  var CLOCK_MSG_SIZE = "min(4.2vw,4.5vh)";
  // How long a message that is NOT a question stays on the
  // strip. Questions ignore this and stay until answered.
  var CLOCK_MSG_EXPIRE_MS = 5000;

  // ---- clock mode, move row ON/OFF selection ----
  // CLOCK_SHOW_MOVES moved to SETTING_DEFAULTS (v124), read
  // as CFG.clockShowMoves. The overlay is BUILT ONCE and
  // reused, so the panel toggle tears it down for rebuild
  // on the next clock entry. CLOCK_MOVE_* and MOVE_CHAR_EM
  // below exist only for the row being ON, the three
  // CLOCK_BARE/DIGIT ones only for OFF.

  // ---- clock digits, move row ON ----
  // Sized for the WORST case: three digits past 100
  // minutes, seven characters of SAN ("bxa8=Q+"). Both rows
  // are nowrap, so nothing can wrap or break mid-token.
  // Raise it until the longest real move stops fitting.
  var CLOCK_TIME_SIZE = "min(28vw,32vh)";

  // ---- clock digits, move row OFF ----
  // Sized for the digits ACTUALLY ON SCREEN: whole
  // minutes above a minute, seconds below, so two digits
  // covers every game to 99 minutes and every low-time
  // reading. A third appears only past 100 minutes, and
  // then the size drops ONCE, permanently — it never grows
  // back, so the digits cannot resize mid-game.
  //   width = n * CLOCK_DIGIT_EM * font-size, against
  //   CLOCK_BARE_BUDGET_VW; at n = 2, 40/(2*.62) = 32.3vw
  //
  // THE UNUSED WIDTH IS THE GUTTER, and that is the
  // budget's real job. The two clocks sit side by
  // side in 50vw each, so the centre gap is 50 minus this
  // number and the outer margin is half of it: at 40, 10vw
  // between and 5vw either side. At 46 the digits nearly
  // touched and "10 10" read as 1010. A divider line was
  // refused — space is what separates things, and it costs
  // nothing to light. CONFIRMED on screen at 40; separation
  // is proportional, so it holds at any viewing distance.
  //
  // The vh cap is the WHOLE height. THERE IS NO FULLSCREEN,
  // so Safari's toolbar is up while vh — the layout
  // viewport — excludes it, and the old 80 would clip top
  // and bottom. 62 is a starting figure, not a measured
  // one: lower it if the digits clip, raise it if there is
  // dead space above and below. Width usually binds first.
  var CLOCK_DIGIT_EM = 0.62;      // tabular, no letter-spacing
  var CLOCK_BARE_BUDGET_VW = 40;  // of the 50vw half
  var CLOCK_BARE_MAX_VH = 62;

  // Which side YOUR clock STARTS on, every game. A real
  // clock stands beside the board with the near face its
  // owner's, so the right value is whichever side the iPad
  // is sitting on — and that changes between games, which
  // is why "flip clock" flips it live instead of this being
  // a constant you must reload to change.
  var PLAYER_ON_LEFT_OF_CLOCK = true;

  // ---- the move row text ----
  // SIZED PER MOVE. Almost every SAN is 2-4 characters, so
  // sizing all of them for "Qh4xe1#" made the common case
  // needlessly small. Each move gets the max — equal to the
  // clock digits beside it — and shrinks only as far as its
  // own length demands: "h4" is as big as "10".
  //   size = BUDGET / (chars * MOVE_CHAR_EM), capped by
  //   MAX_VW and MAX_VH
  // MOVE_CHAR_EM is the average glyph advance in system-ui
  // plus the .04em letter-spacing these rows carry; raise
  // it if a long move ever touches the edge.
  //
  // The move stacks UNDER the clock in a half only 50vh
  // tall, so its ceiling is vertical, not a matter of
  // taste: time (32vh) + move + margin must fit. The vw
  // budget halved at v97 with the side-by-side layout — the
  // move sits in its own clock's 50vw column, not across
  // the screen.
  var MOVE_CHAR_EM = 0.62;
  var CLOCK_MOVE_MAX_VW = 28;
  var CLOCK_MOVE_MAX_VH = 14;
  var CLOCK_MOVE_BUDGET_VW = 46; // of the 50vw half

  /*========================= 2. DEBUG LOG =========================*/

  var LOG = [];
  var logBody = null;

  function log(tag, msg) {
    var t = new Date().toTimeString().slice(0, 8);
    var line = t + "  " + tag + "  " + msg;
    LOG.push(line);
    if (LOG.length > LOG_MAX) LOG.shift();
    if (logBody) {
      logBody.textContent = LOG.join("\n");
      logBody.scrollTop = logBody.scrollHeight;
    }
    try { console.log("[voice] " + line); } catch (e) {}
  }

  window.addEventListener("error", function (e) {
    log("ERR", (e.message || "?") + " @" + (e.lineno || "?"));
  });

  /*======================== 3. VOCABULARY =========================*/

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
   * expand() must stay INSIDE section 3: the parser test slices
   * this file from the 3. VOCABULARY header to 6. DIALOGUE, and
   * anything above the header is not in the slice. */
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
    p: "pawn pawns prawn pond palm porn ponte ponta pote potes " +
       "pons poon paun poan ponn pot pawnd born pon pollen " +
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

  var TAKE_WORDS = wordSet("takes take taking tates tanks tags tag " +
    "ticks tick captures capture capturing");
  var CASTLE_WORDS = wordSet("castle castles castling cassel cattle " +
    "castel hassle");
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

  function memoTranscript(transcripts) {
    for (var i = 0; i < transcripts.length; i++) {
      var toks = wordsOf(transcripts[i]);
      if (toks.length > 1 && MEMO_WORDS[toks[0]]) return transcripts[i];
    }
    return null;
  }

  // "flip clock" (or "swap clocks", "switch the clock")
  // swaps which side of the screen your clock is on. As
  // strict as its neighbors: a flip word AND a clock word,
  // and any other content word disqualifies. It cannot
  // collide with bare "clock", which needs no other content
  // word at all.
  function classifyFlipClock(raw) {
    var toks = wordsOf(raw);
    var flip = 0, clk = 0, other = 0;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (FLIP_WORDS[t]) flip++;
      else if (CLOCK_WORDS[t]) clk++;
      else if (!FILLER[t]) other++;
    }
    return !!(flip && clk && !other);
  }

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
  // in fuzzyToken, in section 4.
  var FUZZY_NEVER = wordSet(
    "lord load word ward cord form good goods gone going cold " +
    "hold told sold bold fold food wood hood mood door does " +
    "done some same come time like make made more most that " +
    "this than them they then what when were well will with " +
    "here hear near year your yeah have give live love over " +
    "only just must back been best nice mine name note wait " +
    "want damn hell crap oops");

  /*========================== 4. PARSING ==========================*/

  /* Safari mangles words the homophone lists cannot all anticipate
   * ("foxtrott", "delter", "charlies"). As a LAST resort, accept a
   * token that is one edit away from exactly one vocabulary word.
   * Ambiguous near-misses are rejected rather than guessed. */
  function editDistance(a, b, cap) {
    if (Math.abs(a.length - b.length) > (cap || 1)) return 99;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
                          prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[b.length];
  }

  var FUZZY_SETS = [[NATO, "file"], [NUMS, "rank"], [PIECES, "piece"]];

  function fuzzyToken(tk) {
    if (tk.length < 4) return null;
    if (FUZZY_NEVER[tk]) return null;
    /* "mate" sits one edit from "hate", a homophone of the
     * rank 8. Left alone, "queen alpha one mate" grew a
     * phantom from-rank and matched nothing. Check words
     * describe a move, they are never part of one. */
    if (CHECK_WORDS[tk]) return null;
    /* short words are dense with collisions, long ones are not */
    var tol = tk.length >= 6 ? 2 : 1;
    var hits = [];
    FUZZY_SETS.forEach(function (pair) {
      var dict = pair[0], kind = pair[1];
      Object.keys(dict).forEach(function (w) {
        if (w.length < 4) return;
        if (FUZZY_EXACT_ONLY[w]) return;
        if (editDistance(tk, w, tol) <= tol) hits.push({ t: kind, v: dict[w], w: w });
      });
    });
    if (!hits.length) return null;
    var distinct = {};
    hits.forEach(function (h) { distinct[h.t + h.v] = h; });
    var keys = Object.keys(distinct);
    // ambiguous, refuse to guess
    if (keys.length !== 1) return null;
    return distinct[keys[0]];
  }

  // Apostrophes are deleted, not turned into spaces, so
  // "who's" becomes "whos" and matches the question words.
  function wordsOf(raw) {
    return String(raw).toLowerCase().replace(/['\u2019]/g, "")
      .replace(/[.,!?;:]/g, " ")
      .split(/\s+/).filter(Boolean);
  }

  function classifyCommand(raw) {
    var toks = wordsOf(raw);
    var yes = 0, no = 0, cancel = 0, repeat = 0, clock = 0,
        resign = 0, draw = 0, other = 0;
    toks.forEach(function (t) {
      if (YES_WORDS[t]) yes++;
      else if (NO_WORDS[t]) no++;
      else if (CANCEL_WORDS[t]) cancel++;
      else if (REPEAT_WORDS[t]) repeat++;
      else if (CLOCK_WORDS[t]) clock++;
      else if (RESIGN_WORDS[t]) resign++;
      else if (DRAW_WORDS[t]) draw++;
      else if (t === "offer" || t === "offers") { /* neutral */ }
      else if (!FILLER[t]) other++;
    });
    if (cancel && !other) return "cancel";
    if (resign && !other) return "resign";
    if (draw && !other) return "draw";
    if (yes && !no && !other) return "yes";
    if (no && !yes && !other) return "no";
    if (clock && !other) return "clock";
    if (repeat && !other) return "repeat";
    return null;
  }

  // See the near-miss logging note inside parseTranscript.
  // Declared here so the parser test slice (sections 3-5)
  // contains it; handleTranscripts resets it per utterance.
  var nearMissLogged = {};

  function parseTranscript(raw, noFuzzy) {
    var toks = wordsOf(raw);
    var req = { castle: null, piece: null, capture: false, squares: [],
                fromFile: null, fromRank: null, trailingPiece: null,
                promoKw: false, victim: null };
    var syms = [], i, tk;
    for (i = 0; i < toks.length; i++) {
      tk = toks[i];
      if (CASTLE_WORDS[tk]) { req.castle = "?"; continue; }
      if (tk === "kingside" || tk === "short") { req.castle = "k"; continue; }
      if (tk === "queenside" || tk === "long") { req.castle = "q"; continue; }
      if (tk === "side") continue;
      if (tk === "promote" || tk === "promotes" || tk === "promotion" ||
          tk === "equals" || tk === "equal") { syms.push({ t: "promo-kw" }); continue; }
      // "to" is filler ("knight to f3") EXCEPT in two spots.
      // After a promotion keyword it is part of "promote to
      // queen" and is simply consumed, as before. Directly
      // after a FILE it is the rank 2 (v116): Safari writes
      // "two" as "to", and "King h to" (game20, 18:12) lost
      // its rank to the filler list. Nothing but a rank can
      // legally follow a lone file, so the reading is safe;
      // "knight to f3" and "e2 to e4" are untouched because
      // there "to" follows a piece and a rank.
      if (tk === "to") {
        if (syms.length && syms[syms.length - 1].t === "promo-kw") continue;
        if (syms.length && syms[syms.length - 1].t === "file") {
          syms.push({ t: "rank", v: "2" });
        }
        continue;
      }
      if (COMPOUND[tk]) {
        COMPOUND[tk].forEach(function (pair) {
          syms.push({ t: pair[0], v: pair[1] });
        });
        continue;
      }
      if (TAKE_WORDS[tk]) { syms.push({ t: "take" }); continue; }
      /* Bare "a" is usually the article, since the a-file is
       * normally spoken as "alpha". It counts as the FILE only
       * when a rank or a capture word follows it:
       *   "a four"             -> a4
       *   "a takes bravo five" -> axb5
       *   "a hotel four"       -> h4, the "a" was just an article
       *   "a knight to f3"     -> Nf3, likewise
       * Without the capture case, "a takes bravo five" lost its
       * from-file and became ambiguous whenever two pawns could
       * capture the same square.
       */
      if (tk === "a") {
        var nx = toks[i + 1];
        if (nx && (NUMS[nx] || /^[1-8]$/.test(nx) || TAKE_WORDS[nx])) {
          syms.push({ t: "file", v: "a" });
        }
        continue;
      }
      if (NATO[tk]) { syms.push({ t: "file", v: NATO[tk] }); continue; }
      if (NUMS[tk]) { syms.push({ t: "rank", v: NUMS[tk] }); continue; }
      if (PIECES[tk]) { syms.push({ t: "piece", v: PIECES[tk] }); continue; }
      var m2 = /^([a-h][1-8])([a-h][1-8])$/.exec(tk);
      if (m2) {
        syms.push({ t: "file", v: m2[1][0] }, { t: "rank", v: m2[1][1] },
                  { t: "file", v: m2[2][0] }, { t: "rank", v: m2[2][1] });
        continue;
      }
      var m = /^([a-h])([1-8])$/.exec(tk);
      if (m) { syms.push({ t: "file", v: m[1] }, { t: "rank", v: m[2] }); continue; }
      if (/^[a-h]$/.test(tk)) { syms.push({ t: "file", v: tk }); continue; }
      if (/^[1-8]$/.test(tk)) { syms.push({ t: "rank", v: tk }); continue; }
      if (FILLER[tk]) continue;
      if (noFuzzy) continue;
      var fz = fuzzyToken(tk);
      if (fz) {
        req.usedFuzzy = true;
        // Logged ONCE per utterance (v116). Each transcript
        // is parsed several times on its way through - the
        // move-like scan, candidate collection, the PRS
        // line - and game20 printed one near-miss seven
        // times (17:57). handleTranscripts clears the seen
        // set at the top of every utterance; parses outside
        // that loop (the parser test, classifyQuery) just
        // log each distinct near-miss once, which is still
        // the truth.
        var nmsg = "near-miss \"" + tk + "\" read as \"" + fz.w + "\"";
        if (!nearMissLogged[nmsg]) {
          nearMissLogged[nmsg] = 1;
          log("PRS", nmsg);
        }
        syms.push({ t: fz.t, v: fz.v });
      }
    }

    if (req.castle === "?") {
      for (i = 0; i < syms.length; i++) {
        if (syms[i].t === "piece" && syms[i].v === "k") req.castle = "k";
        if (syms[i].t === "piece" && syms[i].v === "q") req.castle = "q";
      }
    }
    if (req.castle) return req;

    var afterPromoKw = false;
    for (i = 0; i < syms.length; i++) {
      var s = syms[i];
      if (s.t === "promo-kw") {
        afterPromoKw = true; req.promoKw = true; continue;
      }
      if (s.t === "take") { req.capture = true; continue; }
      if (s.t === "piece") {
        // A SECOND PIECE NAME, AFTER "TAKES" AND BEFORE ANY
        // SQUARE, IS THE VICTIM (v111): "queen takes queen".
        // Through v110 there was ONE piece slot and the last
        // name won, so "queen takes rook" parsed as a rook
        // move. Harmless only while no square was spoken,
        // since findMoves drops a squareless request on its
        // first line. WITH a square it was live and silent:
        // "queen takes rook delta four" — and "the" and "on"
        // are filler, so "queen takes the rook on d4" is the
        // same tokens — parsed as r x d4 and PLAYED Rxd4,
        // unconfirmed, because naming a piece sets the named
        // flag and skips the bare-square guard. Right square,
        // wrong piece, no question asked: the game6 shape.
        // Never seen in nineteen games because it needs two
        // piece names in one utterance, which nobody says
        // until this grammar invites it. The mover must
        // already be named for the victim reading to fire;
        // see the victim branch in findMoves for why.
        // A PIECE NAME AFTER "TAKES" IS THE VICTIM, mover
        // named or not (v121; v111 required the mover).
        // Game21 lost two moves to the old rule: "Note
        // takes paw" (19:02) and "Delta takes night"
        // (19:03) both had the mover misheard or spoken as
        // a bare file, so the ONE piece name landed in the
        // mover slot - "the pawn has nothing to take", and
        // a knight that was meant as the prey.
        //
        // Safe for the reason v111 wrote down itself:
        // uniqueness in the victim branch is counted over
        // EVERY legal capture of that piece type, so a
        // mover that never arrived cannot move the wrong
        // piece - it can only turn one candidate into
        // several, which asks. A spoken from-file still
        // narrows the mover ("delta takes knight" is the
        // d-pawn), which is how game21's dxc3 resolves.
        //
        // THE COST, again knowingly: "takes the rook" now
        // needs no piece name at all to be a move, so the
        // ordinary-English exposure v111 accepted is a
        // little wider. Uniqueness still gates it, and a
        // room with one player in it is the environment
        // this is tuned for. If it ever fires unasked, the
        // log line is the victim branch in findMoves.
        if (afterPromoKw || req.squares.length) req.trailingPiece = s.v;
        else if (req.capture && !req.victim) req.victim = s.v;
        else req.piece = s.v;
        continue;
      }
      if (s.t === "file") {
        if (i + 1 < syms.length && syms[i + 1].t === "rank") {
          req.squares.push(s.v + syms[i + 1].v);
          i++;
        } else req.fromFile = s.v;
        continue;
      }
      if (s.t === "rank") req.fromRank = s.v;
    }
    return req;
  }

  function reqIsEmpty(req) {
    return !req.castle && !req.squares.length && !req.victim;
  }

  function saysCheck(raw) {
    var toks = wordsOf(raw);
    for (var i = 0; i < toks.length; i++) {
      if (CHECK_WORDS[toks[i]]) return true;
    }
    return false;
  }

  // Was MATE spoken, as opposed to mere check (v116). The
  // pair "check me" counts: it is how Safari spelled
  // checkmate three times in game20's mating sequence.
  function saysMate(raw) {
    var toks = wordsOf(raw);
    for (var i = 0; i < toks.length; i++) {
      if (MATE_WORDS[toks[i]]) return true;
      if ((toks[i] === "check" || toks[i] === "checks") &&
          toks[i + 1] === "me") return true;
    }
    return false;
  }

  // A LONE PIECE NAME, offered as the answer to an open
  // question (v116). Used by the pending yes/no chain and
  // by the strict prompt's suffix repair; both only look
  // here AFTER a question has been asked, so ordinary talk
  // never reaches this.
  //
  // A reading qualifies when every word is a piece name,
  // filler, or a yes-word ("yes, knight"), and all the
  // piece names agree. Words of six letters or more ending
  // in "ship" read as bishop: game20 answered "Bishop" to
  // "say queen, or bishop" and Safari returned
  // "Relationship | Leadership" (17:49), which parsed as
  // nothing. The suffix rule lives ONLY here, in answer
  // position, so a stray "relationship" in conversation
  // still cannot grow a piece.
  function answerPieceOf(transcripts) {
    for (var i = 0; i < transcripts.length; i++) {
      var toks = wordsOf(transcripts[i]);
      if (!toks.length) continue;
      var found = null, ok = true;
      for (var j = 0; j < toks.length; j++) {
        var t = toks[j], p = null;
        if (PIECES[t]) p = PIECES[t];
        else if (t.length >= 6 && /ship$/.test(t)) p = "b";
        else if (FILLER[t] || YES_WORDS[t]) continue;
        else { ok = false; break; }
        if (found && found !== p) { ok = false; break; }
        found = p;
      }
      if (ok && found) return found;
    }
    return null;
  }

  /* ---- Spoken questions about the position ---- 
   * Reads out what is already on the screen. No evaluation of
   * any kind: these answer "what is where", never "what should
   * I play". */

  var THEIR_WORDS = { their: 1, theirs: 1, they: 1, them: 1, his: 1, her: 1,
    hers: 1, opponent: 1, opponents: 1 };
  var MY_WORDS = { my: 1, mine: 1, me: 1, i: 1, our: 1, ours: 1 };

  var COLOR_WORDS = { white: "w", whites: "w", black: "b", blacks: "b" };

  function classifyQuery(raw) {
    var toks = wordsOf(raw);
    var i, t;
    var has = function (w) { return toks.indexOf(w) >= 0; };

    // "turn" on its own used to be enough, so any sentence
    // containing the word was answered: "maybe at some
    // point it'll turn off" got "black to move, move 6".
    // Now it must either be asked as a question or be
    // short enough to be one.
    if (has("turn") || has("turns")) {
      var asked = has("whose") || has("whos") || has("who") ||
                  has("which") || has("what") || has("its") ||
                  has("is");
      // their/your joined the strip list in v65: "their
      // turn" and "your turn" carried one content word each
      // and fell through to "I didn't catch a move" (game3,
      // 15:34:52). Possessives around "turn" are part of
      // the question, never part of a move.
      var content = toks.filter(function (w) {
        return !FILLER[w] && w !== "turn" && w !== "turns" &&
               w !== "whose" && w !== "whos" && w !== "who" &&
               w !== "which" && w !== "what" && w !== "its" &&
               w !== "their" && w !== "theirs" &&
               w !== "your" && w !== "yours";
      });
      if (asked ? content.length <= 1 : content.length === 0) {
        return { kind: "turn" };
      }
      return null;
    }

    /* whose pieces: an explicit color beats "my"/"their", which
     * beats mine */
    var color = null;
    for (i = 0; i < toks.length; i++) {
      if (COLOR_WORDS[toks[i]]) { color = COLOR_WORDS[toks[i]]; break; }
    }
    if (!color) {
      for (i = 0; i < toks.length; i++) {
        if (THEIR_WORDS[toks[i]]) {
          color = api.myColor === "w" ? "b" : "w"; break;
        }
        if (MY_WORDS[toks[i]]) { color = api.myColor || "w"; break; }
      }
    }
    if (!color) color = api.myColor || "w";

    if (has("where")) {
      for (i = 0; i < toks.length; i++) {
        t = PIECES[toks[i]];
        if (t) return { kind: "where", piece: t, color: color };
      }
      return null;
    }

    if (has("what") || has("whats") || has("which") || has("occupies")) {
      var req = parseTranscript(raw);
      if (req.squares.length) return { kind: "square", sq: req.squares[0] };
    }
    return null;
  }

  var PIECE_NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook",
                     q: "queen", k: "king" };
  var PIECE_PLURAL = { p: "pawns", n: "knights", b: "bishops", r: "rooks",
                       q: "queens", k: "king" };

  function pieceColorAt(ch) { return ch === ch.toUpperCase() ? "w" : "b"; }

  function scanBoard(type, color) {
    var out = [];
    for (var r = 7; r >= 0; r--) {
      for (var f = 0; f < 8; f++) {
        var ch = api.pos.board[r * 16 + f];
        if (!ch) continue;
        if (type && ch.toLowerCase() !== type) continue;
        if (color && pieceColorAt(ch) !== color) continue;
        out.push({ sq: RULES.sqName(r * 16 + f), ch: ch });
      }
    }
    return out;
  }

  function joinSpoken(list) {
    if (!list.length) return "none";
    if (list.length === 1) return list[0];
    return list.slice(0, -1).join(", ") + ", and " + list[list.length - 1];
  }

  function colorWord(c) { return c === "w" ? "white" : "black"; }

  function answerQuery(q) {
    if (!api.pos) { speak("No game loaded."); return; }
    if (api.over) { speak("The game is over."); return; }

    if (q.kind === "turn") {
      var n = Math.floor(api.moves.length / 2) + 1;
      speak(colorWord(api.pos.turn) + " to move, move " + n + ".");
      return;
    }

    if (q.kind === "square") {
      var ch = api.pos.board[RULES.nameSq(q.sq)];
      if (!ch) { speak(spokenSquare(q.sq) + " is empty."); return; }
      speak(spokenSquare(q.sq) + " has a " + colorWord(pieceColorAt(ch)) +
            " " + PIECE_NAME[ch.toLowerCase()] + ".");
      return;
    }

    if (q.kind === "where") {
      var found = scanBoard(q.piece, q.color);
      var side = colorWord(q.color);
      if (!found.length) {
        speak("No " + side + " " + PIECE_PLURAL[q.piece] + " left.");
        return;
      }
      speak(side + " " + (found.length === 1 ? PIECE_NAME[q.piece]
                                             : PIECE_PLURAL[q.piece]) + " on " +
            joinSpoken(found.map(function (x) { return spokenSquare(x.sq); })) + ".");
      return;
    }
  }

  function describeReq(req) {
    if (req.castle) return "castle:" + req.castle;
    return [req.piece || "-", req.capture ? "x" : "-",
            req.squares.join(">") ||
              (req.victim ? "<" + req.victim + ">" : "-"),
            (req.fromFile || "") + (req.fromRank || "") || "-",
            req.trailingPiece || "-"].join(" ");
  }

  /*=================== 5. MATCHING AND RANKING ====================*/

  function findMoves(pos, req, ignoreStrict) {
    var legal = pos.legalMoves();
    var out;
    if (req.castle) {
      return legal.filter(function (m) {
        if (m.flags.indexOf("k") >= 0) return req.castle !== "q";
        if (m.flags.indexOf("q") >= 0) return req.castle !== "k";
        return false;
      });
    }
    // NAMING THE VICTIM INSTEAD OF THE SQUARE (v111):
    // "queen takes queen", when there is only one way to do
    // it, PLAYS AT ONCE. A yes/no on the unique case would
    // cost more breath than saying the square, which is the
    // whole point of the shorthand.
    //
    // Safe because it can only fire where nothing could be
    // played before: a request with no square never reached
    // past the line below, so no utterance that means
    // something today changes meaning. It only converts
    // "Say again" into a move.
    //
    // The filter is on m.captured, not on what stands on the
    // destination, so en passant is included for free — the
    // generator sets captured "p" on a move to an empty
    // square.
    //
    // Ambiguity needs no special handling: two takeable
    // queens, or two knights able to take the same rook,
    // simply return two moves and reach the ordinary
    // question. Uniqueness is counted over EVERY legal
    // capture of that piece, so a mover lost off the front
    // of the utterance cannot move the wrong piece — it can
    // only turn one candidate into several, which asks.
    //
    // THE COST, ACCEPTED KNOWINGLY: this is the first form
    // in the grammar that is also ordinary English. Thinking
    // out loud on your own turn — "if queen takes queen,
    // then..." — is now a move. The mover must be named to
    // fire, which excludes "that takes the queen" and most
    // conversational shapes, but not this one. Watch for it
    // in the logs; if it ever fires unasked, requiring a
    // check word or dropping the form entirely are both
    // cheaper than a wrong move.
    if (!req.squares.length && req.victim) {
      return legal.filter(function (m) {
        if (m.captured !== req.victim) return false;
        if (req.piece && m.piece !== req.piece) return false;
        if (req.fromFile && RULES.sqName(m.from)[0] !== req.fromFile) return false;
        if (req.fromRank && RULES.sqName(m.from)[1] !== req.fromRank) return false;
        return true;
      });
    }
    if (!req.squares.length) return [];
    var to = req.squares[req.squares.length - 1];
    var from = req.squares.length > 1 ? req.squares[0] : null;
    out = legal.filter(function (m) {
      if (RULES.sqName(m.to) !== to) return false;
      if (from && RULES.sqName(m.from) !== from) return false;
      if (!from && req.fromFile && RULES.sqName(m.from)[0] !== req.fromFile) return false;
      if (!from && req.fromRank && RULES.sqName(m.from)[1] !== req.fromRank) return false;
      if (req.piece && m.piece !== req.piece) return false;
      if (req.capture && !m.captured) return false;
      return true;
    });
    // A PAWN MOVE WITHOUT "TAKES" IS A PUSH. "charlie five"
    // and "pawn charlie five" mean exactly the same thing: a
    // pawn stepping forward onto c5, never a diagonal
    // capture onto it. To capture, say so: "bravo takes
    // charlie five", naming the file when two pawns could.
    //
    // A bare square additionally rules out every piece, so
    // "charlie five" can never be Nc5 either.
    //
    // An explicit from-square ("bravo one charlie three") is
    // a separate, fully spelled out form and stays exempt.
    // ignoreStrict only works out what to suggest after a
    // rejection.
    if (!ignoreStrict && !from) {
      if (!req.piece) {
        out = out.filter(function (m) { return m.piece === "p"; });
      }
      if (!req.capture) {
        out = out.filter(function (m) {
          return m.piece !== "p" || !m.captured;
        });
      }
    }
    if (out.length && out.every(function (m) { return m.promotion; })) {
      var want = (req.trailingPiece && req.trailingPiece !== "p")
               ? req.trailingPiece : "q";
      var chosen = out.filter(function (m) { return m.promotion === want; });
      if (chosen.length) out = chosen;
    }
    return out;
  }

  /* ================= HOW CANDIDATES ARE RANKED =================
   *
   * Safari returns up to 8 rival transcriptions of one utterance.
   * Each is parsed, and each may yield legal moves, so several
   * moves can compete. They are put in order, and the first is
   * either played (if it is the only one) or offered as
   * "did you mean ...?". Nothing is ever sent to
   * Lichess without being either unambiguous or confirmed.
   *
   * Ordering happens in two stages.
   *
   * STAGE 1 - TIER. Two groups, and every tier 0 beats every
   * tier 1, whatever the scores inside them.
   *
   *   tier 0  a complete reading
   *   tier 1  a reading that is another one with its leading
   *           piece name missing, e.g. "foxtrot three" next to
   *           "night foxtrot three". iOS drops opening words, so
   *           this is the same utterance damaged, not a rival.
   *           Kept, but below everything complete, so a wrong
   *           guess can still be reached by answering "no".
   *
   * A tier is used rather than a large penalty because the score
   * range grows with the number of alternatives: any fixed
   * penalty can be beaten by a complete reading far enough down
   * Safari's list.
   *
   * STAGE 2 - SCORE, within a tier. Lower is offered first.
   *
   *   + 100 per step down Safari's confidence list. Its own
   *         first choice starts at 0, its second at 100, and so
   *         on. This dominates, so Safari's opinion is followed
   *         unless something below overrides it.
   *   -   5 the move is a pawn move AND no piece was named.
   *         "foxtrot three" is f3 in notation, not Nf3, so the
   *         pawn is offered first. Small, so it only breaks ties
   *         inside one alternative, never across two.
   *   -   2 the move is a capture. Captures are the moves people
   *         notice, so among equals they come first.
   *
   * The gaps matter more than the values: 100 separates
   * alternatives, and 5 and 2 only reorder moves that came from
   * the SAME alternative and would otherwise be tied.
   *
   * AFTER SORTING, one filter can override all of it. If the
   * word "check" or "mate" was spoken and some candidates give
   * check, the rest cannot be what was meant and are dropped.
   * This is a filter, not a score, because it is a statement of
   * fact about the move rather than a preference.
   * ============================================================== */

  var SCORE_PER_ALTERNATIVE = 100;
  var SCORE_BONUS_PAWN = -5;
  var SCORE_BONUS_CAPTURE = -2;

  function collectCandidates(pos, transcripts) {
    var seen = {}, ranked = [];
    var legal = pos.legalMoves();
    var clipped = clippedIndexes(transcripts);
    transcripts.forEach(function (raw, altIdx) {
      var req = parseTranscript(raw);
      // FUZZY MATCHING MAY ADD, NEVER SUBTRACT (v121). A
      // near-miss can invent a component and POISON a
      // reading that was otherwise complete: game21's
      // "Charlotte ticks bravo three" had a good b3, and
      // "ticks" bent into "sicks" - the rank 6 - which
      // pinned the mover to a rank it was not on and left
      // no legal move at all. The named spellings fix that
      // pair; this fixes the CLASS. An audit against 61,961
      // English words found 971 of them one edit from some
      // spelling in the tables, so there are more of these
      // waiting.
      //
      // So: if a reading that used a near-miss yields no
      // move, parse it again with near-misses off and use
      // that instead. Strictly additive - it can only turn
      // no candidates into candidates, never rewrite a
      // reading that already worked - and it costs one
      // extra parse of one transcript, only on failure.
      var found = findMoves(pos, req);
      if (!found.length && req.usedFuzzy) {
        var plain = parseTranscript(raw, true);
        if (!reqIsEmpty(plain)) {
          var pf = findMoves(pos, plain);
          if (pf.length) {
            log("PRS", "near-miss poisoned the reading, " +
                "retrying without it");
            req = plain;
            found = pf;
          }
        }
      }
      if (reqIsEmpty(req)) return;
      var namedPiece = !!req.piece;
      found.forEach(function (m) {
        // An explicit promotion ("g1 equals knight", or any
        // promote/equals keyword) can only describe a pawn
        // move, so it names the pawn as surely as saying
        // "pawn", and the bare-push guard is skipped. In
        // game3 (15:27:08) the guard still asked about Bg1
        // after "equals knight" had ruled every bishop move
        // out. A bare square that happens to promote
        // ("g1" alone) sets neither flag and is still
        // guarded, as before.
        //
        // A spoken from-file on a pawn capture ("golf takes
        // foxtrot three") is the grammar's full capture
        // form, and a full from-square ("bravo one charlie
        // three") is fully spelled: both name the pawn the
        // same way (v71), so they skip the guard.
        var named = namedPiece ||
            !!(m.promotion && (req.trailingPiece || req.promoKw)) ||
            !!(m.piece === "p" && m.captured && req.fromFile) ||
            req.squares.length > 1;
        var uci = pos.uciOf(m);
        if (seen[uci]) {
          // a later reading that names the piece still counts
          // as naming it, for the bare-push guard below
          if (named) seen[uci].named = true;
          return;
        }
        var score = altIdx * SCORE_PER_ALTERNATIVE;
        if (!namedPiece && m.piece === "p") score += SCORE_BONUS_PAWN;
        if (m.captured) score += SCORE_BONUS_CAPTURE;
        var entry = { m: m, san: pos.sanOf(m, legal), score: score,
                      tier: clipped[altIdx] ? 1 : 0,
                      named: named };
        seen[uci] = entry;
        ranked.push(entry);
      });
    });
    var wantCheck = transcripts.some(saysCheck);
    if (wantCheck) {
      var checking = ranked.filter(function (r) {
        var last = r.san.slice(-1);
        return last === "+" || last === "#";
      });
      if (checking.length && checking.length < ranked.length) {
        log("CND", "\"check\" narrowed " + ranked.length + " to " +
            checking.length);
        ranked = checking;
      }
    }
    // "mate" narrows harder than "check" (v116): among
    // checking moves only the mating ones can be meant.
    // Same shape as above - a statement of fact, so a
    // filter, not a score.
    if (transcripts.some(saysMate)) {
      var mating = ranked.filter(function (r) {
        return r.san.slice(-1) === "#";
      });
      if (mating.length && mating.length < ranked.length) {
        log("CND", "\"mate\" narrowed " + ranked.length + " to " +
            mating.length);
        ranked = mating;
      }
    }
    // stage 1 tier, then stage 2 score: see the block above
    ranked.sort(function (a, b) {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.score - b.score;
    });
    if (ranked.length > 1) {
      log("CND", "order: " + ranked.map(function (r) {
        return r.san + "(t" + r.tier + "/" + r.score + ")";
      }).join(" "));
    }
    return ranked;
  }

  // Safari returns the same reading several times over,
  // differing only in spelling: capitals ("Night Delta five"
  // vs "Night delta five"), or digits against words ("bravo
  // 8" vs "bravo eight"). Comparing the raw strings only
  // catches the first kind.
  //
  // So reduce each reading to what it MEANS first. Every
  // word becomes the file, rank, piece or capture it stands
  // for, and filler is dropped. Two readings that would
  // produce the same move collapse into one, however they
  // happen to be spelled.
  function semanticKey(text) {
    var toks = wordsOf(text), out = [], m;
    for (var i = 0; i < toks.length; i++) {
      var tk = toks[i];
      // fused words split the same way the parser splits
      // them, including the valueless ["take"] pair (v116)
      if (COMPOUND[tk]) {
        COMPOUND[tk].forEach(function (pair) {
          out.push(pair[0] === "take" ? "x" :
                   (pair[0] === "piece" ? "p" : "f") + pair[1]);
        });
        continue;
      }
      // mirror of the parser's file-then-"to" rule (v116),
      // so "hotel to" and "hotel two" collapse to one key
      if (tk === "to") {
        if (out.length && out[out.length - 1].charAt(0) === "f" &&
            out[out.length - 1].length === 2) {
          out.push("r2");
        }
        continue;
      }
      if (NATO[tk]) { out.push("f" + NATO[tk]); continue; }
      if (NUMS[tk]) { out.push("r" + NUMS[tk]); continue; }
      if (PIECES[tk]) { out.push("p" + PIECES[tk]); continue; }
      if (TAKE_WORDS[tk]) { out.push("x"); continue; }
      if (CASTLE_WORDS[tk]) { out.push("castle"); continue; }
      m = /^([a-h])([1-8])$/.exec(tk);
      if (m) { out.push("f" + m[1], "r" + m[2]); continue; }
      if (/^[a-h]$/.test(tk)) { out.push("f" + tk); continue; }
      if (/^[1-8]$/.test(tk)) { out.push("r" + tk); continue; }
      if (FILLER[tk]) continue;
      // Near-misses reduce to what the parser will read them
      // as, so "Brooke bravo four" and "rook bravo four"
      // collapse to one key. Before this the clipped-reading
      // check compared raw words, missed that pair, and the
      // bare "bravo four" was never demoted: the pawn was
      // offered first when the rook move was meant (game1,
      // 19:40:18). Same rules as parsing, so the key still
      // matches what the move would be.
      var fz = fuzzyToken(tk);
      if (fz) {
        out.push((fz.t === "file" ? "f" :
                  fz.t === "rank" ? "r" : "p") + fz.v);
        continue;
      }
      out.push(tk);
    }
    return out.join(" ");
  }

  // Which readings are another reading with the leading
  // piece name missing. These are not rival guesses, they
  // are the same utterance with a word lost, so their moves
  // are ranked below the fuller reading's. Nothing is
  // discarded: if the guess is wrong the other move is
  // still offered, and either way a question is asked
  // before anything is sent.
  function clippedIndexes(list) {
    var keys = list.map(semanticKey), out = {};
    keys.forEach(function (shortKey, i) {
      keys.forEach(function (longKey, j) {
        if (i === j || out[i]) return;
        var parts = longKey.split(" ");
        if (parts.length < 2) return;
        if (parts[0].charAt(0) !== "p") return;
        if (parts.slice(1).join(" ") !== shortKey) return;
        out[i] = true;
        // name the damaged reading first, so the log says
        // plainly which one is being pushed down
        log("HRD", "demoting \"" + list[i] + "\": it is \"" +
            list[j] + "\" minus its first word");
      });
    });
    return out;
  }

  function dedupeTranscripts(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (t) {
      if (!String(t).trim()) return;
      var key = semanticKey(t);
      if (seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  // THE ONE SILENT PATH is a lone candidate played with no
  // question. If that candidate is a pawn move from a bare
  // utterance and a piece could also legally have been
  // meant, the piece name may have been lost by the mic,
  // and playing the pawn would be silent and irreversible.
  // Two forms of the same hazard:
  //   push:    "rook echo four" heard as "echo four"
  //   capture: "queen takes f3" heard as "takes f3"
  //            (game6, 21:20:47: gxf3 played, Qxf3 meant,
  //            game resigned — captures were exempt until
  //            v71)
  // Returns the list to confirm, pawn first then the piece
  // moves so answering no reaches them, or null when playing
  // at once is safe. Naming the piece, the pawn, the
  // capture's from-file, or a promotion all skip it (the
  // named flag in collectCandidates). See guardPawnPushes
  // in SETTING_DEFAULTS.
  function bareGuardCands(c) {
    if (!CFG.guardPawnPushes) return null;
    if (c.named || c.m.piece !== "p") return null;
    var to = RULES.sqName(c.m.to);
    var legal = api.pos.legalMoves();
    var isCap = !!c.m.captured;
    var shadows = legal.filter(function (m) {
      if (m.piece === "p" || RULES.sqName(m.to) !== to) return false;
      // a capture utterance can only have meant a capture
      return isCap ? !!m.captured : true;
    });
    if (!shadows.length) return null;
    log("CND", "guard: " + shadows.map(function (m) {
      return api.pos.sanOf(m, legal);
    }).join(",") + " could also reach " + to + ", asking first");
    return [c].concat(shadows.map(function (m) {
      return { m: m, san: api.pos.sanOf(m, legal) };
    }));
  }

  /*========================= 6. DIALOGUE ==========================*/

  // practice mode: nothing is ever sent to Lichess
  var dryRun = false;

  var pending = null;        // { cands: [{m,san}], idx }
  var confirmAction = null;  // key into CONFIRMS

  // THE PIECE QUESTION IS ANSWERABLE (v92). When a bare
  // square can only be reached by a piece, section 6 says
  // so and names the pieces — "no pawn can go there. say
  // queen, king or bishop." Through v91 that question had
  // nowhere to land: the branch spoke and returned, so the
  // square was gone, and the one-word answer arrived as a
  // request with no square at all. reqIsEmpty counts that
  // as nothing heard, so game11 answered "Bishop" exactly
  // as asked and got "Say again."
  // CONFIRMED in practice: "echo two" after 1.e4 raises the
  // question, and "Night" plays Ne2 with no yes/no. That
  // position is the standing test — e2 is unreachable by
  // any pawn and reachable by three pieces.
  // A prompt must be able to receive its own answer.
  // The square is kept here with the ply it was asked at,
  // so it expires by itself the moment the position moves
  // on and no clearing is needed anywhere else.
  var pieceAsk = null;       // { moves, ply, capture, sq }

  // HALF A MOVE IS KEPT AS A QUESTION (v117). When the mic
  // delivers a recognisable half - "queen alpha" with the
  // rank eaten, "queen takes" with the target eaten - and
  // MORE than one move fits, re-saying the whole move
  // wastes the half that arrived. The half is stored here
  // with the ply it was heard at, exactly as pieceAsk keeps
  // its square, and the prompt asks for ONLY the missing
  // part: "say the rank", "say the target". The answer
  // completes the move; both halves came from the user, so
  // a unique fit is accepted the v92 way. Ply-guarded, so
  // it expires by itself when the position moves on.
  var partialAsk = null;     // { req, want, chk, mate, ply }

  var CONFIRMS = {
    resign:        { yes: "resign", yesSay: "resigning.",
                     no: null, noSay: "cancelled." },
    offerdraw:     { yes: "draw/yes", yesSay: "draw offered.",
                     no: null, noSay: "cancelled." },
    drawoffer:     { yes: "draw/yes", yesSay: "draw accepted.",
                     no: "draw/no", noSay: "draw declined." },
    takebackoffer: { yes: "takeback/yes", yesSay: "takeback accepted.",
                     no: "takeback/no", noSay: "takeback declined." }
  };
  var busy = false;

  /* ---- Practice Mode ---- 
   * Runs the whole pipeline locally: mic, NATO parsing, ambiguity
   * dialogue, speech, log. No token is used and nothing is
   * sent to Lichess. The "opponent" picks moves at random from
   * the list of legal moves. */

  function dryStart() {
    try { if (streamAbort) streamAbort.abort(); } catch (e) {}
    clearTimeout(reconnectTimer);
    clearInterval(pollTimer);
    api.gameId = "PRACTICE";
    api.myColor = "w";
    api.pos = new RULES.Position();
    api.moves = [];
    api.over = false;
    api.lastSan = ""; api.lastSanW = ""; api.lastSanB = "";
    api.wtime = 600000;
    api.btime = 600000;
    api.mode = "practice";
    log("DRY", "practice mode ON - nothing will be sent to Lichess");
    speakWhenAudioSettled("Practice mode. You are white.");
  }

  function dryOpponentReply() {
    if (!dryRun || api.over) return;
    var legal = api.pos.legalMoves();
    if (!legal.length) {
      api.over = true;
      speak("Practice game over.");
      return;
    }
    var m = legal[Math.floor(Math.random() * legal.length)];
    var san = api.pos.sanOf(m);
    var uci = api.pos.uciOf(m);
    api.pos.apply(m);
    api.moves.push(uci);
    api.lastSan = san; api.lastSanB = san;
    log("DRY", "opponent plays random legal move " + uci + " = " + san);
    if (speakOpponentNow())
      speak(sanToSpeech(san) + ".", colorWord(api.myColor === "b" ? "w" : "b"));
    if (!api.pos.legalMoves().length) {
      api.over = true;
      speak("Practice game over.");
    }
  }

  // WHICH VOICE SETTINGS APPLY DEPENDS ON WHICH RENDERER IS
  // UP (v124). The panel keeps separate switches for voice
  // mode and clock mode; these read the right one at the
  // moment of speaking, so flipping a toggle or entering
  // clock mode changes behaviour immediately.
  function readBackMineNow() {
    return clockModeOn() ? CFG.clockReadBackMine : CFG.readBackMine;
  }
  function speakOpponentNow() {
    return clockModeOn() ? CFG.clockSpeakOpponent : true;
  }

  // THE READ-BACK BELONGS TO WHICHEVER EVENT ARRIVES FIRST
  // (v134). Two things confirm a move we posted - the
  // stream carrying our own uci back, and the 200 - and
  // they arrive in either order within the same second (see
  // the note in acceptMove). Hanging the read-back on the
  // 200 alone meant that when the stream won AND the
  // opponent replied instantly, their move was announced
  // first: game24 14:18:58 said "black charlie 5" before
  // "white echo 4", an answer before the question.
  //
  // armedUci is set by acceptMove to the move we sent, and
  // the first caller to match it takes it. The loser finds
  // it null and says nothing, so nothing is doubled and
  // nothing depends on who won.
  //
  // ONLY A MOVE WE POSTED IS ARMED. A move made by hand on
  // the Lichess board arrives through the same syncMoves
  // path with no arm behind it and stays unspoken, as it
  // always has been.
  var armedUci = null;

  // announce=false is a catch-up replay (reconnect,
  // takeback rebuild): it still DISARMS - that move is
  // history now and must not be read back when some later
  // event happens to match - but speaks nothing.
  function readBackMine(san, uci, announce) {
    if (!armedUci || armedUci !== uci) return;
    armedUci = null;
    if (!announce) return;
    // v104's rule, moved here whole: a SAN ending in # ends
    // the game whoever gets there first, and the result
    // line says it better than a read-back can. api.over
    // alone was not enough then and is not now.
    if (api.over || /#$/.test(san)) return;
    if (readBackMineNow()) speak(sanToSpeech(san), colorWord(api.myColor));
  }

  function acceptMove(c) {
    if (busy) { log("DLG", "ignored, busy"); return; }
    busy = true;
    pending = null;
    var uci = api.pos.uciOf(c.m);

    if (dryRun) {
      api.pos.apply(c.m);
      api.moves.push(uci);
      api.lastSan = c.san; api.lastSanW = c.san;
      busy = false;
      log("DRY", "you play " + uci + " = " + c.san + " (not sent)");
      if (readBackMineNow())
        speak(sanToSpeech(c.san), colorWord(api.myColor || "w"));
      setTimeout(dryOpponentReply, 1600);
      return;
    }

    armedUci = uci;                       /* v134: see readBackMine */
    postMove(uci).then(function (r) {
      busy = false;
      var ok = r.status === 200 && r.body && r.body.ok !== false && !r.body.error;
      log("PST", uci + " -> " + r.status + " " + JSON.stringify(r.body).slice(0, 120));
      if (ok) {
        // THIS RESOLVES LATE. The gameState event for
        // the same move usually arrives before this promise
        // does — on the mating move, always — so the clear
        // below can land after something more important has
        // already been written. It must never stomp it.
        // The same lateness is why api.over silences the
        // read-back: on the mating move game13 heard
        // "checkmate. white wins." and THEN "queen takes
        // golf 7, checkmate", learning the result before
        // the move that caused it and hearing checkmate
        // twice. Once the game is over the read-back has
        // nothing left to confirm — the result confirms it.
        // CONFIRMED: a one-move mate played on purpose, the
        // 200 landing after the game-over line exactly as
        // before, and nothing spoken after "checkmate.
        // white wins."
        //
        // api.over ALONE WAS NOT ENOUGH (v104). It is only
        // true here when the stream won the race; game15
        // had the 200 come back FIRST, so the flag was
        // still false and the read-back went out ahead of
        // the result — "rook delta 8, checkmate. checkmate.
        // white wins." Both orderings happen within the
        // same second and neither can be predicted. The SAN
        // itself is the signal that does not race: a move
        // ending in # ENDS THE GAME, whoever gets there
        // first, so it is never read back at all. Both
        // rules now live in readBackMine, which this branch
        // and the stream both call; whichever got here
        // first speaks, the other finds it disarmed.
        readBackMine(c.san, uci, true);
      } else {
        armedUci = null;     /* rejected: nothing to read back */
        var msg = (r.body && r.body.error) ? String(r.body.error) : ("error " + r.status);
        speak("Lichess rejected that move. " + msg);
      }
    }).catch(function (e) {
      busy = false;
      armedUci = null;
      log("ERR", "post: " + e.message);
      speak("Could not reach Lichess.");
    });
  }

  function askCandidate() {
    if (!pending || pending.idx >= pending.cands.length) {
      // "no" to a one-entry list deserves the truth: there
      // was nothing else it could have been. Game7 rejected
      // a correct Qxf7 repair expecting to hear
      // alternatives, and "no more options" read as a
      // malfunction rather than the answer.
      var lone = pending && pending.cands.length === 1;
      pending = null;
      speak(lone
        ? "That was the only legal move fitting what I " +
          "heard. Say the whole move again."
        : "No more options. Say the whole move again.");
      return;
    }
    var c = pending.cands[pending.idx];
    // When the list mixes piece types - the bare-square
    // guard's pawn-plus-shadows shape - the question says
    // the shortcut exists, ONCE, on the first ask. Game20
    // walked pawn-no, queen-no, knight-yes at 17:38; one
    // "knight" now does it (v116, see the piece-answer
    // branch in handleTranscripts).
    var kinds = {};
    pending.cands.forEach(function (x) { kinds[x.m.piece] = 1; });
    if (pending.idx === 0 && Object.keys(kinds).length > 1) {
      speak("Did you mean " + sanToSpeech(c.san) +
            "? Yes, no, or name the piece.");
    } else {
      speak("Did you mean " + sanToSpeech(c.san) + "?");
    }
  }

  // "black 5 15. white 6 35." — own clock first, minutes
  // then seconds, no unit words (v65, was "black has 5
  // minutes 15 seconds"). Seconds under ten are spoken with
  // "oh" so 5:06 is "5 oh 6", not "5 6" which sounds like
  // 56. Under a minute the minutes are dropped and the unit
  // returns: "black 53 seconds." An exact minute count does
  // the same the other way: "black 10 minutes", since v66 —
  // 10:00 came out as the nonsense "10 oh 0". Seconds are
  // FLOORED since v67: rounding spoke one second ahead of
  // the screen (game4 note, 19:02:38), because Lichess
  // truncates — 34:07.6 shows as 34:07 and must be spoken
  // as "34 oh 7", not "34 oh 8".
  function speakClocks() {
    function fmt(ms) {
      if (ms == null) return null;
      var s = Math.max(0, Math.floor(ms / 1000));
      var m = Math.floor(s / 60);
      s = s % 60;
      if (!m) return s + " seconds";
      if (!s) return m + (m === 1 ? " minute" : " minutes");
      return m + " " + (s < 10 ? "oh " + s : s);
    }
    var mine = fmt(myRemainingMs());
    var theirs = fmt(api.myColor === "w" ? api.btime : api.wtime);
    if (mine || theirs) {
      speak(colorWord(api.myColor) + " " + (mine || "unknown") + ". " +
            colorWord(api.myColor === "w" ? "b" : "w") + " " +
            (theirs || "unknown") + ".");
    } else speak("No clock information.");
  }

  // The moves matching a one-word answer to an outstanding
  // piece question, or null if this is not one (v92). A
  // named PAWN is never an answer: the question is only
  // ever asked because no pawn can reach the square.
  // Is a piece question outstanding, and is this utterance
  // shaped like an answer to it — a piece and nothing else?
  function pieceAskOpen(req) {
    if (!pieceAsk || !api.pos) return false;
    if (pieceAsk.ply !== api.moves.length) return false;
    if (req.squares.length || req.castle) return false;
    // a capture question can also be answered with a FILE,
    // because that is how it offers its pawn options
    // ("echo takes delta 5" -> "echo"). A bare file lands in
    // fromFile, as game13's "Rock Charli" showed.
    if (pieceAsk.capture && req.fromFile && !req.fromRank) return true;
    return !!req.piece;
  }

  // What the user just named, in the words the question
  // used: a piece name, or a file for a pawn capture.
  function pieceAskNamed(req) {
    if (req.piece) return PIECE_NAME[req.piece];
    if (req.fromFile) {
      return (SPOKEN_FILE[req.fromFile] || req.fromFile) + " pawn";
    }
    return "that";
  }

  // ...and can that piece actually go there. Null covers
  // both "not an answer" and "wrong piece"; the caller
  // separates them with pieceAskOpen. A named PAWN is
  // never a fit: the question exists because no pawn can.
  function pieceAskAnswer(req) {
    if (!pieceAskOpen(req)) return null;
    var ms;
    if (req.piece && req.piece !== "p") {
      ms = pieceAsk.moves.filter(function (m) {
        return m.piece === req.piece;
      });
    } else if (pieceAsk.capture && req.fromFile) {
      // a file answers for the pawn that stands on it
      ms = pieceAsk.moves.filter(function (m) {
        return m.piece === "p" &&
               RULES.sqName(m.from)[0] === req.fromFile;
      });
    } else return null;
    return ms.length ? ms : null;
  }

  // THE QUESTION AND ITS RE-ASK IN ONE PLACE (v96), so the
  // two wordings cannot drift apart and both leave the same
  // state behind. Answering with a piece that cannot reach
  // the square used to fall through to "I didn't catch a
  // move", which is a lie — "Rook" was caught exactly, it
  // simply does not fit — and it dropped the question on
  // the floor, so the user was left re-saying a whole move
  // to a script that had just asked them a question.
  // CONFIRMED in practice from the e2 position: "Rook"
  // twice in a row re-asked twice and left the question
  // standing, then "King" played Ke2. Worth knowing when
  // reading these logs — Safari hears "Rock", so HRD shows
  // that while PRS shows the r it parsed to. The rook was
  // always recognised; it simply cannot reach e2, which is
  // exactly why that square is the test.
  function askPiece(moves, lead, sq) {
    var seen = {}, list = [];
    moves.forEach(function (m) {
      var w;
      if (sq && m.piece === "p") {
        var f = RULES.sqName(m.from)[0];
        w = SPOKEN_FILE[f] || f;
      } else w = PIECE_NAME[m.piece];
      if (seen[w]) return;
      seen[w] = 1;
      list.push(sq ? w + " takes " + spokenSquare(sq) : w);
    });
    pieceAsk = { moves: moves, ply: api.moves.length,
                 capture: !!sq, sq: sq || null };
    // ", or " not " or ": splitForSpeech gives a comma
    // GAP_CLAUSE_MS, and the boundary between the options
    // is where a pause helps most
    speak(lead + " say " +
      (list.length === 1 ? list[0]
                         : list.slice(0, -1).join(", ") + ", or " +
                           list[list.length - 1]) + ".");
  }

  function repeatLast() {
    speak(api.lastSan ? "Last move: " + sanToSpeech(api.lastSan)
                      : "No move to repeat yet.");
  }

  // THE v122 HOLD-AND-RECOVER MACHINERY STOOD HERE -
  // heldAlts, spokenRecent, isEchoOf, flushHeard - and was
  // deleted at v132 with the gate it served: the mic never
  // receives our own voice (AEC, see the platform finding),
  // so nothing needs holding, testing, or recovering.

  // The targeted question for a half-heard move (v117).
  // Speaks back what WAS heard, then asks for only the
  // missing part, and leaves the state open to receive it.
  // chk and mate remember whether the original utterance
  // said check or mate, so the answer inherits the
  // narrowing ("queen alpha checkmate" answered with "8"
  // still prefers the mating move).
  function askPartial(req, want, chk, mate) {
    partialAsk = { req: req, want: want, chk: !!chk, mate: !!mate,
                   ply: api.moves.length };
    if (want === "target") {
      speak("I heard " + PIECE_NAME[req.piece] +
            " takes. Say the target.");
    } else if (want === "rank") {
      speak("I heard " + PIECE_NAME[req.piece] + " " +
            (SPOKEN_FILE[req.fromFile] || req.fromFile) +
            ". Say the rank.");
    } else {
      speak("I heard " + PIECE_NAME[req.piece] + " to rank " +
            req.fromRank + ". Say the file.");
    }
  }

  // The moves completed by an answer to the open partial
  // question, or null if this is not an answer (v117).
  // An answer may be: a full square ("alpha one"), the
  // missing rank or file alone, a victim piece name for a
  // capture ("rook" -> queen takes rook), or a lone file
  // naming a capture's destination file. Anything with no
  // usable content is not an answer and returns null, so
  // stray noise leaves the question standing rather than
  // resolving it. Returns a possibly EMPTY list when the
  // user did answer but nothing fits, so the caller can
  // tell the truth (v96) instead of "I didn't hear you".
  function partialAnswer(req2, transcripts) {
    if (!partialAsk || partialAsk.ply !== api.moves.length) return null;
    var st = partialAsk.req;
    var f = st.fromFile || req2.fromFile;
    var r = st.fromRank || req2.fromRank;
    var toSq = null, destF = null, destR = null, victim = null;
    if (req2.squares.length) {
      toSq = req2.squares[req2.squares.length - 1];
    } else if (f && r) {
      toSq = f + r;
    } else if (req2.victim) {
      victim = req2.victim;
    } else if (partialAsk.want === "target" && req2.piece) {
      // a bare piece name answers a capture question as
      // the VICTIM, the v111 shorthand: "say the target"
      // answered "rook" is queen takes rook
      victim = req2.piece;
    } else if (partialAsk.want === "target" && f) {
      // a lone file names the destination file of the
      // capture: "say the target" answered "alpha" keeps
      // only captures landing on the a-file
      destF = f;
    } else {
      return null;
    }
    var chk = partialAsk.chk || transcripts.some(saysCheck);
    var mate = partialAsk.mate || transcripts.some(saysMate);
    var legal = api.pos.legalMoves();
    var fits = legal.filter(function (m) {
      if (st.piece && m.piece !== st.piece) return false;
      if ((st.capture || req2.capture) && !m.captured) return false;
      if (victim && m.captured !== victim) return false;
      if (toSq && RULES.sqName(m.to) !== toSq) return false;
      if (destF && RULES.sqName(m.to)[0] !== destF) return false;
      if (destR && RULES.sqName(m.to)[1] !== destR) return false;
      return true;
    });
    if (chk) {
      var c2 = fits.filter(function (m) {
        return /[+#]$/.test(api.pos.sanOf(m));
      });
      if (c2.length) fits = c2;
    }
    if (mate) {
      var m2 = fits.filter(function (m) {
        return api.pos.sanOf(m).slice(-1) === "#";
      });
      if (m2.length) fits = m2;
    }
    return fits;
  }

  function handleTranscripts(rawList) {
    nearMissLogged = {};  // one near-miss line per utterance (v116)
    var transcripts = dedupeTranscripts(rawList);
    var primary = transcripts[0] || "";
    var dropped = (rawList ? rawList.length : 0) - transcripts.length;
    log("HRD", transcripts.map(function (t, i) {
      return i + ":" + t;
    }).join(" | ") + (dropped ? "   (" + dropped + " dup)" : ""));

    // A verbal memo for the log. Checked before ANYTHING
    // else, because a memo that mentions a move must never
    // be parsed as one: in game3 a note containing the word
    // "castles" was answered "that's not a legal move", and
    // one naming a currently legal move would have been
    // PLAYED. Any reading may carry the memo word, see
    // memoTranscript in section 4. A pending yes/no
    // question survives a memo untouched.
    var memoText = memoTranscript(transcripts);
    if (memoText) {
      log("MEMO", memoText);
      speak("Memo recorded in log.");
      return;
    }
    var cmd = classifyCommand(primary);

    if (confirmAction) {
      var spec = CONFIRMS[confirmAction];
      if (cmd === "yes") {
        confirmAction = null;
        postAction(spec.yes); speak(spec.yesSay); return;
      }
      if (cmd === "no" || cmd === "cancel") {
        confirmAction = null;
        if (spec.no) postAction(spec.no);
        speak(spec.noSay); return;
      }
      speak("Say yes or no.");
      return;
    }

    if (pending) {
      if (cmd === "yes") { acceptMove(pending.cands[pending.idx]); return; }
      if (cmd === "no") { pending.idx++; askCandidate(); return; }
      if (cmd === "cancel") { pending = null; speak("Cancelled. Say the move again."); return; }
      // A PIECE NAME PICKS ITS CANDIDATE (v116). The guard
      // used to walk its list one yes/no at a time, which
      // cost game20 three questions on "foxtrot three":
      // pawn? no. queen? no. knight? yes. The strict prompt
      // has taken a one-word piece answer since v92; the
      // same shape of question now takes the same answer.
      // Both halves came from the user - the square from
      // the utterance that raised the question, the piece
      // from this one - so a UNIQUE fit is accepted, like
      // the v92 path. Two candidates of the named piece
      // (two knights to one square) jump the walk to the
      // first of them and ask as before.
      var pa = answerPieceOf(transcripts);
      if (pa) {
        var fits = [], firstFit = -1;
        for (var pi = 0; pi < pending.cands.length; pi++) {
          if (pending.cands[pi].m.piece === pa) {
            fits.push(pending.cands[pi]);
            if (firstFit < 0) firstFit = pi;
          }
        }
        if (fits.length === 1) {
          log("DLG", "piece answer picked " + fits[0].san);
          acceptMove(fits[0]);
          return;
        }
        if (fits.length > 1) {
          pending.idx = firstFit;
          askCandidate();
          return;
        }
        // named a piece that is not among the options: say
        // so and re-ask, never "I didn't hear you" (v96)
        speak("No " + PIECE_NAME[pa] + " among the options.");
        askCandidate();
        return;
      }
      var re = collectCandidates(api.pos, transcripts);
      if (re.length === 1) {
        var reGuard = bareGuardCands(re[0]);
        if (reGuard) { pending = { cands: reGuard, idx: 0 };
          askCandidate(); return; }
        acceptMove(re[0]);
        return;
      }
      speak("Say yes or no.");
      var c = pending.cands[pending.idx];
      speak("Did you mean " + sanToSpeech(c.san) + "?");
      return;
    }

    if (cmd === "repeat") { repeatLast(); return; }
    if (classifyFlipClock(primary)) { flipClockSides(); return; }
    if (cmd === "clock") { speakClocks(); return; }

    /* Questions about the position work on either side's clock */
    var q = classifyQuery(primary);
    if (q) { log("QRY", q.kind + " " + (q.sq || q.piece || "")); answerQuery(q); return; }

    if (cmd === "resign") { confirmAction = "resign";
      speak("Resign the game? Yes or no."); return; }
    if (cmd === "draw") { confirmAction = "offerdraw";
      speak("Offer a draw? Yes or no."); return; }
    // CANCEL CLOSES A REPAIR QUESTION TOO (v136, game
    // w25-1 at 18:42:58). The yes/no walk and the
    // confirmations have taken "cancel" since v92, but the
    // two REPAIR questions - askPartial's "say the rank"
    // and askPiece's "which piece" - kept their state in
    // partialAsk/pieceAsk and fell through to the silent
    // return below. The owner said "cancel" twice into an
    // open "say the rank" and heard NOTHING either time,
    // then waited a hundred seconds before playing
    // something else. Silence is the one answer an
    // eyes-free user cannot read: it is indistinguishable
    // from not being heard at all. Same words as the
    // pending path, because it is the same act.
    if (cmd === "cancel" && (partialAsk || pieceAsk)) {
      partialAsk = null; pieceAsk = null;
      log("CND", "repair question cancelled");
      speak("Cancelled. Say the move again.");
      return;
    }
    if (cmd === "yes" || cmd === "no" || cmd === "cancel") return;

    // Is there anything move-shaped in ANY reading. The mic
    // is open the whole game, so stray talk arrives here
    // constantly, and it should not be answered out loud.
    var moveLike = transcripts.some(function (tt) {
      return !reqIsEmpty(parseTranscript(tt));
    });

    if (!api.pos || api.over || api.pos.turn !== api.myColor) {
      if (!moveLike) {
        // ordinary talk, a cough, the television. Nothing
        // was being asked of us, so say nothing.
        log("HRD", "ignored, not a move: " + primary);
        return;
      }
      // a real move at the wrong moment IS worth answering
      if (!api.pos) speak("Not connected to a game yet.");
      else if (api.over) speak("The game is over.");
      else speak(colorWord(api.pos.turn) + " to move.");
      return;
    }

    var req = parseTranscript(primary);
    log("PRS", describeReq(req));
    var cands = collectCandidates(api.pos, transcripts);
    log("CND", cands.map(function (c) { return c.san; }).join(",") || "(none)");

    if (cands.length === 1 && !CFG.confirmMyMove) {
      var guarded = bareGuardCands(cands[0]);
      if (guarded) {
        pending = { cands: guarded, idx: 0 };
        askCandidate();
        return;
      }
      acceptMove(cands[0]);
      return;
    }
    if (cands.length === 1) {
      // confirmMyMove asks even the unambiguous - but the
      // bare-square guard must still widen the list first
      // (v133), or "no" to the pawn push dead-ends with the
      // piece move standing right there. One question
      // serves both settings: yes plays the pawn, no walks
      // the pieces, exactly as the guard alone would.
      pending = { cands: bareGuardCands(cands[0]) || cands, idx: 0 };
      askCandidate();
      return;
    }
    if (cands.length === 0) {
      // Before anything else: is this the answer to the
      // piece question (v92)? It arrives as a piece and
      // nothing else, which every other path reads as
      // silence. Both halves came from the user — the
      // square from the utterance that raised the
      // question, the piece from this one — so a single
      // fit is a complete move and goes through the
      // ordinary accept path, not a second yes/no. The
      // ply guard means a stale answer, after the position
      // has moved on, is simply not an answer.
      // Before checking: if a question is open and this
      // reading has NO piece in it, see whether it is a
      // "-ship" word - "Relationship", "Leadership" - which
      // is how Safari returned "Bishop" as an answer in
      // game20 (17:49). answerPieceOf applies the suffix
      // rule; only the piece slot is filled, so a wrong
      // guess lands in the ordinary "no bishop can go
      // there" re-ask, never in a move.
      if (!req.piece && !req.squares.length && !req.castle &&
          !req.victim && pieceAsk &&
          pieceAsk.ply === api.moves.length) {
        var sfx = answerPieceOf(transcripts);
        if (sfx) {
          log("PRS", "answer read as " + PIECE_NAME[sfx]);
          req.piece = sfx;
        }
      }
      var answered = pieceAskAnswer(req);
      if (answered) {
        var acs = answered.map(function (m) {
          return { m: m, san: api.pos.sanOf(m) };
        });
        log("CND", "piece answer: " +
            acs.map(function (c) { return c.san; }).join(","));
        pieceAsk = null;
        // no bare-square guard here: it fires only on pawn
        // moves, and this question is only ever asked about
        // a square no pawn can reach
        if (acs.length === 1 && !CFG.confirmMyMove) {
          acceptMove(acs[0]);
          return;
        }
        pending = { cands: acs, idx: 0 };
        askCandidate();
        return;
      }
      // A piece was named, the question is still open, and
      // that piece cannot go there. Say so and ask again
      // with the same list: the question stays open, and
      // the user is never told they were not heard when
      // they were (v96).
      if (pieceAskOpen(req)) {
        var named = pieceAskNamed(req);
        log("CND", "piece answer: no " + named + " fits, re-asking");
        askPiece(pieceAsk.moves,
                 "no " + named +
                 (pieceAsk.capture ? " can take there." : " can go there."),
                 pieceAsk.sq);
        return;
      }
      // Is this the answer to an open PARTIAL question
      // (v117)? "say the rank" answered "eight", "say the
      // target" answered "alpha one" or "rook". Both
      // halves came from the user, so a unique fit is
      // accepted the v92 way; several fits walk the
      // ordinary yes/no; an answer that fits nothing is
      // told so and the question is asked again (v96).
      var pAns = partialAnswer(req, transcripts);
      if (pAns) {
        if (pAns.length) {
          var pcs = pAns.map(function (m) {
            return { m: m, san: api.pos.sanOf(m) };
          });
          log("CND", "partial answer: " + pcs.map(function (c2) {
            return c2.san;
          }).join(","));
          partialAsk = null;
          if (pcs.length === 1 && !CFG.confirmMyMove) {
            acceptMove(pcs[0]);
            return;
          }
          pending = { cands: pcs, idx: 0 };
          askCandidate();
          return;
        }
        log("CND", "partial answer: nothing fits, re-asking");
        var pk = partialAsk;
        speak("That does not fit.");
        askPartial(pk.req, pk.want, pk.chk, pk.mate);
        return;
      }
      // A PIECE WITH HALF A SQUARE (v116). Game20's mating
      // move took five tries: "queen alpha check me" lost
      // its rank every time, arrived as piece-plus-file
      // with no square, and died at "I didn't catch a
      // move". When a piece is named alongside a lone file
      // or rank, the missing half was almost certainly
      // eaten by the mic, so relax it into that piece's
      // legal moves TO that file or rank. The dangling
      // file is read as the destination's, not the
      // origin's, because in every observed loss it was
      // the destination rank that vanished.
      //
      // A spoken check word narrows the fits, "mate"
      // narrows further to mating moves - here "queen
      // alpha, check me" leaves exactly Qa8#. A UNIQUE
      // fit is offered as a yes/no, never played unasked.
      // SEVERAL fits ask for the missing half instead of
      // demanding the whole move again (v117): the file
      // arrived intact, so "I heard queen alpha. say the
      // rank." wastes nothing, and "eight" completes it.
      if (req.piece && !req.squares.length && !req.victim &&
          (req.fromFile || req.fromRank)) {
        var half = api.pos.legalMoves().filter(function (m) {
          if (m.piece !== req.piece) return false;
          if (req.capture && !m.captured) return false;
          var t = RULES.sqName(m.to);
          if (req.fromFile && t[0] !== req.fromFile) return false;
          if (req.fromRank && t[1] !== req.fromRank) return false;
          return true;
        });
        if (half.length) {
          var narrowed = half.map(function (m) {
            return { m: m, san: api.pos.sanOf(m) };
          });
          if (transcripts.some(saysCheck)) {
            var chk = narrowed.filter(function (c2) {
              return /[+#]$/.test(c2.san);
            });
            if (chk.length) narrowed = chk;
          }
          if (transcripts.some(saysMate)) {
            var mt = narrowed.filter(function (c2) {
              return c2.san.slice(-1) === "#";
            });
            if (mt.length) narrowed = mt;
          }
          if (narrowed.length === 1) {
            // A UNIQUE FIT PLAYS AT ONCE (v119, was
            // mate-only in v118). The piece was NAMED and
            // only one of its moves fits everything heard,
            // which is exactly the v111 bar: "queen takes
            // queen" has played unconfirmed since then
            // with the same shape of evidence - named
            // mover, destination inferred by uniqueness.
            // Confirming here while v111 played was the
            // file disagreeing with itself. The residual
            // risk is the one v111 already accepted and
            // documented: thinking out loud with a piece
            // name in it. Watch the logs; a bare-square
            // request still confirms, because there the
            // PIECE is inferred, not named.
            if (!CFG.confirmMyMove) {
              log("CND", "half-square repair: only " +
                  narrowed[0].san + " fits, playing");
              acceptMove(narrowed[0]);
              return;
            }
            log("CND", "half-square repair: only " +
                narrowed[0].san + " fits, asking");
            pending = { cands: narrowed, idx: 0 };
            askCandidate();
            return;
          }
          log("CND", "half-square: " + narrowed.map(function (c2) {
            return c2.san;
          }).join(",") + " fit, asking for the missing half");
          askPartial(req, req.fromFile ? "rank" : "file",
                     transcripts.some(saysCheck),
                     transcripts.some(saysMate));
          return;
        }
      }
      // "QUEEN TAKES", TARGET EATEN (v117). A piece and a
      // capture word with no square, victim, file or rank
      // used to die at "Say again." though half
      // the move arrived. Every capture that piece can
      // make is the candidate list: one is offered as a
      // yes/no, several ask for the target, and none gets
      // the truth - the piece has nothing to take, so the
      // piece name itself was probably the misheard word.
      if (req.piece && req.capture && !req.squares.length &&
          !req.victim && !req.fromFile && !req.fromRank) {
        var pcaps = api.pos.legalMoves().filter(function (m) {
          return m.piece === req.piece && m.captured;
        });
        if (!pcaps.length) {
          speak("The " + PIECE_NAME[req.piece] +
                " has nothing to take. Say again.");
          return;
        }
        var ncaps = pcaps.map(function (m) {
          return { m: m, san: api.pos.sanOf(m) };
        });
        if (transcripts.some(saysCheck)) {
          var ck2 = ncaps.filter(function (c2) {
            return /[+#]$/.test(c2.san);
          });
          if (ck2.length) ncaps = ck2;
        }
        if (transcripts.some(saysMate)) {
          var mk2 = ncaps.filter(function (c2) {
            return c2.san.slice(-1) === "#";
          });
          if (mk2.length) ncaps = mk2;
        }
        if (ncaps.length === 1) {
          // named mover, unique capture: the v111 bar is
          // met, so it plays - see the half-square repair
          // above. "queen takes" with one queen capture on
          // the board can only be that capture.
          if (!CFG.confirmMyMove) {
            log("CND", "capture repair: only " + ncaps[0].san +
                " fits, playing");
            acceptMove(ncaps[0]);
            return;
          }
          log("CND", "capture repair: only " + ncaps[0].san +
              " fits, asking");
          pending = { cands: ncaps, idx: 0 };
          askCandidate();
          return;
        }
        log("CND", "capture repair: " + ncaps.map(function (c2) {
          return c2.san;
        }).join(",") + " fit, asking for the target");
        askPartial(req, "target",
                   transcripts.some(saysCheck),
                   transcripts.some(saysMate));
        return;
      }
      // MATE NAMED, EVERYTHING ELSE EATEN (v117). "queen
      // checkmate" with no square at all still says two
      // true things: the piece, and that the move mates.
      // The mating moves by that piece ARE the candidate
      // list, and it is usually a list of one. Walked as
      // yes/no questions, every one - a mating move ends
      // the game, so it is never accepted on a guess. A
      // named piece is required: bare "checkmate" is table
      // talk, not a move.
      if (req.piece && !req.squares.length && !req.victim &&
          !req.fromFile && !req.fromRank && !req.capture &&
          transcripts.some(saysMate)) {
        var pmates = api.pos.legalMoves().filter(function (m) {
          return m.piece === req.piece &&
                 api.pos.sanOf(m).slice(-1) === "#";
        });
        if (pmates.length) {
          var nmates = pmates.map(function (m) {
            return { m: m, san: api.pos.sanOf(m) };
          });
          // one mate plays at once - every candidate here
          // mates by construction, so the only uncertainty
          // is WHICH mate, and with one there is none; see
          // the half-square repair for the full argument.
          // Several still ask, because choosing among
          // moves the user distinguished and we could not
          // is a guess, however harmless its outcome.
          if (nmates.length === 1 && !CFG.confirmMyMove) {
            log("CND", "mate repair: only " + nmates[0].san +
                ", playing");
            acceptMove(nmates[0]);
            return;
          }
          log("CND", "mate repair: " + nmates.map(function (c2) {
            return c2.san;
          }).join(","));
          pending = { cands: nmates, idx: 0 };
          askCandidate();
          return;
        }
      }
      if (reqIsEmpty(req)) {
        // an open partial question deserves its re-ask, not
        // "Say again." - the v96 principle again
        if (partialAsk && partialAsk.ply === api.moves.length) {
          var pk2 = partialAsk;
          askPartial(pk2.req, pk2.want, pk2.chk, pk2.mate);
          return;
        }
        // NOTHING BUT FILLER IS NOT A FAILED MOVE (v122).
        // Game22 heard a lone "A" (19:48) and answered "I
        // didn't catch a move" - and that sentence then ate
        // the real move spoken over it. On the opponent's
        // clock the stray-talk rule already keeps quiet;
        // this extends the same judgement to our own turn
        // for an utterance with no content word at all,
        // which is a mic artifact rather than a move that
        // failed to land. A garbled WORD still gets the
        // sentence: there something was said, and silence
        // would leave the user waiting.
        var anyContent = transcripts.some(function (tt) {
          return wordsOf(tt).some(function (w) { return !FILLER[w]; });
        });
        if (!anyContent) {
          log("HRD", "ignored, nothing but filler: " + primary);
          return;
        }
        speak("Say again.");
        return;
      }
      // Relax the pawn-only reading of a bare square and see
      // what fits. If EXACTLY one move does, the piece name
      // was almost certainly lost by the mic, so offer that
      // move as a yes/no question instead of demanding the
      // whole move again: "takes echo one" with only Rxe1 on
      // the board becomes "did you mean rook takes echo one?"
      // Still never sent to Lichess without a yes. With
      // several fits, the old teaching prompt names the pieces,
      // since guessing an order among them helps less than one
      // clean re-say.
      //
      // A NAMED PAWN gets the same relaxation (v72): "pawn
      // takes delta five" heard as "Ponte delta five"
      // arrives as a pawn push, illegal, though exd5 was
      // meant and unique — game8 answered it with a bare
      // "not a legal move". A named pawn can only relax
      // into pawn captures, so named-piece requests are
      // otherwise untouched.
      var all = [];
      if ((!req.piece || req.piece === "p") &&
          req.squares.length === 1) {
        all = findMoves(api.pos, req, true);
      }
      if (all.length === 1) {
        var only = all[0];
        log("CND", "repair: only " + api.pos.sanOf(only) +
            " fits, asking");
        pending = { cands: [{ m: only, san: api.pos.sanOf(only) }],
                    idx: 0 };
        askCandidate();
        return;
      }
      // If a piece could have reached that square, say which,
      // rather than a bare "illegal" that teaches nothing.
      var alt = [];
      if (all.length) {
        // EVERY WAY TO TAKE THERE, not just the pawn's
        // (v95). Through v94 this listed pawn captures
        // alone, so game13 said "Queen takes delta six",
        // lost the queen off the reading, and was told to
        // say "echo takes delta 6" — naming the one move
        // the user had not asked for, while the queen
        // capture sat legal and unmentioned. Obeying the
        // prompt would have played the wrong piece. A
        // prompt that recommends must recommend all of it.
        // CONFIRMED in practice on a bare "delta five" with
        // both Nxd5 and exd5 legal: both were offered. Note
        // they come out in move-generation order, which is
        // not order of likelihood — deliberately, since a
        // bare square is pawn-shaped but game13 meant the
        // queen, and there is no honest way to rank them.
        // The lead says what actually went wrong, since
        // being told about a move you did not ask for,
        // without being told why, is alarming mid-game.
        // A NAMED PAWN cannot reach here with piece moves
        // in hand: findMoves relaxes a named pawn into
        // pawn captures only (v72), so that case still
        // lists exactly the files, and keeps its wording.
        var caps = all.filter(function (m) { return m.captured; });
        if (!req.capture && caps.length) {
          log("CND", "push-only: capture available " +
              caps.map(function (m) { return api.pos.sanOf(m); }).join(","));
          // THE ANSWER MAY BE ONE WORD (v103). Through v102
          // this spoke and returned, leaving nothing behind,
          // so game14 answered "Bishop" — twice — and was
          // told nothing was heard, while the other prompt
          // three lines below had accepted exactly that
          // since v92. Two questions of the same shape must
          // take the same answers. Passing the square makes
          // askPiece phrase the options as captures and
          // accept a FILE as well as a piece name, since
          // that is how it offers the pawn.
          askPiece(caps, req.piece ? "that would be a capture."
                                   : "no piece heard.",
                   req.squares[0]);
          return;
        }
        alt = all.filter(function (m) { return m.piece !== "p"; });
      }
      if (alt.length) {
        log("CND", "strict: pawn cannot, but " +
            alt.map(function (m) { return api.pos.sanOf(m); }).join(",") +
            " could");
        // askPiece leaves the question open: see pieceAsk
        // in the section 6 state block for why it is kept
        askPiece(alt, "No pawn can go there.");
        return;
      }
      speak("That's not a legal move. Say again.");
      return;
    }
    pending = { cands: cands, idx: 0 };
    askCandidate();
  }

  /*================ 7. SPEECH OUT (gates the mic) =================*/

  var SPOKEN_FILE = { a: "alpha", b: "bravo", c: "charlie", d: "delta",
    e: "echo", f: "foxtrot", g: "golf", h: "hotel" };
  var SPOKEN_PIECE = { K: "king", Q: "queen", R: "rook", B: "bishop", N: "knight" };

  var speechReady = false, speakQueue = [], speaking = false, speakGuard = null;
  var voicePicked = null, spokeOnce = false;
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

  // `who` is a COLOR written to the LOG ONLY, never spoken.
  // It exists because a recapture makes the read-back and
  // the announcement the same sentence — game18 17:12 and
  // 17:24 are both "queen takes delta 4", differing by the
  // trailing period alone — and the neighbouring MOV line
  // cannot settle it, since the 200 and the gameState event
  // arrive in either order (see acceptMove).
  //
  // Colors, not "me"/"opp", so the log reads in the same
  // vocabulary as the speech it records: nothing here has
  // said "yours" or "theirs" since the beginning, and which
  // side you are is established once at connection time.
  // Out loud the two lines stay identical: they describe
  // the same move, and the color belongs to the move rather
  // than to whoever is speaking it.
  function speak(text, who) {
    if (!text) return;
    // EVERY output funnels through here. Silent mode
    // (v80-v108) intercepted at exactly this point to
    // render speech as on-screen text; the second channel
    // RETURNED at v129, clock mode only, plugged in below
    // as foretold - one interception point catches every
    // message. See the v109 entry for why the first one
    // went.
    log("SAY", (who ? who + " " : "") + text);
    // THE MESSAGE GATE (v129). `who` is the color word and
    // is passed for move announcements alone, so its
    // absence marks a MESSAGE: questions, errors, command
    // answers, game over. In clock mode a message obeys
    // the channel pair - painted on the strip, spoken, or
    // both. Never neither: the panel and loadSettings
    // keep one of the two on. Moves are decided upstream
    // by readBackMineNow/speakOpponentNow, as always.
    if (clockModeOn() && !who) {
      if (CFG.clockShowMessages) showClockMessage(text);
      if (!CFG.clockSpeakMessages) return;
    }
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

  function startListening() {
    if (!Rec) { log("MIC", "SpeechRecognition unavailable in this browser"); return; }
    // A REFUSAL USED TO BE SILENT (v105), and that is how
    // the game17 dead mic hid: the button was lit and
    // nothing in the log said the mic had declined to
    // start. Speech blocking it is normal and now
    // self-healing (the end of speech re-checks), so it
    // is logged once rather than every time; anything
    // else refusing is worth seeing.
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
    recognition.continuous = MIC_ALWAYS_ON;
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
      /* Proof the loop is alive. Safari ends and restarts on
         its own, so cycles are rare now - rare enough to log
         each one. The %10 throttle (gone in v127) was for the
         switching mode, where onstart fired once per
         utterance. */
      log("MIC", "listening (cycle " + micCycles + ")" +
          (MIC_ALWAYS_ON ? "" : " switching"));
    };
    recognition.onresult = function (ev) {
      var res = ev.results[ev.results.length - 1];
      if (!res) return;
      var alts = [];
      for (var i = 0; i < res.length; i++) alts.push(res[i].transcript);
      // no speaking gate here since v132: AEC keeps our own
      // announcements out of the mic (platform finding), so
      // every result is the room, and a move said over an
      // announcement lands as said.
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
        speak("Microphone blocked.");
      } else if (ev.error !== "no-speech" && ev.error !== "aborted") {
        micFails++;
        if (micFails >= 8) {
          running = false;
          log("MIC", "giving up after " + micFails +
              " failures - tap the button to restart");
          speak("Microphone stopped. Tap the button to restart.");
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

  /*==================== 11. LICHESS BOARD API =====================*/

  var RULES = makeRules();

  var api = {
    gameId: null,
    myId: null,
    myColor: null,
    pos: null,
    moves: [],            // uci list already applied
    lastSan: "", lastSanW: "", lastSanB: "",
    wtime: null, btime: null,
    over: false,
    mode: "none"          // "stream" | "poll"
  };

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
      return Promise.resolve(GM.getValue(TOKEN_KEY, "")).then(function (v) {
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
    if (!gmAvailable()) return Promise.resolve(false);
    try {
      return Promise.resolve(GM.setValue(TOKEN_KEY, t)).then(function () {
        cachedToken = t;
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
    if (!gmAvailable()) return Promise.resolve(false);
    try {
      var p = (typeof GM.deleteValue === "function")
        ? GM.deleteValue(TOKEN_KEY)
        : GM.setValue(TOKEN_KEY, "");
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
        "It is stored on this iPad only.");
    } catch (e) {}
    if (!t) return Promise.resolve(null);
    t = t.replace(/\s+/g, "");
    if (!t) return Promise.resolve(null);
    return saveToken(t).then(function (ok) { return ok ? t : null; });
  }

  function authHeaders() {
    return { Authorization: "Bearer " + (storedToken() || "") };
  }

  function gameIdFromUrl() {
    var seg = location.pathname.split("/")[1] || "";
    if (/^[A-Za-z0-9]{8,12}$/.test(seg)) return seg.slice(0, 8);
    return null;
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
      log("API", "account = " + api.myId);
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

  /* ---- connecting ---- */

  function connect() {
    api.gameId = gameIdFromUrl();
    api.over = false;
    if (!api.gameId) {
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
      connectWithToken();
    });
  }

  function connectWithToken() {
    offerState = { draw: false, takeback: false };
    (api.myId ? Promise.resolve(api.myId) : fetchMyId())
      .then(startStream)
      .catch(function (e) {
        log("ERR", "connect: " + e.message);
        speak("Could not connect. Check the log.");
      });
  }

  /*============================ 12. UI ============================*/

  var wrapEl, bigBtn, logPanel, logBtn, practiceBtn, clockBtn, settingsBtn, setPanel;

  var BUTTON_OFF = "#242220";
  var BUTTON_ON = "#3a5a2a";

  // A lit button means that thing is currently ON, matching
  // the round button. Called from renderButton so every
  // control is repainted from one place.
  function paintButton(el, on, offColor) {
    if (!el) return;
    el.style.background = on ? BUTTON_ON : BUTTON_OFF;
    el.style.color = on ? "#e6efe0" : offColor;
  }

  function renderButton() {
    paintButton(practiceBtn, dryRun, "#d0a24c");
    paintButton(logBtn, !!(logPanel && logPanel.style.display !== "none"),
              "#91bddf");
    paintButton(clockBtn, clockModeOn(), "#91bddf");
    paintButton(settingsBtn, !!(setPanel && setPanel.style.display !== "none"),
              "#91bddf");
    if (!bigBtn) return;
    if (!running) { bigBtn.textContent = "\u25B6"; bigBtn.style.background = BUTTON_OFF; }
    else if (listening) { bigBtn.textContent = "\u25CF"; bigBtn.style.background = BUTTON_ON; }
    else { bigBtn.textContent = "\u25CB"; bigBtn.style.background = BUTTON_ON; }
  }

  // Built only when PRACTICE_MODE = true. practiceBtn stays null
  // otherwise, which every other reference already tolerates:
  // paintButton returns on a falsy element, and the button is the
  // only thing that ever sets dryRun true.
  function buildPracticeButton() {
    practiceBtn = document.createElement("button");
    practiceBtn.textContent = "practice";
    practiceBtn.style.cssText =
      "font-size:12px;padding:6px 12px;border-radius:10px;" +
      "background:" + BUTTON_OFF + ";color:#d0a24c;" +
      "border:1px solid #3a3530;";
    practiceBtn.addEventListener("click", function () {
      wakeSpeech();
      setTimeout(loadVoices, 300);
      if (dryRun) {
        dryRun = false; running = false;
        pauseMic(); pending = null; confirmAction = null;
        log("DRY", "practice mode OFF");
      } else {
        try { if (streamAbort) streamAbort.abort(); } catch (e) {}
        clearInterval(pollTimer); clearTimeout(reconnectTimer);
        dryRun = true; running = true;
        pending = null; confirmAction = null;
        startKeepAlive();
        startListening();
        dryStart();
      }
      renderButton();
    });
  }

  function buildUI() {
    if (document.getElementById("voicemove-ui")) return;

    wrapEl = document.createElement("div");
    wrapEl.id = "voicemove-ui";
    wrapEl.style.cssText =
      "position:fixed;right:12px;bottom:12px;z-index:99999;display:flex;" +
      "flex-direction:column;align-items:flex-end;gap:6px;" +
      "font-family:system-ui,-apple-system,sans-serif;";

    var row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:8px;";

    if (PRACTICE_MODE) buildPracticeButton();

    logBtn = document.createElement("button");
    logBtn.textContent = "log";
    logBtn.style.cssText =
      "font-size:12px;padding:6px 12px;border-radius:10px;" +
      "background:" + BUTTON_OFF + ";color:#91bddf;" +
      "border:1px solid #3a3530;";

    bigBtn = document.createElement("button");
    bigBtn.style.cssText =
      "width:72px;height:72px;border-radius:50%;font-size:26px;line-height:1;" +
      "display:flex;align-items:center;justify-content:center;padding:0;" +
      "background:" + BUTTON_OFF + ";color:#91bddf;" +
      "border:1px solid #3a3530;touch-action:manipulation;-webkit-user-select:none;user-select:none;";

    clockBtn = document.createElement("button");
    clockBtn.textContent = "clock";
    clockBtn.style.cssText = logBtn.style.cssText;
    clockBtn.addEventListener("click", function () {
      toggleClockMode();
    });

    // THE SETTINGS PANEL (v124). One "settings" button, one
    // panel of switches. Every persisted setting lives
    // here so nothing behavioural is buried in the source
    // any more; the file's values are first-run defaults
    // only. The panel follows the button aesthetic - a lit
    // pill is ON, same colors as everything else - and the
    // rows are grouped the way the modes are grouped:
    // all modes, voice mode, clock mode. Clock
    // mode's full-screen overlay sits above it, and
    // enterClockMode() closes it besides, so the switches
    // are only ever seen with the clock down.
    settingsBtn = document.createElement("button");
    settingsBtn.textContent = "settings";
    settingsBtn.style.cssText = logBtn.style.cssText;
    settingsBtn.addEventListener("click", function () {
      var open = setPanel.style.display !== "none";
      if (!open) {
        // anchor just above the tallest thing in the row -
        // the round button
        try {
          var top = bigBtn.getBoundingClientRect().top;
          setPanel.style.bottom =
            Math.max(60, window.innerHeight - top + 8) + "px";
        } catch (e) {}
      }
      setPanel.style.display = open ? "none" : "block";
      renderButton();
    });

    setPanel = document.createElement("div");
    setPanel.style.cssText =
      "position:fixed;right:10px;bottom:118px;z-index:99990;" +
      "display:none;background:#171513;border:1px solid #3a3530;" +
      "border-radius:14px;padding:10px 12px;min-width:230px;" +
      "font-family:-apple-system,system-ui,sans-serif;" +
      "-webkit-user-select:none;user-select:none;";

    function settingHeader(text) {
      var h = document.createElement("div");
      h.textContent = text;
      h.style.cssText =
        "color:#7d766e;font-size:11px;letter-spacing:.08em;" +
        "text-transform:uppercase;margin:8px 0 4px;";
      setPanel.appendChild(h);
    }

    // each row's pill painter, keyed by setting, so one
    // row's onFlip can repaint another - the message pair
    // flips its partner back on (v129)
    var settingPaints = {};

    function settingRow(key, label, onFlip, headerStyle) {
      var row = document.createElement("div");
      row.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;" +
        "gap:14px;margin:4px 0;";
      var lab = document.createElement("div");
      lab.textContent = label;
      lab.style.cssText = headerStyle
        ? "color:#7d766e;font-size:11px;letter-spacing:.08em;" +
          "text-transform:uppercase;"
        : "color:#c9c2b8;font-size:13px;";
      var pill = document.createElement("button");
      pill.style.cssText =
        "font-size:11px;min-width:52px;padding:5px 0;" +
        "text-align:center;border-radius:10px;" +
        "border:1px solid #3a3530;";
      var paint = function () {
        pill.textContent = CFG[key] ? "on" : "off";
        paintButton(pill, CFG[key], "#91bddf");
      };
      pill.addEventListener("click", function () {
        CFG[key] = !CFG[key];
        saveSettings();
        log("SET", key + " = " + CFG[key]);
        paint();
        if (onFlip) onFlip();
      });
      paint();
      settingPaints[key] = paint;
      row.appendChild(lab);
      row.appendChild(pill);
      setPanel.appendChild(row);
    }

    // the headphones row led the panel from v125 to v131;
    // deleted at v132 with the setting.
    settingHeader("all modes");
    settingRow("confirmMyMove", "confirm my move");
    settingRow("guardPawnPushes", "guard pawn pushes");
    settingHeader("voice mode");
    settingRow("readBackMine", "speak my move");
    settingHeader("clock mode");
    // rows grouped by content, speak before show in each
    // group (v130): moves then messages, two stanzas of
    // the same shape.
    settingRow("clockReadBackMine", "speak my move");
    settingRow("clockSpeakOpponent", "speak opponent's move");
    settingRow("clockShowMoves", "show moves", function () {
      // the overlay is built once; tear it down so the next
      // clock entry rebuilds with or without the move row
      if (clockOverlay) {
        try { clockOverlay.remove(); } catch (e) {}
        clockOverlay = null;
      }
    });
    // the message pair (v129). Any three of the four
    // states, never off/off: switching the second one off
    // switches the other back on, so a question always has
    // a channel. The invariant lives HERE and in
    // loadSettings, not in speak(), which just obeys.
    function keepOneMessageChannel(other) {
      if (CFG.clockSpeakMessages || CFG.clockShowMessages) return;
      CFG[other] = true;
      saveSettings();
      log("SET", other + " forced on: messages need one channel");
      settingPaints[other]();
    }
    settingRow("clockSpeakMessages", "speak messages", function () {
      keepOneMessageChannel("clockShowMessages");
    });
    settingRow("clockShowMessages", "show messages", function () {
      keepOneMessageChannel("clockSpeakMessages");
    });
    document.body.appendChild(setPanel);

    if (practiceBtn) row.appendChild(practiceBtn);
    row.appendChild(logBtn);
    row.appendChild(clockBtn);
    row.appendChild(settingsBtn);
    row.appendChild(bigBtn);
    wrapEl.appendChild(row);
    document.body.appendChild(wrapEl);

    // BUTTON POSITIONING IS A CLOSED CASE — leave this alone.
    // The row is plain position:fixed, bottom/right, as it
    // was through v74. iOS rubber-band overscroll can leave
    // it sitting low until the next real page interaction
    // or reload; that is a cosmetic iOS quirk and the
    // accepted cost. Two fixes were tried and REMOVED:
    // v75 re-composited the row after overscroll (no
    // effect: the layout viewport itself is what shifts),
    // and v76 pinned it to visualViewport on every scroll
    // event, which made the buttons visibly jump around
    // during normal scrolling — worse than the bug. Do not
    // reopen without a fundamentally different approach.

    /* ---- debug panel ---- */

    logPanel = document.createElement("div");
    logPanel.style.cssText =
      "position:fixed;left:8px;right:8px;top:8px;bottom:110px;z-index:99998;" +
      "display:none;flex-direction:column;background:rgba(12,12,11,.97);" +
      "border:1px solid #3a3530;border-radius:12px;overflow:hidden;";
    var verLabel = document.createElement("div");
    verLabel.textContent = "Audioplay " + VERSION;
    verLabel.style.cssText =
      "color:#d0a24c;font-size:12px;padding:6px 4px;margin-left:auto;" +
      "font-family:system-ui,sans-serif;";

    var bar = document.createElement("div");
    bar.style.cssText =
      "display:flex;gap:8px;padding:8px;border-bottom:1px solid #3a3530;" +
      "font-family:system-ui,sans-serif;";
    ["token", "copy", "clear", "close"].forEach(function (name) {
      var b = document.createElement("button");
      b.textContent = name;
      b.style.cssText =
        "font-size:12px;padding:6px 12px;border-radius:8px;background:#242220;" +
        "color:#91bddf;border:1px solid #3a3530;";
      b.addEventListener("click", function () {
        if (name === "token") {
          manageToken();
          return;
        }
        if (name === "copy") {
          try {
            navigator.clipboard.writeText(LOG.join("\n"));
            b.textContent = "copied";
            setTimeout(function () { b.textContent = "copy"; }, 1200);
          } catch (e) { b.textContent = "no clipboard"; }
        } else if (name === "clear") { LOG.length = 0; logBody.textContent = ""; }
        else { logPanel.style.display = "none"; renderButton(); }
      });
      bar.appendChild(b);
    });
    bar.appendChild(verLabel);

    logBody = document.createElement("pre");
    logBody.style.cssText =
      "margin:0;padding:8px;flex:1;overflow:auto;color:#9fb0a0;font-size:11px;" +
      "line-height:1.35;white-space:pre-wrap;word-break:break-word;" +
      "font-family:ui-monospace,Menlo,monospace;-webkit-overflow-scrolling:touch;";
    logBody.textContent = LOG.join("\n");
    logPanel.appendChild(bar);
    logPanel.appendChild(logBody);
    document.body.appendChild(logPanel);

    logBtn.addEventListener("click", function () {
      var open = logPanel.style.display !== "none";
      logPanel.style.display = open ? "none" : "flex";
      if (!open) {
        logBody.textContent = LOG.join("\n");
        logBody.scrollTop = logBody.scrollHeight;
      }
      renderButton();
    });

    bigBtn.addEventListener("click", function () {
      wakeSpeech();
      setTimeout(loadVoices, 300);
      running = !running;
      if (running) {
        dryRun = false;
        startKeepAlive();
        connect();
        startListening();
      } else {
        dryRun = false;
        pauseMic();
        stopKeepAlive();
        clearInterval(pollTimer);
        clearTimeout(reconnectTimer);
        try { if (streamAbort) streamAbort.abort(); } catch (e) {}
        pending = null; confirmAction = null;
        // nothing spoken, as with practice mode off: the
        // button's own state is the signal, and the user
        // just pressed it. Speaking after being switched
        // off is the wrong last word from a thing that has
        // been told to stop.
        log("UI", "voice play off");
      }
      renderButton();
    });
    renderButton();
    log("UI", "ready");
  }

  /*======= 13. EMBEDDED CHESS RULES / LEGAL MOVE GENERATOR ========*/

  /* FROZEN. Verified by perft: startpos depth 4 = 197281,
   * Kiwipete depth 3 = 97862. Re-run both after ANY edit here.
   * Nothing in this section may evaluate, score, search, or
   * recommend: it knows only which moves are LEGAL and what
   * they are CALLED. */

  /* Minimal self-contained chess RULES (0x88 board). No dependencies.
   * This knows which moves are LEGAL and what they are CALLED. It
   * does not evaluate, score, search, or recommend anything. Exposes:
   * Position(startFen?) with .applyUci, .legalMoves, .san, .turn,
   * .isGameOver, .inCheck */
  function makeRules() {
    "use strict";

    var FILES = "abcdefgh";
    var KNIGHT = [33, 31, 18, 14, -33, -31, -18, -14];
    var BISHOP = [17, 15, -17, -15];
    var ROOK = [16, 1, -16, -1];
    var ROYAL = [17, 16, 15, 1, -17, -16, -15, -1];

    function sqName(i) { return FILES[i & 15] + ((i >> 4) + 1); }
    function nameSq(s) { return (s.charCodeAt(1) - 49) * 16 + (s.charCodeAt(0) - 97); }
    function isWhite(p) { return p && p === p.toUpperCase(); }
    function colorOf(p) { return isWhite(p) ? "w" : "b"; }
    function typeOf(p) { return p ? p.toLowerCase() : null; }
    function onBoard(i) { return (i & 0x88) === 0; }

    var START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

    function Position(fen) {
      this.board = new Array(128).fill(null);
      this.turn = "w";
      this.castle = { K: false, Q: false, k: false, q: false };
      this.ep = -1;
      this.half = 0;
      this.full = 1;
      this.load(fen || START);
    }

    Position.prototype.load = function (fen) {
      var parts = fen.trim().split(/\s+/);
      this.board = new Array(128).fill(null);
      var rows = parts[0].split("/");
      for (var r = 0; r < 8; r++) {
        var i = (7 - r) * 16, row = rows[r];
        for (var k = 0; k < row.length; k++) {
          var c = row[k];
          if (/[1-8]/.test(c)) i += parseInt(c, 10);
          else { this.board[i] = c; i++; }
        }
      }
      this.turn = parts[1] === "b" ? "b" : "w";
      var cs = parts[2] || "-";
      this.castle = {
        K: cs.indexOf("K") >= 0, Q: cs.indexOf("Q") >= 0,
        k: cs.indexOf("k") >= 0, q: cs.indexOf("q") >= 0
      };
      this.ep = (parts[3] && parts[3] !== "-") ? nameSq(parts[3]) : -1;
      this.half = parseInt(parts[4] || "0", 10);
      this.full = parseInt(parts[5] || "1", 10);
    };

    Position.prototype.clone = function () {
      var p = new Position(START);
      p.board = this.board.slice();
      p.turn = this.turn;
      p.castle = { K: this.castle.K, Q: this.castle.Q, k: this.castle.k, q: this.castle.q };
      p.ep = this.ep; p.half = this.half; p.full = this.full;
      return p;
    };

    Position.prototype.kingSq = function (color) {
      var want = color === "w" ? "K" : "k";
      for (var i = 0; i < 128; i++) {
        if (!onBoard(i)) { i += 7; continue; }
        if (this.board[i] === want) return i;
      }
      return -1;
    };

    /* is square `sq` attacked by side `by` */
    Position.prototype.attacked = function (sq, by) {
      var b = this.board, i, j, d, p;
      /* pawns */
      var pd = by === "w" ? [-17, -15] : [17, 15];
      for (j = 0; j < 2; j++) {
        i = sq + pd[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "p" && colorOf(p) === by) return true; }
      }
      /* knights */
      for (j = 0; j < 8; j++) {
        i = sq + KNIGHT[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "n" && colorOf(p) === by) return true; }
      }
      /* king */
      for (j = 0; j < 8; j++) {
        i = sq + ROYAL[j];
        if (onBoard(i)) { p = b[i]; if (p && typeOf(p) === "k" && colorOf(p) === by) return true; }
      }
      /* sliders */
      function ray(self, dirs, types) {
        for (var m = 0; m < dirs.length; m++) {
          d = dirs[m]; i = sq + d;
          while (onBoard(i)) {
            p = self.board[i];
            if (p) {
              if (colorOf(p) === by && types.indexOf(typeOf(p)) >= 0) return true;
              break;
            }
            i += d;
          }
        }
        return false;
      }
      if (ray(this, BISHOP, ["b", "q"])) return true;
      if (ray(this, ROOK, ["r", "q"])) return true;
      return false;
    };

    Position.prototype.inCheck = function (color) {
      var c = color || this.turn;
      var k = this.kingSq(c);
      if (k < 0) return false;
      return this.attacked(k, c === "w" ? "b" : "w");
    };

    /* pseudo-legal move objects:
     * {from,to,piece,color,captured,promotion,flags} */
    Position.prototype.pseudoMoves = function () {
      var out = [], b = this.board, us = this.turn, them = us === "w" ? "b" : "w";
      var self = this;

      function add(from, to, extra) {
        var m = {
          from: from, to: to,
          piece: typeOf(b[from]), color: us,
          captured: b[to] ? typeOf(b[to]) : null,
          promotion: null, flags: ""
        };
        if (extra) for (var k in extra) m[k] = extra[k];
        if (m.captured) m.flags += "c";
        out.push(m);
      }

      for (var from = 0; from < 128; from++) {
        if (!onBoard(from)) { from += 7; continue; }
        var pc = b[from];
        if (!pc || colorOf(pc) !== us) continue;
        var t = typeOf(pc), to, d, j;

        if (t === "p") {
          var fwd = us === "w" ? 16 : -16;
          var startRank = us === "w" ? 1 : 6;
          var lastRank = us === "w" ? 7 : 0;
          to = from + fwd;
          if (onBoard(to) && !b[to]) {
            if ((to >> 4) === lastRank) {
              ["q", "r", "b", "n"].forEach(function (pr) {
                add(from, to, { promotion: pr, flags: "p" });
              });
            } else {
              add(from, to, {});
              var dbl = from + 2 * fwd;
              if ((from >> 4) === startRank && !b[dbl]) add(from, dbl, { flags: "b" });
            }
          }
          var caps = us === "w" ? [17, 15] : [-17, -15];
          for (j = 0; j < 2; j++) {
            to = from + caps[j];
            if (!onBoard(to)) continue;
            if (b[to] && colorOf(b[to]) === them) {
              if ((to >> 4) === lastRank) {
                ["q", "r", "b", "n"].forEach(function (pr) {
                  add(from, to, { promotion: pr, flags: "p" });
                });
              } else add(from, to, {});
            } else if (to === this.ep) {
              out.push({
                from: from, to: to, piece: "p", color: us,
                captured: "p", promotion: null, flags: "ce"
              });
            }
          }
          continue;
        }

        if (t === "n" || t === "k") {
          var offs = t === "n" ? KNIGHT : ROYAL;
          for (j = 0; j < 8; j++) {
            to = from + offs[j];
            if (!onBoard(to)) continue;
            if (b[to] && colorOf(b[to]) === us) continue;
            add(from, to, {});
          }
          continue;
        }

        var dirs = t === "b" ? BISHOP : t === "r" ? ROOK : ROYAL;
        for (j = 0; j < dirs.length; j++) {
          d = dirs[j]; to = from + d;
          while (onBoard(to)) {
            if (!b[to]) { add(from, to, {}); }
            else {
              if (colorOf(b[to]) === them) add(from, to, {});
              break;
            }
            to += d;
          }
        }
      }

      /* castling */
      var kSq = us === "w" ? nameSq("e1") : nameSq("e8");
      var kRight = us === "w" ? this.castle.K : this.castle.k;
      var qRight = us === "w" ? this.castle.Q : this.castle.q;
      var king = b[kSq];
      if (king && typeOf(king) === "k" && colorOf(king) === us && !this.inCheck(us)) {
        if (kRight && !b[kSq + 1] && !b[kSq + 2] &&
            !this.attacked(kSq + 1, them) && !this.attacked(kSq + 2, them)) {
          out.push({ from: kSq, to: kSq + 2, piece: "k", color: us,
                     captured: null, promotion: null, flags: "k" });
        }
        if (qRight && !b[kSq - 1] && !b[kSq - 2] && !b[kSq - 3] &&
            !this.attacked(kSq - 1, them) && !this.attacked(kSq - 2, them)) {
          out.push({ from: kSq, to: kSq - 2, piece: "k", color: us,
                     captured: null, promotion: null, flags: "q" });
        }
      }
      return out;
    };

    /* mutate in place; assumes move is pseudo-legal for current turn
     */
    Position.prototype.apply = function (m) {
      var b = this.board, us = this.turn;
      b[m.to] = m.promotion ? (us === "w" ? m.promotion.toUpperCase() : m.promotion)
                            : b[m.from];
      b[m.from] = null;

      if (m.flags.indexOf("e") >= 0) {
        b[m.to + (us === "w" ? -16 : 16)] = null;
      }
      if (m.flags.indexOf("k") >= 0) {
        b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null;
      }
      if (m.flags.indexOf("q") >= 0) {
        b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null;
      }

      /* castling rights */
      if (m.piece === "k") {
        if (us === "w") { this.castle.K = this.castle.Q = false; }
        else { this.castle.k = this.castle.q = false; }
      }
      var h1 = nameSq("h1"), a1 = nameSq("a1"), h8 = nameSq("h8"), a8 = nameSq("a8");
      if (m.from === h1 || m.to === h1) this.castle.K = false;
      if (m.from === a1 || m.to === a1) this.castle.Q = false;
      if (m.from === h8 || m.to === h8) this.castle.k = false;
      if (m.from === a8 || m.to === a8) this.castle.q = false;

      /* ep square */
      this.ep = (m.flags.indexOf("b") >= 0)
        ? m.from + (us === "w" ? 16 : -16) : -1;

      this.half = (m.piece === "p" || m.captured) ? 0 : this.half + 1;
      if (us === "b") this.full++;
      this.turn = us === "w" ? "b" : "w";
    };

    Position.prototype.legalMoves = function () {
      var self = this, out = [];
      this.pseudoMoves().forEach(function (m) {
        var p = self.clone();
        p.apply(m);
        if (!p.inCheck(m.color)) out.push(m);
      });
      return out;
    };

    Position.prototype.uciOf = function (m) {
      return sqName(m.from) + sqName(m.to) + (m.promotion || "");
    };

    /* SAN with disambiguation and check/mate suffix */
    Position.prototype.sanOf = function (m, legalList) {
      var legal = legalList || this.legalMoves();
      var san;
      if (m.flags.indexOf("k") >= 0) san = "O-O";
      else if (m.flags.indexOf("q") >= 0) san = "O-O-O";
      else {
        var s = "";
        if (m.piece !== "p") {
          s += m.piece.toUpperCase();
          var same = legal.filter(function (o) {
            return o.piece === m.piece && o.to === m.to && o.from !== m.from;
          });
          if (same.length) {
            var sameFile = same.some(function (o) { return (o.from & 15) === (m.from & 15); });
            var sameRank = same.some(function (o) { return (o.from >> 4) === (m.from >> 4); });
            if (!sameFile) s += FILES[m.from & 15];
            else if (!sameRank) s += String((m.from >> 4) + 1);
            else s += sqName(m.from);
          }
        } else if (m.captured) {
          s += FILES[m.from & 15];
        }
        if (m.captured) s += "x";
        s += sqName(m.to);
        if (m.promotion) s += "=" + m.promotion.toUpperCase();
        san = s;
      }
      var after = this.clone();
      after.apply(m);
      if (after.inCheck(after.turn)) {
        san += after.legalMoves().length ? "+" : "#";
      }
      return san;
    };

    Position.prototype.findUci = function (uci) {
      var moves = this.legalMoves();
      for (var i = 0; i < moves.length; i++) {
        if (this.uciOf(moves[i]) === uci) return moves[i];
      }
      /* lichess sends castling as e1g1; some sources use e1h1
       * (chess960 style) */
      for (i = 0; i < moves.length; i++) {
        var m = moves[i];
        if (m.piece === "k" && m.flags.indexOf("k") >= 0 &&
            uci === sqName(m.from) + sqName(m.to + 1)) return m;
        if (m.piece === "k" && m.flags.indexOf("q") >= 0 &&
            uci === sqName(m.from) + sqName(m.to - 2)) return m;
      }
      return null;
    };

    Position.prototype.applyUci = function (uci) {
      var m = this.findUci(uci);
      if (!m) return null;
      var san = this.sanOf(m);
      this.apply(m);
      return { move: m, san: san };
    };

    Position.prototype.isGameOver = function () {
      return this.legalMoves().length === 0;
    };

    return {
      Position: Position,
      sqName: sqName,
      nameSq: nameSq,
      START: START
    };
  }

  /*======================== 14. CLOCK MODE ========================*/

  // A full-screen, pure black overlay showing only the two
  // clocks, SIDE BY SIDE (v97): yours on the side set by
  // PLAYER_ON_LEFT_OF_CLOCK, theirs on the other, the side
  // to move drawn HEAVIER (weight, not brightness, since
  // v81/v82; red still means under a minute). On an OLED
  // panel black pixels are OFF, so in a dark room the
  // display reduces to two faint numbers — four if
  // CFG.clockShowMoves is on. Everything else — the mic, speech,
  // the game — runs on underneath: this whole section is
  // only a second renderer over state the script already
  // keeps (remainingMs, lastSanW/B, api.pos.turn), and it
  // touches nothing outside itself.
  //
  // Each side's last move sat under its clock from v73 to
  // v92 and is now off by default: the moves are spoken
  // here, so the rows were repeating the ear. See
  // CFG.clockShowMoves in section 1, which restores them.
  //
  // In: the "clock" button, and ONLY the button (v98).
  // Out: tap anywhere on it.
  //
  // A screen wake lock is held while the overlay is up, so
  // the iPad does not sleep into the lock screen mid-game.
  // iOS silently drops the lock whenever the app is
  // backgrounded; the visibilitychange listener retakes it
  // when the page returns. With the screen on, none of the
  // screen-off restrictions (mic restarts, audio loss)
  // apply, so this is also the script's most stable
  // operating state.

  var clockOverlay = null, clockTimer = null, clockLock = null;
  // the message strip (v129): the element, and what it
  // holds - { text, until }. Whether the text outlives
  // `until` is decided at tick time by questionOpen(), not
  // stored, so the strip clears itself the moment a
  // question resolves, whatever path resolved it.
  var clockMsgEl = null, clockMsg = null;
  var clockHalves = null;

  function clockModeOn() {
    return !!(clockOverlay && clockOverlay.style.display !== "none");
  }

  // One number only (v78): ticking seconds drew the eye,
  // so above a minute just the whole minutes remain,
  // changing once a minute — and under a minute the number
  // becomes the seconds and the number turns red
  // (LOW_TIME_COLOR). The spoken "clock" still gives
  // minutes and seconds exactly.
  function clockDigits(ms) {
    if (ms == null) return "--";
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000);
    if (s < 60) return String(s);
    return String(Math.floor(s / 60));
  }

  function buildClockOverlay() {
    clockOverlay = document.createElement("div");
    clockOverlay.style.cssText =
      "position:fixed;inset:0;z-index:100000;background:#000;" +
      "display:flex;flex-direction:row;touch-action:none;" +
      "-webkit-user-select:none;user-select:none;cursor:default;";
    clockHalves = {};
    // the halves are LEFT and RIGHT (v97). Which one is
    // yours is PLAYER_ON_LEFT_OF_CLOCK, read at paint time,
    // so "flip clock" is a repaint and never a rebuild.
    ["left", "right"].forEach(function (k) {
      var half = document.createElement("div");
      half.style.cssText =
        "flex:1;display:flex;flex-direction:column;" +
        "align-items:center;justify-content:center;";
      // weight is set by paintClockHalf every tick (v81:
      // it is the turn signal), so the value here is only
      // what shows for the instant before the first paint
      var time = document.createElement("div");
      time.style.cssText =
        "font-family:system-ui,sans-serif;font-weight:" +
        IDLE_WEIGHT + ";white-space:nowrap;" +
        "line-height:1;font-size:" +
        (CFG.clockShowMoves ? CLOCK_TIME_SIZE : bareDigitSizeCss()) +
        ";font-variant-numeric:tabular-nums;";
      half.appendChild(time);
      // with CFG.clockShowMoves off there is no move row at
      // all: not hidden, never built, so nothing downstream
      // can paint or size it. paintClockHalf tests h.move.
      var move = null;
      if (CFG.clockShowMoves) {
        move = document.createElement("div");
        move.style.cssText =
          "font-family:system-ui,sans-serif;font-weight:" +
          MOVE_WEIGHT + ";white-space:nowrap;" +
          "font-size:" + moveSizeCss("", CLOCK_MOVE_MAX_VW,
            CLOCK_MOVE_MAX_VH, CLOCK_MOVE_BUDGET_VW) +
          ";margin-top:2.5vh;" +
          "letter-spacing:.04em;";
        half.appendChild(move);
      }
      clockOverlay.appendChild(half);
      clockHalves[k] = { time: time, move: move, col: null, wt: null };
    });
    // THE MESSAGE STRIP (v129). Built ALWAYS, even with
    // clockShowMessages off: an empty div costs nothing,
    // and the toggle then gates only the WRITING, in
    // speak(), so it needs none of the teardown-for-
    // rebuild that clockShowMoves pays. Absolute at the
    // foot, so the centred halves never move when it
    // fills.
    clockMsgEl = document.createElement("div");
    clockMsgEl.style.cssText =
      "position:absolute;left:4vw;right:4vw;bottom:2vh;" +
      "text-align:center;font-family:system-ui,sans-serif;" +
      "font-weight:" + MOVE_WEIGHT + ";color:" + TEXT_COLOR + ";" +
      "font-size:" + CLOCK_MSG_SIZE + ";line-height:1.3;";
    clockOverlay.appendChild(clockMsgEl);
    clockOverlay.addEventListener("click", function () {
      exitClockMode(true);
    });
    document.body.appendChild(clockOverlay);
  }

  // The size the bare digits may have, for the widest
  // reading seen so far this session (v97). Monotonic: the
  // count only ever grows, so a game that ticks 100 -> 99
  // does not resize back up and the number never moves
  // under the eye while it is being read.
  var clockDigitsSeen = 2;

  function bareDigitSizeCss() {
    var vw = CLOCK_BARE_BUDGET_VW / (clockDigitsSeen * CLOCK_DIGIT_EM);
    return "min(" + vw.toFixed(2) + "vw," + CLOCK_BARE_MAX_VH + "vh)";
  }

  // Called with every reading painted. Returns true if the
  // size changed and the halves need restyling.
  function noteClockDigits(text) {
    var n = String(text).length;
    if (n <= clockDigitsSeen) return false;
    clockDigitsSeen = n;
    log("CLK", "digits grew to " + n + ", resizing");
    return true;
  }

  // The size a move of this length can have: as large as
  // the ceiling allows, shrunk only enough that its own
  // characters fit the budget (v84). Returns a CSS value;
  // the vh cap stays inside the min() so a tall-and-narrow
  // window cannot push the text past its row.
  function moveSizeCss(text, maxVw, maxVh, budgetVw) {
    var n = Math.max(1, String(text || "").length);
    var vw = Math.min(maxVw, budgetVw / (n * MOVE_CHAR_EM));
    return "min(" + vw.toFixed(2) + "vw," + maxVh + "vh)";
  }

  function paintClockHalf(h, color) {
    var ms = remainingMs(color);
    var digits = clockDigits(ms);
    var active = api.pos && !api.over && api.pos.turn === color;
    // one color for everything (v82); red is the only
    // exception and means "under a minute". The turn is
    // carried by weight alone, so low-and-waiting reads
    // both facts at once.
    var col = ms != null && ms < 60000 ? LOW_TIME_COLOR : TEXT_COLOR;
    // the clock alone carries the turn (v88)
    var wt = active ? ACTIVE_WEIGHT : IDLE_WEIGHT;
    if (h.time.textContent !== digits) {
      h.time.textContent = digits;
      if (!CFG.clockShowMoves && noteClockDigits(digits)) {
        var css = bareDigitSizeCss();
        clockHalves.left.time.style.fontSize = css;
        clockHalves.right.time.style.fontSize = css;
      }
    }
    if (h.move) {
      var mv = (color === "w" ? api.lastSanW : api.lastSanB) || "\u2014";
      if (h.move.textContent !== mv) {
        h.move.textContent = mv;
        h.move.style.fontSize = moveSizeCss(mv, CLOCK_MOVE_MAX_VW,
          CLOCK_MOVE_MAX_VH, CLOCK_MOVE_BUDGET_VW);
      }
    }
    if (h.col !== col) {
      h.col = col;
      h.time.style.color = col;
      if (h.move) h.move.style.color = col;
    }
    if (h.wt !== wt) {
      h.wt = wt;
      h.time.style.fontWeight = wt;
    }
  }

  // Is anything waiting on an answer? The three dialogue
  // states, read live. This is the whole of the sticky
  // rule: no message is classified, the board state is.
  function questionOpen() {
    return !!(pending || confirmAction || pieceAsk);
  }

  // SPOKEN TEXT IS WRITTEN FOR THE EAR (v134): lower case
  // throughout, colors and pieces included, because that is
  // what reads naturally out of a TTS engine and because
  // every string was written when speech was the only
  // output. On the strip it looks unfinished - "checkmate.
  // white wins." - so the first letter of each sentence is
  // raised HERE, at the one point where text becomes
  // pixels. Nothing upstream changes: the voice, the log
  // and the source strings all stay as they are, and the
  // strip cannot drift from them because it has no strings
  // of its own.
  //
  // Sentence = start of text, or a . ? ! followed by space.
  // Nothing spoken contains a decimal or an abbreviation
  // (times are "3 minutes 20 seconds"), so there is no
  // false boundary to guard against.
  function sentenceCase(text) {
    return String(text).replace(/(^\s*|[.?!]\s+)([a-z])/g,
      function (all, lead, ch) { return lead + ch.toUpperCase(); });
  }

  function showClockMessage(text) {
    var shown = sentenceCase(text);
    clockMsg = { text: shown, until: Date.now() + CLOCK_MSG_EXPIRE_MS };
    if (clockMsgEl) clockMsgEl.textContent = shown;
  }

  function clearClockMessage() {
    clockMsg = null;
    if (clockMsgEl) clockMsgEl.textContent = "";
  }

  // Called every overlay tick. A question holds the strip
  // for as long as it is open (v81-v88: passing messages
  // expire while questions stay); everything else fades
  // once CLOCK_MSG_EXPIRE_MS is up.
  function tickClockMessage() {
    if (!clockMsg) return;
    if (questionOpen()) return;
    if (Date.now() < clockMsg.until) return;
    clearClockMessage();
  }

  function renderClockMode() {
    if (!clockHalves) return;
    tickClockMessage();
    var mine = api.myColor || "w";
    var theirs = mine === "w" ? "b" : "w";
    var myHalf = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
    var oppHalf = PLAYER_ON_LEFT_OF_CLOCK ? "right" : "left";
    paintClockHalf(clockHalves[myHalf], mine);
    paintClockHalf(clockHalves[oppHalf], theirs);
  }

  // "flip clock" swaps the sides. Nothing is rebuilt: the
  // next tick paints the other way round, within
  // OVERLAY_TICK_MS, so the overlay is never disturbed —
  // which matters, because it cannot be retaken without
  // another tap. CONFIRMED in use.
  function flipClockSides() {
    PLAYER_ON_LEFT_OF_CLOCK = !PLAYER_ON_LEFT_OF_CLOCK;
    var side = PLAYER_ON_LEFT_OF_CLOCK ? "left" : "right";
    log("CLK", "my clock now on the " + side);
    renderClockMode();
  }

  function acquireClockLock() {
    try {
      if (!navigator.wakeLock || !navigator.wakeLock.request) {
        log("CLK", "wake lock unsupported");
        return;
      }
      navigator.wakeLock.request("screen").then(function (lock) {
        clockLock = lock;
        log("CLK", "wake lock held");
      }).catch(function (e) {
        log("CLK", "wake lock refused: " + e.message);
      });
    } catch (e) { log("CLK", "wake lock error: " + e.message); }
  }

  function releaseClockLock() {
    try { if (clockLock) clockLock.release(); } catch (e) {}
    clockLock = null;
  }

  document.addEventListener("visibilitychange", function () {
    if (clockModeOn() && document.visibilityState === "visible") {
      acquireClockLock();
    }
  });

  // NO FULLSCREEN (v108). The overlay fills the viewport
  // under Safari's toolbar. It used to request fullscreen
  // for a black edge-to-edge screen, and the price was the
  // layout-viewport corruption in the header tombstone —
  // paid on every EXIT, curable only by force-quitting
  // Safari. Losing the toolbar's strip of screen is the
  // cheaper trade. Tapping the overlay exits.
  function enterClockMode() {
    if (!clockOverlay) buildClockOverlay();
    // whatever the strip held last time is stale now
    clearClockMessage();
    clockOverlay.style.display = "flex";
    renderClockMode();
    clearInterval(clockTimer);
    clockTimer = setInterval(renderClockMode, OVERLAY_TICK_MS);
    acquireClockLock();
    renderButton();
    if (setPanel) setPanel.style.display = "none";
    log("CLK", "clock mode on");
  }

  function exitClockMode(byTap) {
    if (!clockModeOn()) return;
    clockOverlay.style.display = "none";
    clearInterval(clockTimer);
    clockTimer = null;
    releaseClockLock();
    renderButton();
    log("CLK", "clock mode off" + (byTap ? " (tap)" : ""));
  }

  function toggleClockMode() {
    if (clockModeOn()) exitClockMode(false);
    else enterClockMode();
  }

  /*=========================== 15. BOOT ===========================*/

  var booted = false, lastPath = "";

  /* The ONLY DOM dependency left. Any one of these means "a game is
   * on screen". Several are tried because Lichess changes markup, and
   * because phone/tablet layouts and zen mode render different
   * subsets. Zen mode hides things with CSS, so the elements still
   * exist either way. */
  var PAGE_MARKERS = [".round__app", "main.round", "cg-board", ".cg-wrap",
                      "#main-wrap .round", "main .rclock"];

  function gamePageMarker() {
    for (var i = 0; i < PAGE_MARKERS.length; i++) {
      if (document.querySelector(PAGE_MARKERS[i])) return PAGE_MARKERS[i];
    }
    return null;
  }

  function tick() {
    var path = location.pathname;
    var isGame = !!gameIdFromUrl() && !!gamePageMarker();
    if (isGame && !booted) {
      booted = true;
      lastPath = path;
      buildUI();
      log("UI", "game page detected via " + gamePageMarker());
    } else if (isGame && booted && path !== lastPath) {
      lastPath = path;
      log("UI", "navigated to " + path);
      api.myColor = null; api.pos = null; api.moves = []; api.over = false;
      if (running) connect();
    } else if (!isGame && booted) {
      booted = false;
      running = false;
      // the overlay is position:fixed over everything, so
      // leaving the game page with it up left a black
      // screen on whatever came next, with the wake lock
      // still held. Exiting here takes both down; byTap
      // is passed so nothing is spoken about it.
      exitClockMode(true);
      pauseMic();
      stopKeepAlive();
      clearInterval(pollTimer);
      try { if (streamAbort) streamAbort.abort(); } catch (e) {}
      var ui = document.getElementById("voicemove-ui");
      if (ui) ui.remove();
      if (logPanel) logPanel.remove();
      logBody = null;
    }
  }

  var mo = new MutationObserver(function () { tick(); });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 1000);
  tick();
  // Every switch, one line, at load (v135): the log records
  // FLIPS but never recorded the starting state, so a dump
  // reader had to guess six of the eight switches. Written
  // at boot, not in loadSettings: log() lives in section 2
  // and its buffer does not exist yet when CFG is built.
  function settingsSummary() {
    return Object.keys(CFG).map(function (k) {
      return k + "=" + (CFG[k] ? "on" : "off");
    }).join(" ") + (VOICE_NAME ? " voice=" + VOICE_NAME : " voice=system");
  }

  log("UI", "script loaded " + VERSION);
  log("SET", "loaded: " + settingsSummary());
  loadStoredToken();

})();
