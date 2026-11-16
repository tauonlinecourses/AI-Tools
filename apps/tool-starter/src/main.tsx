import React from "react";
import ReactDOM from "react-dom/client";
import "@workspace/ui/styles";
import { ToolAuthGate } from "@workspace/auth/ToolAuthGate";
import App from "./App";
import { ErrorBoundary } from "@workspace/ui";

// Replace `your-tool-id` with the same id used in apps/hub/src/tools.config.ts
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToolAuthGate toolId="your-tool-id">
        <App />
      </ToolAuthGate>
    </ErrorBoundary>
  </React.StrictMode>
);
