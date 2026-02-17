<?php
/**
 * Plugin Name: AI Blog Token Endpoint
 * Description: Complete REST API for AI Blog Generator - posts, analytics, views, SEO, featured images, WooCommerce, scheduling, and media management.
 * Version: 3.0.0
 * Author: aibloggenerator
 * Requires at least: 5.6
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

define('AIBLOG_VERSION', '3.0.0');

// ============================================================================
// PLUGIN ACTIVATION - Auto-fix .htaccess for Authorization header
// ============================================================================

register_activation_hook(__FILE__, 'aiblog_activate');

function aiblog_activate() {
    // Fix Apache stripping Authorization header
    aiblog_fix_htaccess();

    // Schedule daily cleanup of old view data
    if (!wp_next_scheduled('aiblog_daily_cleanup')) {
        wp_schedule_event(time(), 'daily', 'aiblog_daily_cleanup');
    }

    // Set default options
    if (!get_option('aiblog_api_token')) {
        update_option('aiblog_api_token', '');
    }
    update_option('aiblog_version', AIBLOG_VERSION);

    // Flush rewrite rules so REST routes work
    flush_rewrite_rules();
}

register_deactivation_hook(__FILE__, 'aiblog_deactivate');

function aiblog_deactivate() {
    wp_clear_scheduled_hook('aiblog_daily_cleanup');
}

/**
 * Add .htaccess rules to pass Authorization header through Apache
 * This is the #1 cause of auth failures on shared hosting
 */
function aiblog_fix_htaccess() {
    if (!function_exists('get_home_path')) {
        require_once ABSPATH . 'wp-admin/includes/file.php';
    }

    $htaccess_file = get_home_path() . '.htaccess';

    if (!file_exists($htaccess_file) || !is_writable($htaccess_file)) {
        return false;
    }

    $contents = file_get_contents($htaccess_file);

    // Don't add if already present
    if (strpos($contents, 'HTTP_AUTHORIZATION') !== false) {
        return true;
    }

    $rules = "\n# BEGIN AI Blog Generator - Authorization Header Fix\n";
    $rules .= "<IfModule mod_rewrite.c>\n";
    $rules .= "RewriteEngine On\n";
    $rules .= "RewriteCond %{HTTP:Authorization} ^(.*)\n";
    $rules .= "RewriteRule .* - [E=HTTP_AUTHORIZATION:%1]\n";
    $rules .= "</IfModule>\n";
    $rules .= "\n# Pass Authorization header via SetEnvIf (fallback)\n";
    $rules .= "<IfModule mod_setenvif.c>\n";
    $rules .= "SetEnvIf Authorization \"(.*)\" HTTP_AUTHORIZATION=$1\n";
    $rules .= "</IfModule>\n";
    $rules .= "# END AI Blog Generator - Authorization Header Fix\n\n";

    // Prepend before WordPress rules
    $wp_marker = '# BEGIN WordPress';
    $pos = strpos($contents, $wp_marker);
    if ($pos !== false) {
        $contents = substr($contents, 0, $pos) . $rules . substr($contents, $pos);
    } else {
        $contents = $rules . $contents;
    }

    return file_put_contents($htaccess_file, $contents) !== false;
}


// ============================================================================
// CORS SUPPORT
// ============================================================================

add_action('rest_api_init', function () {
    // Remove default WordPress REST CORS and add our own
    remove_filter('rest_pre_serve_request', 'rest_send_cors_headers');
}, 15);

add_filter('rest_pre_serve_request', function ($served, $result, $request, $server) {
    $route = $request->get_route();

    // Only apply to our endpoints
    if (strpos($route, '/aiblog/v1/') === 0) {
        $origin = get_http_origin();

        header('Access-Control-Allow-Origin: ' . ($origin ?: '*'));
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, X-WP-Nonce');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Max-Age: 86400');
    }

    return $served;
}, 10, 4);

// Handle OPTIONS preflight requests
add_action('rest_api_init', function () {
    // Register a catch-all OPTIONS handler for our namespace
    register_rest_route('aiblog/v1', '/(?P<path>.+)', [
        'methods'             => 'OPTIONS',
        'permission_callback' => '__return_true',
        'callback'            => function () {
            return new WP_REST_Response(null, 204);
        },
    ]);
});


// ============================================================================
// REST API ENDPOINTS
// ============================================================================

