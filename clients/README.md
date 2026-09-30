# EventWise Client Foundation (P5)

Arsitektur modul SDK dan browser client untuk EventWise Core Platform.

## 1. Modul Common
- `clients/common/config.js`: Dynamic configuration loader.
- `clients/common/errors.js`: Typed RFC 7807 Problem Details client errors.
- `clients/common/pkce.js`: RFC 7636 PKCE S256 helper.
- `clients/common/scopes.js`: Scope constants and validation helpers.
- `clients/common/tokenStore.js`: Volatile In-Memory Token Store.
- `clients/common/apiClient.js`: Centralized API Client layer.

## 2. Keamanan & Kebijakan Sesi
- **ADR 0003**: Access token wajib disimpan di **in-memory storage** saja.
- **Dilarang keras** menyimpan access token pada `localStorage` biasa.
- **Dilarang keras** mengekspos token via `window._token`.
- Browser client menggunakan OAuth2 Authorization Code Flow + PKCE S256.
