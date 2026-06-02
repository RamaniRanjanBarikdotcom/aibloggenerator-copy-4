<?php

declare(strict_types=1);

use MongoDB\BSON\ObjectId;
use MongoDB\BSON\UTCDateTime;
use MongoDB\Driver\BulkWrite;
use MongoDB\Driver\Command;
use MongoDB\Driver\Manager;
use MongoDB\Driver\Query;

error_reporting(E_ALL);
ini_set('display_errors', '0');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

set_exception_handler(static function (Throwable $e): void {
    respond(500, [
        'success' => false,
        'error' => $e->getMessage(),
    ]);
});

function getHeaderValue(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    $value = $_SERVER[$key] ?? '';
    return is_string($value) ? trim($value) : '';
}

function getTokenFromRequest(): string
{
    $auth = getHeaderValue('Authorization');
    if (stripos($auth, 'Bearer ') === 0) {
        $token = trim(substr($auth, 7));
        if ($token !== '') {
            return $token;
        }
    }

    $headerToken = trim(getHeaderValue('X-Access-Token'));
    if ($headerToken !== '') {
        return $headerToken;
    }

    $queryToken = trim((string)($_GET['accessToken'] ?? ''));
    if ($queryToken !== '') {
        return $queryToken;
    }

    $raw = file_get_contents('php://input');
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $bodyToken = trim((string)($decoded['accessToken'] ?? ''));
            if ($bodyToken !== '') {
                return $bodyToken;
            }
        }
    }

    return '';
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if (!is_string($raw) || trim($raw) === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond(400, ['success' => false, 'error' => 'Invalid JSON body']);
    }
    return $decoded;
}

function base64urlEncode(string $value): string
{
    return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
}

function base64urlDecode(string $value): string
{
    $normalized = strtr($value, '-_', '+/');
    $pad = strlen($normalized) % 4;
    if ($pad > 0) {
        $normalized .= str_repeat('=', 4 - $pad);
    }
    $decoded = base64_decode($normalized, true);
    return $decoded === false ? '' : $decoded;
}

function issueJwt(array $payload, string $secret): string
{
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $encodedHeader = base64urlEncode(json_encode($header, JSON_UNESCAPED_SLASHES));
    $encodedPayload = base64urlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $body = $encodedHeader . '.' . $encodedPayload;
    $signature = hash_hmac('sha256', $body, $secret, true);
    return $body . '.' . base64urlEncode($signature);
}

