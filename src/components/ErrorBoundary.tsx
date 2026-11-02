import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, Copy, CheckCircle2 } from 'lucide-react';

interface Props {
  children: ReactNode;
  /** Screen name for error reporting */
  screenName?: string;
  /** Fallback action — e.g. navigate home */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  copied: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, copied: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[ErrorBoundary] ${this.props.screenName || 'Unknown'} crashed:`, error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, copied: false });
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null, copied: false });
    this.props.onReset?.();
  };

  handleCopyError = () => {
    const text = `Screen: ${this.props.screenName || 'Unknown'}\nError: ${this.state.error?.message || 'Unknown'}\nStack: ${this.state.error?.stack?.slice(0, 500) || 'N/A'}`;
    navigator.clipboard.writeText(text).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    }).catch(() => {});
  };

  render() {
    if (this.state.hasError) {
      const errMsg = this.state.error?.message?.slice(0, 150) || 'Unknown error';
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center mb-5">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-lg font-black text-foreground mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-foreground/50 max-w-sm mb-1 leading-relaxed">
            {this.props.screenName
              ? `The ${this.props.screenName} screen encountered an error.`
              : 'An unexpected error occurred.'}
          </p>
          <p className="text-xs text-foreground/25 max-w-sm mb-2 leading-relaxed">
            Don&apos;t worry — your data is safe. Try refreshing or go back home.
          </p>

          {/* Error message — collapsible detail */}
          <button
            onClick={this.handleCopyError}
            className="flex items-center gap-1.5 text-[10px] text-foreground/20 hover:text-foreground/40 font-mono max-w-sm mb-6 px-3 py-2 rounded-xl bg-foreground/[0.03] border border-foreground/[0.06] transition-colors break-all text-left leading-relaxed"
            title="Copy error details"
          >
            {this.state.copied
              ? <><CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" /> Copied!</>
              : <><Copy className="w-3 h-3 flex-shrink-0" /> {errMsg}</>
            }
          </button>

          <div className="flex gap-3">
            <button
              onClick={this.handleReload}
              className="flex items-center gap-2 bg-card border border-border hover:border-primary/30 text-foreground text-sm font-bold px-5 py-3 rounded-2xl transition-all active:scale-[0.97]"
              aria-label="Try again"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
            {this.props.onReset && (
              <button
                onClick={this.handleGoHome}
                className="flex items-center gap-2 bg-primary text-primary-foreground text-sm font-bold px-5 py-3 rounded-2xl shadow-lg shadow-primary/25 transition-all active:scale-[0.97]"
                aria-label="Go to home screen"
              >
                <Home className="w-4 h-4" />
                Go Home
              </button>
            )}
          </div>

          {/* Quick tips */}
          <div className="mt-6 max-w-xs space-y-1.5">
            <p className="text-[10px] text-foreground/25 font-bold uppercase tracking-widest">Troubleshooting</p>
            <p className="text-[10px] text-foreground/15 leading-relaxed">
              💡 Clear your browser cache or sign out and back in.
            </p>
            <p className="text-[10px] text-foreground/15 leading-relaxed">
              🔄 If the error persists, try a different browser or device.
            </p>
            <p className="text-[10px] text-foreground/15 leading-relaxed">
              📱 On mobile, close and reopen the app to reset.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
