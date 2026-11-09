import { lazy, Suspense } from "react";
import { Spinner } from "@workspace/ui";

// Keeps the chart libraries out of the main bundle.
const QuestionsDashboard = lazy(() =>
  import("./QuestionsDashboard").then((m) => ({
    default: m.QuestionsDashboard,
  }))
);

export function QuestionsDashboardLazy() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Spinner />
        </div>
      }
    >
      <QuestionsDashboard />
    </Suspense>
  );
}
