import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export function ErrorMessage({
  title = 'An error occurred',
  message,
  onRetry,
  className = '',
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-rose-200 bg-rose-50/60 p-4 text-rose-900 flex items-start gap-3 ${className}`}
    >
      <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-rose-900">{title}</h4>
        {message && <p className="text-xs text-rose-700 mt-1 leading-relaxed">{message}</p>}
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          className="border-rose-300 text-rose-800 hover:bg-rose-100/60 shrink-0"
        >
          Retry
        </Button>
      )}
    </div>
  );
}
