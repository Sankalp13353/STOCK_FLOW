import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/test-utils';
import { UserFormModal } from '../features/users/UserFormModal';
import { WarehouseAssignmentModal } from '../features/users/WarehouseAssignmentModal';
import { UserItem } from '../types/users';

vi.mock('../api/warehouses', () => ({
  fetchWarehouses: vi.fn().mockResolvedValue([
    { id: 'wh-1', code: 'WH-DAL-01', name: 'Dallas Logistics Hub', isActive: true },
    { id: 'wh-2', code: 'WH-HOU-02', name: 'Houston Metro Facility', isActive: true },
  ]),
}));

const mockCreateUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockSyncUserWarehouses = vi.fn();

vi.mock('../api/users', () => ({
  createUser: (...args: any[]) => mockCreateUser(...args),
  updateUser: (...args: any[]) => mockUpdateUser(...args),
  syncUserWarehouses: (...args: any[]) => mockSyncUserWarehouses(...args),
  fetchUserWarehouses: vi.fn().mockResolvedValue([]),
  fetchWarehouseTeam: vi.fn().mockResolvedValue({ managers: [], staff: [] }),
}));

describe('Frontend — User Administration & Warehouse Assignment Modals', () => {
  it('renders user creation form and disallows standard ADMIN role provisioning', () => {
    renderWithProviders(
      <UserFormModal isOpen={true} onClose={vi.fn()} />
    );

    expect(screen.getByText('Create Internal Organization User')).toBeInTheDocument();
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/temporary password/i)).toBeInTheDocument();

    // Verify Admin CLI advisory notice
    expect(
      screen.getByText(/admin accounts cannot be provisioned via form; use cli/i)
    ).toBeInTheDocument();

    // Verify ADMIN is not present as a selectable option during creation
    const options = screen.getAllByRole('option').map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain('WAREHOUSE_MANAGER');
    expect(options).toContain('WAREHOUSE_STAFF');
    expect(options).toContain('CUSTOMER');
    expect(options).not.toContain('ADMIN');
  });

  it('validates password length and format before submission', async () => {
    renderWithProviders(
      <UserFormModal isOpen={true} onClose={vi.fn()} />
    );

    const nameInput = screen.getByLabelText(/full name/i);
    const emailInput = screen.getByLabelText(/email address/i);
    const passInput = screen.getByLabelText(/temporary password/i);
    const submitBtn = screen.getByRole('button', { name: /create user/i });

    fireEvent.change(nameInput, { target: { value: 'Alex Morgan' } });
    fireEvent.change(emailInput, { target: { value: 'alex@stockflow.dev' } });
    fireEvent.change(passInput, { target: { value: 'short' } }); // < 8 chars
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/password must be at least 8 characters long/i)).toBeInTheDocument();
    });
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it('submits valid user creation payload with warehouse assignments', async () => {
    mockCreateUser.mockResolvedValueOnce({
      id: 'new-user-1',
      email: 'alex@stockflow.dev',
      fullName: 'Alex Morgan',
      role: 'WAREHOUSE_STAFF',
      isActive: true,
    });

    const onSuccess = vi.fn();
    renderWithProviders(
      <UserFormModal isOpen={true} onClose={vi.fn()} onSuccess={onSuccess} />
    );

    fireEvent.change(screen.getByLabelText(/full name/i), {
      target: { value: 'Alex Morgan' },
    });
    fireEvent.change(screen.getByLabelText(/email address/i), {
      target: { value: 'alex@stockflow.dev' },
    });
    fireEvent.change(screen.getByLabelText(/temporary password/i), {
      target: { value: 'SecurePass123!' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(mockCreateUser).toHaveBeenCalledWith({
        fullName: 'Alex Morgan',
        email: 'alex@stockflow.dev',
        password: 'SecurePass123!',
        role: 'WAREHOUSE_STAFF',
        warehouseIds: [],
      });
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it('renders WarehouseAssignmentModal for user facility multi-selection', async () => {
    const mockUser: UserItem = {
      id: 'usr-1',
      email: 'operator@stockflow.dev',
      fullName: 'Facility Operator',
      role: 'WAREHOUSE_STAFF',
      isActive: true,
      warehouseAssignments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    renderWithProviders(
      <WarehouseAssignmentModal
        isOpen={true}
        onClose={vi.fn()}
        user={mockUser}
      />
    );

    expect(screen.getByText(/Facility Assignments: Facility Operator/i)).toBeInTheDocument();
    expect(screen.getByText(/Select all warehouses where this WAREHOUSE_STAFF is authorized to operate/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/WH-DAL-01/i)).toBeInTheDocument();
      expect(screen.getByText(/WH-HOU-02/i)).toBeInTheDocument();
    });
  });
});
