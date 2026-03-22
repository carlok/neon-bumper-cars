'use strict';

// ── Constants ───────────────────────────────────────────────────────────
const ARENA_W       = 1600;
const ARENA_H       = 1080;
const PLAYER_SIZE   = 40;
const PLAYER_SPEED  = 4;
const BOT_SPEED     = 3;
const COIN_SIZE     = 30;
const BULLET_SPEED  = 10;
const BULLET_SIZE   = 10;
const BULLET_MAX_DIST = 600;
const INVULN_MS     = 2000;
const MAX_PLAYERS   = 32;
const MAX_SHOTS     = 10;
const SHOOT_COOLDOWN_MS = 800;
const OBSTACLE_COUNT = 20;
const OBS_SIZE      = 50;

const OBSTACLE_TYPES = ['tree', 'stone', 'lake'];
const OBS_SIZES = {
  tree:  { w: OBS_SIZE, h: OBS_SIZE },
  stone: { w: OBS_SIZE, h: OBS_SIZE },
  lake:  { w: OBS_SIZE, h: OBS_SIZE },
};

const VALID_DIRS = new Set(['up', 'down', 'left', 'right']);
const DIR_VECTORS = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
const ALL_DIRS = [[0,-1],[0,1],[-1,0],[1,0]];

// ── Pure helpers ────────────────────────────────────────────────────────

/**
 * Axis-aligned bounding-box overlap test.
 * Returns true if the two rectangles overlap.
 */
function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * Validate a swipe direction string. Returns true only for the four
 * allowed direction literals, rejecting any other type or value.
 */
function validateDir(dir) {
  return typeof dir === 'string' && VALID_DIRS.has(dir);
}

/**
 * Wrap a coordinate so entities exit one side and reappear on the other.
 * @param {number} v   - current position
 * @param {number} max - arena dimension
 * @param {number} size - entity size
 */
function wrapCoord(v, max, size) {
  if (v < -size) return max;
  if (v > max)   return -size;
  return v;
}

/**
 * Check whether a rectangular position collides with any obstacle,
 * optionally with a safety padding around each obstacle.
 */
function collidesWithObstacles(x, y, size, obstacles, pad = 0) {
  for (const ob of obstacles) {
    if (aabbOverlap(x, y, size, size,
        ob.x - pad, ob.y - pad,
        ob.w + pad * 2, ob.h + pad * 2)) return true;
  }
  return false;
}

/**
 * Check whether a rectangular position overlaps any alive player or bot,
 * excluding a specific id.
 */
function collidesWithEntities(x, y, size, players, bots, excludeId) {
  for (const id in players) {
    if (id === excludeId) continue;
    const p = players[id];
    if (!p.alive) continue;
    if (aabbOverlap(x, y, size, size, p.x, p.y, PLAYER_SIZE, PLAYER_SIZE)) return true;
  }
  for (const id in bots) {
    if (id === excludeId) continue;
    const b = bots[id];
    if (aabbOverlap(x, y, size, size, b.x, b.y, PLAYER_SIZE, PLAYER_SIZE)) return true;
  }
  return false;
}

/**
 * Full blocked check: obstacles (with safety pad) + other entities.
 */
function isPositionBlocked(x, y, size, obstacles, players, bots, excludeId) {
  return (
    collidesWithObstacles(x, y, size, obstacles, 10) ||
    collidesWithEntities(x, y, size, players, bots, excludeId)
  );
}

/**
 * Scan a grid to find the first clear spot. Used as fallback when random
 * rejection sampling fails.
 */
function findSafeSpot(size, obstacles, players, bots, excludeId) {
  const step = size + 10;
  for (let x = 100; x < ARENA_W - 100; x += step) {
    for (let y = 100; y < ARENA_H - 100; y += step) {
      if (!isPositionBlocked(x, y, size, obstacles, players, bots, excludeId)) {
        return { x, y };
      }
    }
  }
  return { x: 100, y: 100 }; // absolute last resort
}

/** Step between rigid bot-slot cell origins (no overlap at rest). */
const BOT_GRID_CELL_STEP = PLAYER_SIZE + 24;

/**
 * Top-left corner of the bot slot at index `slotIndex` (row-major grid).
 * @param {number} slotIndex - 0-based slot in row-major order
 * @param {number} [cellStep]
 * @returns {{ x: number, y: number }}
 */
function botSlotCorner(slotIndex, cellStep = BOT_GRID_CELL_STEP) {
  const margin = 100;
  const cols = Math.max(1, Math.floor((ARENA_W - 2 * margin) / cellStep));
  const row = Math.floor(slotIndex / cols);
  const col = slotIndex % cols;
  return { x: margin + col * cellStep, y: margin + row * cellStep };
}

/**
 * Pick up to `botCount` obstacle-free grid slots (rigid matrix). Each slot is
 * one cell; step >= PLAYER_SIZE keeps bots from overlapping at spawn.
 * @returns {Array<{ x: number, y: number, slotIndex: number }>}
 */
