import { Navigate, Route, Routes } from "react-router-dom";
import { PageLayout } from "@workspace/ui";
import { HomePage } from "./pages/HomePage";
import { dictionaryHomePath } from "./paths";

/**
 * Dictionary Tool UI (no Router). Mount at hub `/dictionary-tool/*`, or under
 * the same path in the standalone Vite app’s `<BrowserRouter>`.
 */
export default function App() {
  return (
    <PageLayout
      toolName="Dictionary Tool"
      toolDescription="Convert Excel glossaries to Moodle XML"
      toolNameHe="מילון מונחים"
      toolDescriptionHe="המרת קובץ אקסל של מושגים לקובץ XML לייבוא למודל"
      maxWidth="full"
      padded={false}
    >
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="*" element={<Navigate to={dictionaryHomePath()} replace />} />
      </Routes>
    </PageLayout>
  );
}
