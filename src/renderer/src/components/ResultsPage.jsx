import React, { useMemo, useState, useEffect, useRef } from 'react';
import MarkdownIt from 'markdown-it';
import { Download, Copy, Sparkles, FileText, FileCode2, Send, X, ExternalLink, CheckCircle, Clock, Plus, Upload } from 'lucide-react';
import ModalCloseButton from './ModalCloseButton';

function ResultsPage({ blog, onGenerateAnother, t, canExport, onEdit, openPublishOnMount = false, onPublishModalOpened }) {
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
  const [imageActionModalOpen, setImageActionModalOpen] = useState(false);
  const [uploadingLocalImage, setUploadingLocalImage] = useState(false);
  const [removedImageUrls, setRemovedImageUrls] = useState([]);
  const [showImageDeleteConfirm, setShowImageDeleteConfirm] = useState(false);
  const [showCopyToast, setShowCopyToast] = useState(false);
  const contentRef = useRef(null);
  const renderedContentRef = useRef(null);
  const inlineActionBarRef = useRef(null);
  const copyToastTimeoutRef = useRef(null);
  const [showFloatingBar, setShowFloatingBar] = useState(false);
  const normalizeImageGallery = (galleryValue, imageUrl) => {
    if (Array.isArray(galleryValue)) {
      const list = galleryValue.filter(Boolean);
      if (imageUrl && !list.includes(imageUrl)) list.unshift(imageUrl);
      return list;
    }
    if (typeof galleryValue === 'string' && galleryValue.trim()) {
      try {
        const parsed = JSON.parse(galleryValue);
        if (Array.isArray(parsed)) {
          const list = parsed.filter(Boolean);
          if (imageUrl && !list.includes(imageUrl)) list.unshift(imageUrl);
          return list;
        }
      } catch (error) {
        // ignore parse error
      }
    }
    return imageUrl ? [imageUrl] : [];
  };
  const [imageGallery, setImageGallery] = useState(() =>
    normalizeImageGallery(blog.imageGallery || blog.image_gallery, blog.imageUrl)
  );
  const [featuredImage, setFeaturedImage] = useState(blog.imageUrl || '');
  const rawContent = blog.content || '';
  const looksLikeHtml = /<\w+[^>]*>/.test(rawContent);
  const hasH1 = /<h1\b[^>]*>/i.test(rawContent);
  const md = useMemo(() => new MarkdownIt(), []);
  const isLegacyPlain = /(^|\n)\s*H2:\s+/i.test(rawContent);
  const computedWordCount = useMemo(() => {
    const fromBlog = Number(blog?.wordCount);
    if (Number.isFinite(fromBlog) && fromBlog > 0) return fromBlog;
    const plain = String(rawContent || '')
      .replace(/<[^>]*>/g, ' ')
      .trim();
    const words = plain.split(/\s+/).filter(Boolean).length;
    return words;
  }, [blog?.wordCount, rawContent]);
  const readingMinutes = Math.max(1, Math.ceil(computedWordCount / 200));

  useEffect(() => {
    const nextGallery = normalizeImageGallery(blog.imageGallery || blog.image_gallery, blog.imageUrl);
    setImageGallery(nextGallery);
    setFeaturedImage(blog.imageUrl || nextGallery[0] || '');
    setRemovedImageUrls([]);
    setShowImageDeleteConfirm(false);
  }, [blog]);

  useEffect(() => {
    const target = contentRef.current;
    if (!target || typeof window === 'undefined') {
      setShowFloatingBar(false);
      return undefined;
    }

    const findScrollParent = (node) => {
      let parent = node?.parentElement || null;
      while (parent) {
        const style = window.getComputedStyle(parent);
        if (/(auto|scroll)/.test(style.overflowY || '')) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return null;
    };

    const root = findScrollParent(target);
    const onScroll = () => {
      const rootRect = root
        ? root.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };
      const contentRect = target.getBoundingClientRect();
      // Show once content reaches the upper-middle visible area (earlier than full view).
      const rootHeight = Math.max(0, rootRect.bottom - rootRect.top);
      const triggerLine = rootRect.top + Math.max(220, rootHeight * 0.42);
      const contentStartedShowing = contentRect.top <= triggerLine;

      // Hide floating bar once the inline action bar is visible near the end.
      let inlineBarVisible = false;
      if (inlineActionBarRef.current) {
        const actionRect = inlineActionBarRef.current.getBoundingClientRect();
        const visibleTop = Math.max(actionRect.top, rootRect.top);
        const visibleBottom = Math.min(actionRect.bottom, rootRect.bottom);
        inlineBarVisible = visibleBottom - visibleTop > 12;
      }

      setShowFloatingBar(contentStartedShowing && !inlineBarVisible);
    };

    onScroll();
    if (root) {
      root.addEventListener('scroll', onScroll);
    } else {
      window.addEventListener('scroll', onScroll);
    }
    window.addEventListener('resize', onScroll);
    return () => {
      if (root) {
        root.removeEventListener('scroll', onScroll);
      } else {
        window.removeEventListener('scroll', onScroll);
      }
      window.removeEventListener('resize', onScroll);
    };
  }, [blog?.id]);

  useEffect(() => {
    return () => {
      if (copyToastTimeoutRef.current) {
        clearTimeout(copyToastTimeoutRef.current);
      }
    };
  }, []);

  const handleSelectImage = async (url) => {
    if (removedImageUrls.includes(url)) return;
    if (!url || url === featuredImage) return;
    const nextGallery = normalizeImageGallery(imageGallery, url);
    setFeaturedImage(url);
    setImageGallery(nextGallery);
    blog.imageUrl = url;
    blog.imageGallery = nextGallery;
    if (blog.id) {
      const result = await window.electronAPI.updateBlog({
        blog: { ...blog, imageUrl: url, imageGallery: nextGallery },
      });
      if (!result.success) {
        alert(result.error || 'Failed to update featured image');
      }
    }
  };

  const applyDeletedImages = async () => {
    if (!removedImageUrls.length) return;
    const nextGallery = imageGallery.filter((url) => !removedImageUrls.includes(url));
    const nextFeatured = removedImageUrls.includes(featuredImage)
      ? nextGallery[0] || ''
      : featuredImage || nextGallery[0] || '';

    if (!blog.id) {
      setImageGallery(nextGallery);
      setFeaturedImage(nextFeatured);
      setRemovedImageUrls([]);
      setShowImageDeleteConfirm(false);
      return;
    }

    const result = await window.electronAPI.updateBlog({
      blog: { ...blog, imageUrl: nextFeatured || null, imageGallery: nextGallery },
    });
    if (!result.success) {
      alert(result.error || 'Failed to delete images');
      return;
    }

    setImageGallery(nextGallery);
    setFeaturedImage(nextFeatured);
    setRemovedImageUrls([]);
    setShowImageDeleteConfirm(false);
    blog.imageUrl = nextFeatured || '';
    blog.imageGallery = nextGallery;
  };

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

  const handleCopy = async () => {
    const textToCopy =
      viewMode === 'plain'
        ? rawContent
        : (renderedContentRef.current?.innerText || '').trim() || rawContent;

    await navigator.clipboard.writeText(textToCopy);
    setShowCopyToast(true);
    if (copyToastTimeoutRef.current) {
      clearTimeout(copyToastTimeoutRef.current);
    }
    copyToastTimeoutRef.current = setTimeout(() => {
      setShowCopyToast(false);
      copyToastTimeoutRef.current = null;
    }, 1800);
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
      url: featuredImage || blog.imageUrl,
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
    if (!openPublishOnMount || !blog?.id || publishDialogOpen) return;
    let cancelled = false;
    const openPublishDialog = async () => {
      setPublishStatus({ state: 'idle', message: '', url: null });
      setPublishMode('draft');
      setSelectedCategories(blog.categories || []);
      setPublishDialogOpen(true);
      if (typeof onPublishModalOpened === 'function') {
        onPublishModalOpened();
      }
      await Promise.all([loadPublishDestinations(), loadPublishHistory()]);
      if (cancelled) return;
    };
    openPublishDialog();
    return () => {
      cancelled = true;
    };
  }, [openPublishOnMount, blog?.id, publishDialogOpen]);

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
    setPublishStatus({
      state: 'loading',
      message: publishMode === 'publish'
        ? (t.publishInProgress || 'Publishing...')
        : (t.creatingDraftLabel || 'Creating draft...'),
      url: null,
    });
    const result = await window.electronAPI.publishBlog({
      destination,
      blog: {
        ...blog,
        imageUrl: featuredImage || blog.imageUrl,
        imageGallery,
        categories: selectedCategories,
      },
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
      blog.localImagePath = result.localPath || '';
      blog.local_image_path = result.localPath || '';
      const nextGallery = normalizeImageGallery(
        result.imageGallery || imageGallery,
        result.imageUrl || blog.imageUrl
      );
      setImageGallery(nextGallery);
      setFeaturedImage(result.imageUrl || nextGallery[0] || '');
      blog.imageGallery = nextGallery;
      alert(result.localPath ? 'Image generated and saved locally.' : 'Image generated.');
    } else {
      alert(result.error || 'Image generation failed');
    }
    setIsGeneratingImage(false);
  };

  const handleUploadLocalImage = async () => {
    if (!blog?.id) {
      alert(t.imageUploadMissingBlog || 'Save the blog first before uploading an image.');
      return;
    }

    setUploadingLocalImage(true);
    const picked = await window.electronAPI.selectLocalImageFile();
    if (!picked?.success) {
      setUploadingLocalImage(false);
      if (!picked?.canceled) {
        alert(picked?.error || t.imageSelectFailed || 'Unable to select image file.');
      }
      return;
    }

    const result = await window.electronAPI.attachLocalBlogImage({
      blogId: blog.id,
      title: blog.title,
      localImagePath: picked.path,
    });

    setUploadingLocalImage(false);
    if (!result.success) {
      alert(result.error || t.imageUploadFailed || 'Failed to upload image.');
      return;
    }

    const nextGallery = normalizeImageGallery(
      result.imageGallery || imageGallery,
      result.imageUrl || featuredImage
    );
    setImageGallery(nextGallery);
    setFeaturedImage(result.imageUrl || nextGallery[0] || featuredImage);
    setLocalImagePath(result.localPath || '');
    blog.imageUrl = result.imageUrl || blog.imageUrl;
    blog.localImagePath = result.localPath || '';
    blog.local_image_path = result.localPath || '';
    blog.imageGallery = nextGallery;
    setImageActionModalOpen(false);
    setPublishStatus({ state: 'idle', message: '', url: null });
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
                    <p className="text-2xl font-bold text-slate-900">{computedWordCount}</p>
                  </div>
                  <div>
                    <p className="text-sm text-slate-500">{t.readingTime}</p>
                    <p className="text-2xl font-bold text-slate-900">
                      {readingMinutes} min
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

          {featuredImage && (
            <div className="rounded-lg overflow-hidden space-y-2">
              <img src={featuredImage} alt={blog.title} className="w-full h-auto" />
              <button
                onClick={handleDownloadImage}
                className="inline-flex items-center space-x-2 px-3 py-2 bg-slate-900 text-white rounded-lg text-xs"
              >
                <Download className="w-4 h-4" />
                <span>{t.downloadImage}</span>
              </button>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">
              {t.generatedImagesLabel || 'Generated images'}
            </p>
            <div className="flex flex-wrap gap-2">
              {imageGallery.map((url) => (
                <div key={url} className="relative h-16 w-20">
                  <button
                    type="button"
                    onClick={() => handleSelectImage(url)}
                    className={`h-full w-full overflow-hidden rounded-md border ${
                      url === featuredImage ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'
                    } ${removedImageUrls.includes(url) ? 'opacity-40' : ''}`}
                    title={t.selectImageLabel || 'Use as featured image'}
                  >
                    <img src={url} alt="Generated" className="h-full w-full object-cover" />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRemovedImageUrls((prev) =>
                        prev.includes(url) ? prev.filter((item) => item !== url) : [...prev, url]
                      );
                    }}
                    className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/95 text-slate-700 shadow hover:bg-white"
                    title={t.deleteLabel || 'Delete'}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setImageActionModalOpen(true)}
                className="flex h-16 w-20 items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 text-slate-500 hover:border-blue-400 hover:text-blue-600"
                title={t.addImageLabel || 'Add image'}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            {removedImageUrls.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowImageDeleteConfirm(true)}
                  className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700"
                >
                  {t.saveChanges || 'Save changes'}
                </button>
              </div>
            )}
          </div>

          <div ref={contentRef} className="space-y-6">
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
                ref={renderedContentRef}
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
        </div>

        {canExport && (
          <>
            <div
              ref={inlineActionBarRef}
              className={`border-t border-slate-200 bg-slate-50 px-8 py-4 ${
                showFloatingBar ? 'opacity-0 pointer-events-none' : ''
              }`}
              aria-hidden={showFloatingBar}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg border border-slate-200 bg-slate-200 text-slate-700 hover:bg-slate-300 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
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
            {showFloatingBar && (
              <div className="fixed bottom-6 left-[calc(50%+8rem)] z-40 w-[min(1024px,calc(100%-20rem))] -translate-x-1/2 rounded-2xl border border-slate-200/90 bg-white/95 px-4 py-3 shadow-2xl backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/90">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="inline-flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 transition dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                    >
                      <Copy className="w-4 h-4" />
                      <span>{t.copy}</span>
                    </button>
                    {onEdit && (
                      <button
                        onClick={onEdit}
                        className="inline-flex items-center space-x-2 rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800 transition dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
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
                      className={`inline-flex items-center space-x-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100 transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={t.exportMarkdown}
                    >
                      <FileText className="w-4 h-4" />
                      <span>MD</span>
                    </button>
                    <button
                      onClick={() => handleExport('html')}
                      disabled={exporting}
                      className={`inline-flex items-center space-x-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100 transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={t.exportHtml}
                    >
                      <FileCode2 className="w-4 h-4" />
                      <span>HTML</span>
                    </button>
                    <button
                      onClick={() => handleExport('pdf')}
                      disabled={exporting}
                      className={`inline-flex items-center space-x-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100 transition dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900 ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={t.exportPdf}
                    >
                      <Download className={`w-4 h-4 ${exporting ? 'animate-pulse' : ''}`} />
                      <span>{exporting ? 'Exporting...' : 'PDF'}</span>
                    </button>
                    <button
                      onClick={() => handleExport('docx')}
                      disabled={exporting}
                      className={`inline-flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition ${exporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={t.exportDocx}
                    >
                      <Download className="w-4 h-4" />
                      <span>DOCX</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
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
              <ModalCloseButton onClick={() => setPublishDialogOpen(false)} label={t.close || 'Close'} />
            </div>

            {/* Previous publish history */}
            {publishHistory.length > 0 && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                <p className="text-xs font-medium text-blue-800 mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {t.previouslyPublishedLabel || 'Previously Published'}
                </p>
                <div className="space-y-1.5">
                  {publishHistory.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-xs">
                      <span className="text-blue-700">
                        {item.destinationName} • {item.status === 'publish' ? (t.liveLabel || 'Live') : (t.statusDraft || 'Draft')}
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
                        <span className="font-medium">{t.publishNow || 'Publish Now'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-500 mt-1.5">
                      {publishMode === 'draft'
                        ? (t.publishModeDraftHint || 'Save as draft for later editing before publishing')
                        : (t.publishModePublishHint || 'Publish immediately and make visible to readers')}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        {t.categoriesLabel || 'Categories'}
                      </label>
                      {categoriesLoading && <span className="text-xs text-slate-500">{t.loading || 'Loading...'}</span>}
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
                    {t.viewOnSite || 'View on site'}
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
                    ? (publishMode === 'publish'
                        ? (t.publishInProgress || 'Publishing...')
                        : (t.creatingDraftLabel || 'Creating draft...'))
                    : (publishMode === 'publish' ? (t.publishNow || 'Publish Now') : (t.saveDraft || 'Save as Draft'))}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {imageActionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 px-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {t.imageActionsTitle || 'Image actions'}
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              {t.imageActionsHint || 'Generate a new image or upload one from your computer.'}
            </p>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={async () => {
                  setImageActionModalOpen(false);
                  await handleGenerateImage();
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500"
              >
                <Sparkles className="h-4 w-4" />
                {isGeneratingImage ? (t.generatingImageLabel || 'Generating...') : (t.generateImageLabel || 'Generate image')}
              </button>
              <button
                type="button"
                onClick={handleUploadLocalImage}
                disabled={uploadingLocalImage}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <Upload className="h-4 w-4" />
                {uploadingLocalImage ? (t.uploadingLabel || 'Uploading...') : (t.uploadImageLabel || 'Upload image')}
              </button>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setImageActionModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t.cancel || 'Cancel'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showImageDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">
              {t.deleteConfirmTitle || 'Delete selected images'}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t.deleteConfirm || 'Delete selected images? This action cannot be undone.'}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowImageDeleteConfirm(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700"
              >
                {t.cancel || 'Cancel'}
              </button>
              <button
                type="button"
                onClick={applyDeletedImages}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
              >
                {t.deleteLabel || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCopyToast && (
        <div className="fixed right-6 top-24 z-[90] rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {t.copySuccess || 'Content copied to clipboard!'}
        </div>
      )}
    </div>
  );
}

export default ResultsPage;
