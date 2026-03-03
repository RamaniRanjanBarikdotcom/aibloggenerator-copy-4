import React, { useEffect, useState } from 'react';
import { Sparkles, Globe, RefreshCw, Settings2, X, Save, RotateCcw, Trash2, History, Eye } from 'lucide-react';
import { languageNames } from '../i18n';

const DEFAULT_PROMPTS = {
  styleGuardrails:
    'You are an expert SEO content writer focused on human-first, high-quality blog posts that feel natural, non-repetitive, and trustworthy.',
  seoStructureGuardrails:
    'Use clear sections, short paragraphs, and purposeful lists. Avoid fluff, repetition, or filler.',
  seoResearchPrompt:
    'You are an SEO expert. Analyze this topic and provide keyword research in {{language}}.\n\nTopic: "{{topic}}"\nKeywords: "{{keywords}}"\nFocus keyword: "{{focusKeyword}}"\n\nRespond with JSON:\n{\n  "primaryKeyword": "main keyword",\n  "secondaryKeywords": ["keyword1", "keyword2", "keyword3"],\n  "searchIntent": "informational/transactional",\n  "relatedTopics": ["topic1", "topic2"]\n}',
  keyTakeawaysPrompt:
    'Summarize 4-6 qualitative key takeaways for the topic "{{topic}}" in {{language}} as bullet points. Avoid statistics or specific numbers.',
  researchSynthesisPrompt:
    'Synthesize research for "{{topic}}" in {{language}} using the context below. Focus on qualitative insights, influencing factors, and practical guidance. Avoid statistics, percentages, or numeric claims. Provide a concise research brief with:\n- key themes\n- audience pain points\n- trustworthy sources to cite (with URLs from context)\n- recommended angles for the blog\n\nContext:\n{{researchContext}}',
  outlinePrompt:
    'Create a detailed blog outline in {{language}} for: "{{topic}}"\n\nKeywords to include: {{secondaryKeywords}}\n\nRespond with JSON:\n{\n  "sections": [\n    {"heading": "Introduction", "subsections": ["Hook", "Overview"]},\n    {"heading": "Main Section 1", "subsections": ["Point A", "Point B"]}\n  ]\n}',
  blogPrompt: `Write a comprehensive blog post in {{language}}.

Topic: "{{topic}}"
Style: {{writingStyle}}
Tone: {{writingTone}}
Target word count: {{targetWordCount}}

Primary keyword: {{primaryKeyword}}
Secondary keywords: {{secondaryKeywords}}

Outline:
{{outline}}

Formatting rules:
- Output valid HTML only. Use <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <tbody>, <tr>, <th>, <td>, <blockquote>, and <pre><code>.
- Do not wrap the output in Markdown code fences like \`\`\` or \`\`\`html.
- Include a single <h1> at the top of the content.
- All H2 headings must be max 9 words and formatted exactly like:
  - <h2>[Number] [Keyword] for [Benefit]</h2> or <h2>What [Keyword] are there?</h2>
- Use sequential numbers when listing (1, 2, 3, 4, 5).
- After every H2, add an introductory sentence of 20-30 words in a <p> tag. Do not repeat the H2 text and do not say "Here are".
- If the section is a list, include 5-7 points, each 15-25 words, each point starts with a noun, and all points have parallel structure and consistent punctuation.
- For processes or troubleshooting, use a numbered list (<ol>).
- Add a small FAQ section with 3-5 Q&A entries using <p><strong>Q:</strong> ...</p><p><strong>A:</strong> ...</p>.
- Include one comparison table (<table>).
- Include one expert quote in <blockquote>.
- Include one short code block in <pre><code> only if the topic is technical; otherwise omit it.
- Include one callout in the format: <p><strong>Pro Tip:</strong> ...</p>.

Content rules:
- FACTS RULE: No specific numbers, percentages, or statistics in body content. Use qualitative descriptions and factors instead.
- Avoid repetition and keep language natural and human.
- Conclude with a gentle suggestion to seek individualized consultation for unique situations.
- If research context includes sources, cite them with inline links like <a href="URL">Source</a>.
- If internal site URL is provided, include a few natural internal links using that base.
- If product context is provided, link product names to their URLs.
- Ensure troubleshooting topics provide step-by-step guidance.

Include:
- Engaging title
- Meta description (under 160 characters)
- Introduction with hook
- Main body sections based on outline
- Practical conclusion with CTA

Format as JSON:
{
  "title": "Blog Title",
  "metaDescription": "Description",
  "content": "Full blog content in HTML format"
}`,
  repairPrompt:
    'You are a senior editor. Rewrite this draft into a full blog post with complete paragraphs, not an outline.\n\nDraft:\n{{draft}}\n\nRespond with JSON:\n{\n  "title": "Blog Title",\n  "metaDescription": "Description",\n  "content": "Full blog content in HTML format"\n}',
  humanizePrompt:
    'Improve the following blog post for natural flow, readability, and human tone without changing facts.\n\nContent:\n{{draft}}\n\nReturn the improved content only.',
  compliancePrompt:
    'You are a strict editor. Revise the draft to comply with all formatting and content rules.\n\nRules:\n- Output valid HTML only. Use <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <table>, <tbody>, <tr>, <th>, <td>, <blockquote>, and <pre><code>.\n- Do not use Markdown markers like #, ##, ###, -, *, or ``` for formatting.\n- Do not wrap the output in Markdown code fences like \\`\\`\\` or \\`\\`\\`html.\n- Include a single <h1> at the top of the content.\n- H2 rules: max 9 words, format as "[Number] [Keyword] for [Benefit]" or "What [Keyword] are there?", use sequential numbers (1, 2, 3, 4, 5).\n- After each H2, add a 20-30 word intro sentence.\n- Lists: 5-7 items, 15-25 words each, noun-led, parallel structure, consistent punctuation.\n- Processes use numbered lists.\n- Include FAQ (3-5 Q&A), a comparison table, one blockquote, a code block only if the topic is technical, and a "Pro Tip" callout.\n- FACTS RULE: No statistics, percentages, or specific numeric claims in body content.\n- Add a gentle suggestion for individualized consultation.\n- Keep content natural, non-repetitive, and useful.\n\nDraft:\n{{draft}}\n\nReturn the revised content only.',
  imagePrompt: `You are an expert AI prompt engineer specialized in generating high-quality photorealistic featured image prompts for professional blog articles.

Your task is to convert a blog topic paragraph into one polished image-generation prompt.

Instructions:

Analyze the input text and extract:

A clear, specific visual subject

A natural action being performed

A realistic setting or environment

Supporting visual details such as lighting, mood, composition, and color tones

If the topic is abstract (SEO, AI, marketing, strategy, analytics, etc.), convert it into a realistic visual metaphor that can be photographed naturally.

Generate exactly ONE single-line prompt using this structure:

[Specific subject], [natural action], in [clear setting], with [lighting, mood, composition, visual details]. The image must be natural, realistic, in 2018, style raw, 8K, taken on iPhone, --ar 16:9

Strict Rules:

Output ONLY the final image prompt.

No explanations.

No extra text.

No formatting.

No text overlays.

No logos.

No UI elements.

Must be photorealistic.

Must be landscape orientation (16:9).

Must end exactly with:

The image must be natural, realistic, in 2018, style raw, 8K, taken on iPhone, --ar 16:9
|

Input text:
{{topicParagraph}}`,
};

