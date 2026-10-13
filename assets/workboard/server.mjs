import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes, createHash} from 'node:crypto';
import {root, dataFile, version, readState, update, summarize} from './store.mjs';

const port = Number(process.env.BOARD_PORT || 4318);
const token = randomBytes(24).toString('hex');
const workspaceId = createHash('sha256').update(process.platform === 'win32' ? dataFile.toLowerCase() : dataFile).digest('hex').slice(0,20);
const clients = new Set();
let state = readState();
function refresh() {
  try {
    const next = readState();
    if (next.revision !== state.revision || next.updatedAt !== state.updatedAt) {
      state = next;
      for (const client of clients) client.write(`event: board\ndata: ${JSON.stringify(state)}\n\n`);
    }
  } catch (e) { console.error('State reload failed:', e.message); }
}
function json(res, status, value) { if (res.headersSent) return res.end(); res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8'}); res.end(JSON.stringify(value)); }
const files = {'/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/field.js': ['field.js', 'text/javascript'], '/style.css': ['style.css', 'text/css']};
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'");
  const allowedHost = req.headers.host === `127.0.0.1:${port}` || req.headers.host === `localhost:${port}`;
  if (!allowedHost) return json(res, 403, {error: 'Use the local board address.'});
  const origin = req.headers.origin;
  if (origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(origin)) return json(res, 403, {error: 'Cross-origin access denied.'});
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  try {
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, {app:'live-coding-kanban',version,workspaceId,pid:process.pid,port});
    if (req.method === 'GET' && url.pathname === '/api/state') { refresh(); return json(res, 200, {state, token}); }
    if (req.method === 'GET' && url.pathname === '/api/summary') {
      refresh();
      const text = summarize(state, url.searchParams.get('project') || undefined);
      res.writeHead(200, {'Content-Type': 'text/markdown; charset=utf-8'});
      return res.end(text);
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, {'Content-Type': 'text/event-stream', Connection: 'keep-alive'});
      clients.add(res);
      refresh();
      res.write(`event: board\ndata: ${JSON.stringify(state)}\n\n`);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/command') {
      if (req.headers['x-board-token'] !== token) return json(res, 403, {error: 'Reload the board and try again.'});
      let body = '';
      for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 32000) return json(res, 413, {error: 'Command is too large.'}); }
      const command = JSON.parse(body);
      command.actor = 'You';
      const result = await update(command);
      refresh();
      return json(res, 200, result);
    }
    if (req.method === 'GET' && files[url.pathname]) {
      const [file, mime] = files[url.pathname];
      res.writeHead(200, {'Content-Type': mime + '; charset=utf-8'});
      return res.end(fs.readFileSync(path.join(root, 'public', file)));
    }
    if (url.pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
    json(res, 404, {error: 'Not found.'});
  } catch (error) { json(res, 400, {error: error.message}); }
});
const poll = setInterval(refresh, 500);
const heartbeat = setInterval(() => { for (const client of clients) client.write(': heartbeat\n\n'); }, 15000);
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `Port ${port} is already in use. Open the existing board or set BOARD_PORT.` : error.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`Agent Workboard: http://127.0.0.1:${port}`));
function stop() { clearInterval(poll); clearInterval(heartbeat); for (const client of clients) client.end(); server.close(() => process.exit(0)); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
