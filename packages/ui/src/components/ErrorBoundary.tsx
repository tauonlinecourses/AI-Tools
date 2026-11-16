import React from "react";
import { Button } from "./Button";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Last-resort catch for render errors, so a crash shows a message and a
 * reload button instead of a blank page. Wrap each app's root with it.
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        role="alert"
        className="min-h-screen flex items-center justify-center bg-white p-6"
      >
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-lg font-semibold text-gray-900" dir="rtl">
            משהו השתבש
          </h1>
          <p className="text-sm text-gray-600" dir="rtl">
            אירעה שגיאה לא צפויה. טעינה מחדש של הדף בדרך כלל פותרת את הבעיה.
          </p>
          <p className="text-sm text-gray-600" dir="ltr">
            Something went wrong. Reloading the page usually fixes it.
          </p>
          <Button onClick={() => window.location.reload()}>
            טעינה מחדש · Reload
          </Button>
        </div>
      </div>
    );
  }
}
