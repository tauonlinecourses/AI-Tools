import { Input } from "@workspace/ui";

export interface AuthSettingsValues {
  threadCount: string;
  useCookies: boolean;
  csrfToken: string;
  jwtHeaderPayload: string;
  jwtSignature: string;
}

interface AuthSettingsProps {
  values: AuthSettingsValues;
  onChange: (patch: Partial<AuthSettingsValues>) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

export function AuthSettings({
  values,
  onChange,
  collapsed,
  onToggleCollapsed,
}: AuthSettingsProps) {
  return (
    <div className="border-b border-surface-200 bg-white px-3 py-2" dir="ltr">
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="flex w-full items-center justify-between gap-2 text-left text-xs font-medium text-surface-700 hover:text-surface-900"
      >
        <span>
          Settings
          {values.useCookies ? " · browser cookies" : " · env login"}
          {` · ${values.threadCount || "3"} threads`}
          {" · forum per course in courses.json"}
        </span>
        <span className="text-surface-400">{collapsed ? "Show" : "Hide"}</span>
      </button>

      {!collapsed ? (
        <div className="mt-3 flex flex-col gap-3 pb-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Threads to load"
              placeholder="3"
              hint="Most recently active (1–20). Each loads full replies. Forum category comes from each course in courses.json."
              value={values.threadCount}
              onChange={(e) => onChange({ threadCount: e.target.value })}
            />
          </div>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={values.useCookies}
              onChange={(e) => onChange({ useCookies: e.target.checked })}
            />
            <span className="text-sm text-surface-800">
              <span className="font-semibold text-surface-900">
                Use browser cookies
              </span>
              <span className="mt-0.5 block text-xs text-surface-500">
                Paste csrftoken + both edx-jwt-cookie-* values from
                courses.campus.gov.il after a manual login.
              </span>
            </span>
          </label>

          {values.useCookies ? (
            <div className="grid gap-3 sm:grid-cols-1">
              <Input
                label="csrftoken"
                type="text"
                placeholder="Paste csrftoken cookie value"
                value={values.csrfToken}
                onChange={(e) => onChange({ csrfToken: e.target.value })}
                autoComplete="off"
              />
              <Input
                label="edx-jwt-cookie-header-payload"
                type="text"
                placeholder="Paste edx-jwt-cookie-header-payload value"
                value={values.jwtHeaderPayload}
                onChange={(e) => onChange({ jwtHeaderPayload: e.target.value })}
                autoComplete="off"
              />
              <Input
                label="edx-jwt-cookie-signature"
                type="text"
                placeholder="Paste edx-jwt-cookie-signature value"
                value={values.jwtSignature}
                onChange={(e) => onChange({ jwtSignature: e.target.value })}
                autoComplete="off"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
