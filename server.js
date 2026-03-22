const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ──────────────────────────────────────────────────────────
const ARENA_W = 1600; // leave 320px on the right for sidebar (leaderboard + QR)
const ARENA_H = 1080;
const PLAYER_SIZE = 40;
const PLAYER_SPEED = 4;
const OBSTACLE_COUNT = 20;
const COIN_SIZE = 30;
const INVULN_MS = 2000;
const ADMIN_PASSWORD = 'demo123';
const TICK_RATE = 60;
const MAX_PLAYERS = 32;
const BULLET_SPEED = 10;
const BULLET_SIZE = 10;
const BULLET_MAX_DIST = 600;
const SHOOT_COOLDOWN_MS = 800;
const MAX_SHOTS = 10;  // shots per session

// ── Neon palette ───────────────────────────────────────────────────────
const NEON_COLORS = [
  '#FF00FF', '#00FFFF', '#FF3366', '#33FF99', '#FFFF00',
  '#FF6600', '#66FF33', '#FF0099', '#00FF66', '#9933FF',
  '#FF3300', '#00CCFF', '#CCFF00', '#FF0066', '#33CCFF',
  '#FF9900', '#66CCFF', '#CC33FF', '#00FF99', '#FF6633'
];
let colorIndex = 0;

// ── Player emoji pool (bright, projector-friendly) ──────────────────
const PLAYER_EMOJIS = [
  // People (non-yellow, good contrast on dark bg)
  '🧑‍🚀', '🧑‍🎤', '🧜‍♀️', '🧛', '🧟', '🦸', '🦹', '🧑‍🎄', '👷', '💂',
  '🧑‍🍳', '🧑‍🚒', '🥷', '🧙', '🧝', '🎅',
  // Animals (colorful, high contrast)
  '🦊', '🐸', '🐵', '🦁', '🐯', '🐮', '🐷', '🦄', '🐙', '🦋',
  '🦜', '🐠', '🦀', '🐊', '🦩', '🐞', '🐝', '🦑', '🐳', '🦧',
  // Vehicles (bright, easy to spot)
  '🚗', '🏎️', '🚕', '🚒', '🚑', '🚀', '🛸', '🚁', '🛵', '🚜',
  '🛺', '🚤', '🚂', '⛵'
];

// ── Bot emoji pool ──────────────────────────────────────────────────
const BOT_EMOJIS = ['🤖', '👾'];
const BOT_COUNT = 2;
const BOT_SPEED = 3;  // slightly slower than players
const BOT_INVULN_MS = 3000;

// ── Coin emoji pool (vegan or could-be-vegan food & drinks) ─────────
const COIN_EMOJIS = [
  // Fruits
  '🍎', '🍌', '🍇', '🍓', '🍑', '🍉', '🍋', '🫐', '🍒', '🥭', '🍍', '🥝',
  // Vegetables
  '🥑', '🥕', '🌽', '🥦', '🥬', '🫑', '🥒', '🍆',
  // Could-be-vegan meals (hamburger, pizza, taco, burrito, fries, etc.)
  '🍕', '🍔', '🌮', '🌯', '🍟', '🥙', '🥗', '🍜', '🍝', '🥘',
  // Snacks & sweets
  '🍩', '🍪', '🎂', '🍫', '🍿', '🥜', '🥨',
  // Drinks
  '🥤', '🧃', '🍵', '☕', '🧋', '🍹', '🥥', '🍺', '🥂', '🧉'
];

// ── State ──────────────────────────────────────────────────────────────
let gameState = 'WAITING'; // WAITING | PLAYING | STOPPED
const players = {};        // socketId -> player
const bots = {};           // botId -> bot object
let obstacles = [];        // { x, y, w, h, type }
let coin = null;           // { x, y }
const bullets = [];        // { x, y, vx, vy, ownerId, ownerColor, dist }

