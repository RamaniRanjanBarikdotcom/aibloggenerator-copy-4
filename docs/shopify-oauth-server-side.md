# Shopify OAuth & Publishing — Server-Side Design

Status: **Phase 1 + 1b + 2 implemented (server OAuth, app management, publish proxy)** · deploy required before enabling · sync/analytics reads (Phase 2b) still use the client token.

## Implementation status

**Done (in this repo):**
- Server (`php-api/blog-gen.php`): crypto helpers (`shopifyEncryptSecret`/`shopifyDecryptSecret`,
  AES-256-GCM with a server-only key) + routes:
  `GET/POST /shopify/oauth/clients`, `DELETE /shopify/oauth/clients/{id}`,
  `POST /shopify/oauth/start`, `GET /shopify/oauth/callback` (public, HMAC-verified),
  `GET /shopify/oauth/status`. Secrets + access tokens are stored encrypted in new Mongo
  collections `shopify_oauth_clients`, `shopify_connections`, `shopify_oauth_states`.
- `php-api/.htaccess`: `^shopify/(.*)$ → blog-gen.php` (clean callback path, no `?route=` so HMAC stays valid).
- `php-api/config.example.php`: `encryption_key` + `shopify_oauth_redirect_url`.
- Client (`src/main/services/serverApi.js`): `shopify*OauthClient(s)`, `shopifyStartOauth`, `shopifyOauthStatus`.
- Client (`src/main/index.js`): `startShopifyOAuthServerSide()` — opens the authorize URL, polls
  status. Gated behind `SHOPIFY_SERVER_OAUTH=true` (off by default); legacy localhost flow remains default.
- **Phase 1b (OAuth-app management, done):** OAuth apps are saved/listed/deleted server-side via
  `shopify-oauth-{list,save,delete}-client` IPC (`src/main/index.js`) → `serverApi` → `/shopify/oauth/clients`.
  `get-settings` returns `shopifyServerOauthEnabled`; the Settings UI (`SettingsPage.jsx`) uses the
  server record id as `oauthClientId` and stops persisting OAuth apps/secrets into the settings blob
  when the flag is on. Preload exposes the three methods.

- **Phase 2 (publish proxy, done):** server routes `POST /shopify/publish` (uploads image via Files
  API + creates the article using the stored token), `GET /shopify/blogs`, `GET /shopify/shop`
  (`php-api/blog-gen.php`), keyed to the stored connection via `shopifyFindConnection` (user+shop,
  destination-id optional). Client (`src/main/index.js`): `publishToShopifyViaServer()` prepares the
  article payload (+ image bytes when not a public URL) and calls the proxy; the `publish-blog`,
  `test-publish-destination`, and `list-shopify-blogs` handlers route through the proxy when the flag
  is on. The access token never returns to the client.

**Remaining:**
1. **Deploy** updated `php-api/` to the server; set `encryption_key` and (optionally)
   `shopify_oauth_redirect_url` in `config.php`.
2. **Shopify Partner app**: register the redirect URL (see no-HTTPS hybrid below).
3. **Phase 2b (optional) — read/sync proxy**: remote-post sync + analytics still read Shopify with
   `destination.accessToken` (`fetchShopifyPosts` and the sync paths in `src/main/index.js`). In
   server mode those have no token and will no-op/error gracefully; add a read-proxy if Shopify
   analytics is needed there.

With Phase 2 in place, `SHOPIFY_SERVER_OAUTH=true` gives a fully server-side connect→configure→publish
flow once the server is deployed (1) and the redirect URL is registered (2). Turn the flag on only
after deploying — otherwise the new routes 404.

## No-HTTPS hybrid (active path when the server has no TLS)

Shopify rejects non-HTTPS redirect URLs **except** `http://localhost`. So when the server has no
cert, we keep the secret server-side anyway by bouncing the callback through localhost:

1. `POST /shopify/oauth/start` is called with `redirectUri = http://localhost:3000/api/auth/shopify/callback`
   (the URL registered in the Shopify app). The server puts that into Shopify's authorize URL and
   returns `serverCallbackUrl` (its own `…/server-config/shopify/oauth/callback`).
2. Shopify redirects the browser to the **localhost** URL on the user's machine (loopback, no TLS needed).
3. The desktop's local listener (`startShopifyOAuthServerSide` in `src/main/index.js`,
   port/path from `SHOPIFY_OAUTH_LOCAL_REDIRECT_URL`, default `http://localhost:3000/api/auth/shopify/callback`)
   **302-redirects** the browser to `serverCallbackUrl` with Shopify's query params **unchanged**
   (so the HMAC still validates).
4. The server verifies the HMAC with the stored secret, exchanges the code, stores the token. The
   desktop polls `GET /shopify/oauth/status` for completion.

Only the short-lived authorization `code` crosses `http` (same exposure as all current API traffic);
the client secret and access token never leave the server.

