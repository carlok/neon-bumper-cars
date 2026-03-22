'use strict';

const { isBotDirBlocked, updateBotAI } = require('../src/bot');
const { PLAYER_SIZE, BOT_SPEED } = require('../src/config');

// ── isBotDirBlocked ──────────────────────────────────────────────────────────

describe('isBotDirBlocked', () => {
  const obstacle = { x: 100, y: 100, w: 50, h: 50 };

  test('clear path returns false', () => {
    const bot = { x: 300, y: 300 };
    expect(isBotDirBlocked(bot, BOT_SPEED, 0, [obstacle])).toBe(false);
  });

  test('blocked path returns true (right)', () => {
    // Bot at (58, 100), moving right by BOT_SPEED=3 → next x=61
    // Entity right edge: 61+40=101 > obstacle left=100 → overlap
    const bot = { x: 58, y: 100 };
    expect(isBotDirBlocked(bot, BOT_SPEED, 0, [obstacle])).toBe(true);
  });

  test('blocked path returns true (down)', () => {
    const bot = { x: 100, y: 58 };
    expect(isBotDirBlocked(bot, 0, BOT_SPEED, [obstacle])).toBe(true);
  });

  test('blocked path returns true (left)', () => {
    // Bot at (140, 100), moving left by -3 → next x=137
    // right edge = 137+40 = 177 > 100, left edge 137 < 150 → overlap
    const bot = { x: 140, y: 100 };
    expect(isBotDirBlocked(bot, -BOT_SPEED, 0, [obstacle])).toBe(true);
  });

  test('empty obstacle list never blocks', () => {
    const bot = { x: 50, y: 50 };
    expect(isBotDirBlocked(bot, BOT_SPEED, 0, [])).toBe(false);
    expect(isBotDirBlocked(bot, 0, BOT_SPEED, [])).toBe(false);
  });

  test('zero velocity: stays in place, no block if clear', () => {
    const bot = { x: 300, y: 300 };
    expect(isBotDirBlocked(bot, 0, 0, [obstacle])).toBe(false);
  });
});

// ── updateBotAI ──────────────────────────────────────────────────────────────

