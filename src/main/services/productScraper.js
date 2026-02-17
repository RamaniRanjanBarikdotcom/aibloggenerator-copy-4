const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

let puppeteer = null;
try {
  puppeteer = require('puppeteer');
} catch (error) {
  puppeteer = null;
}

const PLATFORM_SELECTORS = {
  shopify: {
    productCard: '[class*="product"]',
    title: '[class*="product"] [class*="title"], [class*="product"] h3, [class*="product"] h2',
    price: '[class*="price"], [data-price]',
    link: 'a[href]',
    image: 'img',
  },
  woocommerce: {
    productCard: '.product',
    title: '.woocommerce-loop-product__title, h2, h3',
    price: '.price, .amount',
    link: 'a[href]',
    image: 'img',
  },
  react: {
    productCard: '[data-product], [class*="product"], [class*="item"]',
    title: 'h2, h3, [class*="title"], [data-title]',
    price: '[class*="price"], [data-price]',
    link: 'a[href]',
    image: 'img',
  },
  generic: {
    productCard: '[class*="product"], [class*="item"], [data-product]',
    title: 'h2, h3, .title, .product-title',
    price: '[class*="price"], [data-price]',
    link: 'a[href]',
    image: 'img',
  },
  jtl: {
    productCard:
      '.product, .product-wrapper article, .product-item, .product-wrapper, .col-product, .artbox, .thumbnail, [itemtype*="Product"]',
    title:
      '.product-title, .product-name, .arttitle, h2[itemprop="name"], h3, [itemprop="name"]',
    price:
      '.price, .product-price, .price-large, .pprice, .price [itemprop="price"], [itemprop="price"], [data-price]',
    link: 'a.product-link, a[itemprop="url"], a[href]',
    image:
      'img.product-image, .product-img, img.artimg, img[data-src], img.lazyload, img[itemprop="image"], img',
  },
};

function normalizeUrl(baseUrl, href) {
  if (!href) return null;
  if (href.startsWith('//')) {
    return `https:${href}`;
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

function parsePrice(text) {
  if (!text) return { amount: null, currency: '' };
  const trimmed = text.trim();
  let currency = '';
  if (trimmed.includes('€')) currency = '€';
  if (trimmed.includes('£')) currency = '£';
  if (trimmed.includes('CHF')) currency = 'CHF';
  if (!currency && trimmed.includes('$')) currency = '$';

  const match = trimmed.match(/[\d.,]+/);
  if (!match) return { amount: null, currency };
  let numberStr = match[0];
  const lastComma = numberStr.lastIndexOf(',');
  const lastDot = numberStr.lastIndexOf('.');
  if (lastComma > lastDot) {
    numberStr = numberStr.replace(/\./g, '').replace(',', '.');
  } else {
    numberStr = numberStr.replace(/,/g, '');
  }
  const amount = parseFloat(numberStr);
  if (Number.isNaN(amount)) return { amount: null, currency };
  return { amount, currency };
}

function generateKeywordVariants(title) {
  if (!title) return [];
  const base = title.toLowerCase();
  const words = base.split(/\\s+/).filter(Boolean);
  const variants = new Set([base]);
  if (words.length > 2) {
    variants.add(words.slice(0, 2).join(' '));
    variants.add(words.slice(0, 3).join(' '));
  }
  return Array.from(variants);
}

function getImageUrl(card, selectors, baseUrl) {
  const imgEl = card.find(selectors.image).first();
  const raw =
    imgEl.attr('src') ||
    imgEl.attr('data-src') ||
    imgEl.attr('data-lazy-src') ||
    imgEl.attr('data-original') ||
    imgEl.attr('data-srcset') ||
    imgEl.attr('srcset') ||
    '';
  const src = raw.split(' ')[0];
  return normalizeUrl(baseUrl, src);
}

function extractProducts(html, baseUrl, platform) {
  const selectors = PLATFORM_SELECTORS[platform] || PLATFORM_SELECTORS.generic;
  const $ = cheerio.load(html);
  const products = [];
  const seen = new Set();

  $(selectors.productCard).each((_, el) => {
    const card = $(el);
    const title = card.find(selectors.title).first().text().trim();
    const linkEl = card.find(selectors.link).first();
    const href = linkEl.attr('href');
    const url = normalizeUrl(baseUrl, href);
    const priceText = card.find(selectors.price).first().text().trim();
    const { amount, currency } = parsePrice(priceText);
    const image = getImageUrl(card, selectors, baseUrl);

    if (!title && !url) return;
    if (url && seen.has(url)) return;
    if (url) seen.add(url);

    products.push({
      title: title || 'Untitled product',
      url,
      price: amount,
      currency,
      priceText: priceText || '',
      image,
      keywords: generateKeywordVariants(title),
      source: platform,
    });
  });

  if (products.length === 0) {
    $('a[href*=\"/product\"], a[href*=\"/products\"], a[href*=\"/shop\"]').each((_, el) => {
      const link = $(el);
      const href = link.attr('href');
      const url = normalizeUrl(baseUrl, href);
      const title = link.text().trim();
      if (!url || seen.has(url)) return;
      seen.add(url);
      products.push({
        title: title || 'Product',
        url,
        price: null,
        currency: '',
        priceText: '',
        image: null,
        keywords: generateKeywordVariants(title),
        source: platform,
      });
    });
  }

  return products;
}

async function fetchHtml(url, mode = 'static') {
  if (mode === 'dynamic') {
    if (!puppeteer) {
      throw new Error('Puppeteer not installed for dynamic scraping');
    }
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
    );
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    const content = await page.content();
    await browser.close();
    return content;
  }

  const response = await axios.get(url, {
    timeout: 30000,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
    },
  });
  return response.data;
}

async function scrapeWebsite(url, { platform = 'generic', mode = 'auto' } = {}) {
  if (mode === 'dynamic' || mode === 'static') {
    const html = await fetchHtml(url, mode);
    return extractProducts(html, url, platform);
  }

  const html = await fetchHtml(url, 'static');
  const staticProducts = extractProducts(html, url, platform);
  if (staticProducts.length > 0 || !puppeteer) {
    return staticProducts;
  }

  const dynamicHtml = await fetchHtml(url, 'dynamic');
  return extractProducts(dynamicHtml, url, platform);
}

async function productScrapper(url, options = {}) {
  return scrapeWebsite(url, options);
}

function saveToDatabase(products, outputDir) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  const jsonPath = path.join(outputDir, 'products.json');
  const jsPath = path.join(outputDir, 'products.js');
  fs.writeFileSync(jsonPath, JSON.stringify(products, null, 2));
  const jsContent = `// Auto-generated product database\\nmodule.exports = ${JSON.stringify(products, null, 2)};\\n`;
  fs.writeFileSync(jsPath, jsContent);
  return { jsonPath, jsPath };
}

module.exports = {
  scrapeWebsite,
  productScrapper,
  saveToDatabase,
};
