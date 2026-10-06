// Cloudflare Worker entry: the website files are served as static assets; /api/* and /uploads/*
// go to the single "Cafe" Durable Object, which keeps all orders consistent and live.
import { DurableObject } from 'cloudflare:workers';
import { CafeCore } from './cafe-core.js';

export class Cafe extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new CafeCore(ctx, env);
  }
  fetch(req) { return this.core.fetch(req); }
  alarm() { return this.core.alarm(); }
  webSocketMessage() {} // ping/pong is answered automatically
  webSocketClose(ws, code) { try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch {} }
  webSocketError() {}
}

export default {
  async fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/') || pathname.startsWith('/uploads/')) {
      return env.CAFE.get(env.CAFE.idFromName('myfitness')).fetch(req);
    }
    return env.ASSETS.fetch(req);
  },
};
