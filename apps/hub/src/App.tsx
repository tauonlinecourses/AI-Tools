import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { Badge, persistHubLocale, Spinner } from "@workspace/ui";
import { PlatformAuthProvider, usePlatformAuth } from "@workspace/auth/react";
import { listAllowedToolIds, startToolHandoff } from "@workspace/auth/client";
import {
  tools,
  toolHref,
  toolIsOpenable,
  findToolForReturnUrl,
} from "./tools.config";
import type { Tool } from "./tools.config";
import {
  ui,
  localizeTool,
  type Locale,
} from "./i18n";
import { LoginPage } from "./components/LoginPage";
import { SoftPageBg } from "./components/SoftPageBg";
import { MbzExplorerHost } from "./components/MbzExplorerHost";
import { DictionaryToolHost } from "./components/DictionaryToolHost";
import { AdminPage } from "./components/AdminPage";
import { AccountStatusPage } from "./components/AccountStatusPage";
import { RegisterPage } from "./components/RegisterPage";
import { SetPasswordPage } from "./components/SetPasswordPage";
import { ForgotPasswordPage } from "./components/ForgotPasswordPage";
import { ChangePasswordPage } from "./components/ChangePasswordPage";
import { fetchPublicGroups, type PublicGroup } from "./lib/registerApi";
import { MBZ_BASE } from "../../mbz-explorer/src/paths";
import { DICTIONARY_BASE } from "../../dictionary-tool/src/paths";

/** Temporarily hide the Hebrew/English header switcher. `/en` route still works. */
const SHOW_LANG_SWITCHER = false;

/** Survive React StrictMode double-mount so tool returnUrl handoff runs once. */
const processedReturnUrls = new Set<string>();

