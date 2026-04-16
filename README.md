# Sheng Ji 升级 — Multiplayer Tractor Card Game

A real-time web-based implementation of **Sheng Ji** (升级, also known as Tractor / 拖拉机), supporting 4-player (2 deck) and 6-player (3 deck) modes with a persistent lobby system.

## Features

- **Lobby system** — create rooms with a 4-letter code; share the code with friends on any network
- **4-player & 6-player modes** — fixed partnerships (2×2 or 2×3)
- **Full Sheng Ji rules** — trump declaration during the draw, kitty, tricks with pair/tractor/throw leads, follow-suit enforcement, kitty bonus scoring, multi-hand level advancement
- **Persistent ranks** — team levels survive across hands and player reconnections within a lobby
- **Reconnection** — page refresh returns you to the same seat using a token stored in `localStorage`
- **Railway-ready** — single service; Socket.IO and static files share one port so HTTPS termination just works

## Quick Start (local)

```bash
npm install
npm start
# Open http://localhost:3000 in 4 browser tabs
```

## Deploy to Fly.io

1. Install the Fly CLI: `curl -L https://fly.io/install.sh | sh`
2. Sign up / log in: `fly auth login`
3. From the repo root, launch the app:
   ```bash
   fly launch --copy-config --yes
   ```
   This uses the included `fly.toml` and `Dockerfile`. Pick a region close to your players when prompted (or accept the default `iad`).
4. Once deployed, Fly prints your URL (e.g. `https://shengji.fly.dev`). Share it with your friends.

> **Note**: the free tier auto-stops the machine after idle. The first connection may take a few seconds to wake it up. Rooms are in-memory — if the machine restarts, open rooms are lost.

## How to Play

### Lobby
- Enter your name, then **Create** a room or **Join** by code.
- Choose **4 players** (2 decks) or **6 players** (3 decks) when creating.
- Once all seats are filled, any player can click **Start game**.

### Trump Declaration (during the Deal)
Cards are dealt one at a time. While dealing, select a trump-rank card (or Joker pair/triple) from your hand and click **Declare** to claim trump:
- Single trump-rank card → weakest declaration
- Pair of trump-rank cards of same suit → overrides a single
- Pair of Small Jokers → overrides a pair
- Pair of Big Jokers → strongest (no trump suit, only Jokers + trump rank are trump)
- In 6-player mode, triples are also valid and rank above the corresponding pairs.

### Kitty
After dealing, the dealer receives the bottom 8 (or 6) cards, selects which 8/6 to discard, and the game begins.

### Tricks
- **Lead**: play a single card, a pair, a tractor (consecutive pairs), or a "throw" (combination of highest cards in a suit).
- **Follow**: you must follow suit and match structure as much as possible.
- **Trump**: if you have no cards in the led suit, you may play any cards; playing all trumps in a matching structure wins the trick.

### Scoring
- **Point cards**: Kings (K) and Tens (10) = 10 pts each; Fives (5) = 5 pts each; 200 pts total in a 4-player game, 300 in a 6-player game.
- Opponents need **80 pts** (4p) / **120 pts** (6p) to win the hand and gain Declarer status.
- If opponents win the **last trick**, they score a kitty bonus multiplied by 2–16× depending on the lead structure.
- Team levels advance per the standard Sheng Ji scoring table; win the game by winning a hand as Declarers with Ace as the trump rank.

## Rules Reference

Full rules are in `An_Introduction_To_Sheng_Ji_Tractor.pdf` (Benjamin Zhang, 2021).
