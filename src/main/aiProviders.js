const DEFAULT_TIMEOUT_MS = 180000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 800;

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    supportsImages: true,
  },
  google: {
    name: 'Google AI',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    supportsImages: true,
  },
  openrouter: {
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    supportsImages: true,
  },
  anthropic: {
    name: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    supportsImages: false,
  },
  groq: {
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    supportsImages: false,
  },
  xai: {
    name: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    supportsImages: false,
  },
  huggingface: {
    name: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    supportsImages: false,
  },
  mistral: {
    name: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    supportsImages: false,
  },
  together: {
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    supportsImages: false,
  },
  fireworks: {
    name: 'Fireworks',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    supportsImages: false,
  },
  perplexity: {
    name: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    supportsImages: false,
  },
  tavily: {
    name: 'Tavily',
    baseUrl: 'https://api.tavily.com',
    supportsImages: false,
  },
};

const PRICING = {
  openai: {
    'gpt-4o': { input: 0.005, output: 0.015 },
    'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
    'gpt-4-turbo': { input: 0.01, output: 0.03 },
    'gpt-4.1': { input: 0.005, output: 0.015 },
    'gpt-4.1-mini': { input: 0.0004, output: 0.0016 },
    'gpt-4.1-nano': { input: 0.0001, output: 0.0004 },
    'o3': { input: 0.01, output: 0.04 },
    'o3-mini': { input: 0.0011, output: 0.0044 },
    'o1': { input: 0.015, output: 0.06 },
    'o1-mini': { input: 0.003, output: 0.012 },
    default: { input: 0.00015, output: 0.0006 },
  },
  google: {
    'gemini-2.0-flash': { input: 0.0002, output: 0.0008 },
    'gemini-2.0-flash-lite': { input: 0.0001, output: 0.0004 },
    'gemini-2.5-pro': { input: 0.0035, output: 0.0105 },
    'gemini-2.5-flash': { input: 0.00035, output: 0.00053 },
    'gemini-1.5-pro': { input: 0.0035, output: 0.0105 },
    'gemini-1.5-flash': { input: 0.00035, output: 0.00053 },
    default: { input: 0.00035, output: 0.00053 },
  },
  openrouter: {
    default: { input: 0.005, output: 0.015 },
  },
  anthropic: {
    default: { input: 0.003, output: 0.015 },
  },
  groq: {
    default: { input: 0.0002, output: 0.0002 },
  },
  xai: {
    default: { input: 0.005, output: 0.015 },
  },
  huggingface: {
    default: { input: 0.0006, output: 0.0006 },
  },
  mistral: {
    default: { input: 0.0006, output: 0.0018 },
  },
  together: {
    default: { input: 0.0006, output: 0.0006 },
  },
  fireworks: {
    default: { input: 0.0009, output: 0.0009 },
  },
  perplexity: {
    default: { input: 0.001, output: 0.001 },
  },
  image: {
    'gpt-image-1': { perImage: 0.04 },
    'dall-e-3': { perImage: 0.04 },
    'imagen-3.0-generate-002': { perImage: 0.04 },
    'openai/gpt-image-1': { perImage: 0.04 },
    'google/imagen-3.0-generate-002': { perImage: 0.04 },
  },
};

const IMAGE_DEFAULT_MODEL = {
  openai: 'gpt-image-1',
  google: 'imagen-3.0-generate-002',
  openrouter: 'openai/gpt-image-1',
};

