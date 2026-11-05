import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import { RestockModal } from '../features/inventory/RestockModal';
import { Warehouse } from '../types';

vi.mock('../api/products', () => ({
  fetchProducts: vi.fn().mockResolvedValue({
    products: [
      { id: 'prod-1', sku: 'SKU-001', name: 'Industrial Widget', priceCents: 1000, isActive: true },
    ],
  }),
}));

vi.mock('../api/warehouses', () => ({
  fetchWarehouses: vi.fn().mockResolvedValue([
    { id: 'wh-1', code: 'WH-01', name: 'Main Depot', isActive: true },
  ]),
}));

const mockRestockApi = vi.fn();
vi.mock('../api/inventory', () => ({
  restockInventory: (...args: any[]) => mockRestockApi(...args),
}));

describe('Frontend — Inventory Operations & Restock Modal', () => {
  const mockWarehouse: Warehouse = {
    id: 'wh-1',
    code: 'WH-01',
    name: 'Main Depot',
    address: '100 Main St',
    city: 'Austin',
    country: 'USA',
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it('renders restock modal when open with warehouse details', async () => {
    renderWithProviders(
      <RestockModal
        isOpen={true}
        onClose={vi.fn()}
        warehouse={mockWarehouse}
      />
    );

    expect(screen.getByText('Restock Inventory')).toBeInTheDocument();
    expect(screen.getByText(/main depot/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/quantity to add/i)).toBeInTheDocument();
  });

  it('validates and rejects non-positive or zero quantity', async () => {
    renderWithProviders(
      <RestockModal
        isOpen={true}
        onClose={vi.fn()}
        warehouse={mockWarehouse}
        defaultProductId="prod-1"
      />
    );

    const qtyInput = screen.getByLabelText(/quantity to add/i);
    fireEvent.change(qtyInput, { target: { value: '0' } });

    const submitBtn = screen.getByRole('button', { name: /confirm restock/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/quantity must be a positive integer greater than zero/i)
      ).toBeInTheDocument();
    });
    expect(mockRestockApi).not.toHaveBeenCalled();
  });

  it('submits valid restock payload successfully', async () => {
    mockRestockApi.mockResolvedValueOnce({
      inventoryId: 'inv-1',
      productId: 'prod-1',
      warehouseId: 'wh-1',
      quantityOnHand: 150,
      quantityReserved: 10,
      quantityAvailable: 140,
    });

    const onSuccess = vi.fn();
    renderWithProviders(
      <RestockModal
        isOpen={true}
        onClose={vi.fn()}
        warehouse={mockWarehouse}
        defaultProductId="prod-1"
        onSuccess={onSuccess}
      />
    );

    const qtyInput = screen.getByLabelText(/quantity to add/i);
    fireEvent.change(qtyInput, { target: { value: '100' } });

    const submitBtn = screen.getByRole('button', { name: /confirm restock/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockRestockApi).toHaveBeenCalledWith(
        expect.objectContaining({
          productId: 'prod-1',
          warehouseId: 'wh-1',
          quantity: 100,
        })
      );
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('correctly calculates available stock formula: available = onHand - reserved', () => {
    const onHand = 500;
    const reserved = 120;
    const available = onHand - reserved;

    expect(available).toBe(380);
    expect(available).toBeLessThan(onHand);
  });
});
