<?php

declare(strict_types=1);

use MongoDB\BSON\ObjectId;
use MongoDB\BSON\UTCDateTime;
use MongoDB\Driver\BulkWrite;

function bgUtcNow(): UTCDateTime
{
    return new UTCDateTime((int)(microtime(true) * 1000));
}

function bgToUtc($value): ?UTCDateTime
{
    if ($value === null || $value === '') {
        return null;
    }
    if ($value instanceof UTCDateTime) {
        return $value;
    }
    return toUtcDateTime((string)$value);
}

function bgDeleteMany(array $cfg, string $collection, array $filter): void
{
    $bulk = new BulkWrite();
    $bulk->delete($filter, ['limit' => 0]);
    mongoManager($cfg)->executeBulkWrite(mongoNamespace($cfg, $collection), $bulk);
}

function bgMapBlog(array $doc): array
{
    return [
        'id' => (string)($doc['_id'] ?? ''),
        'user_id' => $doc['user_id'] ?? null,
        'title' => (string)($doc['title'] ?? ''),
        'content' => (string)($doc['content'] ?? ''),
        'metaDescription' => (string)($doc['meta_description'] ?? ''),
        'keywords' => $doc['keywords'] ?? '',
        'categories' => is_array($doc['categories'] ?? null) ? $doc['categories'] : [],
        'imageUrl' => (string)($doc['image_url'] ?? ''),
        'imageGallery' => is_array($doc['image_gallery'] ?? null) ? $doc['image_gallery'] : [],
        'localImagePath' => (string)($doc['local_image_path'] ?? ''),
        'wordCount' => (int)($doc['word_count'] ?? 0),
        'seoScore' => (int)($doc['seo_score'] ?? 0),
        'language' => (string)($doc['language'] ?? 'en'),
        'cost' => (float)($doc['cost'] ?? 0),
        'generatedAt' => $doc['created_at'] ?? null,
        'updatedAt' => $doc['updated_at'] ?? null,
    ];
}

function bgMapUser(array $doc): array
{
    return [
        'id' => (string)($doc['_id'] ?? ''),
        'username' => (string)($doc['username'] ?? ''),
        'email' => (string)($doc['email'] ?? ''),
        'passwordHash' => (string)($doc['password_hash'] ?? ''),
        'passwordSalt' => (string)($doc['password_salt'] ?? ''),
        'role' => (string)($doc['role'] ?? 'user'),
        'status' => (string)($doc['status'] ?? 'active'),
        'permissions' => is_array($doc['permissions'] ?? null) ? $doc['permissions'] : [],
        'createdAt' => $doc['created_at'] ?? null,
        'lastOnlineAt' => $doc['last_online_at'] ?? null,
        'lastLoginAt' => $doc['last_login_at'] ?? null,
    ];
}

function bgBuildDateFilter(?string $from, ?string $to): ?array
{
    if (($from ?? '') === '' && ($to ?? '') === '') {
        return null;
    }
    $out = [];
    if (($from ?? '') !== '') {
        $out['$gte'] = bgToUtc($from);
    }
    if (($to ?? '') !== '') {
        $out['$lte'] = bgToUtc($to);
    }
    return $out;
}

function bgToLower(string $value): string
{
    if (function_exists('mb_strtolower')) {
        return mb_strtolower($value, 'UTF-8');
    }
    return strtolower($value);
}

function bgMatchText(string $search, array $fields, array $doc): bool
{
    $needle = bgToLower($search);
    foreach ($fields as $f) {
        $value = bgToLower((string)($doc[$f] ?? ''));
        if ($needle !== '' && str_contains($value, $needle)) {
            return true;
        }
    }
    return false;
}


function bgIsObjectIdString($value): bool
{
    if (!is_string($value)) {
        return false;
    }
    return preg_match('/^[a-fA-F0-9]{24}$/', $value) === 1;
}

function bgRemoteIdCandidates($value): array
{
    $id = trim((string)($value ?? ''));
    if ($id === '') {
        return [];
    }
    $candidates = [$id];
    if (preg_match('/^-?\d+$/', $id) === 1) {
        $candidates[] = (int)$id;
    }
    return array_values(array_unique($candidates, SORT_REGULAR));
}

function bgNormalizeTopics($topics): array
{
    if (is_array($topics)) {
        return array_values(array_filter(array_map(static fn($t) => trim((string)$t), $topics), static fn($t) => $t !== ''));
    }
    if (is_string($topics)) {
        $trimmed = trim($topics);
        if ($trimmed === '') {
            return [];
        }
        $decoded = json_decode($trimmed, true);
        if (is_array($decoded)) {
            return bgNormalizeTopics($decoded);
        }
        return array_values(array_filter(array_map('trim', explode(',', $trimmed)), static fn($t) => $t !== ''));
    }
    return [];
}

function bgIsoToMonth(?string $value): ?string
{
    if (!$value) {
        return null;
    }
    try {
        $dt = new DateTimeImmutable($value);
        return $dt->setTimezone(new DateTimeZone('UTC'))->format('Y-m');
    } catch (Throwable $e) {
        return null;
    }
}

function bgActionToLogCategory(string $action): string
{
    $prefix = strtolower(trim(explode('.', $action)[0] ?? ''));
    if ($prefix === '') {
        return 'activity';
    }
    $map = [
        'blog' => 'history',
        'auth' => 'auth',
        'admin' => 'admin',
        'logs' => 'logs',
        'posts' => 'posts',
        'settings' => 'settings',
        'scheduler' => 'scheduler',
        'notification' => 'notifications',
        'notifications' => 'notifications',
    ];
    return $map[$prefix] ?? $prefix;
}

