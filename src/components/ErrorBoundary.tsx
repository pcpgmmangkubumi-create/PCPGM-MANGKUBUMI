import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Terjadi kesalahan pada aplikasi.' };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message);
        if (parsed?.error) {
          friendly = `${parsed.error} (${parsed.operationType || ''} ${parsed.path || ''})`;
        }
      } catch {
        // Not JSON
      }
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Terjadi Gangguan Sistem
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-300 break-words">
              {friendly}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-700 text-white hover:bg-blue-800 transition-colors"
            >
              Muat Ulang Aplikasi
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