function decodeJwt(string $token, string $secret): ?array
{
    $parts = explode('.', $token);
    if (count($parts) !== 3) {
        return null;
    }

    [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;
    $body = $encodedHeader . '.' . $encodedPayload;
    $expectedSignature = base64urlEncode(hash_hmac('sha256', $body, $secret, true));

    if (!hash_equals($expectedSignature, $encodedSignature)) {
        return null;
    }

    $payloadJson = base64urlDecode($encodedPayload);
    $payload = json_decode($payloadJson, true);
    if (!is_array($payload)) {
        return null;
    }

    $now = time();
    if (!isset($payload['exp']) || !is_numeric($payload['exp']) || $now >= (int)$payload['exp']) {
        return null;
    }

    return $payload;
}

function normalizeBson($value)
{
    if ($value instanceof ObjectId) {
        return (string)$value;
    }

    if ($value instanceof UTCDateTime) {
        return $value->toDateTime()->setTimezone(new DateTimeZone('UTC'))->format(DateTimeInterface::ATOM);
    }

    if (is_array($value)) {
        $out = [];
        foreach ($value as $k => $v) {
            $out[$k] = normalizeBson($v);
        }
        return $out;
    }

    if (is_object($value)) {
        $out = [];
        foreach ((array)$value as $k => $v) {
            $key = str_replace("\0*\0", '', (string)$k);
            $out[$key] = normalizeBson($v);
        }
        return $out;
    }

    return $value;
}

function parseObjectId(string $id): ObjectId
{
    try {
        return new ObjectId($id);
    } catch (Throwable $e) {
        respond(400, ['success' => false, 'error' => 'Invalid id']);
    }
}

function toUtcDateTime(string $value): UTCDateTime
{
    try {
        $dt = new DateTimeImmutable($value);
    } catch (Throwable $e) {
        respond(400, ['success' => false, 'error' => 'Invalid date/time']);
    }

    $utc = $dt->setTimezone(new DateTimeZone('UTC'));
    $millis = ((int)$utc->format('U')) * 1000 + (int)$utc->format('v');
    return new UTCDateTime($millis);
}

function mongoNamespace(array $cfg, string $collection): string
{
    return $cfg['mongo_db'] . '.' . $collection;
}

function mongoManager(array $cfg): Manager
{
    static $manager = null;
    if ($manager instanceof Manager) {
        return $manager;
    }

    if (!extension_loaded('mongodb')) {
        respond(500, ['success' => false, 'error' => 'ext-mongodb is not installed']);
    }

    $uri = trim((string)($cfg['mongo_uri'] ?? ''));
    if ($uri === '') {
        respond(500, ['success' => false, 'error' => 'mongo_uri is missing in config.php']);
    }

    $manager = new Manager($uri);
    return $manager;
}

function mongoFindOne(array $cfg, string $collection, array $filter, array $options = []): ?array
{
    $options['limit'] = 1;
    $cursor = mongoManager($cfg)->executeQuery(mongoNamespace($cfg, $collection), new Query($filter, $options));
    $items = $cursor->toArray();
    if (count($items) === 0) {
        return null;
    }
    return normalizeBson($items[0]);
}

function mongoFindMany(array $cfg, string $collection, array $filter, array $options = []): array
{
    $cursor = mongoManager($cfg)->executeQuery(mongoNamespace($cfg, $collection), new Query($filter, $options));
    $out = [];
    foreach ($cursor as $doc) {
        $out[] = normalizeBson($doc);
    }
    return $out;
}

function mongoInsertOne(array $cfg, string $collection, array $document): string
{
    $bulk = new BulkWrite();
    $id = $bulk->insert($document);
    mongoManager($cfg)->executeBulkWrite(mongoNamespace($cfg, $collection), $bulk);
    return (string)$id;
}

function mongoUpdateOne(array $cfg, string $collection, array $filter, array $update, bool $upsert = false): int
{
    $bulk = new BulkWrite();
    $bulk->update($filter, $update, ['multi' => false, 'upsert' => $upsert]);
    $result = mongoManager($cfg)->executeBulkWrite(mongoNamespace($cfg, $collection), $bulk);
    return $result->getModifiedCount() + $result->getUpsertedCount();
}

function mongoDeleteOne(array $cfg, string $collection, array $filter): int
{
    $bulk = new BulkWrite();
    $bulk->delete($filter, ['limit' => 1]);
    $result = mongoManager($cfg)->executeBulkWrite(mongoNamespace($cfg, $collection), $bulk);
    return $result->getDeletedCount();
}

function mongoCount(array $cfg, string $collection, array $filter = []): int
{
    $manager = mongoManager($cfg);
    $normalizedFilter = empty($filter) ? (object)[] : $filter;

    // Prefer native count command when available.
    if (class_exists('MongoDB\\Driver\\Command')) {
        $command = new Command(['count' => $collection, 'query' => $normalizedFilter]);
        $result = $manager->executeCommand($cfg['mongo_db'], $command)->toArray();
        if (!isset($result[0]) || !isset($result[0]->n)) {
            return 0;
        }
        return (int)$result[0]->n;
    }

    // Compatibility fallback for environments where Command class is unavailable.
    $cursor = $manager->executeQuery(
        mongoNamespace($cfg, $collection),
        new Query($normalizedFilter, ['projection' => ['_id' => 1]])
    );
    $count = 0;
    foreach ($cursor as $_unused) {
        $count++;
    }
    return $count;
}

function requireJwtUser(array $cfg): array
{
    $token = getTokenFromRequest();
    if ($token === '') {
        respond(401, ['success' => false, 'error' => 'Missing bearer token']);
    }

    $secret = trim((string)($cfg['jwt_secret'] ?? ''));
    if ($secret === '') {
        respond(500, ['success' => false, 'error' => 'jwt_secret is missing in config.php']);
    }

    $payload = decodeJwt($token, $secret);
    if (!is_array($payload)) {
        respond(401, ['success' => false, 'error' => 'Invalid or expired token']);
    }

    return $payload;
}

function issueUserToken(array $cfg, array $user): array
{
    $ttl = (int)($cfg['jwt_ttl_seconds'] ?? 3600);
    if ($ttl < 300) {
        $ttl = 300;
    }

    $now = time();
    $payload = [
        'uid' => (string)$user['_id'],
        'username' => (string)$user['username'],
        'role' => (string)($user['role'] ?? 'user'),
        'status' => (string)($user['status'] ?? 'active'),
        'iat' => $now,
        'exp' => $now + $ttl,
    ];

    $secret = trim((string)($cfg['jwt_secret'] ?? ''));
    if ($secret === '') {
        respond(500, ['success' => false, 'error' => 'jwt_secret is missing in config.php']);
    }

    return [
        'tokenType' => 'Bearer',
        'accessToken' => issueJwt($payload, $secret),
        'expiresIn' => $ttl,
    ];
}

function sanitizeUser(array $user): array
{
    return [
        'id' => (string)$user['_id'],
        'username' => (string)$user['username'],
        'role' => (string)($user['role'] ?? 'user'),
        'status' => (string)($user['status'] ?? 'active'),
        'permissions' => is_array($user['permissions'] ?? null) ? $user['permissions'] : [],
    ];
}

function resolveWorkspaceOwnerUserId(array $cfg, string $userId): string
{
    $uid = trim($userId);
    if ($uid === '') {
        return $uid;
    }

    $ownerKey = 'workspace_owner_' . $uid;
    $setting = mongoFindOne($cfg, 'settings', [
        'user_id' => $uid,
        'key' => $ownerKey,
    ]);

    $rawValue = $setting['value'] ?? null;
    if (is_scalar($rawValue)) {
        $ownerId = trim((string)$rawValue);
        if ($ownerId !== '') {
            return $ownerId;
        }
    }

    return $uid;
}

function parseCsvToRows(string $csv): array
{
    $lines = preg_split('/\r\n|\r|\n/', trim($csv));
    if (!is_array($lines) || count($lines) < 2) {
        return [];
    }

    $headers = str_getcsv(array_shift($lines));
    $headers = array_map(static fn($h) => strtolower(trim((string)$h)), $headers);

    $rows = [];
    foreach ($lines as $line) {
        if (trim($line) === '') {
            continue;
        }
        $values = str_getcsv($line);
        $row = [];
        foreach ($headers as $i => $header) {
            $row[$header] = isset($values[$i]) ? trim((string)$values[$i]) : '';
        }
        $rows[] = $row;
    }

    return $rows;
}

// --- Shopify OAuth helpers (server-side credential custody) -----------------

function shopifyEncryptionKey(array $cfg): string
{
    $seed = trim((string)($cfg['encryption_key'] ?? ''));
    if ($seed === '') {
        $seed = trim((string)($cfg['jwt_secret'] ?? ''));
    }
    if ($seed === '') {
        respond(500, ['success' => false, 'error' => 'encryption_key/jwt_secret missing in config.php']);
    }
    return hash('sha256', $seed, true); // 32 raw bytes for aes-256-gcm
}

function shopifyEncryptSecret(array $cfg, string $plain): string
{
    if ($plain === '') {
        return '';
    }
    $key = shopifyEncryptionKey($cfg);
    $iv = random_bytes(12);
    $tag = '';
    $cipher = openssl_encrypt($plain, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        throw new RuntimeException('Failed to encrypt secret');
    }
    return 'enc:' . bin2hex($iv) . ':' . bin2hex($tag) . ':' . bin2hex($cipher);
}

function shopifyDecryptSecret(array $cfg, string $payload): string
{
    if ($payload === '' || strncmp($payload, 'enc:', 4) !== 0) {
        return $payload;
    }
    $parts = explode(':', $payload);
    if (count($parts) !== 4) {
        return '';
    }
    $iv = @hex2bin($parts[1]);
    $tag = @hex2bin($parts[2]);
    $data = @hex2bin($parts[3]);
    if ($iv === false || $tag === false || $data === false) {
        return '';
    }
    $key = shopifyEncryptionKey($cfg);
    $plain = openssl_decrypt($data, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return $plain === false ? '' : $plain;
}

function shopifyNormalizeShop(string $value): string
{
    $v = strtolower(trim($value));
    $v = preg_replace('#^https?://#', '', $v);
    $v = preg_replace('#/.*$#', '', $v);
    return (string)$v;
}

function shopifyVerifyHmac(array $params, string $secret): bool
{
    $hmac = (string)($params['hmac'] ?? '');
    if ($hmac === '' || $secret === '') {
        return false;
    }
    $pairs = [];
    foreach ($params as $k => $v) {
        if ($k === 'hmac' || $k === 'signature') {
            continue;
        }
        $pairs[$k] = is_string($v) ? $v : '';
    }
    ksort($pairs);
    $message = [];
    foreach ($pairs as $k => $v) {
        $message[] = $k . '=' . $v;
    }
    $digest = hash_hmac('sha256', implode('&', $message), $secret);
    return hash_equals($digest, $hmac);
}

// Apply TLS options from config. By default cURL verifies the peer against the
// system CA bundle; set shopify_curl_ca_bundle to point at a cacert.pem, or
// shopify_curl_insecure=true to skip verification (TESTING ONLY).
function shopifyApplyCurlSsl($ch, array $cfg): void
{
    $caBundle = trim((string)($cfg['shopify_curl_ca_bundle'] ?? ''));
    if ($caBundle !== '' && is_file($caBundle)) {
        curl_setopt($ch, CURLOPT_CAINFO, $caBundle);
    }
    if (!empty($cfg['shopify_curl_insecure'])) {
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
    }
}

// Transport-agnostic HTTP: uses cURL when available, otherwise falls back to
// file_get_contents (requires allow_url_fopen). Returns ['status' => int, 'raw' => string].
function shopifyHttpSend(array $cfg, string $method, string $url, array $headers, ?string $body): array
{
    $method = strtoupper($method);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $opts = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_HTTPHEADER => $headers,
        ];
        if ($body !== null) {
            $opts[CURLOPT_POSTFIELDS] = $body;
        }
        curl_setopt_array($ch, $opts);
        shopifyApplyCurlSsl($ch, $cfg);
        $resp = curl_exec($ch);
        $status = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errno = curl_errno($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($resp === false) {
            throw new RuntimeException('cURL error ' . $errno . ': ' . $err);
        }
        return ['status' => $status, 'raw' => (string)$resp];
    }

    if (filter_var(ini_get('allow_url_fopen'), FILTER_VALIDATE_BOOLEAN)) {
        $sslOpts = [];
        $caBundle = trim((string)($cfg['shopify_curl_ca_bundle'] ?? ''));
        if (!empty($cfg['shopify_curl_insecure'])) {
            $sslOpts['verify_peer'] = false;
            $sslOpts['verify_peer_name'] = false;
        } elseif ($caBundle !== '' && is_file($caBundle)) {
            $sslOpts['cafile'] = $caBundle;
        }
        $httpOpts = [
            'method' => $method,
            'header' => implode("\r\n", $headers),
            'timeout' => 60,
            'ignore_errors' => true, // return the body even on 4xx/5xx
        ];
        if ($body !== null) {
            $httpOpts['content'] = $body;
        }
        $context = stream_context_create(['http' => $httpOpts, 'ssl' => $sslOpts]);
        $resp = @file_get_contents($url, false, $context);
        if ($resp === false) {
            $lastError = error_get_last();
            throw new RuntimeException('HTTP request failed: ' . ($lastError['message'] ?? 'unknown error'));
        }
        $status = 0;
        // $http_response_header is auto-populated in this scope by file_get_contents.
        if (isset($http_response_header[0]) && preg_match('#HTTP/\S+\s+(\d+)#', (string)$http_response_header[0], $m)) {
            $status = (int)$m[1];
        }
        return ['status' => $status, 'raw' => (string)$resp];
    }

    throw new RuntimeException('No HTTP transport available: enable the php-curl extension or set allow_url_fopen=On.');
}

function shopifyHttpPostJson(array $cfg, string $url, array $data): array
{
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    $res = shopifyHttpSend($cfg, 'POST', $url, $headers, json_encode($data, JSON_UNESCAPED_SLASHES));
    $decoded = json_decode($res['raw'], true);
    return ['status' => $res['status'], 'body' => is_array($decoded) ? $decoded : []];
}

// The server's OWN callback URL (where the desktop's localhost listener 302-redirects
// to so the token exchange happens server-side). Configurable; otherwise derived from
// the current request. The callback is a sibling of blog-gen.php, so we use the script
// DIRECTORY (not the script name) + /shopify/oauth/callback.
function shopifyRedirectUrl(array $cfg): string
{
    $configured = trim((string)($cfg['shopify_oauth_redirect_url'] ?? ''));
    if ($configured !== '') {
        return $configured;
    }
    $scheme = (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') ? 'https' : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    $scriptDir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? ''))), '/');
    return $scheme . '://' . $host . $scriptDir . '/shopify/oauth/callback';
}

// Find the stored connection (encrypted access token) for a shop, preferring an
// exact destination match but falling back to the most recent connection for the shop.
function shopifyFindConnection(array $cfg, string $userId, string $shop, string $destinationId = ''): ?array
{
    $shop = shopifyNormalizeShop($shop);
    if ($shop === '') {
        return null;
    }
    if ($destinationId !== '') {
        $doc = mongoFindOne($cfg, 'shopify_connections', [
            'user_id' => $userId,
            'shop' => $shop,
            'destination_id' => $destinationId,
        ]);
        if (is_array($doc)) {
            return $doc;
        }
    }
    return mongoFindOne($cfg, 'shopify_connections', [
        'user_id' => $userId,
        'shop' => $shop,
    ], ['sort' => ['updated_at' => -1]]);
}

// Authenticated Shopify Admin API request using a stored access token.
function shopifyApiRequest(array $cfg, string $method, string $url, string $accessToken, ?array $body = null): array
{
    $headers = ['Accept: application/json', 'X-Shopify-Access-Token: ' . $accessToken];
    $payload = null;
    if ($body !== null) {
        $headers[] = 'Content-Type: application/json';
        $payload = json_encode($body, JSON_UNESCAPED_SLASHES);
    }
    $res = shopifyHttpSend($cfg, $method, $url, $headers, $payload);
    $decoded = json_decode($res['raw'], true);
    return ['status' => $res['status'], 'body' => is_array($decoded) ? $decoded : []];
}

// Resolve + decrypt the access token for a shop, or respond 4xx and exit.
function shopifyRequireAccessToken(array $cfg, string $userId, string $shop, string $destinationId = ''): string
{
    $conn = shopifyFindConnection($cfg, $userId, $shop, $destinationId);
    if (!is_array($conn)) {
        respond(404, ['success' => false, 'error' => 'No Shopify connection for this shop. Reconnect in Settings.']);
    }
    $accessToken = shopifyDecryptSecret($cfg, (string)($conn['access_token_enc'] ?? ''));
    if ($accessToken === '') {
        respond(400, ['success' => false, 'error' => 'Stored Shopify access token unavailable. Reconnect in Settings.']);
    }
    return $accessToken;
}

function shopifyMapClient(array $doc): array
{
    return [
        'id' => (string)($doc['_id'] ?? ''),
        'name' => (string)($doc['name'] ?? ''),
        'clientId' => (string)($doc['client_id'] ?? ''),
        'hasSecret' => trim((string)($doc['client_secret_enc'] ?? '')) !== '',
        'createdAt' => $doc['created_at'] ?? null,
        'updatedAt' => $doc['updated_at'] ?? null,
    ];
}

require_once __DIR__ . '/db-actions.php';

$configPath = __DIR__ . '/config.php';
if (!file_exists($configPath)) {
    respond(500, ['success' => false, 'error' => 'config.php not found']);
}

$cfg = require $configPath;
if (!is_array($cfg)) {
    respond(500, ['success' => false, 'error' => 'config.php invalid']);
}

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    respond(204, []);
}

$routeOverride = '';
if (isset($_GET['route']) && is_string($_GET['route'])) {
    $routeOverride = trim((string)$_GET['route']);
}

if ($routeOverride !== '') {
    $requestPath = '/' . ltrim($routeOverride, '/');
} else {
    $requestPath = parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/';
    $scriptName = str_replace('\\', '/', (string)($_SERVER['SCRIPT_NAME'] ?? '/'));
    $scriptDir = rtrim(str_replace('\\', '/', dirname($scriptName)), '/');
    $scriptBase = basename($scriptName);

    if ($scriptDir !== '' && $scriptDir !== '/' && str_starts_with($requestPath, $scriptDir)) {
        $requestPath = substr($requestPath, strlen($scriptDir));
    }

    // Support PATH_INFO style routes: /blog-gen.php/auth/login
    if (str_starts_with($requestPath, '/' . $scriptBase . '/')) {
        $requestPath = substr($requestPath, strlen('/' . $scriptBase));
    } elseif ($requestPath === '/' . $scriptBase) {
        $requestPath = '/';
    }

    $requestPath = '/' . ltrim($requestPath, '/');
}

$method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));

