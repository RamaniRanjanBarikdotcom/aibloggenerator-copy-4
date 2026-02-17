import React, { useEffect, useState } from 'react';
import { Play, Save } from 'lucide-react';

const PLATFORM_OPTIONS = [
  { value: 'shopify', label: 'Shopify' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'react', label: 'React' },
  { value: 'generic', label: 'Generic' },
  { value: 'jtl', label: 'JTL' },
];

function ProductScraperPage({ t }) {
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState('generic');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadExisting();
  }, []);

  const formatPrice = (item) => {
    if (item.price === null || item.price === undefined) return '';
    const currency = item.currency || '$';
    const spacer = currency.length > 1 ? ' ' : '';
    return `${currency}${spacer}${item.price}`;
  };

  const loadExisting = async () => {
    const result = await window.electronAPI.getProductDatabase();
    if (result.success) {
      setProducts(result.products || []);
    }
  };

  const handleScrape = async () => {
    if (!url.trim()) {
      alert('Please enter a URL');
      return;
    }
    setLoading(true);
    const result = await window.electronAPI.scrapeWebsite({
      url: url.trim(),
      platform,
    });
    setLoading(false);
    if (result.success) {
      setProducts(result.products || []);
    } else {
      alert(result.error || 'Scrape failed');
    }
  };

  const handleSave = async () => {
    const result = await window.electronAPI.saveProductDatabase({ products });
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      alert(result.error || 'Save failed');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-slate-900 mb-2 dark:text-slate-100">
          {t.scraperTitle}
        </h2>
        <p className="text-slate-700 dark:text-slate-300">{t.scraperSubtitle}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 space-y-4 dark:bg-slate-900/80 dark:border dark:border-slate-800">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-800 mb-2 dark:text-slate-200">
              {t.scraperUrlLabel}
            </label>
            <input
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-2 dark:text-slate-200">
              {t.scraperPlatformLabel}
            </label>
            <select
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={handleScrape}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white"
          >
            <Play className="w-4 h-4" />
            {loading ? t.scraperRunning : t.scraperRun}
          </button>
          <button
            onClick={handleSave}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${
              saved ? 'bg-blue-500 text-white' : 'bg-slate-900 text-white'
            }`}
          >
            <Save className="w-4 h-4" />
            {saved ? t.saved : t.scraperSave}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 dark:bg-slate-900/80 dark:border dark:border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t.scraperResultsTitle}
          </h3>
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {products.length} items
          </span>
        </div>
        {products.length === 0 ? (
          <p className="text-sm text-slate-700 dark:text-slate-300">
            {t.scraperNoResults}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {products.slice(0, 20).map((product, index) => (
              <div
                key={`${product.url}-${index}`}
                className="border border-slate-200 rounded-lg p-4 dark:border-slate-700"
              >
                <p className="font-semibold text-slate-900 dark:text-slate-100">
                  {product.title}
                </p>
                {product.price !== null && (
                  <p className="text-sm text-blue-600 dark:text-blue-300">
                    {formatPrice(product)}
                  </p>
                )}
                {product.url && (
                  <a
                    href={product.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                  >
                    {product.url}
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
        {products.length > 20 && (
          <p className="text-xs text-slate-700 mt-4 dark:text-slate-400">
            {t.scraperLimitNote}
          </p>
        )}
      </div>
    </div>
  );
}

export default ProductScraperPage;