function resolveModelPricing(providerPricing = {}, model = '') {
  if (providerPricing[model]) {
    return providerPricing[model];
  }

  const normalizedModel = String(model || '')
    .trim()
    .toLowerCase()
    .replace(/^models\//, '');
  if (!normalizedModel) {
    return providerPricing.default || { input: 0, output: 0 };
  }

  const matchedKey = Object.keys(providerPricing).find((key) => {
    if (key === 'default') return false;
    const normalizedKey = String(key).trim().toLowerCase().replace(/^models\//, '');
    return (
      normalizedKey === normalizedModel ||
      normalizedModel.startsWith(normalizedKey) ||
      normalizedKey.startsWith(normalizedModel)
    );
  });

  if (matchedKey) {
    return providerPricing[matchedKey];
  }

  return providerPricing.default || { input: 0, output: 0 };
}

function getProvider(providerId) {
  return PROVIDERS[providerId] || null;
}

function estimateCost({ provider, model, usage, images = 0 }) {
  const providerPricing = PRICING[provider] || {};
  const modelPricing = resolveModelPricing(providerPricing, model);
  const imagePricing = images ? PRICING.image[model] || PRICING.image['gpt-image-1'] || PRICING.image['dall-e-3'] : null;

  const inputTokens = usage?.promptTokens || 0;
  const outputTokens = usage?.completionTokens || 0;
  const inputCost = (inputTokens / 1000) * modelPricing.input;
  const outputCost = (outputTokens / 1000) * modelPricing.output;
  const imageCost = imagePricing ? images * imagePricing.perImage : 0;
  return inputCost + outputCost + imageCost;
}

function flattenMessages(messages) {
  return messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n');
}

function parseJsonContent(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerError) {
        return null;
      }
    }
    return null;
  }
}

function normalizeGoogleModelId(modelId) {
  return String(modelId || '')
    .replace(/^models\//, '')
    .trim();
}

function isLikelyImageModel(modelId) {
  const id = String(modelId || '').toLowerCase();
  if (!id) return false;
  return (
    id.includes('image') ||
    id.includes('dall-e') ||
    id.includes('imagen') ||
    id.includes('flux') ||
    id.includes('stable-diffusion') ||
    id.includes('sdxl')
  );
}

function extractOutputModalities(item) {
  const outputModalities = Array.isArray(item?.architecture?.output_modalities)
    ? item.architecture.output_modalities
    : [];
  const normalized = outputModalities
    .map((value) => String(value || '').toLowerCase().trim())
    .filter(Boolean);
  if (normalized.length > 0) {
    return normalized;
  }

  const modality = String(item?.architecture?.modality || '').toLowerCase();
  const [, outputPartRaw = ''] = modality.split('->');
  const outputPart = outputPartRaw.trim();
  if (!outputPart) return [];
  return outputPart
    .split('+')
    .map((value) => value.trim())
    .filter(Boolean);
}

function isOpenRouterNonGenerativeModel(item, id) {
  const architecture = String(item?.architecture?.modality || '').toLowerCase();
  const lowered = String(id || '').toLowerCase();
  return (
    architecture.includes('embedding') ||
    architecture.includes('vector') ||
    architecture.includes('rerank') ||
    architecture.includes('moderation') ||
    lowered.includes('embedding') ||
    lowered.includes('rerank') ||
    lowered.includes('moderation')
  );
}

function classifyModelId(modelId) {
  return isLikelyImageModel(modelId) ? 'image' : 'text';
}

function pickImageQuality(modelId) {
  // Keep a single default quality across providers/models.
  // Provider-specific mismatches are handled by runtime fallback.
  return 'high';
}

function uniqueSorted(values = []) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    String(a).localeCompare(String(b))
  );
}

function isOpenAiTextModel(id) {
  const modelId = String(id || '').toLowerCase();
  if (!modelId) return false;
  // Include mainstream chat/reasoning families.
  return (
    modelId.startsWith('gpt-') ||
    modelId.startsWith('o1') ||
    modelId.startsWith('o3') ||
    modelId.startsWith('chatgpt')
  );
}

function isOpenAiImageModel(id) {
  const modelId = String(id || '').toLowerCase();
  return modelId.includes('image') || modelId.includes('dall-e');
}

function isOpenRouterTextModel(item, id) {
  if (isOpenRouterNonGenerativeModel(item, id)) return false;
  const outputModalities = extractOutputModalities(item);
  if (outputModalities.length > 0) {
    return outputModalities.includes('text');
  }
  // Fallback for incomplete metadata.
  return !isLikelyImageModel(id);
}

