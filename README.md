# Ruth Royale 🎂 — online 2-phone birthday battle

Node.js + Express + Socket.IO. The server is authoritative (energy, damage, towers, balloon, winner). No accounts.

## Run locally
    npm install
    npm start          # http://localhost:3000
    npm test           # 14 automated multiplayer checks (2 clients, full room, reconnect, rematch...)
Open two browser tabs to try it. localhost is NOT reachable from another phone over the internet — deploy it (below).

## Deploy (needs a host that runs a persistent Node server + WebSockets)
Examples: Render.com, Railway, Fly.io (free tiers change often — check current limits; free tiers may sleep when idle, so open the link once before inviting a friend).
Vercel/Netlify serverless do NOT work (no persistent WebSockets).

Render example:
1. Push this folder to a GitHub repo.
2. render.com → New → Web Service → pick the repo.
3. Build command: `npm install`   Start command: `npm start`
4. Deploy. You get a public https://<name>.onrender.com URL.
5. Open it on your phone → CREATE BATTLE ROOM → "Share via WhatsApp" → your friend taps the link and joins.

Environment variables: `PORT` (set automatically by the host). No secrets are used.

## Limits
Rooms live in server memory: a server restart/sleep ends active rooms. One server instance only (no horizontal scaling).
