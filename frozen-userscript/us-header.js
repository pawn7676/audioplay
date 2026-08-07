/*  READ THIS FIRST: THIS FILE IS HISTORY, NOT AUTHORITY.
 *
 *  It is the FROZEN v137 userscript's front door. It was
 *  binding reading for the website too, and by
 *  then it was describing a project that no longer exists.
 *  Its "section N" pointers name files that were renamed
 *  away, and its testing note ("there is no stored test
 *  suite ... do not ask the user to update tests") would
 *  talk a reader straight out of the harness, the property
 *  check and the perft that guard every push here.
 *
 *  Everything still binding moved into src/: the
 *  constraints, the platform findings and the closed cases
 *  into src/header.js, the spoken grammar into
 *  src/parsing.js. What remains below is TRUE OF THE
 *  ARTIFACT beside it and of nothing else - its setup
 *  notes, its layout, and the v-series history, which is
 *  the reason to come here at all.
 *
 *  READ IT FOR WHY SOMETHING HAPPENED. Never for what to
 *  do now. src/header.js is the header of record.
 *
 *  Nothing below is edited: the artifact's own sha is
 *  guarded by test_harness.js, and its header should keep
 *  saying what it said when the code froze.
 */
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
   *    analysis assistance. The usual word for a program
   *    that CHOOSES moves is deliberately absent; it is
   *    called RULES. Section 13
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

