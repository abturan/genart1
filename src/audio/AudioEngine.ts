// src/audio/AudioEngine.ts
export type AudioControls = { fx:number; fy:number; approach:number; activity:number; mode:number };
export type AudioTraits = { seed:string; edition:number; palette:string[]; algorithm:string };

// --- PRNG (cyrb128 + sfc32), NFT ile deterministik ses ---
function cyrb128(str: string) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0, k; i < str.length; i++) {
    k = str.charCodeAt(i);
    h1 = (h2 ^ Math.imul(h1 ^ k, 597399067)) >>> 0;
    h2 = (h3 ^ Math.imul(h2 ^ k, 2869860233)) >>> 0;
    h3 = (h4 ^ Math.imul(h3 ^ k, 951274213)) >>> 0;
    h4 = (h1 ^ Math.imul(h4 ^ k, 2716044179)) >>> 0;
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067) >>> 0;
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233) >>> 0;
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213) >>> 0;
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179) >>> 0;
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, h1, h2, h3];
}
function sfc32(a: number, b: number, c: number, d: number) {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    t = (t + d) | 0;
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}
function makeRng(seed: string) {
  const s = cyrb128(seed);
  return sfc32(s[0], s[1], s[2], s[3]);
}

function clamp(x:number, a:number, b:number){ return Math.min(b, Math.max(a, x)); }
function lerp(a:number,b:number,t:number){ return a+(b-a)*t; }

// --- Euclid ritim üretici (Bjorklund) ---
function euclid(k:number, n:number, rot=0){
  k = Math.max(0, Math.min(k, n));
  let pattern = [] as number[];
  let counts:number[] = [];
  let remainders:number[] = [];
  let divisor = n - k;
  remainders.push(k);
  let level = 0;
  while (true) {
    counts.push(Math.floor(divisor / remainders[level]));
    remainders.push(divisor % remainders[level]);
    divisor = remainders[level];
    level += 1;
    if (remainders[level] <= 1) break;
  }
  counts.push(divisor);
  function build(level:number): number[] {
    if (level === -1) return [0];
    if (level === -2) return [1];
    let seq:number[] = [];
    for (let i=0; i<counts[level]; i++) seq = seq.concat(build(level-1));
    if (remainders[level] !== 0) seq = seq.concat(build(level-2));
    return seq;
  }
  pattern = build(level);
  // rotate
  rot = ((rot % n) + n) % n;
  pattern = pattern.slice(rot).concat(pattern.slice(0, rot));
  return pattern.map(x=> x?1:0);
}

// --- Skala/nota yardımcıları ---
const SCALES:number[][] = [
  // Phrygian, Locrian, Whole, Dorian, Harmonic minor, Octatonic
  [0,1,3,5,7,8,10], [0,1,3,5,6,8,10], [0,2,4,6,8,10], [0,2,3,5,7,9,10],
  [0,2,3,5,7,8,11], [0,2,3,5,6,8,9,11]
];

