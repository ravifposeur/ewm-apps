// web/app.js
// EventWise browser client — dev-login via local JWKS server.
// Works without Keycloak: fetch token from http://127.0.0.1:9999/sign.

// ============================================================================
// CONFIG
// ============================================================================
const CONFIG = {
  API_BASE_URL: window.ENV?.VITE_API_BASE_URL || 'http://localhost:3000',
  JWKS_SIGN_URL: window.ENV?.VITE_JWKS_SIGN_URL || 'http://127.0.0.1:9999/sign',
};

// ============================================================================
// TOKEN STORE (in-memory, per ADR 0003)
// ============================================================================
class TokenStore {
  constructor() { this._token = null; this._claims = null; }
  set(token) {
    this._token = token;
    try {
      const parts = token.split('.');
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      this._claims = JSON.parse(decodeURIComponent(
        atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
      ));
    } catch (_) { this._claims = null; }
  }
  get() { return this._token; }
  claims() { return this._claims; }
  hasScope(s) {
    const scopes = (this._claims?.scope || '').split(' ').filter(Boolean);
    return scopes.includes(s);
  }
  clear() { this._token = null; this._claims = null; }
  isAuth() { return !!this._token; }
}
const tokenStore = new TokenStore();

// ============================================================================
// API CLIENT (single source of network calls)
// ============================================================================
class ApiClient {
  constructor(tokenStore) {
    this.baseUrl = CONFIG.API_BASE_URL.replace(/\/$/, '');
    this.tokenStore = tokenStore;
    this.etagCache = new Map();
    this.bodyCache = new Map();   // ← TAMBAH INI
  }
  _url(path) {
    return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`;
  }
  async request(method, path, { body = null, headers = {} } = {}) {
    const url = this._url(path);
    const h = {
      'Accept': 'application/json, application/problem+json',
      ...headers,
    };
    if (body !== null) h['Content-Type'] = 'application/json';
    const token = this.tokenStore.get();
    if (token) h['Authorization'] = `Bearer ${token}`;

    // Add If-None-Match for GET if we have an ETag
    if (method === 'GET' && this.etagCache.has(url)) {
      h['If-None-Match'] = this.etagCache.get(url);
    }

    let res;
    try {
      res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : null });
    } catch (err) {
      throw { status: 0, title: 'Network Error', detail: `Cannot reach ${url}. Backend running? CORS enabled?`, type: '/problems/network-error' };
    }

    // 304 Not Modified → return marker; screen keeps its last data
    // 304 Not Modified → return cached body (jika ada) supaya screen tidak kosong
    if (res.status === 304) {
      const cached = this.bodyCache.get(url);
      const etag = this.etagCache.get(url);
      if (cached !== undefined) {
        const result = Array.isArray(cached) ? [...cached] : { ...cached };
        if (typeof result === 'object') {
          result._meta = { status: 304, is304: true, etag };
        }
        return result;
      }
      // Kalau tidak ada cache body, fallback ke marker kosong
      return { _meta: { status: 304, is304: true, etag } };
    }

    let data = null;
    const text = await res.text();
    if (text) { try { data = JSON.parse(text); } catch (_) { data = { raw: text }; } }

    if (!res.ok) {
      const problem = data || { title: 'HTTP Error', detail: `HTTP ${res.status}` };
      problem.status = res.status;
      const errEtag = res.headers.get('etag') || res.headers.get('ETag');
      if (errEtag) problem.currentEtag = errEtag;

      if (res.status === 401) {
        tokenStore.clear();
        showAlert('Session Expired (401)', problem.detail || 'Token invalid. Please login again.');
        switchToLogin();
      } else if (res.status === 403) {
        showAlert('Forbidden (403)', problem.detail || 'Scope kurang.');
      }
      throw problem;
    }

    const etag = res.headers.get('etag') || res.headers.get('ETag');
    if (method === 'GET' && etag) {
      this.etagCache.set(url, etag);
      // Simpan body juga untuk dipakai saat server balas 304
      if (data !== null) {
        this.bodyCache.set(url, data);
      }
    }
    if (data && typeof data === 'object') {
      data._meta = { status: res.status, etag: etag || null };
    }
    return data;
  }
  get(path, opts) { return this.request('GET', path, opts); }
  post(path, body, headers) { return this.request('POST', path, { body, headers }); }
}
const apiClient = new ApiClient(tokenStore);

// ============================================================================
// UI HELPERS
// ============================================================================
const $ = (sel) => document.querySelector(sel);

function showAlert(title, detail, meta = '') {
  $('#alert-title').textContent = title;
  $('#alert-detail').textContent = detail;
  $('#alert-meta').textContent = meta;
  $('#alert-banner').classList.remove('hidden');
}
function hideAlert() { $('#alert-banner').classList.add('hidden'); }

function switchToLogin() {
  $('#view-login').classList.remove('hidden');
  $('#view-app').classList.add('hidden');
  $('#user-info').classList.add('hidden');
  window.location.hash = '';
}
function switchToApp() {
  $('#view-login').classList.add('hidden');
  $('#view-app').classList.remove('hidden');
  $('#user-info').classList.remove('hidden');
  const c = tokenStore.claims() || {};
  $('#user-name').textContent = c.sub || '-';
  $('#user-role').textContent = c.sub || '-';
  $('#session-sub').textContent = c.sub || '-';
  $('#session-scopes').textContent = (c.scope || '').split(' ').join(', ');
}

function renderLoading() {
  return `<div class="card"><div class="skeleton-line" style="width:50%"></div><div class="skeleton-line" style="width:80%"></div><div class="skeleton-line" style="width:60%"></div></div>`;
}
function renderError(err, retryFn) {
  const title = err.title || 'Request Failed';
  const detail = err.detail || err.message || 'Unknown error';
  const status = err.status ? `HTTP ${err.status}` : '';
  return `
    <div class="card">
      <div class="error-banner">
        <span class="error-icon">❌</span>
        <div class="error-content">
          <strong class="error-title">${title}</strong>
          <p class="error-detail">${detail}</p>
          <p class="text-muted small">${status} ${err.type || ''}</p>
        </div>
        <button class="btn btn-sm btn-primary" onclick="${retryFn}">Retry</button>
      </div>
    </div>`;
}
function renderEmpty(msg) {
  return `<div class="card"><div class="empty-state-box"><span class="empty-icon">📂</span><h3>${msg}</h3></div></div>`;
}

// ============================================================================
// SCREENS
// ============================================================================
const screens = {};

screens['/health'] = {
  title: 'W1 — Health Check',
  render: async () => {
    const el = $('#screen-container');
    el.innerHTML = `<h2>W1 — Health Check</h2><p class="text-muted">Public endpoint, no auth.</p>${renderLoading()}`;
    try {
      const data = await apiClient.get('/health');
      el.innerHTML = `
        <h2>W1 — Health Check</h2>
        <p class="text-muted">Public endpoint, no auth.</p>
        <div class="card">
          <h3>✅ Service is healthy</h3>
          <pre class="code-output">${JSON.stringify(data, null, 2)}</pre>
        </div>`;
    } catch (err) {
      el.innerHTML = `<h2>W1 — Health Check</h2>${renderError(err, "navigate('/health')")}`;
    }
  }
};

screens['/events'] = {
  title: 'W2 — Events Directory',
  render: async () => {
    const el = $('#screen-container');
    el.innerHTML = `<h2>W2 — Events Directory</h2><p class="text-muted">GET /v1/events</p>${renderLoading()}`;
    try {
      const data = await apiClient.get('/v1/events');
      const events = Array.isArray(data) ? data : [];
      if (events.length === 0) {
        el.innerHTML = `<h2>W2 — Events Directory</h2>${renderEmpty('No events yet.')}`;
        return;
      }
      const rows = events.map(e => `
        <tr>
          <td><code>${e.id}</code></td>
          <td>${e.name || '-'}</td>
          <td><span class="badge badge-info">${e.status || '-'}</span></td>
          <td>${(e.targetWeight || 0).toLocaleString()} g</td>
          <td><button class="btn btn-sm btn-outline-primary" onclick="navigate('/events/${e.id}')">Detail</button></td>
        </tr>`).join('');
      el.innerHTML = `
        <h2>W2 — Events Directory</h2>
        <p class="text-muted">GET /v1/events</p>
        <div class="card">
          <table class="data-table">
            <thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Target</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    } catch (err) {
      el.innerHTML = `<h2>W2 — Events Directory</h2>${renderError(err, "navigate('/events')")}`;
    }
  }
};