describe('updateBotAI', () => {
  test('chases horizontally when x-distance dominates', () => {
    const bot = { x: 100, y: 400, vx: 0, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 500, y: 400, alive: true } }; // dx=400, dy=0
    updateBotAI(bot, 0, players, []);
    expect(bot.vx).toBe(BOT_SPEED);
    expect(bot.vy + 0).toBe(0);
  });

  test('chases vertically when y-distance dominates', () => {
    const bot = { x: 400, y: 100, vx: 0, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 400, y: 600, alive: true } }; // dx=0, dy=500
    updateBotAI(bot, 0, players, []);
    expect(bot.vy).toBe(BOT_SPEED);
    expect(bot.vx + 0).toBe(0);
  });

  test('moves left when player is to the left', () => {
    const bot = { x: 500, y: 300, vx: 0, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 100, y: 300, alive: true } };
    updateBotAI(bot, 0, players, []);
    expect(bot.vx).toBe(-BOT_SPEED);
  });

  test('moves up when player is above', () => {
    const bot = { x: 300, y: 500, vx: 0, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 300, y: 100, alive: true } };
    updateBotAI(bot, 0, players, []);
    expect(bot.vy).toBe(-BOT_SPEED);
  });

  test('does nothing when no players exist', () => {
    const bot = { x: 100, y: 100, vx: BOT_SPEED, vy: 0, retargetAt: 0 };
    updateBotAI(bot, 0, {}, []);
    expect(bot.vx).toBe(BOT_SPEED); // unchanged
  });

  test('does nothing when all players are dead', () => {
    const bot = { x: 100, y: 100, vx: 1, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 500, y: 100, alive: false } };
    updateBotAI(bot, 0, players, []);
    expect(bot.vx).toBe(1); // unchanged
  });

  test('respects retargetAt cooldown when not stuck', () => {
    const bot = { x: 100, y: 400, vx: BOT_SPEED, vy: 0, retargetAt: 9999999 };
    const players = { p1: { x: 500, y: 400, alive: true } };
    updateBotAI(bot, 0, players, []);
    expect(bot.vx).toBe(BOT_SPEED); // not changed — cooldown active
  });

  test('overrides retargetAt when stuck (vx=0, vy=0)', () => {
    const bot = { x: 100, y: 400, vx: 0, vy: 0, retargetAt: 9999999 };
    const players = { p1: { x: 500, y: 400, alive: true } };
    updateBotAI(bot, 0, players, []);
    expect(bot.vx).toBe(BOT_SPEED); // stuck override fired
  });

  test('updates retargetAt after normal move (+500ms)', () => {
    // vx!=0 so isStuck=false → retargetAt = now + 500
    const bot = { x: 100, y: 400, vx: BOT_SPEED, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 500, y: 400, alive: true } };
    updateBotAI(bot, 1000, players, []);
    expect(bot.retargetAt).toBe(1500);
  });

  test('updates retargetAt to +100ms when stuck', () => {
    const bot = { x: 100, y: 400, vx: 0, vy: 0, retargetAt: 9999999 };
    const players = { p1: { x: 500, y: 400, alive: true } };
    updateBotAI(bot, 1000, players, []);
    expect(bot.retargetAt).toBe(1100);
  });

  test('stops (vx=vy=0) when all 4 directions are blocked', () => {
    // Large obstacle surrounding bot on all sides
    const obs = [{ x: 200, y: 200, w: 200, h: 200 }];
    const bot = { x: 220, y: 220, vx: BOT_SPEED, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 600, y: 220, alive: true } };
    updateBotAI(bot, 0, players, obs);
    expect(bot.vx + 0).toBe(0);
    expect(bot.vy + 0).toBe(0);
  });

  test('picks nearest of multiple players', () => {
    const bot = { x: 400, y: 400, vx: 0, vy: 0, retargetAt: 0 };
    const players = {
      far:   { x: 800, y: 400, alive: true }, // dx=400
      close: { x: 450, y: 400, alive: true }, // dx=50  ← nearest
    };
    updateBotAI(bot, 0, players, []);
    expect(bot.vx).toBe(BOT_SPEED); // chases right toward 'close'
  });

  test('dist < nearestDist false branch: skips farther player when nearer already found', () => {
    // close is inserted first → becomes nearest (dist=50); far (dist=400) hits the false branch
    const bot = { x: 400, y: 400, vx: 0, vy: 0, retargetAt: 0 };
    const players = {
      close: { x: 450, y: 400, alive: true }, // dist=50  ← already nearest when far is evaluated
      far:   { x: 800, y: 400, alive: true }, // dist=400 → dist < nearestDist is FALSE
    };
    updateBotAI(bot, 0, players, []);
    expect(bot.vx).toBe(BOT_SPEED); // still chases close
  });

  test('horizontal-first with dy > 0 covers dy>0 ternary branches on secondary dirs', () => {
    // abs(dx)=400 > abs(dy)=10 → horizontal-first; dy=10>0 exercises dy>0 branches on lines 51-52
    const bot = { x: 100, y: 100, vx: 0, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 500, y: 110, alive: true } }; // dx=400, dy=10
    updateBotAI(bot, 0, players, []);
    expect(bot.vx).toBe(BOT_SPEED); // primary: chase right
  });

  test('vertical-first with dx > 0 covers dx>0 ternary branches on secondary dirs', () => {
    // abs(dy)=500 > abs(dx)=50 → vertical-first; dx=50>0 exercises dx>0 branches on lines 57-58
    const bot = { x: 300, y: 100, vx: 0, vy: 0, retargetAt: 0 };
    const players = { p1: { x: 350, y: 600, alive: true } }; // dx=50, dy=500
    updateBotAI(bot, 0, players, []);
    expect(bot.vy).toBe(BOT_SPEED); // primary: chase down
  });
});
