// web/app.js - EventWise Core Platform Browser App (Batch 1 Foundation)

/**
 * ============================================================================
 * 1. CONFIGURATION & CONSTANTS
 * ============================================================================
 */
const CONFIG = {
  OIDC_ISSUER: window.ENV?.VITE_OIDC_ISSUER || 'http://localhost:8080/realms/eventwise',
  API_BASE_URL: window.ENV?.VITE_API_BASE_URL || 'http://localhost:3000',
  REDIRECT_URI: window.location.origin + window.location.pathname,
  CLIENTS: {
    WEB_ADMIN: {
      clientId: 'web-admin',
      name: 'Admin / Depot Operator',
      scopes: ['events:read', 'confirmations:write', 'rosters:read', 'rosters:write'],
    },
    WEB_EO: {
      clientId: 'web-eo',
      name: 'Event Organizer (EO)',
      scopes: ['events:read', 'events:write', 'sites:approve'],
    },
    DEVICE_CREW: {
      clientId: 'device-crew',
      name: 'Field Collection Crew',
      scopes: ['events:read', 'collections:write'],
    },
  },
};

/**
 * ============================================================================
 * 2. IN-MEMORY TOKEN STORE (ADR 0003: Volatile Memory Only)
 * ============================================================================
 */
class InMemoryTokenStore {
  constructor() {
    this._accessToken = null;
    this._expiresAt = null;
    this._scopes = [];
    this._claims = null;
  }

  setTokens({ accessToken, expiresIn, scopes = [] }) {
    if (!accessToken || typeof accessToken !== 'string') {
      throw new Error('Invalid access token provided.');
    }
    this._accessToken = accessToken;
    this._expiresAt = Date.now() + (expiresIn || 300) * 1000;
    this._scopes = Array.isArray(scopes) ? scopes : [];
    this._claims = this._parseJwtPayload(accessToken);
  }

  getAccessToken() {
    if (!this._accessToken) return null;
    if (this.isExpired()) {
      this.clear();
      return null;
    }
    return this._accessToken;
  }

  getClaims() {
    return this._claims;
  }

  getScopes() {
    return this._scopes;
  }

  hasScope(requiredScope) {
    if (!requiredScope) return true;
    return this._scopes.includes(requiredScope);
  }

  isAuthenticated() {
    return !this.isExpired() && this._accessToken !== null;
  }

  isExpired() {
    if (!this._expiresAt) return true;
    return Date.now() >= this._expiresAt - 10000; // 10s leeway
  }

  clear() {
    this._accessToken = null;
    this._expiresAt = null;
    this._scopes = [];
    this._claims = null;
  }

  _parseJwtPayload(token) {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(json);
    } catch (_) {
      return null;
    }
  }
}

const tokenStore = new InMemoryTokenStore();

/**
 * ============================================================================
 * 3. BROWSER PKCE HELPER (RFC 7636 via Web Crypto API)
 * ============================================================================
 */
function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function generatePKCE() {
  const randomBytes = new Uint8Array(48);
  window.crypto.getRandomValues(randomBytes);
  const codeVerifier = bufferToBase64Url(randomBytes);

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  const codeChallenge = bufferToBase64Url(digest);

  return { codeVerifier, codeChallenge, codeChallengeMethod: 'S256' };
}

/**
 * ============================================================================
 * 4. CENTRALIZED API CLIENT LAYER (Single Source of Network Fetching)
 * ============================================================================
 * All network communication across all screens MUST flow through this class.
 * Direct fetch(...) in UI components is strictly prohibited.
 */
/**
 * In-Memory ETag & Data Cache for HTTP conditional requests (RFC 7232).
 */
class InMemoryEtagCache {
  constructor() {
    this._entries = new Map();
  }

  _parseArgs(methodOrUrl, urlOrData) {
    if (urlOrData === undefined || typeof urlOrData !== 'string') {
      return { method: 'GET', url: methodOrUrl };
    }
    return { method: methodOrUrl.toUpperCase(), url: urlOrData };
  }

  _makeKey(method, url) {
    return `${(method || 'GET').toUpperCase()}:${url}`;
  }

  get(methodOrUrl, optionalUrl) {
    const { method, url } = this._parseArgs(methodOrUrl, optionalUrl);
    const key = this._makeKey(method, url);
    return this._entries.get(key) || null;
  }

  has(methodOrUrl, optionalUrl) {
    const { method, url } = this._parseArgs(methodOrUrl, optionalUrl);
    const key = this._makeKey(method, url);
    return this._entries.has(key);
  }

  set(methodOrUrl, urlOrData, payloadOrEtag) {
    let method = 'GET';
    let url = methodOrUrl;
    let etag = null;
    let data = null;

    if (typeof urlOrData === 'string') {
      method = methodOrUrl.toUpperCase();
      url = urlOrData;
      if (payloadOrEtag && typeof payloadOrEtag === 'object' && ('etag' in payloadOrEtag || 'data' in payloadOrEtag)) {
        etag = payloadOrEtag.etag;
        data = payloadOrEtag.data;
      } else {
        data = payloadOrEtag;
      }
    } else {
      url = methodOrUrl;
      data = urlOrData;
      etag = payloadOrEtag;
    }

    const key = this._makeKey(method, url);
    this._entries.set(key, {
      etag,
      data,
      timestamp: Date.now(),
      isStale: false,
    });
  }

  markStale(methodOrUrl, optionalUrl) {
    const { method, url } = this._parseArgs(methodOrUrl, optionalUrl);
    const key = this._makeKey(method, url);
    const entry = this._entries.get(key);
    if (entry) {
      entry.isStale = true;
    }
  }

  delete(methodOrUrl, optionalUrl) {
    const { method, url } = this._parseArgs(methodOrUrl, optionalUrl);
    const key = this._makeKey(method, url);
    return this._entries.delete(key);
  }

  clear() {
    this._entries.clear();
  }

  get size() {
    return this._entries.size;
  }
}

/**
 * ============================================================================
 * 4. CENTRALIZED API CLIENT LAYER (Single Source of Network Fetching)
 * ============================================================================
 * All network communication across all screens MUST flow through this class.
 * Direct fetch(...) in UI components is strictly prohibited.
 */
class BrowserApiClient {
  constructor({ baseUrl, tokenStore, cache = null }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.tokenStore = tokenStore;
    this.cache = cache || new InMemoryEtagCache();
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const method = (options.method || 'GET').toUpperCase();
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json, application/problem+json',
      ...(options.headers || {}),
    };

    const token = this.tokenStore.getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response;
    const startTime = performance.now();
    try {
      response = await fetch(url, { ...options, method, headers });
    } catch (networkErr) {
      throw {
        status: 0,
        title: 'Network Error',
        detail: `Failed to connect to ${url}. Ensure backend is running and CORS is configured.`,
        type: '/problems/network-error',
        durationMs: Math.round(performance.now() - startTime),
      };
    }

    const durationMs = Math.round(performance.now() - startTime);

