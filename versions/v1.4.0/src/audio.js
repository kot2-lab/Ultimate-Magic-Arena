export class Soundscape {
  constructor() {
    this.context = null;
    this.master = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.timer = null;
    this.step = 0;
    this.bgmVolume = 0.22;
    this.sfxVolume = 0.45;
    this.enabled = true;
  }

  unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.bgmGain = this.context.createGain();
      this.sfxGain = this.context.createGain();
      this.bgmGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.context.destination);
      this.setVolumes(this.bgmVolume, this.sfxVolume);
    }
    if (this.context.state === "suspended") this.context.resume();
    this.startMusic();
  }

  setVolumes(bgm, sfx) {
    this.bgmVolume = Number(bgm);
    this.sfxVolume = Number(sfx);
    if (!this.context) return;
    this.bgmGain.gain.setTargetAtTime(this.enabled ? this.bgmVolume : 0, this.context.currentTime, 0.08);
    this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.context.currentTime, 0.08);
  }

  toggle(enabled) {
    this.enabled = enabled;
    if (this.bgmGain && this.context) this.bgmGain.gain.setTargetAtTime(enabled ? this.bgmVolume : 0, this.context.currentTime, 0.08);
  }

  startMusic() {
    if (!this.context || this.timer) return;
    const notes = [220, 261.63, 329.63, 392, 329.63, 293.66, 261.63, 196];
    this.timer = window.setInterval(() => {
      if (!this.context || !this.enabled || this.bgmVolume <= 0.005) return;
      const now = this.context.currentTime;
      const frequency = notes[this.step % notes.length];
      this.playTone(frequency, now, 1.8, "sine", 0.08, this.bgmGain);
      if (this.step % 2 === 0) this.playTone(frequency / 2, now, 2.1, "triangle", 0.035, this.bgmGain);
      this.step += 1;
    }, 1800);
  }

  playTone(frequency, start, duration, wave, volume, output) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  effect(kind = "select") {
    if (!this.context || !this.enabled || this.sfxVolume <= 0.001) return;
    const now = this.context.currentTime;
    const tones = { select: [480, 640], magic: [270, 720], hit: [150, 90], heal: [420, 680], level: [392, 587, 784], victory: [523, 659, 784], defeat: [294, 220, 164] };
    const sequence = tones[kind] || tones.select;
    sequence.forEach((frequency, index) => this.playTone(frequency, now + index * 0.09, kind === "select" ? 0.12 : 0.24, "sine", 0.14, this.sfxGain));
  }

  close() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    this.context?.close();
    this.context = null;
  }
}
