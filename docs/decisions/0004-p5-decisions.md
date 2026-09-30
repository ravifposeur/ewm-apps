# Keputusan Arsitektur 0004: P5 Web Application Decisions

## Context
P5 introduces the browser client. Several decisions previously implicit (session storage, concurrency policy, workflow scope) now need to be recorded.

## Decision
1. **Workflows:** 5 workflows (Health, Event List, Event Detail, Confirm Daily, Submit Collection).
2. **Concurrency:** ETag + If-None-Match for `GET /v1/events`; If-Match + 412 for `POST daily-confirmation`.
3. **Session storage:** in-memory access token + HttpOnly refresh cookie (see README for consequences).

## Alternatives Considered
| Alternative | Rejected because |
| :--- | :--- |
| localStorage | Readable by any script — XSS exposure |
| sessionStorage | Same XSS exposure; loses session on new tab anyway |
| Cookie-only for access token | CSRF surface; not necessary since backend uses Bearer |
| Skip concurrency (no ETag) | Loses 412 UX in P5; would fail grader row 5 |

## Consequences
- Positive: uniform session handling, testable concurrency, no token leak via XSS.
- Negative: extra refresh on reload; backend must compute ETag consistently.
- Netral: `openapi.yaml` bumped to 0.3.0.

## Status
- Decision date: 2026-10-XX
- Related: `openapi.yaml` v0.3.0, README P5 workflow table