add_action('rest_api_init', function () {

    // -------------------------------------------------------------------------
    // HEALTH CHECK - Comprehensive diagnostics (NO AUTH REQUIRED)
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/health', [
        'methods'             => 'GET',
        'permission_callback' => '__return_true',
        'callback'            => function () {
            $checks = [];

            // 1. Plugin version
            $checks['version'] = AIBLOG_VERSION;
            $checks['wordpress'] = get_bloginfo('version');
            $checks['php'] = phpversion();
            $checks['site'] = get_bloginfo('name');
            $checks['url'] = home_url();
            $checks['rest_url'] = rest_url('aiblog/v1/');

            // 2. HTTPS check
            $checks['https'] = is_ssl();

            // 3. REST API accessible
            $checks['rest_api'] = true; // If we got here, REST API works

            // 4. Authorization header detection
            $auth_header_found = false;
            if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
                $auth_header_found = true;
                $checks['auth_source'] = 'HTTP_AUTHORIZATION';
            } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
                $auth_header_found = true;
                $checks['auth_source'] = 'REDIRECT_HTTP_AUTHORIZATION';
            } elseif (function_exists('apache_request_headers')) {
                $headers = apache_request_headers();
                if (isset($headers['Authorization']) || isset($headers['authorization'])) {
                    $auth_header_found = true;
                    $checks['auth_source'] = 'apache_request_headers';
                }
            }
            // No auth header is normal for health check (no auth sent)
            $checks['auth_header_passthrough'] = 'send Authorization header to /ping to verify';

            // 5. Bearer token configured
            $token = get_option('aiblog_api_token', '');
            $checks['bearer_token_configured'] = !empty($token);
            $checks['bearer_token_length'] = strlen($token);

            // 6. Application passwords
            $checks['application_passwords'] = wp_is_application_passwords_available();

            // 7. .htaccess Authorization fix
            if (function_exists('get_home_path')) {
                $htaccess = get_home_path() . '.htaccess';
                if (file_exists($htaccess)) {
                    $contents = file_get_contents($htaccess);
                    $checks['htaccess_auth_fix'] = strpos($contents, 'HTTP_AUTHORIZATION') !== false;
                } else {
                    $checks['htaccess_auth_fix'] = 'no .htaccess file (nginx?)';
                }
            }

            // 8. Server info
            $checks['server'] = $_SERVER['SERVER_SOFTWARE'] ?? 'unknown';
            $checks['sapi'] = php_sapi_name();

            // 9. Required functions
            $checks['curl_available'] = function_exists('curl_version');
            $checks['json_available'] = function_exists('json_encode');

            // 10. WooCommerce
            $checks['woocommerce_active'] = class_exists('WooCommerce');
            if (class_exists('WooCommerce')) {
                $checks['woocommerce_version'] = WC()->version;
            }

            // 11. SEO plugins
            $checks['yoast_active'] = defined('WPSEO_VERSION');
            $checks['rankmath_active'] = class_exists('RankMath');

            // 12. Media upload
            $upload_dir = wp_upload_dir();
            $checks['upload_writable'] = wp_is_writable($upload_dir['basedir']);
            $checks['max_upload_size'] = size_format(wp_max_upload_size());

            // 13. Permalinks
            $checks['permalinks'] = get_option('permalink_structure') ?: 'plain (REST API may not work!)';

            // Overall status
            $issues = [];
            if (!$checks['https'] && !defined('WP_ENVIRONMENT_TYPE')) {
                $issues[] = 'HTTPS not enabled - Basic Auth requires HTTPS';
            }
            if (!$checks['bearer_token_configured']) {
                $issues[] = 'Bearer token not configured - go to Settings > AI Blog Token';
            }
            if (!$checks['application_passwords']) {
                $issues[] = 'Application Passwords not available - Basic Auth may not work';
            }
            if ($checks['permalinks'] === 'plain (REST API may not work!)') {
                $issues[] = 'Plain permalinks - REST API requires pretty permalinks';
            }

            return [
                'success' => empty($issues),
                'status'  => empty($issues) ? 'healthy' : 'issues_found',
                'issues'  => $issues,
                'checks'  => $checks,
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // DEBUG - Check what headers we receive (NO AUTH REQUIRED)
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/debug', [
        'methods'             => 'GET',
        'permission_callback' => '__return_true',
        'callback'            => function () {
            $auth_header = '';
            $auth_method = 'none';
            $received_token = '';
            $basic_username = '';

            if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
                $auth_header = 'HTTP_AUTHORIZATION present';
                $header = $_SERVER['HTTP_AUTHORIZATION'];
            } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
                $auth_header = 'REDIRECT_HTTP_AUTHORIZATION present';
                $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
            } elseif (function_exists('apache_request_headers')) {
                $headers = apache_request_headers();
                if (isset($headers['Authorization'])) {
                    $auth_header = 'Authorization from apache_request_headers';
                    $header = $headers['Authorization'];
                }
            } else {
                $auth_header = 'NO authorization header found';
                $header = '';
            }

            if (!empty($header)) {
                if (preg_match('/Bearer\s+(.*)/i', $header, $m)) {
                    $auth_method = 'bearer';
                    $received_token = trim($m[1]);
                } elseif (preg_match('/Basic\s+(.*)/i', $header, $m)) {
                    $auth_method = 'basic';
                    $credentials = base64_decode(trim($m[1]));
                    if ($credentials && strpos($credentials, ':') !== false) {
                        list($basic_username) = explode(':', $credentials, 2);
                    }
                }
            }

            $configured_token = trim(get_option('aiblog_api_token', ''));

            $response = [
                'success' => true,
                'version' => AIBLOG_VERSION,
                'site'    => get_bloginfo('name'),
                'authorization_header' => $auth_header,
                'auth_method' => $auth_method,
                'php_sapi' => php_sapi_name(),
                'server_software' => $_SERVER['SERVER_SOFTWARE'] ?? 'unknown',
            ];

            if ($auth_method === 'bearer') {
                $response['token_configured'] = !empty($configured_token);
                $response['token_length'] = strlen($configured_token);
                $response['token_first_10'] = substr($configured_token, 0, 10);
                $response['token_last_10'] = substr($configured_token, -10);
                $response['received_token_length'] = strlen($received_token);
                $response['received_token_first_10'] = substr($received_token, 0, 10);
                $response['received_token_last_10'] = substr($received_token, -10);
                $response['tokens_match'] = hash_equals($configured_token, $received_token);
            }

            if ($auth_method === 'basic') {
                $response['basic_username'] = $basic_username;
                $response['basic_auth_enabled'] = true;
            }

            return $response;
        },
    ]);

    // -------------------------------------------------------------------------
    // PING - Connection test (AUTH REQUIRED)
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/ping', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function () {
            $user = wp_get_current_user();
            return [
                'success'      => true,
                'version'      => AIBLOG_VERSION,
                'site'         => get_bloginfo('name'),
                'url'          => home_url(),
                'user'         => $user->ID ? $user->user_login : null,
                'role'         => $user->ID ? implode(', ', $user->roles) : null,
                'capabilities' => [
                    'edit_posts'    => current_user_can('edit_posts'),
                    'publish_posts' => current_user_can('publish_posts'),
                    'upload_files'  => current_user_can('upload_files'),
                    'manage_categories' => current_user_can('manage_categories'),
                ],
                'features'     => [
                    'woocommerce'  => class_exists('WooCommerce'),
                    'yoast'        => defined('WPSEO_VERSION'),
                    'rankmath'     => class_exists('RankMath'),
                    'scheduling'   => true,
                    'bulk_ops'     => true,
                    'media_upload' => true,
                    'analytics'    => true,
                ],
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // POST - Create or update a post (draft, publish, or scheduled)
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/post', [
        'methods'             => 'POST',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $post_id    = intval($req['id'] ?? 0);
            $title      = sanitize_text_field($req['title'] ?? '');
            $content    = wp_kses_post($req['content'] ?? '');
            $excerpt    = sanitize_text_field($req['excerpt'] ?? '');
            $status     = sanitize_key($req['status'] ?? 'draft');
            $slug       = sanitize_title($req['slug'] ?? '');
            $author_id  = intval($req['author_id'] ?? get_current_user_id());
            $post_format = sanitize_key($req['format'] ?? '');

            // Scheduling support
            $schedule_date = sanitize_text_field($req['schedule_date'] ?? $req['date'] ?? '');

            $keywords = is_array($req['keywords'] ?? null)
                ? array_map('sanitize_text_field', $req['keywords'])
                : [];
            $categories = is_array($req['categories'] ?? null)
                ? array_map('sanitize_text_field', $req['categories'])
                : [];

            // SEO fields (compatible with Yoast, RankMath, etc.)
            $meta_title       = sanitize_text_field($req['metaTitle'] ?? '');
            $meta_description = sanitize_text_field($req['metaDescription'] ?? '');
            $focus_keyword    = sanitize_text_field($req['focusKeyword'] ?? '');

            // Featured image URL
            $featured_image_url  = esc_url_raw($req['featuredImage'] ?? '');
            $featured_image_data = $req['featuredImageData'] ?? '';
            $featured_image_name = sanitize_file_name($req['featuredImageName'] ?? '');

            // Custom fields
            $custom_fields = $req['customFields'] ?? null;

            $payload = [
                'post_title'   => $title,
                'post_content' => $content,
                'post_excerpt' => $excerpt,
                'post_status'  => $status,
                'post_type'    => 'post',
                'post_author'  => $author_id,
            ];

            if ($slug) {
                $payload['post_name'] = $slug;
            }

            // Handle scheduling: if status is 'future' or a date is provided
            if ($schedule_date) {
                $timestamp = strtotime($schedule_date);
                if ($timestamp && $timestamp > time()) {
                    $payload['post_status'] = 'future';
                    $payload['post_date'] = date('Y-m-d H:i:s', $timestamp);
                    $payload['post_date_gmt'] = gmdate('Y-m-d H:i:s', $timestamp);
                } elseif ($timestamp) {
                    // Date in the past - use it as the post date but keep requested status
                    $payload['post_date'] = date('Y-m-d H:i:s', $timestamp);
                    $payload['post_date_gmt'] = gmdate('Y-m-d H:i:s', $timestamp);
                }
            }

            if ($post_id > 0) {
                $payload['ID'] = $post_id;
                $post_id = wp_update_post($payload, true);
            } else {
                $post_id = wp_insert_post($payload, true);
            }

            if (is_wp_error($post_id)) {
                return new WP_Error('create_failed', $post_id->get_error_message(), ['status' => 500]);
            }

            // Set post format
            if ($post_format && in_array($post_format, get_post_format_slugs())) {
                set_post_format($post_id, $post_format);
            }

            // Set tags
            if (!empty($keywords)) {
                wp_set_post_terms($post_id, $keywords, 'post_tag', false);
            }

            // Set categories (create if they don't exist)
            if (!empty($categories)) {
                $cat_ids = [];
                foreach ($categories as $cat_name) {
                    $term = term_exists($cat_name, 'category');
                    if (!$term) {
                        $term = wp_insert_term($cat_name, 'category');
                    }
                    if (!is_wp_error($term)) {
                        $cat_ids[] = is_array($term) ? $term['term_id'] : $term;
                    }
                }
                if (!empty($cat_ids)) {
                    wp_set_post_categories($post_id, $cat_ids);
                }
            }

            // Set SEO meta fields
            if ($meta_title) {
                update_post_meta($post_id, '_yoast_wpseo_title', $meta_title);
                update_post_meta($post_id, 'rank_math_title', $meta_title);
                update_post_meta($post_id, '_aiblog_meta_title', $meta_title);
            }
            if ($meta_description) {
                update_post_meta($post_id, '_yoast_wpseo_metadesc', $meta_description);
                update_post_meta($post_id, 'rank_math_description', $meta_description);
                update_post_meta($post_id, '_aiblog_meta_description', $meta_description);
            }
            if ($focus_keyword) {
                update_post_meta($post_id, '_yoast_wpseo_focuskw', $focus_keyword);
                update_post_meta($post_id, 'rank_math_focus_keyword', $focus_keyword);
                update_post_meta($post_id, '_aiblog_focus_keyword', $focus_keyword);
            }

            // Set custom fields
            if (is_array($custom_fields)) {
                foreach ($custom_fields as $key => $value) {
                    $safe_key = sanitize_key($key);
                    update_post_meta($post_id, $safe_key, sanitize_text_field($value));
                }
            }

            // Mark as AI-generated
            update_post_meta($post_id, '_aiblog_generated', true);
            update_post_meta($post_id, '_aiblog_generated_at', current_time('c'));

            // Handle featured image (supports URL or base64 data)
            $featured_image_result = null;
            if ($featured_image_url || $featured_image_data) {
                $attach_id = aiblog_sideload_image($featured_image_url, $post_id, $featured_image_data, $featured_image_name);
                if ($attach_id && !is_wp_error($attach_id)) {
                    set_post_thumbnail($post_id, $attach_id);
                    $featured_image_result = [
                        'attachmentId' => $attach_id,
                        'url'          => wp_get_attachment_url($attach_id),
                    ];
                } else {
                    $featured_image_result = [
                        'error' => is_wp_error($attach_id) ? $attach_id->get_error_message() : 'Failed to upload image',
                    ];
                }
            }

            $response = [
                'success'       => true,
                'id'            => $post_id,
                'status'        => get_post_status($post_id),
                'url'           => get_permalink($post_id),
                'editUrl'       => admin_url("post.php?post={$post_id}&action=edit"),
                'created_at'    => get_post_time('c', true, $post_id),
                'updated_at'    => get_post_modified_time('c', true, $post_id),
                'featuredImage' => get_the_post_thumbnail_url($post_id, 'full'),
            ];

            if ($payload['post_status'] === 'future') {
                $response['scheduled_for'] = get_post_time('c', false, $post_id);
            }

            if ($featured_image_result) {
                $response['featuredImageResult'] = $featured_image_result;
            }

            return $response;
        },
    ]);

    // -------------------------------------------------------------------------
    // POSTS - List posts with filters
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/posts', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $status   = sanitize_text_field($req['status'] ?? 'any');
            $per_page = min(max(intval($req['per_page'] ?? 50), 1), 100);
            $page     = max(intval($req['page'] ?? 1), 1);
            $after    = $req['after'] ? sanitize_text_field($req['after']) : null;
            $before   = $req['before'] ? sanitize_text_field($req['before']) : null;
            $search   = $req['search'] ? sanitize_text_field($req['search']) : null;
            $orderby  = sanitize_key($req['orderby'] ?? 'date');
            $order    = strtoupper(sanitize_key($req['order'] ?? 'DESC'));
            $category = $req['category'] ? sanitize_text_field($req['category']) : null;
            $tag      = $req['tag'] ? sanitize_text_field($req['tag']) : null;
            $ai_only  = filter_var($req['ai_only'] ?? false, FILTER_VALIDATE_BOOLEAN);

            $query_args = [
                'post_type'      => 'post',
                'post_status'    => $status === 'any' ? ['draft', 'publish', 'pending', 'private', 'future'] : $status,
                'posts_per_page' => $per_page,
                'paged'          => $page,
                'orderby'        => $orderby,
                'order'          => in_array($order, ['ASC', 'DESC']) ? $order : 'DESC',
            ];

            // Date filters
            if ($after || $before) {
                $date_query = [];
                if ($after) {
                    $date_query['after'] = $after;
                }
                if ($before) {
                    $date_query['before'] = $before;
                }
                $date_query['inclusive'] = true;
                $query_args['date_query'] = [$date_query];
            }

            if ($search) {
                $query_args['s'] = $search;
            }

            // Category filter
            if ($category) {
                $query_args['category_name'] = $category;
            }

            // Tag filter
            if ($tag) {
                $query_args['tag'] = $tag;
            }

            // AI-generated posts only
            if ($ai_only) {
                $query_args['meta_query'] = [
                    [
                        'key'     => '_aiblog_generated',
                        'value'   => '1',
                        'compare' => '=',
                    ],
                ];
            }

            // Order by views
            if ($orderby === 'views') {
                $query_args['meta_key'] = 'aiblog_views';
                $query_args['orderby']  = 'meta_value_num';
            }

            $query = new WP_Query($query_args);
            $posts = $query->posts;

            $data = array_map(function ($post) {
                return aiblog_format_post($post);
            }, $posts);

            return [
                'count'       => count($data),
                'total'       => $query->found_posts,
                'pages'       => $query->max_num_pages,
                'currentPage' => $page,
                'items'       => $data,
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // GET SINGLE POST
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/post/(?P<id>\d+)', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $post_id = intval($req['id']);
            $post = get_post($post_id);
            if (!$post || $post->post_type !== 'post') {
                return new WP_Error('not_found', 'Post not found', ['status' => 404]);
            }
            return aiblog_format_post($post, true);
        },
    ]);

    // -------------------------------------------------------------------------
    // UPDATE POST STATUS (quick status change)
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/post/(?P<id>\d+)/status', [
        'methods'             => 'PUT,PATCH',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $post_id = intval($req['id']);
            $new_status = sanitize_key($req['status'] ?? '');

            if (!in_array($new_status, ['publish', 'draft', 'pending', 'private', 'trash'])) {
                return new WP_Error('invalid_status', 'Status must be: publish, draft, pending, private, or trash', ['status' => 400]);
            }

            $post = get_post($post_id);
            if (!$post || $post->post_type !== 'post') {
                return new WP_Error('not_found', 'Post not found', ['status' => 404]);
            }

            $result = wp_update_post(['ID' => $post_id, 'post_status' => $new_status], true);
            if (is_wp_error($result)) {
                return $result;
            }

            return [
                'success'    => true,
                'id'         => $post_id,
                'status'     => get_post_status($post_id),
                'url'        => get_permalink($post_id),
                'updated_at' => get_post_modified_time('c', true, $post_id),
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // POST REVISIONS
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/post/(?P<id>\d+)/revisions', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $post_id = intval($req['id']);
            $post = get_post($post_id);
            if (!$post || $post->post_type !== 'post') {
                return new WP_Error('not_found', 'Post not found', ['status' => 404]);
            }

            $revisions = wp_get_post_revisions($post_id, ['posts_per_page' => 20]);

            return array_values(array_map(function ($rev) {
                return [
                    'id'         => $rev->ID,
                    'author'     => get_the_author_meta('display_name', $rev->post_author),
                    'date'       => $rev->post_date,
                    'title'      => $rev->post_title,
                    'excerpt'    => wp_trim_words(wp_strip_all_tags($rev->post_content), 30),
                ];
            }, $revisions));
        },
    ]);

    // -------------------------------------------------------------------------
    // DELETE POST
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/post/(?P<id>\d+)', [
        'methods'             => 'DELETE',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $post_id = intval($req['id']);
            $force   = filter_var($req['force'] ?? false, FILTER_VALIDATE_BOOLEAN);

            if (get_post_type($post_id) !== 'post') {
                return new WP_Error('not_found', 'Post not found', ['status' => 404]);
            }

            $deleted = $force ? wp_delete_post($post_id, true) : wp_trash_post($post_id);
            if (!$deleted) {
                return new WP_Error('delete_failed', 'Unable to delete post', ['status' => 500]);
            }

            return ['success' => true, 'id' => $post_id, 'trashed' => !$force];
        },
    ]);

    // -------------------------------------------------------------------------
    // VIEWS - Increment view counter (public endpoint)
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/views', [
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'callback'            => function ($req) {
            $post_id = intval($req['postId'] ?? 0);
            if (!$post_id || get_post_type($post_id) !== 'post') {
                return new WP_Error('invalid_post', 'Invalid postId', ['status' => 400]);
            }

            // Prevent duplicate counting from same IP within 1 hour
            $ip_hash = md5($_SERVER['REMOTE_ADDR'] ?? 'unknown');
            $cache_key = "aiblog_view_{$post_id}_{$ip_hash}";
            if (get_transient($cache_key)) {
                $views = intval(get_post_meta($post_id, 'aiblog_views', true));
                return ['success' => true, 'views' => $views, 'cached' => true];
            }
            set_transient($cache_key, 1, HOUR_IN_SECONDS);

            $views = intval(get_post_meta($post_id, 'aiblog_views', true));
            $views++;
            update_post_meta($post_id, 'aiblog_views', $views);
            update_post_meta($post_id, 'aiblog_last_viewed', current_time('c'));

            // Track daily views for analytics
            $today = current_time('Y-m-d');
            $daily_key = "aiblog_daily_views_{$today}";
            $daily_views = get_option($daily_key, []);
            $daily_views[$post_id] = ($daily_views[$post_id] ?? 0) + 1;
            update_option($daily_key, $daily_views, false);

            return ['success' => true, 'views' => $views];
        },
    ]);

    // ---------------------------------------------------------------------
    // HEARTBEAT - accumulate time-on-page (public)
    // ---------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/views/heartbeat', [
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'callback'            => function ($req) {
            $post_id = intval($req['postId'] ?? 0);
            $millis  = intval($req['millis'] ?? 0);
            if (!$post_id || get_post_type($post_id) !== 'post') {
                return new WP_Error('invalid_post', 'Invalid postId', ['status' => 400]);
            }
            if ($millis <= 0) {
                return new WP_Error('invalid_time', 'millis must be > 0', ['status' => 400]);
            }

            $seconds = max(0, round($millis / 1000));
            $current = intval(get_post_meta($post_id, 'aiblog_time_spent', true));
            $current += $seconds;
            update_post_meta($post_id, 'aiblog_time_spent', $current);

            // Daily rollup
            $today = current_time('Y-m-d');
            $daily_key = "aiblog_daily_time_{$today}";
            $daily_time = get_option($daily_key, []);
            $daily_time[$post_id] = ($daily_time[$post_id] ?? 0) + $seconds;
            update_option($daily_key, $daily_time, false);

            return ['success' => true, 'timeSpent' => $current];
        },
    ]);

    // ---------------------------------------------------------------------
    // COLLECT - analytics ingest (pageview/heartbeat/scroll)
    // ---------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/collect', [
        'methods'             => 'POST',
        'permission_callback' => '__return_true',
        'callback'            => function ($req) {
            $payload = json_decode($req->get_body(), true);
            if (!$payload || empty($payload['event'])) {
                return new WP_Error('invalid', 'event required', ['status' => 400]);
            }
            $event = sanitize_key($payload['event']);
            $post_id = url_to_postid($payload['url'] ?? '');

            // Basic per-event handling
            if ($event === 'pageview' && $post_id) {
                $views = intval(get_post_meta($post_id, 'aiblog_views', true));
                $views++;
                update_post_meta($post_id, 'aiblog_views', $views);
                update_post_meta($post_id, 'aiblog_last_viewed', current_time('c'));
            }
            if ($event === 'heartbeat' && $post_id && isset($payload['deltaMs'])) {
                $current = intval(get_post_meta($post_id, 'aiblog_time_spent', true));
                $current += max(0, round(intval($payload['deltaMs']) / 1000));
                update_post_meta($post_id, 'aiblog_time_spent', $current);
            }
            if ($event === 'scroll' && $post_id && isset($payload['scrollPct'])) {
                $best = intval(get_post_meta($post_id, 'aiblog_scroll_depth', true));
                $best = max($best, intval($payload['scrollPct']));
                update_post_meta($post_id, 'aiblog_scroll_depth', $best);
            }

            return ['success' => true];
        },
    ]);

    // -------------------------------------------------------------------------
    // ANALYTICS - Aggregated statistics
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/analytics', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            global $wpdb;

            $days = intval($req['days'] ?? 30);
            $limit = min(intval($req['limit'] ?? 10), 50);

            // Count posts by status
            $counts = wp_count_posts('post');
            $published = intval($counts->publish);
            $drafts = intval($counts->draft);
            $pending = intval($counts->pending);
            $scheduled = intval($counts->future);

            // Total views
            $total_views = intval($wpdb->get_var(
                "SELECT COALESCE(SUM(meta_value), 0) FROM {$wpdb->postmeta}
                 WHERE meta_key = 'aiblog_views'"
            ));

            // AI-generated post count
            $ai_generated = intval($wpdb->get_var(
                "SELECT COUNT(*) FROM {$wpdb->postmeta}
                 WHERE meta_key = '_aiblog_generated' AND meta_value = '1'"
            ));

            // Top posts by views
            $top_posts = $wpdb->get_results($wpdb->prepare(
                "SELECT p.ID, p.post_title, p.post_status, p.post_date,
                        pm.meta_value as views
                 FROM {$wpdb->posts} p
                 INNER JOIN {$wpdb->postmeta} pm ON p.ID = pm.post_id
                 WHERE pm.meta_key = 'aiblog_views'
                 AND p.post_type = 'post'
                 AND p.post_status IN ('publish', 'draft', 'future')
                 ORDER BY CAST(pm.meta_value AS UNSIGNED) DESC
                 LIMIT %d",
                $limit
            ));

            $top_posts_data = array_map(function ($row) {
                return [
                    'id'     => intval($row->ID),
                    'title'  => $row->post_title,
                    'status' => $row->post_status,
                    'date'   => $row->post_date,
                    'views'  => intval($row->views),
                    'url'    => get_permalink($row->ID),
                ];
            }, $top_posts);

            // Views by category/topic
            $views_by_topic = [];
            $categories = get_categories(['hide_empty' => false]);
            foreach ($categories as $cat) {
                $cat_posts = get_posts([
                    'category'       => $cat->term_id,
                    'post_type'      => 'post',
                    'post_status'    => ['publish', 'draft'],
                    'posts_per_page' => -1,
                    'fields'         => 'ids',
                ]);
                $cat_views = 0;
                foreach ($cat_posts as $pid) {
                    $cat_views += intval(get_post_meta($pid, 'aiblog_views', true));
                }
                if ($cat_views > 0 || count($cat_posts) > 0) {
                    $views_by_topic[] = [
                        'topic'     => $cat->name,
                        'slug'      => $cat->slug,
                        'postCount' => count($cat_posts),
                        'views'     => $cat_views,
                        'avgViews'  => count($cat_posts) > 0 ? round($cat_views / count($cat_posts), 1) : 0,
                    ];
                }
            }
            usort($views_by_topic, fn($a, $b) => $b['views'] - $a['views']);
            $views_by_topic = array_slice($views_by_topic, 0, $limit);

            // Views by tag
            $views_by_tag = [];
            $tags = get_tags(['hide_empty' => false]);
            if ($tags && !is_wp_error($tags)) {
                foreach ($tags as $tag) {
                    $tag_posts = get_posts([
                        'tag_id'         => $tag->term_id,
                        'post_type'      => 'post',
                        'post_status'    => ['publish', 'draft'],
                        'posts_per_page' => -1,
                        'fields'         => 'ids',
                    ]);
                    $tag_views = 0;
                    foreach ($tag_posts as $pid) {
                        $tag_views += intval(get_post_meta($pid, 'aiblog_views', true));
                    }
                    if ($tag_views > 0) {
                        $views_by_tag[] = [
                            'tag'       => $tag->name,
                            'slug'      => $tag->slug,
                            'postCount' => count($tag_posts),
                            'views'     => $tag_views,
                        ];
                    }
                }
            }
            usort($views_by_tag, fn($a, $b) => $b['views'] - $a['views']);
            $views_by_tag = array_slice($views_by_tag, 0, $limit);

            // Posts by month (last 12 months)
            $posts_by_month = $wpdb->get_results(
                "SELECT DATE_FORMAT(post_date, '%Y-%m') as month,
                        COUNT(*) as count,
                        SUM(CASE WHEN post_status = 'publish' THEN 1 ELSE 0 END) as published,
                        SUM(CASE WHEN post_status = 'draft' THEN 1 ELSE 0 END) as drafts
                 FROM {$wpdb->posts}
                 WHERE post_type = 'post'
                 AND post_status IN ('publish', 'draft', 'future')
                 AND post_date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
                 GROUP BY DATE_FORMAT(post_date, '%Y-%m')
                 ORDER BY month DESC"
            );

            // Daily views for the last N days
            $daily_views = [];
            for ($i = $days - 1; $i >= 0; $i--) {
                $date = date('Y-m-d', strtotime("-{$i} days"));
                $daily_key = "aiblog_daily_views_{$date}";
                $day_data = get_option($daily_key, []);
                $day_total = array_sum($day_data);
                $daily_views[] = [
                    'date'  => $date,
                    'views' => $day_total,
                ];
            }

            // Recent posts
            $recent = get_posts([
                'post_type'      => 'post',
                'post_status'    => ['publish', 'draft', 'future'],
                'posts_per_page' => $limit,
                'orderby'        => 'date',
                'order'          => 'DESC',
            ]);
            $recent_posts = array_map(function ($p) {
                return [
                    'id'        => $p->ID,
                    'title'     => get_the_title($p),
                    'status'    => $p->post_status,
                    'date'      => get_post_time('c', true, $p),
                    'views'     => intval(get_post_meta($p->ID, 'aiblog_views', true)),
                    'url'       => get_permalink($p),
                    'aiGenerated' => (bool)get_post_meta($p->ID, '_aiblog_generated', true),
                ];
            }, $recent);

            // Scheduled posts
            $scheduled_posts = get_posts([
                'post_type'      => 'post',
                'post_status'    => 'future',
                'posts_per_page' => 20,
                'orderby'        => 'date',
                'order'          => 'ASC',
            ]);
            $scheduled_data = array_map(function ($p) {
                return [
                    'id'           => $p->ID,
                    'title'        => get_the_title($p),
                    'scheduled_for' => get_post_time('c', false, $p),
                    'url'          => get_permalink($p),
                ];
            }, $scheduled_posts);

            return [
                'summary' => [
                    'totalPosts'      => $published + $drafts + $pending + $scheduled,
                    'published'       => $published,
                    'drafts'          => $drafts,
                    'pending'         => $pending,
                    'scheduled'       => $scheduled,
                    'aiGenerated'     => $ai_generated,
                    'totalViews'      => $total_views,
                    'avgViewsPerPost' => ($published + $drafts) > 0
                        ? round($total_views / ($published + $drafts), 1)
                        : 0,
                ],
                'topPosts'       => $top_posts_data,
                'viewsByTopic'   => $views_by_topic,
                'viewsByTag'     => $views_by_tag,
                'postsByMonth'   => $posts_by_month,
                'dailyViews'     => $daily_views,
                'recentPosts'    => $recent_posts,
                'scheduledPosts' => $scheduled_data,
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // BULK OPERATIONS
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/bulk', [
        'methods'             => 'POST',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $action = sanitize_key($req['action'] ?? '');
            $ids = is_array($req['ids'] ?? null) ? array_map('intval', $req['ids']) : [];

            if (empty($ids)) {
                return new WP_Error('no_ids', 'No post IDs provided', ['status' => 400]);
            }

            $results = [];

            foreach ($ids as $post_id) {
                if (get_post_type($post_id) !== 'post') {
                    $results[$post_id] = ['success' => false, 'error' => 'Not a post'];
                    continue;
                }

                switch ($action) {
                    case 'publish':
                        $updated = wp_update_post(['ID' => $post_id, 'post_status' => 'publish']);
                        $results[$post_id] = ['success' => !is_wp_error($updated)];
                        break;

                    case 'draft':
                        $updated = wp_update_post(['ID' => $post_id, 'post_status' => 'draft']);
                        $results[$post_id] = ['success' => !is_wp_error($updated)];
                        break;

                    case 'trash':
                        $results[$post_id] = ['success' => (bool)wp_trash_post($post_id)];
                        break;

                    case 'delete':
                        $results[$post_id] = ['success' => (bool)wp_delete_post($post_id, true)];
                        break;

                    default:
                        $results[$post_id] = ['success' => false, 'error' => 'Unknown action'];
                }
            }

            $success_count = count(array_filter($results, fn($r) => $r['success']));

            return [
                'success'      => $success_count === count($ids),
                'processed'    => count($ids),
                'successCount' => $success_count,
                'results'      => $results,
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // CATEGORIES - List & create categories
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/categories', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function () {
            $categories = get_categories(['hide_empty' => false]);
            return array_values(array_map(function ($cat) {
                return [
                    'id'    => $cat->term_id,
                    'name'  => $cat->name,
                    'slug'  => $cat->slug,
                    'count' => $cat->count,
                    'parent' => $cat->parent,
                ];
            }, $categories));
        },
    ]);

    register_rest_route('aiblog/v1', '/categories', [
        'methods'             => 'POST',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $name = sanitize_text_field($req['name'] ?? '');
            $slug = sanitize_title($req['slug'] ?? '');
            $parent = intval($req['parent'] ?? 0);
            $description = sanitize_text_field($req['description'] ?? '');

            if (!$name) {
                return new WP_Error('no_name', 'Category name is required', ['status' => 400]);
            }

            $existing = term_exists($name, 'category');
            if ($existing) {
                $term_id = is_array($existing) ? $existing['term_id'] : $existing;
                $cat = get_category($term_id);
                return [
                    'success'  => true,
                    'created'  => false,
                    'id'       => $cat->term_id,
                    'name'     => $cat->name,
                    'slug'     => $cat->slug,
                    'message'  => 'Category already exists',
                ];
            }

            $args = [];
            if ($slug) $args['slug'] = $slug;
            if ($parent) $args['parent'] = $parent;
            if ($description) $args['description'] = $description;

            $result = wp_insert_term($name, 'category', $args);

            if (is_wp_error($result)) {
                return new WP_Error('create_failed', $result->get_error_message(), ['status' => 500]);
            }

            $cat = get_category($result['term_id']);
            return [
                'success' => true,
                'created' => true,
                'id'      => $cat->term_id,
                'name'    => $cat->name,
                'slug'    => $cat->slug,
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // TAGS - List & create tags
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/tags', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function () {
            $tags = get_tags(['hide_empty' => false]);
            if (!$tags || is_wp_error($tags)) {
                return [];
            }
            return array_values(array_map(function ($tag) {
                return [
                    'id'    => $tag->term_id,
                    'name'  => $tag->name,
                    'slug'  => $tag->slug,
                    'count' => $tag->count,
                ];
            }, $tags));
        },
    ]);

    register_rest_route('aiblog/v1', '/tags', [
        'methods'             => 'POST',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $name = sanitize_text_field($req['name'] ?? '');

            if (!$name) {
                return new WP_Error('no_name', 'Tag name is required', ['status' => 400]);
            }

            $existing = term_exists($name, 'post_tag');
            if ($existing) {
                $term_id = is_array($existing) ? $existing['term_id'] : $existing;
                $tag = get_term($term_id, 'post_tag');
                return ['success' => true, 'created' => false, 'id' => $tag->term_id, 'name' => $tag->name, 'slug' => $tag->slug];
            }

            $result = wp_insert_term($name, 'post_tag');
            if (is_wp_error($result)) {
                return new WP_Error('create_failed', $result->get_error_message(), ['status' => 500]);
            }

            $tag = get_term($result['term_id'], 'post_tag');
            return ['success' => true, 'created' => true, 'id' => $tag->term_id, 'name' => $tag->name, 'slug' => $tag->slug];
        },
    ]);

    // -------------------------------------------------------------------------
    // UPLOAD IMAGE
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/upload', [
        'methods'             => 'POST',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $image_url = esc_url_raw($req['url'] ?? '');
            $post_id = intval($req['postId'] ?? 0);
            $set_featured = filter_var($req['setFeatured'] ?? true, FILTER_VALIDATE_BOOLEAN);
            $alt_text = sanitize_text_field($req['alt'] ?? '');
            $title = sanitize_text_field($req['title'] ?? '');

            if (!$image_url) {
                $image_data = $req['data'] ?? $req['base64'] ?? '';
            } else {
                $image_data = $req['data'] ?? $req['base64'] ?? '';
            }

            if (!$image_url && !$image_data) {
                return new WP_Error('no_url', 'Image URL or data is required', ['status' => 400]);
            }

            $filename = sanitize_file_name($req['filename'] ?? '');

            $attach_id = aiblog_sideload_image($image_url, $post_id, $image_data, $filename);

            if (is_wp_error($attach_id)) {
                return $attach_id;
            }

            // Set alt text
            if ($alt_text) {
                update_post_meta($attach_id, '_wp_attachment_image_alt', $alt_text);
            }

            // Set title
            if ($title) {
                wp_update_post(['ID' => $attach_id, 'post_title' => $title]);
            }

            if ($post_id && $set_featured) {
                set_post_thumbnail($post_id, $attach_id);
            }

            return [
                'success'       => true,
                'attachmentId'  => $attach_id,
                'url'           => wp_get_attachment_url($attach_id),
                'thumbnailUrl'  => wp_get_attachment_image_url($attach_id, 'thumbnail'),
                'mediumUrl'     => wp_get_attachment_image_url($attach_id, 'medium'),
                'fullUrl'       => wp_get_attachment_image_url($attach_id, 'full'),
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // MEDIA LIBRARY - List media
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/media', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $per_page = min(max(intval($req['per_page'] ?? 20), 1), 100);
            $page     = max(intval($req['page'] ?? 1), 1);
            $search   = $req['search'] ? sanitize_text_field($req['search']) : null;
            $mime     = $req['mime_type'] ? sanitize_text_field($req['mime_type']) : 'image';

            $query_args = [
                'post_type'      => 'attachment',
                'post_status'    => 'inherit',
                'posts_per_page' => $per_page,
                'paged'          => $page,
                'orderby'        => 'date',
                'order'          => 'DESC',
                'post_mime_type' => $mime,
            ];

            if ($search) {
                $query_args['s'] = $search;
            }

            $query = new WP_Query($query_args);

            $items = array_map(function ($attachment) {
                return [
                    'id'        => $attachment->ID,
                    'title'     => $attachment->post_title,
                    'url'       => wp_get_attachment_url($attachment->ID),
                    'thumbnail' => wp_get_attachment_image_url($attachment->ID, 'thumbnail'),
                    'medium'    => wp_get_attachment_image_url($attachment->ID, 'medium'),
                    'full'      => wp_get_attachment_image_url($attachment->ID, 'full'),
                    'alt'       => get_post_meta($attachment->ID, '_wp_attachment_image_alt', true),
                    'mime'      => $attachment->post_mime_type,
                    'date'      => $attachment->post_date,
                    'filesize'  => filesize(get_attached_file($attachment->ID)) ?: null,
                ];
            }, $query->posts);

            return [
                'count'       => count($items),
                'total'       => $query->found_posts,
                'pages'       => $query->max_num_pages,
                'currentPage' => $page,
                'items'       => $items,
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // DELETE MEDIA
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/media/(?P<id>\d+)', [
        'methods'             => 'DELETE',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $attachment_id = intval($req['id']);

            if (get_post_type($attachment_id) !== 'attachment') {
                return new WP_Error('not_found', 'Attachment not found', ['status' => 404]);
            }

            $deleted = wp_delete_attachment($attachment_id, true);
            if (!$deleted) {
                return new WP_Error('delete_failed', 'Unable to delete attachment', ['status' => 500]);
            }

            return ['success' => true, 'id' => $attachment_id];
        },
    ]);

    // -------------------------------------------------------------------------
    // WOOCOMMERCE - Product blog integration (only if WooCommerce active)
    // -------------------------------------------------------------------------
    if (class_exists('WooCommerce')) {

        // List products
        register_rest_route('aiblog/v1', '/wc/products', [
            'methods'             => 'GET',
            'permission_callback' => 'aiblog_check_token',
            'callback'            => function ($req) {
                $per_page = min(max(intval($req['per_page'] ?? 20), 1), 100);
                $page     = max(intval($req['page'] ?? 1), 1);
                $search   = $req['search'] ? sanitize_text_field($req['search']) : null;
                $category = $req['category'] ? sanitize_text_field($req['category']) : null;
                $status   = sanitize_key($req['status'] ?? 'publish');

                $query_args = [
                    'post_type'      => 'product',
                    'post_status'    => $status,
                    'posts_per_page' => $per_page,
                    'paged'          => $page,
                    'orderby'        => 'date',
                    'order'          => 'DESC',
                ];

                if ($search) {
                    $query_args['s'] = $search;
                }
                if ($category) {
                    $query_args['tax_query'] = [
                        [
                            'taxonomy' => 'product_cat',
                            'field'    => 'slug',
                            'terms'    => $category,
                        ],
                    ];
                }

                $query = new WP_Query($query_args);

                $items = array_map(function ($p) {
                    $product = wc_get_product($p->ID);
                    if (!$product) return null;
                    return [
                        'id'            => $p->ID,
                        'name'          => $product->get_name(),
                        'slug'          => $product->get_slug(),
                        'status'        => $product->get_status(),
                        'price'         => $product->get_price(),
                        'regular_price' => $product->get_regular_price(),
                        'sale_price'    => $product->get_sale_price(),
                        'sku'           => $product->get_sku(),
                        'stock_status'  => $product->get_stock_status(),
                        'categories'    => wp_get_post_terms($p->ID, 'product_cat', ['fields' => 'names']),
                        'url'           => get_permalink($p->ID),
                        'image'         => wp_get_attachment_url($product->get_image_id()),
                        'short_description' => $product->get_short_description(),
                    ];
                }, $query->posts);

                // Filter out nulls
                $items = array_values(array_filter($items));

                return [
                    'count'       => count($items),
                    'total'       => $query->found_posts,
                    'pages'       => $query->max_num_pages,
                    'currentPage' => $page,
                    'items'       => $items,
                ];
            },
        ]);

        // Get single product
        register_rest_route('aiblog/v1', '/wc/product/(?P<id>\d+)', [
            'methods'             => 'GET',
            'permission_callback' => 'aiblog_check_token',
            'callback'            => function ($req) {
                $product_id = intval($req['id']);
                $product = wc_get_product($product_id);

                if (!$product) {
                    return new WP_Error('not_found', 'Product not found', ['status' => 404]);
                }

                return [
                    'id'                => $product->get_id(),
                    'name'              => $product->get_name(),
                    'slug'              => $product->get_slug(),
                    'type'              => $product->get_type(),
                    'status'            => $product->get_status(),
                    'description'       => $product->get_description(),
                    'short_description' => $product->get_short_description(),
                    'price'             => $product->get_price(),
                    'regular_price'     => $product->get_regular_price(),
                    'sale_price'        => $product->get_sale_price(),
                    'sku'               => $product->get_sku(),
                    'stock_status'      => $product->get_stock_status(),
                    'stock_quantity'    => $product->get_stock_quantity(),
                    'weight'            => $product->get_weight(),
                    'categories'        => wp_get_post_terms($product_id, 'product_cat', ['fields' => 'names']),
                    'tags'              => wp_get_post_terms($product_id, 'product_tag', ['fields' => 'names']),
                    'url'               => get_permalink($product_id),
                    'image'             => wp_get_attachment_url($product->get_image_id()),
                    'gallery'           => array_map('wp_get_attachment_url', $product->get_gallery_image_ids()),
                    'attributes'        => aiblog_get_product_attributes($product),
                    'created_at'        => $product->get_date_created() ? $product->get_date_created()->format('c') : null,
                    'updated_at'        => $product->get_date_modified() ? $product->get_date_modified()->format('c') : null,
                ];
            },
        ]);

        // Product categories
        register_rest_route('aiblog/v1', '/wc/categories', [
            'methods'             => 'GET',
            'permission_callback' => 'aiblog_check_token',
            'callback'            => function () {
                $categories = get_terms([
                    'taxonomy'   => 'product_cat',
                    'hide_empty' => false,
                ]);
                if (is_wp_error($categories)) {
                    return [];
                }
                return array_values(array_map(function ($cat) {
                    return [
                        'id'     => $cat->term_id,
                        'name'   => $cat->name,
                        'slug'   => $cat->slug,
                        'count'  => $cat->count,
                        'parent' => $cat->parent,
                    ];
                }, $categories));
            },
        ]);

        // Link blog post to product
        register_rest_route('aiblog/v1', '/wc/link', [
            'methods'             => 'POST',
            'permission_callback' => 'aiblog_check_token',
            'callback'            => function ($req) {
                $post_id = intval($req['postId'] ?? 0);
                $product_id = intval($req['productId'] ?? 0);

                if (!$post_id || get_post_type($post_id) !== 'post') {
                    return new WP_Error('invalid_post', 'Invalid post ID', ['status' => 400]);
                }
                if (!$product_id || get_post_type($product_id) !== 'product') {
                    return new WP_Error('invalid_product', 'Invalid product ID', ['status' => 400]);
                }

                // Store bidirectional link
                update_post_meta($post_id, '_aiblog_linked_product', $product_id);

                $existing = get_post_meta($product_id, '_aiblog_linked_posts', true);
                if (!is_array($existing)) $existing = [];
                if (!in_array($post_id, $existing)) {
                    $existing[] = $post_id;
                    update_post_meta($product_id, '_aiblog_linked_posts', $existing);
                }

                return [
                    'success'    => true,
                    'postId'     => $post_id,
                    'productId'  => $product_id,
                    'postUrl'    => get_permalink($post_id),
                    'productUrl' => get_permalink($product_id),
                ];
            },
        ]);
    }

    // -------------------------------------------------------------------------
    // SEARCH POSTS (enhanced search)
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/search', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function ($req) {
            $q = sanitize_text_field($req['q'] ?? '');
            $type = sanitize_key($req['type'] ?? 'post');
            $limit = min(max(intval($req['limit'] ?? 20), 1), 50);

            if (!$q) {
                return new WP_Error('no_query', 'Search query is required', ['status' => 400]);
            }

            $query_args = [
                'post_type'      => $type === 'product' && class_exists('WooCommerce') ? 'product' : 'post',
                'post_status'    => ['publish', 'draft', 'pending', 'future'],
                'posts_per_page' => $limit,
                's'              => $q,
                'orderby'        => 'relevance',
            ];

            $query = new WP_Query($query_args);

            $items = array_map(function ($p) {
                $data = [
                    'id'        => $p->ID,
                    'title'     => get_the_title($p),
                    'type'      => $p->post_type,
                    'status'    => $p->post_status,
                    'date'      => get_post_time('c', true, $p),
                    'url'       => get_permalink($p),
                    'excerpt'   => wp_trim_words(wp_strip_all_tags($p->post_content), 30),
                ];
                return $data;
            }, $query->posts);

            return [
                'query'   => $q,
                'count'   => count($items),
                'total'   => $query->found_posts,
                'items'   => $items,
            ];
        },
    ]);

    // -------------------------------------------------------------------------
    // SITE INFO - General site information
    // -------------------------------------------------------------------------
    register_rest_route('aiblog/v1', '/site', [
        'methods'             => 'GET',
        'permission_callback' => 'aiblog_check_token',
        'callback'            => function () {
            $counts = wp_count_posts('post');

            $data = [
                'name'         => get_bloginfo('name'),
                'description'  => get_bloginfo('description'),
                'url'          => home_url(),
                'adminUrl'     => admin_url(),
                'language'     => get_bloginfo('language'),
                'timezone'     => wp_timezone_string(),
                'postCounts'   => [
                    'publish' => intval($counts->publish),
                    'draft'   => intval($counts->draft),
                    'pending' => intval($counts->pending),
                    'future'  => intval($counts->future),
                    'trash'   => intval($counts->trash),
                ],
                'categories'   => wp_count_terms(['taxonomy' => 'category']),
                'tags'         => wp_count_terms(['taxonomy' => 'post_tag']),
                'users'        => count_users(),
                'activeTheme'  => wp_get_theme()->get('Name'),
                'plugins'      => [
                    'woocommerce' => class_exists('WooCommerce'),
                    'yoast'       => defined('WPSEO_VERSION'),
                    'rankmath'    => class_exists('RankMath'),
                    'aiblog'      => AIBLOG_VERSION,
                ],
            ];

            if (class_exists('WooCommerce')) {
                $product_counts = wp_count_posts('product');
                $data['productCounts'] = [
                    'publish' => intval($product_counts->publish),
                    'draft'   => intval($product_counts->draft),
                ];
            }

            return $data;
        },
    ]);

}); // end rest_api_init


// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check authorization - supports both Bearer token and Basic auth
 */
function aiblog_check_token() {
    // Try multiple ways to get the Authorization header (server configs vary)
    $header = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (isset($headers['Authorization'])) {
            $header = $headers['Authorization'];
        } elseif (isset($headers['authorization'])) {
            $header = $headers['authorization'];
        }
    }

    // Debug logging
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('[AI Blog Auth] Authorization header present: ' . (!empty($header) ? 'YES' : 'NO'));
        if ($header) {
            error_log('[AI Blog Auth] Header format: ' . substr($header, 0, 20) . '...');
        }
    }

    if (empty($header)) {
        return new WP_Error('forbidden', 'Authorization header not found. If using Apache, ensure mod_rewrite is enabled. Go to your-site/wp-json/aiblog/v1/health to diagnose.', ['status' => 403]);
    }

    // -------------------------------------------------------------------------
    // METHOD 1: Basic Authentication (WordPress Application Passwords)
    // -------------------------------------------------------------------------
    if (preg_match('/Basic\s+(.*)/i', $header, $m)) {
        $credentials = base64_decode(trim($m[1]));
        if (!$credentials || strpos($credentials, ':') === false) {
            return new WP_Error('forbidden', 'Invalid Basic auth format', ['status' => 401]);
        }

        list($username, $password) = explode(':', $credentials, 2);

        // Authenticate user
        $user = wp_authenticate($username, $password);

        if (is_wp_error($user)) {
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('[AI Blog Auth] Basic auth failed for user "' . $username . '": ' . $user->get_error_message());
            }
            return new WP_Error('forbidden', 'Invalid username or password. For Basic Auth, use an Application Password (generate one at Users > Profile > Application Passwords).', ['status' => 401]);
        }

        // Check if user has appropriate permissions (editor or administrator)
        if (!user_can($user, 'edit_posts')) {
            return new WP_Error('forbidden', 'User does not have sufficient permissions. Requires Editor or Administrator role.', ['status' => 403]);
        }

        // Set current user for the request
        wp_set_current_user($user->ID);

        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[AI Blog Auth] Basic auth successful for user: ' . $username);
        }

        return true;
    }

    // -------------------------------------------------------------------------
    // METHOD 2: Bearer Token (Custom API Token)
    // -------------------------------------------------------------------------
    if (preg_match('/Bearer\s+(.*)/i', $header, $m)) {
        $expected = trim(get_option('aiblog_api_token', ''));

        if (!$expected) {
            return new WP_Error('forbidden', 'Bearer token not configured on WordPress. Go to Settings > AI Blog Token to set up a token.', ['status' => 403]);
        }

        $received_token = trim($m[1]);

        // Debug logging
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[AI Blog Auth] Bearer token - Expected length: ' . strlen($expected));
            error_log('[AI Blog Auth] Bearer token - Received length: ' . strlen($received_token));
            error_log('[AI Blog Auth] Bearer token - Match: ' . (hash_equals($expected, $received_token) ? 'YES' : 'NO'));
        }

        if (!hash_equals($expected, $received_token)) {
            return new WP_Error('forbidden', 'Invalid bearer token. Copy the exact token from Settings > AI Blog Token in WordPress admin.', ['status' => 403]);
        }

        // Set a default admin user for Bearer token requests
        $admin_users = get_users(['role' => 'administrator', 'number' => 1]);
        if (!empty($admin_users)) {
            wp_set_current_user($admin_users[0]->ID);
        }

        return true;
    }

    // -------------------------------------------------------------------------
    // Unknown authorization method
    // -------------------------------------------------------------------------
    return new WP_Error('forbidden', 'Unsupported authorization method. Use "Bearer <token>" or "Basic <base64>" format.', ['status' => 403]);
}

