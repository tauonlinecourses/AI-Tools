import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@workspace/ui/styles";
import { ToolAuthGate } from "@workspace/auth/ToolAuthGate";
import App from "./App";
import { DICTIONARY_BASE, dictionaryHomePath } from "./paths";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToolAuthGate toolId="dictionary-tool">
      <BrowserRouter>
        <Routes>
          <Route path={`${DICTIONARY_BASE}/*`} element={<App />} />
          <Route path="*" element={<Navigate to={dictionaryHomePath()} replace />} />
        </Routes>
      </BrowserRouter>
    </ToolAuthGate>
  </React.StrictMode>
);
