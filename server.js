'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');

const {
  ARENA_W, ARENA_H, PLAYER_SIZE, PLAYER_SPEED, COIN_SIZE, INVULN_MS,
  ADMIN_PASSWORD, TICK_RATE, MAX_PLAYERS, BULLET_SPEED, BULLET_SIZE,
  BULLET_MAX_DIST, SHOOT_COOLDOWN_MS, MAX_SHOTS, OBSTACLE_COUNT,
  BOT_COUNT, BOT_EMOJIS,
  NEON_COLORS, PLAYER_EMOJIS, COIN_EMOJIS,
  NAME_ADJ, NAME_NOUN,
} = require('./src/config');
const { aabbOverlap, generateObstacles, spawnPosition } = require('./src/game');
const { updateBotAI } = require('./src/bot');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── State ──────────────────────────────────────────────────────────────
let gameState     = 'WAITING'; // WAITING | PLAYING | STOPPED
const players     = {};        // socketId → player
const bots        = {};        // botId    → bot
let obstacles     = [];        // { x, y, w, h, type }
const coins       = [];        // [{ x, y, emoji }, ...]  — count scales with player count
const bullets     = [];        // { x, y, vx, vy, ownerId, ownerColor, dist }
let colorIndex    = 0;
let autoplayActive = false;
const AUTOPLAY_COUNT = MAX_PLAYERS; // 32 fake players for stress testing

// ── Helpers ───────────────────────────────────────────────────────────
function nextColor() {
  return NEON_COLORS[(colorIndex++) % NEON_COLORS.length];
}
function nextFaceEmoji() {
  const used = new Set(Object.values(players).map(p => p.emoji));
  const pool = PLAYER_EMOJIS.filter(e => !used.has(e));
  const source = pool.length > 0 ? pool : PLAYER_EMOJIS;
  return source[Math.floor(Math.random() * source.length)];
}
function randomCoinEmoji() {
  return COIN_EMOJIS[Math.floor(Math.random() * COIN_EMOJIS.length)];
}
function randomName() {
  const adj  = NAME_ADJ [Math.floor(Math.random() * NAME_ADJ .length)];
  const noun = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${adj} ${noun}`;
}

// ── Obstacle count helper ─────────────────────────────────────────────
// Fewer obstacles when more players (more room to move).
// Formula: max(4, 20 - floor(playerCount / 2))
function obstacleCount(playerCount) {
  return Math.max(4, OBSTACLE_COUNT - Math.floor(playerCount / 2));
}

// ── Autoplay ──────────────────────────────────────────────────────────
function startAutoplay() {
  autoplayActive = true;
  for (let i = 0; i < AUTOPLAY_COUNT; i++) {
    const id  = `auto-${i}`;
    const pos = spawnPosition(obstacles, players, bots, id);
    players[id] = {
      id, x: pos.x, y: pos.y, vx: 0, vy: 0,
      color: nextColor(), emoji: nextFaceEmoji(), name: randomName(),
      score: 0, lives: 3,
      invulnUntil: Date.now() + INVULN_MS, alive: true, facing: 'up',
      lastShotAt: 0, shotsLeft: MAX_SHOTS, isAutoplay: true,
    };
  }
  console.log(`[AUTOPLAY] Started ${AUTOPLAY_COUNT} autoplay bots`);
}

function stopAutoplay() {
  for (let i = 0; i < AUTOPLAY_COUNT; i++) {
    const id = `auto-${i}`;
    if (players[id]) {
      io.to('display').emit('player-left', id);
      delete players[id];
    }
  }
  autoplayActive = false;
  console.log('[AUTOPLAY] Stopped');
}

// ── Coins ─────────────────────────────────────────────────────────────
// Target: 1 coin for every 2 alive players (min 1).
function coinTarget() {
  const alive = Object.values(players).filter(p => p.alive).length;
  return Math.max(1, Math.ceil(alive / 2));
}
function makeCoin() {
  for (let i = 0; i < 200; i++) {
    const x = 80 + Math.random() * (ARENA_W - 160);
    const y = 80 + Math.random() * (ARENA_H - 160);
    if (!obstacles.some(ob => aabbOverlap(x, y, COIN_SIZE, COIN_SIZE, ob.x, ob.y, ob.w, ob.h))) {
      return { x, y, emoji: randomCoinEmoji() };
    }
  }
  return { x: ARENA_W / 2, y: ARENA_H / 2, emoji: randomCoinEmoji() };
}
function maintainCoins() {
  while (coins.length < coinTarget()) {
    const c = makeCoin();
    coins.push(c);
    io.to('display').emit('coin-spawned', c);
  }
}

// ── Bots ──────────────────────────────────────────────────────────────
function spawnBots() {
  for (let i = 0; i < BOT_COUNT; i++) {
    const id  = `bot-${i}`;
    const pos = spawnPosition(obstacles, players, bots, id);
    bots[id]  = {
      id, x: pos.x, y: pos.y, vx: 0, vy: 0,
      color: '#FF0000', emoji: BOT_EMOJIS[i % BOT_EMOJIS.length],
      isBot: true, invulnUntil: 0, alive: true,
      retargetAt: 0, stuckSince: 0,
      lastX: pos.x, lastY: pos.y,
    };
    console.log(`[BOT] Spawned ${id} at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
  }
}

