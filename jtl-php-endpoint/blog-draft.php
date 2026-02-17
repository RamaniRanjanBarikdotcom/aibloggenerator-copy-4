<?php declare(strict_types=1);

// Standalone endpoint for JTL servers without a plugin.
// Update DB credentials and run the table creation SQL once.

$dsn = 'mysql:host=localhost;dbname=your_db;charset=utf8mb4';
$dbUser = 'your_user';
$dbPass = 'your_password';
$expectedToken = 'CHANGE_ME_TOKEN';

header('Content-Type: application/json; charset=utf-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$headers = function_exists('getallheaders') ? getallheaders() : [];
$headerToken = '';
if (is_array($headers)) {
    foreach ($headers as $key => $value) {
        if (strtolower($key) === 'x-jtl-token') {
            $headerToken = (string)$value;
            break;
        }
    }
}

$payload = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON payload']);
    exit;
}

$token = $payload['token'] ?? $headerToken;
if ($expectedToken !== '' && $token !== $expectedToken) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

if (!empty($payload['ping'])) {
    echo json_encode(['success' => true, 'pong' => true]);
    exit;
}

$title = trim((string)($payload['title'] ?? ''));
$content = trim((string)($payload['content'] ?? ''));
if ($title === '' || $content === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Title and content are required']);
    exit;
}

$metaDescription = (string)($payload['metaDescription'] ?? '');
$keywords = $payload['keywords'] ?? [];
if (is_array($keywords)) {
    $keywords = implode(', ', array_filter(array_map('trim', $keywords)));
}
$status = trim((string)($payload['status'] ?? 'draft'));
$source = trim((string)($payload['source'] ?? 'aibloggenerator'));

try {
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $stmt = $pdo->prepare(
        'INSERT INTO blog_drafts (title, meta_description, content, keywords, status, source) '
        . 'VALUES (:title, :meta_description, :content, :keywords, :status, :source)'
    );
    $stmt->execute([
        'title' => $title,
        'meta_description' => $metaDescription,
        'content' => $content,
        'keywords' => $keywords,
        'status' => $status,
        'source' => $source,
    ]);

    echo json_encode(['success' => true]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $error->getMessage()]);
}
