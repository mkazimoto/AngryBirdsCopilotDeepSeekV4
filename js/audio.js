/* ============================================================
   Angry Birds — Motor de Áudio
   Todos os sons são SINTETIZADOS com a Web Audio API.
   Não há dependência de arquivos .mp3/.wav externos.

   Sons disponíveis:
     launch(power)         — whoosh do estilingue
     creak(power)          — esticada da borracha
     impact(kind,str)      — baque em madeira/pedra/gelo/terra
     pigHurt() / pigPop()  — grunhido e "pop" do porco
     birdHurt()            — pio de dor do pássaro
     explode()             — explosão do pássaro preto
     boost()               — disparo do pássaro amarelo
     split()               — divisão do pássaro azul
     levelClear() / levelFail()
     music: startMusic() / stopMusic()
   ============================================================ */

(function (global) {
  'use strict';

  var AB = (global.AB = global.AB || {});

  /* Escala pentatônica maior (semitons a partir da tônica) */
  var SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  var MELODY = [0, 4, 2, 7, 4, 2, 0, 4, 2, 7, 9, 7, 4, 2, 0, 2];
  var BASS = [-12, -12, -7, -5, -12, -12, -3, -5];

  /* Tabela de timbres por material (usada em impact()) */
  var IMPACT_TIMBRE = {
    wood:  { osc: 'triangle', freq: 185,  q: 1.0, dur: 0.17, gain: 0.55, nType: 'lowpass',  nFreq: 1100, nGain: 0.35 },
    stone: { osc: 'sine',     freq: 92,   q: 0.8, dur: 0.26, gain: 0.70, nType: 'lowpass',  nFreq: 620,  nGain: 0.45 },
    ice:   { osc: 'sine',     freq: 2250, q: 7.0, dur: 0.19, gain: 0.30, nType: 'highpass', nFreq: 3200, nGain: 0.30 },
    pig:   { osc: 'sawtooth', freq: 330,  q: 3.5, dur: 0.16, gain: 0.32, nType: 'bandpass', nFreq: 1400, nGain: 0.22 },
    thud:  { osc: 'sine',     freq: 140,  q: 0.7, dur: 0.20, gain: 0.48, nType: 'lowpass',  nFreq: 800,  nGain: 0.30 }
  };

  /* ---------------------------------------------------------------- */

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.enabled = true;
    this.musicOn = false;
    this.ready = false;
    this._noise = null;
    this._musicTimer = null;
    this._nextNoteAt = 0;
    this._step = 0;
  }

  /* Cria o AudioContext e o grafo de áudio (idempotente). */
  AudioEngine.prototype.init = function () {
    if (this.ctx) return this;

    var Ctor = global.AudioContext || global.webkitAudioContext;
    if (!Ctor) return this;

    this.ctx = new Ctor();

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    /* Buffer de ruído branco reutilizado por todos os efeitos ruidosos. */
    var buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate), this.ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buffer;

    this.ready = true;
    return this;
  };

  /* Precisa ser chamado a partir de um gesto do usuário (política dos navegadores). */
  AudioEngine.prototype.resume = function () {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this;
  };

  AudioEngine.prototype._ok = function () {
    return this.ready && this.enabled && this.ctx && this.ctx.state === 'running';
  };

  /* ---------------------------------------------------------- helpers */

  /* BufferSource de ruído, já ligado e com stop agendado. */
  AudioEngine.prototype._noiseSource = function (dur) {
    var src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    src.start(this.ctx.currentTime, Math.random() * 0.5);
    src.stop(this.ctx.currentTime + dur);
    return src;
  };

  /* Oscilador simples com envelope de ataque/queda. */
  AudioEngine.prototype._voice = function (o) {
    if (!this._ok()) return null;

    var ctx = this.ctx;
    var at = (o.at || 0) + ctx.currentTime;
    var osc = ctx.createOscillator();
    osc.type = o.type || 'sine';

    osc.frequency.setValueAtTime(Math.max(1, o.freq), at);
    if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), at + o.dur);

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), at + (o.attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);

    osc.connect(gain);
    gain.connect(o.bus || this.sfxBus);

    osc.start(at);
    osc.stop(at + o.dur + 0.03);
    return osc;
  };

  /* Ruído filtrado com envelope — a base dos impactos. */
  AudioEngine.prototype._burst = function (o) {
    if (!this._ok()) return;

    var ctx = this.ctx;
    var at = ctx.currentTime + (o.at || 0);
    var filter = ctx.createBiquadFilter();
    filter.type = o.filter || 'lowpass';
    filter.frequency.setValueAtTime(o.freq, at);
    if (o.freqEnd) filter.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), at + o.dur);
    filter.Q.value = o.q || 1;

    var gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), at + (o.attack || 0.005));
    gain.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);

    var src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(o.bus || this.sfxBus);

    src.start(at, Math.random() * 0.5);
    src.stop(at + o.dur + 0.03);
  };

  /* ------------------------------------------------------------ SFX */

  /* Whoosh do lançamento. power: 0..1 */
  AudioEngine.prototype.launch = function (power) {
    if (!this._ok()) return;
    var p = Math.max(0, Math.min(1, power == null ? 1 : power));
    this._burst({
      filter: 'bandpass', freq: 260, freqEnd: 2600, q: 1.2,
      dur: 0.32, gain: 0.28 + p * 0.3, attack: 0.02
    });
    this._voice({ type: 'triangle', freq: 320 + p * 260, freqEnd: 130, dur: 0.22, gain: 0.14 });
  };

  /* Rangido da borracha ao esticar. power: 0..1 */
  AudioEngine.prototype.creak = function (power) {
    if (!this._ok()) return;
    var p = Math.max(0, Math.min(1, power == null ? 0.5 : power));
    this._voice({ type: 'sawtooth', freq: 90 + p * 130, freqEnd: 70 + p * 90, dur: 0.1, gain: 0.05 + p * 0.05, attack: 0.01 });
  };

  /* Impacto. kind: 'wood' | 'stone' | 'ice' | 'pig' | 'thud'. */
  AudioEngine.prototype.impact = function (kind, strength) {
    if (!this._ok()) return;
    var t = IMPACT_TIMBRE[kind] || IMPACT_TIMBRE.thud;
    var s = Math.max(0.05, Math.min(1, strength == null ? 0.5 : strength));
    var dur = t.dur * (0.7 + s * 0.6);

    this._voice({
      type: t.osc, freq: t.freq * (0.85 + s * 0.35), freqEnd: t.freq * 0.45,
      dur: dur, gain: t.gain * (0.35 + s * 0.65), q: t.q
    });
    this._burst({
      filter: t.nType, freq: t.nFreq, freqEnd: t.nFreq * 0.4, q: t.q,
      dur: dur * 1.15, gain: t.nGain * (0.3 + s * 0.7)
    });
  };

  /* Grunhido do porco ferido. */
  AudioEngine.prototype.pigHurt = function () {
    if (!this._ok()) return;
    this._voice({ type: 'sawtooth', freq: 300, freqEnd: 180, dur: 0.13, gain: 0.20, attack: 0.01 });
    this._voice({ type: 'square', freq: 232, freqEnd: 150, dur: 0.11, gain: 0.11, at: 0.09, attack: 0.01 });
  };

  /* "Pop" quando o porco é destruído. */
  AudioEngine.prototype.pigPop = function () {
    if (!this._ok()) return;
    this._voice({ type: 'sine', freq: 1150, freqEnd: 160, dur: 0.19, gain: 0.34 });
    this._burst({ filter: 'highpass', freq: 1500, freqEnd: 500, dur: 0.14, gain: 0.24 });
  };

  /* Pio de dor do pássaro. */
  AudioEngine.prototype.birdHurt = function () {
    if (!this._ok()) return;
    this._voice({ type: 'square', freq: 1500, freqEnd: 700, dur: 0.1, gain: 0.16 });
    this._voice({ type: 'square', freq: 1900, freqEnd: 950, dur: 0.09, gain: 0.12, at: 0.07 });
  };

  /* Explosão do pássaro preto. */
  AudioEngine.prototype.explode = function () {
    if (!this._ok()) return;
    this._burst({ filter: 'lowpass', freq: 1400, freqEnd: 90, q: 0.6, dur: 0.65, gain: 0.6, attack: 0.004 });
    this._voice({ type: 'sine', freq: 110, freqEnd: 32, dur: 0.6, gain: 0.55 });
    this._burst({ filter: 'highpass', freq: 3000, dur: 0.12, gain: 0.3 });
  };

  /* Impulso do pássaro amarelo. */
  AudioEngine.prototype.boost = function () {
    if (!this._ok()) return;
    this._burst({ filter: 'bandpass', freq: 500, freqEnd: 4200, q: 1.6, dur: 0.22, gain: 0.35 });
    this._voice({ type: 'sawtooth', freq: 240, freqEnd: 1500, dur: 0.2, gain: 0.13 });
  };

  /* Divisão do pássaro azul. */
  AudioEngine.prototype.split = function () {
    if (!this._ok()) return;
    [0, 0.05, 0.1].forEach(function (at) {
      this._voice({ type: 'triangle', freq: 900, freqEnd: 2100, dur: 0.14, gain: 0.16, at: at });
    }, this);
  };

  /* Vitória da fase — arpejo ascendente. */
  AudioEngine.prototype.levelClear = function () {
    if (!this._ok()) return;
    [0, 4, 7, 12, 16].forEach(function (semi, i) {
      this._voice({ type: 'triangle', freq: 523.25 * Math.pow(2, semi / 12), dur: 0.3, gain: 0.22, at: i * 0.11 });
    }, this);
    this._burst({ filter: 'highpass', freq: 2200, dur: 0.5, gain: 0.12, at: 0.5 });
  };

  /* Derrota — notas descendentes. */
  AudioEngine.prototype.levelFail = function () {
    if (!this._ok()) return;
    [0, -3, -7, -12].forEach(function (semi, i) {
      this._voice({ type: 'sawtooth', freq: 392 * Math.pow(2, semi / 12), freqEnd: 392 * Math.pow(2, (semi - 1) / 12), dur: 0.34, gain: 0.15, at: i * 0.15 });
    }, this);
  };

  /* Clique de interface. */
  AudioEngine.prototype.ui = function () {
    this._voice({ type: 'triangle', freq: 880, freqEnd: 1320, dur: 0.08, gain: 0.16 });
  };

  /* -------------------------------------------------------- música */

  AudioEngine.prototype.startMusic = function () {
    if (!this.ready || this.musicOn) return this;
    this.musicOn = true;
    this.musicBus.gain.setTargetAtTime(this.enabled ? 0.13 : 0, this.ctx.currentTime, 0.6);
    this._nextNoteAt = this.ctx.currentTime + 0.12;
    this._step = 0;
    var self = this;
    this._musicTimer = global.setInterval(function () { self._schedule(); }, 40);
    return this;
  };

  AudioEngine.prototype.stopMusic = function () {
    this.musicOn = false;
    if (this._musicTimer) global.clearInterval(this._musicTimer);
    this._musicTimer = null;
    if (this.ctx) this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    return this;
  };

  /* Scheduler com lookahead (evita jitter do setInterval). */
  AudioEngine.prototype._schedule = function () {
    if (!this.musicOn || !this.ctx) return;
    var stepDur = 0.15;
    while (this._nextNoteAt < this.ctx.currentTime + 0.25) {
      var at = this._nextNoteAt - this.ctx.currentTime;
      var semi = MELODY[this._step % MELODY.length];
      var freq = 261.63 * Math.pow(2, SCALE[semi] / 12);
      var self = this;

      /* melodia (pula algumas notas para dar respiro) */
      if (this._step % 4 !== 2) {
        (function () {
          self._voice({ type: 'triangle', freq: freq, dur: 0.24, gain: 0.085, at: at, bus: self.musicBus });
          self._voice({ type: 'sine', freq: freq * 2, dur: 0.16, gain: 0.03, at: at, bus: self.musicBus });
        })();
      }

      /* baixo a cada 4 passos */
      if (this._step % 4 === 0) {
        this._voice({
          type: 'sine', freq: 65.41 * Math.pow(2, BASS[(this._step / 4) % BASS.length] / 12),
          dur: 0.5, gain: 0.14, at: at, bus: this.musicBus
        });
      }

      /* hi-hat leve */
      if (this._step % 2 === 1) {
        this._burst({ filter: 'highpass', freq: 6500, dur: 0.045, gain: 0.035, at: at, bus: this.musicBus });
      }

      this._nextNoteAt += stepDur;
      this._step++;
    }
  };

  /* -------------------------------------------------------- controle */

  AudioEngine.prototype.setEnabled = function (on) {
    this.enabled = !!on;
    if (!this.ready) return this;
    this.master.gain.setTargetAtTime(this.enabled ? 0.85 : 0, this.ctx.currentTime, 0.06);
    if (!this.enabled) this.ctx.resume();
    return this;
  };

  AudioEngine.prototype.toggle = function () {
    this.setEnabled(!this.enabled);
    return this.enabled;
  };

  AB.AudioEngine = AudioEngine;
})(window);
