// Placeholder; replaced by the generative soundtrack.
export class Soundtrack {
  constructor(tl) {
    this.tl = tl;
    this.muted = false;
  }
  play() {}
  pause() {}
  setMuted(m) {
    this.muted = m;
  }
  async renderOffline() {
    return null;
  }
}
