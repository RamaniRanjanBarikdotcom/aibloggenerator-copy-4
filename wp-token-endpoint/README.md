# AI Blog Token Endpoint (WordPress Plugin)

Lightweight REST endpoints to accept posts from the AI Blog Generator app via a shared Bearer token.

## Install
1. Upload/Copy the folder `wp-token-endpoint/` (or the zip) into `wp-content/plugins/` on your WordPress site.
2. In WP Admin → Plugins, activate **AI Blog Token Endpoint**.

## Configure
1. Go to **Settings → AI Blog Token**.
2. Set a long random **API Token** and save.
3. Ensure your server passes the `Authorization` header:
   - Apache: add `RewriteEngine On` and `RewriteRule .* - [E=HTTP_AUTHORIZATION:%{HTTP:Authorization}]` to `.htaccess`.
   - Nginx: add `proxy_set_header Authorization $http_authorization;` in the site block, then reload.

## Endpoints
- Ping: `GET /wp-json/aiblog/v1/ping`
- Post: `POST /wp-json/aiblog/v1/post`
  - Body: `{ title, content, excerpt, status, keywords }`
  - Headers: `Authorization: Bearer <token>`

## Status values
- `draft` (default), `publish`, `pending`, `private`.

## Security
- Use a dedicated token per site; rotate as needed.
- The plugin checks exact token match via `hash_equals`.
- Requires `manage_options` to set the token.

## Troubleshooting
- 403 Missing bearer token: ensure the header is sent and not stripped by CDN/cache.
- 403 Token not configured: set the token in Settings → AI Blog Token.
- 500 on post: check WP error log for insert errors; verify required fields.
