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
    $userId = (string)$jwtUser['uid'];

    if ($requestPath === '/scheduler/jobs' && $method === 'GET') {
        $status = trim((string)($_GET['status'] ?? ''));
        $shopId = trim((string)($_GET['shopId'] ?? ''));

        $filter = ['user_id' => $userId];
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
            'user_id' => $userId,
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
                $current = mongoFindOne($cfg, 'scheduler_jobs', ['_id' => parseObjectId($jobId), 'user_id' => $userId]);
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
                ['_id' => parseObjectId($jobId), 'user_id' => $userId],
                ['$set' => $set]
            );

            $job = mongoFindOne($cfg, 'scheduler_jobs', ['_id' => parseObjectId($jobId), 'user_id' => $userId]);
            respond(200, ['success' => true, 'job' => $job]);
        }

        if ($method === 'DELETE') {
            $deleted = mongoDeleteOne($cfg, 'scheduler_jobs', ['_id' => parseObjectId($jobId), 'user_id' => $userId]);
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
                    'user_id' => $userId,
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
        $filter = ['user_id' => $userId];
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
            'user_id' => $userId,
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

respond(404, ['success' => false, 'error' => 'Route not found']);
