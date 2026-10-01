// web/app.js — EventWise browser client (username+password login via JWKS)

// ============================================================================
// CONFIG
// ============================================================================
const CONFIG = {
  API_BASE_URL: window.ENV?.VITE_API_BASE_URL || 'http://localhost:3000',
  JWKS_SIGN_URL: window.ENV?.VITE_JWKS_SIGN_URL || 'http://127.0.0.1:9999/sign',
};

// ============================================================================
// TOKEN STORE
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
  scopes() { return (this._claims?.scope || '').split(' ').filter(Boolean); }
  hasScope(s) { return this.scopes().includes(s); }
  clear() { this._token = null; this._claims = null; }
  isAuth() { return !!this._token; }
}
const tokenStore = new TokenStore();

// ============================================================================
// API CLIENT
// ============================================================================
class ApiClient {
  constructor(tokenStore) {
    this.baseUrl = CONFIG.API_BASE_URL.replace(/\/$/, '');
    this.tokenStore = tokenStore;
    this.etagCache = new Map();
    this.bodyCache = new Map();
  }
  _url(path) { return `${this.baseUrl}${path.startsWith('/') ? path : '/' + path}`; }

  async request(method, path, { body = null, headers = {} } = {}) {
    const url = this._url(path);
    const h = { 'Accept': 'application/json, application/problem+json', ...headers };
    if (body !== null) h['Content-Type'] = 'application/json';
    const token = this.tokenStore.get();
    if (token) h['Authorization'] = `Bearer ${token}`;
    if (method === 'GET' && this.etagCache.has(url)) h['If-None-Match'] = this.etagCache.get(url);

    let res;
    try {
      res = await fetch(url, { method, headers: h, body: body ? JSON.stringify(body) : null });
    } catch (err) {
      throw { status: 0, title: 'Network Error', detail: `Cannot reach ${url}`, type: '/problems/network-error' };
    }

    if (res.status === 304) {
      const cached = this.bodyCache.get(url);
      const etag = this.etagCache.get(url);
      if (cached !== undefined) {
        const result = Array.isArray(cached) ? [...cached] : { ...cached };
        if (typeof result === 'object') result._meta = { status: 304, is304: true, etag };
        return result;
      }
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
        showAlert('Session expired', problem.detail || 'Please sign in again.');
        switchToLogin();
      }
      throw problem;
    }

