<?php
// Simple image upload endpoint for blog images.
// Place this file on your server and make it accessible via HTTPS.

ini_set('display_errors', '0');
ini_set('log_errors', '1');
ini_set('error_log', __DIR__ . '/blog-image-upload-error.log');
error_reporting(E_ALL);

$expectedToken = 'hdsgdjagsdjhgjhfj5468764134kdfiudsajh';
$defaultBaseFolder = 'blog-bild';

function respondJson($status, $payload) {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function getBearerToken() {
    $header = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    }
    if (preg_match('/Bearer\s+(\S+)/i', $header, $matches)) {
        return $matches[1];
    }
    return '';
}

function slugify($value) {
    $value = strtolower(trim($value));
    $value = preg_replace('/[^a-z0-9]+/', '-', $value);
    $value = trim($value, '-');
    return $value;
}

try {
    $token = getBearerToken();
    if (!$token && isset($_POST['token'])) {
        $token = trim($_POST['token']);
    }

    if ($expectedToken && $token !== $expectedToken) {
        respondJson(401, ['success' => false, 'error' => 'Unauthorized']);
    }

    if (!isset($_FILES['file'])) {
        respondJson(400, ['success' => false, 'error' => 'Missing file']);
    }

    if (!empty($_FILES['file']['error'])) {
        respondJson(400, ['success' => false, 'error' => 'Upload error code: ' . $_FILES['file']['error']]);
    }

    $baseFolder = isset($_POST['base_folder']) ? trim($_POST['base_folder']) : $defaultBaseFolder;
    if ($baseFolder === '') {
        $baseFolder = $defaultBaseFolder;
    }

    $blogId = isset($_POST['blog_id']) ? trim($_POST['blog_id']) : '';
    $title = isset($_POST['title']) ? trim($_POST['title']) : '';

    $folder = $blogId !== '' ? slugify($blogId) : slugify($title);
    if ($folder === '') {
        $folder = 'blog-' . date('Ymd-His');
    }

    $fileName = basename($_FILES['file']['name']);
    $fileName = preg_replace('/[^a-zA-Z0-9_.-]/', '-', $fileName);
    if ($fileName === '' || $fileName === '-') {
        $fileName = 'image-' . time() . '.jpg';
    }

    $targetDir = __DIR__ . '/' . $baseFolder . '/' . $folder;
    if (!is_dir($targetDir)) {
        if (!mkdir($targetDir, 0755, true)) {
            respondJson(500, ['success' => false, 'error' => 'Failed to create folder']);
        }
    }

    $targetPath = $targetDir . '/' . $fileName;
    if (!move_uploaded_file($_FILES['file']['tmp_name'], $targetPath)) {
        respondJson(500, ['success' => false, 'error' => 'Failed to save file']);
    }

    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'];
    $basePath = rtrim(dirname($_SERVER['SCRIPT_NAME']), '/\\');
    if ($basePath === '') {
        $basePath = '/';
    }

    $relativePath = trim($basePath, '/') . '/' . $baseFolder . '/' . $folder . '/' . $fileName;
    $relativePath = ltrim($relativePath, '/');
    $url = $scheme . '://' . $host . '/' . $relativePath;

    respondJson(200, [
        'success' => true,
        'url' => $url,
        'path' => $baseFolder . '/' . $folder . '/' . $fileName
    ]);
} catch (Throwable $e) {
    error_log('Upload failed: ' . $e->getMessage());
    respondJson(500, ['success' => false, 'error' => 'Server error']);
}
