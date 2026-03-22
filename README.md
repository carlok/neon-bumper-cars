# ⚡ Neon Survival Bumper Cars

Multiplayer WebSocket party game for live events. One shared display (projector/TV), players join from their phones via QR code, an admin controls the match.

## Architecture

```
┌──────────────┐   WebSocket    ┌──────────┐   WebSocket    ┌─────────────┐
│  controller   │◄──────────────►│  server  │◄──────────────►│   display    │
│  (phones)     │   swipe input  │  Node.js │   60fps frame  │  (Phaser 3)  │
└──────────────┘                └─────┬────┘                └─────────────┘
                                      │
                                ┌─────┴────┐
                                │  admin    │
                                │  panel    │
                                └──────────┘
```

**Endpoints:**

| Path | Purpose |
|---|---|
| `/display.html` | Main arena — fullscreen on projector/TV |
| `/controller.html` | Mobile controller — scanned via QR |
| `/admin.html` | Start/stop the game (password: `demo123`) |

## Development (live-reload, no rebuilds)

Edit `server.js` or anything in `public/` and changes are picked up instantly — source files are mounted as volumes, nodemon restarts the server automatically.

```bash
# First time only: build the dev image
docker compose --profile dev build

# Start dev server (live-reload)
docker compose --profile dev up dev

# That's it — edit files, save, browser auto-reconnects
```

Or without Docker:

```bash
npm install
npm run dev
```

## Production

### Docker Compose

```bash
docker compose up -d neon-bumper-cars
docker compose logs -f neon-bumper-cars
```

### Podman

```bash
# Build
podman build -t neon-bumper-cars .

# Run (detached, auto-restart)
podman run -d \
  --name neon-bumper-cars \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PORT=3000 \
  neon-bumper-cars

# Logs
podman logs -f neon-bumper-cars

# Stop / remove
podman stop neon-bumper-cars
podman rm neon-bumper-cars
```

### Persist across reboots (systemd)

```bash
podman generate systemd --name neon-bumper-cars --new --files
mkdir -p ~/.config/systemd/user
mv container-neon-bumper-cars.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now container-neon-bumper-cars
loginctl enable-linger $(whoami)
```

## Local HTTPS (Cloudflare Tunnel)

Mobile haptics and AudioContext require HTTPS. Cloudflare Tunnel gives you a public HTTPS URL — real cert, no config, no account needed.

```bash
brew install cloudflared
cloudflared tunnel --url localhost:3000
```

Prints a URL like `https://something-random.trycloudflare.com`. The QR on the display adapts automatically via `window.location.origin`.

## Gameplay

1. Open `/display.html` on a projector or large screen.
2. Players scan the QR code (or navigate to `/controller.html`).
3. Admin opens `/admin.html`, enters password `demo123`, hits **Start Game**.
4. Players swipe to move (Manhattan 4-way). Collect food/drink emoji coins (+10 pts), avoid bumping other players (−1 life each). 3 lives total.
5. Watch out for **robot bots** (🤖👾) — they chase the nearest player and deal damage on contact!
6. Last player standing wins — or highest score when admin stops the game.

## Features

- **Emoji players** — random people, animals, and vehicles (curated for projector visibility)
- **Robot bots** — 2 AI chasers (🤖👾) with red particle trails that hunt players
- **Food/drink coins** — vegan food and drinks as collectibles
- **Terrain background** — lightweight tiled ground texture with faint emoji patches
- **Zero external assets** — obstacles are emoji (🌲🪨💧), audio is Web Audio API oscillators, particles are Phaser-generated
- **60 FPS server loop** with AABB collision, 2s invulnerability cooldown
- **Wrap-around arena** (1920×1080) — exit one side, appear on the other
- **Debug logging** — server and controller log join flow for troubleshooting

## License

MIT
