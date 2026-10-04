/* ============================================================
   Angry Birds — Motor do Jogo
   Física (Matter.js) + renderização (Canvas 2D) + áudio.

   Fluxo de uma jogada:
     idle -> (arrastar) aiming -> (soltar) flying -> (estabilizar) idle
   Quando os porcos acabam  -> vitória
   Quando os pássaros acabam -> derrota
   ============================================================ */

(function (global) {
  'use strict';

  var AB = global.AB;
  var M = global.Matter;
  var Engine = M.Engine;
  var Composite = M.Composite;
  var Bodies = M.Bodies;
  var Body = M.Body;
  var Events = M.Events;
  var Vector = M.Vector;
  var Common = M.Common;

  /* ----------------------------- ajustes de jogabilidade ----------------------------- */

  var MAX_DRAG = 118;          /* distância máxima que a borracha pode esticar */
  var MAX_SPEED = 21;          /* velocidade máxima de lançamento (px/passo) */
  var STEP_MS = 1000 / 60;     /* passo fixo da simulação */
  var MIN_ENERGY = 45;         /* energia mínima para causar dano */
  var BLAST_DAMAGE = 900;      /* energia equivalente da explosão do pássaro preto */
  var SETTLE_MS = 900;         /* tempo parado para encerrar a jogada */
  var FLIGHT_TIMEOUT_MS = 9000;

  /* Massa reduzida (trata corpos estáticos, cuja massa é Infinity). */
  function reducedMass(a, b) {
    if (a.isStatic) return b.mass;
    if (b.isStatic) return a.mass;
    return (a.mass * b.mass) / (a.mass + b.mass);
  }

  /* ============================================================ */

  function Game(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.audio = new AB.AudioEngine();

    this.engine = Engine.create();
    this.engine.gravity.y = 1.15;
    this.engine.positionIterations = 10;
    this.engine.velocityIterations = 8;
    this.world = this.engine.world;

    /* gravidade efetiva por passo, usada na prévia da trajetória */
    this.gStep = this.engine.gravity.y * this.engine.gravity.scale * STEP_MS * STEP_MS;

    this.blocks = [];
    this.pigs = [];
    this.birds = [];
    this.activeBirds = [];
    this.particles = [];
    this.texts = [];
    this._queue = [];

    this.level = null;
    this.levelIndex = 0;
    this.score = 0;
    this.birdQueue = [];
    this.readyBird = null;
    this.dragging = false;
    this.dragPos = null;
    this.state = 'idle';
    this.camera = { x: 0 };
    this.shake = 0;
    this.time = 0;
    this.flightTime = 0;
    this.settleTimer = 0;
    this.accumulator = 0;
    this.scale = 1;
    this._lastSoundAt = 0;
    this._soundCount = 0;
    this._lastCreakAt = 0;
    this._creakStep = 0;

    /* Em telas de toque o alvo do dedo é maior que o ponteiro do mouse. */
    this._touch = !!(global.matchMedia && global.matchMedia('(pointer: coarse)').matches) ||
      ('ontouchstart' in global) ||
      (global.navigator && global.navigator.maxTouchPoints > 0);
    this._grabRadius = this._touch ? 160 : 110;

    /* callbacks para a interface */
    this.onStateChange = null;

    this._buildStatics();
    this._bindEvents();
    this.resize();
  }

  /* ----------------------------- estáticos ----------------------------- */

  Game.prototype._buildStatics = function () {
    var opts = { isStatic: true, friction: 0.95, frictionStatic: 1.6, restitution: 0.05, label: 'ground' };
    this.ground = Bodies.rectangle(AB.WORLD_W / 2, AB.GROUND_Y + 60, AB.WORLD_W + 800, 120, opts);
    Composite.add(this.world, [
      this.ground,
      Bodies.rectangle(-80, 0, 120, 2400, opts),
      Bodies.rectangle(AB.WORLD_W + 80, 0, 120, 2400, opts)
    ]);
  };

  /* ----------------------------- eventos de física ----------------------------- */

  Game.prototype._bindEvents = function () {
    var self = this;
    Events.on(this.engine, 'collisionStart', function (evt) {
      for (var i = 0; i < evt.pairs.length; i++) self._onCollision(evt.pairs[i]);
    });
  };

  Game.prototype._onCollision = function (pair) {
    var a = pair.bodyA;
    var b = pair.bodyB;

    var rel = Vector.magnitude(Vector.sub(a.velocity, b.velocity));
    if (rel < 1.15) return;

    var energy = 0.5 * reducedMass(a, b) * rel * rel;

    /* som do baque (limitado por taxa) */
    if (energy > 60) {
      var kind = a.kind === 'block' ? a.material
        : b.kind === 'block' ? b.material
          : (a.kind === 'pig' || b.kind === 'pig') ? 'pig'
            : 'thud';
      this._playImpact(kind, Math.min(1, energy / 800));
    }

    /* pássaro preto explode ao bater forte */
    [a, b].forEach(function (body) {
      if (body.kind === 'bird' && body.ability === 'explode' && !body.abilityUsed && energy > 300) {
        this._queueAbility(body);
      }
    }, this);

    if (energy < MIN_ENERGY) return;

    /* dano */
    if (a.kind === 'block') this._damageBlock(a, energy * AB.MATERIALS[a.material].fragility);
    if (b.kind === 'block') this._damageBlock(b, energy * AB.MATERIALS[b.material].fragility);
    if (a.kind === 'pig') this._damagePig(a, energy * a.fragility);
    if (b.kind === 'pig') this._damagePig(b, energy * b.fragility);

    /* reação do pássaro */
    [a, b].forEach(function (body) {
      if (body.kind === 'bird' && energy > 500) this._playImpact('thud', 0.5);
    }, this);
  };

  /* Som de impacto com limitação de taxa (evita "metralhadora" de áudio). */
  Game.prototype._playImpact = function (kind, strength) {
    var now = global.performance ? global.performance.now() : Date.now();
    if (now - this._lastSoundAt < 45 || this._soundCount >= 3) return;
    this._lastSoundAt = now;
    this._soundCount++;
    this.audio.impact(kind, strength);
  };

  /* ----------------------------- dano e destruição ----------------------------- */

  Game.prototype._damageBlock = function (body, dmg) {
    if (body.dead || dmg <= 0) return;
    body.hp -= dmg;
    if (body.hp <= 0) {
      var self = this;
      this._queue.push(function () { self._destroyBlock(body); });
    }
  };

  Game.prototype._damagePig = function (body, dmg) {
    if (body.dead || dmg <= 0) return;
    body.hp -= dmg;
    body.hurtFlash = 240;
    if (body.hp > 60) this._playImpact('pig', 0.4);
    else this.audio.pigHurt();

    if (body.hp <= 0) {
      var self = this;
      this._queue.push(function () { self._destroyPig(body); });
    }
  };

  Game.prototype._destroyBlock = function (body) {
    if (body.dead) return;
    body.dead = true;

    var mat = AB.MATERIALS[body.material];
    this._debris(body, mat);
    this._removeBlock(body);
    this.audio.impact(mat.impact, 0.95);
    this.shake = Math.min(14, this.shake + 4);
    this._addScore(AB.SCORE_COMBO.block, body.position, '+' + AB.SCORE_COMBO.block);
  };

  Game.prototype._destroyPig = function (body) {
    if (body.dead) return;
    body.dead = true;

    this._puff(body.position.x, body.position.y, 16, '#8fe05c', 3.4);
    this._puff(body.position.x, body.position.y, 6, '#ffffff', 2.2);
    this._removePig(body);
    this.audio.pigPop();
    this.shake = Math.min(16, this.shake + 5);
    this._addScore(AB.SCORE_COMBO.pig, body.position, '+' + AB.SCORE_COMBO.pig);
  };

  Game.prototype._removeBlock = function (body) {
    Composite.remove(this.world, body);
    var i = this.blocks.indexOf(body);
    if (i >= 0) this.blocks.splice(i, 1);
  };

  Game.prototype._removePig = function (body) {
    Composite.remove(this.world, body);
    var i = this.pigs.indexOf(body);
    if (i >= 0) this.pigs.splice(i, 1);
  };

  Game.prototype._removeBird = function (body) {
    Composite.remove(this.world, body);
    [this.birds, this.activeBirds].forEach(function (arr) {
      var i = arr.indexOf(body);
      if (i >= 0) arr.splice(i, 1);
    });
  };

  Game.prototype._addScore = function (points, pos, label) {
    this.score += points;
    if (pos) this._text(pos.x, pos.y - 26, label, '#ffe06a');
    this._emit('score', this.score);
  };

  /* ----------------------------- habilidades ----------------------------- */

  Game.prototype._queueAbility = function (bird) {
    if (!bird || bird.abilityUsed) return;
    var self = this;
    this._queue.push(function () { self._activateAbility(bird); });
  };

  Game.prototype._activateAbility = function (bird) {
    if (!bird || bird.abilityUsed || bird.dead) return;
    if (bird.ability === 'none' || !bird.ability) return;

    bird.abilityUsed = true;

    if (bird.ability === 'boost') {
      var dir = Vector.magnitude(bird.velocity) > 0.4 ? Vector.normalise(bird.velocity) : { x: 1, y: 0 };
      Body.setVelocity(bird, Vector.mult(dir, 34));
      bird.frictionAir = 0.0004;
      this.audio.boost();
      this._puff(bird.position.x, bird.position.y, 10, '#ffefa6', 2.4);
      this.shake = Math.min(8, this.shake + 3);
      return;
    }

    if (bird.ability === 'split') {
      var speed = Vector.magnitude(bird.velocity);
      var base = speed > 0.4 ? Vector.normalise(bird.velocity) : { x: 1, y: 0 };
      var self = this;
      [-0.24, 0.24].forEach(function (angle) {
        var dir = Vector.rotate(base, angle);
        var nb = AB.makeBird('blue', bird.position.x + dir.x * 8, bird.position.y + dir.y * 8, 0.72);
        Body.setVelocity(nb, Vector.mult(dir, speed * 1.04));
        nb.launched = true;
        nb.abilityUsed = true;
        Composite.add(self.world, nb);
        self.birds.push(nb);
        self.activeBirds.push(nb);
      });
      this.audio.split();
      this._puff(bird.position.x, bird.position.y, 12, '#d6f2ff', 2.6);
      return;
    }

    if (bird.ability === 'explode') {
      var t = AB.BIRD_TYPES.black;
      this.audio.explode();
      this.shake = 20;
      this._blast(bird.position.x, bird.position.y, t.blastRadius, 16);
      this._removeBird(bird);
    }
  };

  Game.prototype._blast = function (x, y, radius, power) {
    var self = this;
    var center = { x: x, y: y };

    this.blocks.concat(this.pigs, this.activeBirds).forEach(function (body) {
      if (body.isStatic || body.dead || !body.position) return;

      var dist = Vector.magnitude(Vector.sub(body.position, center));
      if (dist > radius) return;

      var falloff = 1 - dist / radius;
      var dir = dist < 0.001 ? { x: 0, y: -1 } : Vector.normalise(Vector.sub(body.position, center));

      Body.setVelocity(body, Vector.add(body.velocity, Vector.mult(dir, power * falloff)));
      Body.setAngularVelocity(body, body.angularVelocity + (Math.random() - 0.5) * 0.4);

      if (body.kind === 'block') {
        self._damageBlock(body, BLAST_DAMAGE * Math.pow(falloff, 1.2) * AB.MATERIALS[body.material].fragility);
      } else if (body.kind === 'pig') {
        self._damagePig(body, BLAST_DAMAGE * Math.pow(falloff, 1.2) * body.fragility);
      }
    });

    this._explosionFx(x, y, radius);
  };

  /* ----------------------------- fases ----------------------------- */

  Game.prototype.loadLevel = function (index) {
    var self = this;

    this.blocks.concat(this.pigs).forEach(function (b) { Composite.remove(self.world, b); });
    this.birds.forEach(function (b) { Composite.remove(self.world, b); });

    this.blocks = [];
    this.pigs = [];
    this.birds = [];
    this.activeBirds = [];
    this.particles = [];
    this.texts = [];
    this._queue = [];
    this.readyBird = null;
    this.dragging = false;
    this.dragPos = null;
    this.camera.x = 0;
    this.shake = 0;
    this.score = 0;
    this.flightTime = 0;
    this.settleTimer = 0;
    this.accumulator = 0;
    this.turnCount = 0;
    this.state = 'idle';

    this.levelIndex = Common.clamp(index, 0, AB.LEVELS.length - 1);
    this.level = AB.LEVELS[this.levelIndex];

    this.level.blocks.forEach(function (spec) {
      var body = AB.makeBlock(spec);
      self.blocks.push(body);
      Composite.add(self.world, body);
    });

    this.level.pigs.forEach(function (spec) {
      var body = AB.makePig(spec);
      self.pigs.push(body);
      Composite.add(self.world, body);
    });

    this.birdQueue = this.level.birds.slice();

    this._emit('levelstart', { index: this.levelIndex, level: this.level, total: AB.LEVELS.length });
    this._emit('score', this.score);
    this._nextBird();
  };

  Game.prototype.restart = function () {
    this.loadLevel(this.levelIndex);
  };

  Game.prototype.nextLevel = function () {
    if (this.levelIndex < AB.LEVELS.length - 1) this.loadLevel(this.levelIndex + 1);
  };

  Game.prototype._nextBird = function () {
    if (this.pigs.length === 0) { this._endLevel(true); return; }
    if (this.birdQueue.length === 0) { this._endLevel(false); return; }

    this.readyBird = { type: this.birdQueue.shift() };
    this.dragPos = this._restPos();
    this.dragging = false;
    this.state = 'idle';
    this.settleTimer = 0;
    this.flightTime = 0;

    this._emit('birds', this._birdStatus());
    this._emit('hint', this.turnCount === 0
      ? this.level.subtitle
      : 'Arraste o pássaro para trás e solte para lançar');
  };

  Game.prototype._birdStatus = function () {
    var remaining = this.birdQueue.length + (this.readyBird ? 1 : 0);
    var used = this.level.birds.length - remaining;
    return this.level.birds.map(function (type, i) {
      return { type: type, used: i < used };
    });
  };

  Game.prototype._endTurn = function () {
    var self = this;
    this.activeBirds.slice().forEach(function (b) {
      if (!b.dead) self._puff(b.position.x, b.position.y, 7, '#fff6dd', 2.2);
      self._removeBird(b);
    });
    this.activeBirds = [];
    this.state = 'idle';
    this.settleTimer = 0;
    this.flightTime = 0;
    this._emit('hint', null);
    this._nextBird();
  };

  Game.prototype._endLevel = function (win) {
    if (this.state === 'over') return;
    this.state = 'over';

    if (win && this.birdQueue.length > 0) {
      this.score += this.birdQueue.length * AB.SCORE_COMBO.birdLeft;
      this._emit('score', this.score);
    }

    var stars = 0;
    if (win) {
      var th = this.level.stars;
      stars = this.score >= th[2] ? 3 : this.score >= th[1] ? 2 : 1;
      this.audio.levelClear();
    } else {
      this.audio.levelFail();
    }

    this._emit('levelend', {
      win: win,
      stars: stars,
      score: this.score,
      index: this.levelIndex,
      hasNext: this.levelIndex < AB.LEVELS.length - 1,
      level: this.level
    });
  };

  /* ----------------------------- entrada ----------------------------- */

  Game.prototype._restPos = function () {
    return { x: AB.SLING.x - 6, y: AB.SLING.y + 6 };
  };

  Game.prototype.screenToWorld = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) / r.width * AB.VIEW_W + this.camera.x,
      y: (clientY - r.top) / r.height * AB.VIEW_H
    };
  };

  Game.prototype.pointerDown = function (wx, wy) {
    this.audio.resume();

    /* durante o voo: aciona a habilidade */
    if (this.state === 'flying') {
      this._activateAbility(this._leadBird());
      return;
    }

    if (this.state !== 'idle' || !this.readyBird) return;

    var pos = this.dragPos || this._restPos();
    if (Math.hypot(wx - pos.x, wy - pos.y) > this._grabRadius && wx > AB.SLING.x + 220) return;

    this.dragging = true;
    this.state = 'aiming';
    this.dragPos = { x: wx, y: wy };
    this._clampDrag();
  };

  Game.prototype.pointerMove = function (wx, wy) {
    if (!this.dragging) return;
    this.dragPos.x = wx;
    this.dragPos.y = wy;
    this._clampDrag();
    this._creak();
  };

  Game.prototype.pointerUp = function () {
    if (!this.dragging) return;
    this.dragging = false;
    this._launch();
  };

  Game.prototype._clampDrag = function () {
    var anchor = { x: AB.SLING.x, y: AB.SLING.y };
    var delta = Vector.sub(this.dragPos, anchor);
    var dist = Vector.magnitude(delta);

    if (dist > MAX_DRAG) this.dragPos = Vector.add(anchor, Vector.mult(Vector.normalise(delta), MAX_DRAG));

    this.dragPos.x = Common.clamp(this.dragPos.x, 30, anchor.x);
    this.dragPos.y = Math.min(this.dragPos.y, AB.GROUND_Y - 26);
  };

  Game.prototype._creak = function () {
    var dist = Vector.magnitude(Vector.sub({ x: AB.SLING.x, y: AB.SLING.y }, this.dragPos));
    var step = Math.floor(dist / 26);
    var now = global.performance ? global.performance.now() : Date.now();
    if (step !== this._creakStep && now - this._lastCreakAt > 110) {
      this._creakStep = step;
      this._lastCreakAt = now;
      this.audio.creak(Math.min(1, dist / MAX_DRAG));
    }
  };

  Game.prototype._launch = function () {
    var anchor = { x: AB.SLING.x, y: AB.SLING.y };
    var pull = Vector.sub(anchor, this.dragPos);
    var dist = Vector.magnitude(pull);

    if (dist < 10) { this.dragPos = this._restPos(); this.state = 'idle'; return; }

    var power = Math.min(1, dist / MAX_DRAG);
    var dir = Vector.normalise(pull);

    var bird = AB.makeBird(this.readyBird.type, this.dragPos.x, this.dragPos.y);
    Body.setVelocity(bird, Vector.mult(dir, power * MAX_SPEED));
    Body.setAngularVelocity(bird, 0.05);
    bird.launched = true;

    Composite.add(this.world, bird);
    this.birds.push(bird);
    this.activeBirds.push(bird);

    this.readyBird = null;
    this.dragPos = null;
    this.state = 'flying';
    this.flightTime = 0;
    this.settleTimer = 0;
    this.turnCount++;

    this.audio.launch(power);
    this._emit('hint', null);
  };

  /* Aciona a habilidade do pássaro em voo (clique, toque ou Espaço). */
  Game.prototype.triggerAbility = function () {
    if (this.state !== 'flying') return;
    this._activateAbility(this._leadBird());
  };

  Game.prototype._leadBird = function () {
    var best = null;
    this.activeBirds.forEach(function (b) { if (!best || b.position.x > best.position.x) best = b; });
    return best;
  };

  /* ----------------------------- loop ----------------------------- */

  Game.prototype.update = function (dtMs) {
    this.accumulator += Math.min(dtMs, 100);

    var steps = 0;
    while (this.accumulator >= STEP_MS && steps < 5) {
      this._fixedStep(STEP_MS);
      this.accumulator -= STEP_MS;
      steps++;
    }

    /* câmera */
    var target = 0;
    var lead = this.state === 'flying' ? this._leadBird() : null;
    if (lead) target = Common.clamp(lead.position.x - AB.VIEW_W * 0.44, 0, AB.WORLD_W - AB.VIEW_W);
    this.camera.x += (target - this.camera.x) * 0.085;
    this.camera.x = Common.clamp(this.camera.x, 0, AB.WORLD_W - AB.VIEW_W);

    /* tremor */
    this.shake *= 0.86;
    if (this.shake < 0.25) this.shake = 0;
  };

  Game.prototype._fixedStep = function (ms) {
    this.time += ms;
    this._soundCount = 0;

    if (this._queue.length) {
      var queue = this._queue;
      this._queue = [];
      queue.forEach(function (fn) { fn(); });
    }

    Engine.update(this.engine, ms);

    this._cull();
    this._tickParticles(ms);
    this._tickTexts(ms);
    this._tickState(ms);
  };

  Game.prototype._tickState = function (ms) {
    this.pigs.forEach(function (p) { if (p.hurtFlash > 0) p.hurtFlash -= ms; });

    this._applyGroundDamping(ms);

    if (this.state !== 'flying') return;

    this.flightTime += ms;
    this.settleTimer = this._anyMoving() ? 0 : this.settleTimer + ms;

    if (this.settleTimer > SETTLE_MS || this.flightTime > FLIGHT_TIMEOUT_MS) this._endTurn();
  };

  /* Círculos (pássaros e porcos) rolariam para sempre. Aplica atrito de
     rolamento quando encostam no chão e registra há quanto tempo repousam. */
  Game.prototype._applyGroundDamping = function (ms) {
    var dt = ms / STEP_MS;
    var linear = Math.pow(0.985, dt);
    var angular = Math.pow(0.97, dt);

    this.activeBirds.concat(this.pigs, this.blocks).forEach(function (b) {
      if (b.isStatic || b.dead) return;
      var half = b.kind === 'block' ? (b.h || 20) / 2 : (b.r || 20);

      if (b.position.y > AB.GROUND_Y - half - 8) {
        b.groundTime = (b.groundTime || 0) + ms;
        if (b.kind !== 'block') {
          Body.setVelocity(b, { x: b.velocity.x * linear, y: b.velocity.y });
          Body.setAngularVelocity(b, b.angularVelocity * angular);
        }
      } else {
        b.groundTime = 0;
      }
    });
  };

  Game.prototype._anyMoving = function () {
    var atRest = function (b) {
      return (b.groundTime || 0) > 1000 && Math.abs(b.velocity.x) < 6;
    };
    var moving = function (b) {
      return !atRest(b) && (Vector.magnitude(b.velocity) > 0.6 || Math.abs(b.angularVelocity) > 0.05);
    };

    var i;
    for (i = 0; i < this.blocks.length; i++) if (moving(this.blocks[i])) return true;
    for (i = 0; i < this.pigs.length; i++) if (moving(this.pigs[i])) return true;
    for (i = 0; i < this.activeBirds.length; i++) if (moving(this.activeBirds[i])) return true;
    return false;
  };

  Game.prototype._cull = function () {
    var self = this;

    this.pigs.slice().forEach(function (p) {
      if (p.position.y > 1000 || p.position.x < -260 || p.position.x > AB.WORLD_W + 260) self._destroyPig(p);
    });

    this.blocks.slice().forEach(function (b) {
      if (b.position.y > 1000 || b.position.x < -360 || b.position.x > AB.WORLD_W + 360) self._removeBlock(b);
    });

    this.activeBirds.slice().forEach(function (b) {
      if (b.position.y > 1000 || b.position.x < -260 || b.position.x > AB.WORLD_W + 260) self._removeBird(b);
    });
  };

  /* ----------------------------- partículas ----------------------------- */

  Game.prototype._particle = function (o) {
    if (this.particles.length > 700) return;
    this.particles.push({
      x: o.x, y: o.y, vx: o.vx, vy: o.vy,
      life: o.life, max: o.life, size: o.size,
      color: o.color, grav: o.grav == null ? 0.36 : o.grav,
      drag: o.drag == null ? 0.99 : o.drag,
      shape: o.shape || 'circle'
    });
  };

  Game.prototype._puff = function (x, y, count, color, spread) {
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = Math.random() * spread;
      this._particle({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - 0.6,
        life: 380 + Math.random() * 320,
        size: 2.5 + Math.random() * 4.5,
        color: color, grav: 0.1, drag: 0.94
      });
    }
  };

  Game.prototype._debris = function (body, mat) {
    var w = body.w || 30;
    var h = body.h || 30;
    var count = Math.round(Common.clamp((w * h) / 260, 8, 22));

    for (var i = 0; i < count; i++) {
      this._particle({
        x: body.position.x + (Math.random() - 0.5) * w,
        y: body.position.y + (Math.random() - 0.5) * h,
        vx: (Math.random() - 0.5) * 5.5,
        vy: -Math.random() * 4 - 0.5,
        life: 520 + Math.random() * 620,
        size: 2 + Math.random() * 4,
        color: Math.random() < 0.5 ? mat.fill : mat.dust,
        grav: 0.42, shape: 'square'
      });
    }

    this._puff(body.position.x, body.position.y, 8, mat.dust, 2.2);
  };

  Game.prototype._explosionFx = function (x, y, radius) {
    for (var i = 0; i < 46; i++) {
      var a = (i / 46) * Math.PI * 2;
      var s = 4 + Math.random() * 11;
      this._particle({
        x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 320 + Math.random() * 460,
        size: 4 + Math.random() * 8,
        color: i % 3 === 0 ? '#fff1a8' : (i % 3 === 1 ? '#ff9a3c' : '#ff5a2b'),
        grav: 0.1, drag: 0.9
      });
    }
    this._particle({ x: x, y: y, vx: 0, vy: 0, life: 260, size: radius * 0.42, color: 'rgba(255,220,140,.55)', grav: 0, drag: 1 });
    this._puff(x, y, 18, 'rgba(60,60,60,.5)', 5);
  };

  Game.prototype._tickParticles = function (ms) {
    var dt = ms / STEP_MS;
    var survivors = [];
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.life -= ms;
      if (p.life <= 0) continue;
      p.vy += p.grav * dt;
      p.vx *= p.drag;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > AB.GROUND_Y + 30 && p.grav > 0.2) { p.y = AB.GROUND_Y + 30; p.vy *= -0.28; p.vx *= 0.6; }
      survivors.push(p);
    }
    this.particles = survivors;
  };

  Game.prototype._text = function (x, y, label, color) {
    this.texts.push({ x: x, y: y, label: label, life: 1100, max: 1100, color: color });
  };

  Game.prototype._tickTexts = function (ms) {
    var survivors = [];
    for (var i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      t.life -= ms;
      if (t.life <= 0) continue;
      t.y -= ms * 0.028;
      survivors.push(t);
    }
    this.texts = survivors;
  };

  /* ----------------------------- renderização ----------------------------- */

  Game.prototype.resize = function () {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;

    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.scale = this.canvas.width / AB.VIEW_W;

    /* Redefinir a largura/altura do canvas o limpa. Redesenha na hora para
       que a tela não fique em branco caso o requestAnimationFrame esteja
       parado (aba oculta). */
    this.render();
  };

  Game.prototype.render = function () {
    var ctx = this.ctx;
    if (!this.level) return;

    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.clearRect(0, 0, AB.VIEW_W, AB.VIEW_H);

    var sx = 0, sy = 0;
    if (this.shake > 0.25) {
      sx = (Math.random() - 0.5) * this.shake;
      sy = (Math.random() - 0.5) * this.shake;
    }

    this._drawSky();

    ctx.save();
    ctx.translate(-this.camera.x * 0.22 + sx * 0.4, sy * 0.4);
    this._drawClouds();
    ctx.restore();

    ctx.save();
    ctx.translate(-this.camera.x * 0.5, 0);
    this._drawHills();
    ctx.restore();

    ctx.save();
    ctx.translate(-this.camera.x + sx, sy);
    this._drawGround();
    if (this.dragging) this._drawAim();
    this._drawSlingBack();
    this._drawBodies();
    this._drawParticles();
    this._drawTexts();
    this._drawSlingFront();
    ctx.restore();
  };

  Game.prototype._drawSky = function () {
    var ctx = this.ctx;
    var g = ctx.createLinearGradient(0, 0, 0, AB.GROUND_Y + 60);
    g.addColorStop(0, this.level.sky[0]);
    g.addColorStop(0.58, this.level.sky[1]);
    g.addColorStop(1, this.level.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, AB.VIEW_W, AB.VIEW_H);

    var sunX = AB.VIEW_W - 168 - this.camera.x * 0.06;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#fff6c0';
    ctx.beginPath();
    ctx.arc(sunX, 108, 104, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#fff4b8';
    ctx.beginPath();
    ctx.arc(sunX, 108, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  Game.prototype._cloud = function (x, y, s) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 24 * s, 0, Math.PI * 2);
    ctx.arc(x + 28 * s, y - 11 * s, 31 * s, 0, Math.PI * 2);
    ctx.arc(x + 64 * s, y - 2 * s, 23 * s, 0, Math.PI * 2);
    ctx.arc(x + 34 * s, y + 9 * s, 26 * s, 0, Math.PI * 2);
    ctx.fill();
  };

  Game.prototype._drawClouds = function () {
    var ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    for (var i = 0; i < 8; i++) {
      var x = ((i * 337 + this.time * 0.008) % (AB.WORLD_W + 600)) - 220;
      this._cloud(x, 64 + (i * 47) % 96, 0.65 + ((i * 19) % 11) / 16);
    }
  };

  Game.prototype._drawHills = function () {
    var ctx = this.ctx;
    var colors = ['rgba(126,190,132,.55)', 'rgba(104,170,116,.6)'];
    for (var layer = 0; layer < 2; layer++) {
      ctx.fillStyle = colors[layer];
      var base = AB.GROUND_Y + 12 + layer * 14;
      var h = 150 - layer * 40;
      for (var i = -1; i < 14; i++) {
        var x = i * 240 + layer * 90;
        ctx.beginPath();
        ctx.moveTo(x - 150, base);
        ctx.quadraticCurveTo(x, base - h - (i % 3) * 34, x + 150, base);
        ctx.fill();
      }
    }
  };

  Game.prototype._drawGround = function () {
    var ctx = this.ctx;
    var gy = AB.GROUND_Y;
    var g = ctx.createLinearGradient(0, gy, 0, gy + 110);
    g.addColorStop(0, '#79c94a');
    g.addColorStop(0.1, '#54a02c');
    g.addColorStop(0.12, '#8d5c2c');
    g.addColorStop(0.55, '#6d4321');
    g.addColorStop(1, '#4a2d16');
    ctx.fillStyle = g;
    ctx.fillRect(-400, gy, AB.WORLD_W + 800, AB.VIEW_H - gy + 260);

    /* tufos de grama */
    ctx.strokeStyle = '#3f8a22';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (var i = 0; i < 130; i++) {
      var x = -300 + i * 17;
      var hgt = 6 + ((i * 37) % 9);
      ctx.beginPath();
      ctx.moveTo(x, gy + 1);
      ctx.lineTo(x + ((i % 3) - 1) * 4, gy - hgt);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  };

  Game.prototype._drawAim = function () {
    var ctx = this.ctx;
    var anchor = { x: AB.SLING.x, y: AB.SLING.y };
    var pull = Vector.sub(anchor, this.dragPos);
    var dist = Vector.magnitude(pull);
    if (dist < 10) return;

    var power = Math.min(1, dist / MAX_DRAG);
    var dir = Vector.normalise(pull);
    var vx = dir.x * power * MAX_SPEED;
    var vy = dir.y * power * MAX_SPEED;

    var x = this.dragPos.x;
    var y = this.dragPos.y;

    /* pontilhado da trajetória prevista */
    ctx.strokeStyle = 'rgba(28,48,78,.45)';
    ctx.lineWidth = 1.5;
    for (var i = 0; i < 54; i++) {
      x += vx;
      y += vy;
      vy += this.gStep;
      if (y > AB.GROUND_Y || x > AB.WORLD_W + 40) break;
      if (i % 3 !== 0) continue;

      var fade = 1 - i / 66;
      ctx.globalAlpha = Math.min(1, 0.9 * fade);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, 4.6 - i * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* arco de força */
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(12,24,42,.35)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(this.dragPos.x, this.dragPos.y, 31, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = power > 0.85 ? '#ff5b4a' : power > 0.55 ? '#ffcf3f' : '#8ee06a';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(this.dragPos.x, this.dragPos.y, 31, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * power);
    ctx.stroke();
    ctx.lineCap = 'butt';
  };

  Game.prototype._drawSlingBack = function () {
    var pos = this.dragPos || this._restPos();
    AB.drawSlingBack(this.ctx, pos.x, pos.y);
  };

  Game.prototype._drawSlingFront = function () {
    var ctx = this.ctx;
    var pos = this.dragPos || this._restPos();

    AB.drawSlingFrontBand(ctx, pos.x, pos.y);

    /* pássaro carregado (ainda não é um corpo físico) */
    if (this.readyBird) {
      var t = AB.BIRD_TYPES[this.readyBird.type];
      AB.drawBird(ctx, {
        position: pos,
        angle: 0,
        r: t.radius,
        birdType: this.readyBird.type,
        ability: t.ability,
        abilityUsed: false,
        launched: false
      }, this.time);
    }

    AB.drawSlingForkFront(ctx);
  };

  Game.prototype._drawBodies = function () {
    var ctx = this.ctx;

    this.blocks.slice().sort(function (a, b) { return a.position.y - b.position.y; })
      .forEach(function (b) { AB.drawBlock(ctx, b); });

    this.pigs.forEach(function (p) { AB.drawPig(ctx, p, this.time); }, this);

    this.activeBirds.forEach(function (b) { AB.drawBird(ctx, b, this.time); }, this);
  };

  Game.prototype._drawParticles = function () {
    var ctx = this.ctx;
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      var a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;

      if (p.shape === 'square') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.life * 0.01);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.35 + a * 0.65), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  };

  Game.prototype._drawTexts = function () {
    var ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.font = '700 20px "Segoe UI", system-ui, sans-serif';
    for (var i = 0; i < this.texts.length; i++) {
      var t = this.texts[i];
      var a = Math.max(0, Math.min(1, t.life / t.max));
      ctx.globalAlpha = a;
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.strokeText(t.label, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.label, t.x, t.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  };

  /* ----------------------------- helpers ----------------------------- */

  Game.prototype._emit = function (evt, data) {
    if (typeof this.onStateChange === 'function') this.onStateChange(evt, data);
  };

  Game.prototype.hasActiveFlight = function () {
    return this.state === 'flying' || this.activeBirds.length > 0;
  };

  Game.prototype.abilityReady = function () {
    var b = this._leadBird();
    return !!(b && b.ability && b.ability !== 'none' && !b.abilityUsed);
  };

  AB.Game = Game;
})(window);
