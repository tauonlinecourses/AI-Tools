import type { ForumComment } from "./types";

/**
 * Fingerprint of visible comment content. Used to drop API echoes where the
 * same reply appears nested under itself (often with a recycled or new id).
 */
export function commentSignature(comment: ForumComment): string {
  const author = (comment.author_label ?? comment.author ?? "").trim();
  const body = (comment.raw_body ?? comment.rendered_body ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return `${author}\u0000${body}`;
}

/**
 * Strip cycles / self-echoes from a comment forest so the UI never renders the
 * same reply nested inside itself. Safe to run on cached localStorage trees
 * that were stored before server-side guards existed.
 *
 * Open edX discussions are only two levels deep (response → comment); anything
 * deeper is treated as an echo and discarded.
 */
export function sanitizeCommentForest(
  comments: ForumComment[] | undefined,
  maxDepth = 1
): ForumComment[] {
  if (!comments?.length) return [];

  const walk = (
    nodes: ForumComment[],
    depth: number,
    ancestorIds: Set<string>,
    ancestorSignatures: Set<string>
  ): ForumComment[] => {
    const seenIds = new Set<string>();
    const seenSignatures = new Set<string>();
    const out: ForumComment[] = [];

    for (const node of nodes) {
      if (!node?.id) continue;
      if (ancestorIds.has(node.id) || seenIds.has(node.id)) continue;

      const signature = commentSignature(node);
      if (ancestorSignatures.has(signature) || seenSignatures.has(signature)) {
        continue;
      }

      seenIds.add(node.id);
      seenSignatures.add(signature);

      const pathIds = new Set(ancestorIds);
      pathIds.add(node.id);
      const pathSignatures = new Set(ancestorSignatures);
      pathSignatures.add(signature);

      const children =
        depth >= maxDepth
          ? []
          : walk(node.children ?? [], depth + 1, pathIds, pathSignatures);

      out.push({ ...node, children });
    }

    return out;
  };

  return walk(comments, 0, new Set(), new Set());
}
