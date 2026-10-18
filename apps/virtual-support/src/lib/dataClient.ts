/**
 * Browser → BFF helper for Virtual Support data operations.
 */

import { authFetch, getPlatformAccessToken } from "@workspace/auth/client";
import type { Document, Folder } from "./types";

type FolderRow = {
  id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

type DocumentRow = {
  id: string;
  folder_id: string | null;
  title: string;
  body: string;
  position: number;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

function mapFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    body: row.body,
    position: row.position,
    contentHash: row.content_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function vsData<T = unknown>(
  action: string,
  payload?: unknown
): Promise<T> {
  const token = await getPlatformAccessToken();
  if (!token) {
    throw new Error("Not signed in");
  }
  const res = await authFetch("/api/data", {
    method: "POST",
    body: JSON.stringify({ action, payload }),
  });
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;
  if (!res.ok) {
    throw new Error(
      (body && typeof body === "object" && "error" in body && body.error) ||
        `data failed (${res.status})`
    );
  }
  return body as T;
}

export async function listFolders(): Promise<Folder[]> {
  const res = await vsData<{ ok: boolean; folders: FolderRow[] }>(
    "listFolders"
  );
  return (res.folders ?? []).map(mapFolder);
}

export async function createFolder(name: string): Promise<Folder> {
  const res = await vsData<{ ok: boolean; folder: FolderRow }>(
    "createFolder",
    { name }
  );
  return mapFolder(res.folder);
}

export async function renameFolder(id: string, name: string): Promise<Folder> {
  const res = await vsData<{ ok: boolean; folder: FolderRow }>(
    "renameFolder",
    { id, name }
  );
  return mapFolder(res.folder);
}

export async function deleteFolder(id: string): Promise<void> {
  await vsData("deleteFolder", { id });
}

export async function listDocuments(): Promise<Document[]> {
  const res = await vsData<{ ok: boolean; documents: DocumentRow[] }>(
    "listDocuments"
  );
  return (res.documents ?? []).map(mapDocument);
}

export async function getDocument(id: string): Promise<Document> {
  const res = await vsData<{ ok: boolean; document: DocumentRow }>(
    "getDocument",
    { id }
  );
  return mapDocument(res.document);
}

export async function createDocument(input: {
  title: string;
  body: string;
  folderId?: string | null;
}): Promise<Document> {
  const res = await vsData<{ ok: boolean; document: DocumentRow }>(
    "createDocument",
    input
  );
  return mapDocument(res.document);
}

export async function updateDocument(input: {
  id: string;
  title: string;
  body: string;
  folderId?: string | null;
}): Promise<Document> {
  const res = await vsData<{ ok: boolean; document: DocumentRow }>(
    "updateDocument",
    input
  );
  return mapDocument(res.document);
}

export async function deleteDocument(id: string): Promise<void> {
  await vsData("deleteDocument", { id });
}

export async function uploadImage(input: {
  base64: string;
  mime: string;
}): Promise<{ ok: boolean; publicUrl?: string; message?: string }> {
  return vsData("uploadImage", input);
}

export async function askQuestion(input: {
  question: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
}): Promise<{
  answer: string;
  sources: import("./types").AskSource[];
}> {
  const token = await getPlatformAccessToken();
  if (!token) {
    throw new Error("Not signed in");
  }
  const res = await authFetch("/api/ask", {
    method: "POST",
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as {
    answer?: string;
    sources?: import("./types").AskSource[];
    error?: string;
  } | null;
  if (!res.ok) {
    throw new Error(body?.error || `ask failed (${res.status})`);
  }
  return {
    answer: body?.answer ?? "",
    sources: body?.sources ?? [],
  };
}