/**
 * Format a post object for API response
 */
function aiblog_format_post($post, $include_content = false) {
    $data = [
        'id'            => $post->ID,
        'title'         => get_the_title($post),
        'status'        => $post->post_status,
        'excerpt'       => wp_strip_all_tags($post->post_excerpt),
        'url'           => get_permalink($post),
        'editUrl'       => admin_url("post.php?post={$post->ID}&action=edit"),
        'created_at'    => get_post_time('c', true, $post),
        'updated_at'    => get_post_modified_time('c', true, $post),
        'tags'          => wp_get_post_tags($post->ID, ['fields' => 'names']),
        'categories'    => wp_get_post_categories($post->ID, ['fields' => 'names']),
        'views'         => intval(get_post_meta($post->ID, 'aiblog_views', true)),
        'timeSpent'     => intval(get_post_meta($post->ID, 'aiblog_time_spent', true)),
        'last_viewed'   => get_post_meta($post->ID, 'aiblog_last_viewed', true) ?: null,
        'featuredImage' => get_the_post_thumbnail_url($post->ID, 'full') ?: null,
        'author'        => get_the_author_meta('display_name', $post->post_author),
        'aiGenerated'   => (bool)get_post_meta($post->ID, '_aiblog_generated', true),
    ];

    // Scheduled post info
    if ($post->post_status === 'future') {
        $data['scheduled_for'] = get_post_time('c', false, $post);
    }

    // Linked product (if WooCommerce)
    $linked_product = get_post_meta($post->ID, '_aiblog_linked_product', true);
    if ($linked_product) {
        $data['linkedProduct'] = [
            'id'  => intval($linked_product),
            'url' => get_permalink($linked_product),
            'name' => get_the_title($linked_product),
        ];
    }

    if ($include_content) {
        $data['content'] = apply_filters('the_content', $post->post_content);
        $data['rawContent'] = $post->post_content;
        $data['metaTitle'] = get_post_meta($post->ID, '_aiblog_meta_title', true)
            ?: get_post_meta($post->ID, '_yoast_wpseo_title', true)
            ?: get_post_meta($post->ID, 'rank_math_title', true);
        $data['metaDescription'] = get_post_meta($post->ID, '_aiblog_meta_description', true)
            ?: get_post_meta($post->ID, '_yoast_wpseo_metadesc', true)
            ?: get_post_meta($post->ID, 'rank_math_description', true);
        $data['focusKeyword'] = get_post_meta($post->ID, '_aiblog_focus_keyword', true)
            ?: get_post_meta($post->ID, '_yoast_wpseo_focuskw', true)
            ?: get_post_meta($post->ID, 'rank_math_focus_keyword', true);
        $data['customFields'] = [];
        $all_meta = get_post_meta($post->ID);
        foreach ($all_meta as $key => $values) {
            if (strpos($key, '_aiblog_') === 0 && $key !== '_aiblog_generated' && $key !== '_aiblog_generated_at') {
                $data['customFields'][$key] = $values[0];
            }
        }
    }

    return $data;
}