function isOpenRouterImageModel(item, id) {
  if (isOpenRouterNonGenerativeModel(item, id)) return false;
  const outputModalities = extractOutputModalities(item);
  if (outputModalities.length > 0) {
    return outputModalities.includes('image');
  }
  return isLikelyImageModel(id);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isRetryableNetworkError(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.name === 'AbortError' ||
    message.includes('request timed out') ||
    message.includes('network') ||
    message.includes('fetch failed') ||
    message.includes('econnreset') ||
    message.includes('etimedout')
  );
}

async function requestJson(url, options, meta = {}) {
  const maxRetries =
    Number.isFinite(meta?.maxRetries) && meta.maxRetries >= 0
      ? Math.floor(meta.maxRetries)
      : DEFAULT_MAX_RETRIES;

  let lastError = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      const raw = await response.text();
      let json = {};
      if (raw) {
        try {
          json = JSON.parse(raw);
        } catch {
          json = {};
        }
      }

      if (!response.ok) {
        const message = json?.error?.message || json?.message || `Provider request failed (${response.status})`;
        const error = new Error(message);
        error.status = response.status;
        if (attempt < maxRetries && isRetryableStatus(response.status)) {
          const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
          await sleep(delay);
          continue;
        }
        throw error;
      }
      return json;
    } catch (error) {
      const normalizedError = error?.name === 'AbortError' ? new Error('Request timed out') : error;
      lastError = normalizedError;
      if (attempt < maxRetries && isRetryableNetworkError(normalizedError)) {
        const delay = RETRY_BASE_DELAY_MS * (attempt + 1);
        await sleep(delay);
        continue;
      }
      throw normalizedError;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error('Provider request failed');
}

async function chatCompletion({ provider, apiKey, model, messages, temperature = 0.7, maxTokens = null }) {
  if (!apiKey) {
    throw new Error('Missing API key');
  }
  const providerInfo = getProvider(provider);
  if (!providerInfo) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (provider === 'google') {
    const normalizedModel = normalizeGoogleModelId(model);
    const url = `${providerInfo.baseUrl}/models/${normalizedModel}:generateContent?key=${apiKey}`;
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: flattenMessages(messages) }],
        },
      ],
      generationConfig: {
        temperature,
      },
    };
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
      body.generationConfig.maxOutputTokens = Math.floor(maxTokens);
    }
    const json = await requestJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = json.candidates?.[0]?.content?.parts?.map((part) => part.text).join('') || '';
    return {
      text,
      usage: {
        promptTokens: 0,
        completionTokens: 0,
      },
    };
  }

  if (provider === 'anthropic') {
    const selectedModel = String(model || 'claude-3-5-sonnet-latest').trim();
    const url = `${providerInfo.baseUrl}/messages`;
    const systemMessages = messages
      .filter((msg) => msg.role === 'system')
      .map((msg) => String(msg.content || '').trim())
      .filter(Boolean);
    const chatMessages = messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: String(msg.content || ''),
      }));
    if (chatMessages.length === 0) {
      chatMessages.push({ role: 'user', content: '' });
    }
    const body = {
      model: selectedModel,
      messages: chatMessages,
      temperature,
      max_tokens: Number.isFinite(maxTokens) && maxTokens > 0 ? Math.floor(maxTokens) : 4096,
    };
    if (systemMessages.length > 0) {
      body.system = systemMessages.join('\n\n');
    }
    const json = await requestJson(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const text = Array.isArray(json?.content)
      ? json.content
          .filter((part) => part?.type === 'text')
          .map((part) => String(part?.text || ''))
          .join('')
      : '';
    return {
      text,
      usage: {
        promptTokens: json?.usage?.input_tokens || 0,
        completionTokens: json?.usage?.output_tokens || 0,
      },
    };
  }

  const url = `${providerInfo.baseUrl}/chat/completions`;
  const body = {
    model,
    messages,
    temperature,
  };
  if (Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_tokens = Math.floor(maxTokens);
  }
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://localhost';
    headers['X-Title'] = 'AI Blog Generator';
  }

  const json = await requestJson(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const text = json.choices?.[0]?.message?.content || '';
  return {
    text,
    usage: {
      promptTokens: json.usage?.prompt_tokens || 0,
      completionTokens: json.usage?.completion_tokens || 0,
    },
  };
}

