type PlaybackContext = Pick<AudioContext, 'resume' | 'state'>;
type PlaybackNavigator = { audioSession?: { type: string } };

export async function resumePlayback(
  contexts: PlaybackContext[],
  browser: Navigator | PlaybackNavigator,
): Promise<void> {
  // Safari exposes this API to distinguish music playback from ambient audio.
  // Older browsers can still resume their contexts without it.
  try {
    const session = (browser as PlaybackNavigator).audioSession;
    if (session) session.type = 'playback';
  } catch { /* An optional session API must not prevent playback. */ }
  // Start every context in the original tap, before yielding to a promise.
  await Promise.all(contexts.map(context => context.resume()));
  if (contexts.some(context => context.state !== 'running')) {
    throw new Error('Audio playback is suspended');
  }
}
