import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Warehouse as WarehouseIcon,
  ChevronDown,
  Search,
  Check,
  X,
  MapPin,
  Building2,
} from 'lucide-react';
import { Warehouse } from '../../types';
import { Badge } from '../../components/ui/Badge';

interface WarehouseSelectorProps {
  warehouses: Warehouse[];
  selectedWarehouseId: string | null;
  onSelectWarehouse: (warehouseId: string) => void;
  isLoading?: boolean;
  isAdmin?: boolean;
}

export function WarehouseSelector({
  warehouses,
  selectedWarehouseId,
  onSelectWarehouse,
  isLoading = false,
  isAdmin = false,
}: WarehouseSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input when opened
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedWarehouse = useMemo(() => {
    return warehouses.find((w) => w.id === selectedWarehouseId) || null;
  }, [warehouses, selectedWarehouseId]);

  // Client-side search filtering across code, name, city, and country
  const filteredWarehouses = useMemo(() => {
    if (!searchQuery.trim()) return warehouses;
    const q = searchQuery.toLowerCase().trim();
    return warehouses.filter(
      (w) =>
        w.code.toLowerCase().includes(q) ||
        w.name.toLowerCase().includes(q) ||
        w.city.toLowerCase().includes(q) ||
        w.country.toLowerCase().includes(q) ||
        w.address.toLowerCase().includes(q)
    );
  }, [warehouses, searchQuery]);

  if (isLoading) {
    return (
      <div className="h-16 w-full bg-slate-100 animate-pulse rounded-xl border border-slate-200" />
    );
  }

  if (warehouses.length === 0) {
    return null;
  }

  return (
    <div className="relative w-full" ref={dropdownRef}>
      {/* Active Warehouse Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm hover:border-brand-400 hover:shadow-md transition-all text-left focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center text-brand-600 shrink-0">
            <WarehouseIcon className="w-5 h-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-slate-900">
                {selectedWarehouse?.code || 'Select Warehouse'}
              </span>
              {selectedWarehouse && (
                <Badge variant={selectedWarehouse.isActive ? 'success' : 'neutral'} size="sm">
                  {selectedWarehouse.isActive ? 'ACTIVE' : 'INACTIVE'}
                </Badge>
              )}
              <span className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                {isAdmin
                  ? `Organization Facility (${warehouses.length} total)`
                  : `Assigned Facility (${warehouses.length} available)`}
              </span>
            </div>
            <p className="text-xs text-slate-600 truncate mt-0.5">
              {selectedWarehouse
                ? `${selectedWarehouse.name} — ${selectedWarehouse.city}, ${selectedWarehouse.country}`
                : 'Click to choose an active facility'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-medium text-brand-600 hidden sm:inline-block">
            Switch Facility
          </span>
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-brand-600' : ''
            }`}
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Box Header */}
          <div className="p-3 border-b border-slate-100 bg-slate-50/80">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search facility code, name, city..."
                className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
              <span>
                {filteredWarehouses.length} {filteredWarehouses.length === 1 ? 'facility' : 'facilities'}
                {searchQuery ? ` matching "${searchQuery}"` : ' assigned to you'}
              </span>
              <span className="text-[10px] text-slate-400 font-mono">Dynamic multi-warehouse</span>
            </div>
          </div>

          {/* Scrollable Warehouse List (No limit, scrolls smoothly for 2 or 50+ facilities) */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {filteredWarehouses.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                <Building2 className="w-6 h-6 mx-auto text-slate-300 mb-1.5" />
                No matching warehouses found.
              </div>
            ) : (
              filteredWarehouses.map((wh) => {
                const isSelected = wh.id === selectedWarehouseId;
                return (
                  <button
                    key={wh.id}
                    type="button"
                    onClick={() => {
                      onSelectWarehouse(wh.id);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    className={`w-full flex items-center justify-between gap-3 p-3.5 text-left transition-colors group ${
                      isSelected
                        ? 'bg-brand-50/70 hover:bg-brand-50'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          isSelected
                            ? 'bg-brand-600 text-white shadow-sm'
                            : 'bg-slate-100 text-slate-600 group-hover:bg-brand-100 group-hover:text-brand-700'
                        }`}
                      >
                        <WarehouseIcon className="w-4 h-4" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`font-mono text-xs font-bold ${
                              isSelected ? 'text-brand-900' : 'text-slate-900'
                            }`}
                          >
                            {wh.code}
                          </span>
                          <span className="text-xs font-medium text-slate-800 truncate">
                            {wh.name}
                          </span>
                          <Badge variant={wh.isActive ? 'success' : 'neutral'} size="sm">
                            {wh.isActive ? 'ACTIVE' : 'INACTIVE'}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">
                            {wh.address}, {wh.city}, {wh.country}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center pl-2">
                      {isSelected ? (
                        <div className="flex items-center gap-1 text-xs font-semibold text-brand-600">
                          <Check className="w-4 h-4" />
                          <span className="hidden sm:inline">Active</span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 group-hover:text-brand-600 transition-colors">
                          Select
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