async function generateImage({ provider, apiKey, model, prompt }) {
  if (!apiKey) {
    throw new Error('Missing API key');
  }
  const providerInfo = getProvider(provider);
  if (!providerInfo) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  if (!providerInfo.supportsImages) {
    return { imageUrl: null, cost: 0 };
  }

  if (provider === 'google') {
    const selectedModel = model || IMAGE_DEFAULT_MODEL.google;
    const normalizedModel = selectedModel.replace(/^models\//, '');
    const predictUrl = `${providerInfo.baseUrl}/models/${normalizedModel}:predict?key=${apiKey}`;

    // Prefer Imagen endpoint when available.
    try {
      const predictJson = await requestJson(predictUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt }],
          parameters: { sampleCount: 1, aspectRatio: '16:9' },
        }),
      });
      const prediction = predictJson?.predictions?.[0] || {};
      const b64 = prediction.bytesBase64Encoded || prediction.b64Json || null;
      const imageUrl = prediction.url || (b64 ? `data:image/png;base64,${b64}` : null);
      if (imageUrl) {
        const pricing = PRICING.image[selectedModel] || PRICING.image[IMAGE_DEFAULT_MODEL.google] || { perImage: 0 };
        return { imageUrl, cost: pricing.perImage };
      }
    } catch (error) {
      // Fall through to Gemini image-generation style request.
    }

    const generateUrl = `${providerInfo.baseUrl}/models/${normalizedModel}:generateContent?key=${apiKey}`;
    const generateJson = await requestJson(generateUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    const parts = generateJson?.candidates?.[0]?.content?.parts || [];
    const inlineData = parts.find((part) => part?.inlineData?.data);
    const b64 = inlineData?.inlineData?.data || null;
    const mimeType = inlineData?.inlineData?.mimeType || 'image/png';
    const imageUrl = b64 ? `data:${mimeType};base64,${b64}` : null;
    if (!imageUrl) {
      throw new Error('Google image generation returned no image');
    }
    const pricing = PRICING.image[selectedModel] || PRICING.image[IMAGE_DEFAULT_MODEL.google] || { perImage: 0 };
    return { imageUrl, cost: pricing.perImage };
  }

  const selectedModel = model || IMAGE_DEFAULT_MODEL[provider] || IMAGE_DEFAULT_MODEL.openai;
  const url = `${providerInfo.baseUrl}/images/generations`;
  const body = {
    model: selectedModel,
    prompt,
    n: 1,
    quality: pickImageQuality(selectedModel),
  };
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://localhost';
    headers['X-Title'] = 'AI Blog Generator';
  }

  let json;
  try {
    json = await requestJson(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (error) {
    // Keep auto-size hidden from users: only add explicit sizes as internal fallbacks when required.
    const message = String(error?.message || '').toLowerCase();
    const retryableImageParamsError =
      message.includes('invalid value') ||
      message.includes('supported values') ||
      message.includes('quality') ||
      message.includes('size');
    if (retryableImageParamsError) {
      const fallbackBodies = [
        { ...body, size: '1536x1024' },
        { ...body, size: '1024x1536' },
        { ...body, size: '1024x1024' },
        { ...body, quality: 'auto', size: '1536x1024' },
        { ...body, quality: 'auto', size: '1024x1024' },
        { ...body, quality: 'auto', size: '1792x1024' },
      ];
      let lastError = error;
      for (const fallbackBody of fallbackBodies) {
        try {
          json = await requestJson(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(fallbackBody),
          });
          if (json?.data?.[0]) break;
        } catch (fallbackError) {
          lastError = fallbackError;
        }
      }
      if (!json?.data?.[0] && lastError) {
        throw lastError;
      }
      if (!json?.data?.[0]) {
        json = await requestJson(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ ...body, quality: 'auto', size: '1024x1024' }),
        });
      }
    } else {
      throw error;
    }
  }
  const first = json.data?.[0] || {};
  const imageUrl = first.url || (first.b64_json ? `data:image/png;base64,${first.b64_json}` : null);
  const pricing = PRICING.image[selectedModel] || PRICING.image[IMAGE_DEFAULT_MODEL.openai] || { perImage: 0 };
  return { imageUrl, cost: pricing.perImage };
}

