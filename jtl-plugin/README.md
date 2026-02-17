JTL Blog Draft Receiver Plugin

What it does
- Adds a hidden Frontend-Link that acts as a JSON API endpoint.
- Stores incoming blog drafts in a plugin table for review.
- Adds a simple Adminmenu page to list drafts.

Install
1) Copy the folder `blogdraftreceiver` into your JTL shop at:
   [shop-root]/plugins/blogdraftreceiver
2) Install and activate the plugin in JTL admin.
3) In the plugin settings, set the API token.

Endpoint
- URL: https://your-shop.tld/draft-api
- Method: POST
- Header: X-JTL-Token: <token>

Payload example
{
  "title": "My draft",
  "metaDescription": "Short summary",
  "content": "<h1>...</h1>",
  "keywords": ["one", "two"],
  "status": "draft",
  "source": "aibloggenerator"
}

Notes
- The endpoint is hidden in the JTL link group by default.
- Drafts are stored in the table `xplugin_blogdraftreceiver_drafts`.
