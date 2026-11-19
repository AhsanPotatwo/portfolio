// server for my portfolio, on cloudflare workers: the multiplayer wizard battles, catpi corner's notice board,
// the site's mods (mod.html), and distant cousins' favourites, daily mystery and tree stats (cousins.js)
// each room code gets its own durable object: a tiny server of its own that holds one wizard battle
import { DurableObject } from 'cloudflare:workers';
import WizardRules from '../../js/wizard-battles/rules.js';
import { board } from './board.js';
import { mods } from './mods.js';
import { cousins } from './cousins.js';

const { newDuel, legalPick, duelTurn, duelView } = WizardRules;
const SITE = 'https://ahsanpotatwo.github.io';
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// browsers always send an origin, so this stops other websites using the server
// (scripts can still connect, which is why the rooms check everything they get)
const allowed = origin => !origin || origin === SITE || LOCAL.test(origin);

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin');
    if (!allowed(origin)) return new Response('not allowed', { status: 403 });
    const cors = origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};

    const url = new URL(req.url);
    if (url.pathname === '/health') return Response.json({ ok: true }, { headers: cors });

    // the board's posts and mod keys make the browser ask first
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '86400' } });
    }
    if (url.pathname === '/board' || url.pathname === '/board/mod') return board(req, env, url, cors);
    if (url.pathname === '/mod') return mods(req, env, cors);
    if (url.pathname.startsWith('/cousins/')) return cousins(req, env, url, cors);

    const room = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,8})$/);
    if (room) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(room[1].toUpperCase())).fetch(req);
    }
    return new Response('not found', { status: 404, headers: cors });
  },
};

// what each player sends to say who they are, checked here because it ends up on the other player's screen.
// names are drawn as plain text on the page too, never as html
const cleanName = name => typeof name === 'string' ? name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12) : '';
const HEX = /^#[0-9a-f]{6}$/i;
const cleanLook = look => look && ['robe', 'trim', 'band', 'beard'].every(k => HEX.test(look[k]))
  ? { robe: look.robe, trim: look.trim, band: look.band, beard: look.beard } : null;
const cleanHealth = h => Number.isInteger(h) && h >= 25 && h <= 500 ? h : 100;

// one wizard battle between two people. the page sends { type: 'hello', name, look, rules } once it's in,
// then { type: 'move', moveType, move, element } and { type: 'again' }. it gets back waiting, full, start,
// picked, turn, again and left. rules ({ you, friend }, the starting healths) only come from whoever made the
// room, and go when they do.
// the room rolls the dice and checks every move, so nobody can cheat by editing the page. the duel is saved
// after every change because the room can be put to sleep between messages (the sockets stay open while it
// sleeps, the hibernation api), which is also what keeps it free
export class Room extends DurableObject {
  // the people sat in the room, apart from one if it's given
  players(except) {
    return this.ctx.getWebSockets().filter(ws => ws !== except && ws.deserializeAttachment()?.seat != null);
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  async load() {
    this.game ??= await this.ctx.storage.get('game');
    return this.game;
  }

  async save() {
    await this.ctx.storage.put('game', this.game);
  }

  // a new duel between the two people who've said hello, on the room maker's healths (100 each if they've gone)
  async start() {
    const [a, b] = this.players().map(ws => ({ ws, ...ws.deserializeAttachment() }));
    const host = [a, b].find(p => p.rules);
    const health = p => host ? (p === host ? host.rules.you : host.rules.friend) : 100;
    const healths = [];
    for (const p of [a, b]) healths[p.seat] = health(p);
    this.game = { duel: newDuel(healths), picks: [null, null], again: [false, false] };
    await this.save();
    const info = p => ({ name: p.name, look: p.look, health: health(p) });
    this.send(a.ws, { type: 'start', you: info(a), foe: info(b) });
    this.send(b.ws, { type: 'start', you: info(b), foe: info(a) });
  }

  async fetch() {
    const pair = new WebSocketPair();
    const ws = pair[1];
    this.ctx.acceptWebSocket(ws);
    const taken = this.players(ws).map(p => p.deserializeAttachment().seat);
    if (taken.length >= 2) {
      this.send(ws, { type: 'full' });
      ws.close(4000, 'room is full');
    } else {
      ws.serializeAttachment({ seat: taken.includes(0) ? 1 : 0 });
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    const me = ws.deserializeAttachment();
    const seat = me?.seat;
    if (seat == null || typeof raw !== 'string' || raw.length > 600) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg) return;

    // who you are, once. the duel starts when you're both in
    if (msg.type === 'hello') {
      if (me.name) return;
      const rules = msg.rules && { you: cleanHealth(msg.rules.you), friend: cleanHealth(msg.rules.friend) };
      ws.serializeAttachment({ seat, name: cleanName(msg.name) || 'Wizard', look: cleanLook(msg.look), rules });
      if (this.players(ws).some(p => p.deserializeAttachment().name)) await this.start();
      else this.send(ws, { type: 'waiting' });
      return;
    }
    if (!me.name) return;
    const game = await this.load();
    if (!game) return;
    const other = this.players(ws)[0];

    if (msg.type === 'move') {
      const pick = { moveType: msg.moveType, move: msg.move, element: msg.element };
      if (game.picks[seat] || !legalPick(game.duel, seat, pick)) return;
      game.picks[seat] = pick;
      if (!game.picks.every(Boolean)) {
        await this.save();
        if (other) this.send(other, { type: 'picked' });
        return;
      }
      const sides = duelTurn(game.duel, game.picks);
      game.picks = [null, null];
      await this.save();
      for (const p of this.players()) this.send(p, { type: 'turn', ...duelView(game.duel, sides, p.deserializeAttachment().seat) });
    } else if (msg.type === 'again') {
      if (game.duel.winner == null || game.again[seat]) return;
      game.again[seat] = true;
      if (game.again.every(Boolean)) return this.start();
      await this.save();
      if (other) this.send(other, { type: 'again' });
    }
  }

  // someone leaving ends the duel. whoever's left waits in the room, and a new one starts when someone joins
  async webSocketClose(ws) {
    try { ws.close(); } catch {}
    if (!ws.deserializeAttachment()?.name) return;
    this.game = null;
    await this.ctx.storage.delete('game');
    for (const p of this.players(ws)) this.send(p, { type: 'left' });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