screens['/events/:id'] = {
  render: async (id) => {
    const el = $('#screen-container');
    el.innerHTML = `<h2>W3 — Event Detail</h2><p class="text-muted">GET /v1/events/${id}</p>${renderLoading()}`;
    try {
      const e = await apiClient.get(`/v1/events/${id}`);
      const canConfirm = tokenStore.hasScope('confirmations:write');
      el.innerHTML = `
        <h2>W3 — Event Detail</h2>
        <p class="text-muted">GET /v1/events/${id}</p>
        <div class="card">
          <div class="flex-between mb-2">
            <h3>${e.name || 'Unnamed'}</h3>
            <span class="badge badge-info">${e.status}</span>
          </div>
          <p class="text-muted">ID: <code>${e.id}</code> · Organizer: <code>${e.organizerId || e.organizer_id}</code></p>
          <div class="form-grid-3 mt-3">
            <div><span class="text-muted small">Target Weight</span><br><strong>${(e.targetWeight || 0).toLocaleString()} g</strong></div>
            <div><span class="text-muted small">Points Multiplier</span><br><strong>${e.pointsMultiplier || 1}x</strong></div>
            <div><span class="text-muted small">Bonus Multiplier</span><br><strong>${e.bonusMultiplier || 1}x</strong></div>
          </div>
          <div class="mt-4 flex-between">
            <button class="btn btn-secondary btn-sm" onclick="navigate('/events')">← Back</button>
            ${canConfirm ? `<button class="btn btn-primary btn-sm" onclick="navigate('/events/${e.id}/confirmation')">Confirm →</button>` : ''}
          </div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<h2>W3 — Event Detail</h2>${renderError(err, `navigate('/events/${id}')`)}`;
    }
  }
};

