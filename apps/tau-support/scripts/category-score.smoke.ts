/**
 * Score the labeled CSV from `category-test`.
 *
 *   pnpm --filter tau-support category-test:score
 *
 * Fill the `correct_category` column (exact category names), save as
 * "CSV UTF-8", then run this. Uses the newest CSV in category-test-results/,
 * or the file named in CATEGORY_TEST_FILE.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { rowsFromCsv, share, type TestRow } from "./categoryTestShared";

describe("category score", () => {
  it("scores labeled rows", () => {
    const dir = join(__dirname, "..", "category-test-results");
    const file =
      process.env.CATEGORY_TEST_FILE ||
      join(
        dir,
        readdirSync(dir)
          .filter((f) => f.endsWith(".csv"))
          .sort()
          .at(-1) ?? ""
      );
    const labeled = rowsFromCsv(readFileSync(file, "utf8")).filter(
      (r) => r.correct
    );

    const accuracy = (pick: (r: TestRow) => string, rows = labeled) =>
      share(rows.filter((r) => pick(r) === r.correct).length, rows.length);

    // Hybrid check: is the embedding right when it is clearly ahead?
    const byMargin = [...labeled].sort(
      (a, b) => b.embeddingMargin - a.embeddingMargin
    );
    const half = Math.ceil(byMargin.length / 2);
    const confident = byMargin.slice(0, half);
    const unsure = byMargin.slice(half);
    const cutoff = confident.at(-1)?.embeddingMargin ?? 0;

    console.log(
      [
        `File: ${file}`,
        `Labeled rows: ${labeled.length}`,
        "",
        "Accuracy",
        `  current (dashboard): ${accuracy((r) => r.current)}`,
        `  gpt-4o-mini:         ${accuracy((r) => r.mini)}`,
        `  embeddings only:     ${accuracy((r) => r.embedding)}`,
        "",
        `Embeddings by confidence (margin cutoff ${cutoff.toFixed(3)})`,
        `  clear lead (top half):   ${accuracy((r) => r.embedding, confident)}`,
        `  unclear (bottom half):   ${accuracy((r) => r.embedding, unsure)}`,
        `  hybrid (embedding if clear, else mini): ${accuracy((r) =>
          r.embeddingMargin >= cutoff ? r.embedding : r.mini
        )}`,
      ].join("\n")
    );
  });
});
