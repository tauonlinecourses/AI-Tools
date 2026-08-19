import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Spinner } from "@workspace/ui";
import { Tree } from "../components/explorer/Tree";
import { ContentViewer } from "../components/explorer/ContentViewer";
import { HomeStructureTree } from "../components/explorer/HomeStructureTree";
import { ResourceListView } from "../components/explorer/ResourceListView";
import type { MbzManifest } from "../lib/mbz-parser";
import {
  loadSession,
  runDecodeAll,
  runDecodeSection,
  runForceRedecode,
  type SessionState,
} from "../lib/session";
import { hydrateHtmlBlobs } from "../lib/hydrateBlobs";

export function ExplorerPage() {
  type ExplorerSelection =
    | { kind: "home" }
    | { kind: "activity"; cmid: string }
    | { kind: "overviewType"; type: string };

  const { sha1 } = useParams<{ sha1: string }>();
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selection, setSelection] = useState<ExplorerSelection>({ kind: "home" });
  const [decodingSectionId, setDecodingSectionId] = useState<string | null>(null);
  const [analyzingFull, setAnalyzingFull] = useState(false);

  useEffect(() => {
    if (!sha1) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const s = await loadSession(sha1);
        if (cancelled) return;
        if (!s) {
          setError("Analysis not found. Upload the .mbz again from the dashboard.");
          setSession(null);
        } else {
          setSession(s);
          // Land on home structure overview (not first activity).
          setSelection({ kind: "home" });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sha1]);

  const activity = useMemo(() => {
    if (!session || selection.kind !== "activity") return null;
    return session.manifest.activities.find((a) => a.cmid === selection.cmid) ?? null;
  }, [session, selection]);

  const selectedCmid = selection.kind === "activity" ? selection.cmid : null;
  const selectedOverviewType = selection.kind === "overviewType" ? selection.type : null;

  const applyManifest = useCallback((manifest: MbzManifest) => {
    setSession((prev) => (prev ? { ...prev, manifest } : prev));
  }, []);

  const handleOverviewTypeSelect = useCallback((type: string) => {
    if (type !== "resource") return;
    setSelection({ kind: "overviewType", type });
  }, []);

  async function onExpandSection(sectionId: string) {
    if (!sha1) return;
    setDecodingSectionId(sectionId);
    try {
      const manifest = await runDecodeSection(sha1, sectionId);
      if (manifest) applyManifest(manifest);
    } finally {
      setDecodingSectionId(null);
    }
  }

  async function onAnalyzeFull() {
    if (!sha1) return;
    setAnalyzingFull(true);
    try {
      const manifest = await runDecodeAll(sha1);
      if (manifest) applyManifest(manifest);
    } finally {
      setAnalyzingFull(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-3rem)] items-center justify-center gap-2 text-sm text-surface-500">
        <Spinner size="sm" /> Loading analysis…
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex h-[calc(100vh-3rem)] flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-danger">{error || "Not found"}</p>
        <Link to="/" className="text-sm font-semibold text-surface-900 underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] min-h-0 overflow-hidden">
      <Tree
        key={session.manifest.sourceFile.sha1}
        manifest={session.manifest}
        selectedCmid={selectedCmid}
        homeSelected={selection.kind === "home"}
        selectedOverviewType={selectedOverviewType}
        decodingSectionId={decodingSectionId}
        onSelectHome={() => setSelection({ kind: "home" })}
        onSelectActivity={(cmid) => setSelection({ kind: "activity", cmid })}
        onSelectOverviewType={handleOverviewTypeSelect}
        onExpandSection={onExpandSection}
        onAnalyzeFull={onAnalyzeFull}
        analyzingFull={analyzingFull}
      />
      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-white">
        {selection.kind === "home" ? (
          <HomeStructureTree
            manifest={session.manifest}
            onSelectActivity={(cmid) => setSelection({ kind: "activity", cmid })}
            onExpandSection={onExpandSection}
            selectedOverviewType={selectedOverviewType}
            onSelectOverviewType={handleOverviewTypeSelect}
          />
        ) : selection.kind === "overviewType" && selection.type === "resource" ? (
          <ResourceListView
            manifest={session.manifest}
            onSelectActivity={(cmid) => setSelection({ kind: "activity", cmid })}
          />
        ) : (
          <ContentViewer
            manifest={session.manifest}
            vfs={session.vfs}
            activity={activity}
            hydrateHtml={(html) =>
              hydrateHtmlBlobs(
                html,
                session.manifest,
                session.vfs,
                session.blobStore,
                session.urlCache
              )
            }
            onDecodeSection={onExpandSection}
            onRedecode={async (sectionId) => {
              if (!sha1) return;
              setDecodingSectionId(sectionId);
              try {
                const manifest = await runForceRedecode(sha1, sectionId);
                if (manifest) applyManifest(manifest);
              } finally {
                setDecodingSectionId(null);
              }
            }}
            decoding={decodingSectionId != null}
          />
        )}
      </div>
    </div>
  );
}
