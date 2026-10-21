const { server } = require('./server'); const { io: C } = require('socket.io-client');
const assert = require('assert'); const sleep = ms => new Promise(r => setTimeout(r, ms));
server.listen(0, async () => {
  const url = 'http://localhost:' + server.address().port;
  const mk = () => { const s = C(url, { forceNew: true }); s.log = []; s.onAny((e, d) => s.log.push([e, d])); s.last = e => [...s.log].reverse().find(x => x[0] === e)?.[1]; return s; };
  const a = mk(), b = mk(), c = mk(); let ok = 0; const t = (n, f) => { f(); console.log('PASS', n); ok++; };
  a.emit('create', { name: 'A', pid: 'A' }); await sleep(150); const code = a.last('joined').code;
  b.emit('join', { code, name: 'B', pid: 'B' }); await sleep(150); c.emit('join', { code, name: 'C', pid: 'C' }); await sleep(100);
  t('2 join, 3rd rejected', () => { assert.equal(a.last('room').players.length, 2); assert.match(c.last('err'), /full/); });
  a.emit('ready'); b.emit('ready'); await sleep(100); a.emit('start'); await sleep(2500);
  t('state synced + mirrored gifts', () => { const s = a.last('state'), s2 = b.last('state'); assert.equal(s.t, s2.t); assert(s.g.length >= 2 && s.g.length % 2 === 0); });
  a.emit('ability', { k: 'dash' }); await sleep(100); a.emit('ability', { k: 'dash' }); await sleep(100);
  t('cooldown enforced', () => assert.match(a.last('rej'), /Not ready/));
  // A greedy-collects gifts and delivers; B idle
  let res = null; b.on('end', r => (res = r));
  for (let i = 0; i < 700 && !res; i++) { const s = a.last('state'); if (s) { const me = s.p[0]; if (me[2]) a.emit('move', { x: 50, y: 5 }); else { const g = s.g.sort((p, q) => Math.hypot(p[1] - me[0], p[2] - me[1]) - Math.hypot(q[1] - me[0], q[2] - me[1]))[0]; if (g) a.emit('move', { x: g[1], y: g[2] }); } } await sleep(100); }
  t('same winner on both phones', () => { assert(res); assert.equal(res.winner, 0); assert.deepEqual(a.last('end'), b.last('end')); assert(res.sc[0] >= 12 || res.sc[0] > res.sc[1]); });
  console.log('score', res.sc, res.why);
  a.emit('rematch'); b.emit('rematch'); await sleep(400);
  t('rematch resets', () => { const x = b.last('state'); assert(x.sc[0] === 0 && x.sc[1] === 0 && x.t >= 89); });
  console.log(ok + ' checks passed'); process.exit(0);
});
