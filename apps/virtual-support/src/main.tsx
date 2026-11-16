import React from "react";
import ReactDOM from "react-dom/client";
import "@workspace/ui/styles";
import { ToolAuthGate } from "@workspace/auth/ToolAuthGate";
import App from "./App";
import { ErrorBoundary } from "@workspace/ui";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToolAuthGate toolId="virtual-support">
        <App />
      </ToolAuthGate>
    </ErrorBoundary>
  </React.StrictMode>
);
