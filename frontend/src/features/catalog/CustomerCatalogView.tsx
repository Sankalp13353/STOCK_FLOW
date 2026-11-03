import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchProducts } from '../../api/products';
import { Product } from '../../types';
import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui/Button';
import { Pagination } from '../../components/ui/Pagination';
import { ErrorMessage } from '../../components/ui/ErrorMessage';
import { CustomerProductDetailModal } from './CustomerProductDetailModal';
import { formatCurrencyCents } from '../../utils/formatters';
import { useCart } from '../../context/CartContext';
import {
  Package,
  Search,
  X,
  ShoppingCart,
  Check,
  ArrowRight,
  SlidersHorizontal,
} from 'lucide-react';

export function CustomerCatalogView() {
  const { addToCart, totalItems, totalAmountCents } = useCart();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  const [sortBy, setSortBy] = useState<'newest' | 'price_asc' | 'price_desc' | 'name_asc'>('newest');

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, boolean>>({});

  const pageSize = 12;

  // Query active products from backend API
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['customer-products', currentPage, submittedSearch],
    queryFn: () =>
      fetchProducts({
        page: currentPage,
        limit: pageSize,
        search: submittedSearch || undefined,
        isActive: true,
      }),
    staleTime: 30 * 1000,
  });

  const rawProducts = data?.products ?? [];
  const pagination = data?.pagination;

  // Client-side sort on current page results
  const sortedProducts = useMemo(() => {
    const list = [...rawProducts];
    if (sortBy === 'price_asc') {
      return list.sort((a, b) => a.priceCents - b.priceCents);
    }
    if (sortBy === 'price_desc') {
      return list.sort((a, b) => b.priceCents - a.priceCents);
    }
    if (sortBy === 'name_asc') {
      return list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list; // 'newest' default (already ordered by createdAt desc)
  }, [rawProducts, sortBy]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCurrentPage(1);
    setSubmittedSearch(searchInput.trim());
  }

  function handleClearSearch() {
    setSearchInput('');
    setSubmittedSearch('');
    setCurrentPage(1);
  }

  function handleQuickAdd(product: Product) {
    addToCart(product, 1);
    setAddedIds((prev) => ({ ...prev, [product.id]: true }));
    setTimeout(() => {
      setAddedIds((prev) => ({ ...prev, [product.id]: false }));
    }, 1800);
  }

  return (
    <div className="space-y-6">
      {/* Header with Search and Cart shortcut */}
      <PageHeader
        title="Product Catalog & Storefront"
        description="Browse wholesale products verified for multi-warehouse allocation and rapid order fulfillment."
        actions={
          <div className="flex items-center gap-3">
            <Link to="/cart">
              <Button
                size="sm"
                variant="primary"
                leftIcon={<ShoppingCart className="w-4 h-4" />}
              >
                Shopping Cart ({totalItems})
              </Button>
            </Link>
          </div>
        }
      />

      {/* Search and Sort Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search products by SKU or name..."
              className="w-full pl-9 pr-9 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 text-xs self-end md:self-auto">
            <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-slate-500 font-medium">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="newest">Newest Releases</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="name_asc">Name: A to Z</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <ErrorMessage
          title="Failed to Load Products"
          message={error instanceof Error ? error.message : 'Unable to connect to product catalog.'}
          onRetry={() => refetch()}
        />
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 animate-pulse"
            >
              <div className="h-40 bg-slate-100 rounded-lg" />
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
              <div className="h-6 bg-slate-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : sortedProducts.length === 0 ? (
        /* Empty Results */
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No Products Available</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {submittedSearch
              ? `No catalog products matched your search "${submittedSearch}". Try clearing the search query.`
              : 'Our product catalog is currently being updated. Please check back shortly.'}
          </p>
          {submittedSearch && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearSearch}
              className="mt-4"
            >
              Clear Search Filter
            </Button>
          )}
        </div>
      ) : (
        /* Products Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {sortedProducts.map((product) => {
            const isJustAdded = addedIds[product.id];

            return (
              <div
                key={product.id}
                className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-brand-300 transition-all flex flex-col justify-between overflow-hidden group"
              >
                <div>
                  {/* Image Placeholder Banner */}
                  <div
                    onClick={() => setSelectedProduct(product)}
                    className="h-44 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 border-b border-slate-100 flex flex-col items-center justify-center p-4 relative cursor-pointer"
                  >
                    <Package className="w-12 h-12 text-slate-400 group-hover:scale-105 transition-transform" />
                    <span className="font-mono text-[10px] font-bold text-slate-500 bg-white/80 px-2 py-0.5 rounded-md mt-2 border border-slate-200 shadow-2xs">
                      {product.sku}
                    </span>
                    <span className="absolute top-2.5 right-2.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      In Stock
                    </span>
                  </div>

                  {/* Product Details Content */}
                  <div className="p-4 space-y-2">
                    <h3
                      onClick={() => setSelectedProduct(product)}
                      className="text-sm font-bold text-slate-900 hover:text-brand-600 transition-colors cursor-pointer line-clamp-1"
                      title={product.name}
                    >
                      {product.name}
                    </h3>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {product.description || 'Verified wholesale catalog product.'}
                    </p>
                  </div>
                </div>

                {/* Price & Action Footer */}
                <div className="p-4 pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-medium">Price</span>
                    <span className="text-base font-extrabold text-slate-900">
                      {formatCurrencyCents(product.priceCents)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedProduct(product)}
                      className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                      title="Inspect product specifications"
                      aria-label="View specifications"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                    <Button
                      size="sm"
                      variant={isJustAdded ? 'secondary' : 'primary'}
                      onClick={() => handleQuickAdd(product)}
                      className={isJustAdded ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}
                      leftIcon={
                        isJustAdded ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <ShoppingCart className="w-3.5 h-3.5" />
                        )
                      }
                    >
                      {isJustAdded ? 'Added' : 'Add'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="pt-2">
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalRecords={pagination.totalRecords}
            limit={pagination.limit}
            onPageChange={(p) => setCurrentPage(p)}
            isLoading={isFetching}
          />
        </div>
      )}

      {/* Floating Cart Notification Banner when items exist */}
      {totalItems > 0 && (
        <div className="fixed bottom-6 right-6 z-40 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <Link
            to="/cart"
            className="flex items-center gap-3 px-4 py-3 bg-slate-900 text-white rounded-xl shadow-xl hover:bg-slate-800 transition-colors border border-slate-700"
          >
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold leading-tight">
                {totalItems} {totalItems === 1 ? 'item' : 'items'} in Cart
              </p>
              <p className="text-[11px] text-slate-300 font-mono">
                {formatCurrencyCents(totalAmountCents)} total
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-400 ml-1" />
          </Link>
        </div>
      )}

      {/* Detail Modal */}
      <CustomerProductDetailModal
        isOpen={Boolean(selectedProduct)}
        onClose={() => setSelectedProduct(null)}
        product={selectedProduct}
      />
    </div>
  );
}

