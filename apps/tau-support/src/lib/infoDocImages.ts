/**
 * Upload pasted images for info-doc topics to the public
 * `info-doc-images` Supabase Storage bucket. Returns a public URL
 * suitable for markdown `![](url)` insertion into the topic body.
 */

import { isSupabaseConfigured, supabase } from "./supabase";

export const INFO_DOC_IMAGES_BUCKET = "info-doc-images";

export interface UploadPastedImageResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  publicUrl?: string;
  path?: string;
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

function newImagePath(mime: string): string {
  const ext = extensionForMime(mime);
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `img-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const day = new Date().toISOString().slice(0, 10);
  return `${day}/${id}.${ext}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload an image Blob (from clipboard paste) and return its public URL.
 */
export async function uploadPastedImage(
  blob: Blob
): Promise<UploadPastedImageResult> {
  if (!isSupabaseConfigured) return { ok: false, skipped: true };

  let mime = (blob.type || "").toLowerCase();
  if (!mime.startsWith("image/")) {
    mime = "image/png";
  }
  if (mime === "image/svg+xml") {
    return { ok: false, message: "SVG uploads are not allowed" };
  }

  if (typeof window !== "undefined") {
    try {
      const base64 = await blobToBase64(blob);
      const { tauData } = await import("./tauDataClient");
      return await tauData<UploadPastedImageResult>("uploadPastedImage", {
        base64,
        mime,
      });
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : "Image upload failed",
      };
    }
  }

  const path = newImagePath(mime);

  try {
    const { error } = await supabase.storage
      .from(INFO_DOC_IMAGES_BUCKET)
      .upload(path, blob, {
        contentType: mime,
        upsert: false,
        cacheControl: "3600",
      });

    if (error) {
      const msg = error.message || "Image upload failed";
      if (/bucket|not found|row-level security|policy|unauthorized|403/i.test(msg)) {
        return {
          ok: false,
          message:
            `${msg} — ודאו שדלי האחסון info-doc-images קיים בפרויקט הנכון עם הרשאות העלאה.`,
        };
      }
      return { ok: false, message: msg };
    }

    const { data } = supabase.storage
      .from(INFO_DOC_IMAGES_BUCKET)
      .getPublicUrl(path);

    const publicUrl = data?.publicUrl?.trim();
    if (!publicUrl) {
      return { ok: false, message: "Upload succeeded but no public URL returned" };
    }

    return { ok: true, publicUrl, path };
  } catch (err) {
    return {
      ok: false,
      message:
        err instanceof Error ? err.message : "Image upload failed",
    };
  }
}