function bgDbAction(array $cfg, string $action, array $args)
{
    switch ($action) {
        case 'initDb':
            mongoManager($cfg);
            return true;
        case 'closeDb':
            return true;

        case 'saveBlog': {
            $blog = is_array($args[0] ?? null) ? $args[0] : [];
            $userId = $args[1] ?? null;
            return mongoInsertOne($cfg, 'blogs', [
                'user_id' => $userId,
                'title' => (string)($blog['title'] ?? ''),
                'content' => (string)($blog['content'] ?? ''),
                'meta_description' => (string)($blog['metaDescription'] ?? ''),
                'keywords' => $blog['keywords'] ?? '',
                'categories' => $blog['categories'] ?? [],
                'image_url' => (string)($blog['imageUrl'] ?? ''),
                'image_gallery' => is_array($blog['imageGallery'] ?? null) ? $blog['imageGallery'] : [],
                'local_image_path' => (string)($blog['localImagePath'] ?? ($blog['local_image_path'] ?? '')),
                'word_count' => (int)($blog['wordCount'] ?? 0),
                'seo_score' => (int)($blog['seoScore'] ?? 0),
                'language' => (string)($blog['language'] ?? 'en'),
                'cost' => (float)($blog['cost'] ?? 0),
                'created_at' => bgUtcNow(),
                'updated_at' => bgUtcNow(),
            ]);
        }

        case 'getBlogs':
        case 'listBlogs': {
            $opt = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            $userId = $opt['userId'] ?? null;
            $isAdmin = (bool)($opt['isAdmin'] ?? false);
            if (!$isAdmin && $userId) {
                $filter['user_id'] = $userId;
            } elseif ($userId) {
                $filter['user_id'] = $userId;
            }
            $dateRange = bgBuildDateFilter($opt['dateFrom'] ?? null, $opt['dateTo'] ?? null);
            if (is_array($dateRange)) {
                $filter['created_at'] = $dateRange;
            }
            $docs = mongoFindMany($cfg, 'blogs', $filter, [
                'sort' => ['created_at' => -1],
                'skip' => (int)($opt['offset'] ?? 0),
                'limit' => (int)($opt['limit'] ?? 50),
            ]);
            $rows = array_map('bgMapBlog', $docs);
            $search = trim((string)($opt['search'] ?? ''));
            if ($search !== '') {
                $rows = array_values(array_filter($rows, static fn($row) => bgMatchText($search, ['title', 'keywords'], $row)));
            }
            return $rows;
        }

        
        case 'listBlogSummaries': {
            $opt = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            $userId = $opt['userId'] ?? null;
            $isAdmin = (bool)($opt['isAdmin'] ?? false);
            if (!$isAdmin && $userId) {
                $filter['user_id'] = $userId;
            } elseif ($userId) {
                $filter['user_id'] = $userId;
            }
            $dateRange = bgBuildDateFilter($opt['dateFrom'] ?? null, $opt['dateTo'] ?? null);
            if (is_array($dateRange)) {
                $filter['created_at'] = $dateRange;
            }

            $limit = max(1, min(5000, (int)($opt['limit'] ?? 1000)));
            $scanLimit = max($limit, min(25000, $limit * 5));
            $docs = mongoFindMany($cfg, 'blogs', $filter, [
                'sort' => ['created_at' => -1],
                'skip' => (int)($opt['offset'] ?? 0),
                'limit' => $scanLimit,
                'projection' => [
                    '_id' => 1,
                    'user_id' => 1,
                    'title' => 1,
                    'keywords' => 1,
                    'categories' => 1,
                    'created_at' => 1,
                ],
            ]);
            $rows = array_map(static function ($doc): array {
                return [
                    'id' => (string)($doc['_id'] ?? ''),
                    'user_id' => $doc['user_id'] ?? null,
                    'title' => (string)($doc['title'] ?? ''),
                    'keywords' => $doc['keywords'] ?? '',
                    'categories' => is_array($doc['categories'] ?? null) ? $doc['categories'] : [],
                    'generatedAt' => $doc['created_at'] ?? null,
                ];
            }, $docs);
            $search = trim((string)($opt['search'] ?? ''));
            if ($search !== '') {
                $rows = array_values(array_filter($rows, static fn($row) => bgMatchText($search, ['title', 'keywords'], $row)));
            }
            if (count($rows) > $limit) {
                $rows = array_slice($rows, 0, $limit);
            }
            return $rows;
        }

        case 'getBlogById': {
            $id = (string)($args[0] ?? '');
            $opt = is_array($args[1] ?? null) ? $args[1] : [];
            $filter = ['_id' => parseObjectId($id)];
            if (!(bool)($opt['isAdmin'] ?? false) && isset($opt['userId'])) {
                $filter['user_id'] = $opt['userId'];
            }
            $doc = mongoFindOne($cfg, 'blogs', $filter);
            return $doc ? bgMapBlog($doc) : null;
        }

        case 'getBlogsByIds': {
            $ids = is_array($args[0] ?? null) ? $args[0] : [];
            $opt = is_array($args[1] ?? null) ? $args[1] : [];
            $rows = [];
            foreach ($ids as $id) {
                $filter = ['_id' => parseObjectId((string)$id)];
                if (!(bool)($opt['isAdmin'] ?? false) && isset($opt['userId'])) {
                    $filter['user_id'] = $opt['userId'];
                }
                $doc = mongoFindOne($cfg, 'blogs', $filter);
                if ($doc) {
                    $rows[] = bgMapBlog($doc);
                }
            }
            return $rows;
        }

        case 'updateBlog': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $blog = is_array($payload['blog'] ?? null) ? $payload['blog'] : [];
            $filter = ['_id' => parseObjectId((string)($blog['id'] ?? ''))];
            if (!(bool)($payload['isAdmin'] ?? false) && isset($payload['userId'])) {
                $filter['user_id'] = $payload['userId'];
            }
            $set = ['updated_at' => bgUtcNow()];
            $fieldMap = [
                'title' => 'title',
                'content' => 'content',
                'metaDescription' => 'meta_description',
                'keywords' => 'keywords',
                'categories' => 'categories',
                'imageUrl' => 'image_url',
                'imageGallery' => 'image_gallery',
                'localImagePath' => 'local_image_path',
                'wordCount' => 'word_count',
                'seoScore' => 'seo_score',
                'language' => 'language',
                'cost' => 'cost',
            ];
            foreach ($fieldMap as $src => $dst) {
                if (array_key_exists($src, $blog)) {
                    $set[$dst] = $blog[$src];
                }
            }
            mongoUpdateOne($cfg, 'blogs', $filter, ['$set' => $set]);
            return true;
        }

        case 'deleteBlog': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = ['_id' => parseObjectId((string)($payload['id'] ?? ''))];
            if (!(bool)($payload['isAdmin'] ?? false) && isset($payload['userId'])) {
                $filter['user_id'] = $payload['userId'];
            }
            return mongoDeleteOne($cfg, 'blogs', $filter) > 0;
        }

        case 'clearBlogs': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = (bool)($payload['isAdmin'] ?? false) ? [] : ['user_id' => $payload['userId'] ?? null];
            bgDeleteMany($cfg, 'blogs', $filter);
            return true;
        }

        case 'getHistorySummary': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            if (!(bool)($payload['isAdmin'] ?? false) && isset($payload['userId'])) {
                $filter['user_id'] = $payload['userId'];
            }
            $docs = mongoFindMany($cfg, 'blogs', $filter, ['limit' => 20000]);
            $total = 0.0;
            foreach ($docs as $doc) {
                $total += (float)($doc['cost'] ?? 0);
            }
            return ['totalCount' => count($docs), 'totalCost' => $total];
        }

        case 'getUserByUsername': {
            $doc = mongoFindOne($cfg, 'users', ['username' => (string)($args[0] ?? '')]);
            return $doc ? bgMapUser($doc) : null;
        }

        case 'getUserById': {
            $doc = mongoFindOne($cfg, 'users', ['_id' => parseObjectId((string)($args[0] ?? ''))]);
            return $doc ? bgMapUser($doc) : null;
        }

        case 'createUser': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            return mongoInsertOne($cfg, 'users', [
                'username' => (string)($payload['username'] ?? ''),
                'email' => (string)($payload['email'] ?? ''),
                'password_hash' => (string)($payload['passwordHash'] ?? ''),
                'password_salt' => (string)($payload['passwordSalt'] ?? ''),
                'role' => (string)($payload['role'] ?? 'user'),
                'status' => (string)($payload['status'] ?? 'active'),
                'permissions' => is_array($payload['permissions'] ?? null) ? $payload['permissions'] : [],
                'created_at' => bgUtcNow(),
            ]);
        }

        case 'getUserCount':
            return mongoCount($cfg, 'users', []);

        case 'listUsers': {
            $docs = mongoFindMany($cfg, 'users', [], ['sort' => ['_id' => 1], 'limit' => 5000]);
            return array_map(static function ($doc) {
                $u = bgMapUser($doc);
                unset($u['passwordHash'], $u['passwordSalt']);
                return $u;
            }, $docs);
        }

        case 'updateUserAccess': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $set = [];
            foreach (['role', 'permissions', 'email', 'status'] as $field) {
                if (array_key_exists($field, $payload)) {
                    $set[$field] = $payload[$field];
                }
            }
            if ($set === []) return true;
            mongoUpdateOne($cfg, 'users', ['_id' => parseObjectId((string)($payload['id'] ?? ''))], ['$set' => $set]);
            return true;
        }
        case 'touchUserLastOnline': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $id = trim((string)($payload['id'] ?? ''));
            if ($id === '') {
                return false;
            }
            $now = bgUtcNow();
            mongoUpdateOne($cfg, 'users', ['_id' => parseObjectId($id)], ['$set' => [
                'last_online_at' => $now,
                'last_login_at' => $now,
                'updated_at' => $now,
            ]]);
            return true;
        }
        case 'deleteUser': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            return mongoDeleteOne($cfg, 'users', ['_id' => parseObjectId((string)($payload['id'] ?? ''))]);
        }

        case 'setSetting': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            mongoUpdateOne($cfg, 'settings', [
                'user_id' => $payload['userId'] ?? null,
                'key' => (string)($payload['key'] ?? ''),
            ], ['$set' => [
                'user_id' => $payload['userId'] ?? null,
                'key' => (string)($payload['key'] ?? ''),
                'value' => $payload['value'] ?? null,
                'updated_at' => bgUtcNow(),
            ]], true);
            return true;
        }

        case 'getSetting': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $doc = mongoFindOne($cfg, 'settings', [
                'user_id' => $payload['userId'] ?? null,
                'key' => (string)($payload['key'] ?? ''),
            ]);
            return $doc['value'] ?? null;
        }

        case 'getSettings': {
            $userId = $args[0] ?? null;
            $key = (string)($args[1] ?? '');
            $doc = mongoFindOne($cfg, 'settings', ['user_id' => $userId, 'key' => $key]);
            if (!$doc) return null;
            $value = $doc['value'] ?? null;
            if (is_string($value)) {
                $decoded = json_decode($value, true);
                return is_array($decoded) ? $decoded : $value;
            }
            return $value;
        }

        case 'saveSettings': {
            $userId = $args[0] ?? null;
            $key = (string)($args[1] ?? '');
            $value = $args[2] ?? null;
            mongoUpdateOne($cfg, 'settings', ['user_id' => $userId, 'key' => $key], ['$set' => [
                'user_id' => $userId,
                'key' => $key,
                'value' => is_string($value) ? $value : json_encode($value, JSON_UNESCAPED_SLASHES),
                'updated_at' => bgUtcNow(),
            ]], true);
            return true;
        }

        case 'logActivity': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $action = (string)($payload['action'] ?? '');
            $details = (string)($payload['details'] ?? '');
            $userId = $payload['userId'] ?? null;
            mongoInsertOne($cfg, 'activities', [
                'user_id' => $userId,
                'action' => $action,
                'details' => $details,
                'created_at' => bgUtcNow(),
            ]);
            mongoInsertOne($cfg, 'logs', [
                'timestamp' => bgUtcNow(),
                'level' => 'info',
                'category' => bgActionToLogCategory($action),
                'message' => $details !== '' ? $details : ($action !== '' ? $action : 'Activity'),
                'details' => json_encode(
                    ['source' => 'activity', 'action' => $action],
                    JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
                ),
                'blog_id' => null,
                'tokens_used' => null,
                'cost' => null,
                'user_id' => $userId,
            ]);
            return true;
        }

        case 'getActivities':
        case 'listActivities': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            if (!(bool)($payload['isAdmin'] ?? false) && isset($payload['userId'])) {
                $filter['user_id'] = $payload['userId'];
            }
            $activities = mongoFindMany($cfg, 'activities', $filter, [
                'sort' => ['created_at' => -1],
                'limit' => (int)($payload['limit'] ?? 50),
            ]);
            $users = mongoFindMany($cfg, 'users', [], ['limit' => 5000]);
            $userMap = [];
            foreach ($users as $u) {
                $userMap[(string)$u['_id']] = (string)($u['username'] ?? 'System');
            }
            return array_map(static function ($doc) use ($userMap) {
                $uid = (string)($doc['user_id'] ?? '');
                return [
                    'id' => (string)($doc['_id'] ?? ''),
                    'userId' => $uid,
                    'username' => $userMap[$uid] ?? 'System',
                    'action' => (string)($doc['action'] ?? ''),
                    'details' => (string)($doc['details'] ?? ''),
                    'createdAt' => $doc['created_at'] ?? null,
                ];
            }, $activities);
        }

        case 'addLog': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            mongoInsertOne($cfg, 'logs', [
                'timestamp' => bgUtcNow(),
                'level' => (string)($payload['level'] ?? 'info'),
                'category' => (string)($payload['category'] ?? 'general'),
                'message' => (string)($payload['message'] ?? ''),
                'details' => isset($payload['details'])
                    ? json_encode($payload['details'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
                    : null,
                'blog_id' => $payload['blogId'] ?? null,
                'tokens_used' => isset($payload['tokensUsed']) ? (int)$payload['tokensUsed'] : null,
                'cost' => isset($payload['cost']) ? (float)$payload['cost'] : null,
                'user_id' => $payload['userId'] ?? null,
            ]);
            return true;
        }

        case 'listLogs': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            if (!(bool)($payload['isAdmin'] ?? false) && isset($payload['userId'])) {
                $filter['user_id'] = $payload['userId'];
            }
            if (!empty($payload['level'])) $filter['level'] = $payload['level'];
            if (!empty($payload['category'])) $filter['category'] = $payload['category'];
            $dateRange = bgBuildDateFilter($payload['dateFrom'] ?? null, $payload['dateTo'] ?? null);
            if (is_array($dateRange)) {
                $filter['timestamp'] = $dateRange;
            }
            $docs = mongoFindMany($cfg, 'logs', $filter, [
                'sort' => ['timestamp' => -1],
                'skip' => (int)($payload['offset'] ?? 0),
                'limit' => (int)($payload['limit'] ?? 100),
            ]);
            $rows = array_map(static function ($doc) {
                $details = $doc['details'] ?? null;
                $parsed = is_string($details) ? json_decode($details, true) : null;
                return [
                    'id' => (string)($doc['_id'] ?? ''),
                    'timestamp' => $doc['timestamp'] ?? null,
                    'level' => (string)($doc['level'] ?? ''),
                    'category' => (string)($doc['category'] ?? ''),
                    'message' => (string)($doc['message'] ?? ''),
                    'details' => $details,
                    'blogId' => $doc['blog_id'] ?? ($parsed['blogId'] ?? null),
                    'tokensUsed' => $doc['tokens_used'] ?? ($parsed['tokensUsed'] ?? null),
                    'cost' => $doc['cost'] ?? ($parsed['cost'] ?? null),
                    'userId' => $doc['user_id'] ?? null,
                ];
            }, $docs);
            $search = trim((string)($payload['search'] ?? ''));
            if ($search !== '') {
                $rows = array_values(array_filter($rows, static fn($r) => bgMatchText($search, ['message', 'blogId'], $r)));
            }
            return $rows;
        }

        case 'getLogStats': {
            $rows = bgDbAction($cfg, 'listLogs', [$args[0] ?? []]);
            $out = ['total' => count($rows), 'errors' => 0, 'totalTokens' => 0, 'totalCost' => 0.0, 'imageCount' => 0];
            foreach ($rows as $r) {
                if (($r['level'] ?? '') === 'error') $out['errors']++;
                if (($r['category'] ?? '') === 'image') $out['imageCount']++;
                $out['totalTokens'] += (int)($r['tokensUsed'] ?? 0);
                $out['totalCost'] += (float)($r['cost'] ?? 0);
            }
            return $out;
        }

        case 'getLogTrend': {
            $rows = bgDbAction($cfg, 'listLogs', [$args[0] ?? []]);
            $buckets = [];
            foreach ($rows as $r) {
                $day = substr((string)($r['timestamp'] ?? ''), 0, 10);
                if ($day === '') continue;
                if (!isset($buckets[$day])) {
                    $buckets[$day] = ['date' => $day, 'count' => 0, 'totalTokens' => 0, 'totalCost' => 0.0, 'imageCount' => 0];
                }
                $buckets[$day]['count']++;
                $buckets[$day]['totalTokens'] += (int)($r['tokensUsed'] ?? 0);
                $buckets[$day]['totalCost'] += (float)($r['cost'] ?? 0);
                if (($r['category'] ?? '') === 'image') $buckets[$day]['imageCount']++;
            }
            ksort($buckets);
            return array_values($buckets);
        }

        case 'clearLogs': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = (bool)($payload['isAdmin'] ?? false) ? [] : ['user_id' => $payload['userId'] ?? null];
            bgDeleteMany($cfg, 'logs', $filter);
            return true;
        }

        case 'addNotification': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            return mongoInsertOne($cfg, 'notifications', [
                'user_id' => $payload['userId'] ?? null,
                'type' => (string)($payload['type'] ?? 'info'),
                'message' => (string)($payload['message'] ?? ''),
                'is_read' => false,
                'created_at' => bgUtcNow(),
            ]);
        }

        case 'listNotifications': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            if (!(bool)($payload['isAdmin'] ?? false) && isset($payload['userId'])) {
                $filter['user_id'] = $payload['userId'];
            }
            $docs = mongoFindMany($cfg, 'notifications', $filter, [
                'sort' => ['created_at' => -1],
                'limit' => (int)($payload['limit'] ?? 100),
            ]);
            return array_map(static function ($doc) {
                return [
                    'id' => (string)($doc['_id'] ?? ''),
                    'userId' => $doc['user_id'] ?? null,
                    'type' => (string)($doc['type'] ?? ''),
                    'message' => (string)($doc['message'] ?? ''),
                    'isRead' => (bool)($doc['is_read'] ?? false),
                    'createdAt' => $doc['created_at'] ?? null,
                ];
            }, $docs);
        }

        case 'markNotificationRead': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = ['_id' => parseObjectId((string)($payload['id'] ?? ''))];
            if (!(bool)($payload['isAdmin'] ?? false) && isset($payload['userId'])) {
                $filter['user_id'] = $payload['userId'];
            }
            mongoUpdateOne($cfg, 'notifications', $filter, ['$set' => ['is_read' => true]]);
            return true;
        }

        case 'clearNotifications': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = (bool)($payload['isAdmin'] ?? false) ? [] : ['user_id' => $payload['userId'] ?? null];
            bgDeleteMany($cfg, 'notifications', $filter);
            return true;
        }

        case 'updateApiUsage':
        case 'trackApiUsage': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $dayStart = new DateTimeImmutable('today', new DateTimeZone('UTC'));
            $dayUtc = new UTCDateTime(((int)$dayStart->format('U')) * 1000);
            mongoUpdateOne($cfg, 'api_usage', ['user_id' => $payload['userId'] ?? null, 'date' => $dayUtc], [
                '$inc' => [
                    'blogs_generated' => 1,
                    'total_cost' => (float)($payload['cost'] ?? 0),
                    'total_tokens' => (int)($payload['tokens'] ?? 0),
                ],
                '$setOnInsert' => ['user_id' => $payload['userId'] ?? null, 'date' => $dayUtc],
            ], true);
            return true;
        }

        case 'getApiUsage': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            if (!(bool)($payload['isAdmin'] ?? false) && isset($payload['userId'])) {
                $filter['user_id'] = $payload['userId'];
            }
            $range = bgBuildDateFilter($payload['dateFrom'] ?? null, $payload['dateTo'] ?? null);
            if (is_array($range)) {
                $filter['date'] = $range;
            }
            $docs = mongoFindMany($cfg, 'api_usage', $filter, ['limit' => 5000]);
            $out = ['date' => null, 'blogsGenerated' => 0, 'totalCost' => 0.0, 'totalTokens' => 0];
            foreach ($docs as $d) {
                $out['blogsGenerated'] += (int)($d['blogs_generated'] ?? 0);
                $out['totalCost'] += (float)($d['total_cost'] ?? 0);
                $out['totalTokens'] += (int)($d['total_tokens'] ?? 0);
            }
            return $out;
        }

        case 'addPublishHistory':
        case 'recordPublishHistory': {
            $entry = is_array($args[0] ?? null) ? $args[0] : [];
            return mongoInsertOne($cfg, 'publish_history', [
                'blog_id' => $entry['blogId'] ?? null,
                'remote_post_id' => $entry['remotePostId'] ?? null,
                'destination_id' => $entry['destinationId'] ?? null,
                'destination_name' => $entry['destinationName'] ?? '',
                'platform' => $entry['platform'] ?? '',
                'status' => $entry['status'] ?? '',
                'published_url' => $entry['publishedUrl'] ?? '',
                'published_at' => bgToUtc($entry['publishedAt'] ?? null) ?? bgUtcNow(),
                'user_id' => $entry['userId'] ?? null,
            ]);
        }

        case 'getPublishHistoryByBlog': {
            $blogId = (string)($args[0] ?? '');
            $docs = mongoFindMany($cfg, 'publish_history', ['blog_id' => $blogId], ['sort' => ['published_at' => -1], 'limit' => 500]);
            return array_map(static function ($doc) {
                return [
                    'id' => (string)($doc['_id'] ?? ''),
                    'blogId' => $doc['blog_id'] ?? null,
                    'remotePostId' => $doc['remote_post_id'] ?? null,
                    'destinationId' => $doc['destination_id'] ?? null,
                    'destinationName' => $doc['destination_name'] ?? '',
                    'platform' => $doc['platform'] ?? '',
                    'status' => $doc['status'] ?? '',
                    'publishedUrl' => $doc['published_url'] ?? '',
                    'publishedAt' => $doc['published_at'] ?? null,
                    'userId' => $doc['user_id'] ?? null,
                ];
            }, $docs);
        }

        case 'getPublishHistory': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            if (!empty($payload['userId'])) $filter['user_id'] = $payload['userId'];
            if (!empty($payload['platform'])) $filter['platform'] = $payload['platform'];
            if (!empty($payload['status'])) $filter['status'] = $payload['status'];
            if (!empty($payload['destinationId'])) $filter['destination_id'] = $payload['destinationId'];
            $range = bgBuildDateFilter($payload['dateFrom'] ?? null, $payload['dateTo'] ?? null);
            if (is_array($range)) $filter['published_at'] = $range;
            $docs = mongoFindMany($cfg, 'publish_history', $filter, [
                'sort' => ['published_at' => -1],
                'skip' => (int)($payload['offset'] ?? 0),
                'limit' => (int)($payload['limit'] ?? 100),
            ]);
            return array_map(static function ($doc) {
                return [
                    'id' => (string)($doc['_id'] ?? ''),
                    'blog_id' => $doc['blog_id'] ?? null,
                    'remote_post_id' => $doc['remote_post_id'] ?? null,
                    'destination_id' => $doc['destination_id'] ?? null,
                    'destination_name' => $doc['destination_name'] ?? '',
                    'platform' => $doc['platform'] ?? '',
                    'status' => $doc['status'] ?? '',
                    'published_url' => $doc['published_url'] ?? '',
                    'published_at' => $doc['published_at'] ?? null,
                    'user_id' => $doc['user_id'] ?? null,
                ];
            }, $docs);
        }

        case 'getPublishAnalytics':
        {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $historyFilter = [];
            if (!empty($payload['userId'])) {
                $historyFilter['user_id'] = $payload['userId'];
            }
            if (!empty($payload['destinationId'])) {
                $historyFilter['destination_id'] = $payload['destinationId'];
            }
            $range = bgBuildDateFilter($payload['dateFrom'] ?? null, $payload['dateTo'] ?? null);
            if (is_array($range)) {
                $historyFilter['published_at'] = $range;
            }

            $historyRows = mongoFindMany($cfg, 'publish_history', $historyFilter, [
                'sort' => ['published_at' => -1],
                'limit' => 5000,
            ]);

            $remotePosts = bgDbAction($cfg, 'listRemotePosts', [[
                'limit' => 1000,
                'destinationId' => $payload['destinationId'] ?? null,
            ]]);
            $remoteMap = [];
            $totalTimeSpent = 0;
            foreach ($remotePosts as $post) {
                $remoteMap[(string)($post['id'] ?? '')] = $post;
                $totalTimeSpent += (int)($post['timeSpent'] ?? 0);
            }
            $useRemoteStats = count($remotePosts) > 0;

            $totalPublished = 0;
            $totalDrafts = 0;
            $totalViews = 0;
            if ($useRemoteStats) {
                foreach ($remotePosts as $post) {
                    $status = (string)($post['status'] ?? '');
                    if ($status === 'publish') {
                        $totalPublished++;
                    }
                    if ($status === 'draft') {
                        $totalDrafts++;
                    }
                    $totalViews += (int)($post['views'] ?? 0);
                }
            } else {
                foreach ($historyRows as $row) {
                    $status = (string)($row['status'] ?? '');
                    if ($status === 'publish') {
                        $totalPublished++;
                    }
                    if ($status === 'draft') {
                        $totalDrafts++;
                    }
                    $remote = $remoteMap[(string)($row['remote_post_id'] ?? '')] ?? null;
                    $totalViews += (int)($remote['views'] ?? 0);
                }
            }

            $publishedByMonth = [];
            if ($useRemoteStats) {
                foreach ($remotePosts as $post) {
                    $month = bgIsoToMonth((string)($post['publishedAt'] ?? $post['createdAt'] ?? $post['updatedAt'] ?? ''));
                    if (!$month) {
                        continue;
                    }
                    if (!isset($publishedByMonth[$month])) {
                        $publishedByMonth[$month] = ['month' => $month, 'count' => 0, 'views' => 0];
                    }
                    $publishedByMonth[$month]['count']++;
                    $publishedByMonth[$month]['views'] += (int)($post['views'] ?? 0);
                }
            } else {
                foreach ($historyRows as $row) {
                    $month = bgIsoToMonth((string)($row['published_at'] ?? ''));
                    if (!$month) {
                        continue;
                    }
                    if (!isset($publishedByMonth[$month])) {
                        $publishedByMonth[$month] = ['month' => $month, 'count' => 0, 'views' => 0];
                    }
                    $publishedByMonth[$month]['count']++;
                    $remote = $remoteMap[(string)($row['remote_post_id'] ?? '')] ?? null;
                    $publishedByMonth[$month]['views'] += (int)($remote['views'] ?? 0);
                }
            }
            ksort($publishedByMonth);

            $byPlatform = [];
            if ($useRemoteStats) {
                foreach ($remotePosts as $post) {
                    $platform = (string)($post['provider'] ?? 'unknown');
                    if (!isset($byPlatform[$platform])) {
                        $byPlatform[$platform] = ['platform' => $platform, 'count' => 0, 'views' => 0];
                    }
                    $byPlatform[$platform]['count']++;
                    $byPlatform[$platform]['views'] += (int)($post['views'] ?? 0);
                }
            } else {
                foreach ($historyRows as $row) {
                    $platform = (string)($row['platform'] ?? 'unknown');
                    if (!isset($byPlatform[$platform])) {
                        $byPlatform[$platform] = ['platform' => $platform, 'count' => 0, 'views' => 0];
                    }
                    $byPlatform[$platform]['count']++;
                    $remote = $remoteMap[(string)($row['remote_post_id'] ?? '')] ?? null;
                    $byPlatform[$platform]['views'] += (int)($remote['views'] ?? 0);
                }
            }
            uasort($byPlatform, static fn($a, $b) => (int)$b['count'] <=> (int)$a['count']);

            $topicViews = [];
            $topicCounts = [];
            foreach ($remotePosts as $post) {
                $topics = bgNormalizeTopics($post['topics'] ?? []);
                foreach ($topics as $topic) {
                    $key = bgToLower($topic);
                    $topicViews[$key] = (int)($topicViews[$key] ?? 0) + (int)($post['views'] ?? 0);
                    $topicCounts[$key] = (int)($topicCounts[$key] ?? 0) + 1;
                }
            }
            arsort($topicViews);
            $topTopics = [];
            foreach ($topicViews as $topic => $totalTopicViews) {
                $count = (int)($topicCounts[$topic] ?? 0);
                $topTopics[] = [
                    'topic' => $topic,
                    'totalViews' => $totalTopicViews,
                    'postCount' => $count,
                    'avgViews' => $count > 0 ? (int)round($totalTopicViews / $count) : 0,
                ];
                if (count($topTopics) >= 10) {
                    break;
                }
            }

            $topPosts = array_values(array_filter($remotePosts, static fn($p) => isset($p['views']) && is_numeric($p['views'])));
            usort($topPosts, static fn($a, $b) => (int)($b['views'] ?? 0) <=> (int)($a['views'] ?? 0));
            $topPosts = array_slice(array_map(static function ($p) {
                return [
                    'id' => $p['id'] ?? null,
                    'title' => $p['title'] ?? '',
                    'views' => (int)($p['views'] ?? 0),
                    'publishedAt' => $p['publishedAt'] ?? null,
                    'url' => $p['url'] ?? null,
                    'status' => $p['status'] ?? '',
                ];
            }, $topPosts), 0, 10);

            $recentPublishes = [];
            foreach (array_slice($historyRows, 0, 10) as $row) {
                $recentPublishes[] = [
                    'id' => (string)($row['_id'] ?? ''),
                    'blogId' => $row['blog_id'] ?? null,
                    'destinationName' => $row['destination_name'] ?? '',
                    'platform' => $row['platform'] ?? '',
                    'status' => $row['status'] ?? '',
                    'publishedAt' => $row['published_at'] ?? null,
                    'publishedUrl' => $row['published_url'] ?? '',
                ];
            }

            $remotePostCount = count($remotePosts);
            return [
                'summary' => [
                    'totalPublished' => $totalPublished,
                    'totalDrafts' => $totalDrafts,
                    'totalViews' => $totalViews,
                    'avgViewsPerPost' => $remotePostCount > 0 ? (int)round($totalViews / $remotePostCount) : 0,
                    'totalTimeSpentSeconds' => $totalTimeSpent,
                    'avgTimePerPostSeconds' => $remotePostCount > 0 ? (int)round($totalTimeSpent / $remotePostCount) : 0,
                ],
                'publishedByMonth' => array_values($publishedByMonth),
                'byPlatform' => array_values($byPlatform),
                'topTopics' => $topTopics,
                'topPosts' => $topPosts,
                'recentPublishes' => $recentPublishes,
            ];
        }

        case 'upsertRemotePosts': {
            $posts = is_array($args[0] ?? null) ? $args[0] : [];
            $provider = trim((string)($args[1] ?? 'wordpress')) ?: 'wordpress';
            foreach ($posts as $post) {
                if (!is_array($post)) {
                    continue;
                }
                $id = trim((string)($post['id'] ?? ''));
                if ($id === '') {
                    continue;
                }

                $set = [
                    'id' => $id,
                    'provider' => $provider,
                    'destination_id' => $post['destination_id'] ?? null,
                    'title' => (string)($post['title'] ?? ''),
                    'status' => (string)($post['status'] ?? ''),
                    'url' => $post['url'] ?? null,
                    'created_at' => bgToUtc($post['created_at'] ?? null),
                    'updated_at' => bgToUtc($post['updated_at'] ?? null),
                    'published_at' => bgToUtc($post['published_at'] ?? null),
                    'views' => isset($post['views']) ? (int)$post['views'] : 0,
                    'last_viewed' => bgToUtc($post['last_viewed'] ?? null),
                    'time_spent' => isset($post['time_spent']) && $post['time_spent'] !== null ? (int)$post['time_spent'] : null,
                    'topics' => bgNormalizeTopics($post['topics'] ?? []),
                    'synced_at' => bgUtcNow(),
                ];

                mongoUpdateOne(
                    $cfg,
                    'remote_posts',
                    ['id' => $id, 'provider' => $provider],
                    ['$set' => $set],
                    true
                );
            }
            return true;
        }

        case 'replaceRemotePosts': {
            $posts = is_array($args[0] ?? null) ? $args[0] : [];
            $provider = trim((string)($args[1] ?? 'wordpress')) ?: 'wordpress';
            $destinationId = $args[2] ?? null;
            if ($destinationId !== null && $destinationId !== '') {
                bgDeleteMany($cfg, 'remote_posts', [
                    'provider' => $provider,
                    'destination_id' => $destinationId,
                ]);
            }
            return bgDbAction($cfg, 'upsertRemotePosts', [$posts, $provider]);
        }

        case 'deleteRemotePost': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $id = trim((string)($payload['id'] ?? ''));
            if ($id === '') {
                return true;
            }
            $candidates = bgRemoteIdCandidates($id);
            $filter = count($candidates) > 1 ? ['id' => ['$in' => $candidates]] : ['id' => $id];
            if (!empty($payload['provider'])) {
                $filter['provider'] = (string)$payload['provider'];
            }
            if (!empty($payload['destinationId'])) {
                $filter['destination_id'] = $payload['destinationId'];
            }
            return mongoDeleteOne($cfg, 'remote_posts', $filter) > 0;
        }

        case 'listRemotePosts': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $filter = [];
            if (!empty($payload['status'])) {
                $filter['status'] = (string)$payload['status'];
            }
            if (!empty($payload['destinationId'])) {
                $filter['destination_id'] = $payload['destinationId'];
            }
            $docs = mongoFindMany($cfg, 'remote_posts', $filter, [
                'sort' => ['synced_at' => -1],
                'limit' => (int)($payload['limit'] ?? 200),
            ]);
            return array_map(static function ($doc) {
                return [
                    'id' => $doc['id'] ?? null,
                    'provider' => $doc['provider'] ?? '',
                    'destinationId' => $doc['destination_id'] ?? null,
                    'title' => $doc['title'] ?? '',
                    'status' => $doc['status'] ?? '',
                    'url' => $doc['url'] ?? null,
                    'createdAt' => $doc['created_at'] ?? null,
                    'updatedAt' => $doc['updated_at'] ?? null,
                    'publishedAt' => $doc['published_at'] ?? null,
                    'views' => isset($doc['views']) && is_numeric($doc['views']) ? (int)$doc['views'] : null,
                    'lastViewed' => $doc['last_viewed'] ?? null,
                    'timeSpent' => isset($doc['time_spent']) && is_numeric($doc['time_spent']) ? (int)$doc['time_spent'] : null,
                    'topics' => bgNormalizeTopics($doc['topics'] ?? []),
                    'syncedAt' => $doc['synced_at'] ?? null,
                ];
            }, $docs);
        }

        case 'getBlogForRemotePost': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $remotePostId = trim((string)($payload['remotePostId'] ?? ''));
            if ($remotePostId === '') {
                return null;
            }
            $idCandidates = bgRemoteIdCandidates($remotePostId);
            $filter = count($idCandidates) > 1 ? ['remote_post_id' => ['$in' => $idCandidates]] : ['remote_post_id' => $remotePostId];
            if (!empty($payload['destinationId'])) {
                $filter['destination_id'] = $payload['destinationId'];
            }
            $rows = mongoFindMany($cfg, 'publish_history', $filter, [
                'sort' => ['published_at' => -1],
                'limit' => 1,
            ]);
            $blogId = (string)($rows[0]['blog_id'] ?? '');
            if ($blogId === '' || !bgIsObjectIdString($blogId)) {
                return null;
            }
            $doc = mongoFindOne($cfg, 'blogs', ['_id' => parseObjectId($blogId)]);
            return $doc ? bgMapBlog($doc) : null;
        }

        case 'getRemotePostAnalytics': {
            $posts = bgDbAction($cfg, 'listRemotePosts', [[
                'limit' => 10000,
            ]]);
            $totalPosts = count($posts);
            $totalPublished = 0;
            $totalDrafts = 0;
            $totalViews = 0;
            foreach ($posts as $post) {
                $status = (string)($post['status'] ?? '');
                if ($status === 'publish') {
                    $totalPublished++;
                }
                if ($status === 'draft') {
                    $totalDrafts++;
                }
                $totalViews += (int)($post['views'] ?? 0);
            }
            return [
                'summary' => [
                    'totalPosts' => $totalPosts,
                    'totalPublished' => $totalPublished,
                    'totalDrafts' => $totalDrafts,
                    'totalViews' => $totalViews,
                    'avgViewsPerPost' => $totalPosts > 0 ? (int)round($totalViews / $totalPosts) : 0,
                ],
            ];
        }

        case 'logAnalyticsEvent': {
            $event = is_array($args[0] ?? null) ? $args[0] : [];
            mongoInsertOne($cfg, 'events', [
                'session_id' => $event['session_id'] ?? null,
                'user_id' => $event['user_id'] ?? null,
                'event' => (string)($event['event'] ?? ''),
                'props' => is_array($event['props'] ?? null) ? $event['props'] : [],
                'screen_name' => $event['screen_name'] ?? null,
                'created_at' => bgToUtc($event['created_at'] ?? null) ?? bgUtcNow(),
            ]);
            return true;
        }

        case 'upsertSession': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $sessionId = trim((string)($payload['sessionId'] ?? ''));
            if ($sessionId === '') {
                return true;
            }
            $now = bgUtcNow();
            mongoUpdateOne(
                $cfg,
                'sessions',
                ['session_id' => $sessionId],
                [
                    '$setOnInsert' => [
                        'session_id' => $sessionId,
                        'started_at' => $now,
                        'first_touch' => $payload['firstTouch'] ?? null,
                    ],
                    '$set' => [
                        'user_id' => $payload['userId'] ?? null,
                        'last_touch' => $payload['lastTouch'] ?? null,
                        'landing' => $payload['landing'] ?? null,
                        'device' => $payload['device'] ?? null,
                        'last_seen' => $now,
                    ],
                ],
                true
            );
            return true;
        }

        case 'heartbeatSession': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $sessionId = trim((string)($payload['sessionId'] ?? ''));
            if ($sessionId === '') {
                return true;
            }
            mongoUpdateOne($cfg, 'sessions', ['session_id' => $sessionId], [
                '$set' => ['last_seen' => bgUtcNow()],
            ]);
            return true;
        }

        case 'endSession': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $sessionId = trim((string)($payload['sessionId'] ?? ''));
            if ($sessionId === '') {
                return true;
            }
            $session = mongoFindOne($cfg, 'sessions', ['session_id' => $sessionId]);
            if (!$session) {
                return true;
            }
            $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
            $startedAtRaw = (string)($session['started_at'] ?? '');
            $duration = 0;
            if ($startedAtRaw !== '') {
                try {
                    $startedAt = new DateTimeImmutable($startedAtRaw);
                    $duration = max(0, $now->getTimestamp() - $startedAt->getTimestamp());
                } catch (Throwable $e) {
                    $duration = 0;
                }
            }
            mongoUpdateOne($cfg, 'sessions', ['session_id' => $sessionId], [
                '$set' => [
                    'ended_at' => bgUtcNow(),
                    'duration_sec' => $duration,
                    'last_seen' => bgUtcNow(),
                ],
            ]);
            return true;
        }

        case 'getRealtimeAnalytics': {
            $payload = is_array($args[0] ?? null) ? $args[0] : [];
            $windowMinutes = (int)($payload['windowMinutes'] ?? 10);
            if ($windowMinutes < 1) {
                $windowMinutes = 1;
            }
            $nowMs = (int)(microtime(true) * 1000);
            $since = new UTCDateTime($nowMs - ($windowMinutes * 60 * 1000));
            $activeSince = new UTCDateTime($nowMs - 60000);

            $recentEvents = mongoFindMany($cfg, 'events', ['created_at' => ['$gte' => $since]], [
                'limit' => 5000,
            ]);
            $activeSessions = mongoFindMany($cfg, 'sessions', ['last_seen' => ['$gte' => $activeSince]], [
                'limit' => 5000,
            ]);

            $screenCounts = [];
            $liveConversions = 0;
            $liveErrors = 0;
            foreach ($recentEvents as $event) {
                $name = (string)($event['event'] ?? '');
                $screen = (string)($event['screen_name'] ?? '');
                if ($name === 'screen_view' && $screen !== '') {
                    $screenCounts[$screen] = (int)($screenCounts[$screen] ?? 0) + 1;
                }
                if (in_array($name, ['purchase', 'subscription_start', 'signup_complete'], true)) {
                    $liveConversions++;
                }
                if ($name === 'error') {
                    $liveErrors++;
                }
            }

            $topScreens = [];
            arsort($screenCounts);
            foreach ($screenCounts as $screen => $count) {
                $topScreens[] = ['screen' => $screen, 'count' => $count];
                if (count($topScreens) >= 5) {
                    break;
                }
            }

            return [
                'activeUsers' => count($activeSessions),
                'activeSessions' => count($activeSessions),
                'topScreens' => $topScreens,
                'liveConversions' => $liveConversions,
                'liveErrors' => $liveErrors,
                'windowMinutes' => $windowMinutes,
            ];
        }

        default:
            throw new RuntimeException('Unsupported db action: ' . $action);
    }
}



