import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CountryCode } from '../../shared/types';
import { searchCatalog, type CatalogProduct } from '../lib/api';
import { PageHeader } from './PageHeader';

interface SearchViewProps {
  market: CountryCode;
  onOpenSidebar: () => void;
  onAsk: (name: string) => void;
}

export function SearchView({ market, onOpenSidebar, onAsk }: SearchViewProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    searchCatalog(query, category)
      .then((data) => {
        if (!alive) return;
        setProducts(data.products);
        setCategories(data.categories);
        setTotal(data.total);
      })
      .catch(() => {
        if (alive) setFailed(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query, category]);

  return (
    <section className="pc-page pc-search-page" aria-label={t('search.label')}>
      <PageHeader
        eyebrow="DISCOVER"
        title={t('search.title')}
        description={t('search.body')}
        onOpenSidebar={onOpenSidebar}
      />
      <div className="pc-page-body pc-search-body">
        <label className="pc-search-bar">
          <Search size={18} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t('search.clear')}>
              ×
            </button>
          )}
        </label>

        <div className="pc-search-chips" role="list" aria-label={t('search.categories')}>
          <button
            type="button"
            role="listitem"
            className={`pc-chip ${category === '' ? 'is-active' : ''}`}
            onClick={() => setCategory('')}
          >
            {t('search.all')}
          </button>
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              role="listitem"
              className={`pc-chip ${category === item ? 'is-active' : ''}`}
              onClick={() => setCategory(category === item ? '' : item)}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="pc-search-meta" aria-live="polite">
          <span>
            {loading ? t('search.loading') : t('search.results', { count: total })}
          </span>
        </div>

        {failed ? (
          <div className="pc-empty-card">
            <p>{t('search.error')}</p>
          </div>
        ) : !loading && products.length === 0 ? (
          <div className="pc-empty-card">
            <p>{t('search.empty')}</p>
          </div>
        ) : (
          <ul className="pc-catalog-list">
            {products.map((product) => (
              <li key={product.id} className="pc-catalog-row">
                <span className="pc-catalog-initial" aria-hidden="true">
                  {product.brand.slice(0, 1).toUpperCase()}
                </span>
                <span className="pc-catalog-copy">
                  <strong>{product.name}</strong>
                  <small>
                    {product.brand} · {product.category}
                    {product.specs ? ` · ${product.specs}` : ''}
                  </small>
                </span>
                <button
                  type="button"
                  className="pc-catalog-action"
                  onClick={() => onAsk(product.name)}
                >
                  {t('search.compare')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
