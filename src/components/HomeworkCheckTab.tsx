import { useMemo, useState } from "react";
import { CheckCheck, ClipboardCopy, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import type { HistoryRecord, HomeworkStatus, SchoolClass } from "@/types";
import {
  buildHomeworkCheckMessage,
  copyToClipboard,
  formatDateLongTR,
  todayISO,
  uid,
  whatsappUrl,
} from "@/lib/utils";
import { showToast } from "@/components/Toast";
import { ActionBar } from "@/components/AttendanceTab";

type Props = {
  selectedClass: SchoolClass | null;
  addHistory: (rec: HistoryRecord) => void;
};

export default function HomeworkCheckTab({ selectedClass, addHistory }: Props) {
  const today = todayISO();
  const [statuses, setStatuses] = useState<Record<string, HomeworkStatus>>({});

  const students = selectedClass?.students ?? [];
  const doneNames = students
    .filter((s) => (statuses[s.id] ?? "done") === "done")
    .map((s) => s.name);
  const notDoneNames = students
    .filter((s) => (statuses[s.id] ?? "done") === "notdone")
    .map((s) => s.name);

  function toggle(id: string) {
    setStatuses((prev) => ({
      ...prev,
      [id]: prev[id] === "notdone" ? "done" : "notdone",
    }));
  }

  function markAllDone() {
    setStatuses({});
    showToast("Tüm öğrenciler yaptı işaretlendi");
  }

  const message = useMemo(
    () =>
      selectedClass
        ? buildHomeworkCheckMessage(selectedClass.name, today, doneNames, notDoneNames)
        : "",
    [selectedClass, today, doneNames, notDoneNames]
  );

  function send() {
    if (!selectedClass || students.length === 0) return;
    addHistory({
      id: uid(),
      classId: selectedClass.id,
      className: selectedClass.name,
      date: today,
      type: "odev-kontrol",
      content: message,
      createdAt: Date.now(),
    });
    window.open(whatsappUrl(message), "_blank");
    showToast("WhatsApp açılıyor…");
  }

  async function copy() {
    const ok = await copyToClipboard(message);
    showToast(ok ? "Panoya kopyalandı" : "Kopyalanamadı", ok ? "success" : "info");
  }

  if (!selectedClass) {
    return <EmptyHint text="Lütfen üstten bir sınıf seçin." />;
  }

  if (students.length === 0) {
    return <EmptyHint text="Bu sınıfta öğrenci yok. Sınıflar sekmesinden ekleyin." />;
  }

  return (
    <div className="pb-40">
      <div className="px-4 pt-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs font-medium text-sky-600 uppercase tracking-wide">
            Ödev Kontrolü
          </p>
          <h2 className="text-lg font-bold text-slate-800 mt-0.5">{selectedClass.name}</h2>
          <p className="text-sm text-slate-400">{formatDateLongTR(today)}</p>
          <div className="mt-3 flex gap-2">
            <CountChip color="emerald" label="Yaptı" count={doneNames.length} />
            <CountChip color="amber" label="Yapmadı" count={notDoneNames.length} />
          </div>
        </div>
      </div>

      <div className="px-4 mt-3">
        <button
          onClick={markAllDone}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-800 text-white font-semibold active:scale-[0.98] transition"
        >
          <CheckCheck size={20} />
          Hepsini Yaptı İşaretle
        </button>
      </div>

      <div className="px-4 mt-4 space-y-2.5">
        {students.map((s, i) => {
          const done = (statuses[s.id] ?? "done") === "done";
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition active:scale-[0.98] ${
                done ? "bg-emerald-50 border-emerald-500" : "bg-amber-50 border-amber-400"
              }`}
            >
              <span
                className={`w-8 h-8 grid place-items-center rounded-full text-sm font-bold ${
                  done ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 text-left font-semibold text-slate-800 truncate">
                {s.name}
              </span>
              <span
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold ${
                  done ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"
                }`}
              >
                {done ? <ThumbsUp size={18} /> : <ThumbsDown size={18} />}
                {done ? "Yaptı" : "Yapmadı"}
              </span>
            </button>
          );
        })}
      </div>

      <ActionBar>
        <button
          onClick={copy}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold active:scale-[0.98] transition"
        >
          <ClipboardCopy size={20} />
          Panoya Kopyala
        </button>
        <button
          onClick={send}
          className="flex-[1.6] flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#25D366] text-white font-bold shadow-md active:scale-[0.98] transition"
        >
          <Send size={20} />
          WhatsApp'a Gönder
        </button>
      </ActionBar>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="px-4 pt-20 text-center text-slate-400">
      <p>{text}</p>
    </div>
  );
}

function CountChip({
  color,
  label,
  count,
}: {
  color: "emerald" | "amber";
  label: string;
  count: number;
}) {
  const styles =
    color === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-amber-50 text-amber-700";
  return (
    <span className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${styles}`}>
      {label}: {count}
    </span>
  );
}
