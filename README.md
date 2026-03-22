# ⚡ Neon Survival Bumper Cars

Multiplayer WebSocket party game. One shared display (projector/TV), players join from their phones via QR code, an admin controls the match.

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

## Running with Podman

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

Generate a user-level systemd unit so the container survives reboots:

```bash
podman generate systemd --name neon-bumper-cars --new --files
mkdir -p ~/.config/systemd/user
mv container-neon-bumper-cars.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now container-neon-bumper-cars
loginctl enable-linger $(whoami)
```

## Local Testing with HTTPS (Cloudflare Tunnel)

Mobile haptics (`navigator.vibrate`) and `AudioContext` auto-play require a **secure context** (HTTPS). Over plain `http://192.168.x.x:3000` the browser silently ignores them.

Cloudflare Tunnel gives you a public HTTPS URL pointing at your local machine — real trusted cert, no config, no account needed.

### 1. Install

```bash
brew install cloudflared
```

### 2. Start

```bash
podman run -d --name neon-bumper-cars -p 3000:3000 neon-bumper-cars
cloudflared tunnel --url localhost:3000
```

It prints a URL like `https://something-random.trycloudflare.com`. Open it on your phone — haptics, AudioContext, fullscreen all work immediately. No LAN IP, no cert install.

The QR code on the display picks it up automatically since it reads `window.location.origin`.

### 3. Stop

```bash
# Ctrl-C on cloudflared
podman stop neon-bumper-cars
```

> **Note:** The random URL changes each time you restart `cloudflared`. For a stable subdomain, create a free Cloudflare account and configure a named tunnel.

## Production (VPS + Cloudflare Tunnel)

On a VPS, use a named tunnel for a permanent HTTPS endpoint with your own domain — no exposed ports, no reverse proxy, no cert management:

```bash
cloudflared tunnel login
cloudflared tunnel create bumper-cars
cloudflared tunnel route dns bumper-cars bumper.yourdomain.com
cloudflared tunnel --name bumper-cars --url localhost:3000
```

Alternatively, run `cloudflared` as a systemd service alongside the Podman container for a fully hands-off setup.

## Gameplay

1. Open `/display.html` on a projector or large screen.
2. Players scan the QR code shown on-screen (or navigate to `/controller.html`).
3. Admin opens `/admin.html`, enters password `demo123`, hits **Start Game**.
4. Players swipe to move (Manhattan 4-way). Collect ⚡ coins (+10 pts), avoid bumping other players (−1 life each). 3 lives total.
5. Last player standing wins — or highest score when admin stops the game.

## Tech Notes

- **Zero external assets.** Obstacles are emoji text objects (🌲🪨💧), audio is synthesized via Web Audio API `OscillatorNode`, particles are Phaser-generated textures.
- **60 FPS server loop** with AABB collision detection, 2-second invulnerability cooldown after bumps.
- **Wrap-around arena** (1920×1080) — exit one side, appear on the other.
- The QR code is generated dynamically from `window.location.origin`, so it works on any domain/port without config changes.

## License

MIT