function UserMenu({
  locale,
  email,
  groupNames,
  onSignOut,
}: {
  locale: Locale;
  email?: string | null;
  groupNames: string[];
  onSignOut: () => void;
}) {
  const changePasswordHref =
    locale === "en" ? "/en/auth/change-password" : "/auth/change-password";
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const groupsInline =
    groupNames.length > 0
      ? groupNames.join(", ")
      : locale === "he"
        ? "אין צוותים"
        : "No teams";

  return (
    <div className="relative" ref={rootRef} dir="ltr">
      <button
        type="button"
        aria-label={locale === "he" ? "תפריט משתמש" : "User menu"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-3 rounded-control px-2.5 py-1.5 text-start transition-colors duration-fast hover:bg-surface-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-400"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-200 text-surface-500">
          <svg
            viewBox="0 0 24 24"
            className="h-6 w-6"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="12" cy="8" r="3.5" />
            <path d="M4.5 19.5c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" />
          </svg>
        </span>

        {/* Width follows the email; multi-group names truncate to that same width. */}
        <span className="w-fit max-w-[14rem] min-w-0 sm:max-w-[18rem]">
          {email && (
            <span className="block whitespace-nowrap text-sm font-medium text-surface-800">
              {email}
            </span>
          )}
          <span
            className="block truncate text-xs text-surface-500"
            title={groupsInline}
          >
            {groupsInline}
          </span>
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute start-0 top-full z-30 mt-2 min-w-[12rem] max-w-[18rem] rounded-lg border border-surface-200 bg-white p-1 shadow-[0_4px_6px_-4px_rgba(0,0,0,0.28)]"
        >
          {email && (
            <div className="truncate px-3 py-2 text-xs text-surface-500">
              {email}
            </div>
          )}
          <div className="border-t border-surface-100 px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-surface-400">
              {locale === "he" ? "צוותים" : "Teams"}
            </p>
            {groupNames.length > 0 ? (
              <ul className="mt-1 space-y-0.5">
                {groupNames.map((name) => (
                  <li key={name} className="break-words text-xs text-surface-700">
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-surface-400">
                {locale === "he" ? "אין צוותים" : "No teams"}
              </p>
            )}
          </div>
          <Link
            role="menuitem"
            to={changePasswordHref}
            onClick={() => setOpen(false)}
            className="block w-full rounded-control px-3 py-2 text-start text-xs font-semibold text-surface-700 transition-colors duration-fast hover:bg-surface-50"
          >
            {locale === "he" ? "שינוי סיסמה" : "Change password"}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
            className="w-full rounded-control px-3 py-2 text-start text-xs font-semibold text-red-600 transition-colors duration-fast hover:bg-red-50"
          >
            {locale === "he" ? "התנתקות" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

const iconPaths: Record<string, string | string[]> = {
  bolt:   "M13 10V3L4 14h7v7l9-11h-7z",
  film:   "M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z",
  book:   "M4 19.5A2.5 2.5 0 016.5 17H20M4 19.5A2.5 2.5 0 016.5 22H20V2H6.5A2.5 2.5 0 004 4.5v15z",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  zip:    "M8 3h6l5 5v11a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zm5 1.5V9h4.5M11 7h2M11 10h2M11 13h2M11 16h2",
  "page-question": [
    "M15 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7z",
    "M9.1 9a3 3 0 015.82 1c0 2-3 3-3 3",
    "M12 17h.01",
  ],
};

function ToolIcon({ name }: { name: string }) {
  const paths = iconPaths[name] ?? iconPaths.bolt;
  const dList = Array.isArray(paths) ? paths : [paths];
  return (
    <svg
      className="w-6 h-6 text-surface-900"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      {dList.map((d) => (
        <path key={d} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={d} />
      ))}
    </svg>
  );
}

function ToolCard({
  tool,
  locale,
  allowed,
}: {
  tool: Tool;
  locale: Locale;
  allowed: boolean;
}) {
  const navigate = useNavigate();
  const isComingSoon = tool.status === "coming-soon";
  const isAllowed = allowed;
  const isClickable = toolIsOpenable(tool) && isAllowed;
  const copy = localizeTool(locale, tool);
  const t = ui[locale];
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deniedTooltip = !isComingSoon && !isAllowed ? t.noPermission : undefined;

  async function openTool() {
    if (!isClickable || opening) return;
    setError(null);
    setOpening(true);
    try {
      // Hub-hosted tools share PlatformAuth — navigate in-app, no handoff.
      if (tool.hubPath) {
        navigate(tool.hubPath);
        return;
      }
      const href = toolHref(tool);
      const origin = new URL(href).origin;
      const handoffUrl =
        import.meta.env.DEV
          ? "/api/auth-handoff"
          : `${window.location.origin}/api/auth-handoff`;
      const target = await startToolHandoff({
        toolId: tool.id,
        toolOrigin: origin,
        hubHandoffUrl: handoffUrl,
      });
      window.location.href = target;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open tool");
      setOpening(false);
    }
  }

  return (
    <div
      className={[
        "group relative bg-white border border-surface-200 p-5",
        "flex flex-col gap-3",
        "transition-colors duration-fast",
        isClickable
          ? "hover:bg-surface-50 hover:border-surface-900 cursor-pointer"
          : "opacity-60 cursor-not-allowed",
      ].join(" ")}
      title={deniedTooltip}
      aria-disabled={!isClickable}
      aria-label={
        deniedTooltip ? `${copy.name}. ${deniedTooltip}` : undefined
      }
      onClick={() => void openTool()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void openTool();
        }
      }}
      role={isClickable ? "link" : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-lg font-semibold text-surface-900 truncate">
            {copy.name}
          </h3>
          {isComingSoon && (
            <Badge variant="default" size="sm">{t.comingSoon}</Badge>
          )}
          {opening && <Spinner size="sm" />}
        </div>
        <ToolIcon name={tool.icon} />
      </div>
      <p className="text-sm text-surface-500 leading-relaxed">
        {copy.description}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

function HubPage({ locale }: { locale: Locale }) {
  const t = ui[locale];
  const navigate = useNavigate();
  const {
    loading,
    session,
    allowedToolIds,
    groups,
    isAdmin,
    signOut,
    user,
    accountStatus,
  } = usePlatformAuth();
  const [activeGroupId, setActiveGroupId] = useState<string>("All");
  const [publicGroups, setPublicGroups] = useState<PublicGroup[]>([]);
  const adminHref = locale === "en" ? "/en/admin" : "/admin";

  useEffect(() => {
    document.documentElement.lang = t.htmlLang;
    document.documentElement.dir = t.dir;
    document.title = t.title;
    persistHubLocale(locale);
  }, [t, locale]);

  useEffect(() => {
    if (loading || !session) return;
    if (accountStatus && accountStatus !== "approved") return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await fetchPublicGroups();
        if (!cancelled) setPublicGroups(next);
      } catch {
        if (!cancelled) setPublicGroups([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, session, accountStatus]);

  useEffect(() => {
    if (loading || !session) return;
    if (accountStatus && accountStatus !== "approved") return;
    const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get("returnUrl");
    if (!returnUrl || processedReturnUrls.has(returnUrl)) return;
    processedReturnUrls.add(returnUrl);

    // Clear so refresh does not re-trigger.
    params.delete("returnUrl");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);

    const tool = findToolForReturnUrl(returnUrl);
    if (!tool || !toolIsOpenable(tool)) {
      // Unknown or unopenable URL → stay on hub.
      return;
    }

    void (async () => {
      // Fresh entitlement check avoids racing PlatformAuthProvider membership state.
      let ids: string[];
      try {
        ids = await listAllowedToolIds();
      } catch {
        return;
      }
      if (!ids.includes(tool.id)) {
        // Signed in but no entitlement for this tool → stay on hub catalog.
        return;
      }

      if (tool.hubPath) {
        navigate(tool.hubPath);
        return;
      }

      try {
        const href = toolHref(tool);
        const origin = new URL(href).origin;
        const handoffUrl =
          import.meta.env.DEV
            ? "/api/auth-handoff"
            : `${window.location.origin}/api/auth-handoff`;
        const target = await startToolHandoff({
          toolId: tool.id,
          toolOrigin: origin,
          hubHandoffUrl: handoffUrl,
        });
        window.location.href = target;
      } catch {
        // Stay on hub if handoff fails; user can open the tool from the catalog.
      }
    })();
  }, [loading, session, accountStatus, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }

  if (!session) {
    return <LoginPage locale={locale} />;
  }

  if (accountStatus === "pending" || accountStatus === "rejected") {
    return <AccountStatusPage locale={locale} status={accountStatus} />;
  }

  // Always list every tool; unauthorized cards are shown disabled with a tooltip.
  // Available (openable + allowed) tools first; preserve catalog order within each bucket.
  const activeGroupToolIds =
    activeGroupId === "All"
      ? null
      : (publicGroups.find((g) => g.id === activeGroupId)?.toolIds ?? []);
  const filteredTools = (
    activeGroupToolIds === null
      ? tools
      : tools.filter((tool) => activeGroupToolIds.includes(tool.id))
  )
    .map((tool, index) => ({ tool, index }))
    .sort((a, b) => {
      const aAvail =
        toolIsOpenable(a.tool) && allowedToolIds.includes(a.tool.id) ? 0 : 1;
      const bAvail =
        toolIsOpenable(b.tool) && allowedToolIds.includes(b.tool.id) ? 0 : 1;
      return aAvail - bAvail || a.index - b.index;
    })
    .map(({ tool }) => tool);

  return (
    <div className="relative min-h-screen bg-white" dir={t.dir} lang={t.htmlLang}>
      <SoftPageBg />

      <div className="relative z-10">
        <div className="relative z-20 border-b border-surface-200/80 bg-white/55 backdrop-blur-[2px]">
          <div className="max-w-screen-xl mx-auto px-6 py-8">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4 min-w-0">
                <Link to={locale === "en" ? "/en" : "/"} className="shrink-0">
                  <img
                    src="/logo-heb.png"
                    alt="Feynman"
                    className="h-16 w-auto"
                  />
                </Link>
                <div className="min-w-0">
                  <h1 className="text-3xl font-semibold tracking-tight text-surface-900 font-display">
                    {t.title}
                  </h1>
                  <p className="text-surface-600 mt-1 text-sm">
                    {t.subtitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0" dir="ltr">
                <UserMenu
                  locale={locale}
                  email={user?.email}
                  groupNames={groups.map((g) => g.name)}
                  onSignOut={() => void signOut()}
                />
                {isAdmin && (
                  <Link
                    to={adminHref}
                    aria-label={locale === "he" ? "ניהול משתמשים" : "User admin"}
                    title={locale === "he" ? "ניהול משתמשים" : "User admin"}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-surface-200 bg-white text-surface-700 transition-colors duration-fast hover:bg-surface-50 hover:text-surface-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface-400"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.75}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 15.5a3.5 3.5 0 100-7 3.5 3.5 0 000 7z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9c.2.6.7 1 1.4 1.1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"
                      />
                    </svg>
                  </Link>
                )}
                {SHOW_LANG_SWITCHER && (
                  <Link
                    to={t.langHref}
                    className="px-3 py-1.5 text-xs font-semibold rounded-control border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors duration-fast"
                  >
                    {t.langLabel}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 border-b border-surface-200/80 bg-white/40 backdrop-blur-[2px]">
          <div className="max-w-screen-xl mx-auto px-6">
            <div className="flex gap-1 overflow-x-auto py-2">
              <button
                type="button"
                onClick={() => setActiveGroupId("All")}
                className={[
                  "px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-fast rounded-control",
                  activeGroupId === "All"
                    ? "bg-black text-white"
                    : "bg-white/90 text-gray-700 border border-gray-200 hover:bg-gray-50",
                ].join(" ")}
              >
                {t.all}
              </button>
              {publicGroups.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => setActiveGroupId(group.id)}
                  className={[
                    "px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors duration-fast rounded-control",
                    activeGroupId === group.id
                      ? "bg-black text-white"
                      : "bg-white/90 text-gray-700 border border-gray-200 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {group.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="max-w-screen-xl mx-auto px-6 py-8">
          {filteredTools.length === 0 ? (
            <p className="text-surface-500 text-sm">{t.empty}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredTools.map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  locale={locale}
                  allowed={allowedToolIds.includes(tool.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApprovedOnly({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { loading, session, accountStatus } = usePlatformAuth();
  const homeHref = locale === "en" ? "/en" : "/";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Spinner />
      </div>
    );
  }
  if (!session) {
    return <Navigate to={homeHref} replace />;
  }
  if (accountStatus === "pending" || accountStatus === "rejected") {
    return <AccountStatusPage locale={locale} status={accountStatus} />;
  }
  return <>{children}</>;
}

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
