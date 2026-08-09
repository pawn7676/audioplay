  /*============================ CHIMES ============================*/

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
  // WAV was unrelated and outlived them by design - it held
  // the iOS audio session, it was not a chime - until w90
  // removed it too, for its own reasons (see the keep-alive
  // tombstone in header.js).

  // REOPENED AT w108, CLOSED AGAIN AT w112, and the second
  // closing is the one that settles it. The new evidence
  // the tombstone demanded arrived: screen-off play died at
  // w90 (taking the WebAudio killer with it), the session
  // is declared play-and-record (w91), and one WebAudio
  // chime returned in the narrowest spot - confirming a
  // move the user had just heard read aloud as a question
  // and answered "yes". IT WORKED. The owner's 9 Aug
  // practice log shows the context created, every chime
  // scheduled, every chime HEARD - the audibility question
  // that killed v67 came back answered yes.
  //
  // And the owner removed it anyway, four versions later,
  // for a reason no platform fix can ever reach: A CHIME
  // ONLY SAYS A MOVE WAS MADE. IT CANNOT SAY WHICH. The
  // confirmation this program owes an eyes-free user is
  // WHAT Lichess now believes the move to be, and one bit
  // of tone cannot carry that; only speech can. The same
  // verdict had already ended the "ok." era (v68->v70:
  // "confirmation must carry information to earn its
  // airtime") and the chime was "ok." with better
  // manners. The yes-answered question - the one moment a
  // chime seemed justified because the move had just been
  // spoken - turned out to be rare in real games once moves
  // are spoken cleanly, so the seat the chime held was
  // small, and what sat in it carried nothing.
  //
  // So the closed case now holds at BOTH ends: media
  // elements cannot be trusted to sound (v67, reproven
  // w88-w90), and a sound that plays reliably still cannot
  // do this program's confirming (w112). Every accepted
  // move is read back in full, questioned or not, while
  // confirmMine is on. Do not propose chimes again on
  // audibility grounds - audibility was achieved and it
  // did not matter. The w108-w111 implementation (context
  // priming in the gesture handlers, the state check, the
  // spoken fallback) is in git if a future signal is ever
  // found that genuinely carries no information - and the
  // lesson of this file is that no confirmation qualifies.
