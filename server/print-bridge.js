#!/usr/bin/env node
// MY FITNESS print bridge — run this on the Windows PC next to the Xprinter when the
// staff panel is opened from GitHub Pages / a cloud domain. The panel sends tickets to
//   http://127.0.0.1:9123/print   →   printer (LAN IP:9100 or the USB Windows printer)
// Zero dependencies. Options: BRIDGE_PORT=9123  BRIDGE_HOST=127.0.0.1  BRIDGE_KEY=secret
import http from 'node:http';
import { sendToPrinter, listPrinters, tcpCheck } from './printing.js';

const PORT = Number(process.env.BRIDGE_PORT || 9123);
const HOST = process.env.BRIDGE_HOST || '127.0.0.1';
const KEY = process.env.BRIDGE_KEY || '';
const VERSION = '1.0.0';

function cors(req) {
  return {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, x-bridge-key',
    'Access-Control-Allow-Private-Network': 'true', // Chrome "private network access" preflight
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}
function send(req, res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors(req) });
  res.end(JSON.stringify(obj));
}
function readJson(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors(req)); return res.end(); }
  if (KEY && req.headers['x-bridge-key'] !== KEY) return send(req, res, 401, { ok: false, error: 'wrong bridge key' });
  try {
    if (url.pathname === '/status' && req.method === 'GET') {
      const host = url.searchParams.get('host');
      const [printers, reachable] = await Promise.all([listPrinters(), host ? tcpCheck(host, url.searchParams.get('port') || 9100) : Promise.resolve(undefined)]);
      return send(req, res, 200, { ok: true, app: 'myfitness-print-bridge', version: VERSION, platform: process.platform, printers, reachable });
    }
    if (url.pathname === '/print' && req.method === 'POST') {
      const { target, data } = await readJson(req);
      const bytes = Buffer.from(String(data || ''), 'base64');
      await sendToPrinter(target, bytes);
      console.log(`${new Date().toLocaleTimeString()}  printed ${bytes.length} bytes → ${target?.type === 'windows' ? target.printer : `${target?.host}:${target?.port || 9100}`}`);
      return send(req, res, 200, { ok: true });
    }
    send(req, res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    console.error(`${new Date().toLocaleTimeString()}  print failed: ${e.message}`);
    send(req, res, 502, { ok: false, error: e.message });
  }
});
server.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is busy — is the bridge already running?` : e); process.exit(1); });
server.listen(PORT, HOST, async () => {
  console.log(`\n  MY FITNESS print bridge v${VERSION}\n  Listening on http://${HOST}:${PORT}  ${KEY ? '(key required)' : ''}`);
  const list = await listPrinters();
  if (list.length) console.log(`  Windows printers: ${list.join(' · ')}`);
  console.log('  Keep this window open while the café is working.\n');
});