const PROMPT_LABELS = {
  styleGuardrails: 'Style guardrails',
  seoStructureGuardrails: 'SEO structure',
  seoResearchPrompt: 'SEO research',
  keyTakeawaysPrompt: 'Key takeaways',
  researchSynthesisPrompt: 'Research synthesis',
  outlinePrompt: 'Outline',
  blogPrompt: 'Blog content',
  repairPrompt: 'Repair',
  humanizePrompt: 'Humanize',
  compliancePrompt: 'Compliance pass',
  imagePrompt: 'Image prompt',
};

function BlogForm({ onGenerate, isGenerating, language, t, canGenerate, currentUser }) {
  const BLOG_FORM_DRAFT_KEY = 'blog_form_draft_v1';
  const BLOG_FAILED_DRAFTS_KEY = 'blog_failed_generations_v2';
  const LEGACY_FAILED_DRAFT_KEY = 'blog_failed_generation_v1';

  const [topic, setTopic] = useState('');
  const [keywords, setKeywords] = useState('');
  const [focusKeyword, setFocusKeyword] = useState('');
  const [writingStyle, setWritingStyle] = useState('professional');
  const [writingTone, setWritingTone] = useState('friendly');
  const [targetWordCount, setTargetWordCount] = useState(2500);
  const [useProductContext, setUseProductContext] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [platform, setPlatform] = useState('generic');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [linkPreview, setLinkPreview] = useState(null);
  const [linkPreviewError, setLinkPreviewError] = useState('');
  const [isPreviewPopoverOpen, setIsPreviewPopoverOpen] = useState(false);
  const [lastPreviewUrl, setLastPreviewUrl] = useState('');
  const [productDatabase, setProductDatabase] = useState([]);
  const [loadedStatus, setLoadedStatus] = useState('');
  const [promptPanelOpen, setPromptPanelOpen] = useState(false);
  const [promptTemplates, setPromptTemplates] = useState(DEFAULT_PROMPTS);
  const [promptSaving, setPromptSaving] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [failedDrafts, setFailedDrafts] = useState([]);
  const [failedDraftsOpen, setFailedDraftsOpen] = useState(false);
  const isAdmin = currentUser?.role === 'admin';

  const saveFailedDrafts = (items) => {
    setFailedDrafts(items);
    localStorage.setItem(BLOG_FAILED_DRAFTS_KEY, JSON.stringify(items));
  };

  const applyDraft = (draft) => {
    if (!draft) return;
    setTopic(draft.topic || '');
    setKeywords(draft.keywords || '');
    setFocusKeyword(draft.settings?.focusKeyword || '');
    setWritingStyle(draft.settings?.writingStyle || 'professional');
    setWritingTone(draft.settings?.writingTone || 'friendly');
    setTargetWordCount(draft.settings?.targetWordCount || 2500);
    setUseProductContext(Boolean(draft.settings?.useProductContext));
  };

  const buildPayloadFromDraft = (draft) => ({
    topic: (draft.topic || '').trim(),
    keywords: (draft.keywords || '').trim(),
    categories: Array.isArray(draft.categories) ? draft.categories : [],
    settings: {
      writingStyle: draft.settings?.writingStyle || 'professional',
      writingTone: draft.settings?.writingTone || 'friendly',
      targetWordCount: draft.settings?.targetWordCount || 2500,
      useProductContext: Boolean(draft.settings?.useProductContext),
      focusKeyword: draft.settings?.focusKeyword || '',
      language: draft.settings?.language || languageNames[language] || 'English',
    },
  });

  useEffect(() => {
    const loadExistingProducts = async () => {
      try {
        const result = await window.electronAPI.getProductDatabase();
        if (result.success) {
          const products = result.products || [];
          setProductDatabase(products);
          if (products.length > 0) {
            setLoadedStatus(t.scraperLoadedCount.replace('{count}', products.length));
          }
        }
      } catch (error) {
        setLoadedStatus(t.scraperLoadError.replace('{message}', error.message));
      }
    };
    loadExistingProducts();
  }, [t]);

  useEffect(() => {
    if (!isAdmin) return;
    const loadPromptTemplates = async () => {
      const result = await window.electronAPI.getSettings();
      if (result.success) {
        const settings = result.settings || {};
        setPromptTemplates({ ...DEFAULT_PROMPTS, ...(settings.promptTemplates || {}) });
      }
    };
    loadPromptTemplates();
  }, [isAdmin]);

  useEffect(() => {
    try {
      const savedDraftRaw = localStorage.getItem(BLOG_FORM_DRAFT_KEY);
      if (savedDraftRaw) {
        const savedDraft = JSON.parse(savedDraftRaw);
        applyDraft(savedDraft);
      }

      const failedDraftsRaw = localStorage.getItem(BLOG_FAILED_DRAFTS_KEY);
      if (failedDraftsRaw) {
        const parsed = JSON.parse(failedDraftsRaw);
        if (Array.isArray(parsed)) {
          setFailedDrafts(parsed);
        } else if (parsed && typeof parsed === 'object') {
          setFailedDrafts([parsed]);
        } else {
          setFailedDrafts([]);
        }
      } else {
        const legacyRaw = localStorage.getItem(LEGACY_FAILED_DRAFT_KEY);
        if (legacyRaw) {
          const legacyDraft = JSON.parse(legacyRaw);
          const migrated = [{ id: `fd-${Date.now()}`, ...legacyDraft }];
          setFailedDrafts(migrated);
          localStorage.setItem(BLOG_FAILED_DRAFTS_KEY, JSON.stringify(migrated));
          localStorage.removeItem(LEGACY_FAILED_DRAFT_KEY);
        }
      }
    } catch (error) {
      console.warn('Failed to load draft data:', error);
    } finally {
      setDraftHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!draftHydrated) return;
    const draft = {
      topic: topic.trim(),
      keywords: keywords.trim(),
      categories: [],
      settings: {
        writingStyle,
        writingTone,
        targetWordCount,
        useProductContext,
        focusKeyword: focusKeyword.trim(),
        language: languageNames[language] || 'English',
      },
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(BLOG_FORM_DRAFT_KEY, JSON.stringify(draft));
  }, [
    draftHydrated,
    topic,
    keywords,
    focusKeyword,
    writingStyle,
    writingTone,
    targetWordCount,
    useProductContext,
    language,
  ]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!topic.trim()) {
      alert('Please enter a blog topic');
      return;
    }

    onGenerate({
      topic: topic.trim(),
      keywords: keywords.trim(),
      categories: [],
      settings: {
        writingStyle,
        writingTone,
        targetWordCount,
        useProductContext,
        focusKeyword,
        language: languageNames[language] || 'English',
      },
    });
  };

  const handleGenerateAgain = (draft) => {
    const payload = buildPayloadFromDraft(draft);
    applyDraft(draft);
    setFailedDraftsOpen(false);
    onGenerate(payload, {
      failedDraftId: draft.id,
      resumeState: draft.resumeState || null,
      resumeStep: draft.lastProgress?.step ?? draft.resumeState?.completedStep ?? 0,
      resumeMessage:
        draft.lastProgress?.message ||
        t.resumeFromStepMessage ||
        'Resuming from the last completed step...',
    });
  };

  const handleScrape = async () => {
    if (!websiteUrl.trim()) {
      alert(t.scraperUrlMissing);
      return;
    }
    setIsScraping(true);
    setScrapeStatus(t.scraperRunning);
    try {
      const result = await window.electronAPI.scrapeWebsite({
        url: websiteUrl.trim(),
        platform,
      });
      if (result.success) {
        const products = result.products || [];
        if (products.length === 0) {
          setScrapeStatus(t.scraperNoResults);
        } else {
          const saveResult = await window.electronAPI.saveProductDatabase({ products });
          if (saveResult.success) {
            setScrapeStatus(t.scraperSavedCount.replace('{count}', products.length));
            setUseProductContext(true);
            setProductDatabase(products);
          } else {
            setScrapeStatus(t.scraperSaveError.replace('{message}', saveResult.error || ''));
          }
        }
      } else {
        setScrapeStatus(t.scraperScrapeError.replace('{message}', result.error || ''));
      }
    } catch (error) {
      setScrapeStatus(t.scraperScrapeError.replace('{message}', error.message));
    }
    setIsScraping(false);
  };

  const normalizePreviewUrl = (value) => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (!/^https?:\/\//i.test(trimmed)) return '';
    return trimmed;
  };

  const fetchLinkPreview = async (value) => {
    const normalized = normalizePreviewUrl(value);
    if (!normalized) {
      setLinkPreview(null);
      setLinkPreviewError('');
      return;
    }
    if (normalized === lastPreviewUrl && (linkPreview || linkPreviewError)) {
      return;
    }
    setIsPreviewLoading(true);
    setLinkPreviewError('');
    try {
      const result = await window.electronAPI.previewLink({ url: normalized });
      if (result.success) {
        setLinkPreview(result.preview || null);
        setLastPreviewUrl(normalized);
      } else {
        setLinkPreview(null);
        setLinkPreviewError(result.error || t.previewUnavailable);
        setLastPreviewUrl(normalized);
      }
    } catch (error) {
      setLinkPreview(null);
      setLinkPreviewError(error.message || t.previewUnavailable);
      setLastPreviewUrl(normalized);
    }
    setIsPreviewLoading(false);
  };

  useEffect(() => {
    const normalized = normalizePreviewUrl(websiteUrl);
    if (!normalized) {
      setLinkPreview(null);
      setLinkPreviewError('');
      setLastPreviewUrl('');
      return;
    }
    const timer = setTimeout(() => {
      fetchLinkPreview(normalized);
    }, 500);
    return () => clearTimeout(timer);
  }, [websiteUrl]);

  return (
    <div className={`blog-form-page max-w-4xl mx-auto p-8 ${promptPanelOpen ? 'mr-96' : ''}`}>
      <h2 className="text-3xl font-bold text-slate-900 mb-2 dark:text-slate-100">{t.createNewBlog}</h2>
      <p className="text-slate-600 mb-8 dark:text-slate-300">{t.generateSeo}</p>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setFailedDraftsOpen(true)}
          title={t.failedDraftsTitle || 'Failed Generations'}
          aria-label={t.failedDraftsTitle || 'Failed Generations'}
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm hover:bg-blue-700"
        >
          <History className="h-4 w-4" />
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-white px-1 text-center text-[10px] font-bold leading-5 text-blue-700">
            {failedDrafts.length}
          </span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm p-8 space-y-6 dark:bg-slate-900 dark:border dark:border-slate-700">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
            {t.blogTopic}
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder={t.blogTopicPlaceholder}
            className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
            {t.keywords}
          </label>
          <input
            type="text"
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder={t.keywordsPlaceholder}
            className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
            {t.focusKeywordLabel}
          </label>
          <input
            type="text"
            value={focusKeyword}
            onChange={(e) => setFocusKeyword(e.target.value)}
            placeholder={t.focusKeywordPlaceholder}
            className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
          />
        </div>

        <div className="border border-slate-200 rounded-lg p-5 space-y-4 dark:border-slate-700 dark:bg-slate-950/30">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
              {t.scraperUrlLabel}
            </label>
            <div className="relative flex gap-2">
              <input
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-4 py-3 pr-12 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
              />
              <button
                type="button"
                onMouseEnter={() => setIsPreviewPopoverOpen(true)}
                onMouseLeave={() => setIsPreviewPopoverOpen(false)}
                onFocus={() => setIsPreviewPopoverOpen(true)}
                onBlur={() => setIsPreviewPopoverOpen(false)}
                aria-label={t.previewLinkButton || 'Preview'}
                className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                <Eye className="h-4 w-4" />
              </button>
              {isPreviewPopoverOpen && (
                <div
                  onMouseEnter={() => setIsPreviewPopoverOpen(true)}
                  onMouseLeave={() => setIsPreviewPopoverOpen(false)}
                  className="absolute right-0 top-12 z-20 w-80 rounded-lg border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t.previewSectionTitle}
                  </p>
                  {isPreviewLoading ? (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">{t.previewLoading}</p>
                  ) : linkPreviewError ? (
                    <p className="mt-2 text-xs text-red-600 dark:text-red-400">{linkPreviewError}</p>
                  ) : linkPreview ? (
                    <div className="mt-2 flex gap-3">
                      {linkPreview.image ? (
                        <img
                          src={linkPreview.image}
                          alt={linkPreview.title || 'preview'}
                          className="h-14 w-14 rounded-md border border-slate-200 object-cover dark:border-slate-700"
                        />
                      ) : (
                        <div className="h-14 w-14 rounded-md border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {linkPreview.title}
                        </p>
                        <p className="line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                          {linkPreview.description || linkPreview.url}
                        </p>
                        <a
                          href={linkPreview.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-block text-xs text-blue-600 hover:underline dark:text-blue-400"
                        >
                          {linkPreview.siteName || linkPreview.url}
                        </a>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                      {t.previewUnavailable || 'Preview unavailable'}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
                {t.scraperPlatformLabel}
              </label>
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700"
              >
                <option value="shopify">Shopify</option>
                <option value="woocommerce">WooCommerce</option>
                <option value="react">React</option>
                <option value="generic">Generic</option>
                <option value="jtl">JTL</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={handleScrape}
            disabled={isScraping}
            className="w-full bg-blue-50 text-blue-700 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-blue-100 transition disabled:opacity-50"
          >
            {isScraping ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{t.scraperRunning}</span>
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                <span>{t.scraperRun}</span>
              </>
            )}
          </button>

          {loadedStatus && <p className="text-xs text-slate-700 dark:text-slate-300">{loadedStatus}</p>}
          {scrapeStatus && <p className="text-xs text-slate-700 dark:text-slate-300">{scrapeStatus}</p>}

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input
              type="checkbox"
              checked={useProductContext}
              onChange={(e) => setUseProductContext(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            {t.useProductContext}
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
            {t.writingStyle}
          </label>
          <div className="grid grid-cols-4 gap-3">
            {['professional', 'casual', 'technical', 'creative'].map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setWritingStyle(style)}
                className={`px-4 py-2 rounded-lg capitalize transition ${
                  writingStyle === style
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
            {t.writingTone}
          </label>
          <div className="grid grid-cols-4 gap-3">
            {['friendly', 'formal', 'persuasive', 'casual'].map((tone) => (
              <button
                key={tone}
                type="button"
                onClick={() => setWritingTone(tone)}
                className={`px-4 py-2 rounded-lg capitalize transition ${
                  writingTone === tone
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {tone}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2 dark:text-slate-200">
            {t.targetWordCount}: {targetWordCount}
          </label>
          <input
            type="range"
            min="1000"
            max="5000"
            step="500"
            value={targetWordCount}
            onChange={(e) => setTargetWordCount(parseInt(e.target.value, 10))}
            className="w-full accent-blue-500"
          />
          <div className="flex justify-between text-xs text-slate-500 mt-1 dark:text-slate-400">
            <span>1,000</span>
            <span>5,000</span>
          </div>
        </div>

        <button
          type="submit"
          disabled={isGenerating || !canGenerate}
          className="w-full bg-gradient-to-r from-blue-500 to-purple-500 text-white py-4 rounded-lg font-semibold text-lg flex items-center justify-center space-x-2 hover:from-blue-600 hover:to-purple-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Sparkles className="w-5 h-5" />
          <span>{isGenerating ? t.generating : t.generate}</span>
        </button>

      </form>

      {failedDraftsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t.failedDraftsTitle || 'Failed Generations'}
              </h3>
              <button
                type="button"
                onClick={() => setFailedDraftsOpen(false)}
                  className="rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
              {failedDrafts.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {t.noFailedDrafts || 'No failed generations yet.'}
                </div>
              ) : (
                failedDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {draft.topic || '-'}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {t.failedDraftKeywords || 'Keywords'}: {draft.keywords || '-'}
                    </p>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                      {t.failedDraftFailedAt || 'Failed at'}:{' '}
                      {draft.failedAt ? new Date(draft.failedAt).toLocaleString() : '-'}
                    </p>
                    <p className="mt-1 text-xs text-red-700">
                      {draft.error || t.failedDraftUnknown || 'Unknown error'}
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleGenerateAgain(draft)}
                        disabled={isGenerating}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span>{t.generateAgainFromFailed || 'Generate Again'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = failedDrafts.filter((item) => item.id !== draft.id);
                          saveFailedDrafts(next);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t.deleteFailedDraft || 'Delete'}</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <>
          {!promptPanelOpen && (
            <button
              type="button"
              onClick={() => setPromptPanelOpen(true)}
              className="fixed right-0 top-1/2 -translate-y-1/2 bg-slate-900 text-white px-2 py-4 rounded-l-lg shadow-lg hover:bg-slate-800"
              title={t.promptTemplatesTitle || 'Prompt Templates'}
            >
              <Settings2 className="w-5 h-5" />
            </button>
          )}
          {promptPanelOpen && (
            <div className="fixed right-0 top-0 h-full w-96 bg-white border-l border-slate-200 shadow-xl z-50 flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-900 text-white">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4" />
                  <h3 className="text-sm font-semibold">{t.promptTemplatesTitle}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setPromptPanelOpen(false)}
                  className="text-white/80 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {Object.keys(DEFAULT_PROMPTS).map((key) => (
                  <div key={key} className="space-y-2">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                      {PROMPT_LABELS[key] || key}
                    </label>
                    <textarea
                      value={promptTemplates[key] || ''}
                      onChange={(e) =>
                        setPromptTemplates((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="w-full min-h-[120px] px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                ))}
              </div>
              <div className="p-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={async () => {
                    setPromptSaving(true);
                    const result = await window.electronAPI.updateSettings({
                      promptTemplates,
                    });
                    if (!result.success) {
                      alert(result.error || 'Failed to save prompts');
                    }
                    setPromptSaving(false);
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
                >
                  <Save className="w-4 h-4" />
                  {promptSaving ? t.saved : t.saveSettings}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default BlogForm;
