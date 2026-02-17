const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const MarkdownIt = require('markdown-it');
const { Document, Packer, Paragraph, HeadingLevel, TextRun } = require('docx');
const cheerio = require('cheerio');

const md = new MarkdownIt();

function looksLikeHtml(content) {
  return /<\w+[^>]*>/.test(content || '');
}

function htmlToMarkdownish(html) {
  if (!html) return '';
  const $ = cheerio.load(html, { decodeEntities: true });
  const lines = [];

  // Helper to convert inline formatting recursively
  function processInlineContent(node) {
    let result = '';
    $(node).contents().each((_, child) => {
      if (child.type === 'text') {
        result += child.data || '';
      } else {
        const tag = child.tagName || '';
        if (tag === 'strong' || tag === 'b') {
          result += `**${processInlineContent(child)}**`;
        } else if (tag === 'em' || tag === 'i') {
          result += `*${processInlineContent(child)}*`;
        } else if (tag === 'code') {
          result += `\`${$(child).text()}\``;
        } else if (tag === 'a') {
          const href = $(child).attr('href') || '';
          result += `[${processInlineContent(child)}](${href})`;
        } else if (tag === 'img') {
          const src = $(child).attr('src') || '';
          const alt = $(child).attr('alt') || 'image';
          result += `![${alt}](${src})`;
        } else if (tag === 'br') {
          result += '\n';
        } else {
          // For other inline elements, process their content
          result += processInlineContent(child);
        }
      }
    });
    return result;
  }

  // Helper to convert table to markdown
  function processTable(tableNode) {
    const rows = [];
    const $table = $(tableNode);

    // Process header rows (th elements)
    $table.find('tr').each((rowIdx, tr) => {
      const cells = [];
      $(tr).find('th, td').each((_, cell) => {
        cells.push(processInlineContent(cell).trim().replace(/\|/g, '\\|'));
      });
      if (cells.length > 0) {
        rows.push(`| ${cells.join(' | ')} |`);
        // Add separator after header row (first row with th)
        if ($(tr).find('th').length > 0 && rowIdx === 0) {
          rows.push(`| ${cells.map(() => '---').join(' | ')} |`);
        }
      }
    });

    // If no header was found, add separator after first row
    if (rows.length > 0 && !rows[1]?.startsWith('| ---')) {
      const firstRow = rows[0];
      const colCount = (firstRow.match(/\|/g) || []).length - 1;
      if (colCount > 0) {
        rows.splice(1, 0, `| ${Array(colCount).fill('---').join(' | ')} |`);
      }
    }

    return rows.join('\n');
  }

  function walk(node) {
    const tag = node.tagName || '';
    if (tag === 'script' || tag === 'style') return;

    // Headings
    if (/^h[1-6]$/.test(tag)) {
      const level = parseInt(tag[1], 10);
      const content = processInlineContent(node).trim();
      if (content) {
        lines.push(`${'#'.repeat(level)} ${content}`);
        lines.push('');
      }
      return;
    }

    // Paragraphs
    if (tag === 'p') {
      const content = processInlineContent(node).trim();
      if (content) {
        lines.push(content);
        lines.push('');
      }
      return;
    }

    // Blockquotes
    if (tag === 'blockquote') {
      const content = processInlineContent(node).trim();
      const quotedLines = content.split('\n').map((l) => `> ${l}`).join('\n');
      lines.push(quotedLines);
      lines.push('');
      return;
    }

    // Unordered lists
    if (tag === 'ul') {
      $(node).children('li').each((_, li) => {
        const content = processInlineContent(li).trim();
        lines.push(`- ${content}`);
      });
      lines.push('');
      return;
    }

    // Ordered lists
    if (tag === 'ol') {
      $(node).children('li').each((idx, li) => {
        const content = processInlineContent(li).trim();
        lines.push(`${idx + 1}. ${content}`);
      });
      lines.push('');
      return;
    }

    // Horizontal rule
    if (tag === 'hr') {
      lines.push('---');
      lines.push('');
      return;
    }

    // Code blocks
    if (tag === 'pre') {
      const codeNode = $(node).find('code');
      const codeText = codeNode.length ? codeNode.text() : $(node).text();
      lines.push('```');
      lines.push(codeText);
      lines.push('```');
      lines.push('');
      return;
    }

    // Images
    if (tag === 'img') {
      const src = $(node).attr('src') || '';
      const alt = $(node).attr('alt') || 'image';
      lines.push(`![${alt}](${src})`);
      lines.push('');
      return;
    }

    // Tables
    if (tag === 'table') {
      const tableMarkdown = processTable(node);
      if (tableMarkdown) {
        lines.push(tableMarkdown);
        lines.push('');
      }
      return;
    }

    // Line breaks at block level
    if (tag === 'br') {
      lines.push('');
      return;
    }

    // Divs and other containers - walk children
    if (tag === 'div' || tag === 'section' || tag === 'article' || tag === 'main' || tag === 'header' || tag === 'footer') {
      $(node).contents().each((_, child) => walk(child));
      return;
    }

    // Default: walk children for unknown block elements
    $(node).contents().each((_, child) => walk(child));
  }

  // Start processing from body or root
  const $body = $('body');
  if ($body.length) {
    $body.contents().each((_, child) => walk(child));
  } else {
    $.root().contents().each((_, child) => walk(child));
  }

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeFileName(name) {
  const cleaned = (name || 'blog').replace(/[^a-z0-9-_. ]/gi, '').trim();
  return cleaned ? cleaned.replace(/\s+/g, '-') : 'blog';
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function buildHtmlDocument(blog) {
  const content = blog.content || '';
  const body = looksLikeHtml(content) ? content : md.render(content);
  const title = blog.title || 'Blog';
  const description = blog.metaDescription || '';
  const hasH1 = /<h1\b[^>]*>/i.test(body);

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    ${description ? `<meta name="description" content="${description}" />` : ''}
    <style>
      body { font-family: Georgia, 'Times New Roman', serif; margin: 40px; line-height: 1.6; color: #1f2937; }
      h1, h2, h3 { color: #111827; }
      img { max-width: 100%; }
      hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.5em 0; }
      table { border-collapse: collapse; width: 100%; margin: 1.5em 0; }
      th, td { border: 1px solid #d1d5db; padding: 10px 12px; text-align: left; }
      th { background-color: #f3f4f6; font-weight: 600; }
      tr:nth-child(even) { background-color: #f9fafb; }
      blockquote { border-left: 4px solid #3b82f6; margin: 1.5em 0; padding: 0.5em 1em; background-color: #f8fafc; font-style: italic; }
      ul, ol { margin: 1em 0; padding-left: 2em; }
      li { margin: 0.5em 0; }
      code { background-color: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
      pre { background-color: #1f2937; color: #f9fafb; padding: 1em; border-radius: 8px; overflow-x: auto; }
      pre code { background: none; padding: 0; }
    </style>
  </head>
  <body>
    ${hasH1 ? '' : `<h1>${title}</h1>`}
    ${description ? `<p><em>${description}</em></p><hr />` : ''}
    ${body}
  </body>
</html>`;
}

function markdownToDocxParagraphs(markdown) {
  const source = looksLikeHtml(markdown) ? htmlToMarkdownish(markdown) : markdown || '';
  const lines = source.split(/\r?\n/);
  const paragraphs = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph(''));
      return;
    }

    if (trimmed.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace(/^###\s+/, ''),
          heading: HeadingLevel.HEADING_3,
        })
      );
      return;
    }

    if (trimmed.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace(/^##\s+/, ''),
          heading: HeadingLevel.HEADING_2,
        })
      );
      return;
    }

    if (trimmed.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          text: trimmed.replace(/^#\s+/, ''),
          heading: HeadingLevel.HEADING_1,
        })
      );
      return;
    }

    paragraphs.push(new Paragraph({ children: [new TextRun(trimmed)] }));
  });

  return paragraphs;
}

function buildMarkdownDocument(blog) {
  const title = blog.title || 'Blog';
  const description = blog.metaDescription || '';
  let content = blog.content || '';

  if (looksLikeHtml(content)) {
    content = htmlToMarkdownish(content);
  }

  // Check if content already starts with an H1 heading
  const hasH1 = /^#\s+/.test(content.trim());

  const parts = [];

  // Add title as H1 if content doesn't already have one
  if (!hasH1) {
    parts.push(`# ${title}`);
    parts.push('');
  }

  // Add meta description if available
  if (description) {
    parts.push(`*${description}*`);
    parts.push('');
    parts.push('---');
    parts.push('');
  }

  // Add the main content
  parts.push(content);

  return parts.join('\n').trim();
}

async function exportMarkdown(blog, exportDir) {
  const fileName = `${sanitizeFileName(blog.title)}.md`;
  const filePath = path.join(exportDir, fileName);
  const markdownContent = buildMarkdownDocument(blog);
  fs.writeFileSync(filePath, markdownContent, 'utf-8');
  return filePath;
}

async function exportHtml(blog, exportDir) {
  const fileName = `${sanitizeFileName(blog.title)}.html`;
  const filePath = path.join(exportDir, fileName);
  const html = buildHtmlDocument(blog);
  fs.writeFileSync(filePath, html, 'utf-8');
  return filePath;
}

async function exportDocx(blog, exportDir) {
  const fileName = `${sanitizeFileName(blog.title)}.docx`;
  const filePath = path.join(exportDir, fileName);
  const paragraphs = [
    new Paragraph({ text: blog.title || 'Blog', heading: HeadingLevel.TITLE }),
    ...(blog.metaDescription
      ? [new Paragraph({ children: [new TextRun({ text: blog.metaDescription, italics: true })] })]
      : []),
    ...markdownToDocxParagraphs(blog.content),
  ];

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

async function exportPdf(blog, exportDir) {
  const fileName = `${sanitizeFileName(blog.title)}.pdf`;
  const filePath = path.join(exportDir, fileName);
  const html = buildHtmlDocument(blog);

  console.log('[PDF Export] Starting export for:', blog.title);
  console.log('[PDF Export] Output path:', filePath);

  let pdfWindow = null;

  try {
    pdfWindow = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });

    console.log('[PDF Export] BrowserWindow created');

    // Load HTML content
    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    console.log('[PDF Export] HTML loaded');

    // Wait for content to be fully loaded
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.log('[PDF Export] Load timeout reached, continuing...');
        resolve();
      }, 5000);

      if (pdfWindow.webContents.isLoading()) {
        pdfWindow.webContents.once('did-finish-load', () => {
          clearTimeout(timeout);
          console.log('[PDF Export] Content finished loading');
          resolve();
        });
        pdfWindow.webContents.once('did-fail-load', (_event, _errorCode, errorDescription) => {
          clearTimeout(timeout);
          reject(new Error(`Failed to load content: ${errorDescription}`));
        });
      } else {
        clearTimeout(timeout);
        resolve();
      }
    });

    // Wait for fonts to load
    try {
      await pdfWindow.webContents.executeJavaScript(
        'document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : Promise.resolve(true)'
      );
    } catch (e) {
      console.log('[PDF Export] Font loading skipped:', e.message);
    }

    // Small delay to ensure rendering is complete
    await new Promise((resolve) => setTimeout(resolve, 200));

    console.log('[PDF Export] Generating PDF...');

    // Generate PDF with proper margins
    const pdfBuffer = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        top: 0.5,
        bottom: 0.5,
        left: 0.5,
        right: 0.5,
      },
    });

    console.log('[PDF Export] PDF buffer generated, size:', pdfBuffer.length);

    fs.writeFileSync(filePath, pdfBuffer);
    console.log('[PDF Export] File saved successfully');
  } catch (error) {
    console.error('[PDF Export] Error:', error);
    throw new Error(`PDF export failed: ${error.message}`);
  } finally {
    if (pdfWindow && !pdfWindow.isDestroyed()) {
      pdfWindow.close();
    }
  }

  return filePath;
}

