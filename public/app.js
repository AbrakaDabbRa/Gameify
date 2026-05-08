/**
 * app.js — Gameify frontend
 */

// ── State ──────────────────────────────────────────────────────────────────
const state = {
  games:      [],
  filter:     'All',
  search:     '',
  addRating:  0,
  editRating: 0,
  user:       null,
};

// ══════════════════════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════════════════════
async function boot() {
  try {
    const r = await fetch('/auth/me');
    if (r.ok) {
      state.user = await r.json();
      showApp();
    } else {
      showAuth();
    }
  } catch {
    showAuth();
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE SWITCHING
// ══════════════════════════════════════════════════════════════════════════════
function showAuth() {
  document.getElementById('auth-page').classList.remove('hidden');
  document.getElementById('main-app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-page').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  document.getElementById('user-display').textContent = state.user.username;
  initStars('f-rating-stars', v => { state.addRating = v; });
  initStars('e-rating-stars', v => { state.editRating = v; });
  loadGames();
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════
function switchTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((btn, i) => {
    btn.classList.toggle('active', (i === 0 && tab === 'login') || (i === 1 && tab === 'register'));
  });
  document.getElementById('login-form').classList.toggle('hidden',    tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  hideAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.add('show');
}

function hideAuthError() {
  document.getElementById('auth-error').classList.remove('show');
}

async function login() {
  const username = document.getElementById('l-username').value.trim();
  const password = document.getElementById('l-password').value;
  if (!username || !password) return showAuthError('Please fill in all fields.');

  const btn = document.getElementById('btn-login');
  btn.disabled = true; btn.textContent = 'Signing in…';

  try {
    const data = await api('/auth/login', 'POST', { username, password });
    state.user  = data.user;
    showApp();
  } catch (e) {
    showAuthError(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Sign In';
  }
}

async function register() {
  const username = document.getElementById('r-username').value.trim();
  const password = document.getElementById('r-password').value;
  if (!username || !password) return showAuthError('Username and password are required.');

  const btn = document.getElementById('btn-register');
  btn.disabled = true; btn.textContent = 'Creating account…';

  try {
    const data = await api('/auth/register', 'POST', { username, password });
    state.user  = data.user;
    showApp();
  } catch (e) {
    showAuthError(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Create Account';
  }
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  state.user  = null;
  state.games = [];
  showAuth();
}

// ══════════════════════════════════════════════════════════════════════════════
// GAMES — LOAD & RENDER
// ══════════════════════════════════════════════════════════════════════════════
async function loadGames() {
  try {
    state.games = await api('/api/games');
    render();
  } catch (e) {
    document.getElementById('game-grid').innerHTML =
      `<div class="empty-state"><div class="big">ERROR</div><p>${esc(e.message)}</p></div>`;
  }
}

function render() {
  const q        = state.search.toLowerCase();
  const filtered = state.games.filter(g => {
    const mf = state.filter === 'All' || g.status === state.filter;
    const ms = !q || g.title.toLowerCase().includes(q) || g.platform.toLowerCase().includes(q);
    return mf && ms;
  });

  // Stats
  document.getElementById('stat-total').textContent   = state.games.length;
  document.getElementById('stat-playing').textContent = state.games.filter(g => g.status === 'Playing').length;
  document.getElementById('stat-backlog').textContent = state.games.filter(g => g.status === 'Backlog').length;
  document.getElementById('stat-done').textContent    = state.games.filter(g => g.status === 'Completed').length;

  const grid = document.getElementById('game-grid');

  if (!filtered.length) {
    const msg = state.games.length ? 'No games match your filter.' : 'No games yet — add your first one above!';
    grid.innerHTML = `<div class="empty-state"><div class="big">EMPTY</div><p>${msg}</p></div>`;
    return;
  }

  grid.innerHTML = filtered.map(g => {
    const stars = [1,2,3,4,5].map(i =>
      `<span class="star${i <= (g.rating || 0) ? ' filled' : ''}">★</span>`
    ).join('');
    const notes = g.notes ? `<div class="card-notes">${esc(g.notes)}</div>` : '';
    return `
      <div class="game-card">
        <div class="card-top">
          <div class="game-title">${esc(g.title)}</div>
          <span class="platform-badge">${esc(g.platform)}</span>
        </div>
        <div class="card-meta">
          <span class="status-pill status-${esc(g.status)}">${esc(g.status)}</span>
          <div class="stars">${stars}</div>
        </div>
        ${notes}
        <div class="card-actions">
          <button class="btn btn-ghost btn-sm" onclick="openEdit('${esc(g.id)}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteGame('${esc(g.id)}')">Delete</button>
        </div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════════════
// GAMES — CRUD
// ══════════════════════════════════════════════════════════════════════════════

// CREATE
async function addGame() {
  const title    = document.getElementById('f-title').value.trim();
  const platform = document.getElementById('f-platform').value;
  const status   = document.getElementById('f-status').value;
  if (!title) return toast('Please enter a game title.', 'error');

  const btn = document.getElementById('btn-add');
  btn.disabled = true;
  try {
    const game = await api('/api/games', 'POST', { title, platform, status, rating: state.addRating });
    state.games.unshift(game);
    render();
    document.getElementById('f-title').value = '';
    state.addRating = 0;
    renderStars('f-rating-stars', 0);
    toast('Game added!');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

// DELETE
async function deleteGame(id) {
  if (!confirm('Remove this game from your library?')) return;
  try {
    await api(`/api/games/${id}`, 'DELETE');
    state.games = state.games.filter(g => g.id !== id);
    render();
    toast('Game removed.');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// EDIT MODAL
function openEdit(id) {
  const g = state.games.find(x => x.id === id);
  if (!g) return;
  document.getElementById('e-id').value       = g.id;
  document.getElementById('e-title').value    = g.title;
  document.getElementById('e-platform').value = g.platform;
  document.getElementById('e-status').value   = g.status;
  document.getElementById('e-notes').value    = g.notes || '';
  state.editRating = g.rating || 0;
  renderStars('e-rating-stars', state.editRating);
  document.getElementById('modal').classList.add('open');
}

function closeModal()          { document.getElementById('modal').classList.remove('open'); }
function handleModalClick(e)   { if (e.target === e.currentTarget) closeModal(); }

// UPDATE
async function saveEdit() {
  const id       = document.getElementById('e-id').value;
  const title    = document.getElementById('e-title').value.trim();
  const platform = document.getElementById('e-platform').value;
  const status   = document.getElementById('e-status').value;
  const notes    = document.getElementById('e-notes').value.trim();
  if (!title) return toast('Title is required.', 'error');

  try {
    const updated = await api(`/api/games/${id}`, 'PUT', { title, platform, status, rating: state.editRating, notes });
    state.games   = state.games.map(g => g.id === id ? updated : g);
    render();
    closeModal();
    toast('Game updated!');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FILTER & SEARCH
// ══════════════════════════════════════════════════════════════════════════════
function setFilter(f, btn) {
  state.filter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  render();
}

function onSearch(value) {
  state.search = value;
  render();
}

// ══════════════════════════════════════════════════════════════════════════════
// STARS
// ══════════════════════════════════════════════════════════════════════════════
function initStars(containerId, onSet) {
  document.getElementById(containerId).querySelectorAll('.star').forEach(s => {
    s.addEventListener('click',      () => { const v = +s.dataset.v; onSet(v); renderStars(containerId, v); });
    s.addEventListener('mouseenter', () => renderStars(containerId, +s.dataset.v));
    s.addEventListener('mouseleave', () => renderStars(containerId, containerId === 'f-rating-stars' ? state.addRating : state.editRating));
  });
}

function renderStars(containerId, value) {
  document.getElementById(containerId).querySelectorAll('.star')
    .forEach(s => s.classList.toggle('filled', +s.dataset.v <= value));
}

// ══════════════════════════════════════════════════════════════════════════════
// KEYBOARD SHORTCUTS
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'Enter' && !document.getElementById('auth-page').classList.contains('hidden')) {
    document.getElementById('login-form').classList.contains('hidden') ? register() : login();
  }
});

document.getElementById('f-title').addEventListener('keydown', e => {
  if (e.key === 'Enter') addGame();
});

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════
async function api(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r    = await fetch(url, opts);
  const data = await r.json();
  if (r.status === 401 && url !== '/auth/login' && url !== '/auth/register') {
    state.user = null; showAuth();
    throw new Error('Session expired. Please sign in again.');
  }
  if (!r.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `show ${type}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.className = ''; }, 2800);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// ── Start ──────────────────────────────────────────────────────────────────
boot();