screens['/events/:id/confirmation'] = {
  render: async (id) => {
    const el = $('#screen-container');
    const etag = apiClient.etagCache.get(apiClient._url(`/v1/events/${id}`));
    el.innerHTML = `
      <h2>W4 — Daily Confirmation</h2>
      <p class="text-muted">POST /v1/events/${id}/daily-confirmation</p>
      <div class="card">
        <form id="w4-form">
          <div class="form-group">
            <label class="form-label">Admin ID (from token)</label>
            <input class="form-control" id="w4-admin" value="${tokenStore.claims()?.sub || ''}" readonly>
          </div>
          <div class="form-group">
            <label class="form-label">Verified Breakdown</label>
            <div id="w4-rows"></div>
            <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="addW4Row()">+ Add Row</button>
          </div>
          <div id="w4-error" class="form-feedback-error hidden"></div>
          <div class="flex-between mt-4">
            <span class="text-muted small">If-Match: <code>${etag || '(none)'}</code></span>
            <button type="submit" class="btn btn-primary" id="w4-submit">Submit Confirmation</button>
          </div>
        </form>
      </div>`;
    addW4Row();
    $('#w4-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#w4-submit');
      btn.disabled = true;
      $('#w4-error').classList.add('hidden');
      const rows = document.querySelectorAll('#w4-rows .w4-row');
      const verifiedBreakdown = [];
      rows.forEach(r => {
        const type = r.querySelector('.w4-type').value;
        const w = parseInt(r.querySelector('.w4-weight').value, 10);
        if (w > 0) verifiedBreakdown.push({ wasteType: type, weight: w });
      });
      if (verifiedBreakdown.length === 0) {
        $('#w4-error').textContent = 'At least 1 row with weight > 0 required';
        $('#w4-error').classList.remove('hidden');
        btn.disabled = false;
        return;
      }
      const payload = { adminId: $('#w4-admin').value, verifiedBreakdown };
      const key = crypto.randomUUID();
      const headers = { 'Idempotency-Key': key };
      if (etag) headers['If-Match'] = etag;
      try {
        const result = await apiClient.post(`/v1/events/${id}/daily-confirmation`, payload, headers);
        el.innerHTML = `
          <h2>W4 — Daily Confirmation</h2>
          <div class="card">
            <div class="success-banner">
              <h3>✅ Confirmed</h3>
              <p>Grade: <strong>${result.grade}</strong> · Points: <strong>${result.totalPoints}</strong></p>
              <p class="text-muted small">Recorded: ${result.recordedTotal}g · Verified: ${result.verifiedTotal}g · Hazmat: ${result.hazmatDeducted || 0}g</p>
              <p class="text-muted small">Target met: ${result.targetMet ? 'Yes' : 'No'}</p>
              <div class="mt-3">
                <button class="btn btn-secondary btn-sm" onclick="navigate('/events/${id}')">← Back to Event</button>
              </div>
            </div>
          </div>`;
      } catch (err) {
        if (err.status === 412) {
          $('#w4-error').innerHTML = `⚠️ <strong>Concurrency conflict (412).</strong> Someone updated this event first. ${err.detail || ''}`;
        } else {
          $('#w4-error').textContent = `${err.title || 'Error'}: ${err.detail || ''}`;
        }
        $('#w4-error').classList.remove('hidden');
        btn.disabled = false;
      }
    });
  }
};

