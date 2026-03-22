'use strict';

const { aabbOverlap } = require('./game');
const { PLAYER_SIZE, BOT_SPEED } = require('./config');

/**
 * Check whether moving the bot by (vx, vy) would land it inside an obstacle.
 */
function isBotDirBlocked(bot, vx, vy, obstacles) {
  const tx = bot.x + vx;
  const ty = bot.y + vy;
  for (const ob of obstacles) {
    if (aabbOverlap(tx, ty, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) return true;
  }
  return false;
}

/**
 * Update bot velocity toward the nearest alive player.
 * Tries 4 directions in priority order (primary chase axis first).
 * Respects retargetAt cooldown unless bot is stuck (vx=0, vy=0).
 *
 * @param {object} bot       - bot state object (mutated)
 * @param {number} now       - current timestamp (ms)
 * @param {object} players   - map of id → player state
 * @param {Array}  obstacles - obstacle array
 */
function updateBotAI(bot, now, players, obstacles) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    const dx = p.x - bot.x;
    const dy = p.y - bot.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist < nearestDist) { nearestDist = dist; nearest = p; }
  }

  const isStuck = bot.vx === 0 && bot.vy === 0;
  if (!nearest || (!isStuck && now < bot.retargetAt)) return;
  bot.retargetAt = now + (isStuck ? 100 : 500);

  const dx = nearest.x - bot.x;
  const dy = nearest.y - bot.y;

  // Priority: chase dominant axis first, then perpendicular, then opposites
  const dirs = Math.abs(dx) > Math.abs(dy)
    ? [
        [dx > 0 ? BOT_SPEED : -BOT_SPEED, 0],
        [0, dy > 0 ? BOT_SPEED : -BOT_SPEED],
        [0, dy > 0 ? -BOT_SPEED : BOT_SPEED],
        [dx > 0 ? -BOT_SPEED : BOT_SPEED, 0],
      ]
    : [
        [0, dy > 0 ? BOT_SPEED : -BOT_SPEED],
        [dx > 0 ? BOT_SPEED : -BOT_SPEED, 0],
        [dx > 0 ? -BOT_SPEED : BOT_SPEED, 0],
        [0, dy > 0 ? -BOT_SPEED : BOT_SPEED],
      ];

  for (const [vx, vy] of dirs) {
    if (!isBotDirBlocked(bot, vx, vy, obstacles)) {
      bot.vx = vx;
      bot.vy = vy;
      return;
    }
  }
  bot.vx = 0;
  bot.vy = 0;
}

module.exports = { isBotDirBlocked, updateBotAI };
