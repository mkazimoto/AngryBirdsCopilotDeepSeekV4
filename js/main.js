/* ============================================================
   Angry Birds — Interface e inicialização
   Conecta o canvas, o HUD, o overlay e os controles ao motor.
   ============================================================ */

(function () {
  'use strict';

  var AB = window.AB;

  /* Detecta dispositivo de toque: o CSS usa `html.touch` para trocar os
     textos de ajuda e aumentar os alvos de toque. */
  var isTouch = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints || 0) > 0;
  document.documentElement.classList.toggle('touch', isTouch);

  var canvas = document.getElementById('game');
  var app = document.getElementById('app');

  var el = {
    score: document.getElementById('score'),
    levelNum: document.getElementById('levelNum'),
    birdQueue: document.getElementById('birdQueue'),
    hint: document.getElementById('hint'),
    overlay: document.getElementById('overlay'),
    ovTitle: document.getElementById('ovTitle'),
    ovText: document.getElementById('ovText'),
    ovStars: document.getElementById('ovStars'),
    ovPrimary: document.getElementById('ovPrimary'),
    ovSecondary: document.getElementById('ovSecondary'),
    btnRestart: document.getElementById('btnRestart'),
    btnSound: document.getElementById('btnSound'),
    btnAbility: document.getElementById('btnAbility'),
    btnFull: document.getElementById('btnFull')
  };

  var game = new AB.Game(canvas);

  var paused = true;          /* travado enquanto o overlay está aberto */
  var blocked = false;        /* travado enquanto o celular está na vertical */
  var overlayMode = 'start';
  var overlayData = null;
  var hintTimer = null;
  var musicStarted = false;
  var starTimers = [];

  /* ---------------------------------------------------------- HUD */

  function fmt(n) {
    return n.toLocaleString('pt-BR');
  }

  function renderBirdChips(list) {
    el.birdQueue.innerHTML = '';
    list.forEach(function (item) {
      var chip = document.createElement('span');
      chip.className = 'bird-chip' + (item.used ? ' spent' : '');
      chip.style.background = AB.BIRD_TYPES[item.type].body;
      chip.title = AB.BIRD_TYPES[item.type].name;
      el.birdQueue.appendChild(chip);
    });
  }

  function setHint(text) {
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
    if (!text) {
      el.hint.classList.remove('show');
      return;
    }
    el.hint.textContent = text;
    el.hint.classList.add('show');
    hintTimer = setTimeout(function () { el.hint.classList.remove('show'); }, 4600);
  }

  /* ---------------------------------------------------------- overlay */

  function clearStars() {
    starTimers.forEach(clearTimeout);
    starTimers = [];
    el.ovStars.innerHTML = '';
  }

  var INTRO = 'Arraste o pássaro para trás e solte para lançar. Derrube todos os porcos usando a ' +
    'física a seu favor — <strong>madeira</strong> quebra fácil, <strong>pedra</strong> resiste ' +
    'e o <strong>gelo</strong> estilhaça. Toque (ou clique) durante o voo para usar a habilidade da ave.';

  function showOverlay(mode, data) {
    overlayMode = mode;
    overlayData = data || null;
    clearStars();

    if (mode === 'start') {
      el.ovTitle.textContent = 'Angry Birds';
      el.ovText.innerHTML = INTRO;
      el.ovPrimary.textContent = 'Jogar';
      el.ovSecondary.hidden = true;
    } else if (mode === 'win') {
      el.ovTitle.textContent = 'Fase concluída!';
      el.ovText.innerHTML = 'Você fez <strong>' + fmt(data.score) + '</strong> pontos em ' +
        '<strong>' + data.level.name + '</strong>.';
      el.ovPrimary.textContent = data.hasNext ? 'Próxima fase' : 'Jogar de novo';
      el.ovSecondary.hidden = false;
      el.ovSecondary.textContent = 'Repetir fase';

      /* três estrelas; as conquistadas acendem em sequência */
      for (var k = 0; k < 3; k++) {
        var star = document.createElement('span');
        star.className = 'star';
        star.textContent = '★';
        el.ovStars.appendChild(star);
      }
      for (var j = 0; j < Math.min(3, data.stars); j++) {
        (function (idx) {
          starTimers.push(setTimeout(function () {
            el.ovStars.children[idx].classList.add('on');
          }, 220 + idx * 230));
        })(j);
      }
    } else {
      el.ovTitle.textContent = 'Os porcos venceram!';
      el.ovText.innerHTML = 'Ainda restam porcos em <strong>' + data.level.name +
        '</strong>. Tente outra trajetória ou use a habilidade da ave.';
      el.ovPrimary.textContent = 'Tentar de novo';
      el.ovSecondary.hidden = true;
    }

    el.overlay.classList.add('show');
    paused = true;
  }

  function hideOverlay() {
    el.overlay.classList.remove('show');
    clearStars();
    paused = false;
  }

  /* ---------------------------------------------------------- áudio */

  function bootAudio() {
    game.audio.resume();
    if (!musicStarted) {
      game.audio.startMusic();
      musicStarted = true;
    }
  }

  function toggleSound() {
    var on = game.audio.toggle();
    el.btnSound.textContent = on ? '🔊' : '🔇';
    el.btnSound.classList.toggle('off', !on);
    if (on) bootAudio();
  }

  /* ---------------------------------------------------------- tela cheia */

  function fullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  function requestFullscreen(silent) {
    var root = document.documentElement;
    var req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!req) {
      if (!silent) setHint('Tela cheia não é suportada neste navegador.');
      return;
    }
    try {
      var result = req.call(root, { navigationUI: 'hide' });
      if (result && result.then) {
        result.then(function () {
          /* Tenta travar em paisagem (só funciona com tela cheia). */
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(function () { /* ignora */ });
          }
        }).catch(function () {
          if (!silent) setHint('Não foi possível entrar em tela cheia.');
        });
      }
    } catch (err) {
      if (!silent) setHint('Não foi possível entrar em tela cheia.');
    }
  }

  function toggleFullscreen() {
    bootAudio();
    game.audio.ui();
    if (fullscreenElement()) {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
      return;
    }
    requestFullscreen(false);
  }

  /* ---------------------------------------------------------- ações */

  function primaryAction() {
    bootAudio();
    game.audio.ui();
    if (overlayMode === 'start') {
      /* No celular entra em tela cheia já no primeiro toque (modo paisagem). */
      if (isTouch) requestFullscreen(true);
      hideOverlay();
      game.loadLevel(0);
    } else if (overlayMode === 'win') {
      hideOverlay();
      if (overlayData && overlayData.hasNext) game.nextLevel();
      else game.loadLevel(0);
    } else {
      hideOverlay();
      game.restart();
    }
  }

  function restartLevel() {
    game.audio.ui();
    hideOverlay();
    game.restart();
  }

  /* ---------------------------------------------------------- controles */

  canvas.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    if (paused || blocked) return;
    /* Em telas multitoque, apenas o primeiro dedo controla o estilingue. */
    if (e.isPrimary === false) return;
    bootAudio();
    if (canvas.setPointerCapture && e.pointerId != null) {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
    }
    var p = game.screenToWorld(e.clientX, e.clientY);
    game.pointerDown(p.x, p.y);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (paused || blocked || e.isPrimary === false) return;
    e.preventDefault();
    var p = game.screenToWorld(e.clientX, e.clientY);
    game.pointerMove(p.x, p.y);
  });

  canvas.addEventListener('pointerup', function (e) {
    e.preventDefault();
    if (paused || blocked || e.isPrimary === false) return;
    game.pointerUp();
  });

  canvas.addEventListener('pointercancel', function () {
    if (!paused && !blocked) game.pointerUp();
  });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    var key = e.key ? e.key.toLowerCase() : '';

    if (key === ' ' || key === 'spacebar' || e.code === 'Space') {
      e.preventDefault();
      if (!paused) {
        bootAudio();
        game.triggerAbility();
      }
      return;
    }

    if (key === 'r') {
      if (!paused) restartLevel();
      return;
    }

    if (key === 'm') {
      toggleSound();
      return;
    }

    if (key === 'f') {
      toggleFullscreen();
      return;
    }

    if (key === 'enter' && paused) {
      e.preventDefault();
      primaryAction();
    }
  });

  el.ovPrimary.addEventListener('click', primaryAction);
  el.ovSecondary.addEventListener('click', restartLevel);

  el.btnRestart.addEventListener('click', function () {
    bootAudio();
    restartLevel();
  });

  el.btnSound.addEventListener('click', function () {
    if (!musicStarted) bootAudio();
    toggleSound();
  });

  el.btnAbility.addEventListener('click', function () {
    if (paused || blocked) return;
    bootAudio();
    game.triggerAbility();
  });

  el.btnFull.addEventListener('click', toggleFullscreen);

  /* ---------------------------------------------------------- eventos do jogo */

  game.onStateChange = function (evt, data) {
    if (evt === 'score') {
      el.score.textContent = fmt(data);
    } else if (evt === 'levelstart') {
      el.levelNum.textContent = data.index + 1;
      el.score.textContent = '0';
    } else if (evt === 'birds') {
      renderBirdChips(data);
    } else if (evt === 'hint') {
      setHint(data);
    } else if (evt === 'levelend') {
      setTimeout(function () { showOverlay(data.win ? 'win' : 'lose', data); }, 620);
    }
  };

  /* ---------------------------------------------------------- loop */

  var lastTs = 0;

  function frame(ts) {
    var dt = lastTs ? ts - lastTs : 16.67;
    lastTs = ts;

    if (!paused && !blocked) game.update(dt);
    game.render();

    el.btnAbility.classList.toggle('off', !game.abilityReady());

    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- resize */

  var resizeTimer = null;

  /* Redimensiona com um pequeno atraso: em celulares o navegador informa as
     dimensões antigas logo após girar a tela ou esconder a barra de endereço. */
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      resizeTimer = null;
      game.resize();
    }, 90);
  }

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  /* No celular a barra de endereço muda a altura visível sem disparar
     `resize`, por isso observamos também o visualViewport. */
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onResize);
  }

  /* O jogo não tem nada para ampliar: bloqueia o zoom por pinça no iOS. */
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (type) {
    document.addEventListener(type, function (e) { e.preventDefault(); }, { passive: false });
  });

  /* Ao voltar para a aba, zera o relógio para não acumular tempo parado. */
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) lastTs = 0;
  });

  if (window.ResizeObserver && app) {
    new ResizeObserver(function () { game.resize(); }).observe(app);
  }

  /* ---------------------------------------------------------- orientação */

  /* O canvas é 16:9; na vertical de um celular sobraria uma faixa minúscula.
     Nesse caso o jogo pausa e aparece o aviso para girar o aparelho.
     A condição exige toque para não bloquear janelas estreitas no desktop. */
  var rotateMq = window.matchMedia
    ? window.matchMedia('(orientation: portrait) and (max-width: 900px)')
    : null;

  function applyOrientation() {
    blocked = isTouch && !!(rotateMq && rotateMq.matches);
    document.documentElement.classList.toggle('portrait-blocked', blocked);
    if (blocked) {
      /* Com o aviso na tela o jogo fica parado: a trilha também para. */
      if (game.audio.musicOn) game.audio.stopMusic();
    } else {
      if (musicStarted && !game.audio.musicOn) game.audio.startMusic();
      game.resize();
    }
  }

  if (rotateMq) {
    if (rotateMq.addEventListener) rotateMq.addEventListener('change', applyOrientation);
    else if (rotateMq.addListener) rotateMq.addListener(applyOrientation);
  }

  window.addEventListener('orientationchange', function () {
    applyOrientation();
    setTimeout(applyOrientation, 250);
  });

  /* ---------------------------------------------------------- início */

  game.loadLevel(0);
  game.resize();
  showOverlay('start');
  applyOrientation();
  requestAnimationFrame(frame);

  /* Exposto para depuração/testes no console do navegador. */
  window.ABGame = game;
})();
