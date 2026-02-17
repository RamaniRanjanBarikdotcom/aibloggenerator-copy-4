<?php declare(strict_types=1);

use JTL\Shop;

header('Content-Type: text/html; charset=utf-8');

$db = Shop::Container()->getDB();
$rows = $db->getObjects(
    "SELECT id, title, status, created_at FROM xplugin_blogdraftreceiver_drafts ORDER BY id DESC LIMIT 200"
);

echo '<h1>Blog Drafts</h1>';
echo '<table border="1" cellpadding="6" cellspacing="0">';
echo '<tr><th>ID</th><th>Title</th><th>Status</th><th>Created</th></tr>';
foreach ($rows as $row) {
    $id = htmlspecialchars((string)$row->id, ENT_QUOTES, 'UTF-8');
    $title = htmlspecialchars((string)$row->title, ENT_QUOTES, 'UTF-8');
    $status = htmlspecialchars((string)$row->status, ENT_QUOTES, 'UTF-8');
    $created = htmlspecialchars((string)$row->created_at, ENT_QUOTES, 'UTF-8');
    echo "<tr><td>{$id}</td><td>{$title}</td><td>{$status}</td><td>{$created}</td></tr>";
}
echo '</table>';