**Registration / config for the hybrid:**
- Shopify Partner app → Allowed redirection URL(s): `http://localhost:3000/api/auth/shopify/callback`.
- `config.php` → leave `shopify_oauth_redirect_url` blank to derive the server callback from the
  request, or set it to `http://<host>/ls/api/v1/server-config/shopify/oauth/callback`.
- Desktop → `SHOPIFY_OAUTH_LOCAL_REDIRECT_URL` must equal the registered localhost URL (default already matches).

When TLS later becomes available, register `https://<host>/…/shopify/oauth/callback` directly in
Shopify and drop the localhost hop — the same `/callback` route handles both.

## Why

Today the Shopify **client secret** and **access token** live on the desktop client:

- The client secret is encrypted on the desktop (`encryptSecret`/`decryptSecret` in
  `src/main/index.js`) but stored in shared, server-side settings. The encryption key was
  derived from a machine-local path (`app.getPath('userData')`), so a secret encrypted on one
  install could not be decrypted on another → `Unsupported state or unable to authenticate data`
  (GCM auth-tag mismatch), surfaced in the UI as "Shopify client secret is required".
  - Interim fix already shipped: the key fallback is now a build-stable constant
    (`DEFAULT_ENCRYPTION_SEED`), overridable via `APP_ENCRYPTION_KEY`. This makes secrets
    portable across installs but the secret/token still reach the client.
- The OAuth callback runs on `http://localhost:4319` on the desktop, and the token exchange
  (`POST https://{shop}/admin/oauth/access_token`) happens on the desktop.
- Publishing (`src/main/index.js` ~3501–3563, scheduler ~1293+) calls the Shopify Admin API
  directly from the desktop using `destination.accessToken`.

**Goal of this design:** the Shopify client secret and access token never leave the server. The
desktop client only ever sees masked placeholders and triggers actions; all Shopify credentials
and credentialed API calls live server-side.

## Prerequisite: HTTPS

The API base is currently plain HTTP (`http://3.121.71.76/...`). Moving credentials server-side
means the client sends the raw secret to the server and the OAuth `redirect_uri` points at the
server. **The API must be served over TLS (HTTPS) first**, otherwise secrets are exposed in
transit. Shopify also requires an HTTPS redirect URI for OAuth in practice.

## Shopify Partner app change

The app's **Allowed redirection URL(s)** must change from
`http://localhost:4319/shopify/callback` to the server callback, e.g.
`https://<api-host>/ls/api/v1/.../shopify/oauth/callback`. This is a manual change in the Shopify
Partner dashboard for each OAuth app.

---

## Target flow

```
Desktop                         Server (PHP)                    Shopify
   |  start(oauthClientId, shop)    |                               |
   |------------------------------->|  create state, store          |
   |                                |  {state -> userId, clientId,  |
   |                                |   shop, destinationId}        |
   |   { authorizeUrl }             |                               |
   |<-------------------------------|                               |
   |  open authorizeUrl in browser  |                               |
   |------------------------------------------------------------->  | user approves
   |                                |   GET callback?code&hmac&state|
   |                                |<------------------------------|
   |                                |  verify state + hmac (secret  |
   |                                |  held server-side),           |
   |                                |  POST oauth/access_token ---->|
   |                                |  store access_token (enc) for |
   |                                |  {userId, shop, destination}  |
   |                                |  render "you can close" page  |
   |  poll status(state)            |                               |
   |------------------------------->|  { status: 'complete', shop } |
   |<-------------------------------|                               |
```

Because the browser returns to the **server** (not the desktop), the client learns the outcome by
**polling** a status endpoint keyed by `state` (simple and firewall-friendly). A websocket/SSE push
is an optional optimization.

---

## Server API contract (new actions)

All actions are authenticated with the existing server access token (same `/db/call` or dedicated
routes — choose per server conventions). Secrets are **never** returned to the client.

### 1. Save OAuth app (replaces client-side `encryptSecret`)
`POST shopify/oauth/clients`
```jsonc
// request
{ "id": "optional-existing-id", "name": "My app", "clientId": "abc", "clientSecret": "plaintext-or-omit-to-keep" }
// response (masked)
{ "id": "...", "name": "My app", "clientId": "abc", "hasSecret": true }
```
Server encrypts `clientSecret` at rest with a **server-only** key (env/KMS) and stores it. If
`clientSecret` is omitted or equals the mask, the existing stored secret is kept.

### 2. List OAuth apps (masked)
`GET shopify/oauth/clients` → `[{ id, name, clientId, hasSecret, createdAt, updatedAt }]`
Never includes the secret.

### 3. Start OAuth
`POST shopify/oauth/start`
```jsonc
{ "oauthClientId": "...", "shop": "my-store.myshopify.com", "destinationId": "optional" }
// response
{ "authorizeUrl": "https://my-store.myshopify.com/admin/oauth/authorize?...", "state": "..." }
```
Server: validates the shop domain, looks up the (decrypted, in-memory) secret, generates a
cryptographically random `state`, persists `{state -> userId, oauthClientId, shop, destinationId,
createdAt}` with a short TTL (e.g. 10 min), builds the authorize URL with
`redirect_uri = <server callback>`, returns it.