// ── Obstacle generation ───────────────────────────────────────────────
const OBSTACLE_TYPES = ['tree', 'stone', 'lake'];
const OBS_SIZE = 50; // all obstacles same size (close to PLAYER_SIZE=40)
const OBS_SIZES = { tree: { w: OBS_SIZE, h: OBS_SIZE }, stone: { w: OBS_SIZE, h: OBS_SIZE }, lake: { w: OBS_SIZE, h: OBS_SIZE } };

function generateObstacles() {
  obstacles = [];
  const margin = 120;
  let attempts = 0;
  while (obstacles.length < OBSTACLE_COUNT && attempts < 500) {
    attempts++;
    const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
    const sz = OBS_SIZES[type];
    const x = margin + Math.random() * (ARENA_W - 2 * margin - sz.w);
    const y = margin + Math.random() * (ARENA_H - 2 * margin - sz.h);
    // Check overlap with existing (padded by PLAYER_SIZE so players can always pass between)
    let overlaps = false;
    const pad = PLAYER_SIZE;
    for (const ob of obstacles) {
      if (aabbOverlap(x - pad, y - pad, sz.w + pad * 2, sz.h + pad * 2, ob.x, ob.y, ob.w, ob.h)) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) obstacles.push({ x, y, w: sz.w, h: sz.h, type });
  }
}

function aabbOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ── Coin ──────────────────────────────────────────────────────────────
function spawnCoin() {
  let attempts = 0;
  while (attempts < 200) {
    attempts++;
    const x = 80 + Math.random() * (ARENA_W - 160);
    const y = 80 + Math.random() * (ARENA_H - 160);
    // Only check obstacles for coins (overlapping players/bots is fine)
    let blocked = false;
    for (const ob of obstacles) {
      if (aabbOverlap(x, y, COIN_SIZE, COIN_SIZE, ob.x, ob.y, ob.w, ob.h)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) { coin = { x, y, emoji: randomCoinEmoji() }; return; }
  }
  coin = { x: ARENA_W / 2, y: ARENA_H / 2, emoji: randomCoinEmoji() };
}

// ── Check if a position overlaps any obstacle, player, or bot ────────
function isPositionBlocked(x, y, size, excludeId) {
  const pad = 10; // safety margin around obstacles
  for (const ob of obstacles) {
    if (aabbOverlap(x, y, size, size, ob.x - pad, ob.y - pad, ob.w + pad * 2, ob.h + pad * 2)) return true;
  }
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

// ── Safe fallback: scan grid for a clear spot ─────────────────────────
function findSafeSpot(size, excludeId) {
  const step = size + 10;
  for (let x = 100; x < ARENA_W - 100; x += step) {
    for (let y = 100; y < ARENA_H - 100; y += step) {
      if (!isPositionBlocked(x, y, size, excludeId)) return { x, y };
    }
  }
  return { x: 100, y: 100 }; // absolute last resort (arena edge)
}

// ── Player helpers ────────────────────────────────────────────────────
function spawnPlayer(excludeId) {
  const margin = 150;
  let attempts = 0;
  while (attempts < 200) {
    attempts++;
    const x = margin + Math.random() * (ARENA_W - 2 * margin);
    const y = margin + Math.random() * (ARENA_H - 2 * margin);
    if (!isPositionBlocked(x, y, PLAYER_SIZE, excludeId)) return { x, y };
  }
  return findSafeSpot(PLAYER_SIZE, excludeId);
}

function nextColor() {
  const c = NEON_COLORS[colorIndex % NEON_COLORS.length];
  colorIndex++;
  return c;
}

function nextFaceEmoji() {
  return PLAYER_EMOJIS[Math.floor(Math.random() * PLAYER_EMOJIS.length)];
}

function randomCoinEmoji() {
  return COIN_EMOJIS[Math.floor(Math.random() * COIN_EMOJIS.length)];
}

// ── Random name generator ────────────────────────────────────────────
const NAME_ADJ = [
  'Turbo', 'Mega', 'Ultra', 'Super', 'Hyper', 'Nitro', 'Neon', 'Cosmic',
  'Funky', 'Wild', 'Crazy', 'Epic', 'Mighty', 'Swift', 'Brave', 'Tiny',
  'Giant', 'Magic', 'Sneaky', 'Lucky', 'Dizzy', 'Fuzzy', 'Zippy', 'Jolly',
  'Fiery', 'Icy', 'Stormy', 'Sunny', 'Shadow', 'Golden', 'Pixel', 'Laser'
];
const NAME_NOUN = [
  'Racer', 'Comet', 'Flash', 'Bolt', 'Rocket', 'Blaze', 'Storm', 'Thunder',
  'Ninja', 'Pirate', 'Viking', 'Knight', 'Wizard', 'Panda', 'Tiger', 'Fox',
  'Shark', 'Eagle', 'Wolf', 'Bear', 'Falcon', 'Dragon', 'Phoenix', 'Waffle',
  'Taco', 'Pickle', 'Muffin', 'Banana', 'Nugget', 'Cookie', 'Noodle', 'Pretzel'
];
function randomName() {
  const adj = NAME_ADJ[Math.floor(Math.random() * NAME_ADJ.length)];
  const noun = NAME_NOUN[Math.floor(Math.random() * NAME_NOUN.length)];
  return `${adj} ${noun}`;
}

// ── Bot helpers ──────────────────────────────────────────────────────
function spawnBots() {
  for (let i = 0; i < BOT_COUNT; i++) {
    const id = `bot-${i}`;
    const pos = spawnPlayer(id);
    bots[id] = {
      id,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      color: '#FF0000',
      emoji: BOT_EMOJIS[i % BOT_EMOJIS.length],
      isBot: true,
      invulnUntil: 0,
      alive: true,
      retargetAt: 0,  // when to pick a new direction
      stuckSince: 0,  // timestamp when bot got stuck (0 = not stuck)
      lastX: pos.x,   // track position for stuck detection
      lastY: pos.y,
    };
    console.log(`[BOT] Spawned bot ${id} at (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)}) emoji=${bots[id].emoji}`);
  }
}

function isBotDirBlocked(bot, vx, vy) {
  const tx = bot.x + vx;
  const ty = bot.y + vy;
  for (const ob of obstacles) {
    if (aabbOverlap(tx, ty, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) return true;
  }
  return false;
}

function updateBotAI(bot, now) {
  // Find nearest alive player
  let nearest = null;
  let nearestDist = Infinity;
  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;
    const dx = p.x - bot.x;
    const dy = p.y - bot.y;
    const dist = Math.abs(dx) + Math.abs(dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = p;
    }
  }

  // Retarget: every 500ms normally, immediately if stuck (vx=0 and vy=0)
  const isStuck = bot.vx === 0 && bot.vy === 0;
  if (!nearest || (!isStuck && now < bot.retargetAt)) return;
  bot.retargetAt = now + (isStuck ? 100 : 500); // retry faster when stuck

  const dx = nearest.x - bot.x;
  const dy = nearest.y - bot.y;

  // Build priority list of directions: chase axis first, then alternates, then opposites
  const dirs = [];
  if (Math.abs(dx) > Math.abs(dy)) {
    dirs.push([dx > 0 ? BOT_SPEED : -BOT_SPEED, 0]); // primary: horizontal chase
    dirs.push([0, dy > 0 ? BOT_SPEED : -BOT_SPEED]);  // secondary: vertical chase
    dirs.push([0, dy > 0 ? -BOT_SPEED : BOT_SPEED]);   // vertical opposite
    dirs.push([dx > 0 ? -BOT_SPEED : BOT_SPEED, 0]);   // horizontal opposite
  } else {
    dirs.push([0, dy > 0 ? BOT_SPEED : -BOT_SPEED]);  // primary: vertical chase
    dirs.push([dx > 0 ? BOT_SPEED : -BOT_SPEED, 0]);  // secondary: horizontal chase
    dirs.push([dx > 0 ? -BOT_SPEED : BOT_SPEED, 0]);   // horizontal opposite
    dirs.push([0, dy > 0 ? -BOT_SPEED : BOT_SPEED]);   // vertical opposite
  }

  // Try each direction in priority order
  for (const [vx, vy] of dirs) {
    if (!isBotDirBlocked(bot, vx, vy)) {
      bot.vx = vx;
      bot.vy = vy;
      return;
    }
  }
  // All 4 directions blocked (shouldn't happen) — stay put briefly
  bot.vx = 0;
  bot.vy = 0;
}

// ── Init ──────────────────────────────────────────────────────────────
generateObstacles();
spawnCoin();
spawnBots();

// ── Socket.IO ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[CONN] New connection: ${socket.id}`);

  // Identify role
  socket.on('join-display', () => {
    console.log(`[DISPLAY] Display joined: ${socket.id}`);
    socket.join('display');
    socket.emit('init', { obstacles, gameState, coin, bots });
  });

  socket.on('join-admin', () => {
    console.log(`[ADMIN] Admin joined: ${socket.id}`);
    socket.join('admin');
    socket.emit('gameStateChange', gameState);
  });

  socket.on('join-player', () => {
    console.log(`[PLAYER] join-player received from: ${socket.id}`);
    const playerCount = Object.keys(players).length;
    if (playerCount >= MAX_PLAYERS) {
      console.log(`[PLAYER] Room full (${playerCount}/${MAX_PLAYERS}), rejecting ${socket.id}`);
      socket.emit('room-full');
      return;
    }
    const pos = spawnPlayer(socket.id);
    const color = nextColor();
    const emoji = nextFaceEmoji();
    const name = randomName();
    players[socket.id] = {
      id: socket.id,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      color,
      emoji,
      name,
      score: 0,
      lives: 3,
      invulnUntil: 0,
      alive: true,
      facing: 'up',
      lastShotAt: 0,
      shotsLeft: MAX_SHOTS,
    };
    console.log(`[PLAYER] Player created: ${socket.id}, name=${name}, color=${color}, emoji=${emoji}`);
    socket.emit('player-info', { color, emoji, name, gameState });
    io.to('display').emit('player-joined', players[socket.id]);
  });

  // Rejoin after elimination (same socket, new life)
  socket.on('rejoin-player', () => {
    const existing = players[socket.id];
    if (!existing || existing.alive) return; // only if eliminated
    console.log(`[PLAYER] rejoin-player from: ${socket.id}, name=${existing.name}`);
    const pos = spawnPlayer(socket.id);
    existing.x = pos.x;
    existing.y = pos.y;
    existing.vx = 0;
    existing.vy = 0;
    existing.score = 0;
    existing.lives = 3;
    existing.alive = true;
    existing.invulnUntil = Date.now() + INVULN_MS;
    existing.shotsLeft = MAX_SHOTS;
    // Keep color, emoji, name — reset score and shots
    socket.emit('player-info', { color: existing.color, emoji: existing.emoji, name: existing.name, score: 0, shotsLeft: MAX_SHOTS, gameState });
    io.to('display').emit('player-joined', existing);
  });

  // Admin controls
  socket.on('admin-start', (pw) => {
    console.log(`[ADMIN] admin-start received, pw match: ${pw === ADMIN_PASSWORD}`);
    if (pw !== ADMIN_PASSWORD) return;
    gameState = 'PLAYING';
    io.emit('gameStateChange', gameState);
  });

  socket.on('admin-stop', (pw) => {
    console.log(`[ADMIN] admin-stop received, pw match: ${pw === ADMIN_PASSWORD}`);
    if (pw !== ADMIN_PASSWORD) return;
    gameState = 'STOPPED';
    io.emit('gameStateChange', gameState);
  });

  // Player input — always accept direction, game loop handles bouncing
  socket.on('swipe', (dir) => {
    const p = players[socket.id];
    if (!p || !p.alive || gameState !== 'PLAYING') return;
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const d = dirs[dir];
    if (!d) return;
    p.vx = d[0] * PLAYER_SPEED;
    p.vy = d[1] * PLAYER_SPEED;
    p.facing = dir;
  });

  // Player shoot — single tap fires in facing direction
  socket.on('shoot', () => {
    const p = players[socket.id];
    if (!p || !p.alive || gameState !== 'PLAYING') {
      console.log(`[SHOOT] Rejected: id=${socket.id}, hasPlayer=${!!p}, alive=${p?.alive}, gameState=${gameState}`);
      return;
    }
    if (p.shotsLeft <= 0) {
      socket.emit('shot-fired-ack', { shotsLeft: 0 });
      return;
    }
    const now = Date.now();
    if (now - p.lastShotAt < SHOOT_COOLDOWN_MS) return;
    console.log(`[SHOOT] ${p.name} fired, shotsLeft=${p.shotsLeft - 1}`);
    p.lastShotAt = now;
    p.shotsLeft--;
    // Fire 4 bullets — one in each direction
    const allDirs = [[0,-1],[0,1],[-1,0],[1,0]];
    const cx = p.x + PLAYER_SIZE / 2 - BULLET_SIZE / 2;
    const cy = p.y + PLAYER_SIZE / 2 - BULLET_SIZE / 2;
    for (const [dvx, dvy] of allDirs) {
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

  for (const id in players) {
    const p = players[id];
    if (!p.alive) continue;

    // Move
    let nx = p.x + p.vx;
    let ny = p.y + p.vy;

    // Wrap around
    if (nx < -PLAYER_SIZE) nx = ARENA_W;
    if (nx > ARENA_W) nx = -PLAYER_SIZE;
    if (ny < -PLAYER_SIZE) ny = ARENA_H;
    if (ny > ARENA_H) ny = -PLAYER_SIZE;

    // Obstacle collision: bounce off (reverse velocity)
    let hitObs = false;
    for (const ob of obstacles) {
      if (aabbOverlap(nx, ny, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
        hitObs = true;
        break;
      }
    }
    if (hitObs) {
      // Try bouncing back; if that's also blocked, stop completely
      const bx = p.x - p.vx;
      const by = p.y - p.vy;
      let bounceBlocked = false;
      for (const ob of obstacles) {
        if (aabbOverlap(bx, by, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
          bounceBlocked = true;
          break;
        }
      }
      if (!bounceBlocked) {
        p.vx = -p.vx;
        p.vy = -p.vy;
      } else {
        p.vx = 0;
        p.vy = 0;
      }
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit('blocked');
    } else {
      p.x = nx;
      p.y = ny;
    }

    // Coin pickup
    if (coin && aabbOverlap(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE, coin.x, coin.y, COIN_SIZE, COIN_SIZE)) {
      p.score += 10;
      const sock = io.sockets.sockets.get(id);
      if (sock) sock.emit('score', p.score);
      io.to('display').emit('coin-eaten', { playerId: id, cx: coin.x, cy: coin.y });
      spawnCoin();
      io.to('display').emit('coin-spawned', coin);
    }

    alivePlayers.push(p);
  }

  // Player-player collisions
  for (let i = 0; i < alivePlayers.length; i++) {
    for (let j = i + 1; j < alivePlayers.length; j++) {
      const a = alivePlayers[i];
      const b = alivePlayers[j];
      if (now < a.invulnUntil || now < b.invulnUntil) continue;
      if (aabbOverlap(a.x, a.y, PLAYER_SIZE, PLAYER_SIZE, b.x, b.y, PLAYER_SIZE, PLAYER_SIZE)) {
        // Reverse velocities
        a.vx = -a.vx || PLAYER_SPEED * (Math.random() > 0.5 ? 1 : -1);
        a.vy = -a.vy || PLAYER_SPEED * (Math.random() > 0.5 ? 1 : -1);
        b.vx = -b.vx || PLAYER_SPEED * (Math.random() > 0.5 ? 1 : -1);
        b.vy = -b.vy || PLAYER_SPEED * (Math.random() > 0.5 ? 1 : -1);
        // Ensure only one axis
        if (Math.abs(a.vx) > 0) a.vy = 0; else a.vx = 0;
        if (Math.abs(b.vx) > 0) b.vy = 0; else b.vx = 0;

        a.lives--;
        b.lives--;
        a.invulnUntil = now + INVULN_MS;
        b.invulnUntil = now + INVULN_MS;

        const sockA = io.sockets.sockets.get(a.id);
        const sockB = io.sockets.sockets.get(b.id);
        if (sockA) sockA.emit('collision', { lives: a.lives });
        if (sockB) sockB.emit('collision', { lives: b.lives });
        io.to('display').emit('bump', { a: a.id, b: b.id, ax: a.x, ay: a.y, bx: b.x, by: b.y });

        // Elimination
        if (a.lives <= 0) {
          a.alive = false;
          if (sockA) sockA.emit('eliminated');
          io.to('display').emit('player-eliminated', a.id);
        }
        if (b.lives <= 0) {
          b.alive = false;
          if (sockB) sockB.emit('eliminated');
          io.to('display').emit('player-eliminated', b.id);
        }
      }
    }
  }

  // ── Bot AI + movement ──────────────────────────────────────────────
  for (const botId in bots) {
    const bot = bots[botId];
    if (!bot.alive) continue;

    updateBotAI(bot, now);

    // Move bot
    let bnx = bot.x + bot.vx;
    let bny = bot.y + bot.vy;

    // Wrap around
    if (bnx < -PLAYER_SIZE) bnx = ARENA_W;
    if (bnx > ARENA_W) bnx = -PLAYER_SIZE;
    if (bny < -PLAYER_SIZE) bny = ARENA_H;
    if (bny > ARENA_H) bny = -PLAYER_SIZE;

    // Obstacle collision
    let botHitObs = false;
    for (const ob of obstacles) {
      if (aabbOverlap(bnx, bny, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
        botHitObs = true;
        break;
      }
    }
    if (botHitObs) {
      const bbx = bot.x - bot.vx;
      const bby = bot.y - bot.vy;
      let botBounceBlocked = false;
      for (const ob of obstacles) {
        if (aabbOverlap(bbx, bby, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
          botBounceBlocked = true;
          break;
        }
      }
      if (!botBounceBlocked) {
        bot.vx = -bot.vx;
        bot.vy = -bot.vy;
      } else {
        bot.vx = 0;
        bot.vy = 0;
      }
      bot.retargetAt = 0; // force retarget next tick
    } else {
      bot.x = bnx;
      bot.y = bny;
    }

    // Stuck detection: if bot position hasn't changed for 1.5s, respawn
    const moved = Math.abs(bot.x - bot.lastX) > 2 || Math.abs(bot.y - bot.lastY) > 2;
    if (moved) {
      bot.lastX = bot.x;
      bot.lastY = bot.y;
      bot.stuckSince = 0;
    } else {
      if (bot.stuckSince === 0) bot.stuckSince = now;
      else if (now - bot.stuckSince > 1500) {
        const newPos = spawnPlayer(botId);
        bot.x = newPos.x;
        bot.y = newPos.y;
        bot.lastX = newPos.x;
        bot.lastY = newPos.y;
        bot.vx = 0;
        bot.vy = 0;
        bot.stuckSince = 0;
        bot.retargetAt = 0;
        console.log(`[BOT] ${botId} was stuck, respawned at (${newPos.x.toFixed(0)}, ${newPos.y.toFixed(0)})`);
      }
    }

    // Bot-player collision: bot chases and damages players
    for (const pid in players) {
      const p = players[pid];
      if (!p.alive) continue;
      if (now < p.invulnUntil) continue;
      if (aabbOverlap(bot.x, bot.y, PLAYER_SIZE, PLAYER_SIZE, p.x, p.y, PLAYER_SIZE, PLAYER_SIZE)) {
        // Damage the player
        p.lives--;
        p.invulnUntil = now + INVULN_MS;

        // Knock player away from bot
        const kdx = p.x - bot.x;
        const kdy = p.y - bot.y;
        if (Math.abs(kdx) >= Math.abs(kdy)) {
          p.vx = kdx >= 0 ? PLAYER_SPEED : -PLAYER_SPEED;
          p.vy = 0;
        } else {
          p.vy = kdy >= 0 ? PLAYER_SPEED : -PLAYER_SPEED;
          p.vx = 0;
        }

        const sock = io.sockets.sockets.get(pid);
        if (sock) sock.emit('collision', { lives: p.lives });
        io.to('display').emit('bump', { a: botId, b: pid, ax: bot.x, ay: bot.y, bx: p.x, by: p.y });

        // Elimination check
        if (p.lives <= 0) {
          p.alive = false;
          if (sock) sock.emit('eliminated');
          io.to('display').emit('player-eliminated', pid);
        }
      }
    }
  }

  // ── Bullet movement + collision ────────────────────────────────────
  for (let bi = bullets.length - 1; bi >= 0; bi--) {
    const b = bullets[bi];
    b.x += b.vx;
    b.y += b.vy;
    b.dist += BULLET_SPEED;

    // Remove if out of range or arena
    if (b.dist > BULLET_MAX_DIST || b.x < -20 || b.x > ARENA_W + 20 || b.y < -20 || b.y > ARENA_H + 20) {
      bullets.splice(bi, 1);
      continue;
    }

    // Hit obstacle → remove bullet
    let hitObs = false;
    for (const ob of obstacles) {
      if (aabbOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, ob.x, ob.y, ob.w, ob.h)) {
        hitObs = true;
        break;
      }
    }
    if (hitObs) {
      io.to('display').emit('shot-hit', { x: b.x, y: b.y, type: 'obstacle' });
      bullets.splice(bi, 1);
      continue;
    }

    // Hit player (not the shooter)
    let hitSomething = false;
    for (const pid in players) {
      if (pid === b.ownerId) continue;
      const p = players[pid];
      if (!p.alive || now < p.invulnUntil) continue;
      if (aabbOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, p.x, p.y, PLAYER_SIZE, PLAYER_SIZE)) {
        p.lives--;
        p.invulnUntil = now + INVULN_MS;
        const sock = io.sockets.sockets.get(pid);
        if (sock) sock.emit('collision', { lives: p.lives });
        io.to('display').emit('shot-hit', { x: b.x, y: b.y, type: 'player', targetId: pid });
        if (p.lives <= 0) {
          p.alive = false;
          if (sock) sock.emit('eliminated');
          io.to('display').emit('player-eliminated', pid);
        }
        hitSomething = true;
        break;
      }
    }

    // Hit bot → respawn bot safely
    if (!hitSomething) {
      for (const botId in bots) {
        const bot = bots[botId];
        if (!bot.alive) continue;
        if (aabbOverlap(b.x, b.y, BULLET_SIZE, BULLET_SIZE, bot.x, bot.y, PLAYER_SIZE, PLAYER_SIZE)) {
          const newPos = spawnPlayer(botId);
          bot.x = newPos.x;
          bot.y = newPos.y;
          bot.vx = 0;
          bot.vy = 0;
          bot.retargetAt = 0;
          io.to('display').emit('shot-hit', { x: b.x, y: b.y, type: 'bot', targetId: botId });
          io.to('display').emit('bot-respawned', { id: botId, x: bot.x, y: bot.y });
          hitSomething = true;
          break;
        }
      }
    }

    if (hitSomething) {
      bullets.splice(bi, 1);
    }
  }

  // Broadcast frame
  const frame = {};
  for (const id in players) {
    const p = players[id];
    frame[id] = {
      x: p.x, y: p.y, color: p.color, emoji: p.emoji, name: p.name,
      score: p.score, lives: p.lives,
      alive: p.alive, invuln: now < p.invulnUntil,
    };
  }
  // Include bots in the frame as "players" so the display renders them
  for (const botId in bots) {
    const bot = bots[botId];
    frame[botId] = {
      x: bot.x, y: bot.y, color: bot.color, emoji: bot.emoji,
      score: 0, lives: 99,
      alive: bot.alive, invuln: false, isBot: true,
    };
  }
  io.to('display').emit('frame', { players: frame, coin, bullets });

}, 1000 / TICK_RATE);

// ── Start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚗 Neon Bumper Cars running on port ${PORT}`));
