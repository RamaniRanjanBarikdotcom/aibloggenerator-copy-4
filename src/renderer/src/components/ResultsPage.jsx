import React, { useMemo, useState, useEffect } from 'react';
import MarkdownIt from 'markdown-it';
import { Download, Copy, Sparkles, FileText, FileCode2, Send, X, ExternalLink, CheckCircle, Clock } from 'lucide-react';

function ResultsPage({ blog, onGenerateAnother, t, canExport, onEdit }) {
  const keywords = Array.isArray(blog.keywords) ? blog.keywords : [];
  const [viewMode, setViewMode] = useState('rendered');
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishDestinations, setPublishDestinations] = useState([]);
  const [selectedDestinationId, setSelectedDestinationId] = useState('');
  const [publishMode, setPublishMode] = useState('draft');
  const [publishStatus, setPublishStatus] = useState({ state: 'idle', message: '', url: null });
  const [publishing, setPublishing] = useState(false);
  const [publishHistory, setPublishHistory] = useState([]);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [localImagePath, setLocalImagePath] = useState('');
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState(blog.categories || []);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const rawContent = blog.content || '';
  const looksLikeHtml = /<\w+[^>]*>/.test(rawContent);
  const hasH1 = /<h1\b[^>]*>/i.test(rawContent);
  const md = useMemo(() => new MarkdownIt(), []);
  const isLegacyPlain = /(^|\n)\s*H2:\s+/i.test(rawContent);

  const legacyToHtml = (text) => {
    const lines = (text || '').split(/\r?\n/);
    let html = '';
    let listType = null;
    let listItems = [];
    const flushList = () => {
      if (!listType || listItems.length === 0) return;
      const tag = listType === 'ol' ? 'ol' : 'ul';
      html += `<${tag}>${listItems.join('')}</${tag}>`;
      listType = null;
      listItems = [];
    };
    const pushParagraph = (value) => {
      if (!value) return;
      flushList();
      html += `<p>${value}</p>`;
    };
    const pushHeading = (tag, value) => {
      flushList();
      html += `<${tag}>${value}</${tag}>`;
    };
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushList();
        return;
      }
      if (/^H2:\s+/i.test(trimmed)) {
        pushHeading('h2', trimmed.replace(/^H2:\s+/i, ''));
        return;
      }
      if (/^H3:\s+/i.test(trimmed)) {
        pushHeading('h3', trimmed.replace(/^H3:\s+/i, ''));
        return;
      }
      if (/^Quote:\s+/i.test(trimmed)) {
        pushHeading('blockquote', trimmed.replace(/^Quote:\s+/i, ''));
        return;
      }
      if (/^Pro Tip:\s+/i.test(trimmed)) {
        pushParagraph(`<strong>Pro Tip:</strong> ${trimmed.replace(/^Pro Tip:\s+/i, '')}`);
        return;
      }
      if (/^Code:\s+/i.test(trimmed)) {
        flushList();
        html += `<pre><code>${trimmed.replace(/^Code:\s+/i, '')}</code></pre>`;
        return;
      }
      if (/^\d+\.\s+/.test(trimmed)) {
        if (listType !== 'ol') {
          flushList();
          listType = 'ol';
        }
        listItems.push(`<li>${trimmed.replace(/^\d+\.\s+/, '')}</li>`);
        return;
      }
      if (/^-\s+/.test(trimmed)) {
        if (listType !== 'ul') {
          flushList();
          listType = 'ul';
        }
        listItems.push(`<li>${trimmed.replace(/^-\\s+/, '')}</li>`);
        return;
      }
      pushParagraph(trimmed);
    });
    flushList();
    return html;
  };
  const sanitizedHtml = useMemo(() => {
    const source = looksLikeHtml
      ? rawContent
      : isLegacyPlain
      ? legacyToHtml(rawContent)
      : md.render(rawContent);
    let cleaned = source.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
    cleaned = cleaned.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');
    cleaned = cleaned.replace(/\son\w+="[^"]*"/gi, '');
    cleaned = cleaned.replace(/\son\w+='[^']*'/gi, '');
    cleaned = cleaned.replace(/javascript:/gi, '');
    return cleaned;
  }, [rawContent, looksLikeHtml, isLegacyPlain, md]);

  const handleRenderedClick = async (event) => {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    event.preventDefault();
    await window.electronAPI.openExternal({ url: anchor.href });
  };

  const handleRenderedContextMenu = async (event) => {
    const anchor = event.target.closest('a');
    if (!anchor) return;
    event.preventDefault();
    await window.electronAPI.showLinkContextMenu({ url: anchor.href });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(blog.content);
    alert('Blog content copied to clipboard!');
  };

  const [exporting, setExporting] = useState(false);

  const handleExport = async (format) => {
    if (exporting) return;
    setExporting(true);

    try {
      console.log('[Export] Starting export, format:', format);
      console.log('[Export] Blog data:', { title: blog.title, hasContent: !!blog.content });

      const result = await window.electronAPI.exportBlog({
        blog,
        formats: [format],
      });

      console.log('[Export] Result:', result);

      if (!result.success && result.error !== 'Export cancelled') {
        alert(`Export failed: ${result.error || 'Unknown error'}`);
      } else if (result.success && result.files?.length) {
        alert(`Exported successfully!\n\nSaved to:\n${result.files.join('\n')}`);
      }
    } catch (error) {
      console.error('[Export] Error:', error);
      alert(`Export error: ${error.message || 'Unknown error'}`);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadImage = async () => {
    const result = await window.electronAPI.downloadImage({
      url: blog.imageUrl,
      title: blog.title,
    });
    if (!result.success) {
      alert(`Download failed: ${result.error}`);
    } else {
      alert(`Image saved to ${result.path}`);
    }
  };

  const loadPublishDestinations = async () => {
    const result = await window.electronAPI.getSettings();
    if (result.success) {
      const destinations = Array.isArray(result.settings?.publishDestinations)
        ? result.settings.publishDestinations
        : [];
      setPublishDestinations(destinations);
      if (!selectedDestinationId && destinations.length > 0) {
        setSelectedDestinationId(destinations[0].id);
      }
    }
  };

  const loadPublishHistory = async () => {
    if (blog.id) {
      const result = await window.electronAPI.getBlogPublishStatus({ blogId: blog.id });
      if (result.success) {
        setPublishHistory(result.history || []);
      }
    }
  };

  const handleOpenPublish = async () => {
    setPublishStatus({ state: 'idle', message: '', url: null });
    setPublishMode('draft');
    setSelectedCategories(blog.categories || []);
    setPublishDialogOpen(true);
    await Promise.all([loadPublishDestinations(), loadPublishHistory()]);
  };

  useEffect(() => {
    const loadCategories = async () => {
      if (!publishDialogOpen || !selectedDestinationId) return;
      const destination = publishDestinations.find((item) => item.id === selectedDestinationId);
      if (!destination || !['wordpress', 'wordpress-token'].includes(destination.platform)) {
        setCategoryOptions([]);
        return;
      }
      setCategoriesLoading(true);
      const result = await window.electronAPI.listWordpressCategories({ destinationId: selectedDestinationId });
      if (result.success) {
        const names = (result.categories || []).map((c) => c.name || c.slug || '').filter(Boolean);
        setCategoryOptions(names);
        if (!selectedCategories.length && blog.categories?.length) {
          setSelectedCategories(blog.categories);
        }
      }
      setCategoriesLoading(false);
    };
    loadCategories();
  }, [publishDialogOpen, selectedDestinationId, publishDestinations, blog.categories, selectedCategories.length]);

  const handleCreateCategory = async () => {
    if (!newCategory.trim()) return;
    const result = await window.electronAPI.createWordpressCategory({
      destinationId: selectedDestinationId,
      name: newCategory.trim(),
    });
    if (result.success) {
      const names = (result.categories || []).map((c) => c.name || c.slug || '').filter(Boolean);
      setCategoryOptions(names);
      setSelectedCategories((prev) => Array.from(new Set([...prev, newCategory.trim()])));
      setNewCategory('');
    } else {
      alert(result.error || 'Failed to create category');
    }
  };

  const handlePublish = async () => {
    const destination = publishDestinations.find((item) => item.id === selectedDestinationId);
    if (!destination) {
      alert(t.publishSelectDestination || 'Select a destination');
      return;
    }
    setPublishing(true);
    setPublishStatus({ state: 'loading', message: publishMode === 'publish' ? 'Publishing...' : 'Creating draft...', url: null });
    const result = await window.electronAPI.publishBlog({
      destination,
      blog: { ...blog, categories: selectedCategories },
      status: publishMode,
    });
    if (result.success) {
      const successMessage = publishMode === 'publish'
        ? (t.publishSuccessLive || 'Published successfully!')
        : (t.publishSuccess || 'Draft created successfully.');
      const publishedUrl = result.result?.url || result.result?.link || null;
      setPublishStatus({ state: 'success', message: successMessage, url: publishedUrl });
      // Reload publish history
      await loadPublishHistory();
    } else {
      setPublishStatus({
        state: 'error',
        message: `${t.publishFailed || 'Publish failed'}: ${result.error}`,
        url: null,
      });
    }
    setPublishing(false);
  };

  const handleGenerateImage = async () => {
    if (isGeneratingImage) return;
    setIsGeneratingImage(true);
    const result = await window.electronAPI.generateBlogImage({
      blogId: blog.id,
      title: blog.title,
      content: blog.content,
    });
    if (result.success) {
      setPublishStatus({ state: 'idle', message: '', url: null });
      setLocalImagePath(result.localPath || '');
      blog.imageUrl = result.imageUrl;
      alert('Image generated and saved locally.');
    } else {
      alert(result.error || 'Image generation failed');
    }
    setIsGeneratingImage(false);
  };

  return (
    <div className="max-w-5xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-3xl font-bold text-slate-900">{t.resultsTitle}</h2>
          <p className="text-slate-600 mt-1">{t.resultsSubtitle}</p>
        </div>
        <button
          onClick={onGenerateAnother}
          className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-purple-600 transition"
        >
          <Sparkles className="w-5 h-5" />
          <span>{t.generateAnother}</span>
        </button>
      </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="bg-slate-50 border-b border-slate-200 px-8 py-4">
                <div className="flex items-center space-x-8">
                  <div>
                    <p className="text-sm text-slate-500">{t.words}</p>
                    <p className="text-2xl font-bold text-slate-900">{blog.wordCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.readingTime}</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {Math.ceil(blog.wordCount / 200)} min
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-3">
                    <button
                      onClick={handleGenerateImage}
                      disabled={isGeneratingImage}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {isGeneratingImage ? 'Generating...' : 'Generate Image'}
                    </button>
                    {localImagePath && (
                      <span className="text-xs text-slate-500 truncate max-w-[180px]">
                        Saved: {localImagePath}
                      </span>
                    )}
                  </div>
                </div>
              </div>

        <div className="p-8 space-y-6">
          {!hasH1 && (
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">{blog.title}</h1>
              <p className="text-slate-600 italic">{blog.metaDescription}</p>
            </div>
          )}

          {blog.imageUrl && (
            <div className="rounded-lg overflow-hidden space-y-2">
              <img src={blog.imageUrl} alt={blog.title} className="w-full h-auto" />
              <button
                onClick={handleDownloadImage}
                className="inline-flex items-center space-x-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs"
              >
                <Download className="w-4 h-4" />
                <span>{t.downloadImage}</span>
              </button>
            </div>
          )}

          {looksLikeHtml && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode('plain')}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  viewMode === 'plain' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.viewPlain}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('rendered')}
                className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  viewMode === 'rendered'
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {t.viewRendered}
              </button>
            </div>
          )}

          {viewMode === 'rendered' ? (
            <div
              className="blog-rendered"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              onClick={handleRenderedClick}
              onContextMenu={handleRenderedContextMenu}
            />
          ) : (
            <div className="whitespace-pre-wrap text-slate-700 leading-relaxed">
              {rawContent}
            </div>
          )}

          {keywords.length > 0 && (
            <div className="border-t pt-6">
              <h4 className="font-semibold text-slate-900 mb-2">{t.keywordsLabel}</h4>
              <div className="flex flex-wrap gap-2">
                {keywords.map((keyword, index) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                  >
                    {keyword}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {canExport && (
          <div className="border-t border-slate-200 bg-slate-50 px-8 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 transition"
                >
                  <Copy className="w-4 h-4" />
                  <span>{t.copy}</span>
                </button>
                {onEdit && (
                  <button
                    onClick={onEdit}
                    className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition"
                  >
                    <FileText className="w-4 h-4" />
                    <span>{t.editLabel}</span>
                  </button>
                )}
              </div>
              <div className="inline-flex flex-wrap gap-2">
                <button
                  onClick={handleOpenPublish}
                  className="inline-flex items-center space-x-2 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                  title={t.publishDraft}
                >
                  <Send className="w-4 h-4" />
                  <span>{t.publishDraft}</span>
                </button>
                <button
                  onClick={() => handleExport('markdown')}
                  disabled={exporting}
                  className={`inline-flex items-center space-x-2 px-3 py-2 bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-100 transition ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={t.exportMarkdown}
                >
                  <FileText className="w-4 h-4" />
                  <span>MD</span>
                </button>
                <button
                  onClick={() => handleExport('html')}
                  disabled={exporting}
                  className={`inline-flex items-center space-x-2 px-3 py-2 bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-100 transition ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={t.exportHtml}
                >
                  <FileCode2 className="w-4 h-4" />
                  <span>HTML</span>
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exporting}
                  className={`inline-flex items-center space-x-2 px-3 py-2 bg-white text-slate-700 rounded-lg border border-slate-200 hover:bg-slate-100 transition ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={t.exportPdf}
                >
                  <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
                  <span>{exporting ? 'Exporting...' : 'PDF'}</span>
                </button>
                <button
                  onClick={() => handleExport('docx')}
                  disabled={exporting}
                  className={`inline-flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={t.exportDocx}
                >
                  <Download className="w-4 h-4" />
                  <span>DOCX</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {publishDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">{t.publishDialogTitle || 'Publish Blog'}</h3>
                <p className="text-sm text-slate-600">{t.publishDialogSubtitle || 'Choose destination and publish status'}</p>
              </div>
              <button
                type="button"
                onClick={() => setPublishDialogOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Previous publish history */}
            {publishHistory.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs font-medium text-blue-800 mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Previously Published
                </p>
                <div className="space-y-1.5">
                  {publishHistory.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <span className="text-blue-700">
                        {item.destinationName} • {item.status === 'publish' ? 'Live' : 'Draft'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-blue-600">
                          {new Date(item.publishedAt).toLocaleDateString()}
                        </span>
                        {item.publishedUrl && (
                          <button
                            type="button"
                            onClick={() => window.electronAPI.openExternal({ url: item.publishedUrl })}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-4">
              {publishDestinations.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-600">
                  {t.publishNoDestinations || 'No publish destinations configured. Add one in Settings.'}
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {t.publishSelectDestination || 'Destination'}
                    </label>
                    <select
                      value={selectedDestinationId}
                      onChange={(event) => setSelectedDestinationId(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      {publishDestinations.map((destination) => (
                        <option key={destination.id} value={destination.id}>
                          {destination.name} ({destination.platform})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t.publishStatusLabel || 'Publish As'}
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPublishMode('draft')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition ${
                          publishMode === 'draft'
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <Clock className={`w-4 h-4 ${publishMode === 'draft' ? 'text-amber-600' : 'text-slate-400'}`} />
                        <span className="font-medium">{t.statusDraft || 'Draft'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPublishMode('publish')}
                        className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition ${
                          publishMode === 'publish'
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <CheckCircle className={`w-4 h-4 ${publishMode === 'publish' ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="font-medium">{t.statusPublish || 'Publish Now'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      {publishMode === 'draft'
                        ? 'Save as draft for later editing before publishing'
                        : 'Publish immediately and make visible to readers'}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        {t.categoriesLabel || 'Categories'}
                      </label>
                      {categoriesLoading && <span className="text-xs text-slate-500">Loading…</span>}
                    </div>
                    {categoryOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {categoryOptions.map((cat) => {
                          const active = selectedCategories.includes(cat);
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() =>
                                setSelectedCategories((prev) =>
                                  active ? prev.filter((c) => c !== cat) : [...prev, cat]
                                )
                              }
                              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                                active
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              {cat}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 mb-2">
                        {t.categoriesEmpty || 'No categories yet. Add one below.'}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder={t.categoriesPlaceholder || 'Add new category'}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        {t.addCategoryLabel || 'Add'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      {t.categoriesHint || 'Selected categories will be created and assigned in WordPress.'}
                    </p>
                  </div>
                </>
              )}
            </div>

            {publishStatus.message && (
              <div
                className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                  publishStatus.state === 'success'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : publishStatus.state === 'error'
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  {publishStatus.state === 'success' && <CheckCircle className="w-4 h-4" />}
                  <span>{publishStatus.message}</span>
                </div>
                {publishStatus.state === 'success' && publishStatus.url && (
                  <button
                    type="button"
                    onClick={() => window.electronAPI.openExternal({ url: publishStatus.url })}
                    className="mt-2 inline-flex items-center gap-1 text-emerald-800 hover:text-emerald-900 font-medium"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View on site
                  </button>
                )}
              </div>
            )}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setPublishDialogOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-slate-300 hover:bg-slate-50"
              >
                {publishStatus.state === 'success' ? (t.close || 'Close') : (t.cancel || 'Cancel')}
              </button>
              {publishStatus.state !== 'success' && (
                <button
                  type="button"
                  onClick={handlePublish}
                  disabled={publishing || publishDestinations.length === 0}
                  className={`rounded-lg px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60 ${
                    publishMode === 'publish'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {publishing
                    ? (publishMode === 'publish' ? 'Publishing...' : 'Creating draft...')
                    : (publishMode === 'publish' ? (t.publishNow || 'Publish Now') : (t.saveDraft || 'Save as Draft'))}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ResultsPage;
