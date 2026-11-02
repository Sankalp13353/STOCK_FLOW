import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6">
      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 mb-4">
        <AlertCircle className="w-6 h-6" />
      </div>
      <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Page Not Found</h2>
      <p className="text-sm text-slate-500 max-w-sm mb-6 leading-relaxed">
        The route you are attempting to access does not exist or may have been moved.
      </p>
      <Link to="/dashboard">
        <Button variant="primary" leftIcon={<ArrowLeft className="w-4 h-4" />}>
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}

