Standalone PHP Draft Endpoint

Install
1) Copy `blog-draft.php` to your webroot, e.g. https://your-shop.tld/api/blog-draft.php
2) Update DB credentials and token inside the file.
3) Create the table:

CREATE TABLE blog_drafts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  meta_description TEXT NULL,
  content MEDIUMTEXT NOT NULL,
  keywords TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  source VARCHAR(100) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

Request
- POST JSON to the endpoint.
- Header: X-JTL-Token: <token>
