// server for the multiplayer games on my portfolio, on cloudflare workers
// each room code gets its own durable object: a tiny server of its own that holds one wizard battle
import { DurableObject } from 'cloudflare:workers';
import WizardRules from '../../js/wizard-battles/rules.js';

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

    const room = url.pathname.match(/^\/room\/([A-Za-z0-9]{4,8})$/);
    if (room) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
      return env.ROOMS.get(env.ROOMS.idFromName(room[1].toUpperCase())).fetch(req);
    }
    return new Response('not found', { status: 404, headers: cors });
  },
};

// one wizard battle between two people. the page sends { type: 'move', moveType, move, element } and
// { type: 'again' }, and gets back waiting, full, start, picked, turn, again and left.
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

  async start() {
    this.game = { duel: newDuel(), picks: [null, null], again: [false, false] };
    await this.save();
    for (const ws of this.players()) this.send(ws, { type: 'start' });
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
      if (taken.length === 1) await this.start();
      else this.send(ws, { type: 'waiting' });
    }
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws, raw) {
    const seat = ws.deserializeAttachment()?.seat;
    if (seat == null || typeof raw !== 'string' || raw.length > 500) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const game = await this.load();
    if (!game || !msg) return;
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
    if (ws.deserializeAttachment()?.seat == null) return;
    this.game = null;
    await this.ctx.storage.delete('game');
    for (const p of this.players(ws)) this.send(p, { type: 'left' });
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
