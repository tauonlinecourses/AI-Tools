/**
 * Admin-only dashboard (Stage A): health, retrieval, answer quality (partial),
 * user feedback, and token / cost. Data: /api/admin-metrics (ask_log).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchDashboardMetrics,
  type DashboardMetrics,
} from "../../lib/metricsClient";
import {
  Card,
  DailyBars,
  DataTable,
  fmt,
  Placeholder,
  Section,
  StatTile,
  TrendLines,
} from "./charts";

const RANGES = [7, 30, 90] as const;
/** Alert thresholds from the dashboard spec. */
const P95_LIMIT_MS = 5000;

const STAGE_LABELS: Record<string, string> = {
  rewrite: "ניסוח מחדש",
  embed: "Embedding",
  search: "חיפוש + טעינת עמודים",
  answer: "מודל התשובה",
  total: "סה״כ",
};

export function DashboardPage() {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDashboardMetrics(d));
    } catch (err) {
      setError(err instanceof Error ? err.message : "טעינת הנתונים נכשלה");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  return (
    <div dir="rtl" className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl space-y-8 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-surface-900">לוח בקרה - מערכת Virtual Support</h1>
            <p className="text-xs text-surface-500">
              {data
                ? `עודכן ${new Date(data.generatedAt).toLocaleString("he-IL")} · ${fmt.int(data.totals.requests)} שאלות בטווח`
                : "גלוי למנהלים בלבד"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-white p-1 ring-1 ring-black/5" role="group" aria-label="טווח זמן">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setDays(r)}
                  aria-pressed={days === r}
                  className={`rounded-full px-3 py-1 text-xs ${
                    days === r ? "bg-surface-900 text-white" : "text-surface-600 hover:bg-surface-100"
                  }`}
                >
                  {r} ימים
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void load(days)}
              disabled={loading}
              className="rounded-full bg-white px-3 py-1.5 text-xs text-surface-700 ring-1 ring-black/5 hover:bg-surface-100 disabled:opacity-50"
            >
              {loading ? "טוען…" : "רענון"}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-[1rem] border border-rose-100 bg-rose-50 px-4 py-2 text-xs text-danger">{error}</p>
        ) : null}

        {data ? <DashboardBody data={data} /> : loading ? (
          <p className="py-20 text-center text-sm text-surface-500">טוען נתונים…</p>
        ) : null}
      </div>
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardMetrics }) {
  const { totals, daily, latency, releases, index } = data;

  const tokenRows = useMemo(
    () => daily.map((d) => ({ day: d.day, ...d.tokensByModel })),
    [daily]
  );
  const totalP95 = latency.find((l) => l.stage === "total")?.p95 ?? null;

  return (
    <>

      {/* ---------------------------------------------------------- Row 1 */}
      <Section title="בריאות המערכת" question="האם הכלי עובד תקין עכשיו?">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="שאלות" value={fmt.int(totals.requests)} />
          <StatTile
            label="שיעור שגיאות"
            value={fmt.pct(totals.errorRate)}
            hint={`${fmt.int(totals.errors)} שגיאות`}
          />
          <StatTile
            label="P95 זמן תגובה"
            value={fmt.sec(totalP95)}
            alert={totalP95 != null && totalP95 > P95_LIMIT_MS ? "מעל 5 שניות" : undefined}
            hint={`P50 ${fmt.sec(latency.find((l) => l.stage === "total")?.p50)}`}
          />
          <StatTile label="עלות ממוצעת לשאלה" value={fmt.usd(totals.costPerRequest)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="שאלות ושגיאות ליום">
            <DailyBars
              data={daily}
              series={[
                { key: "requests", label: "שאלות" },
                { key: "errors", label: "שגיאות" },
              ]}
              format={fmt.int}
            />
          </Card>
          <Card title="זמן תגובה כולל ליום" note="P50 ו־P95, בשניות">
            <TrendLines
              data={daily}
              series={[
                { key: "latencyP50", label: "P50" },
                { key: "latencyP95", label: "P95" },
              ]}
              format={fmt.sec}
              threshold={{ value: P95_LIMIT_MS, label: "סף 5s" }}
            />
          </Card>
        </div>
        <Card
          title="זמן תגובה לפי שלב"
          note="ניסוח מחדש רץ רק בשאלות המשך; מודל התשובה רץ רק כשנמצאו עמודים"
        >
          <DataTable
            rows={latency}
            columns={[
              { label: "שלב", render: (r) => STAGE_LABELS[r.stage] ?? r.stage },
              { label: "P50", render: (r) => fmt.sec(r.p50), numeric: true },
              { label: "P95", render: (r) => fmt.sec(r.p95), numeric: true },
              { label: "מדידות", render: (r) => fmt.int(r.n), numeric: true },
            ]}
          />
        </Card>
      </Section>

      {/* ---------------------------------------------------------- Row 2 */}
      <Section title="מציאת המסמכים הנכונים" question="האם החיפוש מוצא את העמודים הנכונים?">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label="שיעור ״לא נמצא עמוד״"
            value={fmt.pct(totals.noMatchRate)}
            hint="אף עמוד לא עבר את סף הרלוונטיות"
          />
          <StatTile label="מסמכים במאגר" value={fmt.int(index.documents)} />
          <StatTile
            label="מסמכים לא מאונדקסים"
            value={fmt.int(index.notIndexed + index.outdated)}
            alert={index.notIndexed + index.outdated > 0 ? `${index.notIndexed} חדשים · ${index.outdated} שהשתנו` : undefined}
            hint="כל המסמכים מעודכנים בחיפוש"
          />
          <StatTile
            label="אינדוקס אחרון"
            value={index.lastIndexedAt ? new Date(index.lastIndexedAt).toLocaleDateString("he-IL") : "—"}
            hint={index.lastIndexedAt ? new Date(index.lastIndexedAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : undefined}
          />
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <Card title="שיעור ״לא נמצא עמוד״ ליום">
            <TrendLines data={daily} series={[{ key: "noMatchRate", label: "לא נמצא" }]} format={fmt.pct} releases={releases} />
          </Card>
          <Card title="דמיון סמנטי מיטבי (חציון יומי)" note="cosine similarity של הקטע הטוב ביותר">
            <TrendLines data={daily} series={[{ key: "medianBestSimilarity", label: "דמיון" }]} format={(v) => fmt.num(v, 2)} releases={releases} />
          </Card>
          <Card title="ציון RRF של העמוד המוביל (חציון יומי)" note="אין reranker נפרד — זה ציון הדירוג ההיברידי">
            <TrendLines data={daily} series={[{ key: "medianTopRrf", label: "RRF" }]} format={(v) => fmt.num(v, 3)} releases={releases} />
          </Card>
        </div>
        <Card title="Context recall ו־precision (מדגם)">
          <Placeholder>יתווסף בשלב B: שופט מודל שבודק מדגם של שאלות ומודד אם העמודים הנכונים נשלפו.</Placeholder>
        </Card>
      </Section>

      {/* ---------------------------------------------------------- Row 3 */}
      <Section title="איכות התשובות" question="האם התשובות טובות? קווים מקווקווים = גרסת pipeline חדשה">
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="שיעור הימנעות ותשובות ללא ציטוט" note="הימנעות = סירוב או לא נמצא עמוד">
            <TrendLines
              data={daily}
              series={[
                { key: "abstentionRate", label: "הימנעות" },
                { key: "uncitedRate", label: "ללא ציטוט" },
              ]}
              format={fmt.pct}
              releases={releases}
            />
          </Card>
          <Card title="Faithfulness, תמיכת ציטוטים וציון ה־golden set">
            <Placeholder>
              יתווסף בשלב B: שופט אוטומטי על מדגם תשובות, והרצה לילית של סט הבדיקה (ask_eval_cases) מול הגרסה הנוכחית.
            </Placeholder>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------- Row 4 */}
      <Section title="שביעות רצון המשתמשים" question="האם המשתמשים מרוצים?">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="שיעור 👎" value={fmt.pct(totals.thumbsDownRate)} hint="מתוך התשובות שדורגו" />
          <StatTile label="שיעור ניסוח מחדש" value={fmt.pct(totals.rephraseRate)} hint="שאלה נוספת בצ׳אט תוך 2 דקות" />
          <StatTile label="דירוגים" value={fmt.int(daily.reduce((n, d) => n + d.votes, 0))} />
          <StatTile label="הסלמות" value="—" hint="עדיין אין פעולת הסלמה בכלי" />
        </div>
        <Card title="👎 וניסוח מחדש ליום">
          <TrendLines
            data={daily}
            series={[
              { key: "thumbsDownRate", label: "👎" },
              { key: "rephraseRate", label: "ניסוח מחדש" },
            ]}
            format={fmt.pct}
            releases={releases}
          />
        </Card>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="לפי נושא" note="לפי התיקייה של העמוד הראשון שצוטט (או נשלח)">
            <BreakdownTable rows={data.byFolder} />
          </Card>
          <Card title="לפי מסמך (15 המובילים)">
            <BreakdownTable rows={data.byDocument} />
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------- Tokens */}
      <Section title="טוקנים ועלויות" question="כמה זה עולה, ואיפה הכסף הולך? (הערכה לפי מחירון ב־server/pricing.ts)">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="עלות בטווח" value={fmt.usd(totals.costUsd)} />
          <StatTile label="טוקני קלט (צ׳אט)" value={fmt.compact(totals.inputTokens)} />
          <StatTile label="טוקני פלט (צ׳אט)" value={fmt.compact(totals.outputTokens)} />
          <StatTile label="טוקני embedding" value={fmt.compact(totals.embedTokens)} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Card title="טוקנים ליום לפי מודל" note="קלט + פלט">
            <DailyBars
              data={tokenRows}
              series={data.models.map((m) => ({ key: m, label: m }))}
              format={fmt.compact}
              stacked
            />
          </Card>
          <Card title="עלות ליום">
            <DailyBars data={daily} series={[{ key: "costUsd", label: "עלות" }]} format={fmt.usd} />
          </Card>
          <Card title="עלות ממוצעת לשאלה ליום">
            <TrendLines data={daily} series={[{ key: "costPerRequest", label: "עלות לשאלה" }]} format={fmt.usd} releases={releases} />
          </Card>
          <Card title="פירוט עלות">
            <DataTable
              rows={data.costByModel}
              columns={[
                { label: "מודל", render: (r) => <span dir="ltr">{r.model}</span> },
                { label: "קלט", render: (r) => fmt.compact(r.inputTokens), numeric: true },
                { label: "פלט", render: (r) => fmt.compact(r.outputTokens), numeric: true },
                { label: "עלות", render: (r) => fmt.usd(r.costUsd), numeric: true },
              ]}
            />
            <div className="mt-4">
              <DataTable
                rows={data.costByStage}
                columns={[
                  { label: "שלב", render: (r) => STAGE_LABELS[r.stage] ?? r.stage },
                  { label: "טוקנים", render: (r) => fmt.compact(r.tokens), numeric: true },
                  { label: "עלות", render: (r) => fmt.usd(r.costUsd), numeric: true },
                ]}
              />
            </div>
          </Card>
        </div>
      </Section>
    </>
  );
}

function BreakdownTable({ rows }: { rows: DashboardMetrics["byFolder"] }) {
  return (
    <DataTable
      rows={rows}
      columns={[
        { label: "מקור", render: (r) => r.label },
        { label: "שאלות", render: (r) => fmt.int(r.questions), numeric: true },
        { label: "👎", render: (r) => `${fmt.pct(r.thumbsDownRate)} (${r.thumbsDown}/${r.votes})`, numeric: true },
        { label: "ניסוח מחדש", render: (r) => fmt.pct(r.rephraseRate), numeric: true },
      ]}
    />
  );
}
