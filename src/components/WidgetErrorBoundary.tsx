import { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Lightweight error boundary for individual dashboard widgets/cards.
 * Shows a subtle inline error instead of crashing the entire screen.
 */
export default class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-3 bg-destructive/5 border border-destructive/15 rounded-2xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-destructive/60 flex-shrink-0" aria-hidden="true" />
          <p className="text-xs text-foreground/40 flex-1">
            {this.props.name ? `${this.props.name} failed to load` : 'Widget failed to load'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="flex items-center gap-1.5 text-[10px] font-bold text-primary/70 hover:text-primary bg-primary/5 border border-primary/15 px-3 py-1.5 rounded-lg transition-all active:scale-95"
            aria-label="Retry loading widget"
          >
            <RefreshCw className="w-3 h-3" aria-hidden="true" /> Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
