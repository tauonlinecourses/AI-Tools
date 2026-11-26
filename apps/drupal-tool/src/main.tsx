import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@workspace/ui/styles";
import { ToolAuthGate } from "@workspace/auth/ToolAuthGate";
import { ErrorBoundary } from "@workspace/ui";
import App from "./App";
import { DRUPAL_BASE, drupalHomePath } from "./paths";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToolAuthGate toolId="drupal-tool">
        <BrowserRouter>
          <Routes>
            <Route path={`${DRUPAL_BASE}/*`} element={<App />} />
            <Route path="*" element={<Navigate to={drupalHomePath()} replace />} />
          </Routes>
        </BrowserRouter>
      </ToolAuthGate>
    </ErrorBoundary>
  </React.StrictMode>
);