async function exportBlog(blog, exportDir, formats) {
  ensureDir(exportDir);
  const tasks = [];

  if (formats.includes('markdown')) {
    tasks.push(exportMarkdown(blog, exportDir));
  }
  if (formats.includes('html')) {
    tasks.push(exportHtml(blog, exportDir));
  }
  if (formats.includes('docx')) {
    tasks.push(exportDocx(blog, exportDir));
  }
  if (formats.includes('pdf')) {
    tasks.push(exportPdf(blog, exportDir));
  }

  return Promise.all(tasks);
}

function exportHistoryCsv(rows, exportDir) {
  ensureDir(exportDir);
  const filePath = path.join(exportDir, 'blog-history.csv');
  const header = ['Title', 'Language', 'Words', 'SEO Score', 'Cost', 'Generated At'];
  const lines = [header.join(',')];

  rows.forEach((row) => {
    const values = [
      `"${(row.title || '').replace(/"/g, '""')}"`,
      `"${row.language || ''}"`,
      row.wordCount || 0,
      typeof row.seoScore === 'number' ? row.seoScore : '',
      typeof row.cost === 'number' ? row.cost.toFixed(2) : '',
      `"${row.generatedAt || ''}"`,
    ];
    lines.push(values.join(','));
  });

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return filePath;
}

module.exports = { exportBlog, exportHistoryCsv };
