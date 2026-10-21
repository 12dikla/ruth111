const express = require('express'), http = require('http'), path = require('path');
const { Server } = require('socket.io');
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_, r) => r.send('ok'));
const server = http.createServer(app);
const io = new Server(server);

const W = 100, H = 160, MATCH = 90, TICK = 0.05, WIN = 12, SPD = 28, PICK = 6;
const rooms = new Map();
const code = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); } while (rooms.has(c)); return c; };
const cleanName = n => String(n || 'Player').replace(/[<>]/g, '').trim().slice(0, 14) || 'Player';
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function lobby(r) {
  io.to(r.code).emit('room', { code: r.code, phase: r.phase, players: r.players.map(p => ({ name: p.name, ready: p.ready, connected: p.connected, rematch: p.rematch })), result: r.result });
}
function newMatch(r) {
  r.phase = 'playing'; r.result = null;
  r.m = { t: MATCH, sc: [0, 0], p: [0, 1].map(o => ({ x: 50, y: o ? H - 30 : 30, tx: 50, ty: o ? H - 30 : 30, carry: 0, stun: 0, dash: 0, cdD: 0, cdB: 0, imm: 0 })), g: [], id: 1, next: 0.5, gold: [60, 30], ot: false, msg: '', msgT: 0, fx: null, fxT: 0 };
  r.players.forEach(p => (p.rematch = false));
  lobby(r); io.to(r.code).emit('start', { names: r.players.map(p => p.name) });
}
function finish(r, winner, why) {
  if (r.phase !== 'playing') return;
  r.phase = 'ended'; if (winner >= 0) r.wins[winner]++;
  r.result = { winner, why, names: r.players.map(p => p.name), sc: r.m.sc, wins: r.wins };
  r.players.forEach(p => { p.ready = false; p.rematch = false; });
  io.to(r.code).emit('end', r.result); lobby(r);
}
function say(m, t) { m.msg = t; m.msgT = 2.5; }
function tick(r) {
  const m = r.m, dt = TICK; m.t = Math.max(0, m.t - dt);
  if (m.msgT > 0 && (m.msgT -= dt) <= 0) m.msg = '';
  if (m.fxT > 0) m.fxT -= dt;
  m.next -= dt;
  if (m.next <= 0 && m.g.length < 8 && m.t > 5) { const x = 12 + Math.random() * 76, y = 45 + Math.random() * 70; m.g.push({ id: m.id++, x, y, v: 1 }, { id: m.id++, x: W - x, y: H - y, v: 1 }); m.next = 2.5; } // mirrored = fair
  if (m.gold.length && m.t <= m.gold[0]) { m.gold.shift(); m.g.push({ id: m.id++, x: 50, y: 80, v: 3 }); say(m, '🌟 GOLDEN GIFT in the middle! (worth 3)'); }
  m.p.forEach(p => {
    p.cdD = Math.max(0, p.cdD - dt); p.cdB = Math.max(0, p.cdB - dt); p.dash = Math.max(0, p.dash - dt); p.imm = Math.max(0, p.imm - dt);
    if (p.stun > 0) { p.stun -= dt; return; }
    const d = Math.hypot(p.tx - p.x, p.ty - p.y), s = Math.min(d, SPD * (p.dash > 0 ? 2 : 1) * dt);
    if (d > 0.01) { p.x += (p.tx - p.x) / d * s; p.y += (p.ty - p.y) / d * s; }
  });
  m.p.forEach((p, i) => {
    if (!p.carry) { let bi = -1, bd = PICK; m.g.forEach((g, j) => { const d = dist(p, g); if (d < bd) { bd = d; bi = j; } }); if (bi >= 0) { p.carry = m.g[bi].v; m.g.splice(bi, 1); } }
    const o = m.p[1 - i];
    if (!p.carry && o.carry && p.imm <= 0 && dist(p, o) <= 7) { p.carry = o.carry; o.carry = 0; o.imm = 0.8; say(m, `😈 ${r.players[i].name} stole a gift!`); }
    if (p.carry && (i === 0 ? p.y <= 18 : p.y >= H - 18)) { m.sc[i] += p.carry; p.carry = 0; say(m, `🎁 ${r.players[i].name} scored! ${m.sc[0]}–${m.sc[1]}`); }
  });
  const w = m.sc.findIndex(x => x >= WIN); if (w >= 0) return finish(r, w, 'score');
  if (m.ot && m.sc[0] !== m.sc[1]) return finish(r, m.sc[0] > m.sc[1] ? 0 : 1, 'sudden');
  if (m.t <= 0) { if (m.sc[0] !== m.sc[1]) return finish(r, m.sc[0] > m.sc[1] ? 0 : 1, 'time'); if (!m.ot) { m.ot = true; say(m, '🔥 SUDDEN DEATH! Next gift wins!'); } }
  io.to(r.code).emit('state', { t: Math.ceil(m.t), ot: m.ot, sc: m.sc, p: m.p.map(p => [+p.x.toFixed(1), +p.y.toFixed(1), p.carry, p.stun > 0, p.dash > 0, Math.ceil(p.cdD), Math.ceil(p.cdB)]), g: m.g.map(g => [g.id, +g.x.toFixed(1), +g.y.toFixed(1), g.v]), fx: m.fxT > 0 ? m.fx : null, msg: m.msg });
}
setInterval(() => { for (const [k, r] of rooms) { if (r.phase === 'playing') tick(r); if (!r.players.some(p => p.connected) && Date.now() - r.last > 600000) rooms.delete(k); } }, TICK * 1000);

