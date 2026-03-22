'use strict';

const {
  ARENA_W, ARENA_H, PLAYER_SIZE, BULLET_SPEED, BULLET_MAX_DIST,
  OBSTACLE_COUNT, OBS_SIZE, OBSTACLE_TYPES,
  aabbOverlap, validateDir, wrapCoord,
  collidesWithObstacles, collidesWithEntities, isPositionBlocked,
  findSafeSpot, spawnPosition, generateObstacles,
  bounceVelocity, createBullets,
} = require('../src/game');

// ── aabbOverlap ──────────────────────────────────────────────────────────────

describe('aabbOverlap', () => {
  test('overlapping rectangles returns true', () => {
    expect(aabbOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
  });

  test('adjacent (touching) rectangles returns false', () => {
    expect(aabbOverlap(0, 0, 10, 10, 10, 0, 10, 10)).toBe(false);
  });

  test('non-overlapping returns false (gap on x)', () => {
    expect(aabbOverlap(0, 0, 10, 10, 20, 0, 10, 10)).toBe(false);
  });

  test('non-overlapping returns false (gap on y)', () => {
    expect(aabbOverlap(0, 0, 10, 10, 0, 20, 10, 10)).toBe(false);
  });

  test('one rect fully inside another', () => {
    expect(aabbOverlap(0, 0, 100, 100, 10, 10, 20, 20)).toBe(true);
  });

  test('identical rects overlap', () => {
    expect(aabbOverlap(5, 5, 10, 10, 5, 5, 10, 10)).toBe(true);
  });

  test('overlap only on x axis but not y', () => {
    expect(aabbOverlap(0, 0, 10, 10, 5, 20, 10, 10)).toBe(false);
  });
});

// ── validateDir ──────────────────────────────────────────────────────────────

describe('validateDir', () => {
  test.each(['up', 'down', 'left', 'right'])('"%s" is valid', dir => {
    expect(validateDir(dir)).toBe(true);
  });

  test.each(['UP', 'Down', 'diagonal', '', ' up', 'up ', 'forward'])(
    '"%s" is invalid', dir => {
      expect(validateDir(dir)).toBe(false);
    }
  );

  test('null is invalid', () => expect(validateDir(null)).toBe(false));
  test('undefined is invalid', () => expect(validateDir(undefined)).toBe(false));
  test('number is invalid', () => expect(validateDir(1)).toBe(false));
  test('object is invalid', () => expect(validateDir({})).toBe(false));
});

// ── wrapCoord ────────────────────────────────────────────────────────────────

describe('wrapCoord', () => {
  test('coordinate within range stays unchanged', () => {
    expect(wrapCoord(500, 1600, 40)).toBe(500);
  });

  test('coordinate past max wraps to -size', () => {
    expect(wrapCoord(1601, 1600, 40)).toBe(-40);
  });

  test('coordinate below -size wraps to max', () => {
    expect(wrapCoord(-41, 1600, 40)).toBe(1600);
  });

  test('coordinate exactly at max stays (boundary is exclusive)', () => {
    // v === max: condition is v > max, so no wrap
    expect(wrapCoord(1600, 1600, 40)).toBe(1600);
  });

  test('coordinate of 0 stays', () => {
    expect(wrapCoord(0, 1600, 40)).toBe(0);
  });
});

// ── collidesWithObstacles ────────────────────────────────────────────────────

describe('collidesWithObstacles', () => {
  const obstacles = [{ x: 100, y: 100, w: 50, h: 50 }];

  test('position overlapping obstacle returns true', () => {
    expect(collidesWithObstacles(110, 110, 20, obstacles)).toBe(true);
  });

  test('position clear of obstacle returns false', () => {
    expect(collidesWithObstacles(200, 200, 20, obstacles)).toBe(false);
  });

  test('padding extends collision zone', () => {
    // Just outside without pad
    expect(collidesWithObstacles(75, 100, 20, obstacles, 0)).toBe(false);
    // Same position with pad=10 should now collide
    expect(collidesWithObstacles(75, 100, 20, obstacles, 10)).toBe(true);
  });

  test('empty obstacles array always returns false', () => {
    expect(collidesWithObstacles(100, 100, 20, [])).toBe(false);
  });

  test('entity touching edge (no overlap) returns false', () => {
    expect(collidesWithObstacles(50, 100, 50, obstacles)).toBe(false);
  });
});

// ── collidesWithEntities ─────────────────────────────────────────────────────

describe('collidesWithEntities', () => {
  const players = {
    p1: { x: 100, y: 100, alive: true },
    p2: { x: 300, y: 300, alive: false },
  };
  const bots = {
    b1: { x: 200, y: 200 },
  };

  test('collision with alive player returns true', () => {
    expect(collidesWithEntities(100, 100, PLAYER_SIZE, players, {}, null)).toBe(true);
  });

  test('no collision with dead player', () => {
    expect(collidesWithEntities(300, 300, PLAYER_SIZE, players, {}, null)).toBe(false);
  });

  test('collision with bot returns true', () => {
    expect(collidesWithEntities(200, 200, PLAYER_SIZE, {}, bots, null)).toBe(true);
  });

  test('excludeId skips that player', () => {
    expect(collidesWithEntities(100, 100, PLAYER_SIZE, players, {}, 'p1')).toBe(false);
  });

  test('excludeId skips that bot', () => {
    expect(collidesWithEntities(200, 200, PLAYER_SIZE, {}, bots, 'b1')).toBe(false);
  });

  test('empty players and bots always returns false', () => {
    expect(collidesWithEntities(100, 100, PLAYER_SIZE, {}, {}, null)).toBe(false);
  });
});

// ── isPositionBlocked ────────────────────────────────────────────────────────

describe('isPositionBlocked', () => {
  const obstacles = [{ x: 400, y: 400, w: 50, h: 50 }];
  const players = { p1: { x: 200, y: 200, alive: true } };

  test('blocked by obstacle', () => {
    expect(isPositionBlocked(405, 405, PLAYER_SIZE, obstacles, {}, {}, null)).toBe(true);
  });

  test('blocked by player', () => {
    expect(isPositionBlocked(200, 200, PLAYER_SIZE, [], players, {}, null)).toBe(true);
  });

  test('clear position returns false', () => {
    expect(isPositionBlocked(700, 700, PLAYER_SIZE, obstacles, players, {}, null)).toBe(false);
  });

  test('excludeId allows spawn at own position', () => {
    expect(isPositionBlocked(200, 200, PLAYER_SIZE, [], players, {}, 'p1')).toBe(false);
  });
});

// ── findSafeSpot ─────────────────────────────────────────────────────────────

describe('findSafeSpot', () => {
  test('returns a position object with x and y', () => {
    const pos = findSafeSpot(PLAYER_SIZE, [], {}, {}, null);
    expect(pos).toHaveProperty('x');
    expect(pos).toHaveProperty('y');
  });

  test('returns safe position when arena is mostly clear', () => {
    const pos = findSafeSpot(PLAYER_SIZE, [], {}, {}, null);
    expect(pos.x).toBeGreaterThanOrEqual(100);
    expect(pos.y).toBeGreaterThanOrEqual(100);
    expect(pos.x).toBeLessThan(ARENA_W - 100);
    expect(pos.y).toBeLessThan(ARENA_H - 100);
  });

  test('falls back gracefully when arena is fully blocked', () => {
    // Huge obstacles cover everything — should still return something
    const bigObstacles = [{ x: 0, y: 0, w: ARENA_W, h: ARENA_H }];
    const pos = findSafeSpot(PLAYER_SIZE, bigObstacles, {}, {}, null);
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
  });
});

// ── generateObstacles ────────────────────────────────────────────────────────

describe('generateObstacles', () => {
  test('returns array of correct length', () => {
    const obs = generateObstacles();
    expect(obs.length).toBe(OBSTACLE_COUNT);
  });

  test('each obstacle has required properties', () => {
    const obs = generateObstacles();
    for (const o of obs) {
      expect(o).toHaveProperty('x');
      expect(o).toHaveProperty('y');
      expect(o).toHaveProperty('w');
      expect(o).toHaveProperty('h');
      expect(o).toHaveProperty('type');
    }
  });

  test('obstacle types are valid', () => {
    const obs = generateObstacles();
    for (const o of obs) {
      expect(OBSTACLE_TYPES).toContain(o.type);
    }
  });

  test('obstacle sizes match OBS_SIZE', () => {
    const obs = generateObstacles();
    for (const o of obs) {
      expect(o.w).toBe(OBS_SIZE);
      expect(o.h).toBe(OBS_SIZE);
    }
  });

  test('obstacles do not overlap each other (have gap between them)', () => {
    const obs = generateObstacles();
    for (let i = 0; i < obs.length; i++) {
      for (let j = i + 1; j < obs.length; j++) {
        const a = obs[i], b = obs[j];
        const overlap = aabbOverlap(a.x, a.y, a.w, a.h, b.x, b.y, b.w, b.h);
        expect(overlap).toBe(false);
      }
    }
  });

  test('deterministic with seeded rng', () => {
    let seed = 42;
    const seededRng = () => {
      seed = (seed * 1664525 + 1013904223) & 0xffffffff;
      return (seed >>> 0) / 0x100000000;
    };
    const obs1 = generateObstacles(seededRng);
    seed = 42;
    const obs2 = generateObstacles(seededRng);
    expect(obs1.map(o => o.x)).toEqual(obs2.map(o => o.x));
  });

  test('obstacles stay within arena margins', () => {
    const margin = 120;
    const obs = generateObstacles();
    for (const o of obs) {
      expect(o.x).toBeGreaterThanOrEqual(margin);
      expect(o.y).toBeGreaterThanOrEqual(margin);
      expect(o.x + o.w).toBeLessThanOrEqual(ARENA_W - margin);
      expect(o.y + o.h).toBeLessThanOrEqual(ARENA_H - margin);
    }
  });
});

// ── spawnPosition ────────────────────────────────────────────────────────────

describe('spawnPosition', () => {
  test('returns a position object with x and y', () => {
    const pos = spawnPosition([], {}, {}, null);
    expect(pos).toHaveProperty('x');
    expect(pos).toHaveProperty('y');
  });

  test('spawn is within arena margins', () => {
    const pos = spawnPosition([], {}, {}, null);
    expect(pos.x).toBeGreaterThan(0);
    expect(pos.y).toBeGreaterThan(0);
    expect(pos.x).toBeLessThan(ARENA_W);
    expect(pos.y).toBeLessThan(ARENA_H);
  });

  test('spawn does not collide with obstacles', () => {
    const obstacles = generateObstacles();
    const pos = spawnPosition(obstacles, {}, {}, null);
    expect(collidesWithObstacles(pos.x, pos.y, PLAYER_SIZE, obstacles)).toBe(false);
  });

  test('spawn does not collide with existing players', () => {
    const players = { p1: { x: 400, y: 400, alive: true } };
    const pos = spawnPosition([], players, {}, 'p_new');
    // Should not land on top of p1
    const collides = aabbOverlap(pos.x, pos.y, PLAYER_SIZE, PLAYER_SIZE, 400, 400, PLAYER_SIZE, PLAYER_SIZE);
    expect(collides).toBe(false);
  });

  test('uses custom rng', () => {
    const calls = [];
    const mockRng = () => { const v = 0.5; calls.push(v); return v; };
    spawnPosition([], {}, {}, null, mockRng);
    expect(calls.length).toBeGreaterThan(0);
  });
});

// ── bounceVelocity ───────────────────────────────────────────────────────────

describe('bounceVelocity', () => {
  // Obstacle far from test entities (used for "no obstacle" scenarios)
  const farObs = [{ x: 900, y: 900, w: 50, h: 50 }];

  // Obstacle at (300, 200) — entity hits it from the left, moving right
  // Entity pos (256, 200) size=40 → right edge at 296, touching obstacle at 300
  // vx=4, bounce-back at (252, 200) → right edge at 292 — clear of 300
  const rightObs = [{ x: 300, y: 200, w: 50, h: 50 }];

  test('reverses velocity when bounce-back position is clear', () => {
    const result = bounceVelocity(256, 200, 4, 0, PLAYER_SIZE, rightObs);
    expect(result.vx).toBe(-4);
    expect(result.vy + 0).toBe(0);
  });

  test('stops velocity when bounce-back is also blocked', () => {
    // Entity sandwiched: obstacle on right (300,200) and on left (210,200)
    const twoObs = [
      { x: 300, y: 200, w: 50, h: 50 },
      { x: 210, y: 200, w: 50, h: 50 },
    ];
    // At x=256 moving right (4,0): bounce-back at (252,200) → left edge 252, hits ob2 right edge 260
    const result = bounceVelocity(256, 200, 4, 0, PLAYER_SIZE, twoObs);
    expect(result.vx).toBe(0);
    expect(result.vy).toBe(0);
  });

  test('zero velocity: bounce-back position same, returns zeroed velocity', () => {
    const result = bounceVelocity(600, 600, 0, 0, PLAYER_SIZE, farObs);
    // -0 and 0 are equal for game purposes; use addition to normalize -0 → 0
    expect(result.vx + 0).toBe(0);
    expect(result.vy + 0).toBe(0);
  });

  test('reverses y velocity when bounce-back on y axis is clear', () => {
    // Obstacle at (600, 300), entity at (600, 256) moving down (0,4)
    // bounce-back at (600, 252) — top edge 252, obstacle at 300 — clear
    const downObs = [{ x: 600, y: 300, w: 50, h: 50 }];
    const result = bounceVelocity(600, 256, 0, 4, PLAYER_SIZE, downObs);
    expect(result.vx + 0).toBe(0);
    expect(result.vy).toBe(-4);
  });
});

// ── createBullets ────────────────────────────────────────────────────────────

describe('createBullets', () => {
  const bullets = createBullets(500, 500, 'player1', '#ff00ff');

  test('creates exactly 4 bullets', () => {
    expect(bullets.length).toBe(4);
  });

  test('all bullets start at given origin', () => {
    for (const b of bullets) {
      expect(b.x).toBe(500);
      expect(b.y).toBe(500);
    }
  });

  test('all bullets have correct ownerId and ownerColor', () => {
    for (const b of bullets) {
      expect(b.ownerId).toBe('player1');
      expect(b.ownerColor).toBe('#ff00ff');
    }
  });

  test('all bullets start with dist=0', () => {
    for (const b of bullets) {
      expect(b.dist).toBe(0);
    }
  });

  test('bullets cover all 4 cardinal directions', () => {
    const dirs = bullets.map(b => `${b.vx},${b.vy}`).sort();
    const expected = [
      `${-BULLET_SPEED},0`,
      `${BULLET_SPEED},0`,
      `0,${-BULLET_SPEED}`,
      `0,${BULLET_SPEED}`,
    ].sort();
    expect(dirs).toEqual(expected);
  });

  test('bullet speed matches BULLET_SPEED constant', () => {
    for (const b of bullets) {
      const speed = Math.abs(b.vx) + Math.abs(b.vy); // Manhattan for cardinal dirs
      expect(speed).toBe(BULLET_SPEED);
    }
  });
});