/**
 * Download and attach an image from URL
 */
function aiblog_sideload_image($url, $post_id = 0, $base64_data = '', $provided_name = '') {
    require_once ABSPATH . 'wp-admin/includes/file.php';
    require_once ABSPATH . 'wp-admin/includes/media.php';
    require_once ABSPATH . 'wp-admin/includes/image.php';

    $tmp = false;
    $filename = '';

    // ------------------------------------------------------------------
    // Option 1: base64 image data (data URI or raw base64)
    // ------------------------------------------------------------------
    if (!empty($base64_data)) {
        $data_string = $base64_data;

        // If data URI, strip the prefix and detect mime
        $mime = 'image/jpeg';
        if (preg_match('/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/', $data_string, $matches)) {
            $mime = strtolower($matches[1]);
            $data_string = $matches[2];
        }

        $binary = base64_decode($data_string);
        if ($binary === false) {
            return new WP_Error('invalid_image_data', 'Could not decode base64 image data');
        }

        // Derive extension from mime
        $ext = 'jpg';
        if (strpos($mime, 'png') !== false) $ext = 'png';
        elseif (strpos($mime, 'gif') !== false) $ext = 'gif';
        elseif (strpos($mime, 'webp') !== false) $ext = 'webp';
        elseif (strpos($mime, 'svg') !== false) $ext = 'svg';
        elseif (strpos($mime, 'bmp') !== false) $ext = 'bmp';

        $filename = $provided_name ?: 'image-' . time() . '.' . $ext;
        $filename = sanitize_file_name($filename);
        if (!pathinfo($filename, PATHINFO_EXTENSION)) {
            $filename .= '.' . $ext;
        }

        $tmp = wp_tempnam($filename);
        if (!$tmp) {
            return new WP_Error('temp_file_error', 'Unable to create temporary file for image');
        }

        $written = file_put_contents($tmp, $binary);
        if ($written === false) {
            return new WP_Error('write_error', 'Failed to write image data to temporary file');
        }
    }

    // ------------------------------------------------------------------
    // Option 2: external URL
    // ------------------------------------------------------------------
    if (!$tmp) {
        if (!$url) {
            return new WP_Error('no_image_source', 'No image URL or data provided');
        }

        $tmp = download_url($url, 30); // 30 second timeout
        if (is_wp_error($tmp)) {
            return $tmp;
        }

        $filename = basename(parse_url($url, PHP_URL_PATH));
        if (!$filename || strlen($filename) < 3) {
            $filename = 'image-' . time() . '.jpg';
        }
    }

    // Ensure valid extension
    $ext = pathinfo($filename, PATHINFO_EXTENSION);
    if (!in_array(strtolower($ext), ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'])) {
        $filename .= '.jpg';
    }

    $file_array = [
        'name'     => sanitize_file_name($filename),
        'tmp_name' => $tmp,
    ];

    // Add mime type if detectable (helps WP validate)
    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo) {
            $detected = finfo_file($finfo, $tmp);
            if ($detected) {
                $file_array['type'] = $detected;
            }
            finfo_close($finfo);
        }
    }

    $attach_id = media_handle_sideload($file_array, $post_id);

    // Clean up temp file if sideload failed
    if (is_wp_error($attach_id)) {
        @unlink($tmp);
    }

    return $attach_id;
}

