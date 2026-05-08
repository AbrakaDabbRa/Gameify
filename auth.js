/**
 * auth.js
 * Password hashing, tokens, cookies.
 */

const crypto = require('crypto');
const SECRET = process.env.JWT_SECRET || 'gameify-secret-change-in-production';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return check === hash;
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const sig    = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const [header, body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch { return null; }
}

function getAuthUser(req) {
  const cookie = (req.headers.cookie || '').split(';').find(c => c.trim().startsWith('gameify_token='));
  const token  = cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
  return token ? verifyToken(token) : null;
}

function setCookie(token) { return `gameify_token=${token}; HttpOnly; Path=/; Max-Age=${7 * 24 * 3600}; SameSite=Lax`; }
function clearCookie()    { return `gameify_token=; HttpOnly; Path=/; Max-Age=0`; }
function makeUUID()       { return crypto.randomUUID(); }

module.exports = { hashPassword, verifyPassword, signToken, getAuthUser, setCookie, clearCookie, makeUUID };