    // A.7 Handle 304 Not Modified
    if (response.status === 304) {
      const cached = this.cache ? this.cache.get(method, url) : null;
      if (cached && cached.data) {
        cached.isStale = false;
        let result = cached.data;
        if (Array.isArray(result)) {
          result = [...result];
        } else if (result && typeof result === 'object') {
          result = { ...result };
        }
        if (result && typeof result === 'object') {
          result._meta = {
            status: 304,
            isCached: true,
            is304: true,
            isStale: false,
            etag: cached.etag,
            durationMs,
          };
        }
        return result;
      }
      return { _meta: { status: 304, isCached: false, is304: true, isStale: false, durationMs } };
    }

    let responseBody = null;
    try {
      responseBody = await response.json();
    } catch (_) {
      responseBody = null;
    }

    if (!response.ok) {
      const problem = responseBody || {
        status: response.status,
        title: response.statusText || 'API Error',
        detail: `Request to ${endpoint} failed with HTTP ${response.status}`,
        type: '/problems/unknown-error',
      };
      problem.status = problem.status || response.status;
      problem.durationMs = durationMs;

      // Extract ETag from error headers if present (e.g. 412)
      const errEtag = response.headers.get('etag') || response.headers.get('ETag');
      if (errEtag && !problem.currentEtag) {
        problem.currentEtag = errEtag;
      }

      // Centralized 401 Session Handling: Clear volatile token & redirect to login
      if (response.status === 401) {
        this.tokenStore.clear();
        router.navigate('/login');
        showAlert({
          title: 'Session Expired (401)',
          detail: 'Your authentication token is invalid or expired. Please sign in again.',
          status: 401,
          type: problem.type,
        });
      } else if (response.status === 403) {
        showAlert({
          title: 'Access Forbidden (403)',
          detail: problem.detail || 'You do not have the required scopes to perform this operation.',
          status: 403,
          type: problem.type,
        });
      }

      throw problem;
    }

    const responseEtag = response.headers.get('etag') || response.headers.get('ETag');

    // A.7 Store in ETag Cache for successful GET requests with ETag header
    if (method === 'GET' && response.status === 200 && responseEtag && this.cache) {
      this.cache.set(method, url, { etag: responseEtag, data: responseBody });
    }

    if (responseBody && typeof responseBody === 'object') {
      responseBody._meta = {
        durationMs,
        status: response.status,
        etag: responseEtag || null,
        isCached: false,
        is304: false,
        isStale: false,
      };
    }

    return responseBody;
  }

  async get(endpoint, options = {}) {
    const customHeaders = options.headers || options;
    const isOptionsObj = typeof options === 'object' && options !== null && !Array.isArray(options) && 'headers' in options;
    const headers = isOptionsObj ? { ...(options.headers || {}) } : { ...customHeaders };
    const forceRefresh = isOptionsObj ? Boolean(options.forceRefresh) : false;

    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const cached = (!forceRefresh && this.cache) ? this.cache.get('GET', url) : null;

    if (cached && cached.etag && !headers['If-None-Match']) {
      headers['If-None-Match'] = cached.etag;
    }

    try {
      return await this.request(endpoint, { method: 'GET', headers });
    } catch (err) {
      // If refresh failed (network failure or 5xx) and we have cached data:
      if (cached && cached.data) {
        if (this.cache) this.cache.markStale('GET', url);
        let result = cached.data;
        if (Array.isArray(result)) {
          result = [...result];
        } else if (result && typeof result === 'object') {
          result = { ...result };
        }
        if (result && typeof result === 'object') {
          result._meta = {
            isCached: true,
            isStale: true,
            etag: cached.etag,
            status: err.status || 0,
            durationMs: err.durationMs || 0,
            error: err,
          };
        }
        return result;
      }
      throw err;
    }
  }

  async post(endpoint, body = null, headers = {}) {
    return this.request(endpoint, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : null,
    });
  }
}

const apiClient = new BrowserApiClient({
  baseUrl: CONFIG.API_BASE_URL,
  tokenStore,
});

/**
 * ============================================================================
 * 5. CLIENT-SIDE ROUTER & WORKFLOW DISPATCHER
 * ============================================================================
 */
class ClientRouter {
  constructor() {
    this.routes = [
      { pattern: /^(\/|\/overview)?$/, name: 'overview', screen: 'screen-overview', requiresAuth: true },
      { pattern: /^\/health$/, name: 'health', screen: 'screen-health', requiresAuth: false },
      { pattern: /^\/events$/, name: 'events', screen: 'screen-events', requiresAuth: true, scope: 'events:read' },
      { pattern: /^\/events\/([^/]+)\/confirmation$/, name: 'confirmation', screen: 'screen-confirmation', requiresAuth: true, scope: 'confirmations:write' },
      { pattern: /^\/events\/([^/]+)$/, name: 'event-detail', screen: 'screen-event-detail', requiresAuth: true, scope: 'events:read' },
      { pattern: /^\/collections$/, name: 'collections', screen: 'screen-collections', requiresAuth: true, scope: 'collections:write' },
      { pattern: /^\/login$/, name: 'login', view: 'login', requiresAuth: false },
      { pattern: /^\/callback$/, name: 'callback', view: 'callback', requiresAuth: false },
    ];
    this.currentRoute = null;
    this.params = {};
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRouteChange());
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-route]');
      if (link) {
        e.preventDefault();
        const route = link.getAttribute('data-route');
        this.navigate(route);
      }
    });
  }

  navigate(path) {
    window.location.hash = path.startsWith('/') ? path : `/${path}`;
  }

  getCurrentPath() {
    const hash = window.location.hash.slice(1);
    if (!hash || hash === '') return '/';
    return hash.split('?')[0];
  }

  handleRouteChange() {
    const path = this.getCurrentPath();

    if (path === '/login') {
      switchView('login');
      return;
    }

    if (path === '/callback') {
      switchView('callback');
      return;
    }

    let matchedRoute = null;
    let matchedParams = {};

    for (const r of this.routes) {
      const match = path.match(r.pattern);
      if (match) {
        matchedRoute = r;
        if (r.name === 'event-detail' || r.name === 'confirmation') {
          matchedParams.eventId = match[1];
        }
        break;
      }
    }

    if (!matchedRoute) {
      matchedRoute = this.routes[0]; // fallback to overview
    }

    // Auth Guard
    if (matchedRoute.requiresAuth && !tokenStore.isAuthenticated()) {
      sessionStorage.setItem('auth_redirect_route', path);
      this.navigate('/login');
      return;
    }

    // Scope Guard
    if (matchedRoute.scope && !tokenStore.hasScope(matchedRoute.scope)) {
      showAlert({
        title: 'Insufficient Permissions (403)',
        detail: `This view requires the '${matchedRoute.scope}' scope, which is not granted to your active role.`,
        status: 403,
      });
      // Fallback to overview
      this.currentRoute = this.routes[0];
      switchView('shell');
      showScreen('screen-overview');
      updateNavHighlight('/');
      return;
    }

    this.currentRoute = matchedRoute;
    this.params = matchedParams;

    switchView('shell');
    showScreen(matchedRoute.screen, matchedParams);
    updateNavHighlight(path);
  }
}

const router = new ClientRouter();

