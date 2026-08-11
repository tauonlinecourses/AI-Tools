import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { PageLayout } from "@workspace/ui";
import { DashboardPage } from "./pages/DashboardPage";
import { ExplorerPage } from "./pages/ExplorerPage";

export default function App() {
  return (
    <BrowserRouter>
      <PageLayout
        toolName="MBZ Explorer"
        toolDescription="Inspect Moodle .mbz course backups"
        maxWidth="full"
        padded={false}
      >
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/f/:sha1" element={<ExplorerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </PageLayout>
    </BrowserRouter>
  );
}