io.on('connection', sock => {
  let room = null, idx = -1;
  const me = () => room && room.players[idx];
  const attach = (r, i, p) => { room = r; idx = i; p.sid = sock.id; p.connected = true; clearTimeout(p.forfeit); r.last = Date.now(); sock.join(r.code); sock.emit('joined', { code: r.code, you: i }); lobby(r); if (r.phase === 'playing') sock.emit('start', { names: r.players.map(q => q.name) }); };
  sock.on('create', ({ name, pid }) => {
    const r = { code: code(), phase: 'lobby', players: [], wins: [0, 0], m: null, result: null, last: Date.now() };
    rooms.set(r.code, r); const p = { pid, name: cleanName(name), ready: false, connected: true, rematch: false }; r.players.push(p); attach(r, 0, p);
  });
  sock.on('join', ({ code: c, name, pid }) => {
    const r = rooms.get(String(c || '').toUpperCase().trim());
    if (!r) return sock.emit('err', 'Room not found or expired. Check the code!');
    const i = r.players.findIndex(p => p.pid === pid);
    if (i >= 0) return attach(r, i, r.players[i]); // reconnect, no duplicate player
    if (r.players.length >= 2) return sock.emit('err', 'This room is full (2 players max).');
    const p = { pid, name: cleanName(name), ready: false, connected: true, rematch: false }; r.players.push(p); attach(r, r.players.length - 1, p);
  });
  sock.on('ready', () => { if (me() && room.phase === 'lobby') { me().ready = !me().ready; lobby(room); } });
  sock.on('start', () => { if (room && idx === 0 && room.phase === 'lobby' && room.players.length === 2 && room.players.every(p => p.ready)) newMatch(room); });
  sock.on('move', ({ x, y }) => { if (!room || room.phase !== 'playing' || !Number.isFinite(x) || !Number.isFinite(y)) return; const p = room.m.p[idx]; p.tx = Math.max(3, Math.min(W - 3, x)); p.ty = Math.max(3, Math.min(H - 3, y)); });
  sock.on('ability', ({ k }) => {
    if (!room || room.phase !== 'playing') return; const m = room.m, p = m.p[idx], o = m.p[1 - idx];
    if (p.stun > 0) return sock.emit('rej', 'You are stunned!');
    if (k === 'dash') { if (p.cdD > 0) return sock.emit('rej', 'Not ready yet'); p.dash = 2; p.cdD = 8; }
    else if (k === 'blast') {
      if (p.cdB > 0) return sock.emit('rej', 'Not ready yet'); p.cdB = 10; m.fx = [p.x, p.y]; m.fxT = 0.5;
      if (dist(p, o) <= 22) { o.stun = 1.5; if (o.carry) { m.g.push({ id: m.id++, x: o.x, y: o.y, v: o.carry }); o.carry = 0; } say(m, `🎊 ${room.players[idx].name} blasted the opponent!`); }
    }
  });
  sock.on('emote', ({ i }) => { if (!room || !me() || !Number.isInteger(i) || i < 0 || i > 4) return; const p = me(); if (Date.now() - (p.lastEmote || 0) < 1200) return; p.lastEmote = Date.now(); io.to(room.code).emit('emote', { from: idx, i }); });
  sock.on('rematch', () => { if (room && room.phase === 'ended') { me().rematch = true; lobby(room); if (room.players.length === 2 && room.players.every(p => p.rematch)) newMatch(room); } });
  const leave = hard => {
    if (!room) return; const r = room, p = me(), i = idx; room = null; idx = -1; sock.leave(r.code);
    if (!p || p.sid !== sock.id) return;
    p.connected = false; lobby(r);
    if (hard) { if (r.phase === 'lobby') { if (i === 0) { io.to(r.code).emit('left', 'The host closed the room.'); rooms.delete(r.code); } else { r.players.splice(i, 1); r.players.forEach(q => (q.ready = false)); lobby(r); } } else if (r.phase === 'playing') finish(r, 1 - i, 'forfeit'); }
    else if (r.phase === 'playing') p.forfeit = setTimeout(() => finish(r, 1 - i, 'forfeit'), 20000);
    r.last = Date.now();
  };
  sock.on('leave', () => { leave(true); sock.emit('left'); });
  sock.on('disconnect', () => leave(false));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) server.listen(PORT, () => console.log('Ruth Royale on :' + PORT));
module.exports = { server, io };
