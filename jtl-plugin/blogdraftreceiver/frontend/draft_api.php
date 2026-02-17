<?php declare(strict_types=1);

use JTL\Plugin\Helper as PluginHelper;
use JTL\Shop;

header('Content-Type: application/json; charset=utf-8');

try {
    if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Method not allowed']);
        exit;
    }

    $plugin = PluginHelper::getPluginById('blogdraftreceiver');
    if ($plugin === null) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Plugin not found']);
        exit;
    }

    $config = $plugin->getConfig();
    $expectedToken = trim((string)$config->getValue('jtl_draft_token'));

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

    $db = Shop::Container()->getDB();
    $db->queryPrepared(
        "INSERT INTO `xplugin_blogdraftreceiver_drafts`\n"
        . "  (`title`, `meta_description`, `content`, `keywords`, `status`, `source`)\n"
        . "VALUES (:title, :meta_description, :content, :keywords, :status, :source)",
        [
            'title' => $title,
            'meta_description' => $metaDescription,
            'content' => $content,
            'keywords' => $keywords,
            'status' => $status,
            'source' => $source,
        ]
    );

    echo json_encode(['success' => true]);
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $error->getMessage()]);
}
