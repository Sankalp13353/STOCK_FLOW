import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Warehouse, CreateWarehouseInput } from '../../types';
import { createWarehouse } from '../../api/warehouses';
import { AlertCircle, Warehouse as WarehouseIcon, MapPin, Building, Globe } from 'lucide-react';

interface WarehouseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (warehouse: Warehouse) => void;
}

export function WarehouseFormModal({
  isOpen,
  onClose,
  onSuccess,
}: WarehouseFormModalProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('United States');
  const [isActive, setIsActive] = useState(true);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function resetForm() {
    setCode('');
    setName('');
    setAddress('');
    setCity('');
    setCountry('United States');
    setIsActive(true);
    setErrors({});
    setApiError(null);
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    const cleanCode = code.trim();
    if (!cleanCode) {
      newErrors.code = 'Warehouse code is required';
    } else if (cleanCode.length < 2) {
      newErrors.code = 'Code must be at least 2 characters';
    } else if (cleanCode.length > 50) {
      newErrors.code = 'Code cannot exceed 50 characters';
    }

    const cleanName = name.trim();
    if (!cleanName) {
      newErrors.name = 'Facility name is required';
    } else if (cleanName.length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    } else if (cleanName.length > 150) {
      newErrors.name = 'Name cannot exceed 150 characters';
    }

    const cleanAddress = address.trim();
    if (!cleanAddress) {
      newErrors.address = 'Street address is required';
    } else if (cleanAddress.length < 5) {
      newErrors.address = 'Address must be at least 5 characters';
    } else if (cleanAddress.length > 255) {
      newErrors.address = 'Address cannot exceed 255 characters';
    }

    const cleanCity = city.trim();
    if (!cleanCity) {
      newErrors.city = 'City is required';
    } else if (cleanCity.length < 2) {
      newErrors.city = 'City must be at least 2 characters';
    } else if (cleanCity.length > 100) {
      newErrors.city = 'City cannot exceed 100 characters';
    }

    const cleanCountry = country.trim();
    if (!cleanCountry) {
      newErrors.country = 'Country is required';
    } else if (cleanCountry.length < 2) {
      newErrors.country = 'Country must be at least 2 characters';
    } else if (cleanCountry.length > 100) {
      newErrors.country = 'Country cannot exceed 100 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setApiError(null);

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      const payload: CreateWarehouseInput = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        address: address.trim(),
        city: city.trim(),
        country: country.trim(),
        isActive,
      };

      const created = await createWarehouse(payload);
      onSuccess(created);
      resetForm();
      onClose();
    } catch (err: any) {
      if (
        err.status === 409 ||
        err.code === 'DUPLICATE_RESOURCE' ||
        err.message?.includes('already exists')
      ) {
        setApiError(`A warehouse with code "${code.trim().toUpperCase()}" already exists.`);
      } else {
        setApiError(err.message || 'Failed to register warehouse facility.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        resetForm();
        onClose();
      }}
      title="Provision New Warehouse Facility"
      subtitle="Register a regional distribution hub or fulfillment fulfillment center."
      maxWidth="md"
      footer={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              resetForm();
              onClose();
            }}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            isLoading={isSubmitting}
          >
            Register Warehouse
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {apiError && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-800">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1 font-medium">{apiError}</div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Facility Code"
            placeholder="e.g. WH-ORD-01"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={errors.code}
            leftIcon={<WarehouseIcon className="w-4 h-4" />}
            required
            autoFocus
          />

          <Input
            label="Facility Name"
            placeholder="e.g. Chicago Central Hub"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            leftIcon={<Building className="w-4 h-4" />}
            required
          />
        </div>

        <Input
          label="Street Address"
          placeholder="e.g. 5500 South Harlem Avenue"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          error={errors.address}
          leftIcon={<MapPin className="w-4 h-4" />}
          required
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="City / Municipality"
            placeholder="e.g. Chicago"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            error={errors.city}
            required
          />

          <Input
            label="Country"
            placeholder="e.g. United States"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            error={errors.country}
            leftIcon={<Globe className="w-4 h-4" />}
            required
          />
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-800">Operational Status</span>
            <p className="text-xs text-slate-500">
              Active facilities accept inbound stock replenishment and dispatch order shipments.
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            <span className="ml-2.5 text-xs font-medium text-slate-700">
              {isActive ? 'Active' : 'Inactive'}
            </span>
          </label>
        </div>
      </form>
    </Modal>
  );
}

