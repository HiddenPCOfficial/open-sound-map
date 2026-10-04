type PlaybackContext = Pick<AudioContext, 'resume' | 'state'>;
type PlaybackNavigator = { audioSession?: { type: string } };

export function unlockAudioContext(context: AudioContext): void {
  // Start a source inside the tap as well as resuming the context. Safari can
  // require this before it accepts sources scheduled by subsequent live events.
  const source = context.createBufferSource();
  source.buffer = context.createBuffer(1, 1, context.sampleRate);
  source.connect(context.destination);
  source.onended = () => source.disconnect();
  source.start();
}

export async function resumePlayback(
  contexts: PlaybackContext[],
  browser: Navigator | PlaybackNavigator,
  timeoutMs = 5000,
): Promise<void> {
  // Safari exposes this API to distinguish music playback from ambient audio.
  // Older browsers can still resume their contexts without it.
  try {
    const session = (browser as PlaybackNavigator).audioSession;
    if (session) session.type = 'playback';
  } catch { /* An optional session API must not prevent playback. */ }
  // Start every context in the original tap, before yielding to a promise.
  const resumes = Promise.all(contexts.map(context => context.resume()));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      resumes,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Audio activation timed out')), timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
  if (contexts.some(context => context.state !== 'running')) {
    throw new Error('Audio playback is suspended');
  }
}