    const etag = res.headers.get('etag') || res.headers.get('ETag');
    if (method === 'GET' && etag) {
      this.etagCache.set(url, etag);
      if (data !== null) this.bodyCache.set(url, data);
    }
    if (data && typeof data === 'object') data._meta = { status: res.status, etag: etag || null };
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

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function showAlert(title, detail) {
  $('#alert-title').textContent = title;
  $('#alert-detail').textContent = detail || '';
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
  $('#user-name').textContent = c.sub || '—';
  $('#user-role').textContent = (c.sub || '').includes('admin') ? 'Admin'
    : (c.sub || '').includes('crew') ? 'Crew' : 'Organizer';
  $('#session-sub').textContent = c.sub || '—';
  $('#session-scopes').textContent = tokenStore.scopes().join(' ') || '—';
}

function statusBadge(status) {
  const cls = ['active', 'draft', 'completed'].includes(status) ? `badge-${status}` : 'badge-default';
  return `<span class="badge ${cls}">${escapeHtml(status || 'draft')}</span>`;
}

function renderLoading(rows = 3) {
  let html = '<div class="card"><div class="skeleton" style="width:40%"></div>';
  for (let i = 0; i < rows; i++) html += '<div class="skeleton skeleton-row"></div>';
  html += '</div>';
  return html;
}

function renderEmpty(title, desc) {
  return `<div class="card"><div class="state">
    <div class="state-title">${escapeHtml(title)}</div>
    <div class="state-desc">${escapeHtml(desc || '')}</div>
  </div></div>`;
}

function renderError(err, retryPath) {
  const title = err.title || 'Request failed';
  const detail = err.detail || err.message || 'Unknown error';
  return `<div class="card"><div class="state">
    <div class="state-title">${escapeHtml(title)}</div>
    <div class="state-desc">${escapeHtml(detail)}</div>
    <button class="btn btn-secondary btn-sm" onclick="navigate('${retryPath}')">Retry</button>
  </div></div>`;
}

function pageHeader(title, subtitle, actionHtml = '') {
  return `<div class="page-actions">
    <div>
      <div class="page-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="page-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>
    ${actionHtml}
  </div>`;
}

// ============================================================================
// SCREENS
// ============================================================================
const screens = {};

// ---- Events list ----
screens['/events'] = async () => {
  const el = $('#screen-container');
  el.innerHTML = pageHeader('Events', 'All events you have access to') + renderLoading();
  try {
    const data = await apiClient.get('/v1/events');
    const events = Array.isArray(data) ? data : [];
    if (events.length === 0) {
      el.innerHTML = pageHeader('Events', 'All events you have access to')
        + renderEmpty('No events yet', 'Events you have access to will appear here.');
      return;
    }
    const rows = events.map(e => `
      <tr>
        <td><code>${escapeHtml(e.id)}</code></td>
        <td>${escapeHtml(e.name)}</td>
        <td>${statusBadge(e.status)}</td>
        <td>${(e.targetWeight || 0).toLocaleString()} g</td>
        <td style="text-align:right">
          <button class="btn btn-secondary btn-sm" onclick="navigate('/events/${escapeHtml(e.id)}')">Open</button>
        </td>
      </tr>`).join('');
    el.innerHTML = pageHeader('Events', `${events.length} event${events.length === 1 ? '' : 's'} available`)
      + `<div class="card">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>ID</th><th>Name</th><th>Status</th><th>Target</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>`;
  } catch (err) {
    el.innerHTML = pageHeader('Events') + renderError(err, '/events');
  }
};

// ---- Event detail ----
screens['/events/:id'] = async (id) => {
  const el = $('#screen-container');
  el.innerHTML = `<a class="back-link" href="#/events" data-route="/events">&larr; Events</a>`
    + renderLoading();
  try {
    const e = await apiClient.get(`/v1/events/${id}`);
    const canConfirm = tokenStore.hasScope('confirmations:write');
    const canCollect = tokenStore.hasScope('collections:write');

    let actionHtml = '';
    if (canConfirm) {
      actionHtml = `<button class="btn btn-primary" onclick="navigate('/events/${escapeHtml(e.id)}/confirmation')">Confirm event</button>`;
    } else if (canCollect) {
      actionHtml = `<button class="btn btn-primary" onclick="navigate('/collections?eventId=${escapeHtml(e.id)}')">Submit collection</button>`;
    }

    el.innerHTML = `
      <a class="back-link" href="#/events" data-route="/events">&larr; Events</a>
      <div class="page-actions">
        <div>
          <div class="page-title">${escapeHtml(e.name)}</div>
          <div class="page-subtitle"><code>${escapeHtml(e.id)}</code> &middot; ${escapeHtml(e.organizerId || e.organizer_id || '')}</div>
        </div>
        <div>${actionHtml}</div>
      </div>

      <div class="card">
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">Status</span>
            <div class="info-value">${statusBadge(e.status)}</div>
          </div>
          <div class="info-item">
            <span class="info-label">Target weight</span>
            <div class="info-value">${(e.targetWeight || 0).toLocaleString()} g</div>
          </div>
          <div class="info-item">
            <span class="info-label">Points multiplier</span>
            <div class="info-value">${e.pointsMultiplier ?? 1}x</div>
          </div>
          <div class="info-item">
            <span class="info-label">Bonus multiplier</span>
            <div class="info-value">${e.bonusMultiplier ?? 1}x</div>
          </div>
          <div class="info-item">
            <span class="info-label">Scheduled</span>
            <div class="info-value">${e.scheduledDate ? new Date(e.scheduledDate).toLocaleDateString() : '—'}</div>
          </div>
        </div>
      </div>`;
  } catch (err) {
    el.innerHTML = `<a class="back-link" href="#/events" data-route="/events">&larr; Events</a>`
      + renderError(err, `/events/${id}`);
  }
};

// ---- Confirmation form ----
screens['/events/:id/confirmation'] = async (id) => {
  const el = $('#screen-container');
  const etag = apiClient.etagCache.get(apiClient._url(`/v1/events/${id}`));
  const claims = tokenStore.claims() || {};

  el.innerHTML = `
    <a class="back-link" href="#/events/${escapeHtml(id)}" data-route="/events/${escapeHtml(id)}">&larr; Event detail</a>
    <div class="page-header">
      <div class="page-title">Confirm event</div>
      <div class="page-subtitle">Enter the verified weight breakdown from the depot scales.</div>
    </div>

    <div class="card">
      <form id="form">
        <div class="form-group">
          <label class="form-label">Admin subject</label>
          <input class="form-input" value="${escapeHtml(claims.sub || '')}" readonly>
        </div>

        <div class="form-group">
          <label class="form-label">Verified breakdown</label>
          <div id="rows" class="rows"></div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addBreakdownRow()">Add row</button>
          <div id="rows-total" class="row-total">
            <span>Total verified weight</span>
            <strong id="total-weight">0 g</strong>
          </div>
        </div>

        <div id="form-error" class="form-error hidden"></div>
        <div id="conflict" class="banner banner-warning hidden"></div>

        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="navigate('/events/${escapeHtml(id)}')">Cancel</button>
          <button type="submit" class="btn btn-primary" id="submit-btn">Confirm</button>
        </div>
      </form>
    </div>`;

  addBreakdownRow();

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submit-btn');
    btn.disabled = true;
    $('#form-error').classList.add('hidden');
    $('#conflict').classList.add('hidden');

    const rows = [...document.querySelectorAll('#rows .row')];
    const verifiedBreakdown = [];
    for (const r of rows) {
      const type = r.querySelector('.row-type').value;
      const w = parseInt(r.querySelector('.row-weight').value, 10);
      if (w > 0) verifiedBreakdown.push({ wasteType: type, weight: w });
    }

    if (verifiedBreakdown.length === 0) {
      $('#form-error').textContent = 'Add at least one row with a weight greater than 0.';
      $('#form-error').classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    const payload = { adminId: claims.sub, verifiedBreakdown };
    const headers = { 'Idempotency-Key': crypto.randomUUID() };
    if (etag) headers['If-Match'] = etag;

    try {
      const result = await apiClient.post(`/v1/events/${id}/daily-confirmation`, payload, headers);
      el.innerHTML = `
        <a class="back-link" href="#/events/${escapeHtml(id)}" data-route="/events/${escapeHtml(id)}">&larr; Event detail</a>
        <div class="page-header">
          <div class="page-title">Confirmation successful</div>
          <div class="page-subtitle">The event has been confirmed and points awarded.</div>
        </div>
        <div class="card">
          <div class="info-grid">
            <div class="info-item"><span class="info-label">Grade</span><div class="info-value">${escapeHtml(result.grade)}</div></div>
            <div class="info-item"><span class="info-label">Total points</span><div class="info-value">${(result.totalPoints || 0).toLocaleString()}</div></div>
            <div class="info-item"><span class="info-label">Recorded total</span><div class="info-value">${(result.recordedTotal || 0).toLocaleString()} g</div></div>
            <div class="info-item"><span class="info-label">Verified total</span><div class="info-value">${(result.verifiedTotal || 0).toLocaleString()} g</div></div>
            <div class="info-item"><span class="info-label">Target met</span><div class="info-value">${result.targetMet ? 'Yes' : 'No'}</div></div>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" onclick="navigate('/events/${escapeHtml(id)}')">Back to event</button>
          </div>
        </div>`;
    } catch (err) {
      if (err.status === 412) {
        const c = $('#conflict');
        c.innerHTML = `<div class="banner-title">Concurrency conflict</div>
          <div class="banner-desc">Someone else updated this event first. Refresh and try again.</div>`;
        c.classList.remove('hidden');
      } else {
        $('#form-error').textContent = err.detail || err.title || 'Request failed.';
        $('#form-error').classList.remove('hidden');
      }
      btn.disabled = false;
    }
  });
};

