import { useEffect, useSyncExternalStore } from "react";
import * as api from "./api";
import {
  describeTemplateTypes,
  type ComponentTemplate,
  type PickerType,
} from "./componentCatalog";

/**
 * The signed-in user's saved templates, shared by every picker and the
 * "save as template" button. Loaded once per session, then kept in sync
 * locally after each save / rename / delete.
 */
interface State {
  templates: ComponentTemplate[];
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

let state: State = { templates: [], status: "idle", error: null };
const listeners = new Set<() => void>();

function setState(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function toComponentTemplate(t: api.UserTemplate): ComponentTemplate {
  return {
    id: t.id,
    label: t.name,
    description: describeTemplateTypes(t.types),
    types: t.types,
    source: "user",
  };
}

async function load() {
  if (state.status === "loading" || state.status === "ready") return;
  setState({ status: "loading", error: null });
  try {
    const rows = await api.listUserTemplates();
    setState({ templates: rows.map(toComponentTemplate), status: "ready" });
  } catch (e) {
    setState({ status: "error", error: e instanceof Error ? e.message : String(e) });
  }
}

/** Names compare trimmed; the DB enforces the same uniqueness per user. */
export function isTemplateNameTaken(name: string, exceptId?: string): boolean {
  const n = name.trim();
  return state.templates.some((t) => t.id !== exceptId && t.label === n);
}

export async function saveUserTemplate(name: string, types: PickerType[]) {
  const created = toComponentTemplate(await api.createUserTemplate(name, types));
  setState({ templates: [created, ...state.templates] });
  return created;
}

export async function renameUserTemplate(id: string, name: string) {
  await api.renameUserTemplate(id, name);
  const label = name.trim();
  setState({ templates: state.templates.map((t) => (t.id === id ? { ...t, label } : t)) });
}

export async function deleteUserTemplate(id: string) {
  await api.deleteUserTemplate(id);
  setState({ templates: state.templates.filter((t) => t.id !== id) });
}

export function useUserTemplates(): State {
  const snapshot = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    void load();
  }, []);
  return snapshot;
}
