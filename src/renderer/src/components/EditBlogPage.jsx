import React, { useEffect, useRef, useState } from 'react';

const TINYMCE_SCRIPT_ID = 'tinymce-local-script';
const TINYMCE_SCRIPT_SRC = './tinymce/tinymce.min.js';
const TINYMCE_BASE_URL = './tinymce';

function EditBlogPage({ blog, t, onSave, onCancel }) {
  const [title, setTitle] = useState(blog.title || '');
  const [metaDescription, setMetaDescription] = useState(blog.metaDescription || '');
  const normalizedKeywords = Array.isArray(blog.keywords)
    ? blog.keywords
    : typeof blog.keywords === 'string'
    ? blog.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : [];
  const normalizedCategories = Array.isArray(blog.categories)
    ? blog.categories
    : typeof blog.categories === 'string'
    ? blog.categories
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  const [keywords, setKeywords] = useState(normalizedKeywords.join(', '));
  const [categories, setCategories] = useState(normalizedCategories.join(', '));
  const [plainContent, setPlainContent] = useState(blog.content || '');
  const [htmlContent, setHtmlContent] = useState('');
  const [featuredImage, setFeaturedImage] = useState(blog.imageUrl || '');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [editorMode, setEditorMode] = useState('visual');
  const [localImagePath, setLocalImagePath] = useState('');

  const tinyTextareaRef = useRef(null);
  const tinyEditorRef = useRef(null);
  const syncingFromTinyRef = useRef(false);
  const [tinyLoaded, setTinyLoaded] = useState(Boolean(window.tinymce));
  const [tinyLoadError, setTinyLoadError] = useState('');

  const escapeHtml = (value) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const plainToHtml = (text) => {
    if (!text) return '';
    const lines = text.split(/\r?\n/);
    let html = '';
    let buffer = [];

    const flushParagraph = () => {
      if (buffer.length === 0) return;
      const paragraph = escapeHtml(buffer.join(' ').trim());
      if (paragraph) html += `<p>${paragraph}</p>`;
      buffer = [];
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        return;
      }
      if (trimmed.startsWith('H2:')) {
        flushParagraph();
        html += `<h2>${escapeHtml(trimmed.replace(/^H2:\s*/, ''))}</h2>`;
        return;
      }
      if (trimmed.startsWith('H3:')) {
        flushParagraph();
        html += `<h3>${escapeHtml(trimmed.replace(/^H3:\s*/, ''))}</h3>`;
        return;
      }
      if (trimmed.startsWith('Quote:')) {
        flushParagraph();
        html += `<blockquote>${escapeHtml(trimmed.replace(/^Quote:\s*/, ''))}</blockquote>`;
        return;
      }
      if (trimmed.startsWith('Pro Tip:')) {
        flushParagraph();
        html += `<p><strong>Pro Tip:</strong> ${escapeHtml(trimmed.replace(/^Pro Tip:\s*/, ''))}</p>`;
        return;
      }
      if (trimmed.startsWith('Q:')) {
        flushParagraph();
        html += `<p><strong>Q:</strong> ${escapeHtml(trimmed.replace(/^Q:\s*/, ''))}</p>`;
        return;
      }
      if (trimmed.startsWith('A:')) {
        flushParagraph();
        html += `<p><strong>A:</strong> ${escapeHtml(trimmed.replace(/^A:\s*/, ''))}</p>`;
        return;
      }
      if (trimmed.startsWith('Code:')) {
        flushParagraph();
        html += `<pre><code>${escapeHtml(trimmed.replace(/^Code:\s*/, ''))}</code></pre>`;
        return;
      }
      buffer.push(trimmed);
    });

    flushParagraph();
    return html;
  };

  const htmlToPlain = (html) => {
    if (!html) return '';
    let text = html;
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<\/h2>/gi, '\n');
    text = text.replace(/<\/h3>/gi, '\n');
    text = text.replace(/<h2[^>]*>/gi, 'H2: ');
    text = text.replace(/<h3[^>]*>/gi, 'H3: ');
    text = text.replace(/<blockquote[^>]*>/gi, 'Quote: ');
    text = text.replace(/<pre><code[^>]*>/gi, 'Code: ');
    text = text.replace(/<\/code><\/pre>/gi, '\n');
    text = text.replace(/<strong>\s*Q:\s*<\/strong>/gi, 'Q: ');
    text = text.replace(/<strong>\s*A:\s*<\/strong>/gi, 'A: ');
    text = text.replace(/<strong>\s*Pro Tip:\s*<\/strong>/gi, 'Pro Tip: ');
    text = text.replace(/<[^>]*>/g, '');
    text = text.replace(/\n{3,}/g, '\n\n');
    return text.trim();
  };

  useEffect(() => {
    const raw = blog.content || '';
    const hasHtml = /<\w+[^>]*>/.test(raw);
    if (hasHtml) {
      setHtmlContent(raw);
      setPlainContent(htmlToPlain(raw));
    } else {
      setPlainContent(raw);
      setHtmlContent(plainToHtml(raw));
    }
    setFeaturedImage(blog.imageUrl || '');
  }, [blog.content]);

  useEffect(() => {
    if (window.tinymce) {
      setTinyLoaded(true);
      return;
    }

    const existingScript = document.getElementById(TINYMCE_SCRIPT_ID);
    if (existingScript) {
      existingScript.addEventListener('load', () => setTinyLoaded(true));
      existingScript.addEventListener('error', () => setTinyLoadError('Failed to load local TinyMCE assets.'));
      return;
    }

    const script = document.createElement('script');
    script.id = TINYMCE_SCRIPT_ID;
    script.src = TINYMCE_SCRIPT_SRC;
    script.onload = () => setTinyLoaded(true);
    script.onerror = () => setTinyLoadError('Failed to load local TinyMCE assets.');
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!tinyLoaded || editorMode !== 'visual' || !tinyTextareaRef.current || !window.tinymce) return;
    if (tinyEditorRef.current) return;

    window.tinymce
      .init({
        target: tinyTextareaRef.current,
        license_key: 'gpl',
        base_url: TINYMCE_BASE_URL,
        suffix: '.min',
        menubar: false,
        branding: false,
        promotion: false,
        height: 520,
        resize: true,
        toolbar_sticky: true,
        toolbar_sticky_offset: 12,
        plugins: 'autolink lists link image charmap preview anchor searchreplace visualblocks code fullscreen insertdatetime table help wordcount',
        toolbar:
          'undo redo | blocks | bold italic underline | alignleft aligncenter alignright | bullist numlist outdent indent | link image | blockquote code removeformat',
        content_style:
          'body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.65; padding: 8px; } img { max-width: 100%; height: auto; }',
        setup: (editor) => {
          tinyEditorRef.current = editor;

          editor.on('init', () => {
            editor.setContent(htmlContent || '');
          });

          editor.on('change input undo redo setcontent', () => {
            const nextHtml = editor.getContent();
            syncingFromTinyRef.current = true;
            setHtmlContent(nextHtml);
            setPlainContent(htmlToPlain(nextHtml));
          });

          editor.on('remove', () => {
            tinyEditorRef.current = null;
          });
        },
      })
      .catch(() => {
        setTinyLoadError('Failed to initialize TinyMCE.');
      });

    return () => {
      if (tinyEditorRef.current) {
        tinyEditorRef.current.remove();
        tinyEditorRef.current = null;
      }
    };
  }, [tinyLoaded, editorMode]);

  useEffect(() => {
    if (editorMode !== 'visual' || !tinyEditorRef.current) return;
    if (syncingFromTinyRef.current) {
      syncingFromTinyRef.current = false;
      return;
    }
    const current = tinyEditorRef.current.getContent();
    if (current !== htmlContent) {
      tinyEditorRef.current.setContent(htmlContent || '');
    }
  }, [editorMode, htmlContent]);

  const handleModeChange = (mode) => {
    if (mode === editorMode) return;

    let sourceHtml = htmlContent;

    if (editorMode === 'visual' && tinyEditorRef.current) {
      const visualHtml = tinyEditorRef.current.getContent();
      sourceHtml = visualHtml;
      setHtmlContent(sourceHtml);
      setPlainContent(htmlToPlain(sourceHtml));
    }

    if (mode === 'visual') {
      setHtmlContent(plainToHtml(plainContent));
    }

    if (mode === 'plain') {
      setPlainContent(htmlToPlain(sourceHtml));
    }

    setEditorMode(mode);
  };

  const handleSave = () => {
    const visualHtml = tinyEditorRef.current ? tinyEditorRef.current.getContent() : htmlContent;
    const contentToSave = editorMode === 'html' ? htmlContent : editorMode === 'visual' ? visualHtml : plainContent;

    onSave({
      ...blog,
      title: title.trim(),
      metaDescription: metaDescription.trim(),
      keywords: keywords
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      categories: categories
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      content: contentToSave,
      imageUrl: featuredImage || null,
    });
  };

  const handleGenerateImage = async () => {
    if (isGeneratingImage) return;
    setIsGeneratingImage(true);

    const visualHtml = tinyEditorRef.current ? tinyEditorRef.current.getContent() : htmlContent;
    const contentSource = editorMode === 'html' ? htmlContent : editorMode === 'plain' ? plainContent : visualHtml;

    const result = await window.electronAPI.generateBlogImage({
      blogId: blog.id,
      title: title.trim() || blog.title,
      content: contentSource || '',
    });

    if (result.success) {
      setFeaturedImage(result.imageUrl || '');
      if (result.localPath) setLocalImagePath(result.localPath);
    } else {
      alert(result.error || 'Image generation failed');
    }

    setIsGeneratingImage(false);
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2">{t.editBlogTitle}</h2>
        <p className="text-slate-600">{t.editBlogSubtitle}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
        <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">{t.featuredImageLabel}</p>
              <p className="text-xs text-slate-500">{t.featuredImageHint}</p>
            </div>
            <button
              type="button"
              onClick={handleGenerateImage}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {isGeneratingImage ? t.generatingImageLabel : t.generateImageLabel}
            </button>
          </div>
          {featuredImage ? (
            <img
              src={localImagePath || featuredImage}
              alt={title || 'Featured'}
              className="max-h-64 w-full rounded-lg object-cover"
            />
          ) : (
            <p className="text-xs text-slate-500">{t.noImageLabel}</p>
          )}
          {localImagePath && <p className="text-xs text-slate-500 break-all">Saved locally: {localImagePath}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.blogTitleLabel}</label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.metaDescriptionLabel}</label>
          <input
            type="text"
            value={metaDescription}
            onChange={(event) => setMetaDescription(event.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.keywordsLabel}</label>
          <input
            type="text"
            value={keywords}
            onChange={(event) => setKeywords(event.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">{t.categoriesLabel || 'Categories'}</label>
          <input
            type="text"
            value={categories}
            onChange={(event) => setCategories(event.target.value)}
            className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            placeholder={t.categoriesPlaceholder || 'marketing, tutorials, ai tools'}
          />
          <p className="text-xs text-slate-500 mt-1">
            {t.categoriesHint || 'Comma separated; sent to WordPress during publish.'}
          </p>
        </div>

        <div>
          <div className="sticky top-4 z-20 -mx-2 mb-2 rounded-lg border border-slate-200 bg-white/95 px-2 py-2 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
            <label className="block text-sm font-medium text-slate-700">{t.contentLabel}</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleModeChange('visual')}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  editorMode === 'visual' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.editorModeVisual}
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('plain')}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  editorMode === 'plain' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.editorModePlain}
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('html')}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  editorMode === 'html' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.editorModeHtml || 'Code'}
              </button>
            </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {t.editorHelp || 'Visual = WYSIWYG, Plain = text only, Code = raw HTML editor with monospaced view.'}
            </p>
          </div>

          {editorMode === 'visual' && (
            <div className="space-y-2">
              {tinyLoadError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {tinyLoadError}
                </div>
              ) : null}
              {!tinyLoaded ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Loading TinyMCE editor...
                </div>
              ) : null}
              <textarea ref={tinyTextareaRef} defaultValue={htmlContent} className="hidden" />
            </div>
          )}

          {editorMode === 'plain' && (
            <textarea
              value={plainContent}
              onChange={(event) => setPlainContent(event.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-sm"
            />
          )}

          {editorMode === 'html' && (
            <textarea
              value={htmlContent}
              onChange={(event) => setHtmlContent(event.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-slate-800 bg-slate-900 text-slate-100 rounded-lg font-mono text-sm leading-relaxed"
              spellCheck={false}
            />
          )}
        </div>

        <div className="sticky bottom-4 z-20 -mx-2 rounded-lg border border-slate-200 bg-white/95 px-2 py-2 backdrop-blur">
          <div className="flex items-center gap-3">
          <button onClick={handleSave} className="px-4 py-2 rounded-lg bg-blue-500 text-white">
            {t.saveChanges}
          </button>
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600">
            {t.cancel}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditBlogPage;
