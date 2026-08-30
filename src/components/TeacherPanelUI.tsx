import type { LucideIcon } from "lucide-react";

/**
 * Öğretmen panelindeki sekmelerin (Yoklama, Ödev Kontrolü, Yeni Ödev)
 * paylaştığı UI parçaları. Daha önce `EmptyHint` üç dosyada, `CountChip`
 * iki dosyada birebir kopyalanmıştı; `ActionBar` ise AttendanceTab'den
 * import ediliyordu. Hepsi burada tek yerde toplandı.
 */

/* ─── Durum seçici satır (segmented control) ─────────────────────────── */

export type StatusOption<T extends string> = {
  value: T;
  label: string;
  icon: LucideIcon;
  /** Seçili segmentin rengi. */
  activeClassName: string;
  /** Satırın o durumdaki zemin/çerçeve rengi. */
  rowClassName: string;
  /** Satır numarası baloncuğunun o durumdaki rengi. */
  badgeClassName: string;
};

type StudentStatusRowProps<T extends string> = {
  index: number;
  name: string;
  value: T;
  options: StatusOption<T>[];
  onChange: (value: T) => void;
  /**
   * Kaydedilmiş hâlden farklı mı? Öğretmen 30 kişilik listede neyi
   * değiştirdiğini görebilsin diye satır vurgulanır.
   */
  changed?: boolean;
  disabled?: boolean;
};

/**
 * Tek dokunuşla durum belirlemeye yarayan satır. Önceki tap-to-cycle
 * davranışında "Yok" demek için 2, "Eksik" demek için 2 dokunuş
 * gerekiyordu; segmented control ile her durum tek dokunuş.
 */
export function StudentStatusRow<T extends string>({
  index,
  name,
  value,
  options,
  onChange,
  changed = false,
  disabled = false,
}: StudentStatusRowProps<T>) {
  const active = options.find((o) => o.value === value) ?? options[0];

  return (
    <div
      className={`flex items-center gap-2.5 p-2.5 rounded-2xl border-2 transition ${active.rowClassName} ${
        changed ? "ring-2 ring-offset-1 ring-slate-300" : ""
      }`}
    >
      <span
        className={`w-7 h-7 shrink-0 grid place-items-center rounded-full text-xs font-bold ${active.badgeClassName}`}
      >
        {index + 1}
      </span>

      <span className="flex-1 min-w-0 font-semibold text-slate-800 truncate text-sm">
        {name}
        {changed && <span className="ml-1.5 text-[10px] text-slate-500 font-medium">•</span>}
      </span>

      {/* Segmented control: 3 durum, her biri tek dokunuş. */}
      <div className="flex shrink-0 gap-1 p-0.5 rounded-xl bg-white/70">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              disabled={disabled}
              aria-pressed={isActive}
              aria-label={`${name}: ${opt.label}`}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[48px] py-1.5 rounded-lg text-[11px] font-bold transition active:scale-95 disabled:opacity-50 ${
                isActive ? opt.activeClassName : "text-slate-400 hover:bg-slate-50"
              }`}
            >
              <Icon size={15} strokeWidth={isActive ? 2.6 : 2} />
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Küçük paylaşılan parçalar ──────────────────────────────────────── */

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="px-4 pt-20 text-center text-slate-400">
      <p>{text}</p>
    </div>
  );
}

export function CountChip({
  color,
  label,
  count,
}: {
  color: "emerald" | "amber" | "rose" | "slate";
  label: string;
  count: number;
}) {
  const styles =
    color === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : color === "amber"
      ? "bg-amber-50 text-amber-700"
      : color === "rose"
      ? "bg-rose-50 text-rose-700"
      : "bg-slate-100 text-slate-700";
  return (
    <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${styles}`}>
      {label}: {count}
    </span>
  );
}

export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed bottom-[72px] inset-x-0 z-30 px-4 pb-3">
      <div className="mx-auto max-w-md flex gap-2.5">{children}</div>
    </div>
  );
}
