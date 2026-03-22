'use strict';

// ── Game constants ─────────────────────────────────────────────────────
const ARENA_W         = 1600;
const ARENA_H         = 1080;
const PLAYER_SIZE     = 40;
const PLAYER_SPEED    = 4;
const COIN_SIZE       = 30;
const INVULN_MS       = 2000;
const rawAdminPassword = process.env.ADMIN_PASSWORD;
const ADMIN_PASSWORD  = rawAdminPassword || 'demo123';
if (process.env.NODE_ENV === 'production') {
  if (!rawAdminPassword || rawAdminPassword === 'demo123') {
    throw new Error(
      'Set a strong ADMIN_PASSWORD in production (not empty, not demo123).'
    );
  }
}
const TICK_RATE       = 60;
const MAX_PLAYERS     = 32;
const BULLET_SPEED    = 10;
const BULLET_SIZE     = 10;
const BULLET_MAX_DIST = 600;
const SHOOT_COOLDOWN_MS = 800;
const MAX_SHOTS       = 10;
const OBSTACLE_COUNT  = 20;
const OBS_SIZE        = 50;
const BOT_COUNT       = 2;
const BOT_SPEED       = 3;

// ── Obstacles ──────────────────────────────────────────────────────────
const OBSTACLE_TYPES = ['tree', 'stone', 'lake'];
const OBS_SIZES = {
  tree:  { w: OBS_SIZE, h: OBS_SIZE },
  stone: { w: OBS_SIZE, h: OBS_SIZE },
  lake:  { w: OBS_SIZE, h: OBS_SIZE },
};

// ── Color + emoji pools ────────────────────────────────────────────────
const NEON_COLORS = [
  '#FF00FF', '#00FFFF', '#FF3366', '#33FF99', '#FFFF00',
  '#FF6600', '#66FF33', '#FF0099', '#00FF66', '#9933FF',
  '#FF3300', '#00CCFF', '#CCFF00', '#FF0066', '#33CCFF',
  '#FF9900', '#66CCFF', '#CC33FF', '#00FF99', '#FF6633',
];

const PLAYER_EMOJIS = [
  // People
  '🧑‍🚀', '🧑‍🎤', '🧜‍♀️', '🧛', '🧟', '🦸', '🦹', '🧑‍🎄', '👷', '💂',
  '🧑‍🍳', '🧑‍🚒', '🥷', '🧙', '🧝', '🎅',
  // Animals
  '🦊', '🐸', '🐵', '🦁', '🐯', '🐮', '🐷', '🦄', '🐙', '🦋',
  '🦜', '🐠', '🦀', '🐊', '🦩', '🐞', '🐝', '🦑', '🐳', '🦧',
  // Vehicles
  '🚗', '🏎️', '🚕', '🚒', '🚑', '🚀', '🛸', '🚁', '🛵', '🚜',
  '🛺', '🚤', '🚂', '⛵',
];

const BOT_EMOJIS = ['🤖', '👾'];

const COIN_EMOJIS = [
  // Fruits
  '🍎', '🍌', '🍇', '🍓', '🍑', '🍉', '🍋', '🫐', '🍒', '🥭', '🍍', '🥝',
  // Vegetables
  '🥑', '🥕', '🌽', '🥦', '🥬', '🫑', '🥒', '🍆',
  // Meals
  '🍕', '🍔', '🌮', '🌯', '🍟', '🥙', '🥗', '🍜', '🍝', '🥘',
  // Snacks & sweets
  '🍩', '🍪', '🎂', '🍫', '🍿', '🥜', '🥨',
  // Drinks
  '🥤', '🧃', '🍵', '☕', '🧋', '🍹', '🥥', '🍺', '🥂', '🧉',
];

// ── Name pools ─────────────────────────────────────────────────────────
const NAME_ADJ = [
  'Turbo', 'Mega', 'Ultra', 'Super', 'Hyper', 'Nitro', 'Neon', 'Cosmic',
  'Funky', 'Wild', 'Crazy', 'Epic', 'Mighty', 'Swift', 'Brave', 'Tiny',
  'Giant', 'Magic', 'Sneaky', 'Lucky', 'Dizzy', 'Fuzzy', 'Zippy', 'Jolly',
  'Fiery', 'Icy', 'Stormy', 'Sunny', 'Shadow', 'Golden', 'Pixel', 'Laser',
];
const NAME_NOUN = [
  'Racer', 'Comet', 'Flash', 'Bolt', 'Rocket', 'Blaze', 'Storm', 'Thunder',
  'Ninja', 'Pirate', 'Viking', 'Knight', 'Wizard', 'Panda', 'Tiger', 'Fox',
  'Shark', 'Eagle', 'Wolf', 'Bear', 'Falcon', 'Dragon', 'Phoenix', 'Waffle',
  'Taco', 'Pickle', 'Muffin', 'Banana', 'Nugget', 'Cookie', 'Noodle', 'Pretzel',
];

module.exports = {
  ARENA_W, ARENA_H, PLAYER_SIZE, PLAYER_SPEED, COIN_SIZE, INVULN_MS,
  ADMIN_PASSWORD, TICK_RATE, MAX_PLAYERS, BULLET_SPEED, BULLET_SIZE,
  BULLET_MAX_DIST, SHOOT_COOLDOWN_MS, MAX_SHOTS, OBSTACLE_COUNT, OBS_SIZE,
  BOT_COUNT, BOT_SPEED,
  OBSTACLE_TYPES, OBS_SIZES,
  NEON_COLORS, PLAYER_EMOJIS, BOT_EMOJIS, COIN_EMOJIS,
  NAME_ADJ, NAME_NOUN,
};
