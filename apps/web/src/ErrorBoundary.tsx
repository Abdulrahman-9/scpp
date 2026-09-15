import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Root error boundary — the last surface between a render crash and a white screen.
 *
 * DELIBERATE i18n EXCEPTION. Every other string in this app comes from i18next; these two do
 * not, and they are the only such strings. This component exists precisely for the case where
 * rendering failed, and i18next is consumed through a React hook from inside the tree that
 * just died: a crash in `./i18n`, a bundle that never loaded, or a provider that never
 * mounted would make `t()` throw again and turn the fallback itself into a second white
 * screen. So both languages are written out literally, Arabic first with its English mirror —
 * exactly the pair the app shows everywhere else, just resolved at author time instead of run
 * time. Do not "fix" this by reaching for `t()`.
 */

interface BoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  override state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // There is no telemetry endpoint — the console is the only honest destination.
    console.error('Masaar render crash', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="op-page op-page--reports" dir="rtl">
        <div className="op-empty">
          <p style={{ margin: 0 }}>تعذّر عرض هذه الشاشة. لم يُفقد أي إجراء مسجَّل — أعِد تحميل الصفحة للمتابعة.</p>
          <p dir="ltr" style={{ margin: 0, marginBlockStart: 6 }}>
            This screen could not be displayed. No recorded action was lost — reload the page to continue.
          </p>
          {/* the raw message is a diagnostic datum, not prose: mono LTR island, like every code */}
          <p className="op-code" style={{ marginBlockStart: 10, fontSize: 12 }}>{error.message}</p>
          <div style={{ marginBlockStart: 14 }}>
            <button className="op-btn-primary" onClick={() => window.location.reload()}>
              إعادة تحميل الصفحة · Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