/**
 * ============================================================================
 * 6. UI VIEW & SCREEN LIFECYCLE CONTROLLER
 * ============================================================================
 */
const views = {
  login: document.getElementById('view-login'),
  callback: document.getElementById('view-callback'),
  shell: document.getElementById('view-app-shell'),
};

const screens = {
  'screen-overview': document.getElementById('screen-overview'),
  'screen-health': document.getElementById('screen-health'),
  'screen-events': document.getElementById('screen-events'),
  'screen-event-detail': document.getElementById('screen-event-detail'),
  'screen-confirmation': document.getElementById('screen-confirmation'),
  'screen-collections': document.getElementById('screen-collections'),
};

const elements = {
  headerUserBadge: document.getElementById('header-user-badge'),
  headerLoginPrompt: document.getElementById('header-login-prompt'),
  userDisplayName: document.getElementById('user-display-name'),
  userRoleBadge: document.getElementById('user-role-badge'),
  btnHeaderLogout: document.getElementById('btn-header-logout'),
  alertContainer: document.getElementById('alert-container'),
  alertTitle: document.getElementById('alert-title'),
  alertDetail: document.getElementById('alert-detail'),
  alertStatus: document.getElementById('alert-status'),
  alertType: document.getElementById('alert-type'),
  btnDismissAlert: document.getElementById('btn-dismiss-alert'),
  callbackStatusText: document.getElementById('callback-status-text'),
  sessionSub: document.getElementById('session-sub'),
  sessionClientId: document.getElementById('session-client-id'),
};

function switchView(viewName) {
  Object.keys(views).forEach((name) => {
    if (name === viewName) {
      views[name]?.classList.remove('hidden');
    } else {
      views[name]?.classList.add('hidden');
    }
  });

  if (viewName === 'shell') {
    elements.headerUserBadge?.classList.remove('hidden');
    elements.headerLoginPrompt?.classList.add('hidden');
  } else if (viewName === 'login') {
    elements.headerUserBadge?.classList.add('hidden');
    elements.headerLoginPrompt?.classList.remove('hidden');
  }
}

function showScreen(screenId, params = {}) {
  Object.keys(screens).forEach((id) => {
    if (id === screenId) {
      screens[id]?.classList.remove('hidden');
    } else {
      screens[id]?.classList.add('hidden');
    }
  });

  switch (screenId) {
    case 'screen-overview':
      renderOverviewScreen();
      break;
    case 'screen-health':
      loadHealthWorkflow();
      break;
    case 'screen-events':
      loadEventsWorkflow();
      break;
    case 'screen-event-detail':
      loadEventDetailWorkflow(params.eventId || 'evt_001');
      break;
    case 'screen-confirmation':
      loadConfirmationWorkflow(params.eventId || 'evt_001');
      break;
    case 'screen-collections':
      loadCollectionsWorkflow();
      break;
  }
}

