<?php
// Copy this file to config.php and fill values before deploying.
return [
    'jwt_secret' => 'change-this-long-random-jwt-secret',
    'jwt_ttl_seconds' => 3600,

    // MongoDB (server-side only)
    // Requires ext-mongodb and mongodb/mongodb via Composer.
    'mongo_uri' => 'mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority',
    'mongo_db' => 'aiblog_generator',

    // App update metadata (example)
    'updates' => [
        'stable' => [
            'version' => '1.0.0',
            'notes' => 'Initial release',
            'url' => 'https://your-domain.com/downloads/Blog-Generator-Setup.exe',
            'sha256' => '',
            'published_at' => '2026-03-13T00:00:00Z'
        ]
    ],
];