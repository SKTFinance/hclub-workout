let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
}

export function playBeep(frequency: number = 800, duration: number = 150, volume: number = 0.3) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gainNode.gain.value = volume;

    // Fade out to avoid clicks
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration / 1000);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration / 1000);
  } catch {
    // Audio not available
  }
}

export function playCountdownBeep() {
  playBeep(600, 100, 0.3);
}

export function playPowerTimerBeep() {
  playBeep(900, 200, 0.5);
}

export function playGoSound() {
  try {
    const ctx = getAudioContext();

    // Play a rising two-tone "GO" sound
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const gain2 = ctx.createGain();

    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.frequency.value = 800;
    osc1.type = 'square';
    gain1.gain.value = 0.3;
    gain1.gain.setValueAtTime(0.3, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);

    osc2.frequency.value = 1200;
    osc2.type = 'square';
    gain2.gain.value = 0;
    gain2.gain.setValueAtTime(0.001, ctx.currentTime + 0.15);
    gain2.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + 0.3);
    osc2.start(ctx.currentTime + 0.15);
    osc2.stop(ctx.currentTime + 0.5);
  } catch {
    // Audio not available
  }
}

export function playPhaseEndSound() {
  playBeep(1000, 300, 0.4);
}

export function playRoundEndSound() {
  // Triple beep
  playBeep(800, 150, 0.4);
  setTimeout(() => playBeep(800, 150, 0.4), 200);
  setTimeout(() => playBeep(1000, 300, 0.5), 400);
}
