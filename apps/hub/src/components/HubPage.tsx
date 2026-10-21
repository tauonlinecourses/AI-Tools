import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { persistHubLocale, Spinner } from "@workspace/ui";
import { usePlatformAuth } from "@workspace/auth/react";
import {
  tools,
  toolIsOpenable,
  findToolForReturnUrl,
} from "../tools.config";
import { ui, type Locale } from "../i18n";
import { fetchPublicGroups, type PublicGroup } from "../lib/registerApi";
import { handoffToTool } from "../lib/openTool";
import { LoginPage } from "./LoginPage";
import { SoftPageBg } from "./SoftPageBg";
import { AccountStatusPage } from "./AccountStatusPage";
import { UserMenu } from "./UserMenu";
import { ToolCard } from "./ToolCard";

/** Temporarily hide the Hebrew/English header switcher. `/en` route still works. */
const SHOW_LANG_SWITCHER = false;

/** Survive React StrictMode double-mount so tool returnUrl handoff runs once. */
const processedReturnUrls = new Set<string>();

export function HubPage({ locale }: { locale: Locale }) {
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

    // Provider already finished membership load (`loading` is false); reuse it
    // instead of a second `user_allowed_tools` RPC before handoff.
    if (!allowedToolIds.includes(tool.id)) {
      // Signed in but no entitlement for this tool → stay on hub catalog.
      return;
    }

    if (tool.hubPath) {
      navigate(tool.hubPath);
      return;
    }

    void (async () => {
      try {
        const target = await handoffToTool(tool);
        window.location.href = target;
      } catch {
        // Stay on hub if handoff fails; user can open the tool from the catalog.
      }
    })();
  }, [loading, session, accountStatus, allowedToolIds, navigate]);

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
