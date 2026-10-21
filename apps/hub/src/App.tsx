import { Navigate, Route, Routes } from "react-router-dom";
import { PlatformAuthProvider } from "@workspace/auth/react";
import { HubPage } from "./components/HubPage";
import { ApprovedOnly } from "./components/ApprovedOnly";
import { MbzExplorerHost } from "./components/MbzExplorerHost";
import { DictionaryToolHost } from "./components/DictionaryToolHost";
import { AdminPage } from "./components/AdminPage";
import { RegisterPage } from "./components/RegisterPage";
import { SetPasswordPage } from "./components/SetPasswordPage";
import { ForgotPasswordPage } from "./components/ForgotPasswordPage";
import { ChangePasswordPage } from "./components/ChangePasswordPage";
import { MBZ_BASE } from "../../mbz-explorer/src/paths";
import { DICTIONARY_BASE } from "../../dictionary-tool/src/paths";

export default function App() {
  return (
    <PlatformAuthProvider>
      <Routes>
        <Route path="/" element={<HubPage locale="he" />} />
        <Route path="/en" element={<HubPage locale="en" />} />
        <Route path="/he" element={<Navigate to="/" replace />} />
        <Route path="/register" element={<RegisterPage locale="he" />} />
        <Route path="/en/register" element={<RegisterPage locale="en" />} />
        <Route
          path="/auth/set-password"
          element={<SetPasswordPage locale="he" />}
        />
        <Route
          path="/en/auth/set-password"
          element={<SetPasswordPage locale="en" />}
        />
        <Route
          path="/auth/forgot-password"
          element={<ForgotPasswordPage locale="he" />}
        />
        <Route
          path="/en/auth/forgot-password"
          element={<ForgotPasswordPage locale="en" />}
        />
        <Route
          path="/auth/change-password"
          element={<ChangePasswordPage locale="he" />}
        />
        <Route
          path="/en/auth/change-password"
          element={<ChangePasswordPage locale="en" />}
        />
        <Route path="/admin" element={<AdminPage locale="he" />} />
        <Route path="/en/admin" element={<AdminPage locale="en" />} />
        <Route
          path={`${MBZ_BASE}/*`}
          element={
            <ApprovedOnly locale="he">
              <MbzExplorerHost locale="he" />
            </ApprovedOnly>
          }
        />
        <Route
          path={`${DICTIONARY_BASE}/*`}
          element={
            <ApprovedOnly locale="he">
              <DictionaryToolHost locale="he" />
            </ApprovedOnly>
          }
        />
      </Routes>
    </PlatformAuthProvider>
  );
}
