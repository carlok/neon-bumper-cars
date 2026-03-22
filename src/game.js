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
/** Same as PLAYER_SIZE — one column/row in the world grid (matches display calibration). */
const OBS_SIZE      = 40;

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

/** World grid cell = player tile (40×40); arena 1600×1080 → 40×27 cells. */
const WORLD_GRID_CELL = PLAYER_SIZE;

function arenaGridMetrics(cellStep = WORLD_GRID_CELL) {
  const cols = Math.max(1, Math.floor(ARENA_W / cellStep));
  const rows = Math.max(1, Math.floor(ARENA_H / cellStep));
  return { cols, rows, total: cols * rows };
}

/**
 * Top-left of grid slot `slotIndex` (row-major, origin top-left of arena).
 * @param {number} slotIndex
 * @param {number} [cellStep]
 * @returns {{ x: number, y: number }}
 */
function gridCellOrigin(slotIndex, cellStep = WORLD_GRID_CELL) {
  const { cols } = arenaGridMetrics(cellStep);
  const row = Math.floor(slotIndex / cols);
  const col = slotIndex % cols;
  return { x: col * cellStep, y: row * cellStep };
}

function findSafeSpot(size, obstacles, players, bots, excludeId) {
  const step = WORLD_GRID_CELL;
  for (let x = 0; x <= ARENA_W - size; x += step) {
    for (let y = 0; y <= ARENA_H - size; y += step) {
      if (!isPositionBlocked(x, y, size, obstacles, players, bots, excludeId)) {
        return { x, y };
      }
    }
  }
  return { x: 0, y: 0 }; // absolute last resort
}

/** Bot home tiles use the same step as every other entity (aligned columns/rows). */
const BOT_GRID_CELL_STEP = WORLD_GRID_CELL;

/**
 * @deprecated Use gridCellOrigin — kept as alias for tests and bot spawn.
 */
function botSlotCorner(slotIndex, cellStep = BOT_GRID_CELL_STEP) {
  return gridCellOrigin(slotIndex, cellStep);
}

/**
 * Pick up to `botCount` obstacle-free grid slots (rigid matrix). Each slot is
 * one cell; step >= PLAYER_SIZE keeps bots from overlapping at spawn.
 * @returns {Array<{ x: number, y: number, slotIndex: number }>}
 */
function pickBotGridSlots(botCount, obstacles, cellStep = BOT_GRID_CELL_STEP) {
  const picked = [];
  const { total } = arenaGridMetrics(cellStep);
  for (let slot = 0; slot < total && picked.length < botCount; slot++) {
    const { x, y } = gridCellOrigin(slot, cellStep);
    if (x + PLAYER_SIZE > ARENA_W || y + PLAYER_SIZE > ARENA_H) {
      continue;
    }
    // pad 0: tile-aligned; pad>0 would mark neighbour cells as blocked
    if (!collidesWithObstacles(x, y, PLAYER_SIZE, obstacles, 0)) {
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
  const { total } = arenaGridMetrics(WORLD_GRID_CELL);
  for (let i = 0; i < 200; i++) {
    const slot = Math.floor(rng() * total);
    const { x, y } = gridCellOrigin(slot, WORLD_GRID_CELL);
    if (!isPositionBlocked(x, y, PLAYER_SIZE, obstacles, players, bots, excludeId)) {
      return { x, y };
    }
  }
  return findSafeSpot(PLAYER_SIZE, obstacles, players, bots, excludeId);
}

/**
 * Shuffle indices [0..n) in place (Fisher–Yates).
 * @param {number[]} arr
 * @param {function} rng
 */
function shuffleIndices(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

/**
 * One obstacle per grid cell — same 40×40 tile as players; no overlap, aligned rows/columns.
 * @param {function} rng - random number generator, default Math.random
 * @returns {Array} obstacles array
 */
function generateObstacles(count = OBSTACLE_COUNT, rng = Math.random) {
  const { total } = arenaGridMetrics(WORLD_GRID_CELL);
  const take = Math.min(count, total);
  const indices = Array.from({ length: total }, (_, i) => i);
  shuffleIndices(indices, rng);
  const obstacles = [];
  for (let k = 0; k < take; k++) {
    const slot = indices[k];
    const { x, y } = gridCellOrigin(slot, WORLD_GRID_CELL);
    const type = OBSTACLE_TYPES[Math.floor(rng() * OBSTACLE_TYPES.length)];
    const sz = OBS_SIZES[type];
    obstacles.push({ x, y, w: sz.w, h: sz.h, type });
  }
  return obstacles;
}

/**
 * Top-left for a coin (COIN_SIZE×COIN_SIZE) centered in a random clear grid cell.
 * @param {Array} obstacles
 * @param {function} [rng]
 * @returns {{ x: number, y: number }}
 */
function randomClearCoinTopLeft(obstacles, rng = Math.random) {
  const inset = (WORLD_GRID_CELL - COIN_SIZE) / 2;
  const { total } = arenaGridMetrics(WORLD_GRID_CELL);
  for (let i = 0; i < 200; i++) {
    const slot = Math.floor(rng() * total);
    const { x: cx, y: cy } = gridCellOrigin(slot, WORLD_GRID_CELL);
    const x = cx + inset;
    const y = cy + inset;
    if (!obstacles.some(ob => aabbOverlap(x, y, COIN_SIZE, COIN_SIZE, ob.x, ob.y, ob.w, ob.h))) {
      return { x, y };
    }
  }
  return {
    x: Math.max(0, Math.min(ARENA_W - COIN_SIZE, ARENA_W / 2 - COIN_SIZE / 2)),
    y: Math.max(0, Math.min(ARENA_H - COIN_SIZE, ARENA_H / 2 - COIN_SIZE / 2)),
  };
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
  WORLD_GRID_CELL,
  BOT_GRID_CELL_STEP,
  // functions
  aabbOverlap, validateDir, wrapCoord,
  collidesWithObstacles, collidesWithEntities, isPositionBlocked,
  findSafeSpot, spawnPosition, generateObstacles,
  arenaGridMetrics, gridCellOrigin,
  botSlotCorner, pickBotGridSlots, spawnBotAtAnchor,
  randomClearCoinTopLeft,
  bounceVelocity, createBullets,
};
