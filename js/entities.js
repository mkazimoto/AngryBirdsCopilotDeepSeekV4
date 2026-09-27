/* ============================================================
   Angry Birds — Entidades
   Materiais, tipos de pássaro, fábricas de corpos (Matter.js)
   e rotinas de desenho (canvas 2D).
   ============================================================ */

(function (global) {
  'use strict';

  var AB = (global.AB = global.AB || {});
  var Bodies = global.Matter.Bodies;

  /* ----------------------------- dimensões do mundo ----------------------------- */

  AB.VIEW_W = 1280;   /* largura da viewport (coordenadas lógicas) */
  AB.VIEW_H = 720;    /* altura da viewport */
  AB.WORLD_W = 1600;  /* largura total do mundo (câmera rola até o fim) */
  AB.GROUND_Y = 640;  /* y do topo do chão */
  AB.SLING = { x: 196, y: 496, baseY: AB.GROUND_Y }; /* garfo do estilingue */

  /* ----------------------------- materiais -----------------------------
     hp         — vida do bloco
     fragility  — multiplicador de dano (quanto maior, mais frágil)
     density    — massa por área (px²)
     ------------------------------------------------------------------- */

  AB.MATERIALS = {
    wood: {
      density: 0.0012, hp: 90, fragility: 0.22,
      restitution: 0.16, friction: 0.72, frictionStatic: 1.1,
      fill: '#d98f45', light: '#f0b877', dark: '#a5642a', edge: '#6f3f16',
      impact: 'wood', dust: '#e0a768'
    },
    stone: {
      density: 0.0045, hp: 190, fragility: 0.12,
      restitution: 0.08, friction: 0.85, frictionStatic: 1.4,
      fill: '#9aa3ac', light: '#c3cad1', dark: '#767e87', edge: '#4d545c',
      impact: 'stone', dust: '#b6bec6'
    },
    ice: {
      density: 0.0008, hp: 42, fragility: 0.34,
      restitution: 0.12, friction: 0.28, frictionStatic: 0.5,
      fill: '#8fdcff', light: '#d6f4ff', dark: '#5cb4e0', edge: '#3f8fbb',
      impact: 'ice', dust: '#cdefff'
    }
  };

  /* ----------------------------- tipos de pássaro -----------------------------
     ability: 'none' | 'boost' | 'split' | 'explode'
     ------------------------------------------------------------------------- */

  AB.BIRD_TYPES = {
    red: {
      name: 'Red', radius: 17, mass: 11, restitution: 0.42, friction: 0.6,
      ability: 'none', power: 1.0,
      body: '#e6392b', body2: '#b8261b', belly: '#ffd8c8', beak: '#ffb703', crest: '#c0201a'
    },
    yellow: {
      name: 'Chuck', radius: 16, mass: 9, restitution: 0.34, friction: 0.5,
      ability: 'boost', power: 1.15, boostSpeed: 1.9,
      body: '#ffd21f', body2: '#d9a800', belly: '#fff3b0', beak: '#ff8a00', crest: '#e0ae00'
    },
    blue: {
      name: 'Jay', radius: 13, mass: 5, restitution: 0.5, friction: 0.5,
      ability: 'split', power: 0.8, splitCount: 3,
      body: '#3aa7ef', body2: '#1f7cba', belly: '#d9f1ff', beak: '#ffb703', crest: '#186b9f'
    },
    black: {
      name: 'Bomb', radius: 19, mass: 16, restitution: 0.22, friction: 0.7,
      ability: 'explode', power: 0.95, blastRadius: 190, blastForce: 0.055,
      body: '#33333d', body2: '#1b1b22', belly: '#4c4c58', beak: '#ffb703', crest: '#111116'
    }
  };

  /* ----------------------------- utilitários ----------------------------- */

  /* Retângulo com cantos arredondados (compatível com navegadores antigos). */
  AB.roundRect = function (ctx, x, y, w, h, r) {
    var rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  };

  /* Gerador pseudoaleatório determinístico (para rachaduras estáveis). */
  AB.hash = function (seed) {
    var s = 0;
    for (var i = 0; i < String(seed).length; i++) s = (s * 31 + String(seed).charCodeAt(i)) | 0;
    return function () {
      s = (s * 1664525 + 1013904223) | 0;
      return ((s >>> 8) & 0xffff) / 0xffff;
    };
  };

  /* ----------------------------- fábricas ----------------------------- */

  /* Cria um bloco destrutível. spec: {x, y, w, h, material, angle} */
  AB.makeBlock = function (spec) {
    var mat = AB.MATERIALS[spec.material] || AB.MATERIALS.wood;
    var body = Bodies.rectangle(spec.x, spec.y, spec.w, spec.h, {
      angle: spec.angle || 0,
      density: mat.density,
      restitution: mat.restitution,
      friction: mat.friction,
      frictionStatic: mat.frictionStatic,
      frictionAir: 0.008,
      label: 'block'
    });
    body.kind = 'block';
    body.material = spec.material;
    body.maxHp = mat.hp;
    body.hp = mat.hp;
    body.w = spec.w;
    body.h = spec.h;
    return body;
  };

  /* Cria um porco. spec: {x, y, r} */
  AB.makePig = function (spec) {
    var r = spec.r || 30;
    var body = Bodies.circle(spec.x, spec.y, r, {
      density: 0.0012,
      restitution: 0.22,
      friction: 0.55,
      frictionStatic: 0.9,
      frictionAir: 0.012,
      label: 'pig'
    });
    body.kind = 'pig';
    body.r = r;
    body.maxHp = 75;
    body.hp = 75;
    body.fragility = 0.85;
    body.hurtFlash = 0;
    return body;
  };

  /* Cria um pássaro. */
  AB.makeBird = function (type, x, y, scaleFactor) {
    var t = AB.BIRD_TYPES[type] || AB.BIRD_TYPES.red;
    var r = t.radius * (scaleFactor || 1);
    var body = Bodies.circle(x, y, r, {
      density: t.mass / (Math.PI * r * r),
      restitution: t.restitution,
      friction: t.friction,
      frictionStatic: 0.8,
      frictionAir: 0.0016,
      label: 'bird'
    });
    body.kind = 'bird';
    body.birdType = type;
    body.ability = t.ability;
    body.abilityUsed = false;
    body.r = r;
    body.spawnedAt = global.performance ? global.performance.now() : Date.now();
    return body;
  };

  /* ============================================================
     DESENHO
     ============================================================ */

  /* ---- bloco ---- */
  AB.drawBlock = function (ctx, body) {
    var mat = AB.MATERIALS[body.material] || AB.MATERIALS.wood;
    var w = body.w || body.bounds.max.x - body.bounds.min.x;
    var h = body.h || body.bounds.max.y - body.bounds.min.y;
    var damage = 1 - Math.max(0, body.hp) / body.maxHp;

    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);

    /* sombra */
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#000';
    AB.roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, Math.min(6, Math.min(w, h) * 0.22));
    ctx.fill();
    ctx.globalAlpha = 1;

    /* corpo com gradiente */
    var grad = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    grad.addColorStop(0, mat.light);
    grad.addColorStop(0.45, mat.fill);
    grad.addColorStop(1, mat.dark);

    ctx.fillStyle = grad;
    AB.roundRect(ctx, -w / 2, -h / 2, w, h, Math.min(6, Math.min(w, h) * 0.22));
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = mat.edge;
    ctx.stroke();

    /* realce interno */
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = mat.light;
    ctx.lineWidth = 1.5;
    AB.roundRect(ctx, -w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 5, Math.min(5, Math.min(w, h) * 0.18));
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* textura de veios (madeira) */
    if (body.material === 'wood') {
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = mat.edge;
      ctx.lineWidth = 1;
      var along = w >= h;
      for (var i = 1; i <= 2; i++) {
        ctx.beginPath();
        if (along) {
          ctx.moveTo(-w / 2 + 4, (-h / 2) + (h * i) / 3);
          ctx.lineTo(w / 2 - 4, (-h / 2) + (h * i) / 3);
        } else {
          ctx.moveTo((-w / 2) + (w * i) / 3, -h / 2 + 4);
          ctx.lineTo((-w / 2) + (w * i) / 3, h / 2 - 4);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    /* brilho do gelo */
    if (body.material === 'ice') {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 5, h / 2 - 6);
      ctx.lineTo(-w / 2 + 5 + Math.min(w, h) * 0.35, -h / 2 + 6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    /* rachaduras conforme o dano */
    if (damage > 0.18) {
      var rnd = AB.hash(body.id + body.material);
      var cracks = Math.round(1 + damage * 5);
      ctx.globalAlpha = Math.min(0.85, damage + 0.2);
      ctx.strokeStyle = body.material === 'ice' ? '#ffffff' : '#2b1608';
      ctx.lineWidth = 1 + damage * 1.6;
      ctx.lineCap = 'round';
      for (var c = 0; c < cracks; c++) {
        var sx = (rnd() - 0.5) * w * 0.8;
        var sy = (rnd() - 0.5) * h * 0.8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (rnd() - 0.5) * w * 0.45, sy + (rnd() - 0.5) * h * 0.45);
        ctx.lineTo(sx + (rnd() - 0.5) * w * 0.7, sy + (rnd() - 0.5) * h * 0.7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineCap = 'butt';
    }

    ctx.restore();
  };

  /* ---- porco ---- */
  AB.drawPig = function (ctx, body, time) {
    var r = body.r;
    var damage = 1 - Math.max(0, body.hp) / body.maxHp;
    var hurt = body.hurtFlash > 0;

    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle * 0.35);

    /* sombra */
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(2, 3, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* corpo */
    var grad = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.05);
    grad.addColorStop(0, hurt ? '#b9ff9e' : '#a8ec74');
    grad.addColorStop(0.6, hurt ? '#8fe26a' : '#69c245');
    grad.addColorStop(1, damage > 0.5 ? '#3f7d2a' : '#4f9c33');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2f6b1d';
    ctx.stroke();

    /* orelhas */
    ctx.fillStyle = '#57a836';
    ctx.strokeStyle = '#2f6b1d';
    ctx.lineWidth = 1.5;
    [-1, 1].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.5, -r * 0.78);
      ctx.quadraticCurveTo(s * r * 0.85, -r * 1.25, s * r * 0.95, -r * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    /* focinho */
    var snoutR = r * 0.42;
    ctx.fillStyle = '#8fdd63';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.1, snoutR, snoutR * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#3f8a29';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#2f6b1d';
    [-1, 1].forEach(function (s) {
      ctx.beginPath();
      ctx.ellipse(s * snoutR * 0.42, r * 0.1, snoutR * 0.16, snoutR * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    /* olhos */
    var eyeX = r * 0.34, eyeY = -r * 0.3, eyeR = r * 0.2;
    ctx.fillStyle = '#fff';
    [-1, 1].forEach(function (s) {
      ctx.beginPath();
      ctx.arc(s * eyeX, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3a6b28';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    var blink = (time % 3400) < 130 ? 0.12 : 1;
    var look = damage > 0.4 ? -r * 0.05 : 0;
    ctx.fillStyle = '#16233a';
    [-1, 1].forEach(function (s) {
      ctx.beginPath();
      ctx.ellipse(s * eyeX + r * 0.05, eyeY + look, eyeR * 0.45, eyeR * 0.55 * blink, 0, 0, Math.PI * 2);
      ctx.fill();
    });

    /* sobrancelhas quando machucado */
    if (damage > 0.3) {
      ctx.strokeStyle = '#1f4415';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      [-1, 1].forEach(function (s) {
        ctx.beginPath();
        ctx.moveTo(s * (eyeX - eyeR), eyeY - eyeR * 1.25);
        ctx.lineTo(s * (eyeX + eyeR * 0.5), eyeY - eyeR * 0.75);
        ctx.stroke();
      });
      ctx.lineCap = 'butt';
    }

    /* hematoma */
    if (damage > 0.55) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#7a2f8f';
      ctx.beginPath();
      ctx.arc(-r * 0.55, r * 0.45, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  /* ---- pássaro ---- */
  AB.drawBird = function (ctx, body, time) {
    var t = AB.BIRD_TYPES[body.birdType] || AB.BIRD_TYPES.red;
    var r = body.r;

    ctx.save();
    ctx.translate(body.position.x, body.position.y);
    ctx.rotate(body.angle);

    /* sombra */
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(2, 3, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* cauda */
    ctx.fillStyle = t.body2;
    ctx.beginPath();
    ctx.moveTo(-r * 0.75, -r * 0.2);
    ctx.lineTo(-r * 1.75, -r * 0.72);
    ctx.lineTo(-r * 1.6, -r * 0.05);
    ctx.lineTo(-r * 1.8, r * 0.55);
    ctx.lineTo(-r * 0.75, r * 0.35);
    ctx.closePath();
    ctx.fill();

    /* corpo */
    var grad = ctx.createRadialGradient(-r * 0.32, -r * 0.42, r * 0.15, 0, 0, r * 1.08);
    grad.addColorStop(0, t.belly);
    grad.addColorStop(0.42, t.body);
    grad.addColorStop(1, t.body2);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = t.body2;
    ctx.stroke();

    /* barriga */
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = t.belly;
    ctx.beginPath();
    ctx.ellipse(r * 0.08, r * 0.42, r * 0.52, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    /* topete */
    ctx.fillStyle = t.crest;
    ctx.beginPath();
    ctx.moveTo(-r * 0.3, -r * 0.92);
    ctx.quadraticCurveTo(-r * 0.05, -r * 1.6, r * 0.28, -r * 0.9);
    ctx.closePath();
    ctx.fill();

    /* olhos */
    var eyeX = r * 0.28, eyeY = -r * 0.28, eyeR = r * 0.27;
    ctx.fillStyle = '#fff';
    [0.0, 1].forEach(function (k, i) {
      ctx.beginPath();
      ctx.arc(eyeX + i * r * 0.42, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.22)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.fillStyle = '#14233b';
    [0, 1].forEach(function (i) {
      ctx.beginPath();
      ctx.arc(eyeX + i * r * 0.42 + r * 0.06, eyeY + r * 0.02, eyeR * 0.46, 0, Math.PI * 2);
      ctx.fill();
    });

    /* sobrancelhas bravas */
    ctx.strokeStyle = '#3a1a12';
    ctx.lineWidth = r * 0.15;
    ctx.lineCap = 'round';
    [0, 1].forEach(function (i) {
      ctx.beginPath();
      ctx.moveTo(eyeX + i * r * 0.42 - eyeR * 0.9, eyeY - eyeR * 1.15);
      ctx.lineTo(eyeX + i * r * 0.42 + eyeR * 0.9, eyeY - eyeR * 0.62);
      ctx.stroke();
    });
    ctx.lineCap = 'butt';

    /* bico */
    ctx.fillStyle = t.beak;
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(r * 0.62, -r * 0.02);
    ctx.lineTo(r * 1.42, r * 0.16);
    ctx.lineTo(r * 0.62, r * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    /* brilho de habilidade disponível */
    if (body.ability && body.ability !== 'none' && !body.abilityUsed && body.launched) {
      ctx.globalAlpha = 0.35 + Math.sin(time / 120) * 0.25;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  };

  /* ---- estilingue ----
     Desenhado em duas camadas: "back" antes do pássaro, "front" depois,
     para que o pássaro fique entre as duas borrachas.
     anchorX/anchorY = posição da bolsa (onde o pássaro está preso). */

  var BAND_BACK_X = -31, BAND_FRONT_X = 31;

  function prong(ctx, x, fromY, ctrlX, ctrlY, tipX, tipY, width, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, fromY);
    ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  AB.drawSlingBack = function (ctx, anchorX, anchorY) {
    var x = AB.SLING.x, base = AB.SLING.baseY, top = AB.SLING.y;
    var junctionY = top + 62;

    /* tronco afunilado */
    ctx.fillStyle = '#7d5226';
    ctx.beginPath();
    ctx.moveTo(x - 18, base + 8);
    ctx.quadraticCurveTo(x - 12, base - 70, x - 10, junctionY);
    ctx.lineTo(x + 10, junctionY);
    ctx.quadraticCurveTo(x + 12, base - 70, x + 18, base + 8);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#55320f';
    ctx.lineWidth = 2;
    ctx.stroke();

    /* realce do tronco */
    ctx.strokeStyle = 'rgba(255,255,255,.14)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 5, base - 20);
    ctx.lineTo(x - 5, junctionY + 12);
    ctx.stroke();

    /* haste esquerda */
    prong(ctx, x - 7, junctionY + 10, x - 30, junctionY - 22, x + BAND_BACK_X, top - 20, 13, '#6b4622');

    /* borracha traseira */
    ctx.strokeStyle = '#3d1f0d';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + BAND_BACK_X, top - 18);
    ctx.lineTo(anchorX, anchorY);
    ctx.stroke();
    ctx.lineCap = 'butt';
  };

  /* Borracha dianteira + bolsa de couro (desenhadas ANTES do pássaro). */
  AB.drawSlingFrontBand = function (ctx, anchorX, anchorY) {
    var x = AB.SLING.x, top = AB.SLING.y;

    ctx.strokeStyle = '#5a2f16';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + BAND_FRONT_X, top - 18);
    ctx.lineTo(anchorX, anchorY);
    ctx.stroke();

    /* bolsa de couro */
    ctx.fillStyle = '#33200f';
    ctx.beginPath();
    ctx.ellipse(anchorX, anchorY, 8, 13, Math.atan2(anchorY - top, anchorX - x), 0, Math.PI * 2);
    ctx.fill();
    ctx.lineCap = 'butt';
  };

  /* Haste dianteira (desenhada DEPOIS do pássaro, para prendê-lo na bolsa). */
  AB.drawSlingForkFront = function (ctx) {
    var x = AB.SLING.x, top = AB.SLING.y;
    var junctionY = top + 62;
    prong(ctx, x + 7, junctionY + 10, x + 30, junctionY - 22, x + BAND_FRONT_X, top - 20, 13, '#8a5c2c');
  };

})(window);
