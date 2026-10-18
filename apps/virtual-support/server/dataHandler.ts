/**
 * Virtual Support data BFF actions (folders, documents, image upload).
 * Runs with service_role after Platform auth on the API route.
 */

import { createVsServiceClient } from "./vsSupabase.js";
import { reindexDocument } from "./chunkAndEmbed.js";
import { documentContentHash } from "./docPlainText.js";

const DOC_IMAGES_BUCKET = "doc-images";

export type FolderRow = {
  id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type DocumentRow = {
  id: string;
  folder_id: string | null;
  title: string;
  body: string;
  position: number;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
};

function asRecord(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : null;
}

function extensionForMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/gif":
      return "gif";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

export async function runDataAction(
  action: string,
  payload?: unknown
): Promise<unknown> {
  const client = createVsServiceClient();
  const p = asRecord(payload);

  switch (action) {
    case "listFolders": {
      const { data, error } = await client
        .from("folders")
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return { ok: true, folders: (data ?? []) as FolderRow[] };
    }

    case "createFolder": {
      const name = str(p.name).trim();
      if (!name) throw new Error("Folder name is required");
      const { data: maxRow } = await client
        .from("folders")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const position = (maxRow?.position ?? -1) + 1;
      const { data, error } = await client
        .from("folders")
        .insert({ name, position })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, folder: data as FolderRow };
    }

    case "renameFolder": {
      const id = str(p.id);
      const name = str(p.name).trim();
      if (!id) throw new Error("Folder id is required");
      if (!name) throw new Error("Folder name is required");
      const { data, error } = await client
        .from("folders")
        .update({ name })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, folder: data as FolderRow };
    }

    case "deleteFolder": {
      const id = str(p.id);
      if (!id) throw new Error("Folder id is required");
      // Move documents to unfiled, then delete folder.
      const { error: moveErr } = await client
        .from("documents")
        .update({ folder_id: null })
        .eq("folder_id", id);
      if (moveErr) throw new Error(moveErr.message);
      const { error } = await client.from("folders").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "listDocuments": {
      const { data, error } = await client
        .from("documents")
        .select("*")
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return { ok: true, documents: (data ?? []) as DocumentRow[] };
    }

    case "getDocument": {
      const id = str(p.id);
      if (!id) throw new Error("Document id is required");
      const { data, error } = await client
        .from("documents")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error("Document not found");
      return { ok: true, document: data as DocumentRow };
    }

    case "createDocument": {
      const title = str(p.title).trim();
      const body = str(p.body);
      const folderId = strOrNull(p.folderId);
      if (!title) throw new Error("Title is required");

      const { data: maxRow } = await client
        .from("documents")
        .select("position")
        .order("position", { ascending: false })
        .limit(1)
        .maybeSingle();
      const position = (maxRow?.position ?? -1) + 1;
      const content_hash = documentContentHash(title, body);

      const { data, error } = await client
        .from("documents")
        .insert({
          title,
          body,
          folder_id: folderId,
          position,
          content_hash,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const doc = data as DocumentRow;
      try {
        await reindexDocument(client, doc.id, title, body);
      } catch (embedErr) {
        console.error(
          JSON.stringify({
            event: "vs_reindex_failed",
            documentId: doc.id,
            error:
              embedErr instanceof Error ? embedErr.message : String(embedErr),
          })
        );
      }
      return { ok: true, document: doc };
    }

    case "updateDocument": {
      const id = str(p.id);
      const title = str(p.title).trim();
      const body = str(p.body);
      const folderId =
        "folderId" in p ? strOrNull(p.folderId) : undefined;
      if (!id) throw new Error("Document id is required");
      if (!title) throw new Error("Title is required");

      const content_hash = documentContentHash(title, body);
      const update: Record<string, unknown> = {
        title,
        body,
        content_hash,
      };
      if (folderId !== undefined) {
        update.folder_id = folderId;
      }

      const { data, error } = await client
        .from("documents")
        .update(update)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);

      const doc = data as DocumentRow;
      try {
        await reindexDocument(client, doc.id, title, body);
      } catch (embedErr) {
        console.error(
          JSON.stringify({
            event: "vs_reindex_failed",
            documentId: doc.id,
            error:
              embedErr instanceof Error ? embedErr.message : String(embedErr),
          })
        );
      }
      return { ok: true, document: doc };
    }

    case "deleteDocument": {
      const id = str(p.id);
      if (!id) throw new Error("Document id is required");
      // doc_chunks cascade via FK
      const { error } = await client.from("documents").delete().eq("id", id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    case "uploadImage": {
      const base64 = str(p.base64);
      const mimeRaw = str(p.mime).toLowerCase() || "image/png";
      if (!base64) throw new Error("base64 is required");
      if (mimeRaw === "image/svg+xml") {
        return { ok: false, message: "SVG uploads are not allowed" };
      }
      const mime = mimeRaw.startsWith("image/") ? mimeRaw : "image/png";
      const buffer = Buffer.from(base64, "base64");
      const ext = extensionForMime(mime);
      const day = new Date().toISOString().slice(0, 10);
      const id = crypto.randomUUID();
      const path = `${day}/${id}.${ext}`;

      const { error } = await client.storage
        .from(DOC_IMAGES_BUCKET)
        .upload(path, buffer, {
          contentType: mime,
          upsert: false,
          cacheControl: "3600",
        });
      if (error) {
        return { ok: false, message: error.message };
      }

      const { data } = client.storage
        .from(DOC_IMAGES_BUCKET)
        .getPublicUrl(path);
      const publicUrl = data?.publicUrl?.trim();
      if (!publicUrl) {
        return {
          ok: false,
          message: "Upload succeeded but no public URL returned",
        };
      }
      return { ok: true, publicUrl, path };
    }

    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
