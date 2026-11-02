import { LoginForm } from '../features/auth/LoginForm';

export function LoginPage() {
  return (
    <div>
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900 tracking-tight">Sign in to your account</h3>
        <p className="text-xs text-slate-500 mt-1">
          Enter your operator credentials to access the inventory system.
        </p>
      </div>

      <LoginForm />
    </div>
  );
}