function pickBotGridSlots(botCount, obstacles, cellStep = BOT_GRID_CELL_STEP) {
  const picked = [];
  const margin = 100;
  const maxTry = 512; // scan past lower rows so high slot indices can be skipped when y exits arena
  for (let slot = 0; slot < maxTry && picked.length < botCount; slot++) {
    const { x, y } = botSlotCorner(slot, cellStep);
    if (x + PLAYER_SIZE > ARENA_W - margin || y + PLAYER_SIZE > ARENA_H - margin) {
      continue;
    }
    if (!collidesWithObstacles(x, y, PLAYER_SIZE, obstacles, 10)) {
      picked.push({ x, y, slotIndex: slot });
    }
  }
  return picked;
}

/**
 * Try anchor corner; if blocked by entities/obstacles, fall back to spawnPosition.
 */
function spawnBotAtAnchor(
  anchorX, anchorY, obstacles, players, bots, excludeId, rng = Math.random
) {
  if (!isPositionBlocked(anchorX, anchorY, PLAYER_SIZE, obstacles, players, bots, excludeId)) {
    return { x: anchorX, y: anchorY };
  }
  return spawnPosition(obstacles, players, bots, excludeId, rng);
}

/**
 * Random safe spawn for a player or bot.
 * @returns {{ x: number, y: number }}
 */
function spawnPosition(obstacles, players, bots, excludeId, rng = Math.random) {
  const margin = 150;
  for (let i = 0; i < 200; i++) {
    const x = margin + rng() * (ARENA_W - 2 * margin);
    const y = margin + rng() * (ARENA_H - 2 * margin);
    if (!isPositionBlocked(x, y, PLAYER_SIZE, obstacles, players, bots, excludeId)) {
      return { x, y };
    }
  }
  return findSafeSpot(PLAYER_SIZE, obstacles, players, bots, excludeId);
}

/**
 * Generate a set of non-overlapping obstacles with a guaranteed player-wide
 * gap between every pair.
 * @param {function} rng - random number generator, default Math.random
 * @returns {Array} obstacles array
 */
function generateObstacles(count = OBSTACLE_COUNT, rng = Math.random) {
  const obstacles = [];
  const margin = 120;
  const pad = PLAYER_SIZE; // minimum gap between obstacles
  let attempts = 0;
  while (obstacles.length < count && attempts < 500) {
    attempts++;
    const type = OBSTACLE_TYPES[Math.floor(rng() * OBSTACLE_TYPES.length)];
    const sz   = OBS_SIZES[type];
    const x    = margin + rng() * (ARENA_W - 2 * margin - sz.w);
    const y    = margin + rng() * (ARENA_H - 2 * margin - sz.h);
    let overlaps = false;
    for (const ob of obstacles) {
      if (aabbOverlap(x - pad, y - pad, sz.w + pad * 2, sz.h + pad * 2,
          ob.x, ob.y, ob.w, ob.h)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) obstacles.push({ x, y, w: sz.w, h: sz.h, type });
  }
  return obstacles;
}

/**
 * Compute the bounce-back velocity when a moving entity hits an obstacle.
 * Returns { vx, vy } — reversed if bounce is clear, zeroed if also blocked.
 */
function bounceVelocity(x, y, vx, vy, size, obstacles) {
  const bx = x - vx;
  const by = y - vy;
  const bounceBlocked = collidesWithObstacles(bx, by, size, obstacles);
  if (bounceBlocked) return { vx: 0, vy: 0 };
  return { vx: -vx, vy: -vy };
}

/**
 * Create 4 bullets (one per axis direction) from a given origin.
 */
function createBullets(cx, cy, ownerId, ownerColor) {
  return ALL_DIRS.map(([dvx, dvy]) => ({
    x: cx, y: cy,
    vx: dvx * BULLET_SPEED,
    vy: dvy * BULLET_SPEED,
    ownerId, ownerColor, dist: 0,
  }));
}

module.exports = {
  // constants
  ARENA_W, ARENA_H, PLAYER_SIZE, PLAYER_SPEED, BOT_SPEED,
  COIN_SIZE, BULLET_SPEED, BULLET_SIZE, BULLET_MAX_DIST,
  INVULN_MS, MAX_PLAYERS, MAX_SHOTS, SHOOT_COOLDOWN_MS,
  OBSTACLE_COUNT, OBS_SIZE, OBSTACLE_TYPES, OBS_SIZES,
  VALID_DIRS, DIR_VECTORS, ALL_DIRS,
  BOT_GRID_CELL_STEP,
  // functions
  aabbOverlap, validateDir, wrapCoord,
  collidesWithObstacles, collidesWithEntities, isPositionBlocked,
  findSafeSpot, spawnPosition, generateObstacles,
  botSlotCorner, pickBotGridSlots, spawnBotAtAnchor,
  bounceVelocity, createBullets,
};
