import type { MbzActivityContent } from "../types";

export function decodeGeneric(type: string): MbzActivityContent {
  return { kind: "raw", note: `no decoder yet for type: ${type}` };
}