function addBreakdownRow() {
  const container = $('#rows');
  const div = document.createElement('div');
  div.className = 'row';
  div.innerHTML = `
    <select class="form-select row-type">
      <option value="ORGANIK">Organik</option>
      <option value="ANORGANIK">Anorganik</option>
      <option value="RESIDU">Residu</option>
      <option value="HAZMAT">Hazmat</option>
    </select>
    <input type="number" class="form-input row-weight" placeholder="Weight (g)" min="0" value="0">
    <button type="button" class="row-remove" onclick="this.parentElement.remove(); updateBreakdownTotal();" aria-label="Remove">&times;</button>`;
  div.querySelector('.row-weight').addEventListener('input', updateBreakdownTotal);
  container.appendChild(div);
  updateBreakdownTotal();
}

function updateBreakdownTotal() {
  const rows = [...document.querySelectorAll('#rows .row')];
  let total = 0;
  for (const r of rows) {
    const v = parseInt(r.querySelector('.row-weight').value, 10);
    if (!isNaN(v) && v > 0) total += v;
  }
  const el = $('#total-weight');
  if (el) el.textContent = `${total.toLocaleString()} g`;
}

// ---- Collections form ----
screens['/collections'] = async () => {
  const el = $('#screen-container');
  const params = new URLSearchParams(window.location.hash.split('?')[1] || '');
  const presetEvent = params.get('eventId') || 'evt_001';

  el.innerHTML = `
    <div class="page-header">
      <div class="page-title">Submit collection</div>
      <div class="page-subtitle">Record the waste collected during a shift.</div>
    </div>
    <div class="card">
      <form id="form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Event ID</label>
            <input class="form-input" id="eventId" value="${escapeHtml(presetEvent)}" required>
          </div>
          <div class="form-group">
            <label class="form-label">Roster ID</label>
            <input class="form-input" id="rosterId" value="rost_budi" required>
          </div>
          <div class="form-group">
            <label class="form-label">Shift date</label>
            <input type="date" class="form-input" id="shiftDate" required>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Collection records</label>
          <div id="records" class="rows"></div>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="addCollectionRow()">Add record</button>
          <div class="row-total">
            <span>Total collected weight</span>
            <strong id="total-weight">0 g</strong>
          </div>
        </div>

        <div id="form-error" class="form-error hidden"></div>

        <div class="form-actions">
          <button type="submit" class="btn btn-primary" id="submit-btn">Submit batch</button>
        </div>
      </form>
    </div>`;

  $('#shiftDate').value = new Date().toISOString().split('T')[0];
  addCollectionRow();

  $('#form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#submit-btn');
    btn.disabled = true;
    $('#form-error').classList.add('hidden');

    const rows = [...document.querySelectorAll('#records .row')];
    const records = [];
    for (const r of rows) {
      const siteId = r.querySelector('.row-site').value.trim();
      const wasteType = r.querySelector('.row-type').value;
      const weight = parseInt(r.querySelector('.row-weight').value, 10);
      if (siteId && weight >= 0) records.push({ siteId, wasteType, weight });
    }

    if (records.length === 0) {
      $('#form-error').textContent = 'Add at least one record.';
      $('#form-error').classList.remove('hidden');
      btn.disabled = false;
      return;
    }

    const payload = {
      eventId: $('#eventId').value.trim(),
      rosterId: $('#rosterId').value.trim(),
      shiftDate: $('#shiftDate').value,
      records,
    };

    try {
      const result = await apiClient.post('/v1/daily-collections', payload, { 'Idempotency-Key': crypto.randomUUID() });
      el.innerHTML = `
        <div class="page-header">
          <div class="page-title">Collection submitted</div>
          <div class="page-subtitle">The batch has been accepted and is queued for verification.</div>
        </div>
        <div class="card">
          <div class="info-grid">
            <div class="info-item"><span class="info-label">Accepted records</span><div class="info-value">${result.acceptedCount}</div></div>
            <div class="info-item"><span class="info-label">Status</span><div class="info-value">${escapeHtml(result.status)}</div></div>
          </div>
          <div class="form-actions">
            <button class="btn btn-secondary" onclick="navigate('/collections')">Submit another</button>
          </div>
        </div>`;
    } catch (err) {
      $('#form-error').textContent = err.detail || err.title || 'Request failed.';
      $('#form-error').classList.remove('hidden');
      btn.disabled = false;
    }
  });
};

