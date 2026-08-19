import type { BlockProps, CourseViewMode } from "../../lib/types";

const SAMPLE_WORDS = [
  { text: "מחט", size: "text-5xl", color: "text-[#2196F3]", weight: "font-black" },
  { text: "רוח", size: "text-lg", color: "text-[#64B5F6]", weight: "font-bold" },
  { text: "עצמויות", size: "text-base", color: "text-[#90CAF9]", weight: "font-semibold" },
  { text: "בורות", size: "text-base", color: "text-[#90CAF9]", weight: "font-semibold" },
  { text: "סערה", size: "text-base", color: "text-[#90CAF9]", weight: "font-semibold" },
  { text: "מורת דרך", size: "text-lg", color: "text-[#42A5F5]", weight: "font-bold" },
  { text: "ביצת עין", size: "text-base", color: "text-[#64B5F6]", weight: "font-semibold" },
  { text: "עולם", size: "text-base", color: "text-[#64B5F6]", weight: "font-semibold" },
  { text: "כפי שהיא", size: "text-base", color: "text-[#64B5F6]", weight: "font-semibold" },
  { text: "עקרה ומחנכת", size: "text-base", color: "text-[#90CAF9]", weight: "font-semibold" },
  { text: "עקרה ומחנכת", size: "text-sm", color: "text-[#BBDEFB]", weight: "font-medium", hidden: true },
  { text: "מחט תפירה", size: "text-sm", color: "text-[#90CAF9]", weight: "font-medium" },
  { text: "לא בטוחה שהבנתי את המשחקון", size: "text-sm", color: "text-[#90CAF9]", weight: "font-medium" },
  { text: "דבר והיפוכו", size: "text-sm", color: "text-[#BBDEFB]", weight: "font-medium" },
  { text: "תודעה", size: "text-sm", color: "text-[#BBDEFB]", weight: "font-medium" },
  { text: "בגד", size: "text-sm", color: "text-[#BBDEFB]", weight: "font-medium" },
  { text: "המים חמים", size: "text-sm", color: "text-[#BBDEFB]", weight: "font-medium" },
  { text: "ביצה", size: "text-sm", color: "text-[#BBDEFB]", weight: "font-medium" },
  { text: "עיוואת גמורה", size: "text-sm", color: "text-[#BBDEFB]", weight: "font-medium" },
  { text: "ענן", size: "text-sm", color: "text-[#BBDEFB]", weight: "font-medium" },
];

interface Props {
  props: BlockProps;
  mode: CourseViewMode;
  onChange: (props: BlockProps) => void;
}

export function WordCloudBlock({ props, mode, onChange }: Props) {
  const editable = mode === "edit";
  const centerWord = props.centerWord ?? "";

  return (
    <div className="flex flex-col gap-3">
      {/* Input bar placeholder */}
      <div className="flex items-center gap-2 border border-surface-200 rounded-lg bg-white p-2">
        <button
          type="button"
          disabled
          className="p-1.5 bg-[#2196F3] text-white rounded shrink-0 opacity-70"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
        <span className="flex-1 text-sm text-surface-400 text-right">הוספת מילה...</span>
        <button
          type="button"
          disabled
          className="px-4 py-1.5 bg-[#2196F3] text-white text-sm font-semibold rounded opacity-70"
        >
          שמירה
        </button>
        <select disabled className="border border-surface-200 rounded px-2 py-1.5 text-sm text-surface-500">
          <option>תצוגת ענן</option>
        </select>
      </div>

      {/* Word cloud display */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-6 px-4 min-h-[160px]" dir="rtl">
        {SAMPLE_WORDS.filter((w) => !w.hidden).map((word, i) => (
          <span key={i} className={`${word.size} ${word.color} ${word.weight} select-none`}>
            {word.text}
          </span>
        ))}
      </div>

      {editable && (
        <div className="px-2">
          <label className="text-xs text-surface-500 block mb-1">מילה מרכזית</label>
          <input
            className="w-full text-sm border border-surface-200 rounded px-2 py-1 outline-none focus:border-surface-400"
            placeholder="מחט"
            value={centerWord}
            onChange={(e) => onChange({ ...props, centerWord: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}
