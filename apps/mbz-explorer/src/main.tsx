import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import "@workspace/ui/styles";
import { ToolAuthGate } from "@workspace/auth/ToolAuthGate";
import "./mbz.css";
import App from "./App";
import { MBZ_BASE, mbzHomePath } from "./paths";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToolAuthGate toolId="mbz-explorer">
      <BrowserRouter>
        <Routes>
          <Route path={`${MBZ_BASE}/*`} element={<App />} />
          <Route path="*" element={<Navigate to={mbzHomePath()} replace />} />
        </Routes>
      </BrowserRouter>
    </ToolAuthGate>
  </React.StrictMode>
);