/**
 * Get WooCommerce product attributes formatted for API
 */
function aiblog_get_product_attributes($product) {
    $attributes = [];
    foreach ($product->get_attributes() as $attr) {
        if (is_a($attr, 'WC_Product_Attribute')) {
            $attributes[] = [
                'name'    => $attr->get_name(),
                'options' => $attr->get_options(),
                'visible' => $attr->get_visible(),
            ];
        }
    }
    return $attributes;
}


// ============================================================================
// AUTOMATIC VIEW TRACKING
// ============================================================================

/**
 * Track views automatically on single post pages
 */
add_action('wp_head', function () {
    if (!is_single() || get_post_type() !== 'post') {
        return;
    }

    $post_id = get_the_ID();
    $endpoint = esc_url_raw(rest_url('aiblog/v1/views'));
    $heartbeat = esc_url_raw(rest_url('aiblog/v1/views/heartbeat'));
    ?>
    <script>
    (function() {
        var postId = <?php echo $post_id; ?>;
        var viewedKey = 'aiblog_viewed_' + postId;
        var started = performance.now();
        var lastBeat = started;

        // Send a single view per sessionStorage
        if (!sessionStorage.getItem(viewedKey)) {
          sessionStorage.setItem(viewedKey, '1');
          fetch('<?php echo $endpoint; ?>?_t=' + Date.now(), {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({postId: postId})
          }).catch(function(){});
        }

        function sendHeartbeat(force) {
          var now = performance.now();
          var elapsed = Math.max(0, now - lastBeat);
          if (!force && elapsed < 5000) return; // throttle
          lastBeat = now;
          fetch('<?php echo $heartbeat; ?>?_t=' + Date.now(), {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({
                postId: postId,
                millis: Math.round(elapsed)
              })
          }).catch(function(){});
        }

        var beatTimer = setInterval(sendHeartbeat, 15000);
        document.addEventListener('visibilitychange', function() {
          if (document.visibilityState === 'hidden') {
            sendHeartbeat(true);
          }
        });
        window.addEventListener('beforeunload', function() {
          sendHeartbeat(true);
          clearInterval(beatTimer);
        });
    })();
    </script>
    <?php
});

