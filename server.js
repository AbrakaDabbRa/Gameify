/**
 * server.js
 * Main entry point.
 * - Serves static files from /public
 * - Auth routes: /auth/register, /auth/login, /auth/logout, /auth/me
 * - Games API: /api/games (CRUD, stored in PostgreSQL)
 * - Admin API: /api/admin/users, /api/admin/deleteuser
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { URL } = require('url');

const db   = require('./database');
const auth = require('./auth');

const PORT           = process.env.PORT || 3000;
const PUBLIC_DIR     = path.join(__dirname, 'public');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gamify123';

// ── MIME types ─────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// ── Helpers ────────────────────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => body += c);
    req.on('end',  () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function json(res, status, data, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...extraHeaders });
  res.end(JSON.stringify(data));
}

function serveStatic(res, pathname) {
  // Serve admin.html for /admin route
  const filePath = pathname === '/admin'
    ? path.join(PUBLIC_DIR, 'admin.html')
    : (pathname === '/' || !path.extname(pathname))
      ? path.join(PUBLIC_DIR, 'index.html')
      : path.join(PUBLIC_DIR, pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end(); }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e, html) => {
        if (e) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'text/html; charset=utf-8' });
    res.end(data);
  });
}

// ── Format game row ────────────────────────────────────────────────────────
function formatGame(row) {
  return {
    id:        row.id,
    title:     row.title,
    platform:  row.platform,
    status:    row.status,
    rating:    row.rating,
    notes:     row.notes,
    addedAt:   row.added_at,
    updatedAt: row.updated_at,
  };
}

// ── Start server after DB is ready ─────────────────────────────────────────
db.init().then(() => {

  http.createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const method = req.method.toUpperCase();

    if (method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' });
      return res.end();
    }

    try {

      // ── POST /auth/register ────────────────────────────────────────────
      if (pathname === '/auth/register' && method === 'POST') {
        const { username, password } = await parseBody(req);
        if (!username || !password)               return json(res, 400, { error: 'Username and password required' });
        if (username.length < 3)                  return json(res, 400, { error: 'Username must be at least 3 characters' });
        if (password.length < 6)                  return json(res, 400, { error: 'Password must be at least 6 characters' });
        if (await db.getUserByUsername(username))  return json(res, 400, { error: 'Username already taken' });

        const user  = await db.createUser(auth.makeUUID(), username.trim(), auth.hashPassword(password));
        const token = auth.signToken({ id: user.id, username: user.username });
        return json(res, 201, { user: { id: user.id, username: user.username } }, { 'Set-Cookie': auth.setCookie(token) });
      }

      // ── POST /auth/login ───────────────────────────────────────────────
      if (pathname === '/auth/login' && method === 'POST') {
        const { username, password } = await parseBody(req);
        if (!username || !password) return json(res, 400, { error: 'Username and password required' });

        const user = await db.getUserByUsername(username);
        if (!user || !auth.verifyPassword(password, user.password))
          return json(res, 401, { error: 'Invalid username or password' });

        const token = auth.signToken({ id: user.id, username: user.username });
        return json(res, 200, { user: { id: user.id, username: user.username } }, { 'Set-Cookie': auth.setCookie(token) });
      }

      // ── POST /auth/logout ──────────────────────────────────────────────
      if (pathname === '/auth/logout' && method === 'POST') {
        return json(res, 200, { ok: true }, { 'Set-Cookie': auth.clearCookie() });
      }

      // ── GET /auth/me ───────────────────────────────────────────────────
      if (pathname === '/auth/me' && method === 'GET') {
        const payload = auth.getAuthUser(req);
        if (!payload) return json(res, 401, { error: 'Not logged in' });
        const user = await db.getUserById(payload.id);
        if (!user)    return json(res, 401, { error: 'User not found' });
        return json(res, 200, { id: user.id, username: user.username });
      }

      // ── GET /api/admin/users ───────────────────────────────────────────
      if (pathname === '/api/admin/users' && method === 'GET') {
        const params   = new URL(req.url, 'http://localhost').searchParams;
        const password = params.get('password');
        if (password !== ADMIN_PASSWORD) return json(res, 401, { error: 'Invalid admin password' });
        const users = await db.getAllUsers();
        return json(res, 200, users);
      }

      // ── POST /api/admin/deleteuser ─────────────────────────────────────
      if (pathname === '/api/admin/deleteuser' && method === 'POST') {
        const { password, userId } = await parseBody(req);
        if (password !== ADMIN_PASSWORD) return json(res, 401, { error: 'Invalid admin password' });
        if (!userId) return json(res, 400, { error: 'userId required' });
        await db.deleteUser(userId);
        return json(res, 200, { ok: true });
      }

      // ── Games API (/api/games) ─────────────────────────────────────────
      if (pathname.startsWith('/api/games')) {
        const payload = auth.getAuthUser(req);
        if (!payload) return json(res, 401, { error: 'Please log in' });

        const idMatch = pathname.match(/^\/api\/games\/([^/]+)$/);
        const id      = idMatch ? idMatch[1] : null;

        // GET all games
        if (method === 'GET' && !id) {
          const games = await db.getGamesByUser(payload.id);
          return json(res, 200, games.map(formatGame));
        }

        // POST - add game
        if (method === 'POST' && !id) {
          const { title, platform, status, rating, notes } = await parseBody(req);
          if (!title?.trim()) return json(res, 400, { error: 'Title is required' });
          const game = await db.createGame({
            id:       auth.makeUUID(),
            userId:   payload.id,
            title:    title.trim(),
            platform: platform || 'PC',
            status:   status   || 'Backlog',
            rating:   rating   || 0,
            notes:    notes    || '',
          });
          return json(res, 201, formatGame(game));
        }

        // PUT - update game
        if (method === 'PUT' && id) {
          const { title, platform, status, rating, notes } = await parseBody(req);
          if (!title?.trim()) return json(res, 400, { error: 'Title is required' });
          const game = await db.updateGame({ id, userId: payload.id, title: title.trim(), platform, status, rating, notes });
          if (!game) return json(res, 404, { error: 'Game not found' });
          return json(res, 200, formatGame(game));
        }

        // DELETE - remove game
        if (method === 'DELETE' && id) {
          const game = await db.deleteGame(id, payload.id);
          if (!game) return json(res, 404, { error: 'Game not found' });
          return json(res, 200, formatGame(game));
        }

        return json(res, 405, { error: 'Method not allowed' });
      }

      // ── Static files ───────────────────────────────────────────────────
      serveStatic(res, pathname);

    } catch (e) {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Server error' });
    }

  }).listen(PORT, () => {
    console.log(`\n  🎮  GAMEIFY     →  http://localhost:${PORT}`);
    console.log(`  🗄️   Database    →  PostgreSQL (Render)`);
    console.log(`  📁  Static      →  /public\n`);
  });

}).catch(err => {
  console.error('Failed to connect to database:', err.message);
  process.exit(1);
});
