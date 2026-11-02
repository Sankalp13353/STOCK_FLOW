import { Loader2 } from 'lucide-react';

export function LoadingSpinner({
  size = 'md',
  message,
}: {
  size?: 'sm' | 'md' | 'lg' | 'screen';
  message?: string;
}) {
  if (size === 'screen') {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center p-8 text-slate-500">
        <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-3" />
        {message && <p className="text-sm font-medium text-slate-600">{message}</p>}
      </div>
    );
  }

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <div className="flex items-center gap-2 text-slate-500">
      <Loader2 className={`${sizeClasses[size]} animate-spin text-brand-600`} />
      {message && <span className="text-sm">{message}</span>}
    </div>
  );
}