// Frontend tracker for all public pages (pageview + heartbeat)
add_action('wp_enqueue_scripts', function () {
    $endpoint = esc_url_raw(rest_url('aiblog/v1/collect'));
    $site_id  = get_option('aiblog_site_id', site_url());
    $script = "
    (function(){
      var dest = " . wp_json_encode($site_id) . ";
      var endpoint = " . wp_json_encode($endpoint) . ";
      var sessionKey = 'aiblog_session';
      function getSession(){
        var s = localStorage.getItem(sessionKey);
        if(s){
          try { s = JSON.parse(s); } catch(e){ s=null; }
        }
        var now = Date.now();
        if(!s || (now - (s.last || 0)) > 30*60*1000){
          s = { id: crypto.randomUUID ? crypto.randomUUID() : ('sess-'+now+'-'+Math.random().toString(16).slice(2)), last: now };
        }
        s.last = now;
        localStorage.setItem(sessionKey, JSON.stringify(s));
        return s.id;
      }
      var sessionId = getSession();
      function send(event, extra){
        var payload = Object.assign({
          destinationId: dest,
          sessionId: sessionId,
          event: event,
          url: location.href,
          referrer: document.referrer || '',
          ua: navigator.userAgent,
          viewport: window.innerWidth + 'x' + window.innerHeight,
          ts: Date.now()
        }, extra||{});
        navigator.sendBeacon(endpoint, JSON.stringify(payload));
      }
      send('pageview');
      var lastBeat = Date.now();
      function beat(){
        var now = Date.now();
        var delta = now - lastBeat;
        lastBeat = now;
        send('heartbeat', { deltaMs: delta });
      }
      var iv = setInterval(beat, 15000);
      document.addEventListener('visibilitychange', function(){ if(document.visibilityState==='hidden'){ beat(); }});
      window.addEventListener('beforeunload', function(){ beat(); clearInterval(iv); });
      var maxScroll = 0;
      window.addEventListener('scroll', function(){
        var h = document.documentElement;
        var pct = Math.round((h.scrollTop)/(h.scrollHeight - h.clientHeight) * 100);
        if (pct > maxScroll && pct % 10 === 0){ maxScroll = pct; send('scroll', { scrollPct: pct }); }
      }, { passive:true });
    })();
    ";
    wp_register_script('aiblog-tracker', '', [], null, true);
    wp_enqueue_script('aiblog-tracker');
    wp_add_inline_script('aiblog-tracker', $script);
});


// ============================================================================
// ADMIN SETTINGS PAGE
// ============================================================================

add_action('admin_menu', function () {
    add_options_page(
        'AI Blog Token',
        'AI Blog Token',
        'manage_options',
        'aiblog-token',
        'aiblog_render_settings_page'
    );
});

add_action('admin_init', function () {
    register_setting('aiblog_token_group', 'aiblog_api_token', [
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
});

function aiblog_render_settings_page() {
    if (!current_user_can('manage_options')) {
        return;
    }

    $token = get_option('aiblog_api_token', '');
    $site_url = home_url();

    // Run diagnostics
    $diagnostics = aiblog_run_diagnostics();

    // Show save confirmation
    if (isset($_GET['settings-updated']) && $_GET['settings-updated']) {
        $saved_token = get_option('aiblog_api_token', '');
        echo '<div class="notice notice-success"><p><strong>Token saved successfully!</strong><br>';
        echo 'Length: ' . strlen($saved_token) . ' characters</p></div>';
    }
    ?>
    <div class="wrap">
        <h1>AI Blog Token Settings <span style="font-size:13px;color:#666;font-weight:normal;">v<?php echo AIBLOG_VERSION; ?></span></h1>

        <!-- Connection Status -->
        <div style="background:<?php echo $diagnostics['healthy'] ? '#f0fdf4' : '#fef2f2'; ?>;border:1px solid <?php echo $diagnostics['healthy'] ? '#22c55e' : '#ef4444'; ?>;border-left:4px solid <?php echo $diagnostics['healthy'] ? '#22c55e' : '#ef4444'; ?>;padding:16px;margin:20px 0;border-radius:4px;">
            <h3 style="margin:0 0 10px;color:<?php echo $diagnostics['healthy'] ? '#166534' : '#991b1b'; ?>;">
                <?php echo $diagnostics['healthy'] ? '&#10003; System Healthy' : '&#9888; Issues Detected'; ?>
            </h3>
            <?php foreach ($diagnostics['checks'] as $check): ?>
                <div style="display:flex;align-items:center;gap:8px;margin:4px 0;">
                    <span style="color:<?php echo $check['ok'] ? '#22c55e' : '#ef4444'; ?>;font-size:16px;">
                        <?php echo $check['ok'] ? '&#10003;' : '&#10007;'; ?>
                    </span>
                    <span><?php echo esc_html($check['label']); ?></span>
                    <?php if (!$check['ok'] && !empty($check['fix'])): ?>
                        <span style="color:#6b7280;font-size:12px;"> &mdash; <?php echo esc_html($check['fix']); ?></span>
                    <?php endif; ?>
                </div>
            <?php endforeach; ?>
        </div>

        <!-- API Endpoint Info -->
        <div style="background:#fff;border:1px solid #ccd0d4;border-left:4px solid #0073aa;padding:16px;margin:20px 0;border-radius:4px;">
            <strong>API Base URL:</strong> <code><?php echo esc_html($site_url); ?>/wp-json/aiblog/v1/</code><br><br>
            <strong>Authentication Methods:</strong>
            <ol style="margin:10px 0 0 20px;">
                <li><strong>Bearer Token</strong> &mdash; Configure below, use as <code>Authorization: Bearer &lt;token&gt;</code></li>
                <li><strong>Basic Auth</strong> &mdash; WordPress Application Password. <a href="<?php echo admin_url('profile.php#application-passwords-section'); ?>" target="_blank">Generate one here</a></li>
            </ol>
        </div>

        <!-- Token Form -->
        <form method="post" action="options.php">
            <?php settings_fields('aiblog_token_group'); ?>

            <table class="form-table" role="presentation">
                <tr>
                    <th scope="row"><label for="aiblog_api_token">API Token</label></th>
                    <td>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <input name="aiblog_api_token" id="aiblog_api_token" type="text"
                                   class="large-text code" style="max-width:500px;font-family:monospace;"
                                   value="<?php echo esc_attr($token); ?>"
                                   oninput="updateCharCount()" />
                            <button type="button" class="button" onclick="generateToken()">Generate Token</button>
                            <button type="button" class="button" onclick="copyToken()">Copy</button>
                        </div>
                        <p class="description">
                            <span id="char-count" style="font-weight:bold;color:<?php echo strlen($token) > 0 ? '#059669' : '#dc2626'; ?>">
                                <?php echo strlen($token); ?> characters
                            </span>
                        </p>
                    </td>
                </tr>
            </table>

            <?php submit_button('Save Token'); ?>
        </form>

        <hr>

        <!-- Quick Test -->
        <h2>Quick Connection Test</h2>
        <p>
            <button type="button" class="button button-secondary" onclick="testConnection()">
                Test Connection
            </button>
            <span id="test-result" style="margin-left:12px;"></span>
        </p>

        <hr>

        <!-- Endpoints Reference -->
        <h2>Available Endpoints</h2>
        <table class="widefat" style="max-width:900px;">
            <thead>
                <tr>
                    <th>Endpoint</th>
                    <th>Method</th>
                    <th>Auth</th>
                    <th>Description</th>
                </tr>
            </thead>
            <tbody>
                <tr><td><code>/health</code></td><td>GET</td><td>No</td><td>System health check and diagnostics</td></tr>
                <tr><td><code>/debug</code></td><td>GET</td><td>No</td><td>Auth header debugging</td></tr>
                <tr><td><code>/ping</code></td><td>GET</td><td>Yes</td><td>Test authenticated connection</td></tr>
                <tr><td><code>/site</code></td><td>GET</td><td>Yes</td><td>Site information and stats</td></tr>
                <tr style="background:#f9fafb;"><td colspan="4"><strong>Posts</strong></td></tr>
                <tr><td><code>/post</code></td><td>POST</td><td>Yes</td><td>Create/update post (draft, publish, or schedule)</td></tr>
                <tr><td><code>/posts</code></td><td>GET</td><td>Yes</td><td>List posts with filters</td></tr>
                <tr><td><code>/post/{id}</code></td><td>GET</td><td>Yes</td><td>Get single post with full content</td></tr>
                <tr><td><code>/post/{id}</code></td><td>DELETE</td><td>Yes</td><td>Delete or trash post</td></tr>
                <tr><td><code>/post/{id}/status</code></td><td>PUT</td><td>Yes</td><td>Quick status change</td></tr>
                <tr><td><code>/post/{id}/revisions</code></td><td>GET</td><td>Yes</td><td>Post revision history</td></tr>
                <tr><td><code>/search</code></td><td>GET</td><td>Yes</td><td>Search posts and products</td></tr>
                <tr style="background:#f9fafb;"><td colspan="4"><strong>Analytics</strong></td></tr>
                <tr><td><code>/views</code></td><td>POST</td><td>No</td><td>Track post view</td></tr>
                <tr><td><code>/analytics</code></td><td>GET</td><td>Yes</td><td>Full analytics dashboard data</td></tr>
                <tr style="background:#f9fafb;"><td colspan="4"><strong>Taxonomy</strong></td></tr>
                <tr><td><code>/categories</code></td><td>GET/POST</td><td>Yes</td><td>List or create categories</td></tr>
                <tr><td><code>/tags</code></td><td>GET/POST</td><td>Yes</td><td>List or create tags</td></tr>
                <tr style="background:#f9fafb;"><td colspan="4"><strong>Media</strong></td></tr>
                <tr><td><code>/upload</code></td><td>POST</td><td>Yes</td><td>Upload image from URL</td></tr>
                <tr><td><code>/media</code></td><td>GET</td><td>Yes</td><td>List media library</td></tr>
                <tr><td><code>/media/{id}</code></td><td>DELETE</td><td>Yes</td><td>Delete media</td></tr>
                <tr><td><code>/bulk</code></td><td>POST</td><td>Yes</td><td>Bulk operations</td></tr>
                <?php if (class_exists('WooCommerce')): ?>
                <tr style="background:#f9fafb;"><td colspan="4"><strong>WooCommerce</strong></td></tr>
                <tr><td><code>/wc/products</code></td><td>GET</td><td>Yes</td><td>List WooCommerce products</td></tr>
                <tr><td><code>/wc/product/{id}</code></td><td>GET</td><td>Yes</td><td>Get single product</td></tr>
                <tr><td><code>/wc/categories</code></td><td>GET</td><td>Yes</td><td>Product categories</td></tr>
                <tr><td><code>/wc/link</code></td><td>POST</td><td>Yes</td><td>Link blog post to product</td></tr>
                <?php endif; ?>
            </tbody>
        </table>

        <script>
        function generateToken() {
            var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-';
            var token = '';
            var array = new Uint8Array(48);
            window.crypto.getRandomValues(array);
            for (var i = 0; i < 48; i++) {
                token += chars.charAt(array[i] % chars.length);
            }
            document.getElementById('aiblog_api_token').value = token;
            updateCharCount();
        }

        function copyToken() {
            var tokenField = document.getElementById('aiblog_api_token');
            tokenField.select();
            document.execCommand('copy');
            var btn = event.target;
            btn.textContent = 'Copied!';
            setTimeout(function() { btn.textContent = 'Copy'; }, 2000);
        }

        function updateCharCount() {
            var length = document.getElementById('aiblog_api_token').value.length;
            var span = document.getElementById('char-count');
            span.textContent = length + ' characters';
            span.style.color = length > 0 ? '#059669' : '#dc2626';
        }

        function testConnection() {
            var resultEl = document.getElementById('test-result');
            resultEl.innerHTML = '<span style="color:#6b7280;">Testing...</span>';

            var token = document.getElementById('aiblog_api_token').value;
            if (!token) {
                resultEl.innerHTML = '<span style="color:#ef4444;">&#10007; No token configured. Save a token first.</span>';
                return;
            }

            fetch('<?php echo esc_url(rest_url('aiblog/v1/ping')); ?>', {
                headers: { 'Authorization': 'Bearer ' + token }
            })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.success) {
                    resultEl.innerHTML = '<span style="color:#22c55e;">&#10003; Connection successful! Site: ' + data.site + '</span>';
                } else {
                    resultEl.innerHTML = '<span style="color:#ef4444;">&#10007; Auth failed: ' + (data.message || 'Unknown error') + '</span>';
                }
            })
            .catch(function(err) {
                resultEl.innerHTML = '<span style="color:#ef4444;">&#10007; Connection error: ' + err.message + '</span>';
            });
        }
        </script>
    </div>
    <?php
}

