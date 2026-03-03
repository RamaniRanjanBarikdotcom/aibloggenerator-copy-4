import React, { useEffect, useState } from 'react';
import { Save, Eye, EyeOff, Plus, Trash2, CheckCircle, RefreshCw, ChevronDown } from 'lucide-react';

const PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    keyPrefix: 'sk-',
    models: [
      'gpt-4o',
      'gpt-4o-mini',
      'gpt-4.1',
      'gpt-4.1-mini',
      'gpt-4.1-nano',
      'gpt-4-turbo',
      'o3',
      'o3-mini',
      'o1',
      'o1-mini',
    ],
    imageModels: ['gpt-image-1', 'dall-e-3'],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'google',
    name: 'Google AI',
    keyPrefix: 'AIza',
    models: [
      'gemini-2.5-pro',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
      'gemini-2.0-flash-lite',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
    ],
    imageModels: ['imagen-3.0-generate-002'],
    supportsGeneration: true,
    supportsResearch: false,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    keyPrefix: 'sk-or-',
    models: [
      'openrouter/auto',
      'openai/gpt-4o',
      'openai/gpt-4.1',
      'anthropic/claude-3.7-sonnet',
      'anthropic/claude-3.5-sonnet',
      'google/gemini-2.5-pro',
      'meta-llama/llama-3.3-70b-instruct',
      'mistralai/mistral-large',
    ],
    imageModels: ['openai/gpt-image-1', 'google/imagen-3.0-generate-002'],
    supportsGeneration: true,
    supportsResearch: false,
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    keyPrefix: 'sk-ant-',
    models: [
      'claude-3-7-sonnet-latest',
      'claude-3-5-sonnet-latest',
      'claude-3-5-haiku-latest',
      'claude-3-opus-latest',
    ],
    imageModels: [],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'groq',
    name: 'Groq',
    keyPrefix: 'gsk_',
    models: [
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
    ],
    imageModels: [],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    keyPrefix: 'xai-',
    models: ['grok-2-latest', 'grok-2-mini-latest', 'grok-beta'],
    imageModels: [],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'huggingface',
    name: 'Hugging Face',
    keyPrefix: 'hf_',
    models: [
      'meta-llama/Llama-3.3-70B-Instruct',
      'Qwen/Qwen2.5-72B-Instruct',
      'mistralai/Mistral-7B-Instruct-v0.3',
    ],
    imageModels: [],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'mistral',
    name: 'Mistral',
    keyPrefix: '',
    models: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
    imageModels: [],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'together',
    name: 'Together AI',
    keyPrefix: '',
    models: [
      'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
      'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo',
      'Qwen/Qwen2.5-72B-Instruct-Turbo',
    ],
    imageModels: [],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'fireworks',
    name: 'Fireworks',
    keyPrefix: '',
    models: [
      'accounts/fireworks/models/llama-v3p3-70b-instruct',
      'accounts/fireworks/models/deepseek-r1',
    ],
    imageModels: [],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    keyPrefix: 'pplx-',
    models: ['sonar', 'sonar-pro'],
    imageModels: [],
    supportsGeneration: true,
    supportsResearch: true,
  },
  {
    id: 'tavily',
    name: 'Tavily',
    keyPrefix: 'tvly-',
    models: [],
    imageModels: [],
    supportsGeneration: false,
    supportsResearch: true,
  },
];

const GENERATION_PROVIDERS = PROVIDERS.filter((provider) => provider.supportsGeneration);
const SERP_PROVIDERS = [
  { id: 'none', name: 'None' },
  { id: 'openai', name: 'OpenAI (Web Search)' },
  { id: 'tavily', name: 'Tavily' },
];
const DEEP_RESEARCH_PROVIDERS = [
  { id: 'none', name: 'None' },
  ...PROVIDERS.filter((provider) => provider.supportsGeneration || provider.id === 'perplexity').map(
    (provider) => ({
      id: provider.id,
      name: provider.name,
    })
  ),
];

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