function addW4Row() {
  const div = document.createElement('div');
  div.className = 'dynamic-row-item w4-row';
  div.innerHTML = `
    <select class="form-control w4-type" style="flex:1">
      <option value="ORGANIK">ORGANIK</option>
      <option value="ANORGANIK">ANORGANIK</option>
      <option value="RESIDU">RESIDU</option>
      <option value="HAZMAT">HAZMAT</option>
    </select>
    <input type="number" class="form-control w4-weight" style="flex:1" placeholder="Weight (g)" min="0">
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">×</button>`;
  $('#w4-rows').appendChild(div);
}

screens['/collections'] = {
  render: async () => {
    const el = $('#screen-container');
    el.innerHTML = `
      <h2>W5 — Daily Collections</h2>
      <p class="text-muted">POST /v1/daily-collections</p>
      <div class="card">
        <form id="w5-form">
          <div class="form-grid-3">
            <div class="form-group"><label class="form-label">Event ID</label><input class="form-control" id="w5-event" value="evt_001" required></div>
            <div class="form-group"><label class="form-label">Roster ID</label><input class="form-control" id="w5-roster" value="rost_budi" required></div>
            <div class="form-group"><label class="form-label">Shift Date</label><input type="date" class="form-control" id="w5-date" required></div>
          </div>
          <div class="form-group">
            <label class="form-label">Records</label>
            <div id="w5-rows"></div>
            <button type="button" class="btn btn-sm btn-outline-primary mt-2" onclick="addW5Row()">+ Add Record</button>
          </div>
          <div id="w5-error" class="form-feedback-error hidden"></div>
          <div class="flex-between mt-4">
            <span></span>
            <button type="submit" class="btn btn-primary" id="w5-submit">Submit Batch</button>
          </div>
        </form>
      </div>`;
    $('#w5-date').value = new Date().toISOString().split('T')[0];
    addW5Row();
    $('#w5-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#w5-submit');
      btn.disabled = true;
      $('#w5-error').classList.add('hidden');
      const rows = document.querySelectorAll('#w5-rows .w5-row');
      const records = [];
      rows.forEach(r => {
        const siteId = r.querySelector('.w5-site').value;
        const wasteType = r.querySelector('.w5-type').value;
        const weight = parseInt(r.querySelector('.w5-weight').value, 10);
        if (siteId && weight >= 0) records.push({ siteId, wasteType, weight });
      });
      if (records.length === 0) {
        $('#w5-error').textContent = 'At least 1 record required';
        $('#w5-error').classList.remove('hidden');
        btn.disabled = false;
        return;
      }
      const payload = {
        eventId: $('#w5-event').value,
        rosterId: $('#w5-roster').value,
        shiftDate: $('#w5-date').value,
        records,
      };
      try {
        const result = await apiClient.post('/v1/daily-collections', payload, { 'Idempotency-Key': crypto.randomUUID() });
        el.innerHTML = `
          <h2>W5 — Daily Collections</h2>
          <div class="card">
            <div class="success-banner">
              <h3>✅ Batch Accepted (202)</h3>
              <p>Records accepted: <strong>${result.acceptedCount}</strong> · Status: <strong>${result.status}</strong></p>
              <div class="mt-3">
                <button class="btn btn-secondary btn-sm" onclick="navigate('/collections')">Submit Another</button>
              </div>
            </div>
          </div>`;
      } catch (err) {
        $('#w5-error').textContent = `${err.title || 'Error'}: ${err.detail || ''}`;
        $('#w5-error').classList.remove('hidden');
        btn.disabled = false;
      }
    });
  }
};