function updateNavHighlight(currentPath) {
  const navItems = document.querySelectorAll('#shell-nav-menu .nav-item');
  navItems.forEach((item) => {
    const route = item.getAttribute('data-route');
    if (route === currentPath || (route !== '/' && currentPath.startsWith(route))) {
      item.classList.add('active');
    } else if (currentPath === '/' && route === '/') {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

function setScreenState(prefix, state, { error = null, onRetry = null } = {}) {
  const elLoading = document.getElementById(`${prefix}-state-loading`);
  const elEmpty = document.getElementById(`${prefix}-state-empty`);
  const elError = document.getElementById(`${prefix}-state-error`);
  const elContent = document.getElementById(`${prefix}-state-content`);

  elLoading?.classList.toggle('hidden', state !== 'loading');
  elEmpty?.classList.toggle('hidden', state !== 'empty');
  elError?.classList.toggle('hidden', state !== 'error');
  elContent?.classList.toggle('hidden', state !== 'content');

  if (state === 'error' && error) {
    const errTitle = document.getElementById(`${prefix}-error-title`);
    const errDetail = document.getElementById(`${prefix}-error-detail`);
    const btnRetry = document.getElementById(`${prefix}-btn-retry`);

    if (errTitle) errTitle.textContent = error.title || 'Request Failed';
    if (errDetail) errDetail.textContent = error.detail || error.message || 'An error occurred while loading data.';

    if (btnRetry && typeof onRetry === 'function') {
      btnRetry.onclick = () => onRetry();
    }
  }
}

function showAlert({ title, detail, status, type }) {
  elements.alertTitle.textContent = title || 'Error';
  elements.alertDetail.textContent = detail || 'An unexpected problem occurred.';
  elements.alertStatus.textContent = status ? `HTTP ${status}` : 'STATUS -';

  if (type) {
    elements.alertType.textContent = type;
    elements.alertType.classList.remove('hidden');
  } else {
    elements.alertType.classList.add('hidden');
  }

  elements.alertContainer.classList.remove('hidden');
}

function hideAlert() {
  elements.alertContainer.classList.add('hidden');
}

/**
 * Helper to map OpenAPI event status to badge styling classes
 * OpenAPI rule: "Clients MUST treat unrecognised status as 'draft'."
 */
function getStatusBadgeClass(status) {
  switch (status) {
    case 'active':
      return 'badge-platform';
    case 'verifying':
      return 'badge-warning';
    case 'completed':
      return 'badge-info';
    case 'draft':
    default:
      return 'badge-outline';
  }
}

/**
 * ============================================================================
 * 7. WORKFLOW SCREEN CONTROLLERS & PLACEHOLDERS (W1–W5)
 * ============================================================================
 */

function renderOverviewScreen() {
  const claims = tokenStore.getClaims() || {};
  elements.sessionSub.textContent = claims.sub || 'Anonymous';
  elements.sessionClientId.textContent = sessionStorage.getItem('auth_client_id') || 'web-client';
}

// W1: Health Check (GET /health) — Public status probe
async function loadHealthWorkflow() {
  setScreenState('w1', 'loading');
  const outputEl = document.getElementById('health-probe-output');
  const latencyBadge = document.getElementById('w1-latency-badge');

  try {
    const data = await apiClient.get('/health');
    setScreenState('w1', 'content');
    if (outputEl) outputEl.textContent = JSON.stringify(data, null, 2);
    if (latencyBadge && data._meta) {
      latencyBadge.textContent = `Latency: ${data._meta.durationMs}ms (200 OK)`;
      latencyBadge.classList.remove('hidden');
    }
  } catch (err) {
    setScreenState('w1', 'error', {
      error: err,
      onRetry: () => loadHealthWorkflow(),
    });
    if (outputEl) outputEl.textContent = `ERROR:\n${JSON.stringify(err, null, 2)}`;
  }
}

// State variable for A.8 Concurrency Control (last seen ETag for event entity)
let w4LastSeenEtag = null;

// W2: Event Directory (GET /v1/events) — List events for authenticated principal (A.7 Supported)
async function loadEventsWorkflow() {
  setScreenState('w2', 'loading');
  const tbody = document.getElementById('events-table-body');
  const staleBanner = document.getElementById('w2-stale-banner');

  try {
    const events = await apiClient.get('/v1/events');
    if (!Array.isArray(events) || events.length === 0) {
      setScreenState('w2', 'empty');
      staleBanner?.classList.add('hidden');
      return;
    }

    setScreenState('w2', 'content');

    // A.7 Stale data indicator
    if (events._meta?.isStale) {
      staleBanner?.classList.remove('hidden');
    } else {
      staleBanner?.classList.add('hidden');
    }

    if (tbody) {
      tbody.innerHTML = '';
      const validStatuses = ['draft', 'active', 'verifying', 'completed'];
      events.forEach((evt) => {
        const status = validStatuses.includes(evt.status) ? evt.status : 'draft';
        const weight = evt.targetWeight ?? evt.target_weight ?? 0;
        const multiplier = evt.pointsMultiplier ?? evt.points_multiplier ?? 1.0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><code>${evt.id}</code></td>
          <td><strong>${evt.name || 'Unnamed Event'}</strong></td>
          <td><span class="badge ${getStatusBadgeClass(status)}">${status}</span></td>
          <td>${weight.toLocaleString()} g</td>
          <td>${multiplier}x</td>
          <td>
            <a href="#/events/${encodeURIComponent(evt.id)}" class="btn btn-outline-primary btn-sm" data-route="/events/${encodeURIComponent(evt.id)}">
              Inspect Detail &rarr;
            </a>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    staleBanner?.classList.add('hidden');
    setScreenState('w2', 'error', {
      error: err,
      onRetry: () => loadEventsWorkflow(),
    });
  }
}

// W3: Event Detail (GET /v1/events/:eventId) — Detail view of a specific event entity (A.7 Supported)
async function loadEventDetailWorkflow(eventId) {
  if (!eventId) {
    setScreenState('w3', 'error', {
      error: {
        title: 'Missing Event ID',
        detail: 'No event ID was provided in the route.',
      },
    });
    return;
  }

  setScreenState('w3', 'loading');
  const staleBanner = document.getElementById('w3-stale-banner');

  try {
    const event = await apiClient.get(`/v1/events/${encodeURIComponent(eventId)}`);
    if (!event || !event.id) {
      staleBanner?.classList.add('hidden');
      setScreenState('w3', 'error', {
        error: {
          title: 'Event Not Found',
          detail: `Resource '${eventId}' was not found or is unavailable`,
        },
        onRetry: () => loadEventDetailWorkflow(eventId),
      });
      return;
    }

    setScreenState('w3', 'content');

    // A.7 Stale data indicator
    if (event._meta?.isStale) {
      staleBanner?.classList.remove('hidden');
    } else {
      staleBanner?.classList.add('hidden');
    }

    // A.8 Retain lastSeenEtag for conditional write operations
    if (event._meta?.etag) {
      w4LastSeenEtag = event._meta.etag;
    } else if (apiClient.cache) {
      const cached = apiClient.cache.get('GET', `${apiClient.baseUrl}/v1/events/${eventId}`);
      if (cached?.etag) w4LastSeenEtag = cached.etag;
    }

    const validStatuses = ['draft', 'active', 'verifying', 'completed'];
    const status = validStatuses.includes(event.status) ? event.status : 'draft';

    const elName = document.getElementById('detail-event-name');
    const elId = document.getElementById('detail-event-id');
    const elOrg = document.getElementById('detail-organizer-id');
    const elStatus = document.getElementById('detail-event-status');
    const elTargetWeight = document.getElementById('detail-target-weight');
    const elPointsMultiplier = document.getElementById('detail-points-multiplier');
    const elBonusMultiplier = document.getElementById('detail-bonus-multiplier');
    const elScheduledDate = document.getElementById('detail-scheduled-date');

    if (elName) elName.textContent = event.name || 'Unnamed Event';
    if (elId) elId.textContent = event.id;
    if (elOrg) elOrg.textContent = event.organizerId || event.organizer_id || '-';
    if (elStatus) {
      elStatus.textContent = status;
      elStatus.className = `badge ${getStatusBadgeClass(status)}`;
    }
    if (elTargetWeight) {
      const weight = event.targetWeight ?? event.target_weight ?? 0;
      elTargetWeight.textContent = `${weight.toLocaleString()} grams`;
    }
    if (elPointsMultiplier) {
      const multiplier = event.pointsMultiplier ?? event.points_multiplier ?? 1.0;
      elPointsMultiplier.textContent = `${multiplier}x`;
    }
    if (elBonusMultiplier) {
      const bonus = event.bonusMultiplier ?? event.bonus_multiplier;
      elBonusMultiplier.textContent = bonus !== undefined && bonus !== null ? `${bonus}x` : 'None (1.0x)';
    }
    if (elScheduledDate) {
      const date = event.scheduledDate || event.scheduled_date;
      elScheduledDate.textContent = date || 'Not Scheduled';
    }

    const btnConfirm = document.getElementById('btn-goto-confirm');
    if (btnConfirm) {
      btnConfirm.href = `#/events/${encodeURIComponent(event.id)}/confirmation`;
      btnConfirm.setAttribute('data-route', `/events/${encodeURIComponent(event.id)}/confirmation`);
    }
  } catch (err) {
    staleBanner?.classList.add('hidden');
    setScreenState('w3', 'error', {
      error: err,
      onRetry: () => loadEventDetailWorkflow(eventId),
    });
  }
}

/**
 * ============================================================================
 * 7A. IDEMPOTENCY KEY STATE MANAGER (RFC 7231 / P5 Idempotency Contract)
 * ============================================================================
 * Rules:
 * 1. Generates a fresh UUIDv4 before first submission.
 * 2. Reuses the SAME key when retrying the SAME logical submission (same payload).
 * 3. Generates a NEW key when the user mutates/changes the payload.
 * 4. Never uses a hardcoded idempotency key.
 */
class IdempotencyManager {
  constructor() {
    this._currentKey = null;
    this._lastPayloadJson = null;
  }

  getOrGenerateKey(payload) {
    const payloadJson = JSON.stringify(payload);
    if (!this._currentKey || this._lastPayloadJson !== payloadJson) {
      this._currentKey = (window.crypto && typeof window.crypto.randomUUID === 'function')
        ? window.crypto.randomUUID()
        : this._generateUuidFallback();
      this._lastPayloadJson = payloadJson;
    }
    return this._currentKey;
  }

  getCurrentKey() {
    return this._currentKey;
  }

  reset() {
    this._currentKey = null;
    this._lastPayloadJson = null;
  }

  _generateUuidFallback() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      const r = (window.crypto.getRandomValues(new Uint8Array(1))[0] & 0x0f);
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
}

const w4Idempotency = new IdempotencyManager();
const w5Idempotency = new IdempotencyManager();

// ============================================================================
// 7B. W4: DAILY CONFIRMATION CONTROLLER (POST /v1/events/{id}/daily-confirmation)
// ============================================================================

const ALLOWED_WASTE_TYPES = ['ORGANIK', 'ANORGANIK', 'RESIDU', 'HAZMAT'];

function setW4UIState(state, { error = null } = {}) {
  const elForm = document.getElementById('w4-state-form');
  const elSubmitting = document.getElementById('w4-state-submitting');
  const elError = document.getElementById('w4-state-error');
  const elConflict = document.getElementById('w4-state-concurrency-conflict');
  const elSuccess = document.getElementById('w4-state-success');
  const btnSubmit = document.getElementById('w4-btn-submit');

  elSubmitting?.classList.toggle('hidden', state !== 'submitting');
  elError?.classList.toggle('hidden', state !== 'error');
  elConflict?.classList.toggle('hidden', state !== 'concurrency-conflict');
  elSuccess?.classList.toggle('hidden', state !== 'success');
  elForm?.classList.toggle('hidden', state === 'success');

  if (btnSubmit) {
    btnSubmit.disabled = state === 'submitting';
  }

  if (state === 'concurrency-conflict' && error) {
    const conflictDetail = document.getElementById('w4-concurrency-detail');
    const conflictMeta = document.getElementById('w4-concurrency-meta');

    if (conflictDetail) {
      conflictDetail.textContent = error.detail || 'This event was already updated or handled by another user (412 Precondition Failed).';
    }
    if (conflictMeta) {
      let metaText = `Status: HTTP 412 | If-Match sent: ${w4LastSeenEtag || 'none'}`;
      if (error.currentEtag) {
        metaText += ` | Current Server ETag: ${error.currentEtag}`;
      }
      conflictMeta.textContent = metaText;
    }
  } else if (state === 'error' && error) {
    const errTitle = document.getElementById('w4-error-title');
    const errDetail = document.getElementById('w4-error-detail');
    const errMeta = document.getElementById('w4-error-meta');

    if (errTitle) errTitle.textContent = error.title || 'Submission Failed';
    if (errDetail) errDetail.textContent = error.detail || error.message || 'An error occurred while confirming event.';
    if (errMeta) {
      let metaText = `Status: HTTP ${error.status || 500} | Type: ${error.type || '/problems/unknown-error'}`;
      if (error.deviationPercentage !== undefined) {
        metaText += ` | Deviation: ${error.deviationPercentage}%`;
      }
      errMeta.textContent = metaText;
    }
  }
}

function createW4RowElement(wasteType = 'ORGANIK', weight = 0) {
  const row = document.createElement('div');
  row.className = 'dynamic-row-item';
  row.innerHTML = `
    <div style="flex: 1;">
      <select class="form-control w4-row-type">
        ${ALLOWED_WASTE_TYPES.map((t) => `<option value="${t}" ${t === wasteType ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div style="flex: 1.5;">
      <input type="number" class="form-control w4-row-weight" min="0" step="1" value="${weight}" placeholder="Weight in grams">
    </div>
    <div>
      <button type="button" class="btn btn-sm btn-danger w4-row-remove" title="Remove row">&times;</button>
    </div>
  `;

  const inputWeight = row.querySelector('.w4-row-weight');
  const selectType = row.querySelector('.w4-row-type');
  const btnRemove = row.querySelector('.w4-row-remove');

  inputWeight?.addEventListener('input', () => {
    updateW4Total();
    updateW4IdempotencyDisplay();
  });
  selectType?.addEventListener('change', () => {
    updateW4IdempotencyDisplay();
  });
  btnRemove?.addEventListener('click', () => {
    const container = document.getElementById('w4-breakdown-rows');
    if (container && container.children.length > 1) {
      row.remove();
      updateW4Total();
      updateW4IdempotencyDisplay();
    } else {
      const errEl = document.getElementById('w4-breakdown-error');
      if (errEl) {
        errEl.textContent = 'At least 1 verified breakdown row is required.';
        errEl.classList.remove('hidden');
      }
    }
  });

  return row;
}

function addW4BreakdownRow(wasteType = 'ORGANIK', weight = 0) {
  const container = document.getElementById('w4-breakdown-rows');
  const errEl = document.getElementById('w4-breakdown-error');
  if (errEl) errEl.classList.add('hidden');

  if (container) {
    const row = createW4RowElement(wasteType, weight);
    container.appendChild(row);
    updateW4Total();
    updateW4IdempotencyDisplay();
  }
}

function updateW4Total() {
  const weights = document.querySelectorAll('#w4-breakdown-rows .w4-row-weight');
  let total = 0;
  weights.forEach((input) => {
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 0) total += val;
  });

  const totalEl = document.getElementById('w4-total-weight-display');
  if (totalEl) totalEl.textContent = `${total.toLocaleString()} g`;
}

function getW4Payload() {
  const adminIdInput = document.getElementById('w4-input-admin-id');
  const adminId = adminIdInput?.value.trim() || '';

  const rows = document.querySelectorAll('#w4-breakdown-rows .dynamic-row-item');
  const verifiedBreakdown = [];

  rows.forEach((r) => {
    const select = r.querySelector('.w4-row-type');
    const input = r.querySelector('.w4-row-weight');
    const wasteType = select?.value || 'ORGANIK';
    const weight = parseInt(input?.value, 10);

    verifiedBreakdown.push({
      wasteType,
      weight: isNaN(weight) ? 0 : weight,
    });
  });

  return { adminId, verifiedBreakdown };
}

function updateW4IdempotencyDisplay() {
  const display = document.getElementById('w4-idempotency-display');
  const payload = getW4Payload();
  if (display) {
    const key = w4Idempotency.getCurrentKey();
    display.textContent = key ? `${key.slice(0, 8)}... (reused)` : 'auto-generate on submit';
  }
}

function loadConfirmationWorkflow(eventId) {
  const elEventId = document.getElementById('w4-input-event-id');
  const elAdminId = document.getElementById('w4-input-admin-id');
  const btnBack = document.getElementById('w4-btn-back-detail');

  if (elEventId) elEventId.value = eventId || 'evt_001';

  // Extract authenticated adminId strictly from existing session JWT claims
  const claims = tokenStore.getClaims() || {};
  const currentSub = claims.sub || '';
  if (elAdminId) elAdminId.value = currentSub || 'unauthenticated';

  if (btnBack) {
    btnBack.href = `#/events/${encodeURIComponent(eventId || 'evt_001')}`;
    btnBack.setAttribute('data-route', `/events/${encodeURIComponent(eventId || 'evt_001')}`);
  }

  // A.8 Resolve lastSeenEtag from cache or background fetch
  const targetId = eventId || 'evt_001';
  if (apiClient.cache) {
    const cached = apiClient.cache.get('GET', `${apiClient.baseUrl}/v1/events/${targetId}`);
    if (cached?.etag) {
      w4LastSeenEtag = cached.etag;
    }
  }

  if (!w4LastSeenEtag) {
    apiClient.get(`/v1/events/${encodeURIComponent(targetId)}`)
      .then((evt) => {
        if (evt?._meta?.etag) {
          w4LastSeenEtag = evt._meta.etag;
        }
      })
      .catch(() => {});
  }

  // Initialize breakdown rows with defaults
  const container = document.getElementById('w4-breakdown-rows');
  if (container) {
    container.innerHTML = '';
    addW4BreakdownRow('ORGANIK', 0);
    addW4BreakdownRow('ANORGANIK', 0);
  }

  setW4UIState('form');
  updateW4IdempotencyDisplay();
}

async function handleW4Submit(e) {
  if (e) e.preventDefault();
  const errEl = document.getElementById('w4-breakdown-error');
  if (errEl) errEl.classList.add('hidden');

  const eventId = document.getElementById('w4-input-event-id')?.value.trim();
  const payload = getW4Payload();

  // Client-side validation per OpenAPI schema
  if (!payload.adminId || payload.adminId === 'unauthenticated') {
    showAlert({
      title: 'Missing Identity',
      detail: 'Authenticated session identity (sub) is missing. Please sign in with an authorized account.',
      status: 401,
    });
    return;
  }

  if (!payload.verifiedBreakdown || payload.verifiedBreakdown.length === 0) {
    if (errEl) {
      errEl.textContent = 'verifiedBreakdown must contain at least 1 item';
      errEl.classList.remove('hidden');
    }
    return;
  }

  for (let i = 0; i < payload.verifiedBreakdown.length; i++) {
    const item = payload.verifiedBreakdown[i];
    if (!ALLOWED_WASTE_TYPES.includes(item.wasteType)) {
      if (errEl) {
        errEl.textContent = `Invalid wasteType at row ${i + 1}. Must be ORGANIK, ANORGANIK, RESIDU, or HAZMAT.`;
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (typeof item.weight !== 'number' || isNaN(item.weight) || item.weight < 0) {
      if (errEl) {
        errEl.textContent = `Weight at row ${i + 1} must be a valid non-negative integer in grams.`;
        errEl.classList.remove('hidden');
      }
      return;
    }
  }

  // Idempotency state-machine: reuse key on same payload, generate new on mutated payload
  const idempotencyKey = w4Idempotency.getOrGenerateKey(payload);
  const hintEl = document.getElementById('w4-submitting-hint');
  if (hintEl) {
    hintEl.textContent = `Sending verified weights to depot engine (Idempotency-Key: ${idempotencyKey}).`;
  }

  // A.8 Prepare headers including If-Match if lastSeenEtag exists
  const headers = {
    'Idempotency-Key': idempotencyKey,
  };
  if (w4LastSeenEtag) {
    headers['If-Match'] = w4LastSeenEtag;
  }

  setW4UIState('submitting');

  try {
    const result = await apiClient.post(
      `/v1/events/${encodeURIComponent(eventId)}/daily-confirmation`,
      payload,
      headers
    );

    // Render Success Response (200 OK)
    setW4UIState('success');

    // A.8 Update ETag if returned on write response
    if (result._meta?.etag) {
      w4LastSeenEtag = result._meta.etag;
      if (apiClient.cache) {
        const eventUrl = `${apiClient.baseUrl}/v1/events/${eventId}`;
        const cached = apiClient.cache.get('GET', eventUrl);
        if (cached) {
          apiClient.cache.set('GET', eventUrl, { etag: result._meta.etag, data: cached.data });
        }
      }
    }

    const gradeEl = document.getElementById('w4-result-grade');
    const targetEl = document.getElementById('w4-result-target-met');
    const recordedEl = document.getElementById('w4-result-recorded');
    const verifiedEl = document.getElementById('w4-result-verified');
    const hazmatEl = document.getElementById('w4-result-hazmat');
    const pointsEl = document.getElementById('w4-result-points');
    const certLink = document.getElementById('w4-result-cert-link');
    const reportLink = document.getElementById('w4-result-report-link');
    const tableBody = document.getElementById('w4-result-breakdown-body');

    if (gradeEl) {
      gradeEl.textContent = `GRADE ${result.grade || 'BRONZE'}`;
      gradeEl.className = `badge ${result.grade === 'GOLD' ? 'badge-platform' : result.grade === 'SILVER' ? 'badge-info' : 'badge-warning'}`;
    }
    if (targetEl) {
      targetEl.textContent = result.targetMet ? 'Target Met (Yes)' : 'Target Not Met (No)';
      targetEl.className = `badge ${result.targetMet ? 'badge-platform' : 'badge-outline'}`;
    }
    if (recordedEl) recordedEl.textContent = `${(result.recordedTotal || 0).toLocaleString()} g`;
    if (verifiedEl) verifiedEl.textContent = `${(result.verifiedTotal || 0).toLocaleString()} g`;
    if (hazmatEl) hazmatEl.textContent = `${(result.hazmatDeducted || 0).toLocaleString()} g`;
    if (pointsEl) pointsEl.textContent = `${(result.totalPoints || 0).toLocaleString()} pts`;

    if (certLink) {
      if (result.certificateUrl) {
        certLink.href = result.certificateUrl;
        certLink.classList.remove('hidden');
      } else {
        certLink.classList.add('hidden');
      }
    }
    if (reportLink) {
      if (result.reportUrl) {
        reportLink.href = result.reportUrl;
        reportLink.classList.remove('hidden');
      } else {
        reportLink.classList.add('hidden');
      }
    }

    if (tableBody) {
      tableBody.innerHTML = '';
      (result.verifiedBreakdown || payload.verifiedBreakdown).forEach((item) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><span class="tag">${item.wasteType}</span></td>
          <td><strong>${item.weight.toLocaleString()} g</strong></td>
        `;
        tableBody.appendChild(tr);
      });
    }

    w4Idempotency.reset();
  } catch (err) {
    // A.8 Concurrency Conflict (412 Precondition Failed)
    if (err.status === 412 || err.type === '/problems/precondition-failed') {
      setW4UIState('concurrency-conflict', { error: err });

      // Adopt current server ETag if supplied in error response
      if (err.currentEtag) {
        w4LastSeenEtag = err.currentEtag;
      }

      // Automatically refresh latest resource state via A.7 conditional GET (without auto-resubmitting)
      try {
        const refreshed = await apiClient.get(`/v1/events/${encodeURIComponent(eventId)}`);
        if (refreshed?._meta?.etag) {
          w4LastSeenEtag = refreshed._meta.etag;
        }
      } catch (_) {
        // Preserve current conflict state even if refresh fails
      }
    } else {
      setW4UIState('error', { error: err });
    }
  }
}

// ============================================================================
// 7C. W5: DAILY COLLECTIONS CONTROLLER (POST /v1/daily-collections)
// ============================================================================

function setW5UIState(state, { error = null } = {}) {
  const elForm = document.getElementById('w5-state-form');
  const elSubmitting = document.getElementById('w5-state-submitting');
  const elError = document.getElementById('w5-state-error');
  const elSuccess = document.getElementById('w5-state-success');
  const btnSubmit = document.getElementById('w5-btn-submit');

  elSubmitting?.classList.toggle('hidden', state !== 'submitting');
  elError?.classList.toggle('hidden', state !== 'error');
  elSuccess?.classList.toggle('hidden', state !== 'success');
  elForm?.classList.toggle('hidden', state === 'success');

  if (btnSubmit) {
    btnSubmit.disabled = state === 'submitting';
  }

  if (state === 'error' && error) {
    const errTitle = document.getElementById('w5-error-title');
    const errDetail = document.getElementById('w5-error-detail');
    const errMeta = document.getElementById('w5-error-meta');

    if (errTitle) errTitle.textContent = error.title || 'Submission Failed';
    if (errDetail) errDetail.textContent = error.detail || error.message || 'An error occurred while submitting collection batch.';
    if (errMeta) {
      errMeta.textContent = `Status: HTTP ${error.status || 500} | Type: ${error.type || '/problems/unknown-error'}`;
    }
  }
}

function createW5RecordElement(siteId = '', wasteType = 'ORGANIK', weight = 1000) {
  const row = document.createElement('div');
  row.className = 'dynamic-row-item';
  row.innerHTML = `
    <div style="flex: 1;">
      <input type="text" class="form-control w5-row-site" placeholder="Site ID e.g. site_a" value="${siteId}">
    </div>
    <div style="flex: 1;">
      <select class="form-control w5-row-type">
        ${ALLOWED_WASTE_TYPES.map((t) => `<option value="${t}" ${t === wasteType ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div style="flex: 1.5;">
      <input type="number" class="form-control w5-row-weight" min="0" step="1" value="${weight}" placeholder="Weight in grams (>= 0)">
    </div>
    <div>
      <button type="button" class="btn btn-sm btn-danger w5-row-remove" title="Remove record">&times;</button>
    </div>
  `;

  const inputSite = row.querySelector('.w5-row-site');
  const inputWeight = row.querySelector('.w5-row-weight');
  const selectType = row.querySelector('.w5-row-type');
  const btnRemove = row.querySelector('.w5-row-remove');

  inputSite?.addEventListener('input', () => updateW5IdempotencyDisplay());
  inputWeight?.addEventListener('input', () => {
    updateW5Total();
    updateW5IdempotencyDisplay();
  });
  selectType?.addEventListener('change', () => updateW5IdempotencyDisplay());
  btnRemove?.addEventListener('click', () => {
    const container = document.getElementById('w5-records-rows');
    if (container && container.children.length > 1) {
      row.remove();
      updateW5Total();
      updateW5IdempotencyDisplay();
    } else {
      const errEl = document.getElementById('w5-records-error');
      if (errEl) {
        errEl.textContent = 'records must contain at least 1 item';
        errEl.classList.remove('hidden');
      }
    }
  });

  return row;
}

function addW5RecordRow(siteId = '', wasteType = 'ORGANIK', weight = 1000) {
  const container = document.getElementById('w5-records-rows');
  const errEl = document.getElementById('w5-records-error');
  if (errEl) errEl.classList.add('hidden');

  if (container) {
    const row = createW5RecordElement(siteId, wasteType, weight);
    container.appendChild(row);
    updateW5Total();
    updateW5IdempotencyDisplay();
  }
}

function updateW5Total() {
  const weights = document.querySelectorAll('#w5-records-rows .w5-row-weight');
  let total = 0;
  weights.forEach((input) => {
    const val = parseInt(input.value, 10);
    if (!isNaN(val) && val >= 0) total += val;
  });

  const totalEl = document.getElementById('w5-total-weight-display');
  if (totalEl) totalEl.textContent = `${total.toLocaleString()} g`;
}

function getW5Payload() {
  const eventId = document.getElementById('w5-input-event-id')?.value.trim() || '';
  const rosterId = document.getElementById('w5-input-roster-id')?.value.trim() || '';
  const shiftDate = document.getElementById('w5-input-shift-date')?.value.trim() || '';

  const rows = document.querySelectorAll('#w5-records-rows .dynamic-row-item');
  const records = [];

  rows.forEach((r) => {
    const inputSite = r.querySelector('.w5-row-site');
    const selectType = r.querySelector('.w5-row-type');
    const inputWeight = r.querySelector('.w5-row-weight');

    const siteId = inputSite?.value.trim() || '';
    const wasteType = selectType?.value || 'ORGANIK';
    const weight = parseInt(inputWeight?.value, 10);

    records.push({
      siteId,
      wasteType,
      weight: isNaN(weight) ? 0 : weight,
    });
  });

  return { eventId, rosterId, shiftDate, records };
}

function updateW5IdempotencyDisplay() {
  const display = document.getElementById('w5-idempotency-display');
  const payload = getW5Payload();
  if (display) {
    const key = w5Idempotency.getCurrentKey();
    display.textContent = key ? `${key.slice(0, 8)}... (reused)` : 'auto-generate on submit';
  }
}

function loadCollectionsWorkflow() {
  const elEventId = document.getElementById('w5-input-event-id');
  const elRosterId = document.getElementById('w5-input-roster-id');
  const elShiftDate = document.getElementById('w5-input-shift-date');

  if (elEventId) elEventId.value = '';
  if (elRosterId) elRosterId.value = '';
  if (elShiftDate) elShiftDate.value = new Date().toISOString().split('T')[0];

  const container = document.getElementById('w5-records-rows');
  if (container) {
    container.innerHTML = '';
    addW5RecordRow('site_a', 'ORGANIK', 5000);
  }

  setW5UIState('form');
  updateW5IdempotencyDisplay();
}

async function handleW5Submit(e) {
  if (e) e.preventDefault();
  const errEl = document.getElementById('w5-records-error');
  if (errEl) errEl.classList.add('hidden');

  const payload = getW5Payload();

  // Client-side validation
  if (!payload.eventId) {
    showAlert({ title: 'Validation Error', detail: 'eventId is required', status: 400 });
    return;
  }
  if (!payload.rosterId) {
    showAlert({ title: 'Validation Error', detail: 'rosterId is required', status: 400 });
    return;
  }
  if (!payload.shiftDate) {
    showAlert({ title: 'Validation Error', detail: 'shiftDate is required', status: 400 });
    return;
  }
  if (!payload.records || payload.records.length === 0) {
    if (errEl) {
      errEl.textContent = 'records must contain at least 1 item';
      errEl.classList.remove('hidden');
    }
    return;
  }

  for (let i = 0; i < payload.records.length; i++) {
    const r = payload.records[i];
    if (!r.siteId) {
      if (errEl) {
        errEl.textContent = `siteId is required at record ${i + 1}`;
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (!ALLOWED_WASTE_TYPES.includes(r.wasteType)) {
      if (errEl) {
        errEl.textContent = `Invalid wasteType at record ${i + 1}`;
        errEl.classList.remove('hidden');
      }
      return;
    }
    if (typeof r.weight !== 'number' || isNaN(r.weight) || r.weight < 0) {
      if (errEl) {
        errEl.textContent = `weight must be a valid non-negative integer in grams at record ${i + 1}`;
        errEl.classList.remove('hidden');
      }
      return;
    }
  }

  // Idempotency state-machine
  const idempotencyKey = w5Idempotency.getOrGenerateKey(payload);
  const hintEl = document.getElementById('w5-submitting-hint');
  if (hintEl) {
    hintEl.textContent = `Sending collection records to backend (Idempotency-Key: ${idempotencyKey}).`;
  }

  setW5UIState('submitting');

  try {
    const result = await apiClient.post(
      '/v1/daily-collections',
      payload,
      { 'Idempotency-Key': idempotencyKey }
    );

    // Render Success Response (202 Accepted)
    setW5UIState('success');
    const countEl = document.getElementById('w5-result-count');
    const statusEl = document.getElementById('w5-result-status');

    if (countEl) countEl.textContent = String(result.acceptedCount ?? payload.records.length);
    if (statusEl) statusEl.textContent = result.status || 'recorded';

    w5Idempotency.reset();
  } catch (err) {
    setW5UIState('error', { error: err });
  }
}

/**
 * ============================================================================
 * 8. AUTHENTICATION (PKCE FLOW & TOKEN EXCHANGE)
 * ============================================================================
 */
async function initiateLogin(clientKey) {
  const clientConfig = CONFIG.CLIENTS[clientKey];
  if (!clientConfig) return;

  hideAlert();
  try {
    const pkce = await generatePKCE();

    sessionStorage.setItem('pkce_code_verifier', pkce.codeVerifier);
    sessionStorage.setItem('auth_client_id', clientConfig.clientId);
    sessionStorage.setItem('auth_client_name', clientConfig.name);

    const authUrl = new URL(`${CONFIG.OIDC_ISSUER}/protocol/openid-connect/auth`);
    authUrl.searchParams.set('client_id', clientConfig.clientId);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', `openid ${clientConfig.scopes.join(' ')}`);
    authUrl.searchParams.set('redirect_uri', CONFIG.REDIRECT_URI);
    authUrl.searchParams.set('code_challenge', pkce.codeChallenge);
    authUrl.searchParams.set('code_challenge_method', pkce.codeChallengeMethod);
    authUrl.searchParams.set('state', window.crypto.randomUUID());

    window.location.href = authUrl.toString();
  } catch (err) {
    showAlert({
      title: 'Login Initiation Failed',
      detail: err.message || 'Could not generate PKCE challenge',
      status: 500,
    });
  }
}

async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  const errorDesc = params.get('error_description');

  if (error) {
    switchView('login');
    showAlert({
      title: `OAuth Error: ${error}`,
      detail: errorDesc || 'Authorization server rejected the request.',
      status: 401,
    });
    window.history.replaceState({}, document.title, window.location.pathname);
    return;
  }

  if (!code) {
    router.handleRouteChange();
    return;
  }

  switchView('callback');
  elements.callbackStatusText.textContent = 'Exchanging authorization code with Keycloak...';

  const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
  const clientId = sessionStorage.getItem('auth_client_id') || 'web-admin';
  const clientName = sessionStorage.getItem('auth_client_name') || 'Web Client';

  sessionStorage.removeItem('pkce_code_verifier');
  window.history.replaceState({}, document.title, window.location.pathname);

  try {
    const tokenUrl = `${CONFIG.OIDC_ISSUER}/protocol/openid-connect/token`;
    const bodyParams = new URLSearchParams();
    bodyParams.set('grant_type', 'authorization_code');
    bodyParams.set('client_id', clientId);
    bodyParams.set('code', code);
    bodyParams.set('redirect_uri', CONFIG.REDIRECT_URI);
    bodyParams.set('code_verifier', codeVerifier || '');

    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    const tokenData = await res.json();
    if (!res.ok) {
      throw {
        title: 'Token Exchange Failed',
        detail: tokenData.error_description || tokenData.error || 'Failed to obtain access token',
        status: res.status,
      };
    }

    tokenStore.setTokens({
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in,
      scopes: (tokenData.scope || '').split(' ').filter(Boolean),
    });

    const claims = tokenStore.getClaims() || {};
    elements.userDisplayName.textContent = claims.sub || 'Authenticated User';
    elements.userRoleBadge.textContent = clientName || clientId;
    elements.headerUserBadge.classList.remove('hidden');

    const pendingRoute = sessionStorage.getItem('auth_redirect_route') || '/';
    sessionStorage.removeItem('auth_redirect_route');
    router.navigate(pendingRoute);
  } catch (err) {
    switchView('login');
    showAlert({
      title: err.title || 'Authentication Error',
      detail: err.detail || err.message || 'Callback handling failed',
      status: err.status || 401,
    });
  }
}

function handleLogout() {
  tokenStore.clear();
  sessionStorage.clear();
  elements.headerUserBadge.classList.add('hidden');
  hideAlert();
  router.navigate('/login');
}

/**
 * ============================================================================
 * 9. APPLICATION INITIALIZATION & EVENT LISTENERS
 * ============================================================================
 */
function init() {
  // Login Role Buttons
  document.getElementById('btn-login-eo')?.addEventListener('click', () => initiateLogin('WEB_EO'));
  document.getElementById('btn-login-admin')?.addEventListener('click', () => initiateLogin('WEB_ADMIN'));
  document.getElementById('btn-login-crew')?.addEventListener('click', () => initiateLogin('DEVICE_CREW'));

  // Header & Global Actions
  elements.btnHeaderLogout?.addEventListener('click', handleLogout);
  elements.btnDismissAlert?.addEventListener('click', hideAlert);

  // W1 Probe Health Button
  document.getElementById('btn-probe-health')?.addEventListener('click', loadHealthWorkflow);

  // W2 Refresh Events Button & Stale Retry
  document.getElementById('btn-refresh-events')?.addEventListener('click', loadEventsWorkflow);
  document.getElementById('w2-btn-retry-stale')?.addEventListener('click', loadEventsWorkflow);

  // W3 Stale Retry
  document.getElementById('w3-btn-retry-stale')?.addEventListener('click', () => {
    const eventId = router.params?.eventId || 'evt_001';
    loadEventDetailWorkflow(eventId);
  });

  // W4 Event Listeners
  document.getElementById('w4-confirmation-form')?.addEventListener('submit', handleW4Submit);
  document.getElementById('w4-btn-add-row')?.addEventListener('click', () => addW4BreakdownRow('ORGANIK', 0));
  document.getElementById('w4-btn-reset')?.addEventListener('click', () => {
    const eventId = document.getElementById('w4-input-event-id')?.value;
    loadConfirmationWorkflow(eventId);
  });
  document.getElementById('w4-btn-new-submission')?.addEventListener('click', () => {
    const eventId = document.getElementById('w4-input-event-id')?.value;
    loadConfirmationWorkflow(eventId);
  });
  document.getElementById('w4-btn-dismiss-error')?.addEventListener('click', () => setW4UIState('form'));
  document.getElementById('w4-btn-dismiss-conflict')?.addEventListener('click', () => setW4UIState('form'));

  // W5 Event Listeners
  document.getElementById('w5-collection-form')?.addEventListener('submit', handleW5Submit);
  document.getElementById('w5-btn-add-record')?.addEventListener('click', () => addW5RecordRow('site_a', 'ORGANIK', 1000));
  document.getElementById('w5-btn-reset')?.addEventListener('click', loadCollectionsWorkflow);
  document.getElementById('w5-btn-new-submission')?.addEventListener('click', loadCollectionsWorkflow);
  document.getElementById('w5-btn-dismiss-error')?.addEventListener('click', () => setW5UIState('form'));

  // Router Initialization
  router.init();

  // Check URL on load for OAuth Callback vs Direct Routing
  const params = new URLSearchParams(window.location.search);
  if (params.has('code') || params.has('error')) {
    handleOAuthCallback();
  } else {
    router.handleRouteChange();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
