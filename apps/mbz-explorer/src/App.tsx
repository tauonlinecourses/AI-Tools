import { Navigate, Route, Routes } from "react-router-dom";
import { PageLayout } from "@workspace/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { mbzHomePath } from "./paths";

/**
 * MBZ UI (no Router). Mount at hub `/mbz-explorer/*`, or under the same
 * path in the standalone Vite app’s `<BrowserRouter>`.
 */
export default function App() {
  return (
    <PageLayout
      toolName="MBZ Explorer"
      toolDescription="Inspect Moodle .mbz course backups"
      toolNameHe="ניתוח קבצי MBZ"
      toolDescriptionHe="ניתוח והצגת מבנה ותוכן של קורסי מודל באמצעות קבצי MBZ"
      maxWidth="full"
      padded={false}
    >
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="f/:sha1" element={<ExplorerPage />} />
        <Route path="*" element={<Navigate to={mbzHomePath()} replace />} />
      </Routes>
    </PageLayout>
  );
}