function addW5Row() {
  const div = document.createElement('div');
  div.className = 'dynamic-row-item w5-row';
  div.innerHTML = `
    <input class="form-control w5-site" style="flex:1" placeholder="site_a" value="site_a">
    <select class="form-control w5-type" style="flex:1">
      <option>ORGANIK</option><option>ANORGANIK</option><option>RESIDU</option><option>HAZMAT</option>
    </select>
    <input type="number" class="form-control w5-weight" style="flex:1" placeholder="Weight (g)" min="0" value="1000">
    <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">×</button>`;
  $('#w5-rows').appendChild(div);
}

// ============================================================================
// ROUTER
// ============================================================================
function navigate(path) {
  window.location.hash = path;
}

function route() {
  if (!tokenStore.isAuth()) {
    switchToLogin();
    return;
  }
  switchToApp();
  const path = window.location.hash.slice(1) || '/events';

  // Match patterns
  let matched = null;
  let params = null;
  for (const key of Object.keys(screens)) {
    const keyParts = key.split('/');
    const pathParts = path.split('/');
    if (keyParts.length !== pathParts.length) continue;
    let ok = true;
    const p = [];
    for (let i = 0; i < keyParts.length; i++) {
      if (keyParts[i].startsWith(':')) p.push(pathParts[i]);
      else if (keyParts[i] !== pathParts[i]) { ok = false; break; }
    }
    if (ok) { matched = key; params = p; break; }
  }
  if (!matched) { navigate('/events'); return; }

  // Highlight nav
  document.querySelectorAll('.nav-item').forEach(a => {
    const r = a.getAttribute('data-route');
    a.classList.toggle('active', path === r || path.startsWith(r + '/'));
  });

  screens[matched].render(...(params || []));
}

window.addEventListener('hashchange', route);

// ============================================================================
// DEV LOGIN (JWKS /sign)
// ============================================================================
const LOGIN_PRESETS = {
  eo:    { sub: 'organizer-a', scopes: ['events:read', 'events:write', 'sites:approve'] },
  admin: { sub: 'organizer-a', scopes: ['events:read', 'confirmations:write'] },
  crew:  { sub: 'crew-a',      scopes: ['events:read', 'collections:write'] },
};

async function devLogin(role) {
  const preset = LOGIN_PRESETS[role];
  if (!preset) return;
  hideAlert();
  try {
    const res = await fetch(CONFIG.JWKS_SIGN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sub: preset.sub, scopes: preset.scopes }),
    });
    if (!res.ok) throw new Error(`JWKS /sign returned ${res.status}`);
    const { token } = await res.json();
    tokenStore.set(token);
    switchToApp();
    navigate('/events');
  } catch (err) {
    showAlert('Login Failed', err.message || 'Cannot reach JWKS server. Is it running at ' + CONFIG.JWKS_SIGN_URL + '?');
  }
}

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  $('#dev-backend').textContent = CONFIG.API_BASE_URL;
  $('#dev-jwks').textContent = CONFIG.JWKS_SIGN_URL;
  document.querySelectorAll('[data-login]').forEach(btn => {
    btn.addEventListener('click', () => devLogin(btn.getAttribute('data-login')));
  });
  $('#alert-close').addEventListener('click', hideAlert);
  $('#btn-logout').addEventListener('click', () => {
    tokenStore.clear();
    apiClient.etagCache.clear();
    apiClient.bodyCache.clear();   // ← TAMBAH INI
    switchToLogin();
  });
  route();
});
