# Web Platform Plan — Web + Desktop from one codebase

Status: **proposal / planning**. No existing code is modified by this plan; all new work lives in a new top-level `web/` directory and deploys via Docker.

## 1. Goal

Turn the current Electron desktop app into a product that runs **two ways from the same UI**:

- **Web app** — runs in any browser, everything executes on the server.
- **Desktop app** — installable on macOS/Windows, but it's a thin shell pointing at the same server (so "everything runs server-end" in both modes).

Constraints from the brief:
- **Same features and same design** — reuse the existing React UI as-is.
- Only the **API layer** and **image storage** change; everything else (menus, screens, flows) stays.
- **Everything runs server-side.**
- **Do not touch the existing Electron/PHP code.** Build in a new directory with a Docker deployment.

## 2. How the current app is structured (the starting point)

```
React renderer (UI)  ──IPC via preload (~100 methods)──►  Electron main process (8,521 lines)
  13 components                                             = the real backend:
  ~140 window.electronAPI.* calls                            AI generation, publishing (WP/Shopify/JTL),
                                                             scraping, file export, image storage,
                                                             scheduler, auth, settings, OAuth
                                                                     │
                                                                     ▼
                                                          PHP API + MongoDB (data + auth/JWT only)
```

Key facts that shape the plan:
- The **renderer is backend-agnostic**: it only knows `window.electronAPI.<method>()`. That single seam is what we re-point.
- The **main process is plain Node** except for ~6 Electron-only APIs: `BrowserWindow`, `dialog`, `shell`, `clipboard`, `Menu`, `app.getPath`, `electron-store`. Everything else (axios, cheerio, openai, form-data, mongodb driver) runs unchanged on a server.
- AI generation, publishing, and scraping currently run in the **main process**, NOT in PHP. So the web backend must own that logic.
- The PHP API is only a **data/auth layer**. We can either keep it or absorb it into the new Node backend (recommended: absorb — talk to Mongo directly, reusing `db-mongodb.js`).

## 3. Target architecture

```
            ┌─────────────────────────── Browser ───────────────────────────┐
            │  React app (same components)                                    │
            │  window.electronAPI  →  apiClient (HTTP + WebSocket adapter)     │
            └───────────────┬───────────────────────────┬─────────────────────┘
                            │ REST/JSON                  │ WebSocket (progress, notifications)
                            ▼                            ▼
            ┌──────────────────────────── Node backend (Express/Fastify) ─────┐
            │  Route handlers  (1:1 with the ~100 IPC channels)               │
            │  Ported services: blogGenerator, aiProviders, openai,           │
            │                   productScraper, fileExporter, publishing      │
            │  Auth (JWT), per-user API keys, settings                        │
            │  Job worker (BullMQ): generation + scheduler                    │
            └───────┬─────────────────┬────────────────┬───────────────┬──────┘
                    ▼                 ▼                ▼               ▼
                 MongoDB           Redis           S3 / MinIO       SMTP / external
              (existing data)   (queue, WS pub/sub) (images, exports)  (publish targets)

            ┌─────────────── Desktop (Electron/Tauri shell) ───────────────┐
            │  Loads the same web frontend; talks to the same server.       │
            │  Adds: auto-update, native window, deep links. No local logic.│
            └───────────────────────────────────────────────────────────────┘
```

### Proposed directory layout (new — nothing existing is touched)

```
web/
  frontend/        # the React UI (copied from src/renderer, API layer swapped)
    src/
      apiClient/   # NEW: implements the window.electronAPI surface over HTTP+WS
      components/  # copied as-is from src/renderer/src/components
      ...
  backend/         # Node API server + job worker
    src/
      routes/      # one module per domain (blogs, publish, shopify, scheduler, ...)
      services/    # ported from src/main/services + aiProviders + api/openai
      adapters/    # electron-API replacements (storage, downloads, paths)
      realtime/    # websocket hub (progress, notifications)
      worker/      # BullMQ processors (generation, scheduler ticks)
      db/          # mongo client (reuse db-mongodb.js logic)
      auth/        # JWT issue/verify, middleware
  desktop/         # thin Electron (or Tauri) shell -> loads frontend/server
  docker/
    docker-compose.yml
    backend.Dockerfile
    frontend.Dockerfile (nginx)
    nginx/ (reverse proxy + TLS)
  .env.example
  README.md
```

## 4. The crux: the API adapter (keeps the UI unchanged)

The whole "same design, only the API changes" requirement hinges on one shim.

Today components call e.g. `await window.electronAPI.getHistory({...})`. We build `apiClient` exposing the **exact same method names** (all ~100), each implemented as an HTTP/WS call, and assign it:

```js
// web/frontend/src/apiClient/index.js
const apiClient = {
  getHistory: (payload) => http.post('/api/history/get', payload),
  generateBlog: (payload) => jobs.run('generate-blog', payload, onProgress), // WS progress
  startShopifyOAuth: (payload) => http.post('/api/shopify/oauth/start', payload),
  onGenerationProgress: (cb) => ws.on('generation-progress', cb),
  onAuthExpired: (cb) => ws.on('auth-expired', cb),
  // ... all other methods
};
window.electronAPI = apiClient; // components keep working untouched
```

Because the channel names already map cleanly (`get-history`, `generate-blog`, …), the backend exposes a matching REST route per channel. **No component logic changes** — only the adapter and the backend are new.

Event-style methods (`onGenerationProgress`, `onAuthExpired`) move from IPC events to **WebSocket** subscriptions.

## 5. Backend: porting the main process

Each `ipcMain.handle('<channel>', fn)` becomes a route `POST /api/<channel>` calling the same ported logic. The service modules port with minimal change; the Electron-only pieces get adapters:

| Electron API (in main) | Web/server replacement |
|---|---|
| `BrowserWindow` / `Menu` / context menus | N/A on server; desktop shell handles native window |
| `dialog.showSaveDialog` + write file (exports) | Backend generates file → returns a **download URL** (object storage / streamed response); browser downloads |
| `selectLocalImageFile` (open dialog) | Browser `<input type=file>` upload → `POST /api/images/upload` |
| `shell.openExternal(url)` | Return the URL to the client; browser `window.open` (OAuth, links) |
| `clipboard` | `navigator.clipboard` in the browser |
| `app.getPath('userData')` / temp dirs | Server data dir / DB / object storage |
| `electron-store` (local config, tokens) | Browser stores JWT (httpOnly cookie); server config is env/DB |
| `onGenerationProgress` IPC event | WebSocket channel per user/job |

Subsystems and where they land:
- **AI generation** (`blogGenerator`, `aiProviders`, `api/openai`): runs in the **job worker**; progress streamed over WS. Avoids HTTP timeouts on long generations.
- **Publishing** (WordPress/Shopify/JTL/custom): already HTTP calls — runs server-side directly. (Shopify already has the server-side OAuth + publish proxy work from the current effort — reuse that design.)
- **Scraping** (`productScraper` + cheerio): server-side.
- **Exports** (`fileExporter`, CSV, images ZIP): server generates to object storage / streams as a download.
- **Scheduler**: becomes a real server-side worker (BullMQ + repeatable jobs or node-cron). This is strictly better than today — it runs even when no client is open.
- **Auth / users / settings / per-user API keys**: JWT (already exists); keep the users/settings collections in Mongo.

## 6. Image storage (changes, per the brief)

Use **AWS S3** (the AWS account already in use):
- Backend uses `@aws-sdk/client-s3`; issues **pre-signed upload/download URLs**; images served from the bucket (optionally fronted by CloudFront/CDN).
- Auth to S3 via an **IAM role on the AWS instance** (preferred) or an IAM user's access key in env.
- One bucket (e.g. `aiblog-media`) with key prefixes per user/blog; private objects + pre-signed reads, or public-read + CDN if images must be hotlinked by published posts.
- `uploadImageToStorage`, `testImageStorage`, `downloadImage`, `attachLocalBlogImage`, `generateBlogImage` re-point to this.

## 7. Real-time & long-running work

- **WebSocket hub** (socket.io or ws) for: generation progress, scheduler/publish notifications, `auth-expired`, realtime analytics.
- **Job queue** (BullMQ on Redis) for: blog generation, bulk export, scheduled publishes. Returns a job id; client subscribes to progress over WS. Scales horizontally and survives client disconnects.

## 8. Auth & multi-tenancy (now internet-facing)

- JWT issued on login (already implemented in PHP — reimplement/verify in Node). Web stores it in an **httpOnly, Secure, SameSite cookie** (+ CSRF token) or a bearer token in memory.
- Per-user OpenAI/API keys already stored server-side — good; ensure strict per-user isolation in every query (the code already scopes by `user_id`).
- Add: rate limiting, request validation, CORS allowlist, secrets via env/secret manager, audit logging (the `logs`/`activities` collections already exist).

## 9. Desktop, both ways

- **Electron shell** (recommended — reuses the existing `check-app-update`/`download-app-update`/`install-app-update` flow via `electron-updater`): a `BrowserWindow` loading the deployed web app URL (or a bundled frontend that calls the server API). Package with `electron-builder` for macOS (dmg) + Windows (nsis) — the existing project already uses electron-builder.
- **Alternative:** Tauri (smaller binaries, Rust shell) if bundle size matters more than reusing the Electron update flow.
- Either way the desktop app is a **thin client** — all logic is server-side, satisfying "everything runs server-end."

