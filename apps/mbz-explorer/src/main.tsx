import React from "react";
import ReactDOM from "react-dom/client";
import "@workspace/ui/styles";
import { ToolAuthGate } from "@workspace/auth/ToolAuthGate";
import "./mbz.css";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ToolAuthGate toolId="mbz-explorer">
      <App />
    </ToolAuthGate>
  </React.StrictMode>
);
