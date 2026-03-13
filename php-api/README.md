# PHP API for AI Blog Generator

Deploy this folder on your AWS/PHP server to provide server-side auth, scheduler, update check, and DB RPC endpoints.

## Files

- `blog-gen.php`: main API router
- `db-actions.php`: DB action handlers used by `/db/call`
- `config.example.php`: copy to `config.php` and fill secrets
- `.htaccess`: optional rewrite support (default endpoint used by app is `/blog-gen.php`)

## Requirements

- PHP 8.1+
- `ext-mongodb` installed
- MongoDB Atlas/network access from server

## Setup

1. Copy `config.example.php` to `config.php`.
2. Set:
- `jwt_secret`
- `mongo_uri`
- `mongo_db`
- `updates` metadata
3. Upload folder to server under HTTPS.

## Auth model (JWT-only)

- Public routes: `/health`, `/auth/setup-admin`, `/auth/login`, `/auth/state`
- Protected routes: `/scheduler/*` and `/db/call` require `Authorization: Bearer <accessToken>`

## Endpoints

- `GET /health`
- `POST /auth/setup-admin`
- `POST /auth/login`
- `GET /auth/state`
- `GET /scheduler/jobs`
- `POST /scheduler/jobs`
- `PUT /scheduler/jobs/{id}`
- `DELETE /scheduler/jobs/{id}`
- `POST /scheduler/import-csv`
- `GET /scheduler/logs`
- `POST /scheduler/logs`
- `GET /updates/latest?currentVersion=1.0.0&channel=stable`
- `POST /db/call` (JWT required; used by desktop app DB provider)

## CSV headers for scheduler import

Use headers like:

- `shop_id`
- `topic`
- `keywords`
- `run_at` (ISO datetime)

Or split date/time:

- `date`
- `time`

Optional:

- `platform`
- `destination_id`

## Electron app env

Set:

- `APP_SERVER_API_BASE_URL=https://your-domain.com/path/to/blog-gen.php`
- `APP_SERVER_API_TIMEOUT_MS=15000` (optional)

The app client calls `/auth/*`, `/scheduler/*`, `/updates/*`, and `/db/call` under that base URL.