export default class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  convolver: ConvolverNode; revGain: GainNode;
  delay: DelayNode; delayGain: GainNode;
  panHats: StereoPannerNode; panArp: StereoPannerNode;
  rng: ()=>number = Math.random;
  running=false; nextNoteTime=0; beat=0;
  lookahead=0.025; scheduleAheadTime=0.15;
  bpm=110; swing=0;
  vol=0.8;

  // pattern uzunlukları (polimetri)
  Lk=15; Ls=12; Lh=17; La=14; Lb=13; Lp=16;
  // yoğunluklar
  denKick=5; denSnare=4; denHat=9; denArp=6; denBass=6; denClaps=3;

  // deterministik skala/perde
  baseNote=36; // C2
  scale:number[] = SCALES[0];

  // cached
  noiseBuf: AudioBuffer | null = null;

  traits: AudioTraits = { seed:"", edition:0, palette:[], algorithm:"" };

  constructor(seed:string){
    const AC:any = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC();
    this.ctx.suspend();

    this.master = this.ctx.createGain(); this.master.gain.value = this.vol;
    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18; this.comp.knee.value = 12; this.comp.ratio.value = 2.5;
    this.comp.attack.value = 0.005; this.comp.release.value = 0.2;

    this.convolver = this.ctx.createConvolver(); this.revGain = this.ctx.createGain(); this.revGain.gain.value = 0.18;
    this.convolver.buffer = this.makeImpulse(2.6, 2.0);
    this.delay = this.ctx.createDelay(1.0); this.delay.delayTime.value = 0.27;
    this.delayGain = this.ctx.createGain(); this.delayGain.gain.value = 0.16;

    this.panHats = this.ctx.createStereoPanner(); this.panArp = this.ctx.createStereoPanner();

    // routing
    this.master.connect(this.delay); this.delay.connect(this.delayGain); this.delayGain.connect(this.comp);
    this.master.connect(this.convolver); this.convolver.connect(this.revGain); this.revGain.connect(this.comp);
    this.master.connect(this.comp);
    this.comp.connect(this.ctx.destination);

    this.setSeed(seed);
  }

  setSeed(seed:string){
    this.rng = makeRng(seed);
    // Polimetri uzunluklarını ve yoğunlukları seed'e göre seç
    const primes = [13,15,17,19];
    this.Lk = primes[Math.floor(this.rng()*primes.length)];
    this.Ls = [12,14,16][Math.floor(this.rng()*3)];
    this.Lh = primes[Math.floor(this.rng()*primes.length)];
    this.La = [10,11,14,18][Math.floor(this.rng()*4)];
    this.Lb = primes[Math.floor(this.rng()*primes.length)];
    this.Lp = 16;

    this.denKick = 4 + Math.floor(this.rng()*4);
    this.denSnare = 3 + Math.floor(this.rng()*4);
    this.denHat = 8 + Math.floor(this.rng()*6);
    this.denArp = 5 + Math.floor(this.rng()*6);
    this.denBass = 4 + Math.floor(this.rng()*5);
    this.denClaps = 2 + Math.floor(this.rng()*3);

    this.scale = SCALES[Math.floor(this.rng()*SCALES.length)];
    this.baseNote = 32 + Math.floor(this.rng()*8); // C1..G1
  }

  setTraits(t:AudioTraits){
    this.traits = t;
    // palete göre reverb/delay tadı
    const hueBias = t.palette.length ? this.hexToHue(t.palette[0]) : 0.5;
    this.revGain.gain.value = lerp(0.12, 0.28, hueBias);
    this.delay.delayTime.value = lerp(0.18, 0.38, 1.0-hueBias);
  }

  setVolume(v:number){ this.vol = v; if (this.master) this.master.gain.value = v; }

  async start(){
    if (this.running) return;
    this.running = true;
    await this.ctx.resume();
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.beat = 0;
    const tick = () => this.scheduler();
    (this as any)._int = window.setInterval(tick, this.lookahead*1000);
  }
  stop(){
    if (!this.running) return;
    this.running = false;
    if ((this as any)._int) window.clearInterval((this as any)._int);
    this.ctx.suspend();
  }

  updateControls(c:AudioControls){
    const tgtBpm = 90 + c.activity*70 + Math.abs(c.fx)*10 + Math.abs(c.fy)*6;
    this.bpm = lerp(this.bpm, clamp(tgtBpm, 70, 180), 0.08);
    this.swing = lerp(this.swing, clamp(c.fy*0.12, -0.15, 0.15), 0.05);

    // Yoğunluk & tını
    const k = clamp(c.activity, 0, 1);
    this.denHat = Math.round(8 + k*8);
    this.denSnare = Math.round(3 + k*5);
    this.revGain.gain.setTargetAtTime(lerp(0.1, 0.3, clamp(c.approach*0.5+0.5,0,1)), this.ctx.currentTime, 0.25);
    this.delayGain.gain.setTargetAtTime(lerp(0.08, 0.22, Math.abs(c.fx)), this.ctx.currentTime, 0.25);
    this.panHats.pan.setTargetAtTime(clamp(c.fx, -1, 1), this.ctx.currentTime, 0.1);
    this.panArp.pan.setTargetAtTime(clamp(c.fy, -1, 1), this.ctx.currentTime, 0.1);
  }

  scheduler(){
    const cur = this.ctx.currentTime;
    const secPerBeat = 60 / this.bpm; // beat=çeyrek
    while (this.nextNoteTime < cur + this.scheduleAheadTime) {
      // 16'lık çözünürlük; swing 8'likte
      let t = this.nextNoteTime;
      const step16 = this.beat % 2 === 1 ? this.swing*secPerBeat*0.5 : 0;
      t += step16;

      this.scheduleStep(this.beat, t);

      this.nextNoteTime += 0.25 * secPerBeat; // 16'lık
      this.beat = (this.beat + 1) % 4096;
    }
  }

  // === Ses üretimi ===
  scheduleStep(beat:number, time:number){
    const kStep = beat % this.Lk;
    const sStep = beat % this.Ls;
    const hStep = beat % this.Lh;
    const aStep = beat % this.La;
    const bStep = beat % this.Lb;
    const pStep = beat % this.Lp;

    // Euclid kalıplar + olasılık kapıları
    if (euclid(this.denKick, this.Lk, 0)[kStep]) this.trigKick(time, 0.9 + 0.2*this.rng());
    if (euclid(this.denSnare, this.Ls, 3)[sStep] && this.rng() < 0.95) this.trigSnare(time, 1800 + 800*this.rng());
    if (euclid(this.denHat, this.Lh, 2)[hStep]) this.trigHat(time, 0.25 + 0.1*this.rng());

    // Clap/snap araya serpiştir
    if (euclid(this.denClaps, this.Ls, 1)[sStep] && this.rng() < 0.35) this.trigClap(time + 0.002, 0.18);

    // FM bas (polimetri, düşük olasılık varyasyon)
    if (euclid(this.denBass, this.Lb, 0)[bStep] && this.rng() < 0.85) {
      const deg = this.scale[(bStep + Math.floor(this.rng()*3)) % this.scale.length];
      const note = this.baseNote + deg + (this.rng()<0.2?12:0);
      this.trigFMBass(time, this.mtof(note), 0.35);
    }

    // Arp + pad (yüzen yapı)
    if (euclid(this.denArp, this.La, 0)[aStep] && this.rng() < 0.9) {
      const deg = this.scale[(aStep*2 + Math.floor(this.rng()*2)) % this.scale.length];
      const note = this.baseNote + 12 + deg + (this.rng()<0.3?12:0);
      this.trigArp(time, this.mtof(note), 0.18);
    }
    if (pStep % 8 === 0 && this.rng() < 0.6) {
      const deg = this.scale[(pStep/2 + 1) % this.scale.length];
      this.trigPad(time, this.mtof(this.baseNote + 24 + deg), 0.5 + 0.2*this.rng());
    }
  }

  trigKick(t:number, amp:number){
    const o = this.ctx.createOscillator(); o.type = 'sine';
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t+0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.25);
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(42, t+0.12);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t+0.3);
  }

  trigSnare(t:number, freq:number){
    const src = this.noise(); const bp = this.ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.setValueAtTime(freq, t); bp.Q.value = 1.2;
    const hp = this.ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.setValueAtTime(700, t);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t+0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.16);
    src.connect(bp); bp.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t+0.18);
  }

  trigHat(t:number, amp:number){
    const src = this.noise(); const hp = this.ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 6000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t+0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.06);
    const sh = this.ctx.createWaveShaper(); sh.curve = this.shaperCurve(0.6);
    src.connect(hp); hp.connect(sh); sh.connect(g); g.connect(this.panHats); this.panHats.connect(this.master);
    src.start(t); src.stop(t+0.08);
  }

  trigClap(t:number, amp:number){
    const s1 = this.noise(); const s2 = this.noise();
    const hp = this.ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 1000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t+0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.15);
    s1.connect(hp); s2.connect(hp); hp.connect(g); g.connect(this.master);
    s1.start(t); s2.start(t+0.02);
    s1.stop(t+0.16); s2.stop(t+0.18);
  }

  trigFMBass(t:number, freq:number, amp:number){
    const car = this.ctx.createOscillator(); car.type='sine';
    const mod = this.ctx.createOscillator(); mod.type='sine';
    const modGain = this.ctx.createGain();
    const g = this.ctx.createGain(); g.gain.value = 0;

    car.frequency.setValueAtTime(freq, t);
    mod.frequency.setValueAtTime(freq*2, t);
    modGain.gain.setValueAtTime(freq*0.6, t); // mod index
    mod.connect(modGain); modGain.connect((car as any).frequency);

    const lp = this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.setValueAtTime(Math.min(4000, freq*6), t); lp.Q.value=0.5;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.35);

    car.connect(lp); lp.connect(g); g.connect(this.master);
    car.start(t); mod.start(t);
    car.stop(t+0.5); mod.stop(t+0.5);
  }

  trigArp(t:number, freq:number, amp:number){
    const o = this.ctx.createOscillator(); o.type='triangle';
    const g = this.ctx.createGain();
    const hp = this.ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=200;
    const lp = this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=4000;

    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t+0.18);

    o.connect(hp); hp.connect(lp); lp.connect(g); g.connect(this.panArp); this.panArp.connect(this.master);
    o.start(t); o.stop(t+0.22);
  }

  trigPad(t:number, freq:number, amp:number){
    const voices = 3;
    for (let i=0;i<voices;i++){
      const o = this.ctx.createOscillator(); o.type = (i%2? 'sawtooth':'triangle');
      const g = this.ctx.createGain(); const lp = this.ctx.createBiquadFilter(); lp.type='lowpass'; lp.Q.value=0.7;
      const det = (i-1)*0.6 + (this.rng()-0.5)*0.2;
      o.frequency.setValueAtTime(freq*(1 + det*0.003), t);
      lp.frequency.setValueAtTime(2200, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(amp/voices, t+0.08);
      g.gain.linearRampToValueAtTime(0.0001, t+0.9);
      o.connect(lp); lp.connect(g); g.connect(this.master);
      o.start(t); o.stop(t+1.0);
    }
  }

  noise(){
    if (!this.noiseBuf){
      const len = this.ctx.sampleRate * 1.0;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i=0;i<len;i++) d[i] = Math.random()*2-1;
      this.noiseBuf = buf;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf!;
    return src;
  }

  makeImpulse(lenSec:number, decay:number){
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate*lenSec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch=0; ch<2; ch++){
      const d = buf.getChannelData(ch);
      for (let i=0;i<len;i++){
        d[i] = (Math.random()*2-1) * Math.pow(1 - i/len, decay);
      }
    }
    return buf;
  }

  shaperCurve(amount:number){
    const n = 1024, curve = new Float32Array(n);
    for (let i=0;i<n;i++){ const x = i/n*2-1; curve[i] = Math.tanh(x*(1+amount*4)); }
    return curve;
  }

  mtof(m:number){ return 440 * Math.pow(2, (m-69)/12); }

  hexToHue(hex:string){
    const h = hex.replace('#','');
    const r=parseInt(h.slice(0,2),16)/255, g=parseInt(h.slice(2,4),16)/255, b=parseInt(h.slice(4,6),16)/255;
    const maxv=Math.max(r,g,b), minv=Math.min(r,g,b); const d=maxv-minv;
    let H=0;
    if (d===0) H=0; else if (maxv===r) H=((g-b)/d)%6; else if (maxv===g) H=(b-r)/d+2; else H=(r-g)/d+4;
    H/=6; if (H<0) H+=1;
    return H;
  }
}
