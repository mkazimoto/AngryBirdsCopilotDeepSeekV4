/* ============================================================
   Angry Birds — Níveis
   Cada nível descreve os blocos, os porcos e a fila de pássaros.

   Convenções de coordenadas:
     blk(x, bottomY, w, h, material)  -> o bloco apoia a base em bottomY
     pig(x, bottomY, r)               -> o porco apoia a base em bottomY
   AB.GROUND_Y (640) é o topo do chão.
   ============================================================ */

(function (global) {
  'use strict';

  var AB = (global.AB = global.AB || {});

  /* Bloco apoiado: bottomY é a coordenada y onde fica a base do bloco. */
  function blk(x, bottomY, w, h, material, angle) {
    return { x: x, y: bottomY - h / 2, w: w, h: h, material: material, angle: angle || 0 };
  }

  /* Porco apoiado. */
  function pig(x, bottomY, r) {
    return { x: x, y: bottomY - (r || 30), r: r || 30 };
  }

  AB.LEVELS = [

    /* ---------------------------------------------------------- 1 */
    {
      name: 'Primeiros Passos',
      subtitle: 'Mire, estique a borracha e solte!',
      sky: ['#7dc4f5', '#c9e9ff', '#eaf7ff'],
      birds: ['red', 'red', 'yellow'],
      stars: [16000, 26000, 34000],
      blocks: [
        blk(980, 640, 26, 150, 'wood'),
        blk(1170, 640, 26, 150, 'wood'),
        blk(1075, 490, 216, 26, 'wood')
      ],
      pigs: [
        pig(1075, 640),
        pig(1075, 464)
      ]
    },

    /* ---------------------------------------------------------- 2 */
    {
      name: 'Cabana de Madeira',
      subtitle: 'Derube a torre e esmague os porcos.',
      sky: ['#78bdf0', '#c4e6ff', '#eef8ff'],
      birds: ['red', 'yellow', 'red', 'black'],
      stars: [24000, 36000, 46000],
      blocks: [
        /* torre principal */
        blk(880, 640, 26, 150, 'wood'),
        blk(1100, 640, 26, 150, 'wood'),
        blk(990, 490, 246, 26, 'wood'),

        blk(910, 464, 24, 110, 'wood'),
        blk(1070, 464, 24, 110, 'wood'),
        blk(990, 354, 184, 24, 'wood'),

        /* abrigo da direita */
        blk(1150, 640, 26, 110, 'wood'),
        blk(1270, 640, 26, 110, 'wood'),
        blk(1210, 530, 146, 24, 'wood')
      ],
      pigs: [
        pig(990, 640),
        pig(990, 464),
        pig(990, 330),
        pig(1210, 506)
      ]
    },

    /* ---------------------------------------------------------- 3 */
    {
      name: 'Torre de Gelo',
      subtitle: 'O gelo quebra fácil — o azul se divide em três.',
      sky: ['#6fb6e8', '#bfe4ff', '#f0fbff'],
      birds: ['blue', 'red', 'yellow', 'blue'],
      stars: [22000, 34000, 44000],
      blocks: [
        blk(700, 640, 26, 120, 'ice'),
        blk(820, 640, 26, 120, 'ice'),
        blk(760, 520, 146, 24, 'wood'),

        blk(940, 640, 26, 160, 'ice'),
        blk(1180, 640, 26, 160, 'ice'),
        blk(1060, 480, 266, 26, 'ice'),

        blk(960, 454, 24, 110, 'ice'),
        blk(1160, 454, 24, 110, 'ice'),
        blk(1060, 344, 230, 24, 'stone')
      ],
      pigs: [
        pig(1060, 640),
        pig(1060, 454),
        pig(1060, 320)
      ]
    },

    /* ---------------------------------------------------------- 4 */
    {
      name: 'Muralha de Pedra',
      subtitle: 'Pedra resiste muito. Use o pássaro preto a seu favor.',
      sky: ['#5f9fd0', '#a9d3f2', '#e8f5ff'],
      birds: ['red', 'black', 'yellow', 'black', 'red'],
      stars: [28000, 40000, 52000],
      blocks: [
        /* muralha de pedra — dois porcos abrigados dentro */
        blk(880, 640, 30, 150, 'stone'),
        blk(1100, 640, 30, 150, 'stone'),
        blk(990, 490, 250, 26, 'stone'),

        /* madeira no alto */
        blk(920, 464, 24, 80, 'wood'),
        blk(1060, 464, 24, 80, 'wood'),
        blk(990, 384, 164, 24, 'wood'),

        /* abrigo de gelo */
        blk(1180, 640, 26, 130, 'ice'),
        blk(1270, 640, 26, 130, 'ice'),
        blk(1225, 510, 116, 24, 'wood')
      ],
      pigs: [
        pig(950, 640),
        pig(1040, 640),
        pig(990, 360),
        pig(1225, 640)
      ]
    },

    /* ---------------------------------------------------------- 5 */
    {
      name: 'Castelo do Rei Porco',
      subtitle: 'A fortaleza final. Todas as aves entram em campo.',
      sky: ['#4d84b8', '#9dc6e8', '#e2f1ff'],
      birds: ['red', 'yellow', 'blue', 'black', 'yellow', 'black'],
      stars: [42000, 58000, 72000],
      blocks: [
        /* parede de gelo na frente */
        blk(590, 640, 26, 120, 'ice'),
        blk(690, 640, 26, 120, 'ice'),
        blk(640, 520, 126, 24, 'wood'),

        /* ala esquerda */
        blk(750, 640, 28, 170, 'stone'),
        blk(950, 640, 28, 170, 'stone'),
        blk(850, 470, 228, 26, 'wood'),
        blk(780, 444, 24, 120, 'wood'),
        blk(920, 444, 24, 120, 'wood'),
        blk(850, 324, 164, 24, 'wood'),

        /* ala direita */
        blk(1070, 640, 28, 170, 'stone'),
        blk(1270, 640, 28, 170, 'stone'),
        blk(1170, 470, 228, 26, 'ice'),
        blk(1100, 444, 24, 120, 'ice'),
        blk(1240, 444, 24, 120, 'ice'),
        blk(1170, 324, 164, 24, 'wood'),

        /* torre central do rei */
        blk(1010, 640, 34, 250, 'stone'),
        blk(1010, 390, 96, 30, 'stone')
      ],
      pigs: [
        pig(850, 640),
        pig(850, 300),
        pig(1170, 640),
        pig(1170, 300),
        pig(1010, 360, 32)
      ]
    }
  ];

  /* Pontuação */
  AB.SCORE_COMBO = { pig: 5000, block: 500, birdLeft: 10000 };

})(window);
