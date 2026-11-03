import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CountryCode } from '../../shared/types';
import { searchCatalog, type CatalogProduct, type CatalogSort } from '../lib/api';
import { marketName } from '../lib/market-language';
import { CountryFlag } from './CountryFlag';
import { PageHeader } from './PageHeader';
import { DiscoverProductArt } from './DiscoverProductArt';
import './discover.css';

interface SearchViewProps {
  market: CountryCode;
  onOpenSidebar: () => void;
  onAsk: (name: string) => void;
}

const CATEGORY_KEYS: Record<string, string> = {
  '耳机': 'headphones', '手机': 'phones', '护肤': 'skincare', '家电': 'home',
  '鞋履': 'shoes', '穿戴': 'wearables', '音频': 'audio',
};

export function SearchView({ market, onOpenSidebar, onAsk }: SearchViewProps) {
  const { t, i18n } = useTranslation();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [brands, setBrands] = useState<string[]>([]);
  const [sort, setSort] = useState<CatalogSort>('name-asc');
  const [categories, setCategories] = useState<string[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const categoryLabel = (value: string) => CATEGORY_KEYS[value] ? t(`search.categoryNames.${CATEGORY_KEYS[value]}`) : value;

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    searchCatalog(query, category, brand, sort)
      .then((data) => {
        if (!alive) return;
        // Older local API processes omit facets; keep their loaded catalog usable.
        const visible = data.products.filter(product => !brand || product.brand === brand);
        const compare = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });
        visible.sort((a, b) => {
          const byName = compare(a.name, b.name) || compare(a.id, b.id);
          return sort === 'name-desc' ? -byName : sort === 'brand-asc' ? compare(a.brand, b.brand) || byName : byName;
        });
        setProducts(visible);
        setBrands(data.brands ?? [...new Set(data.products.map(product => product.brand))].sort(compare));
        setCategories(data.categories);
        setTotal(brand && !data.brands ? visible.length : data.total);
      })
      .catch(() => { if (alive) setFailed(true); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [query, category, brand, sort, retry]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      event.preventDefault();
      searchInputRef.current?.focus();
    }
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  function changeCategory(value: string) {
    setCategory(value);
    setBrand('');
  }

  function resetFilters() {
    setQuery('');
    setCategory('');
    setBrand('');
    searchInputRef.current?.focus();
  }

  return (
    <section className="pc-page pc-search-page" aria-label={t('search.label')}>
      <PageHeader eyebrow="DISCOVER" title={t('search.title')} onOpenSidebar={onOpenSidebar}>
        <span className="discover-market"><CountryFlag code={market} width={19} />{marketName(market, i18n.language)}</span>
      </PageHeader>
      <div className="pc-page-body pc-search-body discover-body">
        <div className="shop-toolbar">
          <div className="discover-categories" role="group" aria-label={t('search.categories')}>
            <button type="button" aria-pressed={!category} onClick={() => changeCategory('')}>{t('search.all')}</button>
            {categories.map((item) => <button type="button" key={item} aria-pressed={category === item}
              onClick={() => changeCategory(category === item ? '' : item)}>{categoryLabel(item)}</button>)}
          </div>
          <div className="shop-controls">
            <form className="discover-search" onSubmit={event => event.preventDefault()} role="search">
              <div className="discover-search-input">
                <Search size={19} aria-hidden="true" />
                <input ref={searchInputRef} type="search" value={query}
                  onChange={(event) => setQuery(event.target.value)} placeholder={t('search.placeholder')}
                  aria-label={t('search.placeholder')} aria-keyshortcuts="/" />
                {query ? <button type="button" className="discover-clear" aria-label={t('search.clear')}
                  onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}><X size={17} /></button>
                  : <kbd aria-hidden="true">/</kbd>}
              </div>
            </form>
            <div className="shop-filter-controls">
              <label className="shop-select">
                <span>{t('search.brand')}</span>
                <select aria-label={t('search.brand')} value={brand} onChange={event => setBrand(event.target.value)}>
                  <option value="">{t('search.allBrands')}</option>
                  {brand && !brands.includes(brand) && <option value={brand}>{brand}</option>}
                  {brands.map(value => <option key={value} value={value}>{value}</option>)}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
              <label className="shop-select">
                <span>{t('search.sort')}</span>
                <select aria-label={t('search.sort')} value={sort} onChange={event => setSort(event.target.value as CatalogSort)}>
                  <option value="name-asc">{t('search.nameAsc')}</option>
                  <option value="name-desc">{t('search.nameDesc')}</option>
                  <option value="brand-asc">{t('search.brandAsc')}</option>
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </label>
            </div>
          </div>
        </div>

        <section className="discover-collection" aria-labelledby="discover-collection-title">
          <div className="discover-collection-head">
            <div className="shop-results-title">
              <h2 id="discover-collection-title">{brand || (category ? categoryLabel(category) : t('search.allProducts'))}</h2>
              <span className="discover-count" role="status">{loading ? t('search.loading') : failed ? '' : t('search.results', { count: total })}</span>
            </div>
            {query.trim() && <button className="shop-ask" type="button" onClick={() => onAsk(query.trim())}>
              {t('search.askPico')}<ArrowUpRight size={15} aria-hidden="true" />
            </button>}
          </div>
          {(category || brand) && <div className="shop-active-filters" aria-label={t('search.activeFilters')}>
            {category && <button type="button" aria-label={`${t('search.removeFilter')}: ${categoryLabel(category)}`}
              onClick={() => changeCategory('')}>{categoryLabel(category)}<X size={12} aria-hidden="true" /></button>}
            {brand && <button type="button" aria-label={`${t('search.removeFilter')}: ${brand}`}
              onClick={() => setBrand('')}>{brand}<X size={12} aria-hidden="true" /></button>}
            <button className="shop-clear-filters" type="button" onClick={resetFilters}>{t('search.clearFilters')}</button>
          </div>}

          {failed ? <div className="discover-empty" role="alert">
            <Search size={30} strokeWidth={1.3} aria-hidden="true" /><p>{t('search.error')}</p>
            <button type="button" onClick={() => setRetry(value => value + 1)}>{t('reels.retry')}</button>
          </div> : loading ? <ul className="discover-grid discover-skeletons" aria-label={t('search.loading')} aria-busy="true">
            {Array.from({ length: 8 }, (_, index) => <li key={index} aria-hidden="true"><div /><span /><span /></li>)}
          </ul> : products.length === 0 ? <div className="discover-empty">
            <Search size={30} strokeWidth={1.3} aria-hidden="true" /><p>{t('search.empty')}</p>
            <button type="button" onClick={resetFilters}>{t('search.clearFilters')}</button>
          </div> : <ul className="discover-grid">
            {products.map((product, index) => <li key={product.id} className="discover-product">
              <button type="button" className="discover-product-button" aria-label={`${t('search.compare')}: ${product.name}`}
                onClick={() => onAsk(product.name)}>
                <div className="discover-product-image">
                  <DiscoverProductArt product={product} priority={index < 4} />
                  <span className="discover-illustration">{t('search.illustration')}</span>
                  <span className="discover-product-arrow" aria-hidden="true"><ArrowUpRight size={21} /></span>
                </div>
                <div className="discover-product-copy">
                  <span className="discover-product-brand">{product.brand}</span>
                  <h3>{product.name}</h3>
                  <span className="discover-product-specs">{product.specs || categoryLabel(product.category)}</span>
                  <span className="discover-product-bottom"><span>{categoryLabel(product.category)}</span><strong>{t('search.compare')}<ArrowUpRight size={14} aria-hidden="true" /></strong></span>
                </div>
              </button>
            </li>)}
          </ul>}
        </section>
      </div>
    </section>
  );
}