if ($requestPath === '/health' && $method === 'GET') {
    respond(200, [
        'success' => true,
        'service' => 'blog-gen-php-api',
        'timestamp' => gmdate('c'),
    ]);
}

if ($requestPath === '/health/db' && $method === 'GET') {
    try {
        $count = mongoCount($cfg, 'users', []);
        respond(200, [
            'success' => true,
            'db' => 'ok',
            'users' => $count,
        ]);
    } catch (Throwable $e) {
        // Keep HTTP 200 so upstream/proxy does not swallow JSON error body.
        respond(200, [
            'success' => false,
            'error' => $e->getMessage(),
        ]);
    }
}


// Auth: setup admin
if ($requestPath === '/auth/setup-admin' && $method === 'POST') {
    $body = readJsonBody();
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if ($username === '' || $password === '') {
        respond(400, ['success' => false, 'error' => 'username and password are required']);
    }

    if (mongoCount($cfg, 'users', []) > 0) {
        respond(400, ['success' => false, 'error' => 'Admin already exists']);
    }

    $now = new UTCDateTime((int)(microtime(true) * 1000));
    $id = mongoInsertOne($cfg, 'users', [
        'username' => $username,
        'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
        'role' => 'admin',
        'status' => 'active',
        'permissions' => ['generate', 'history', 'export', 'bulkExport', 'settings', 'notifications', 'manageUsers'],
        'created_at' => $now,
        'updated_at' => $now,
    ]);

    $user = mongoFindOne($cfg, 'users', ['_id' => parseObjectId($id)]);
    if (!$user) {
        respond(500, ['success' => false, 'error' => 'Failed to create admin']);
    }

    respond(200, [
        'success' => true,
        'user' => sanitizeUser($user),
        'auth' => issueUserToken($cfg, $user),
    ]);
}

