const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ──────────────────────────────────────────────────────────
const ARENA_W = 1920;
const ARENA_H = 1080;
const PLAYER_SIZE = 40;
const PLAYER_SPEED = 4;
const OBSTACLE_COUNT = 20;
const COIN_SIZE = 30;
const INVULN_MS = 2000;
const ADMIN_PASSWORD = 'demo123';
const TICK_RATE = 60;

// ── Neon palette ───────────────────────────────────────────────────────
const NEON_COLORS = [
  '#FF00FF', '#00FFFF', '#FF3366', '#33FF99', '#FFFF00',
  '#FF6600', '#66FF33', '#FF0099', '#00FF66', '#9933FF',
  '#FF3300', '#00CCFF', '#CCFF00', '#FF0066', '#33CCFF',
  '#FF9900', '#66CCFF', '#CC33FF', '#00FF99', '#FF6633'
];
let colorIndex = 0;

// ── Face emoji pool ──────────────────────────────────────────────────
const FACE_EMOJIS = [
  '😀', '😎', '🤩', '🥳', '😜', '🤠', '🧐', '😏', '🤗', '🥸',
  '😺', '🤖', '👽', '🎃', '👻', '🦊', '🐸', '🐵', '🦁', '🐼'
];

// ── Coin emoji pool (vegan food & drinks) ────────────────────────────
const COIN_EMOJIS = [
  '🍎', '🍌', '🍇', '🍓', '🍑', '🥑', '🥕', '🌽', '🍕', '🥤',
  '🧃', '🍵', '☕', '🥥', '🍉', '🥦', '🍋', '🧋', '🍹', '🫐'
];

// ── State ──────────────────────────────────────────────────────────────
let gameState = 'WAITING'; // WAITING | PLAYING | STOPPED
const players = {};        // socketId -> player
let obstacles = [];        // { x, y, w, h, type }
let coin = null;           // { x, y }

// ── Obstacle generation ───────────────────────────────────────────────
const OBSTACLE_TYPES = ['tree', 'stone', 'lake'];
const OBS_SIZES = { tree: { w: 60, h: 60 }, stone: { w: 70, h: 50 }, lake: { w: 90, h: 60 } };

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
    // Check overlap with existing
    let overlaps = false;
    for (const ob of obstacles) {
      if (aabbOverlap(x, y, sz.w, sz.h, ob.x, ob.y, ob.w, ob.h)) {
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

// ── Player helpers ────────────────────────────────────────────────────
function spawnPlayer() {
  const margin = 150;
  return {
    x: margin + Math.random() * (ARENA_W - 2 * margin),
    y: margin + Math.random() * (ARENA_H - 2 * margin),
  };
}

function nextColor() {
  const c = NEON_COLORS[colorIndex % NEON_COLORS.length];
  colorIndex++;
  return c;
}

function nextFaceEmoji() {
  return FACE_EMOJIS[Math.floor(Math.random() * FACE_EMOJIS.length)];
}

function randomCoinEmoji() {
  return COIN_EMOJIS[Math.floor(Math.random() * COIN_EMOJIS.length)];
}

// ── Init ──────────────────────────────────────────────────────────────
generateObstacles();
spawnCoin();

// ── Socket.IO ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[CONN] New connection: ${socket.id}`);

  // Identify role
  socket.on('join-display', () => {
    console.log(`[DISPLAY] Display joined: ${socket.id}`);
    socket.join('display');
    socket.emit('init', { obstacles, gameState, coin });
  });

  socket.on('join-admin', () => {
    console.log(`[ADMIN] Admin joined: ${socket.id}`);
    socket.join('admin');
    socket.emit('gameStateChange', gameState);
  });

  socket.on('join-player', () => {
    console.log(`[PLAYER] join-player received from: ${socket.id}`);
    const pos = spawnPlayer();
    const color = nextColor();
    const emoji = nextFaceEmoji();
    players[socket.id] = {
      id: socket.id,
      x: pos.x,
      y: pos.y,
      vx: 0,
      vy: 0,
      color,
      emoji,
      score: 0,
      lives: 3,
      invulnUntil: 0,
      alive: true,
    };
    console.log(`[PLAYER] Player created: ${socket.id}, color=${color}, emoji=${emoji}`);
    socket.emit('player-info', { color, emoji, gameState });
    io.to('display').emit('player-joined', players[socket.id]);
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

  // Player input
  socket.on('swipe', (dir) => {
    const p = players[socket.id];
    if (!p || !p.alive || gameState !== 'PLAYING') return;
    const dirs = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const d = dirs[dir];
    if (!d) return;

    const nextVx = d[0] * PLAYER_SPEED;
    const nextVy = d[1] * PLAYER_SPEED;

    // Check if direction is blocked by obstacle
    const testX = p.x + nextVx;
    const testY = p.y + nextVy;
    let blocked = false;
    for (const ob of obstacles) {
      if (aabbOverlap(testX, testY, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
        blocked = true;
        break;
      }
    }
    if (blocked) {
      socket.emit('blocked');
      return;
    }
    p.vx = nextVx;
    p.vy = nextVy;
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

    // Obstacle collision
    let hitObs = false;
    for (const ob of obstacles) {
      if (aabbOverlap(nx, ny, PLAYER_SIZE, PLAYER_SIZE, ob.x, ob.y, ob.w, ob.h)) {
        hitObs = true;
        break;
      }
    }
    if (hitObs) {
      p.vx = 0;
      p.vy = 0;
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

  // Broadcast frame
  const frame = {};
  for (const id in players) {
    const p = players[id];
    frame[id] = {
      x: p.x, y: p.y, color: p.color, emoji: p.emoji,
      score: p.score, lives: p.lives,
      alive: p.alive, invuln: now < p.invulnUntil,
    };
  }
  io.to('display').emit('frame', { players: frame, coin });

}, 1000 / TICK_RATE);

// ── Start ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚗 Neon Bumper Cars running on port ${PORT}`));
