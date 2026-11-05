/**
 * Upload pasted images via BFF to the public `doc-images` bucket.
 */

import { isDataConfigured } from "./config";
import { uploadImage } from "./dataClient";

export interface UploadPastedImageResult {
  ok: boolean;
  skipped?: boolean;
  message?: string;
  publicUrl?: string;
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

export async function uploadPastedImage(
  blob: Blob
): Promise<UploadPastedImageResult> {
  if (!isDataConfigured) return { ok: false, skipped: true };

  let mime = (blob.type || "").toLowerCase();
  if (!mime.startsWith("image/")) {
    mime = "image/png";
  }
  if (mime === "image/svg+xml") {
    return { ok: false, message: "SVG uploads are not allowed" };
  }

  try {
    const base64 = await blobToBase64(blob);
    return await uploadImage({ base64, mime });
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Image upload failed",
    };
  }
}