// ── Init ──────────────────────────────────────────────────────────────
obstacles = generateObstacles();
maintainCoins();
spawnBots();

// ── Socket.IO ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[CONN] New connection: ${socket.id}`);

  socket.on('join-display', () => {
    console.log(`[DISPLAY] Display joined: ${socket.id}`);
    socket.join('display');
    socket.emit('init', { obstacles, gameState, coins, bots });
  });

  socket.on('join-admin', () => {
    console.log(`[ADMIN] Admin joined: ${socket.id}`);
    socket.join('admin');
    socket.emit('gameStateChange', gameState);
  });

  socket.on('join-player', () => {
    console.log(`[PLAYER] join-player from: ${socket.id}`);
    const playerCount = Object.keys(players).length;
    if (playerCount >= MAX_PLAYERS) {
      console.log(`[PLAYER] Room full (${playerCount}/${MAX_PLAYERS}), rejecting ${socket.id}`);
      socket.emit('room-full');
      return;
    }
    const pos   = spawnPosition(obstacles, players, bots, socket.id);
    const color = nextColor();
    const emoji = nextFaceEmoji();
    const name  = randomName();
    players[socket.id] = {
      id: socket.id, x: pos.x, y: pos.y, vx: 0, vy: 0,
      color, emoji, name, score: 0, lives: 3,
      invulnUntil: Date.now() + INVULN_MS, alive: true, facing: 'up',
      lastShotAt: 0, shotsLeft: MAX_SHOTS,
    };
    console.log(`[PLAYER] Created: ${socket.id}, name=${name}, color=${color}`);
    socket.emit('player-info', { color, emoji, name, gameState });
    io.to('display').emit('player-joined', players[socket.id]);
  });

  socket.on('rejoin-player', () => {
    const p = players[socket.id];
    if (!p || p.alive) return;
    console.log(`[PLAYER] rejoin-player from: ${socket.id}, name=${p.name}`);
    const pos = spawnPosition(obstacles, players, bots, socket.id);
    Object.assign(p, {
      x: pos.x, y: pos.y, vx: 0, vy: 0,
      score: 0, lives: 3, alive: true,
      invulnUntil: Date.now() + INVULN_MS, shotsLeft: MAX_SHOTS,
    });
    socket.emit('player-info', { color: p.color, emoji: p.emoji, name: p.name, score: 0, shotsLeft: MAX_SHOTS, gameState });
    io.to('display').emit('player-joined', p);
  });

  socket.on('admin-start', (pw) => {
    console.log(`[ADMIN] admin-start, pw match: ${pw === ADMIN_PASSWORD}`);
    if (pw !== ADMIN_PASSWORD) return;
    // Regenerate obstacles based on current real player count
    const humanCount = Object.values(players).filter(p => !p.isAutoplay).length;
    obstacles = generateObstacles(obstacleCount(humanCount));
    // Respawn all bots and alive players to valid positions in the new layout
    for (const botId in bots) {
      const pos = spawnPosition(obstacles, players, bots, botId);
      Object.assign(bots[botId], { x: pos.x, y: pos.y, vx: 0, vy: 0 });
    }
    for (const pid in players) {
      const p = players[pid];
      if (!p.alive) continue;
      const pos = spawnPosition(obstacles, players, bots, pid);
      Object.assign(p, { x: pos.x, y: pos.y, vx: 0, vy: 0 });
    }
    // Invalidate existing coins — they may now overlap new obstacles
    coins.splice(0);
    maintainCoins();
    io.to('display').emit('obstacles-reset', obstacles);
    gameState = 'PLAYING';
    io.emit('gameStateChange', gameState);
    console.log(`[ADMIN] Obstacles regenerated: count=${obstacles.length} for ${humanCount} players`);
  });

  socket.on('admin-stop', (pw) => {
    console.log(`[ADMIN] admin-stop, pw match: ${pw === ADMIN_PASSWORD}`);
    if (pw !== ADMIN_PASSWORD) return;
    if (autoplayActive) stopAutoplay();
    gameState = 'STOPPED';
    io.emit('gameStateChange', gameState);
  });

  socket.on('admin-autoplay', (pw) => {
    console.log(`[ADMIN] admin-autoplay, pw match: ${pw === ADMIN_PASSWORD}`);
    if (pw !== ADMIN_PASSWORD) return;
    // Use minimum obstacles for max-player stress test
    obstacles = generateObstacles(obstacleCount(AUTOPLAY_COUNT));
    for (const botId in bots) {
      const pos = spawnPosition(obstacles, players, bots, botId);
      Object.assign(bots[botId], { x: pos.x, y: pos.y, vx: 0, vy: 0 });
    }
    for (const pid in players) {
      const p = players[pid];
      if (!p.alive) continue;
      const pos = spawnPosition(obstacles, players, bots, pid);
      Object.assign(p, { x: pos.x, y: pos.y, vx: 0, vy: 0 });
    }
    coins.splice(0);
    io.to('display').emit('obstacles-reset', obstacles);
    startAutoplay();
    maintainCoins(); // after autoplay bots exist so coinTarget() is correct
    gameState = 'PLAYING';
    io.emit('gameStateChange', gameState);
  });

  socket.on('swipe', (dir) => {
    const p = players[socket.id];
    if (!p || !p.alive || gameState !== 'PLAYING') return;
    const map = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] };
    const d = map[dir];
    if (!d) return;
    p.vx = d[0] * PLAYER_SPEED;
    p.vy = d[1] * PLAYER_SPEED;
    p.facing = dir;
  });

  socket.on('shoot', () => {
    const p = players[socket.id];
    if (!p || !p.alive || gameState !== 'PLAYING') {
      console.log(`[SHOOT] Rejected: id=${socket.id}, alive=${p?.alive}, state=${gameState}`);
      return;
    }
    if (p.shotsLeft <= 0) { socket.emit('shot-fired-ack', { shotsLeft: 0 }); return; }
    const now = Date.now();
    if (now - p.lastShotAt < SHOOT_COOLDOWN_MS) return;
    p.lastShotAt = now;
    p.shotsLeft--;
    console.log(`[SHOOT] ${p.name} fired, shotsLeft=${p.shotsLeft}`);
    const cx = p.x + PLAYER_SIZE / 2 - BULLET_SIZE / 2;
    const cy = p.y + PLAYER_SIZE / 2 - BULLET_SIZE / 2;
    for (const [dvx, dvy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      bullets.push({ x: cx, y: cy, vx: dvx * BULLET_SPEED, vy: dvy * BULLET_SPEED, ownerId: socket.id, ownerColor: p.color, dist: 0 });
    }
    io.to('display').emit('shot-fired', { x: cx, y: cy, color: p.color });
    socket.emit('shot-fired-ack', { shotsLeft: p.shotsLeft });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[CONN] Disconnected: ${socket.id}, reason: ${reason}, wasPlayer: ${!!players[socket.id]}`);
    if (players[socket.id]) {
      io.to('display').emit('player-left', socket.id);
      delete players[socket.id];
    }
  });
});

// ── Game Loop (60 FPS) ────────────────────────────────────────────────
setInterval(() => {
  if (gameState !== 'PLAYING') return;
  const now = Date.now();
  const alivePlayers = [];

  // ── Player movement ──────────────────────────────────────────────
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;

    let nx = p.x + p.vx;
    let ny = p.y + p.vy;

    // Wrap around arena edges
    if (nx < -PLAYER_SIZE) nx = ARENA_W;
    else if (nx > ARENA_W) nx = -PLAYER_SIZE;
    if (ny < -PLAYER_SIZE) ny = ARENA_H;
    else if (ny > ARENA_H) ny = -PLAYER_SIZE;

    // Obstacle bounce
    if (obstacles.some(ob => aabbOverlap(nx, ny, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h))) {
      const bx = p.x - p.vx;
      const by = p.y - p.vy;
      if (!obstacles.some(ob => aabbOverlap(bx, by, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h))) {
        p.vx = -p.vx; p.vy = -p.vy;
      } else {
        p.vx = 0; p.vy = 0;
      }
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit('blocked');
    } else {
      p.x = nx; p.y = ny;
    }

    // Coin pickup
    for (let ci = coins.length - 1; ci >= 0; ci--) {
      const c = coins[ci];
      if (aabbOverlap(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE, c.x, c.y, COIN_SIZE, COIN_SIZE)) {
        p.score += 10;
        const sock = io.sockets.sockets.get(id);
        if (sock) sock.emit('score', p.score);
        io.to('display').emit('coin-eaten', { playerId: id, cx: c.x, cy: c.y });
        coins.splice(ci, 1);
        maintainCoins();
        break; // one coin per tick per player
      }
    }

    alivePlayers.push(p);
  }

  // ── Player–player collisions ─────────────────────────────────────
  for (let i = 0; i < alivePlayers.length; i++) {
    for (let j = i + 1; j < alivePlayers.length; j++) {
      const a = alivePlayers[i];
      const b = alivePlayers[j];
      if (!a.alive || !b.alive) continue;
      if (now < a.invulnUntil || now < b.invulnUntil) continue;
      if (!aabbOverlap(a.x, a.y, PLAYER_SIZE, PLAYER_SIZE, b.x, b.y, PLAYER_SIZE, PLAYER_SIZE)) continue;

      a.vx = -a.vx || PLAYER_SPEED * (Math.random() > 0.5 ? 1 : -1);
      a.vy = -a.vy || PLAYER_SPEED * (Math.random() > 0.5 ? 1 : -1);
      b.vx = -b.vx || PLAYER_SPEED * (Math.random() > 0.5 ? 1 : -1);
      b.vy = -b.vy || PLAYER_SPEED * (Math.random() > 0.5 ? 1 : -1);
      if (Math.abs(a.vx) > 0) a.vy = 0; else a.vx = 0;
      if (Math.abs(b.vx) > 0) b.vy = 0; else b.vx = 0;

      a.lives--; b.lives--;
      a.invulnUntil = now + INVULN_MS;
      b.invulnUntil = now + INVULN_MS;

      const sockA = io.sockets.sockets.get(a.id);
      const sockB = io.sockets.sockets.get(b.id);
      if (sockA) sockA.emit('collision', { lives: a.lives });
      if (sockB) sockB.emit('collision', { lives: b.lives });
      io.to('display').emit('bump', { a: a.id, b: b.id, ax: a.x, ay: a.y, bx: b.x, by: b.y });

      if (a.lives <= 0) { a.alive = false; if (sockA) sockA.emit('eliminated'); io.to('display').emit('player-eliminated', a.id); }
      if (b.lives <= 0) { b.alive = false; if (sockB) sockB.emit('eliminated'); io.to('display').emit('player-eliminated', b.id); }
    }
  }

  // ── Autoplay bot AI (random walk) ────────────────────────────────
  if (autoplayActive) {
    const dirs = [
      [PLAYER_SPEED, 0], [-PLAYER_SPEED, 0],
      [0, PLAYER_SPEED], [0, -PLAYER_SPEED],
    ];
    for (let i = 0; i < AUTOPLAY_COUNT; i++) {
      const ap = players[`auto-${i}`];
      if (!ap || !ap.alive) continue;
      if (Math.random() < 0.04) {
        const d = dirs[Math.floor(Math.random() * dirs.length)];
        ap.vx = d[0]; ap.vy = d[1];
      }
    }
  }

  // ── Bot AI + movement ────────────────────────────────────────────
  for (const botId in bots) {
    const bot = bots[botId];
    if (!bot.alive) continue;

    const coinObs = coins.map(c => ({ x: c.x, y: c.y, w: COIN_SIZE, h: COIN_SIZE }));
    updateBotAI(bot, now, players, [...obstacles, ...coinObs]);

    let bnx = bot.x + bot.vx;
    let bny = bot.y + bot.vy;

    if (bnx < -PLAYER_SIZE) bnx = ARENA_W;
    else if (bnx > ARENA_W) bnx = -PLAYER_SIZE;
    if (bny < -PLAYER_SIZE) bny = ARENA_H;
    else if (bny > ARENA_H) bny = -PLAYER_SIZE;

    if (obstacles.some(ob => aabbOverlap(bnx, bny, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h))) {
      const bbx = bot.x - bot.vx;
      const bby = bot.y - bot.vy;
      if (!obstacles.some(ob => aabbOverlap(bbx, bby, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h))) {
        bot.vx = -bot.vx; bot.vy = -bot.vy;
      } else {
        bot.vx = 0; bot.vy = 0;
      }
      bot.retargetAt = 0;
    } else {
      bot.x = bnx; bot.y = bny;
    }

    // Stuck detection: respawn if no movement for 1.5 s
    if (Math.abs(bot.x - bot.lastX) > 2 || Math.abs(bot.y - bot.lastY) > 2) {
      bot.lastX = bot.x; bot.lastY = bot.y; bot.stuckSince = 0;
    } else {
      if (bot.stuckSince === 0) bot.stuckSince = now;
      else if (now - bot.stuckSince > 1500) {
        const pos = spawnPosition(obstacles, players, bots, botId);
        Object.assign(bot, { x: pos.x, y: pos.y, lastX: pos.x, lastY: pos.y, vx: 0, vy: 0, stuckSince: 0, retargetAt: 0 });
        console.log(`[BOT] ${botId} stuck → respawned at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`);
      }
    }

    // Bot–bot separation (prevent AI bots overlapping each other)
    for (const otherBotId in bots) {
      if (otherBotId === botId) continue;
      const other = bots[otherBotId];
      if (!other.alive) continue;
      if (!aabbOverlap(bot.x, bot.y, PLAYER_SIZE, PLAYER_SIZE, other.x, other.y, PLAYER_SIZE, PLAYER_SIZE)) continue;
      bot.vx = -bot.vx; bot.vy = -bot.vy;
      bot.retargetAt = 0;
    }

    // Bot–player collision
    for (const pid in players) {
      const p = players[pid];
      if (!p.alive || now < p.invulnUntil) continue;
      if (!aabbOverlap(bot.x, bot.y, PLAYER_SIZE, PLAYER_SIZE, p.x, p.y, PLAYER_SIZE, PLAYER_SIZE)) continue;

      p.lives--;
      p.invulnUntil = now + INVULN_MS;
      const kdx = p.x - bot.x;
      const kdy = p.y - bot.y;
      if (Math.abs(kdx) >= Math.abs(kdy)) { p.vx = kdx >= 0 ? PLAYER_SPEED : -PLAYER_SPEED; p.vy = 0; }
      else                                 { p.vy = kdy >= 0 ? PLAYER_SPEED : -PLAYER_SPEED; p.vx = 0; }

      const sock = io.sockets.sockets.get(pid);
      if (sock) sock.emit('collision', { lives: p.lives });
      io.to('display').emit('bump', { a: botId, b: pid, ax: bot.x, ay: bot.y, bx: p.x, by: p.y });

      if (p.lives <= 0) { p.alive = false; if (sock) sock.emit('eliminated'); io.to('display').emit('player-eliminated', pid); }
    }
  }

  // ── Bullet movement + collision ──────────────────────────────────
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    b.x += b.vx; b.y += b.vy; b.dist += BULLET_SPEED;

    if (b.dist > BULLET_MAX_DIST || b.x < -20 || b.x > ARENA_W + 20 || b.y < -20 || b.y > ARENA_H + 20) {
      bullets.splice(bi, 1); continue;
    }

    // Hit obstacle
    if (obstacles.some(ob => aabbOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, ob.x, ob.y, ob.w, ob.h))) {
      io.to('display').emit('shot-hit', { x: b.x, y: b.y, type: 'obstacle' });
      bullets.splice(bi, 1); continue;
    }

    // Hit player
    let hit = false;
    for (const pid in players) {
      if (pid === b.ownerId) continue;
      const p = players[pid];
      if (!p.alive || now < p.invulnUntil) continue;
      if (!aabbOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, p.x, p.y, PLAYER_SIZE, PLAYER_SIZE)) continue;

      p.lives--;
      p.invulnUntil = now + INVULN_MS;
      const sock = io.sockets.sockets.get(pid);
      if (sock) sock.emit('collision', { lives: p.lives });
      io.to('display').emit('shot-hit', { x: b.x, y: b.y, type: 'player', targetId: pid });
      if (p.lives <= 0) { p.alive = false; if (sock) sock.emit('eliminated'); io.to('display').emit('player-eliminated', pid); }
      hit = true; break;
    }

    // Hit bot
    if (!hit) {
      for (const botId in bots) {
        const bot = bots[botId];
        if (!bot.alive) continue;
        if (!aabbOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, bot.x, bot.y, PLAYER_SIZE, PLAYER_SIZE)) continue;

        const pos = spawnPosition(obstacles, players, bots, botId);
        Object.assign(bot, { x: pos.x, y: pos.y, vx: 0, vy: 0, retargetAt: 0 });
        io.to('display').emit('shot-hit', { x: b.x, y: b.y, type: 'bot', targetId: botId });
        io.to('display').emit('bot-respawned', { id: botId, x: bot.x, y: bot.y });
        hit = true; break;
      }
    }

    if (hit) bullets.splice(bi, 1);
  }

  // ── Broadcast frame ──────────────────────────────────────────────
  const frame = {};
  for (const id in players) {
    const p = players[id];
    frame[id] = { x: p.x, y: p.y, color: p.color, emoji: p.emoji, name: p.name, score: p.score, lives: p.lives, shotsLeft: p.shotsLeft, alive: p.alive, invuln: now < p.invulnUntil };
  }
  for (const botId in bots) {
    const bot = bots[botId];
    frame[botId] = { x: bot.x, y: bot.y, color: bot.color, emoji: bot.emoji, score: 0, lives: 99, alive: bot.alive, invuln: false, isBot: true };
  }
  io.to('display').emit('frame', { players: frame, coins, bullets });

}, 1000 / TICK_RATE);

// ── Start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Neon Bumper Cars running on port ${PORT}`));
