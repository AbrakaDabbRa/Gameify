/**
 * database.js
 * PostgreSQL database — stores both users and games.
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ── Create tables on startup 
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      username   TEXT NOT NULL UNIQUE,
      password   TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS games (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title      TEXT NOT NULL,
      platform   TEXT NOT NULL DEFAULT 'PC',
      status     TEXT NOT NULL DEFAULT 'Backlog',
      rating     INTEGER DEFAULT 0,
      notes      TEXT DEFAULT '',
      added_at   TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  console.log('  ✅  Database tables ready');
}

// ── User queries 
async function getUserById(id) {
  const r = await pool.query(`SELECT * FROM users WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function getUserByUsername(username) {
  const r = await pool.query(`SELECT * FROM users WHERE LOWER(username) = LOWER($1)`, [username]);
  return r.rows[0] || null;
}

async function getAllUsers() {
  const r = await pool.query(`
    SELECT u.id, u.username, u.created_at,
           COUNT(g.id) AS game_count
    FROM users u
    LEFT JOIN games g ON g.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);
  return r.rows;
}

async function createUser(id, username, password) {
  const r = await pool.query(
    `INSERT INTO users (id, username, password) VALUES ($1, $2, $3) RETURNING *`,
    [id, username, password]
  );
  return r.rows[0];
}

async function deleteUser(id) {
  await pool.query(`DELETE FROM users WHERE id = $1`, [id]);
}

// ── Game queries
async function getGamesByUser(userId) {
  const r = await pool.query(
    `SELECT * FROM games WHERE user_id = $1 ORDER BY added_at DESC`,
    [userId]
  );
  return r.rows;
}

async function createGame({ id, userId, title, platform, status, rating, notes }) {
  const r = await pool.query(
    `INSERT INTO games (id, user_id, title, platform, status, rating, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, userId, title, platform, status, rating, notes]
  );
  return r.rows[0];
}

async function updateGame({ id, userId, title, platform, status, rating, notes }) {
  const r = await pool.query(
    `UPDATE games
     SET title=$3, platform=$4, status=$5, rating=$6, notes=$7, updated_at=NOW()
     WHERE id=$1 AND user_id=$2
     RETURNING *`,
    [id, userId, title, platform, status, rating, notes]
  );
  return r.rows[0] || null;
}

async function deleteGame(id, userId) {
  const r = await pool.query(
    `DELETE FROM games WHERE id=$1 AND user_id=$2 RETURNING *`,
    [id, userId]
  );
  return r.rows[0] || null;
}

module.exports = {
  init,
  getUserById,
  getUserByUsername,
  getAllUsers,
  createUser,
  deleteUser,
  getGamesByUser,
  createGame,
  updateGame,
  deleteGame,
};
