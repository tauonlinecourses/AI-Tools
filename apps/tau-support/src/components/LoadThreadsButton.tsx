interface LoadThreadsButtonProps {
  onLoad: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export function LoadThreadsButton({
  onLoad,
  loading = false,
  disabled = false,
}: LoadThreadsButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={onLoad}
      disabled={isDisabled}
      title="טוען את כל השרשורים החדשים בקורס מאז הבדיקה האחרונה"
      className={[
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-control border px-3 text-xs font-semibold transition-colors",
        isDisabled
          ? "cursor-not-allowed border-surface-200 bg-surface-100 text-surface-500"
          : "border-gray-900 bg-white text-gray-900 hover:bg-gray-50 active:bg-gray-100",
      ].join(" ")}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      טען תגובות חדשות עבור קורס זה
    </button>
  );
}