function addCollectionRow() {
  const container = $('#records');
  const div = document.createElement('div');
  div.className = 'row';
  div.innerHTML = `
    <input class="form-input row-site" placeholder="Site ID (e.g. site_a)" value="site_a">
    <select class="form-select row-type">
      <option value="ORGANIK">Organik</option>
      <option value="ANORGANIK">Anorganik</option>
      <option value="RESIDU">Residu</option>
      <option value="HAZMAT">Hazmat</option>
    </select>
    <input type="number" class="form-input row-weight" placeholder="Weight (g)" min="0" value="1000">
    <button type="button" class="row-remove" onclick="this.parentElement.remove(); updateCollectionTotal();" aria-label="Remove">&times;</button>`;
  div.querySelector('.row-weight').addEventListener('input', updateCollectionTotal);
  container.appendChild(div);
  updateCollectionTotal();
}

function updateCollectionTotal() {
  const rows = [...document.querySelectorAll('#records .row')];
  let total = 0;
  for (const r of rows) {
    const v = parseInt(r.querySelector('.row-weight').value, 10);
    if (!isNaN(v) && v > 0) total += v;
  }
  const el = $('#total-weight');
  if (el) el.textContent = `${total.toLocaleString()} g`;
}

// ---- Health ----
screens['/health'] = async () => {
  const el = $('#screen-container');
  el.innerHTML = pageHeader('System health', 'Current status of the backend service') + renderLoading(1);
  try {
    const data = await apiClient.get('/health');
    el.innerHTML = pageHeader('System health', 'Current status of the backend service')
      + `<div class="card">
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Status</span>
              <div class="info-value" style="color:var(--success)">${escapeHtml(data.status || 'ok')}</div>
            </div>
            <div class="info-item">
              <span class="info-label">Endpoint</span>
              <div class="info-value mono">${escapeHtml(CONFIG.API_BASE_URL)}/health</div>
            </div>
          </div>
        </div>`;
  } catch (err) {
    el.innerHTML = pageHeader('System health') + renderError(err, '/health');
  }
};