async function testConnection({ provider, apiKey }) {
  if (!apiKey) {
    throw new Error('Missing API key');
  }
  if (provider === 'tavily') {
    const providerInfo = getProvider(provider);
    const url = `${providerInfo.baseUrl}/search`;
    await requestJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query: 'test query',
        search_depth: 'basic',
        max_results: 1,
      }),
    });
    return true;
  }
  if (provider === 'perplexity') {
    const providerInfo = getProvider(provider);
    const url = `${providerInfo.baseUrl}/chat/completions`;
    await requestJson(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: 'Test connection.' }],
        temperature: 0,
      }),
    });
    return true;
  }
  if (provider === 'google') {
    const providerInfo = getProvider(provider);
    const url = `${providerInfo.baseUrl}/models?key=${apiKey}`;
    await requestJson(url, { method: 'GET' });
    return true;
  }
  if (provider === 'anthropic') {
    const providerInfo = getProvider(provider);
    const url = `${providerInfo.baseUrl}/models`;
    await requestJson(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    return true;
  }
  const providerInfo = getProvider(provider);
  if (!providerInfo) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  const url = `${providerInfo.baseUrl}/models`;
  await requestJson(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  return true;
}

async function listProviderModels({ provider, apiKey }) {
  if (!apiKey) {
    throw new Error('Missing API key');
  }
  const providerInfo = getProvider(provider);
  if (!providerInfo) {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  if (provider === 'google') {
    let pageToken = '';
    const models = [];
    for (let i = 0; i < 20; i += 1) {
      const tokenPart = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '';
      const url = `${providerInfo.baseUrl}/models?key=${apiKey}${tokenPart}`;
      const json = await requestJson(url, { method: 'GET' });
      const pageModels = Array.isArray(json.models) ? json.models : [];
      models.push(...pageModels);
      pageToken = json.nextPageToken || '';
      if (!pageToken) break;
    }

    const normalized = models
      .map((item) => {
        const id = normalizeGoogleModelId(item?.name || item?.displayName || '');
        if (!id) return null;
        const methods = Array.isArray(item?.supportedGenerationMethods)
          ? item.supportedGenerationMethods.map((m) => String(m || '').toLowerCase())
          : [];
        const imageCapable = methods.some((m) => m.includes('predict')) || isLikelyImageModel(id);
        return {
          id,
          type: imageCapable ? 'image' : 'text',
        };
      })
      .filter(Boolean);
    const textModels = normalized.filter((m) => m.type === 'text').map((m) => m.id);
    const imageModels = normalized.filter((m) => m.type === 'image').map((m) => m.id);
    return {
      provider,
      textModels: uniqueSorted(textModels),
      imageModels: uniqueSorted(imageModels),
    };
  }
  if (provider === 'anthropic') {
    const url = `${providerInfo.baseUrl}/models`;
    const json = await requestJson(url, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
    });
    const rows = Array.isArray(json?.data) ? json.data : [];
    const textModels = rows
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean);
    return {
      provider,
      textModels: uniqueSorted(textModels),
      imageModels: [],
    };
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://localhost';
    headers['X-Title'] = 'AI Blog Generator';
  }

  const url = `${providerInfo.baseUrl}/models`;
  const json = await requestJson(url, { method: 'GET', headers });
  const rows = Array.isArray(json?.data) ? json.data : [];
  let textModels = [];
  let imageModels = [];

  if (provider === 'openai') {
    const ids = rows.map((item) => String(item?.id || '').trim()).filter(Boolean);
    textModels = ids.filter((id) => isOpenAiTextModel(id));
    imageModels = ids.filter((id) => isOpenAiImageModel(id));
  } else if (provider === 'openrouter') {
    const ids = rows.map((item) => ({
      id: String(item?.id || '').trim(),
      item,
    }));
    textModels = ids
      .filter(({ id, item }) => id && isOpenRouterTextModel(item, id))
      .map(({ id }) => id);
    imageModels = ids
      .filter(({ id, item }) => id && isOpenRouterImageModel(item, id))
      .map(({ id }) => id);
  } else {
    const normalized = rows
      .map((item) => {
        const id = String(item?.id || '').trim();
        if (!id) return null;
        return { id, type: classifyModelId(id) };
      })
      .filter(Boolean);
    textModels = normalized.filter((m) => m.type === 'text').map((m) => m.id);
    imageModels = normalized.filter((m) => m.type === 'image').map((m) => m.id);
  }

  return {
    provider,
    textModels: uniqueSorted(textModels),
    imageModels: uniqueSorted(imageModels),
  };
}

