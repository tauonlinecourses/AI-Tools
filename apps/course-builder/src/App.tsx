import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { CoursesPage } from "./pages/CoursesPage.tsx";
import { CourseShell } from "./components/CourseShell.tsx";
import { SaveStatusProvider } from "./lib/saveStatus";

function CourseRedirect() {
  const { courseId } = useParams();
  return <Navigate to={`/courses/${courseId}/edit`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <SaveStatusProvider>
        <Routes>
          <Route path="/" element={<CoursesPage />} />
          <Route path="/courses/:courseId" element={<CourseRedirect />} />
          <Route path="/courses/:courseId/edit" element={<CourseShell editable />} />
          <Route path="/courses/:courseId/review" element={<CourseShell editable={false} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SaveStatusProvider>
    </BrowserRouter>
  );
}