// Auth: login
if ($requestPath === '/auth/login' && $method === 'POST') {
    $body = readJsonBody();
    $username = trim((string)($body['username'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if ($username === '' || $password === '') {
        respond(400, ['success' => false, 'error' => 'username and password are required']);
    }

    $user = mongoFindOne($cfg, 'users', ['username' => $username]);
    $storedHash = (string)($user['password_hash'] ?? ($user['passwordHash'] ?? ''));
    $storedSalt = (string)($user['password_salt'] ?? ($user['passwordSalt'] ?? ''));
    $isValid = false;
    if ($storedHash !== '') {
        if ($storedSalt !== '') {
            $computed = hash_pbkdf2('sha512', $password, $storedSalt, 120000, 128, false);
            $isValid = hash_equals($storedHash, $computed);
        } else {
            $isValid = password_verify($password, $storedHash);
        }
    }
    if (!$user || !$isValid) {
        respond(401, ['success' => false, 'error' => 'Invalid credentials']);
    }

    if (($user['status'] ?? 'active') === 'deactive') {
        respond(403, ['success' => false, 'error' => 'User is deactive. Contact admin.']);
    }

    // Update activity timestamps on successful login.
    $now = new UTCDateTime((int)(microtime(true) * 1000));
    mongoUpdateOne(
        $cfg,
        'users',
        ['_id' => $user['_id']],
        ['$set' => [
            'last_online_at' => $now,
            'last_login_at' => $now,
            'updated_at' => $now,
        ]]
    );
    $user = mongoFindOne($cfg, 'users', ['_id' => $user['_id']]) ?? $user;

    respond(200, [
        'success' => true,
        'user' => sanitizeUser($user),
        'auth' => issueUserToken($cfg, $user),
    ]);
}

// Auth: state
if ($requestPath === '/auth/state' && $method === 'GET') {
    try {
        $count = mongoCount($cfg, 'users', []);
    } catch (Throwable $e) {
        // Keep HTTP 200 so client can read exact failure reason.
        respond(200, [
            'success' => false,
            'error' => $e->getMessage(),
        ]);
    }

    $currentUser = null;
    $token = getTokenFromRequest();
    if ($token !== '') {
        $payload = decodeJwt($token, (string)($cfg['jwt_secret'] ?? ''));
        if (is_array($payload) && isset($payload['uid'])) {
            $dbUser = mongoFindOne($cfg, 'users', ['_id' => parseObjectId((string)$payload['uid'])]);
            if ($dbUser && ($dbUser['status'] ?? 'active') !== 'deactive') {
                $currentUser = sanitizeUser($dbUser);
            }
        }
    }

    respond(200, [
        'success' => true,
        'needsAdminSetup' => $count === 0,
        'currentUser' => $currentUser,
    ]);
}

if ($requestPath === '/db/call' && $method === 'POST') {
    $jwtUser = requireJwtUser($cfg);
    $body = readJsonBody();
    $action = trim((string)($body['action'] ?? ''));
    $args = is_array($body['args'] ?? null) ? $body['args'] : [];
    if ($action === '') {
        respond(400, ['success' => false, 'error' => 'action is required']);
    }

    try {
        $result = bgDbAction($cfg, $action, $args);
        respond(200, ['success' => true, 'result' => $result]);
    } catch (Throwable $e) {
        respond(400, ['success' => false, 'error' => $e->getMessage()]);
    }
}

// Scheduler routes require user token.
if (str_starts_with($requestPath, '/scheduler/')) {
    $jwtUser = requireJwtUser($cfg);
    $actorUserId = (string)$jwtUser['uid'];
    $scopeUserId = resolveWorkspaceOwnerUserId($cfg, $actorUserId);

    if ($requestPath === '/scheduler/jobs' && $method === 'GET') {
        $status = trim((string)($_GET['status'] ?? ''));
        $shopId = trim((string)($_GET['shopId'] ?? ''));

        $filter = ['user_id' => $scopeUserId];
        if ($status !== '') {
            $filter['status'] = $status;
        }
        if ($shopId !== '') {
            $filter['shop_id'] = $shopId;
        }

        $jobs = mongoFindMany($cfg, 'scheduler_jobs', $filter, [
            'sort' => ['run_at' => 1, 'created_at' => -1],
            'limit' => (int)($_GET['limit'] ?? 500),
        ]);

        respond(200, ['success' => true, 'jobs' => $jobs]);
    }

    if ($requestPath === '/scheduler/jobs' && $method === 'POST') {
        $body = readJsonBody();
        $shopId = trim((string)($body['shopId'] ?? ''));
        $topic = trim((string)($body['topic'] ?? ''));
        $runAt = trim((string)($body['runAt'] ?? ''));
        $payload = is_array($body['payload'] ?? null) ? $body['payload'] : [];
        $scheduleMode = strtolower(trim((string)($body['scheduleMode'] ?? $body['schedule_mode'] ?? $payload['schedule_mode'] ?? 'generate')));
        $sourceBlogId = trim((string)($body['sourceBlogId'] ?? $body['source_blog_id'] ?? $payload['source_blog_id'] ?? ''));
        if ($sourceBlogId !== '') {
            // Safety: if a source blog is provided, this is always an existing-blog schedule.
            $scheduleMode = 'existing';
        }

        if ($shopId === '' || $topic === '' || $runAt === '') {
            respond(400, ['success' => false, 'error' => 'shopId, topic and runAt are required']);
        }
        if ($scheduleMode === 'existing' && $sourceBlogId === '') {
            respond(400, ['success' => false, 'error' => 'source_blog_id is required for existing schedule mode']);
        }
        $payload['schedule_mode'] = $scheduleMode === 'existing' ? 'existing' : 'generate';
        $payload['source_blog_id'] = $sourceBlogId;
        $now = new UTCDateTime((int)(microtime(true) * 1000));
        $id = mongoInsertOne($cfg, 'scheduler_jobs', [
            'user_id' => $scopeUserId,
            'shop_id' => $shopId,
            'topic' => $topic,
            'keywords' => trim((string)($body['keywords'] ?? '')),
            'schedule_mode' => $scheduleMode === 'existing' ? 'existing' : 'generate',
            'source_blog_id' => $sourceBlogId,
            'payload' => $payload,
            'run_at' => toUtcDateTime($runAt),
            'status' => 'pending',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $job = mongoFindOne($cfg, 'scheduler_jobs', ['_id' => parseObjectId($id)]);
        respond(200, ['success' => true, 'job' => $job]);
    }

    if (preg_match('#^/scheduler/jobs/([a-fA-F0-9]{24})$#', $requestPath, $m) === 1) {
        $jobId = $m[1];

        if ($method === 'PUT') {
            $body = readJsonBody();
            $set = ['updated_at' => new UTCDateTime((int)(microtime(true) * 1000))];
            $payloadBody = is_array($body['payload'] ?? null) ? $body['payload'] : null;
            if (isset($body['topic'])) {
                $set['topic'] = trim((string)$body['topic']);
            }
            if (isset($body['keywords'])) {
                $set['keywords'] = trim((string)$body['keywords']);
            }
            if (isset($body['runAt'])) {
                $set['run_at'] = toUtcDateTime((string)$body['runAt']);
            }
            if (isset($body['status'])) {
                $set['status'] = trim((string)$body['status']);
            }
            if ($payloadBody !== null) {
                $set['payload'] = $payloadBody;
            }
            if (array_key_exists('scheduleMode', $body) || array_key_exists('schedule_mode', $body) || ($payloadBody !== null && array_key_exists('schedule_mode', $payloadBody))) {
                $scheduleMode = strtolower(trim((string)($body['scheduleMode'] ?? $body['schedule_mode'] ?? ($payloadBody['schedule_mode'] ?? 'generate'))));
                $set['schedule_mode'] = $scheduleMode === 'existing' ? 'existing' : 'generate';
            }
            if (array_key_exists('sourceBlogId', $body) || array_key_exists('source_blog_id', $body) || ($payloadBody !== null && array_key_exists('source_blog_id', $payloadBody))) {
                $set['source_blog_id'] = trim((string)($body['sourceBlogId'] ?? $body['source_blog_id'] ?? ($payloadBody['source_blog_id'] ?? '')));
            }
            if (array_key_exists('source_blog_id', $set) && $set['source_blog_id'] !== '') {
                // Safety: source blog present => force existing mode.
                $set['schedule_mode'] = 'existing';
            }
            if (
                array_key_exists('schedule_mode', $set) &&
                $set['schedule_mode'] === 'existing' &&
                (!array_key_exists('source_blog_id', $set) || trim((string)$set['source_blog_id']) === '')
            ) {
            $current = mongoFindOne($cfg, 'scheduler_jobs', ['_id' => parseObjectId($jobId), 'user_id' => $scopeUserId]);
                $currentSource = trim((string)($current['source_blog_id'] ?? ''));
                if ($currentSource === '') {
                    respond(400, ['success' => false, 'error' => 'source_blog_id is required for existing schedule mode']);
                }
            }
            if (array_key_exists('payload', $set) && is_array($set['payload'])) {
                if (array_key_exists('schedule_mode', $set)) {
                    $set['payload']['schedule_mode'] = $set['schedule_mode'];
                }
                if (array_key_exists('source_blog_id', $set)) {
                    $set['payload']['source_blog_id'] = $set['source_blog_id'];
                }
            }
            mongoUpdateOne(
                $cfg,
                'scheduler_jobs',
                ['_id' => parseObjectId($jobId), 'user_id' => $scopeUserId],
                ['$set' => $set]
            );

            $job = mongoFindOne($cfg, 'scheduler_jobs', ['_id' => parseObjectId($jobId), 'user_id' => $scopeUserId]);
            respond(200, ['success' => true, 'job' => $job]);
        }

        if ($method === 'DELETE') {
            $deleted = mongoDeleteOne($cfg, 'scheduler_jobs', ['_id' => parseObjectId($jobId), 'user_id' => $scopeUserId]);
            respond(200, ['success' => true, 'deleted' => $deleted > 0]);
        }
    }

    if ($requestPath === '/scheduler/import-csv' && $method === 'POST') {
        $body = readJsonBody();
        $csv = (string)($body['csvContent'] ?? '');
        if (trim($csv) === '') {
            respond(400, ['success' => false, 'error' => 'csvContent is required']);
        }

        $rows = parseCsvToRows($csv);
        if (count($rows) === 0) {
            respond(400, ['success' => false, 'error' => 'CSV has no usable rows']);
        }

        $defaultShopId = trim((string)($body['defaultShopId'] ?? ''));
        $created = 0;
        $errors = [];
        $now = new UTCDateTime((int)(microtime(true) * 1000));

        foreach ($rows as $index => $row) {
            $shopId = trim((string)($row['shop_id'] ?? $row['shopid'] ?? $defaultShopId));
            $topic = trim((string)($row['topic'] ?? ''));
            $keywords = trim((string)($row['keywords'] ?? ''));
            $runAtRaw = trim((string)($row['run_at'] ?? $row['datetime'] ?? ''));

            if ($runAtRaw === '' && isset($row['date'])) {
                $date = trim((string)$row['date']);
                $time = trim((string)($row['time'] ?? '00:00'));
                $runAtRaw = trim($date . ' ' . $time);
            }

            if ($shopId === '' || $topic === '' || $runAtRaw === '') {
                $errors[] = ['row' => $index + 2, 'error' => 'Missing shop_id/topic/run_at'];
                continue;
            }

            try {
                mongoInsertOne($cfg, 'scheduler_jobs', [
                    'user_id' => $scopeUserId,
                    'shop_id' => $shopId,
                    'topic' => $topic,
                    'keywords' => $keywords,
                    'payload' => [
                        'platform' => trim((string)($row['platform'] ?? '')),
                        'destination_id' => trim((string)($row['destination_id'] ?? '')),
                    ],
                    'run_at' => toUtcDateTime($runAtRaw),
                    'status' => 'pending',
                    'created_at' => $now,
                    'updated_at' => $now,
                ]);
                $created++;
            } catch (Throwable $e) {
                $errors[] = ['row' => $index + 2, 'error' => $e->getMessage()];
            }
        }

        respond(200, ['success' => true, 'created' => $created, 'errors' => $errors]);
    }

    if ($requestPath === '/scheduler/logs' && $method === 'GET') {
        $filter = ['user_id' => $scopeUserId];
        $jobId = trim((string)($_GET['jobId'] ?? ''));
        $status = trim((string)($_GET['status'] ?? ''));

        if ($jobId !== '') {
            $filter['job_id'] = $jobId;
        }
        if ($status !== '') {
            $filter['status'] = $status;
        }

        $logs = mongoFindMany($cfg, 'scheduler_logs', $filter, [
            'sort' => ['created_at' => -1],
            'limit' => (int)($_GET['limit'] ?? 500),
        ]);

        respond(200, ['success' => true, 'logs' => $logs]);
    }

    if ($requestPath === '/scheduler/logs' && $method === 'POST') {
        $body = readJsonBody();
        $logId = mongoInsertOne($cfg, 'scheduler_logs', [
            'user_id' => $scopeUserId,
            'job_id' => trim((string)($body['jobId'] ?? '')),
            'shop_id' => trim((string)($body['shopId'] ?? '')),
            'status' => trim((string)($body['status'] ?? 'info')),
            'message' => trim((string)($body['message'] ?? '')),
            'published_url' => trim((string)($body['publishedUrl'] ?? '')),
            'meta' => is_array($body['meta'] ?? null) ? $body['meta'] : [],
            'created_at' => new UTCDateTime((int)(microtime(true) * 1000)),
        ]);

        respond(200, ['success' => true, 'id' => $logId]);
    }

    respond(404, ['success' => false, 'error' => 'Scheduler route not found']);
}

if ($requestPath === '/updates/latest' && $method === 'GET') {
    $channel = trim((string)($_GET['channel'] ?? 'stable'));
    $currentVersion = trim((string)($_GET['currentVersion'] ?? ''));

    $allUpdates = is_array($cfg['updates'] ?? null) ? $cfg['updates'] : [];
    $update = $allUpdates[$channel] ?? null;

    if (!is_array($update)) {
        respond(404, ['success' => false, 'error' => 'Update channel not found']);
    }

    $latestVersion = trim((string)($update['version'] ?? ''));
    $isUpdateAvailable = $latestVersion !== '' && $currentVersion !== ''
        ? version_compare($latestVersion, $currentVersion, '>')
        : true;

    respond(200, [
        'success' => true,
        'update' => $update,
        'isUpdateAvailable' => $isUpdateAvailable,
        'currentVersion' => $currentVersion,
        'channel' => $channel,
    ]);
}

// Shopify: server holds the client secret + access token and performs all
// credentialed calls (OAuth token exchange + publishing/reads).
if (str_starts_with($requestPath, '/shopify/')) {
    // 1) Public callback — Shopify redirects the browser here (no app JWT available).
    if ($requestPath === '/shopify/oauth/callback' && $method === 'GET') {
        $renderPage = static function (string $title, string $message, bool $autoClose = false): void {
            http_response_code(200);
            header('Content-Type: text/html; charset=utf-8');
            header('Cache-Control: no-store');
            // Best-effort auto-close: works when the browser allows scripts to close
            // the tab; otherwise the message tells the user they can close it.
            $closeScript = $autoClose
                ? '<script>setTimeout(function(){try{window.open("","_self");window.close();}catch(e){}},700);</script>'
                : '';
            echo '<!doctype html><html><head><meta charset="utf-8"><title>'
                . htmlspecialchars($title, ENT_QUOTES) . '</title></head>'
                . '<body style="font-family:system-ui,sans-serif;padding:48px;text-align:center">'
                . '<h2>' . htmlspecialchars($title, ENT_QUOTES) . '</h2>'
                . '<p>' . htmlspecialchars($message, ENT_QUOTES) . '</p>'
                . '<p style="color:#888">You can close this window.</p>'
                . $closeScript . '</body></html>';
            exit;
        };
        $failState = static function (?array $stateDoc, array $cfg, string $reason) use ($renderPage): void {
            if (is_array($stateDoc)) {
                mongoUpdateOne($cfg, 'shopify_oauth_states', ['state' => (string)($stateDoc['state'] ?? '')], [
                    '$set' => ['status' => 'failed', 'error' => $reason, 'updated_at' => bgUtcNow()],
                ]);
            }
            $renderPage('Shopify connection failed', $reason);
        };

        $params = [];
        foreach ($_GET as $k => $v) {
            $params[(string)$k] = is_string($v) ? $v : '';
        }
        $state = trim((string)($params['state'] ?? ''));
        $code = trim((string)($params['code'] ?? ''));
        $shop = shopifyNormalizeShop((string)($params['shop'] ?? ''));

        $stateDoc = $state !== '' ? mongoFindOne($cfg, 'shopify_oauth_states', ['state' => $state]) : null;
        if (!is_array($stateDoc)) {
            $renderPage('Shopify connection failed', 'Invalid or expired authorization state.');
        }
        if ((string)($stateDoc['status'] ?? '') === 'complete') {
            $renderPage('Shopify connected', 'This store is already connected.', true);
        }
        $expiresAt = (string)($stateDoc['expires_at'] ?? '');
        if ($expiresAt !== '') {
            try {
                if (new DateTimeImmutable($expiresAt) < new DateTimeImmutable('now')) {
                    $failState($stateDoc, $cfg, 'Authorization expired. Please try again.');
                }
            } catch (Throwable $e) {
                // Ignore unexpected date formats; continue.
            }
        }
        if ($code === '' || $shop === '') {
            $failState($stateDoc, $cfg, 'Missing shop or code.');
        }
        if ($shop !== shopifyNormalizeShop((string)($stateDoc['shop'] ?? ''))) {
            $failState($stateDoc, $cfg, 'Shop mismatch.');
        }

        $clientDoc = mongoFindOne($cfg, 'shopify_oauth_clients', [
            '_id' => parseObjectId((string)($stateDoc['oauth_client_id'] ?? '')),
            'user_id' => (string)($stateDoc['user_id'] ?? ''),
        ]);
        if (!is_array($clientDoc)) {
            $failState($stateDoc, $cfg, 'OAuth app not found.');
        }
        $clientId = (string)($clientDoc['client_id'] ?? '');
        $clientSecret = shopifyDecryptSecret($cfg, (string)($clientDoc['client_secret_enc'] ?? ''));
        if ($clientSecret === '') {
            $failState($stateDoc, $cfg, 'Stored client secret unavailable.');
        }
        if (!shopifyVerifyHmac($params, $clientSecret)) {
            $failState($stateDoc, $cfg, 'HMAC verification failed.');
        }

        try {
            $resp = shopifyHttpPostJson($cfg, 'https://' . $shop . '/admin/oauth/access_token', [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'code' => $code,
            ]);
        } catch (Throwable $e) {
            $failState($stateDoc, $cfg, 'Token exchange request failed: ' . $e->getMessage());
        }
        if (($resp['status'] ?? 0) < 200 || ($resp['status'] ?? 0) >= 300) {
            $shopifyErr = $resp['body']['error_description'] ?? ($resp['body']['error'] ?? ('HTTP ' . ($resp['status'] ?? 0)));
            $failState($stateDoc, $cfg, 'Token exchange rejected: ' . (is_string($shopifyErr) ? $shopifyErr : json_encode($shopifyErr)));
        }
        $accessToken = (string)($resp['body']['access_token'] ?? '');
        if ($accessToken === '') {
            $failState($stateDoc, $cfg, 'No access token returned from Shopify.');
        }

        $userId = (string)($stateDoc['user_id'] ?? '');
        $destinationId = (string)($stateDoc['destination_id'] ?? '');
        mongoUpdateOne($cfg, 'shopify_connections', [
            'user_id' => $userId,
            'shop' => $shop,
            'destination_id' => $destinationId,
        ], ['$set' => [
            'user_id' => $userId,
            'shop' => $shop,
            'destination_id' => $destinationId,
            'oauth_client_id' => (string)($stateDoc['oauth_client_id'] ?? ''),
            'access_token_enc' => shopifyEncryptSecret($cfg, $accessToken),
            'scope' => (string)($resp['body']['scope'] ?? ''),
            'api_version' => (string)($stateDoc['api_version'] ?? '2024-01'),
            'connected_at' => bgUtcNow(),
            'updated_at' => bgUtcNow(),
        ]], true);

        mongoUpdateOne($cfg, 'shopify_oauth_states', ['state' => $state], ['$set' => [
            'status' => 'complete',
            'shop' => $shop,
            'error' => '',
            'updated_at' => bgUtcNow(),
        ]]);

        $renderPage('Shopify connected', 'Your Shopify store is now connected.', true);
    }

    // All other Shopify routes require an authenticated app user.
    $jwtUser = requireJwtUser($cfg);
    $userId = (string)$jwtUser['uid'];

    if ($requestPath === '/shopify/oauth/clients' && $method === 'GET') {
        $docs = mongoFindMany($cfg, 'shopify_oauth_clients', ['user_id' => $userId], [
            'sort' => ['created_at' => -1],
            'limit' => 200,
        ]);
        respond(200, ['success' => true, 'clients' => array_map('shopifyMapClient', $docs)]);
    }

    if ($requestPath === '/shopify/oauth/clients' && $method === 'POST') {
        $body = readJsonBody();
        $id = trim((string)($body['id'] ?? ''));
        $name = trim((string)($body['name'] ?? ''));
        $clientId = trim((string)($body['clientId'] ?? ''));
        $clientSecret = (string)($body['clientSecret'] ?? '');
        if ($clientId === '') {
            respond(400, ['success' => false, 'error' => 'clientId is required']);
        }
        $now = bgUtcNow();
        $hasNewSecret = $clientSecret !== '' && $clientSecret !== '********';
        if ($id !== '') {
            $filter = ['_id' => parseObjectId($id), 'user_id' => $userId];
            $set = ['name' => $name, 'client_id' => $clientId, 'updated_at' => $now];
            if ($hasNewSecret) {
                $set['client_secret_enc'] = shopifyEncryptSecret($cfg, $clientSecret);
            }
            mongoUpdateOne($cfg, 'shopify_oauth_clients', $filter, ['$set' => $set]);
            $doc = mongoFindOne($cfg, 'shopify_oauth_clients', $filter);
        } else {
            $newId = mongoInsertOne($cfg, 'shopify_oauth_clients', [
                'user_id' => $userId,
                'name' => $name,
                'client_id' => $clientId,
                'client_secret_enc' => $hasNewSecret ? shopifyEncryptSecret($cfg, $clientSecret) : '',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $doc = mongoFindOne($cfg, 'shopify_oauth_clients', ['_id' => parseObjectId($newId)]);
        }
        if (!is_array($doc)) {
            respond(500, ['success' => false, 'error' => 'Failed to save OAuth app']);
        }
        respond(200, ['success' => true, 'client' => shopifyMapClient($doc)]);
    }

    if (preg_match('#^/shopify/oauth/clients/([a-fA-F0-9]{24})$#', $requestPath, $m) === 1 && $method === 'DELETE') {
        $deleted = mongoDeleteOne($cfg, 'shopify_oauth_clients', ['_id' => parseObjectId($m[1]), 'user_id' => $userId]);
        respond(200, ['success' => true, 'deleted' => $deleted > 0]);
    }

    if ($requestPath === '/shopify/oauth/start' && $method === 'POST') {
        $body = readJsonBody();
        $oauthClientId = trim((string)($body['oauthClientId'] ?? ''));
        $shop = shopifyNormalizeShop((string)($body['shop'] ?? ''));
        $destinationId = trim((string)($body['destinationId'] ?? ''));
        $apiVersion = trim((string)($body['apiVersion'] ?? '2024-01')) ?: '2024-01';
        $scope = trim((string)($body['scope'] ?? '')) ?: 'read_content,write_content,write_files';
        if ($oauthClientId === '' || $shop === '') {
            respond(400, ['success' => false, 'error' => 'oauthClientId and shop are required']);
        }
        $clientDoc = mongoFindOne($cfg, 'shopify_oauth_clients', [
            '_id' => parseObjectId($oauthClientId),
            'user_id' => $userId,
        ]);
        if (!is_array($clientDoc)) {
            respond(404, ['success' => false, 'error' => 'OAuth app not found']);
        }
        $clientId = (string)($clientDoc['client_id'] ?? '');
        if (shopifyDecryptSecret($cfg, (string)($clientDoc['client_secret_enc'] ?? '')) === '') {
            respond(400, ['success' => false, 'error' => 'Client secret is missing for this OAuth app. Re-enter it in Settings.']);
        }
        $state = bin2hex(random_bytes(16));
        $now = bgUtcNow();
        $expiresAtIso = (new DateTimeImmutable('now', new DateTimeZone('UTC')))
            ->modify('+10 minutes')->format(DateTimeInterface::ATOM);
        mongoInsertOne($cfg, 'shopify_oauth_states', [
            'state' => $state,
            'user_id' => $userId,
            'oauth_client_id' => $oauthClientId,
            'shop' => $shop,
            'destination_id' => $destinationId,
            'api_version' => $apiVersion,
            'status' => 'pending',
            'error' => '',
            'created_at' => $now,
            'updated_at' => $now,
            'expires_at' => toUtcDateTime($expiresAtIso),
        ]);
        // redirect_uri sent to Shopify = the caller's registered URL (e.g. the desktop's
        // http://localhost:3000/api/auth/shopify/callback). Falls back to config/server URL
        // for a future direct-HTTPS setup.
        $bodyRedirect = trim((string)($body['redirectUri'] ?? ''));
        $authorizeRedirectUri = $bodyRedirect !== '' ? $bodyRedirect : shopifyRedirectUrl($cfg);
        // The server's own callback, where the localhost listener 302-redirects so the
        // token exchange runs server-side.
        $serverCallbackUrl = shopifyRedirectUrl($cfg);
        $authorizeUrl = 'https://' . $shop . '/admin/oauth/authorize'
            . '?client_id=' . rawurlencode($clientId)
            . '&scope=' . rawurlencode($scope)
            . '&redirect_uri=' . rawurlencode($authorizeRedirectUri)
            . '&state=' . rawurlencode($state);
        respond(200, [
            'success' => true,
            'authorizeUrl' => $authorizeUrl,
            'state' => $state,
            'redirectUri' => $authorizeRedirectUri,
            'serverCallbackUrl' => $serverCallbackUrl,
        ]);
    }

    if ($requestPath === '/shopify/oauth/status' && $method === 'GET') {
        $state = trim((string)($_GET['state'] ?? ''));
        if ($state === '') {
            respond(400, ['success' => false, 'error' => 'state is required']);
        }
        $doc = mongoFindOne($cfg, 'shopify_oauth_states', ['state' => $state, 'user_id' => $userId]);
        if (!is_array($doc)) {
            respond(404, ['success' => false, 'error' => 'Unknown state']);
        }
        respond(200, [
            'success' => true,
            'status' => (string)($doc['status'] ?? 'pending'),
            'shop' => (string)($doc['shop'] ?? ''),
            'destinationId' => (string)($doc['destination_id'] ?? ''),
            'error' => (string)($doc['error'] ?? ''),
        ]);
    }

    // Publish proxy (Phase 2): create an article using the stored access token.
    // The desktop prepares the article payload (no secret) and optionally an image
    // attachment; the server uploads the image + creates the article.
    if ($requestPath === '/shopify/publish' && $method === 'POST') {
        $body = readJsonBody();
        $shop = shopifyNormalizeShop((string)($body['shop'] ?? ''));
        $destinationId = trim((string)($body['destinationId'] ?? ''));
        $apiVersion = trim((string)($body['apiVersion'] ?? '2024-01')) ?: '2024-01';
        $blogId = trim((string)($body['blogId'] ?? ''));
        $blogHandle = trim((string)($body['blogHandle'] ?? ''));
        $article = is_array($body['article'] ?? null) ? $body['article'] : [];
        $imageAttachment = is_array($body['imageAttachment'] ?? null) ? $body['imageAttachment'] : null;
        if ($shop === '' || $blogId === '' || empty($article)) {
            respond(400, ['success' => false, 'error' => 'shop, blogId and article are required']);
        }
        $accessToken = shopifyRequireAccessToken($cfg, $userId, $shop, $destinationId);

        // Optional: upload image binary to the Files API, then attach to the article.
        if (is_array($imageAttachment) && trim((string)($imageAttachment['attachment'] ?? '')) !== '') {
            try {
                $fileResp = shopifyApiRequest(
                    $cfg,
                    'POST',
                    'https://' . $shop . '/admin/api/' . $apiVersion . '/files.json',
                    $accessToken,
                    ['file' => [
                        'attachment' => (string)$imageAttachment['attachment'],
                        'filename' => (string)($imageAttachment['filename'] ?? 'blog-image.jpg'),
                        'mime_type' => (string)($imageAttachment['mime_type'] ?? 'image/jpeg'),
                    ]]
                );
                $fileUrl = (string)($fileResp['body']['file']['url'] ?? '');
                if ($fileUrl !== '' && empty($article['image'])) {
                    $article['image'] = ['src' => $fileUrl, 'alt' => (string)($article['title'] ?? '')];
                }
            } catch (Throwable $e) {
                // Non-fatal: publish without the uploaded image.
            }
        }

        $resp = shopifyApiRequest(
            $cfg,
            'POST',
            'https://' . $shop . '/admin/api/' . $apiVersion . '/blogs/' . rawurlencode($blogId) . '/articles.json',
            $accessToken,
            ['article' => $article]
        );
        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            $errors = $resp['body']['errors'] ?? 'Shopify article create failed';
            $errMsg = is_array($errors) ? json_encode($errors, JSON_UNESCAPED_SLASHES) : (string)$errors;
            respond(400, ['success' => false, 'error' => 'Shopify error: ' . $errMsg]);
        }
        $articleData = is_array($resp['body']['article'] ?? null) ? $resp['body']['article'] : [];
        $articleHandle = (string)($articleData['handle'] ?? '');
        $articleUrl = (string)($articleData['url'] ?? '');
        if ($articleUrl === '' && $articleHandle !== '') {
            if ($blogHandle === '') {
                try {
                    $blogResp = shopifyApiRequest(
                        $cfg,
                        'GET',
                        'https://' . $shop . '/admin/api/' . $apiVersion . '/blogs/' . rawurlencode($blogId) . '.json',
                        $accessToken
                    );
                    $blogHandle = (string)($blogResp['body']['blog']['handle'] ?? '');
                } catch (Throwable $e) {
                    // Ignore; URL stays empty.
                }
            }
            if ($blogHandle !== '') {
                $articleUrl = 'https://' . $shop . '/blogs/' . $blogHandle . '/' . $articleHandle;
            }
        }
        respond(200, ['success' => true, 'article' => [
            'id' => $articleData['id'] ?? null,
            'handle' => $articleHandle,
            'url' => $articleUrl,
        ]]);
    }

    // List blogs for the connected shop (used when configuring a destination).
    if ($requestPath === '/shopify/blogs' && $method === 'GET') {
        $shop = shopifyNormalizeShop((string)($_GET['shop'] ?? ''));
        $destinationId = trim((string)($_GET['destinationId'] ?? ''));
        $apiVersion = trim((string)($_GET['apiVersion'] ?? '2024-01')) ?: '2024-01';
        if ($shop === '') {
            respond(400, ['success' => false, 'error' => 'shop is required']);
        }
        $accessToken = shopifyRequireAccessToken($cfg, $userId, $shop, $destinationId);
        $resp = shopifyApiRequest($cfg, 'GET', 'https://' . $shop . '/admin/api/' . $apiVersion . '/blogs.json', $accessToken);
        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            $err = $resp['body']['errors'] ?? ('HTTP ' . $resp['status']);
            respond(400, ['success' => false, 'error' => 'Shopify blogs request failed: ' . (is_string($err) ? $err : json_encode($err))]);
        }
        respond(200, ['success' => true, 'blogs' => is_array($resp['body']['blogs'] ?? null) ? $resp['body']['blogs'] : []]);
    }

    // Create a new blog on the connected shop.
    if ($requestPath === '/shopify/blogs' && $method === 'POST') {
        $body = readJsonBody();
        $shop = shopifyNormalizeShop((string)($body['shop'] ?? ''));
        $destinationId = trim((string)($body['destinationId'] ?? ''));
        $apiVersion = trim((string)($body['apiVersion'] ?? '2024-01')) ?: '2024-01';
        $title = trim((string)($body['title'] ?? ''));
        if ($shop === '' || $title === '') {
            respond(400, ['success' => false, 'error' => 'shop and title are required']);
        }
        $accessToken = shopifyRequireAccessToken($cfg, $userId, $shop, $destinationId);
        $resp = shopifyApiRequest(
            $cfg,
            'POST',
            'https://' . $shop . '/admin/api/' . $apiVersion . '/blogs.json',
            $accessToken,
            ['blog' => ['title' => $title]]
        );
        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            $err = $resp['body']['errors'] ?? ('HTTP ' . $resp['status']);
            respond(400, ['success' => false, 'error' => 'Shopify create-blog failed: ' . (is_string($err) ? $err : json_encode($err))]);
        }
        respond(200, ['success' => true, 'blog' => is_array($resp['body']['blog'] ?? null) ? $resp['body']['blog'] : null]);
    }

    // Verify the connection (used by "Test destination").
    if ($requestPath === '/shopify/shop' && $method === 'GET') {
        $shop = shopifyNormalizeShop((string)($_GET['shop'] ?? ''));
        $destinationId = trim((string)($_GET['destinationId'] ?? ''));
        $apiVersion = trim((string)($_GET['apiVersion'] ?? '2024-01')) ?: '2024-01';
        if ($shop === '') {
            respond(400, ['success' => false, 'error' => 'shop is required']);
        }
        $accessToken = shopifyRequireAccessToken($cfg, $userId, $shop, $destinationId);
        $resp = shopifyApiRequest($cfg, 'GET', 'https://' . $shop . '/admin/api/' . $apiVersion . '/shop.json', $accessToken);
        if ($resp['status'] < 200 || $resp['status'] >= 300) {
            $err = $resp['body']['errors'] ?? ('HTTP ' . $resp['status']);
            respond(400, ['success' => false, 'error' => 'Shopify shop request failed: ' . (is_string($err) ? $err : json_encode($err))]);
        }
        respond(200, ['success' => true, 'shop' => is_array($resp['body']['shop'] ?? null) ? $resp['body']['shop'] : null]);
    }

    respond(404, ['success' => false, 'error' => 'Shopify route not found']);
}

respond(404, ['success' => false, 'error' => 'Route not found']);