async function tavilySearch({
  apiKey,
  query,
  searchDepth = 'advanced',
  maxResults = 5,
  includeAnswer = true,
}) {
  if (!apiKey) {
    throw new Error('Missing Tavily API key');
  }
  const providerInfo = getProvider('tavily');
  const url = `${providerInfo.baseUrl}/search`;
  const json = await requestJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: searchDepth,
      max_results: maxResults,
      include_answer: includeAnswer,
      include_raw_content: false,
      include_images: false,
    }),
  });
  return {
    answer: json.answer || '',
    results: Array.isArray(json.results) ? json.results : [],
  };
}

function extractOpenAIResponseText(json) {
  if (!json) return '';
  if (typeof json.output_text === 'string' && json.output_text.trim()) {
    return json.output_text;
  }
  const output = Array.isArray(json.output) ? json.output : [];
  const messageTexts = output
    .filter((item) => item?.type === 'message')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((part) => part?.text || part?.output_text || '')
    .filter(Boolean);
  return messageTexts.join('\n').trim();
}

function extractOpenAISources(json) {
  const output = Array.isArray(json?.output) ? json.output : [];
  const rawSources = output
    .filter((item) => item?.type === 'web_search_call')
    .flatMap((item) => (Array.isArray(item?.action?.sources) ? item.action.sources : []));

  const seen = new Set();
  const normalized = [];
  for (const source of rawSources) {
    const url = source?.url || '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    normalized.push({
      title: source?.title || url,
      url,
    });
  }
  return normalized;
}

async function openaiWebSearch({
  apiKey,
  query,
  model = 'gpt-4o-mini',
  maxResults = 5,
}) {
  if (!apiKey) {
    throw new Error('Missing OpenAI API key');
  }
  const providerInfo = getProvider('openai');
  const url = `${providerInfo.baseUrl}/responses`;
  const instructionText = [
    'Research the query using web search.',
    `Provide a concise synthesis and include up to ${maxResults} trustworthy sources.`,
  ].join(' ');
  const json = await requestJson(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: `${instructionText}\n\nQuery: ${query}`,
      tools: [{ type: 'web_search' }],
      include: ['web_search_call.action.sources'],
    }),
  });

  const answer = extractOpenAIResponseText(json);
  const results = extractOpenAISources(json).slice(0, maxResults);
  return { answer, results };
}

async function wikipediaSummary(query) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
  const json = await requestJson(url, { method: 'GET' });
  return {
    title: json.title || '',
    extract: json.extract || '',
    url: json.content_urls?.desktop?.page || '',
  };
}

module.exports = {
  PROVIDERS,
  PRICING,
  getProvider,
  chatCompletion,
  generateImage,
  testConnection,
  estimateCost,
  parseJsonContent,
  tavilySearch,
  openaiWebSearch,
  wikipediaSummary,
  IMAGE_DEFAULT_MODEL,
  listProviderModels,
};