function SettingsPage({ t, currentUser, onUnsavedChange, registerLeaveActions }) {
  const [apiKeys, setApiKeys] = useState([]);
  const [newKeyLabel, setNewKeyLabel] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newKeyProvider, setNewKeyProvider] = useState('openai');
  const [showKeyId, setShowKeyId] = useState(null);
  const [aiProvider, setAiProvider] = useState('openai');
  const [imageProvider, setImageProvider] = useState('openai');
  const [aiModel, setAiModel] = useState('gpt-4o');
  const [imageModel, setImageModel] = useState('dall-e-3');
  const [maxTokens, setMaxTokens] = useState('');
  const [serpProvider, setSerpProvider] = useState('openai');
  const [deepResearchProvider, setDeepResearchProvider] = useState('openai');
  const [deepResearchModel, setDeepResearchModel] = useState('gpt-4o-mini');
  const [useWikipedia, setUseWikipedia] = useState(true);
  const [siteBaseUrl, setSiteBaseUrl] = useState('');
  const [linkPreviewApiKey, setLinkPreviewApiKey] = useState('');
  const [tavilyKey, setTavilyKey] = useState('');
  const [perplexityKey, setPerplexityKey] = useState('');
  const [autoSave, setAutoSave] = useState(true);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('ai');
  const [modelSearch, setModelSearch] = useState('');
  const [imageModelSearch, setImageModelSearch] = useState('');
  const [modelFamilyFilter, setModelFamilyFilter] = useState('all');
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [imageModelDropdownOpen, setImageModelDropdownOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState({});
  const [publishTestStatus, setPublishTestStatus] = useState({});
  const [promptTemplates, setPromptTemplates] = useState(DEFAULT_PROMPTS);
  const [usage, setUsage] = useState({ totalCost: 0, totalTokens: 0, blogsGenerated: 0 });
  const [providerCatalog, setProviderCatalog] = useState({});
  const [providerCatalogStatus, setProviderCatalogStatus] = useState({});
  const [providerCatalogError, setProviderCatalogError] = useState({});
  const [publishDestinations, setPublishDestinations] = useState([]);
  const [shopifyBlogs, setShopifyBlogs] = useState([]);
  const [shopifyBlogsLoading, setShopifyBlogsLoading] = useState(false);
  const [shopifyBlogsError, setShopifyBlogsError] = useState('');
  const [shopifyOAuthLoading, setShopifyOAuthLoading] = useState(false);
  const [shopifyOAuthError, setShopifyOAuthError] = useState('');
  const [newDestination, setNewDestination] = useState({
    name: '',
    platform: 'wordpress',
    baseUrl: '',
    authMethod: 'token',
    apiToken: '',
    username: '',
    appPassword: '',
    shopDomain: '',
    accessToken: '',
    blogId: '',
    apiVersion: '2024-01',
    endpointUrl: '',
    authHeaderName: '',
    authHeaderValue: '',
    extraPayloadJson: '',
  });

  const [users, setUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedUserSettings, setSelectedUserSettings] = useState(null);
  const [userSaved, setUserSaved] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState('');

  const isAdmin = currentUser?.role === 'admin';

  const fetchShopifyBlogs = async (overrides = {}) => {
    setShopifyBlogsError('');
    const shopDomain = String(overrides.shopDomain ?? newDestination.shopDomain).trim();
    const accessToken = String(overrides.accessToken ?? newDestination.accessToken).trim();
    const apiVersion = String(overrides.apiVersion ?? newDestination.apiVersion).trim() || '2024-01';
    if (!shopDomain || !accessToken) {
      setShopifyBlogsError('Shop domain and access token are required.');
      return;
    }
    setShopifyBlogsLoading(true);
    try {
      const result = await window.electronAPI.listShopifyBlogs({
        shopDomain,
        accessToken,
        apiVersion,
      });
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to fetch Shopify blogs.');
      }
      const blogs = Array.isArray(result.blogs) ? result.blogs : [];
      setShopifyBlogs(blogs);
      if (!newDestination.blogId && blogs.length === 1) {
        setNewDestination((prev) => ({ ...prev, blogId: String(blogs[0].id) }));
      }
    } catch (error) {
      setShopifyBlogs([]);
      setShopifyBlogsError(error?.message || 'Failed to fetch Shopify blogs.');
    } finally {
      setShopifyBlogsLoading(false);
    }
  };

  const handleShopifyOAuth = async () => {
    setShopifyOAuthError('');
    const shopDomain = newDestination.shopDomain.trim();
    const apiVersion = newDestination.apiVersion.trim() || '2024-01';
    if (!shopDomain) {
      setShopifyOAuthError('Shop domain is required.');
      return;
    }
    setShopifyOAuthLoading(true);
    try {
      const result = await window.electronAPI.startShopifyOAuth({ shopDomain, apiVersion });
      if (!result?.success) {
        throw new Error(result?.error || 'Shopify OAuth failed.');
      }
      setNewDestination((prev) => ({
        ...prev,
        shopDomain: result.shopDomain || prev.shopDomain,
        accessToken: result.accessToken || prev.accessToken,
        apiVersion: result.apiVersion || prev.apiVersion,
      }));
      if (result.accessToken) {
        await fetchShopifyBlogs({
          shopDomain: result.shopDomain || shopDomain,
          accessToken: result.accessToken,
          apiVersion: result.apiVersion || apiVersion,
        });
      }
    } catch (error) {
      setShopifyOAuthError(error?.message || 'Shopify OAuth failed.');
    } finally {
      setShopifyOAuthLoading(false);
    }
  };

  const buildSettingsPayload = () => {
    const nextApiKeys = Array.isArray(apiKeys) ? [...apiKeys] : [];
    const upsertKey = (providerId, keyValue, label) => {
      const trimmed = keyValue.trim();
      if (!trimmed) return;
      const existing = nextApiKeys.find((item) => item.provider === providerId);
      if (existing) {
        existing.key = trimmed;
        existing.label = existing.label || label;
        existing.isActive = true;
        return;
      }
      nextApiKeys.push({
        id: `provider_${providerId}`,
        label,
        key: trimmed,
        provider: providerId,
        isActive: true,
      });
    };
    upsertKey('tavily', tavilyKey, 'Tavily Key');
    upsertKey('perplexity', perplexityKey, 'Perplexity Key');
    const payload = {
      aiProvider,
      imageProvider,
      aiModel,
      imageModel,
      maxTokens: maxTokens === '' ? null : Number(maxTokens),
      serpProvider,
      deepResearchProvider,
      deepResearchModel,
      useWikipedia,
      siteBaseUrl,
      linkPreviewApiKey: linkPreviewApiKey.trim(),
      autoSave,
      apiKeys: nextApiKeys,
      promptTemplates,
      publishDestinations,
    };
    return { payload, nextApiKeys };
  };

  const computeFingerprint = () => {
    const { payload } = buildSettingsPayload();
    return JSON.stringify(payload);
  };


  useEffect(() => {
    loadSettings();
    loadUsage();
  }, []);

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin && selectedUserId) {
      loadUserSettings(selectedUserId);
    }
  }, [isAdmin, selectedUserId]);

  const refreshProviderModels = async (providerId, { silent = false } = {}) => {
    if (!providerId) return;

    setProviderCatalogStatus((prev) => ({ ...prev, [providerId]: 'loading' }));
    setProviderCatalogError((prev) => ({ ...prev, [providerId]: '' }));
    const result = await window.electronAPI.listProviderModels({ provider: providerId });
    if (!result.success) {
      setProviderCatalogStatus((prev) => ({ ...prev, [providerId]: 'error' }));
      setProviderCatalogError((prev) => ({ ...prev, [providerId]: result.error || 'Failed to load models' }));
      if (!silent) {
        alert(result.error || 'Failed to load models');
      }
      return;
    }

    const next = result.models || { textModels: [], imageModels: [] };
    setProviderCatalog((prev) => ({ ...prev, [providerId]: next }));
    setProviderCatalogStatus((prev) => ({ ...prev, [providerId]: 'ready' }));
  };

  useEffect(() => {
    if (!aiProvider) return;
    refreshProviderModels(aiProvider, { silent: true });
  }, [aiProvider, apiKeys]);

  useEffect(() => {
    if (!imageProvider) return;
    refreshProviderModels(imageProvider, { silent: true });
  }, [imageProvider, apiKeys]);

  useEffect(() => {
    if (!deepResearchProvider || deepResearchProvider === 'none') return;
    refreshProviderModels(deepResearchProvider, { silent: true });
  }, [deepResearchProvider, apiKeys]);

  const loadSettings = async () => {
    const result = await window.electronAPI.getSettings();
    if (result.success) {
      const settings = result.settings || {};
      setAiProvider(settings.aiProvider || 'openai');
      setImageProvider(settings.imageProvider || settings.aiProvider || 'openai');
      setAiModel(settings.aiModel || 'gpt-4o');
      setImageModel(settings.imageModel || 'dall-e-3');
      setMaxTokens(
        settings.maxTokens === null || settings.maxTokens === undefined
          ? ''
          : String(settings.maxTokens)
      );
      setSerpProvider(settings.serpProvider || 'openai');
      setDeepResearchProvider(settings.deepResearchProvider || 'openai');
      setDeepResearchModel(settings.deepResearchModel || 'gpt-4o-mini');
      setUseWikipedia(settings.useWikipedia !== false);
      setSiteBaseUrl(settings.siteBaseUrl || '');
      setLinkPreviewApiKey(settings.linkPreviewApiKey || '');
      setAutoSave(settings.autoSave !== false);
      setApiKeys(Array.isArray(settings.apiKeys) ? settings.apiKeys : []);
      const storedKeys = Array.isArray(settings.apiKeys) ? settings.apiKeys : [];
      setTavilyKey(storedKeys.find((item) => item.provider === 'tavily')?.key || '');
      setPerplexityKey(storedKeys.find((item) => item.provider === 'perplexity')?.key || '');
      setPromptTemplates({ ...DEFAULT_PROMPTS, ...(settings.promptTemplates || {}) });
      setPublishDestinations(
        Array.isArray(settings.publishDestinations) ? settings.publishDestinations : []
      );
      const payloadForFingerprint = {
        aiProvider: settings.aiProvider || 'openai',
        imageProvider: settings.imageProvider || settings.aiProvider || 'openai',
        aiModel: settings.aiModel || 'gpt-4o',
        imageModel: settings.imageModel || 'dall-e-3',
        maxTokens:
          settings.maxTokens === null || settings.maxTokens === undefined
            ? null
            : Number(settings.maxTokens),
        serpProvider: settings.serpProvider || 'openai',
        deepResearchProvider: settings.deepResearchProvider || 'openai',
        deepResearchModel: settings.deepResearchModel || 'gpt-4o-mini',
        useWikipedia: settings.useWikipedia !== false,
        siteBaseUrl: settings.siteBaseUrl || '',
        linkPreviewApiKey: settings.linkPreviewApiKey || '',
        autoSave: settings.autoSave !== false,
        apiKeys: Array.isArray(settings.apiKeys) ? settings.apiKeys : [],
        promptTemplates: { ...DEFAULT_PROMPTS, ...(settings.promptTemplates || {}) },
        publishDestinations: Array.isArray(settings.publishDestinations) ? settings.publishDestinations : [],
      };
      setSavedFingerprint(JSON.stringify(payloadForFingerprint));
      onUnsavedChange?.(false);
    } else if (result.error) {
      console.error('Failed to load settings:', result.error);
      alert(t.loadSettingsError || `Failed to load settings: ${result.error}`);
    }
  };

  const loadUsage = async () => {
    const result = await window.electronAPI.getApiUsage();
    if (result.success) {
      setUsage(result.usage || { totalCost: 0, totalTokens: 0, blogsGenerated: 0 });
    }
  };

  const loadUsers = async () => {
    const result = await window.electronAPI.listUsers();
    if (result.success) {
      setUsers(result.users || []);
      if (!selectedUserId && result.users?.length) {
        const firstUser = result.users.find((user) => user.role !== 'admin') || result.users[0];
        if (firstUser) {
          setSelectedUserId(String(firstUser.id));
        }
      }
    }
  };

  const loadUserSettings = async (userId) => {
    const result = await window.electronAPI.getUserSettings({ userId: Number(userId) });
    if (result.success) {
      setSelectedUserSettings(result.settings || {});
    }
  };

  const handleAddKey = () => {
    if (!newKeyValue.trim()) {
      alert(t.apiKeyMissing || 'Please enter an API key');
      return;
    }

    const provider = PROVIDERS.find((item) => item.id === newKeyProvider);
    if (provider?.keyPrefix && !newKeyValue.startsWith(provider.keyPrefix)) {
      alert(t.apiKeyInvalid || 'Invalid API key format');
      return;
    }

    const nextKey = {
      id: Date.now().toString(),
      label: newKeyLabel.trim() || `${provider?.name || 'Key'} ${apiKeys.length + 1}`,
      key: newKeyValue.trim(),
      provider: newKeyProvider,
      isActive: apiKeys.filter((item) => item.provider === newKeyProvider).length === 0,
    };

    setApiKeys((prev) => [...prev, nextKey]);
    setNewKeyLabel('');
    setNewKeyValue('');
  };

  const handleDeleteKey = (id) => {
    const remaining = apiKeys.filter((item) => item.id !== id);
    const deleted = apiKeys.find((item) => item.id === id);

    if (deleted?.isActive) {
      const providerKeys = remaining.filter((item) => item.provider === deleted.provider);
      if (providerKeys.length > 0) {
        const first = providerKeys[0];
        const updated = remaining.map((item) =>
          item.id === first.id ? { ...item, isActive: true } : item
        );
        setApiKeys(updated);
        return;
      }
    }

    setApiKeys(remaining);
  };

  const handleSetActive = (id) => {
    const target = apiKeys.find((item) => item.id === id);
    if (!target) return;
    setApiKeys((prev) =>
      prev.map((item) => ({
        ...item,
        isActive: item.provider === target.provider ? item.id === id : item.isActive,
      }))
    );
  };

  const handleTestConnection = async (id) => {
    const keyObj = apiKeys.find((item) => item.id === id);
    if (!keyObj) return;
    setConnectionStatus((prev) => ({ ...prev, [id]: 'testing' }));
    const result = await window.electronAPI.testApiConnection({
      apiKey: keyObj.key,
      provider: keyObj.provider,
    });
    setConnectionStatus((prev) => ({ ...prev, [id]: result.success ? 'success' : 'failed' }));
  };

  const resetNewDestination = () => {
    setNewDestination({
      name: '',
      platform: 'wordpress',
      baseUrl: '',
      apiToken: '',
      username: '',
      appPassword: '',
      shopDomain: '',
      accessToken: '',
      blogId: '',
      apiVersion: '2024-01',
      endpointUrl: '',
      authHeaderName: '',
      authHeaderValue: '',
      extraPayloadJson: '',
    });
  };

  const handleAddDestination = () => {
    const trimmedName = newDestination.name.trim();
    if (!trimmedName) {
      alert(t.publishDestinationRequired || 'Destination name is required');
      return;
    }
    if (newDestination.platform === 'wordpress') {
      if (!newDestination.baseUrl.trim()) {
        alert(t.publishDestinationRequired || 'WordPress site URL is required');
        return;
      }
      if (newDestination.authMethod === 'token' && !newDestination.apiToken.trim()) {
        alert('API token is required. Get it from WordPress Settings → AI Blog Token.');
        return;
      }
      if (newDestination.authMethod === 'basic' && (!newDestination.username.trim() || !newDestination.appPassword.trim())) {
        alert('Username and Application Password are required for Basic Auth.');
        return;
      }
    }
    if (newDestination.platform === 'shopify') {
      if (
        !newDestination.shopDomain.trim() ||
        !newDestination.accessToken.trim() ||
        !newDestination.blogId.trim()
      ) {
        alert(t.publishDestinationRequired || 'Destination details are required');
        return;
      }
    }
    if (newDestination.platform === 'custom' || newDestination.platform === 'jtl') {
      if (!newDestination.endpointUrl.trim()) {
        alert(t.publishDestinationRequired || 'Destination details are required');
        return;
      }
    }

    setPublishDestinations((prev) => [
      ...prev,
      {
        ...newDestination,
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: trimmedName,
        platform: newDestination.platform === 'wordpress-token' ? 'wordpress' : newDestination.platform,
        baseUrl: newDestination.baseUrl.trim(),
        authMethod: newDestination.authMethod || 'token',
        apiToken: newDestination.apiToken.trim(),
        username: newDestination.username.trim(),
        appPassword: newDestination.appPassword.trim(),
        shopDomain: newDestination.shopDomain.trim(),
        accessToken: newDestination.accessToken.trim(),
        blogId: newDestination.blogId.trim(),
        apiVersion: newDestination.apiVersion.trim() || '2024-01',
        endpointUrl: newDestination.endpointUrl.trim(),
        authHeaderName: newDestination.authHeaderName.trim(),
        authHeaderValue: newDestination.authHeaderValue.trim(),
        extraPayloadJson: newDestination.extraPayloadJson.trim(),
      },
    ]);
    resetNewDestination();
  };

  const handleRemoveDestination = (id) => {
    setPublishDestinations((prev) => prev.filter((item) => item.id !== id));
  };

  const applyJtlDefaults = () => {
    setNewDestination((prev) => ({
      ...prev,
      authHeaderName: prev.authHeaderName || 'X-JTL-Token',
    }));
  };

  const handleTestDestination = async (destination) => {
    if (!destination?.id) return;
    setPublishTestStatus((prev) => ({ ...prev, [destination.id]: 'testing' }));
    const result = await window.electronAPI.testPublishDestination({ destination });
    setPublishTestStatus((prev) => ({
      ...prev,
      [destination.id]: result.success ? 'success' : 'failed',
    }));
    if (!result.success) {
      alert(result.error || t.publishTestFailed);
    }
  };

  const handleSaveSettings = async () => {
    const { payload, nextApiKeys } = buildSettingsPayload();
    const result = await window.electronAPI.saveSettings(payload);
    if (result.success) {
      setApiKeys(nextApiKeys);
      setSavedFingerprint(JSON.stringify(payload));
      onUnsavedChange?.(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      return true;
    } else {
      alert(result.error || 'Failed to save');
      return false;
    }
  };

  const handleResetPrompt = async (key) => {
    const next = { ...promptTemplates, [key]: DEFAULT_PROMPTS[key] };
    setPromptTemplates(next);
    const result = await window.electronAPI.updateSettings({ promptTemplates: next });
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      alert(result.error || 'Failed to save');
    }
  };

  const handleResetAllPrompts = async () => {
    const next = { ...DEFAULT_PROMPTS };
    setPromptTemplates(next);
    const result = await window.electronAPI.updateSettings({ promptTemplates: next });
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      alert(result.error || 'Failed to save');
    }
  };

  const handleSaveUserSettings = async () => {
    if (!selectedUserId || !selectedUserSettings) return;
    const result = await window.electronAPI.saveUserSettings({
      userId: Number(selectedUserId),
      settings: selectedUserSettings,
    });
    if (result.success) {
      setUserSaved(true);
      setTimeout(() => setUserSaved(false), 3000);
    } else {
      alert(result.error || 'Failed to save');
    }
  };

  useEffect(() => {
    const dirty = Boolean(savedFingerprint) && computeFingerprint() !== savedFingerprint;
    onUnsavedChange?.(dirty);
  }, [
    savedFingerprint,
    aiProvider,
    imageProvider,
    aiModel,
    imageModel,
    maxTokens,
    serpProvider,
    deepResearchProvider,
    deepResearchModel,
    useWikipedia,
    siteBaseUrl,
    linkPreviewApiKey,
    autoSave,
    apiKeys,
    promptTemplates,
    publishDestinations,
    tavilyKey,
    perplexityKey,
  ]);

  useEffect(() => {
    registerLeaveActions?.({
      save: handleSaveSettings,
      discard: async () => {
        await loadSettings();
        return true;
      },
    });
    return () => registerLeaveActions?.(null);
  }, [
    registerLeaveActions,
    handleSaveSettings,
  ]);

  const baseProviderOptions =
    GENERATION_PROVIDERS.find((item) => item.id === aiProvider) || GENERATION_PROVIDERS[0];
  const dynamicTextProviderOptions = providerCatalog[aiProvider] || { textModels: [], imageModels: [] };
  const textProviderOptions = {
    ...baseProviderOptions,
    models: Array.from(
      new Set([...(baseProviderOptions?.models || []), ...(dynamicTextProviderOptions.textModels || [])])
    ),
  };
  const baseImageProviderOptions =
    GENERATION_PROVIDERS.find((item) => item.id === imageProvider) || GENERATION_PROVIDERS[0];
  const dynamicImageProviderOptions = providerCatalog[imageProvider] || { textModels: [], imageModels: [] };
  const imageProviderOptions = {
    ...baseImageProviderOptions,
    imageModels: Array.from(
      new Set([...(baseImageProviderOptions?.imageModels || []), ...(dynamicImageProviderOptions.imageModels || [])])
    ),
  };

  useEffect(() => {
    if (!aiModel && textProviderOptions.models.length > 0) {
      setAiModel(textProviderOptions.models[0]);
    }
  }, [aiModel, textProviderOptions.models]);

  useEffect(() => {
    if (!imageModel && imageProviderOptions.imageModels.length > 0) {
      setImageModel(imageProviderOptions.imageModels[0]);
    }
  }, [imageModel, imageProviderOptions.imageModels]);

  const deepResearchBaseProvider =
    PROVIDERS.find((item) => item.id === deepResearchProvider) || PROVIDERS[0];
  const deepResearchDynamicProvider = providerCatalog[deepResearchProvider] || { textModels: [] };
  const deepResearchOptions = {
    ...deepResearchBaseProvider,
    models: Array.from(
      new Set([
        ...(deepResearchBaseProvider?.models || []),
        ...(deepResearchDynamicProvider.textModels || []),
      ])
    ),
  };
  const platformLabels = {
    wordpress: t.platformWordPress || 'WordPress',
    shopify: t.platformShopify || 'Shopify',
    custom: t.platformCustom || 'Custom API',
    jtl: t.platformJtl || 'JTL Shop',
  };
  const getModelFamily = (modelId) => {
    const id = String(modelId || '').toLowerCase();
    if (!id) return 'other';
    if (id.includes('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.includes('chatgpt')) return 'openai';
    if (id.includes('claude')) return 'claude';
    if (id.includes('gemini')) return 'gemini';
    if (id.includes('grok')) return 'grok';
    if (id.includes('llama')) return 'llama';
    if (id.includes('mistral') || id.includes('mixtral') || id.includes('codestral')) return 'mistral';
    if (id.includes('qwen')) return 'qwen';
    if (id.includes('deepseek')) return 'deepseek';
    if (id.includes('phi')) return 'phi';
    if (id.includes('command')) return 'cohere';
    if (id.includes('dall-e') || id.includes('imagen') || id.includes('image')) return 'image';
    return 'other';
  };
  const textModelFamilies = Array.from(
    new Set((textProviderOptions.models || []).map((modelId) => getModelFamily(modelId)))
  ).sort((a, b) => a.localeCompare(b));
  const filteredTextModels = (textProviderOptions.models || []).filter((modelId) => {
    const search = modelSearch.trim().toLowerCase();
    const familyOk = modelFamilyFilter === 'all' || getModelFamily(modelId) === modelFamilyFilter;
    const searchOk = !search || modelId.toLowerCase().includes(search);
    return familyOk && searchOk;
  });
  const filteredImageModels = (imageProviderOptions.imageModels || []).filter((modelId) => {
    const search = imageModelSearch.trim().toLowerCase();
    return !search || modelId.toLowerCase().includes(search);
  });
  const formatDestinationSummary = (destination) => {
    if (!destination) return '';
    if (destination.platform === 'wordpress' || destination.platform === 'wordpress-token') {
      const authLabel = destination.authMethod === 'basic' ? 'Basic Auth' : 'Token';
      return destination.baseUrl ? `${destination.baseUrl} (${authLabel})` : '';
    }
    if (destination.platform === 'shopify') {
      return destination.shopDomain ? `${destination.shopDomain} (blog ${destination.blogId})` : '';
    }
    return destination.endpointUrl || destination.baseUrl || '';
  };

  const tabs = [
    { id: 'ai', label: t.settingsTabAi || 'AI' },
    { id: 'research', label: t.settingsTabResearch || 'Research' },
    { id: 'keys', label: t.settingsTabKeys || 'API Keys' },
    { id: 'publishing', label: t.settingsTabPublishing || 'Publishing' },
    { id: 'prompts', label: t.settingsTabPrompts || 'Prompts' },
    { id: 'usage', label: t.settingsTabUsage || 'Usage' },
  ];
  if (isAdmin) {
    tabs.push({ id: 'admin', label: t.settingsTabAdmin || 'Admin' });
  }

  return (
    <div className="settings-page max-w-5xl mx-auto p-8">
      <h2 className="text-3xl font-bold text-slate-900 mb-2 dark:text-slate-100">{t.settingsTitle}</h2>
      <p className="text-slate-600 mb-8 dark:text-slate-300">{t.settingsSubtitle}</p>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-full border transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-blue-300 hover:text-slate-900 dark:bg-slate-900 dark:text-slate-200 dark:border-slate-700 dark:hover:border-blue-500 dark:hover:text-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleSaveSettings}
          className={`save-settings-btn flex h-11 items-center justify-center space-x-2 px-5 py-2 rounded-lg font-semibold transition ${
            saved ? 'bg-blue-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500'
          }`}
        >
          <Save className="w-4 h-4" />
          <span>{saved ? t.saved : t.saveSettings}</span>
        </button>
      </div>

      <div className="space-y-6">
        {activeTab === 'ai' && (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">{t.apiConfiguration}</h3>
              <button
                type="button"
                onClick={() => refreshProviderModels(aiProvider)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-200 hover:text-blue-700"
              >
                <RefreshCw className="h-3 w-3" />
                <span>
                  {providerCatalogStatus[aiProvider] === 'loading'
                    ? (t.testingLabel || 'Loading...')
                    : 'Refresh models'}
                </span>
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t.providerLabel || 'AI provider'}
                </label>
                <select
                  value={aiProvider}
                  onChange={(event) => {
                    const next = event.target.value;
                    setAiProvider(next);
                    setModelSearch('');
                    setModelFamilyFilter('all');
                    const provider = GENERATION_PROVIDERS.find((item) => item.id === next);
                    const dynamic = providerCatalog[next] || { textModels: [] };
                    const mergedTextModels = Array.from(
                      new Set([...(provider?.models || []), ...(dynamic.textModels || [])])
                    );
                    if (mergedTextModels.length > 0) {
                      setAiModel(mergedTextModels[0]);
                    }
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  {GENERATION_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t.modelLabel}</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setModelDropdownOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <span className="truncate">{aiModel || 'Select model'}</span>
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </button>
                  {modelDropdownOpen && (
                    <div className="absolute z-20 mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      <input
                        type="text"
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                        className="mb-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        placeholder="Search model..."
                      />
                      <select
                        value={modelFamilyFilter}
                        onChange={(event) => setModelFamilyFilter(event.target.value)}
                        className="mb-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="all">All families</option>
                        {textModelFamilies.map((family) => (
                          <option key={family} value={family}>
                            {family}
                          </option>
                        ))}
                      </select>
                      <div className="max-h-56 overflow-y-auto rounded-md border border-slate-100 dark:border-slate-800">
                        {filteredTextModels.map((model) => (
                          <button
                            key={model}
                            type="button"
                            onClick={() => {
                              setAiModel(model);
                              setModelDropdownOpen(false);
                            }}
                            className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 ${
                              aiModel === model ? 'bg-blue-50 text-blue-700 dark:bg-slate-800 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {model}
                          </button>
                        ))}
                        {filteredTextModels.length === 0 && (
                          <p className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">No models found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t.imageProviderLabel || 'Image provider'}</label>
                <select
                  value={imageProvider}
                  onChange={(event) => {
                    const next = event.target.value;
                    setImageProvider(next);
                    setImageModelSearch('');
                    setImageModel('');
                    setImageModelDropdownOpen(false);
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {GENERATION_PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t.imageModelLabel}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setImageModelDropdownOpen((prev) => !prev)}
                    disabled={imageProviderOptions.imageModels.length === 0}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  >
                    <span className="truncate">
                      {imageProviderOptions.imageModels.length === 0
                        ? t.noImageSupport || 'No image models available'
                        : imageModel || 'Select image model'}
                    </span>
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </button>
                  {imageModelDropdownOpen && imageProviderOptions.imageModels.length > 0 && (
                    <div className="absolute z-20 mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                      <input
                        type="text"
                        value={imageModelSearch}
                        onChange={(event) => setImageModelSearch(event.target.value)}
                        className="mb-2 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        placeholder="Search image model..."
                      />
                      <div className="max-h-56 overflow-y-auto rounded-md border border-slate-100 dark:border-slate-800">
                        {filteredImageModels.map((model) => (
                          <button
                            key={model}
                            type="button"
                            onClick={() => {
                              setImageModel(model);
                              setImageModelDropdownOpen(false);
                            }}
                            className={`block w-full px-2 py-1.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-slate-800 ${
                              imageModel === model ? 'bg-blue-50 text-blue-700 dark:bg-slate-800 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {model}
                          </button>
                        ))}
                        {filteredImageModels.length === 0 && (
                          <p className="px-2 py-2 text-xs text-slate-500 dark:text-slate-400">No models found</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t.maxTokensLabel || 'Max tokens'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(event.target.value.replace(/[^\d]/g, ''))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  placeholder="Leave empty for provider default"
                />
              </div>
            </div>

            <p className="text-xs text-slate-500">
              {`Loaded models: ${textProviderOptions.models.length} text, ${imageProviderOptions.imageModels.length} image`}
            </p>
            {providerCatalogStatus[aiProvider] === 'error' && providerCatalogError[aiProvider] ? (
              <p className="text-xs text-red-600 break-all">{providerCatalogError[aiProvider]}</p>
            ) : null}
            {providerCatalogStatus[imageProvider] === 'error' && providerCatalogError[imageProvider] ? (
              <p className="text-xs text-red-600 break-all">{providerCatalogError[imageProvider]}</p>
            ) : null}

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(event) => setAutoSave(event.target.checked)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <span className="text-sm text-slate-700">{t.autoSaveLabel}</span>
            </div>
          </div>
        )}

        {activeTab === 'research' && (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{t.researchSettingsTitle}</h3>
              <p className="text-sm text-slate-600">{t.researchSettingsSubtitle}</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t.siteBaseUrlLabel}
              </label>
              <input
                type="url"
                value={siteBaseUrl}
                onChange={(event) => setSiteBaseUrl(event.target.value)}
                placeholder="https://your-site.com"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                {t.linkPreviewApiKeyLabel || 'LinkPreview API Key'}
              </label>
              <input
                type="password"
                value={linkPreviewApiKey}
                onChange={(event) => setLinkPreviewApiKey(event.target.value)}
                placeholder="Your API key"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Endpoint is fixed to https://api.linkpreview.net</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t.serpProviderLabel}
                </label>
                <select
                  value={serpProvider}
                  onChange={(event) => setSerpProvider(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {SERP_PROVIDERS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-7 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={useWikipedia}
                  onChange={(event) => setUseWikipedia(event.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span>{t.useWikipediaLabel}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t.tavilyKeyLabel}
                </label>
                <input
                  type="password"
                  value={tavilyKey}
                  onChange={(event) => setTavilyKey(event.target.value)}
                  placeholder="tvly-..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t.perplexityKeyLabel}
                </label>
                <input
                  type="password"
                  value={perplexityKey}
                  onChange={(event) => setPerplexityKey(event.target.value)}
                  placeholder="pplx-..."
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  {t.deepResearchProviderLabel}
                </label>
                <select
                  value={deepResearchProvider}
                  onChange={(event) => {
                    const next = event.target.value;
                    setDeepResearchProvider(next);
                    const provider = PROVIDERS.find((item) => item.id === next);
                    if (!deepResearchModel && provider?.models?.length) {
                      setDeepResearchModel(provider.models[0]);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  {DEEP_RESEARCH_PROVIDERS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </div>

              {deepResearchProvider !== 'none' && deepResearchOptions?.models?.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t.deepResearchModelLabel}
                  </label>
                  <input
                    list={`deep-research-model-options-${deepResearchProvider}`}
                    value={deepResearchModel}
                    onChange={(event) => setDeepResearchModel(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="Enter model id (or pick from list)"
                  />
                  <datalist id={`deep-research-model-options-${deepResearchProvider}`}>
                    {deepResearchOptions.models.map((model) => (
                      <option key={model} value={model} />
                    ))}
                  </datalist>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'publishing' && (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-6">
            <div>
              <h3 className="text-xl font-semibold text-slate-900">{t.publishingTitle}</h3>
              <p className="text-sm text-slate-600">{t.publishingSubtitle}</p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{t.jtlSectionTitle}</p>
              <p className="mt-1">{t.jtlSectionBody}</p>
              <p className="mt-2 text-xs text-slate-600">{t.jtlSectionHint}</p>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{t.jtlPluginSetupTitle}</p>
                <p className="mt-1">{t.jtlPluginSetupBody}</p>
                <p className="mt-2 text-xs text-slate-600">{t.jtlPluginSetupHint}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
                <p className="font-semibold text-slate-900">{t.jtlPhpSetupTitle}</p>
                <p className="mt-1">{t.jtlPhpSetupBody}</p>
                <p className="mt-2 text-xs text-slate-600">{t.jtlPhpSetupHint}</p>
              </div>
            </div>

            <div className="space-y-3">
              {publishDestinations.length === 0 && (
                <p className="text-sm text-slate-500">{t.destinationsEmpty}</p>
              )}
              {publishDestinations.map((destination) => (
                <div
                  key={destination.id}
                  className="flex items-start justify-between rounded-lg border border-slate-200 p-4"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{destination.name}</p>
                    <p className="text-xs text-slate-500">
                      {platformLabels[destination.platform] || destination.platform} •{' '}
                      {formatDestinationSummary(destination)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleTestDestination(destination)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-200 hover:text-blue-700"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>{t.testDestinationLabel}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDestination(destination.id)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-red-200 hover:text-red-600"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>{t.removeLabel || 'Remove'}</span>
                      </button>
                    </div>
                    {publishTestStatus[destination.id] && (
                      <span
                        className={`text-[11px] font-semibold uppercase ${
                          publishTestStatus[destination.id] === 'success'
                            ? 'text-emerald-600'
                            : publishTestStatus[destination.id] === 'failed'
                            ? 'text-red-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {publishTestStatus[destination.id] === 'success'
                          ? t.testSuccessLabel
                          : publishTestStatus[destination.id] === 'failed'
                          ? t.publishTestFailed
                          : t.testingLabel}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-6 space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                {t.addDestination}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t.destinationNameLabel}
                  </label>
                  <input
                    type="text"
                    value={newDestination.name}
                    onChange={(event) =>
                      setNewDestination((prev) => ({ ...prev, name: event.target.value }))
                    }
                    placeholder={t.destinationNamePlaceholder}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    {t.platformLabel}
                  </label>
                  <select
                    value={newDestination.platform}
                    onChange={(event) =>
                      setNewDestination((prev) => ({ ...prev, platform: event.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="wordpress">{platformLabels.wordpress}</option>
                    <option value="shopify">{platformLabels.shopify}</option>
                    <option value="custom">{platformLabels.custom}</option>
                    <option value="jtl">{platformLabels.jtl}</option>
                  </select>
                </div>
              </div>

              {(newDestination.platform === 'wordpress' || newDestination.platform === 'wordpress-token') && (
                <div className="space-y-4">
                  {/* Requires plugin notice */}
                  <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                    <p className="text-xs font-medium text-blue-800">
                      Requires AI Blog Token Plugin (v3.0) installed on WordPress
                    </p>
                    <p className="text-xs text-blue-600 mt-1">
                      Install the plugin from wp-token-endpoint folder, then choose your auth method below.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Site URL */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        {t.wordpressSiteUrlLabel || 'WordPress Site URL'}
                      </label>
                      <input
                        type="url"
                        value={newDestination.baseUrl}
                        onChange={(event) =>
                          setNewDestination((prev) => ({ ...prev, baseUrl: event.target.value }))
                        }
                        placeholder="https://your-wordpress-site.com"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      />
                    </div>

                    {/* Auth Method Toggle */}
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Authentication Method
                      </label>
                      <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setNewDestination((prev) => ({ ...prev, authMethod: 'token' }))}
                          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                            newDestination.authMethod === 'token'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          API Token (Recommended)
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewDestination((prev) => ({ ...prev, authMethod: 'basic' }))}
                          className={`flex-1 px-4 py-2.5 text-sm font-medium transition ${
                            newDestination.authMethod === 'basic'
                              ? 'bg-blue-600 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Basic Auth (Username + Password)
                        </button>
                      </div>
                    </div>

                    {/* Token auth fields */}
                    {newDestination.authMethod === 'token' && (
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                          {t.wordpressTokenLabel || 'API Token'}
                        </label>
                        <input
                          type="password"
                          value={newDestination.apiToken}
                          onChange={(event) =>
                            setNewDestination((prev) => ({ ...prev, apiToken: event.target.value }))
                          }
                          placeholder="Paste token from WordPress → Settings → AI Blog Token"
                          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Go to your WordPress admin → Settings → AI Blog Token → Copy the token
                        </p>
                      </div>
                    )}

                    {/* Basic auth fields */}
                    {newDestination.authMethod === 'basic' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            {t.wordpressUsernameLabel || 'WordPress Username'}
                          </label>
                          <input
                            type="text"
                            value={newDestination.username}
                            onChange={(event) =>
                              setNewDestination((prev) => ({ ...prev, username: event.target.value }))
                            }
                            placeholder="admin"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-700 mb-2">
                            {t.wordpressAppPasswordLabel || 'Application Password'}
                          </label>
                          <input
                            type="password"
                            value={newDestination.appPassword}
                            onChange={(event) =>
                              setNewDestination((prev) => ({
                                ...prev,
                                appPassword: event.target.value,
                              }))
                            }
                            placeholder="xxxx xxxx xxxx xxxx xxxx xxxx"
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                          />
                          <p className="mt-1 text-xs text-slate-500">
                            Generate at WordPress → Users → Profile → Application Passwords
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {newDestination.platform === 'shopify' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t.shopifyShopDomainLabel}
                    </label>
                    <input
                      type="text"
                      value={newDestination.shopDomain}
                      onChange={(event) =>
                        setNewDestination((prev) => ({ ...prev, shopDomain: event.target.value }))
                      }
                      placeholder="your-shop.myshopify.com"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    <div className="mt-2 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleShopifyOAuth}
                        className="text-xs text-blue-600 hover:text-blue-700"
                        disabled={shopifyOAuthLoading}
                      >
                        {shopifyOAuthLoading ? 'Connecting...' : 'Connect Shopify (OAuth)'}
                      </button>
                      {shopifyOAuthError && (
                        <span className="text-xs text-rose-600">{shopifyOAuthError}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t.shopifyAccessTokenLabel}
                    </label>
                    <input
                      type="password"
                      value={newDestination.accessToken}
                      onChange={(event) =>
                        setNewDestination((prev) => ({ ...prev, accessToken: event.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        {t.shopifyBlogIdLabel}
                      </label>
                      <button
                        type="button"
                        onClick={fetchShopifyBlogs}
                        className="text-xs text-blue-600 hover:text-blue-700"
                        disabled={shopifyBlogsLoading}
                      >
                        {shopifyBlogsLoading ? 'Loading...' : 'Fetch blogs'}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={newDestination.blogId}
                      onChange={(event) =>
                        setNewDestination((prev) => ({ ...prev, blogId: event.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                    {shopifyBlogsError && (
                      <p className="mt-1 text-xs text-rose-600">{shopifyBlogsError}</p>
                    )}
                    {shopifyBlogs.length > 0 && (
                      <select
                        value={newDestination.blogId}
                        onChange={(event) =>
                          setNewDestination((prev) => ({ ...prev, blogId: event.target.value }))
                        }
                        className="mt-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="">Select a blog</option>
                        {shopifyBlogs.map((blog) => (
                          <option key={blog.id} value={String(blog.id)}>
                            {blog.title || blog.handle || blog.id}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t.shopifyApiVersionLabel}
                    </label>
                    <input
                      type="text"
                      value={newDestination.apiVersion}
                      onChange={(event) =>
                        setNewDestination((prev) => ({ ...prev, apiVersion: event.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              {(newDestination.platform === 'custom' || newDestination.platform === 'jtl') && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t.customEndpointUrlLabel}
                    </label>
                    <input
                      type="url"
                      value={newDestination.endpointUrl}
                      onChange={(event) =>
                        setNewDestination((prev) => ({ ...prev, endpointUrl: event.target.value }))
                      }
                      placeholder="https://api.example.com/posts"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t.authHeaderNameLabel}
                    </label>
                    <input
                      type="text"
                      value={newDestination.authHeaderName}
                      onChange={(event) =>
                        setNewDestination((prev) => ({
                          ...prev,
                          authHeaderName: event.target.value,
                        }))
                      }
                      placeholder={
                        newDestination.platform === 'jtl' ? 'X-JTL-Token' : 'Authorization'
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t.authHeaderValueLabel}
                    </label>
                    <input
                      type="password"
                      value={newDestination.authHeaderValue}
                      onChange={(event) =>
                        setNewDestination((prev) => ({
                          ...prev,
                          authHeaderValue: event.target.value,
                        }))
                      }
                      placeholder={
                        newDestination.platform === 'jtl' ? t.jtlTokenPlaceholder : 'Bearer ...'
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    />
                  </div>
                  {newDestination.platform === 'jtl' && (
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={applyJtlDefaults}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-slate-300"
                      >
                        <span>{t.jtlApplyDefaults}</span>
                      </button>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      {t.extraPayloadLabel}
                    </label>
                    <textarea
                      rows={3}
                      value={newDestination.extraPayloadJson}
                      onChange={(event) =>
                        setNewDestination((prev) => ({
                          ...prev,
                          extraPayloadJson: event.target.value,
                        }))
                      }
                      placeholder={t.extraPayloadPlaceholder}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAddDestination}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t.addDestination}</span>
                </button>
                <button
                  type="button"
                  onClick={resetNewDestination}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:border-slate-300"
                >
                  <span>{t.resetLabel || 'Reset'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'keys' && (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">{t.apiKeysTitle}</h3>
            </div>

            <div className="grid gap-4">
              {apiKeys.length === 0 && (
                <p className="text-sm text-slate-500">{t.noApiKeys}</p>
              )}
              {apiKeys.map((item) => (
                <div key={item.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{item.label}</p>
                      <p className="text-xs text-slate-500">{item.provider}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetActive(item.id)}
                        className={`px-2 py-1 text-xs rounded ${
                          item.isActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {item.isActive ? t.activeLabel : t.setActiveLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTestConnection(item.id)}
                        className="px-2 py-1 text-xs rounded bg-slate-100 text-slate-600"
                      >
                        {connectionStatus[item.id] === 'testing'
                          ? t.testingLabel
                          : connectionStatus[item.id] === 'success'
                          ? t.testSuccessLabel
                          : connectionStatus[item.id] === 'failed'
                          ? t.testFailedLabel
                          : t.testLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteKey(item.id)}
                        className="px-2 py-1 text-xs rounded bg-red-100 text-red-700"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type={showKeyId === item.id ? 'text' : 'password'}
                      value={item.key}
                      readOnly
                      className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeyId(showKeyId === item.id ? null : item.id)}
                      className="px-2 py-2 rounded bg-slate-100 text-slate-500"
                    >
                      {showKeyId === item.id ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200 pt-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={newKeyLabel}
                  onChange={(event) => setNewKeyLabel(event.target.value)}
                  placeholder={t.keyLabelPlaceholder}
                  className="px-3 py-2 border border-slate-200 rounded-lg"
                />
                <select
                  value={newKeyProvider}
                  onChange={(event) => setNewKeyProvider(event.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-lg"
                >
                  {PROVIDERS.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.name}
                    </option>
                  ))}
                </select>
                <input
                  type="password"
                  value={newKeyValue}
                  onChange={(event) => setNewKeyValue(event.target.value)}
                  placeholder={t.apiKeyPlaceholder}
                  className="px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
              <button
                type="button"
                onClick={handleAddKey}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white"
              >
                <Plus className="w-4 h-4" />
                {t.addApiKeyLabel}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'prompts' && (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">{t.promptTemplatesTitle}</h3>
              <button
                type="button"
                onClick={handleResetAllPrompts}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                {t.resetAllPromptsLabel}
              </button>
            </div>
            {Object.entries(promptTemplates).map(([key, value]) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-700">{key}</label>
                  <button
                    type="button"
                    onClick={() => handleResetPrompt(key)}
                    className="text-xs text-slate-500 hover:text-slate-800"
                  >
                    {t.resetPromptLabel}
                  </button>
                </div>
                <textarea
                  value={value}
                  onChange={(event) =>
                    setPromptTemplates((prev) => ({ ...prev, [key]: event.target.value }))
                  }
                  rows={5}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                />
              </div>
            ))}
          </div>
        )}

        {activeTab === 'usage' && (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-4">
            <h3 className="text-xl font-semibold text-slate-900">{t.usageTitle}</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{t.usageBlogs}</p>
                <p className="text-lg font-semibold text-slate-800">{usage.blogsGenerated || 0}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{t.usageTokens}</p>
                <p className="text-lg font-semibold text-slate-800">{usage.totalTokens || 0}</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{t.usageCost}</p>
                <p className="text-lg font-semibold text-slate-800">
                  ${(usage.totalCost || 0).toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'admin' && isAdmin && (
          <div className="bg-white rounded-xl shadow-sm p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-semibold text-slate-900">{t.adminUserSettingsTitle}</h3>
              <button
                type="button"
                onClick={handleSaveUserSettings}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
                  userSaved ? 'bg-blue-500 text-white' : 'bg-slate-900 text-white'
                }`}
              >
                <CheckCircle className="w-4 h-4" />
                {userSaved ? t.saved : t.saveUserSettings}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">{t.selectUserLabel}</label>
                <select
                  value={selectedUserId}
                  onChange={(event) => setSelectedUserId(event.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username} ({user.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">{t.userSettingsLabel}</label>
                <textarea
                  value={JSON.stringify(selectedUserSettings || {}, null, 2)}
                  onChange={(event) => {
                    try {
                      const parsed = JSON.parse(event.target.value);
                      setSelectedUserSettings(parsed);
                    } catch (error) {
                      setSelectedUserSettings(selectedUserSettings || {});
                    }
                  }}
                  rows={6}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono text-xs"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => loadUserSettings(selectedUserId)}
              className="inline-flex items-center gap-2 text-sm text-slate-600"
            >
              <RefreshCw className="w-4 h-4" />
              {t.reloadUserSettingsLabel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