/**
 * Run diagnostics for admin settings page
 */
function aiblog_run_diagnostics() {
    $checks = [];
    $all_ok = true;

    // HTTPS
    $is_ssl = is_ssl();
    $is_local = defined('WP_ENVIRONMENT_TYPE') && WP_ENVIRONMENT_TYPE === 'local';
    $https_ok = $is_ssl || $is_local;
    $checks[] = [
        'label' => 'HTTPS enabled' . ($is_local ? ' (local override)' : ''),
        'ok'    => $https_ok,
        'fix'   => $https_ok ? '' : 'Basic Auth requires HTTPS. Install SSL certificate or add WP_ENVIRONMENT_TYPE=local to wp-config.php',
    ];
    if (!$https_ok) $all_ok = false;

    // REST API
    $checks[] = [
        'label' => 'REST API accessible',
        'ok'    => true,
    ];

    // Permalinks
    $permalink = get_option('permalink_structure');
    $permalink_ok = !empty($permalink);
    $checks[] = [
        'label' => 'Pretty permalinks enabled',
        'ok'    => $permalink_ok,
        'fix'   => $permalink_ok ? '' : 'Go to Settings > Permalinks and select any structure except "Plain"',
    ];
    if (!$permalink_ok) $all_ok = false;

    // Token
    $token = get_option('aiblog_api_token', '');
    $token_ok = !empty($token);
    $checks[] = [
        'label' => 'Bearer token configured (' . strlen($token) . ' chars)',
        'ok'    => $token_ok,
        'fix'   => $token_ok ? '' : 'Click "Generate Token" and save',
    ];
    if (!$token_ok) $all_ok = false;

    // Application Passwords
    $app_pass_ok = wp_is_application_passwords_available();
    $checks[] = [
        'label' => 'Application Passwords available (for Basic Auth)',
        'ok'    => $app_pass_ok,
        'fix'   => $app_pass_ok ? '' : 'Requires HTTPS or WP_ENVIRONMENT_TYPE=local',
    ];

    // .htaccess Authorization fix
    if (function_exists('get_home_path')) {
        $htaccess = get_home_path() . '.htaccess';
        if (file_exists($htaccess)) {
            $contents = file_get_contents($htaccess);
            $htaccess_ok = strpos($contents, 'HTTP_AUTHORIZATION') !== false;
            $checks[] = [
                'label' => '.htaccess Authorization header passthrough',
                'ok'    => $htaccess_ok,
                'fix'   => $htaccess_ok ? '' : 'Deactivate and reactivate this plugin to auto-fix, or manually add RewriteRule for HTTP_AUTHORIZATION',
            ];
            if (!$htaccess_ok) $all_ok = false;
        }
    }

    // Upload directory writable
    $upload_dir = wp_upload_dir();
    $upload_ok = wp_is_writable($upload_dir['basedir']);
    $checks[] = [
        'label' => 'Upload directory writable (for image uploads)',
        'ok'    => $upload_ok,
        'fix'   => $upload_ok ? '' : 'Fix permissions on wp-content/uploads',
    ];
    if (!$upload_ok) $all_ok = false;

    // WooCommerce
    $woo = class_exists('WooCommerce');
    $checks[] = [
        'label' => 'WooCommerce ' . ($woo ? 'active (v' . WC()->version . ')' : 'not active'),
        'ok'    => true, // Not required
    ];

    return ['healthy' => $all_ok, 'checks' => $checks];
}


// ============================================================================
// ADMIN COLUMN FOR VIEWS
// ============================================================================

add_filter('manage_posts_columns', function ($columns) {
    $columns['aiblog_views'] = 'Views';
    return $columns;
});

add_action('manage_posts_custom_column', function ($column, $post_id) {
    if ($column === 'aiblog_views') {
        $views = intval(get_post_meta($post_id, 'aiblog_views', true));
        echo number_format($views);
    }
}, 10, 2);

add_filter('manage_edit-post_sortable_columns', function ($columns) {
    $columns['aiblog_views'] = 'aiblog_views';
    return $columns;
});

add_action('pre_get_posts', function ($query) {
    if (!is_admin() || !$query->is_main_query()) {
        return;
    }
    if ($query->get('orderby') === 'aiblog_views') {
        $query->set('meta_key', 'aiblog_views');
        $query->set('orderby', 'meta_value_num');
    }
});


// ============================================================================
// ADMIN BAR QUICK LINK
// ============================================================================

add_action('admin_bar_menu', function ($wp_admin_bar) {
    if (!current_user_can('manage_options')) {
        return;
    }

    $wp_admin_bar->add_node([
        'id'    => 'aiblog-settings',
        'title' => 'AI Blog API',
        'href'  => admin_url('options-general.php?page=aiblog-token'),
        'meta'  => ['title' => 'AI Blog Token Settings'],
    ]);
}, 100);


// ============================================================================
// CLEANUP OLD DAILY VIEWS DATA (Keep 90 days)
// ============================================================================

add_action('aiblog_daily_cleanup', function () {
    global $wpdb;
    $cutoff = date('Y-m-d', strtotime('-90 days'));
    $wpdb->query($wpdb->prepare(
        "DELETE FROM {$wpdb->options} WHERE option_name LIKE %s AND option_name < %s",
        'aiblog_daily_views_%',
        "aiblog_daily_views_{$cutoff}"
    ));
});

// Backward compatibility: also hook into wp_scheduled_delete
add_action('wp_scheduled_delete', function () {
    do_action('aiblog_daily_cleanup');
});
