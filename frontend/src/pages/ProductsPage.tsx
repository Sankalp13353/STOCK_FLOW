import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../components/layout/PageHeader';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { Pagination } from '../components/ui/Pagination';
import { ProductFormModal } from '../features/products/ProductFormModal';
import { ProductDeleteModal } from '../features/products/ProductDeleteModal';
import { ProductDetailModal } from '../features/products/ProductDetailModal';
import { fetchProducts } from '../api/products';
import { Product } from '../types';
import { useAuth } from '../hooks/useAuth';
import { formatCurrencyCents, formatDate } from '../utils/formatters';
import {
  Package,
  Plus,
  Search,
  X,
  Eye,
  Pencil,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Filter,
} from 'lucide-react';

export function ProductsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const queryClient = useQueryClient();

  // Query filter state
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'true' | 'false'>('all');

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingProduct, setDeletingProduct] = useState<Product | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);

  // Notification state
  const [notification, setNotification] = useState<{
    type: 'success' | 'info';
    message: string;
  } | null>(null);

  function triggerNotification(message: string, type: 'success' | 'info' = 'success') {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 5000);
  }

  // React Query queryKey
  const queryParams = {
    page,
    limit,
    search: activeSearch || undefined,
    isActive: statusFilter === 'all' ? undefined : statusFilter === 'true',
  };

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['products', queryParams],
    queryFn: () => fetchProducts(queryParams),
    staleTime: 30 * 1000,
  });

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setActiveSearch(searchInput.trim());
  }

  function handleClearSearch() {
    setSearchInput('');
    setActiveSearch('');
    setPage(1);
  }

  function handleStatusChange(newStatus: 'all' | 'true' | 'false') {
    setStatusFilter(newStatus);
    setPage(1);
  }

  function handleOpenCreate() {
    setEditingProduct(null);
    setIsFormOpen(true);
  }

  function handleOpenEdit(product: Product) {
    setEditingProduct(product);
    setIsFormOpen(true);
  }

  function handleOpenDelete(product: Product) {
    setDeletingProduct(product);
    setIsDeleteOpen(true);
  }

  function handleOpenDetail(product: Product) {
    setViewingProduct(product);
    setIsDetailOpen(true);
  }

  function handleFormSuccess(savedProduct: Product, isNew: boolean) {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
    triggerNotification(
      isNew
        ? `Product "${savedProduct.sku}" (${savedProduct.name}) was successfully created.`
        : `Product "${savedProduct.sku}" was successfully updated.`
    );
  }

  function handleDeleteSuccess(deletedProduct: Product) {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-data'] });
    triggerNotification(
      `Product "${deletedProduct.sku}" was permanently removed from the catalog.`
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Catalog Management"
        description="Search, view, and manage master SKUs, specifications, unit prices, and status."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              isLoading={isFetching}
              leftIcon={<RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            {isAdmin && (
              <Button
                size="sm"
                variant="primary"
                onClick={handleOpenCreate}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                New Product
              </Button>
            )}
          </div>
        }
      />

      {/* Global Notification Banner */}
      {notification && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800 shadow-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-medium">{notification.message}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
        <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 w-full md:w-96">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by SKU or product name..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 placeholder:text-slate-400"
            />
            {searchInput && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Button type="submit" size="sm" variant="secondary" className="text-xs h-8">
            Search
          </Button>
        </form>

        {/* Filter Controls */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="font-medium">Status:</span>
          </div>
          <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => handleStatusChange('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange('true')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'true'
                  ? 'bg-white text-emerald-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange('false')}
              className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                statusFilter === 'false'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Inactive
            </button>
          </div>
        </div>
      </div>

      {/* Main Table / State */}
      {error && (
        <ErrorMessage
          title="Failed to load products"
          message={error instanceof Error ? error.message : 'Backend connection error.'}
          onRetry={() => refetch()}
        />
      )}

      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 flex justify-center">
          <LoadingSpinner size="lg" message="Loading master product catalog..." />
        </div>
      ) : data?.products.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <EmptyState
            icon={<Package className="w-8 h-8 text-slate-400" />}
            title="No products found"
            description={
              activeSearch || statusFilter !== 'all'
                ? 'No catalog items match your search query or status filter. Try clearing filters.'
                : 'There are currently no products defined in the StockFlow catalog.'
            }
            actionLabel={
              activeSearch || statusFilter !== 'all'
                ? 'Clear Filters'
                : isAdmin
                ? 'Create First Product'
                : undefined
            }
            onAction={
              activeSearch || statusFilter !== 'all'
                ? () => {
                    handleClearSearch();
                    handleStatusChange('all');
                  }
                : isAdmin
                ? handleOpenCreate
                : undefined
            }
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-600 uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-5 py-3.5">SKU & Product Name</th>
                  <th className="px-4 py-3.5">Description</th>
                  <th className="px-4 py-3.5 text-right">Unit Price</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5">Created Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data?.products.map((product) => (
                  <tr
                    key={product.id}
                    className="hover:bg-slate-50/70 transition-colors group"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col">
                        <span className="font-mono text-xs font-bold text-slate-900 group-hover:text-brand-600 transition-colors">
                          {product.sku}
                        </span>
                        <span className="text-xs text-slate-700 font-medium mt-0.5">
                          {product.name}
                        </span>
                      </div>
                    </td>

                    <td className="px-4 py-3.5 max-w-xs truncate text-slate-500">
                      {product.description || (
                        <span className="text-slate-300 italic">No description</span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right font-mono font-semibold text-slate-900">
                      {formatCurrencyCents(product.priceCents)}
                    </td>

                    <td className="px-4 py-3.5 text-center">
                      <Badge variant={product.isActive ? 'success' : 'neutral'} size="sm">
                        {product.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </Badge>
                    </td>

                    <td className="px-4 py-3.5 text-slate-500 whitespace-nowrap">
                      {formatDate(product.createdAt)}
                    </td>

                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDetail(product)}
                          className="h-8 px-2 text-slate-600 hover:text-slate-900"
                          title="View product details and warehouse stock"
                          aria-label={`View details for ${product.sku}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="sr-only sm:not-sr-only sm:ml-1 text-[11px]">Stock</span>
                        </Button>

                        {isAdmin && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEdit(product)}
                              className="h-8 px-2 text-slate-600 hover:text-brand-600"
                              title="Edit product"
                              aria-label={`Edit ${product.sku}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span className="sr-only sm:not-sr-only sm:ml-1 text-[11px]">Edit</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenDelete(product)}
                              className="h-8 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                              title="Delete product"
                              aria-label={`Delete ${product.sku}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span className="sr-only sm:not-sr-only sm:ml-1 text-[11px]">Delete</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {data?.pagination && (
            <Pagination
              currentPage={data.pagination.page}
              totalPages={data.pagination.totalPages}
              totalRecords={data.pagination.totalRecords}
              limit={data.pagination.limit}
              onPageChange={(newPage) => setPage(newPage)}
              isLoading={isFetching}
            />
          )}
        </div>
      )}

      {/* Modals */}
      <ProductFormModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        product={editingProduct}
        onSuccess={handleFormSuccess}
      />

      <ProductDeleteModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        product={deletingProduct}
        onSuccess={handleDeleteSuccess}
      />

      <ProductDetailModal
        isOpen={isDetailOpen}
        onClose={() => setIsDetailOpen(false)}
        product={viewingProduct}
        onEdit={handleOpenEdit}
        isAdmin={isAdmin}
      />
    </div>
  );
}