// ============================================================================
// ROUTER
// ============================================================================
function navigate(path) {
  window.location.hash = path;
}

function matchRoute(path) {
  const parts = path.split('?')[0].split('/').filter(Boolean);
  const candidates = [
    { key: '/events/:id/confirmation', pattern: ['events', ':id', 'confirmation'] },
    { key: '/events/:id', pattern: ['events', ':id'] },
    { key: '/events', pattern: ['events'] },
    { key: '/collections', pattern: ['collections'] },
    { key: '/health', pattern: ['health'] },
  ];
  for (const c of candidates) {
    if (c.pattern.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < c.pattern.length; i++) {
      if (c.pattern[i].startsWith(':')) params[c.pattern[i].slice(1)] = parts[i];
      else if (c.pattern[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { key: c.key, params };
  }
  return null;
}

function route() {
  if (!tokenStore.isAuth()) { switchToLogin(); return; }
  switchToApp();

  const hash = window.location.hash.slice(1) || '/events';
  const matched = matchRoute(hash);
  const path = hash.split('?')[0];

  document.querySelectorAll('.nav-item').forEach(a => {
    const r = a.getAttribute('data-route');
    a.classList.toggle('active', path === r || path.startsWith(r + '/'));
  });

  if (!matched) { navigate('/events'); return; }

  if (matched.key === '/events/:id/confirmation') {
    screens['/events/:id/confirmation'](matched.params.id);
  } else if (matched.key === '/events/:id') {
    screens['/events/:id'](matched.params.id);
  } else {
    screens[matched.key]();
  }
}

window.addEventListener('hashchange', route);

// ============================================================================
// LOGIN (username + password → JWKS /login)
// ============================================================================
function getJwksBaseUrl() {
  return CONFIG.JWKS_SIGN_URL.replace(/\/sign\/?$/, '');
}

async function performLogin(username, password) {
  const res = await fetch(`${getJwksBaseUrl()}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  let data = null;
  try { data = await res.json(); } catch (_) {}

  if (!res.ok) {
    const detail = (data && (data.title || data.detail)) || 'Invalid credentials.';
    throw new Error(detail);
  }

  if (!data || !data.token) throw new Error('No token returned.');
  return data.token;
}

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  const envInfo = $('#env-info');
  if (envInfo) envInfo.textContent = `API: ${CONFIG.API_BASE_URL}`;

  const loginForm = $('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#login-submit');
      const errEl = $('#login-error');
      errEl.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Signing in...';

      const username = $('#login-username').value.trim();
      const password = $('#login-password').value;

      try {
        const token = await performLogin(username, password);
        tokenStore.set(token);
        $('#login-password').value = '';
        switchToApp();
        navigate('/events');
      } catch (err) {
        errEl.textContent = err.message || 'Sign-in failed.';
        errEl.classList.remove('hidden');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Sign in';
      }
    });
  }

  $('#alert-close').addEventListener('click', hideAlert);

  $('#btn-logout').addEventListener('click', () => {
    tokenStore.clear();
    apiClient.etagCache.clear();
    apiClient.bodyCache.clear();
    switchToLogin();
  });

  route();
});
