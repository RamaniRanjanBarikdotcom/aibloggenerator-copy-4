const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'node_modules', 'tinymce');
const dst = path.join(__dirname, '..', 'src', 'renderer', 'public', 'tinymce');

if (!fs.existsSync(src)) {
  console.error('TinyMCE source not found:', src);
  process.exit(1);
}

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });
fs.cpSync(src, dst, { recursive: true });

console.log('Copied TinyMCE to', dst);
