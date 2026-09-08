import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@workspace/ui/styles";
import App from "./App";
import { AppLogin } from "./components/AppLogin";
import { isAppUnlocked } from "./lib/appAuth";

function Root() {
  const [unlocked, setUnlocked] = useState(() => isAppUnlocked());

  if (!unlocked) {
    return <AppLogin onSuccess={() => setUnlocked(true)} />;
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