## 10. Docker deployment

`docker-compose.yml` services (final, per locked decisions):
- `backend` — Node API.
- `worker` — Node BullMQ processor (generation + scheduler). Can start co-located with `backend`, split out when load grows.
- `frontend` — nginx serving the built React app.
- `redis` — queue + WS pub/sub.
- `proxy` — nginx/Traefik reverse proxy + Let's Encrypt TLS (HTTPS everywhere — also fixes the cert issues hit during the Shopify work).

**Not containerized:** MongoDB (existing managed DB) and image storage (AWS S3) are external — referenced via env, not run in compose.

CI/CD: build images, push to a registry, deploy via compose (or later: Kubernetes/Swarm). Health checks already exist server-side (`/health`).

## 11. Phased roadmap

- **Phase 0 — Scaffolding.** `web/` dir, docker-compose skeleton, env config, CI build.
- **Phase 1 — Backend core.** Node server + Mongo + JWT auth; port data/settings/users/history/logs routes (the PHP-backed surface). Health checks.
- **Phase 2 — Frontend on the web.** Copy renderer; build the `apiClient` adapter; wire login → history → settings working in a browser. This proves the "UI unchanged" thesis end-to-end.
- **Phase 3 — Generation + realtime.** Job queue + WebSocket; port `generateBlog`/`generateBlogImage`/progress; scraping.
- **Phase 4 — Publishing + image storage.** Port WP/Shopify/JTL publishing; MinIO/S3 images; exports as downloads.
- **Phase 5 — Scheduler worker.** Server-side cron/queue execution + notifications.
- **Phase 6 — Desktop shell.** Electron/Tauri wrapper + auto-update + signed installers (mac/win).
- **Phase 7 — Hardening.** Rate limits, observability, backups, load test, scale-out (stateless backend + Redis), docs.

## 12. Effort & risk notes

- **Largest task:** porting the 8,521-line `index.js` (98 handlers). It's mechanical but big; do it route-group by route-group, verifying each against the IPC behavior.
- **Streaming/long jobs:** generation progress must move to WS/queue or HTTP requests will time out.
- **File flows:** save-dialogs/local-file-pick become uploads/downloads — a handful of components (`HistoryPage`, `ResultsPage`, `SettingsPage`) need the adapter to bridge these, but not redesign.
- **Security surface:** going from a single-user desktop to internet multi-tenant is the real new risk area — invest in auth hardening, validation, rate limiting, and tenant isolation tests.
- **Two frontends drift:** if the existing desktop app keeps evolving separately, the copied web frontend diverges. Mitigation: later extract the renderer into a shared package both consume. Initially, copy is fine and honors "don't touch existing code."
- **Don't fork the data model:** point the web backend at the **same MongoDB** so web and existing desktop share data during transition.

## 13. Recommended stack (concrete)

- Backend: **Node 20 + Fastify** (or Express), **BullMQ** (Redis), **socket.io**, official **mongodb** driver (reuse `db-mongodb.js`), **zod** for validation.
- Storage: **S3/MinIO** via `@aws-sdk/client-s3`.
- Frontend: existing **React + Vite**, served by **nginx**; `apiClient` adapter.
- Desktop: **Electron + electron-builder + electron-updater** (reuse existing update IPC), or Tauri.
- Infra: **Docker Compose** → (optional later) Kubernetes; **Traefik/nginx + Let's Encrypt** TLS.

## 14. Decisions (locked)

1. **Backend:** ✅ **All-Node.** One Node backend talks directly to Mongo and reuses the existing JS services; PHP is not in the web path.
2. **Desktop:** ✅ **Electron** thin shell, reusing the existing electron-builder + auto-update flow.
3. **Image/export storage:** ✅ **AWS S3** (account already in use on the AWS infra) via `@aws-sdk/client-s3` + pre-signed URLs. No MinIO needed.
4. **Database:** ✅ **Same MongoDB** as the existing app — web and desktop share users/settings/blogs/history during transition.
5. **Frontend reuse:** copy `src/renderer` into `web/frontend` for Phase 0–2 (honors "don't touch existing code"); revisit extracting a shared UI package once the web path is proven.

### Consequences of these choices
- Docker compose services: `backend`, `worker`, `frontend (nginx)`, `redis`, `proxy (TLS)`. **No `mongo` or `minio` containers** — Mongo is the existing managed DB, images go to AWS S3.
- Backend needs AWS creds (IAM user/role) + bucket name via env; in AWS, prefer an **IAM role** on the instance over static keys.
- Reuse `db-mongodb.js` connection logic directly in the Node backend.