### 4. OAuth callback (browser-facing, no app auth)
`GET shopify/oauth/callback?code&hmac&state&shop&timestamp&host`
Server:
1. Look up `state`; reject if missing/expired.
2. Verify `shop` matches the stored shop; verify Shopify **HMAC** using the stored client secret.
3. `POST https://{shop}/admin/oauth/access_token` with `client_id`, `client_secret`, `code`.
4. Encrypt and store the `access_token` (+ `scope`, `apiVersion`) against `{userId, shop,
   destinationId}`. Mark the `state` record `complete`.
5. Render a minimal "Shopify connected — you can close this window" HTML page.
On error, mark the state `failed` with a reason and render an error page.

### 5. Poll status
`GET shopify/oauth/status?state=...` →
`{ "status": "pending" | "complete" | "failed", "shop": "...", "destinationId": "...", "error": "..." }`
Returns only status metadata, never the token.

### 6. Publish (proxy — token stays server-side)
`POST shopify/publish`
```jsonc
{ "destinationId": "...", "shop": "...", "blogId": "...", "article": { "title": "...", "bodyHtml": "...", "tags": "...", "publishedAt": "...", "images": [/* refs or base64 */] } }
// response
{ "success": true, "articleId": 123, "articleUrl": "https://.../blogs/.../...", "handle": "..." }
```
Server loads the decrypted access token for the destination and performs the existing Admin API
calls currently done on the client (`files.json` upload, `articles.json` create, blog-handle
lookup). The desktop never sees the token.

> This endpoint absorbs the logic at `src/main/index.js` ~3501–3563 and the scheduler path
> ~1293+. It is the **largest** part of the work.

### 7. Disconnect / delete
`DELETE shopify/oauth/clients/{id}` and/or `DELETE shopify/destinations/{id}` — server purges the
stored secret/token.

---

## Storage (server)

- `shopify_oauth_clients`: `{ id, userId, name, clientId, clientSecretEnc, createdAt, updatedAt }`
- `shopify_connections`: `{ id, userId, destinationId, shop, accessTokenEnc, scope, apiVersion, connectedAt }`
- `shopify_oauth_states`: `{ state, userId, oauthClientId, shop, destinationId, status, error, createdAt, expiresAt }`

Encrypt `clientSecretEnc` / `accessTokenEnc` with a server-held key (env `APP_ENCRYPTION_KEY` on the
server, or KMS). Rotate centrally.

---

## Desktop client changes (gated on the endpoints above)

These are intentionally **not** implemented yet — they would break the app until the server is
ready. When the contract is live:

1. `save-settings` / Shopify settings: stop calling `encryptSecret`; send the plaintext secret to
   action (1) and store only masked metadata locally. Remove `clientSecretEnc` handling for this
   field (`normalizeShopifyOauthClients`, `sanitizeShopifyOauthClientsForUi`).
2. `shopify-oauth-start` IPC: replace the local `http.createServer` callback + `axios` token
   exchange (`src/main/index.js` ~3854–3933) with: call action (3), `shell.openExternal(authorizeUrl)`,
   then poll action (5) until `complete`/`failed`/timeout.
3. Remove `SHOPIFY_OAUTH_PORT` / `getShopifyOauthRedirectUrl` localhost server.
4. Publishing: replace direct Admin API calls with action (6); destinations store only
   `destinationId` + `shop` (no `accessToken`).
5. Remove `encryptSecret`/`decryptSecret`, `getEncryptionKey`, `DEFAULT_ENCRYPTION_SEED`,
   `verifyShopifyHmac`, `buildShopifyHmacMessage` from the client once nothing uses them.
6. `verify`/scheduler paths that read `destination.accessToken` switch to the proxy.

## Migration

- Existing connections store an `accessToken` on the client/destination. On first run after the
  switch, either (a) re-run OAuth to populate server-side connections, or (b) one-time migration
  endpoint that accepts the existing token + shop and stores it server-side, then the client drops
  its copy.
- Existing `clientSecretEnc` blobs in settings can't be read server-side (different key) — users
  re-enter the secret once via action (1).

## Rollout order

1. TLS / HTTPS on the API. *(prerequisite)*
2. Server: actions 1, 2 (store/list secret) + Shopify Partner redirect URL.
3. Server: actions 3, 4, 5 (server-hosted OAuth).
4. Client: switch settings + OAuth-start to the new actions (behind a flag).
5. Server: action 6 (publish proxy) + migration.
6. Client: switch publishing to the proxy; remove client-side crypto/token storage.
7. Remove the interim `DEFAULT_ENCRYPTION_SEED` / `APP_ENCRYPTION_KEY` client plumbing.
