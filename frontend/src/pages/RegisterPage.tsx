import { RegisterForm } from '../features/auth/RegisterForm';

export function RegisterPage() {
  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900 tracking-tight">Create a new account</h3>
        <p className="text-xs text-slate-500 mt-1">
          Register operator details to manage warehouse inventory and orders.
        </p>
      </div>

      <RegisterForm />
    </div>
  );
}

