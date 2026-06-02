<?php
// Copy this file to config.php and fill values before deploying.
return [
    'jwt_secret' => 'change-this-long-random-jwt-secret',
    'jwt_ttl_seconds' => 3600,

    // Key used to encrypt Shopify OAuth client secrets and access tokens at rest.
    // Keep this stable; rotating it invalidates stored secrets/tokens (re-connect required).
    // Falls back to jwt_secret if left blank.
    'encryption_key' => 'change-this-long-random-encryption-key',

    // Public HTTPS URL Shopify redirects back to after authorization. Must exactly
    // match an "Allowed redirection URL" in the Shopify Partner app. Leave blank to
    // derive it from the incoming request (only reliable behind a single fixed host).
    'shopify_oauth_redirect_url' => '',

    // Outbound TLS for server->Shopify calls (token exchange + publishing).
    // If you see "cURL error 60: SSL certificate problem", point this at a CA bundle
    // (download https://curl.se/ca/cacert.pem and set its absolute path here):
    'shopify_curl_ca_bundle' => '',
    // TESTING ONLY: set true to skip TLS verification when the host has no CA bundle.
    // Leave false in production.
    'shopify_curl_insecure' => false,

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