import { useMemo, useState } from "react";
import { CheckCheck, ClipboardCopy, Database, Send, UserCheck, UserX } from "lucide-react";
import type { AttendanceStatus, HistoryRecord, SchoolClass } from "@/types";
import {
  buildAttendanceMessage,
  copyToClipboard,
  formatDateLongTR,
  todayISO,
  uid,
  whatsappUrl,
} from "@/lib/utils";
import { showToast } from "@/components/Toast";
import { addAttendanceRecord, createNotification } from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";

type Props = {
  selectedClass: SchoolClass | null;
  addHistory: (rec: HistoryRecord) => void;
};

export default function AttendanceTab({ selectedClass, addHistory }: Props) {
  const { user } = useAuth();
  const today = todayISO();
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});

  const students = selectedClass?.students ?? [];
  const presentNames = students
    .filter((s) => (statuses[s.id] ?? "present") === "present")
    .map((s) => s.name);
  const lateNames = students
    .filter((s) => (statuses[s.id] ?? "present") === "late")
    .map((s) => s.name);
  const absentNames = students
    .filter((s) => (statuses[s.id] ?? "present") === "absent")
    .map((s) => s.name);

  function toggle(id: string) {
    setStatuses((prev) => {
      const current = prev[id] ?? "present";
      let next: AttendanceStatus;
      if (current === "present") next = "late";
      else if (current === "late") next = "absent";
      else next = "present";
      return { ...prev, [id]: next };
    });
  }

  function markAllPresent() {
    setStatuses({});
    showToast("Tüm öğrenciler var işaretlendi");
  }

  const message = useMemo(
    () =>
      selectedClass
        ? buildAttendanceMessage(selectedClass.name, today, presentNames, absentNames, lateNames)
        : "",
    [selectedClass, today, presentNames, absentNames, lateNames]
  );

  async function persistAttendance() {
    if (!selectedClass || !user) return;

    const records = students.map((s) => {
      const status = statuses[s.id] ?? "present";
      return {
        classId: selectedClass.id,
        className: selectedClass.name,
        date: today,
        studentId: s.id,
        studentName: s.name,
        status,
        teacherUid: user.uid,
      };
    });

    // Save each record to Firestore
    for (const rec of records) {
      await addAttendanceRecord(rec);
    }

    // Auto-notify parents of absent/late students
    for (const rec of records) {
      if (rec.status === "absent" || rec.status === "late") {
        // Find the student to get their parentUid
        const student = students.find((s) => s.id === rec.studentId);
        if (student?.parentUid) {
          await createNotification({
            parentUid: student.parentUid,
            studentId: rec.studentId,
            studentName: rec.studentName,
            className: rec.className,
            date: rec.date,
            type: rec.status,
            message:
              rec.status === "absent"
                ? `${rec.studentName} bugün (${formatDateLongTR(rec.date)}) ${rec.className} dersinde YOK olarak işaretlendi.`
                : `${rec.studentName} bugün (${formatDateLongTR(rec.date)}) ${rec.className} dersine GEÇ kaldı.`,
          });
        }
      }
    }
  }

  // Yoklamayı veritabanına kaydeder (bildirimleri de oluşturur).
  // WhatsApp / panoya kopyalama butonlarından bağımsız olarak kullanılabilir.
  async function saveOnly() {
    if (!selectedClass || students.length === 0) return;
    try {
      await persistAttendance();
      addHistory({
        id: uid(),
        classId: selectedClass.id,
        className: selectedClass.name,
        date: today,
        type: "yoklama",
        content: message,
        createdAt: Date.now(),
      });
      showToast("Yoklama veritabanına kaydedildi ✅", "success");
    } catch (err) {
      console.error("Yoklama kaydedilemedi:", err);
      showToast("Yoklama kaydedilemedi", "error");
    }
  }

  async function send() {
    if (!selectedClass || students.length === 0) return;
    try {
      await persistAttendance();
      addHistory({
        id: uid(),
        classId: selectedClass.id,
        className: selectedClass.name,
        date: today,
        type: "yoklama",
        content: message,
        createdAt: Date.now(),
      });
      window.open(whatsappUrl(message), "_blank");
      showToast("Yoklama kaydedildi, WhatsApp açılıyor…");
    } catch (err) {
      console.error("Yoklama kaydedilemedi:", err);
      showToast("Yoklama kaydedilemedi", "error");
    }
  }

  async function copy() {
    const ok = await copyToClipboard(message);
    if (ok && selectedClass) {
      try {
        await persistAttendance();
        addHistory({
          id: uid(),
          classId: selectedClass.id,
          className: selectedClass.name,
          date: today,
          type: "yoklama",
          content: message,
          createdAt: Date.now(),
        });
      } catch (err) {
        console.error("Yoklama kaydedilemedi:", err);
      }
    }
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
          <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">
            Yoklama
          </p>
          <h2 className="text-lg font-bold text-slate-800 mt-0.5">{selectedClass.name}</h2>
          <p className="text-sm text-slate-400">{formatDateLongTR(today)}</p>
          <div className="mt-3 flex gap-2">
            <CountChip color="emerald" label="Var" count={presentNames.length} />
            <CountChip color="amber" label="Geç" count={lateNames.length} />
            <CountChip color="rose" label="Yok" count={absentNames.length} />
          </div>
        </div>
      </div>

      <div className="px-4 mt-3">
        <button
          onClick={markAllPresent}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-800 text-white font-semibold active:scale-[0.98] transition"
        >
          <CheckCheck size={20} />
          Hepsini Var İşaretle
        </button>
      </div>

      <div className="px-4 mt-4 space-y-2.5">
        {students.map((s, i) => {
          const status = statuses[s.id] ?? "present";
          const isPresent = status === "present";
          const isLate = status === "late";
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition active:scale-[0.98] ${
                isPresent
                  ? "bg-emerald-50 border-emerald-500"
                  : isLate
                  ? "bg-amber-50 border-amber-500"
                  : "bg-rose-50 border-rose-400"
              }`}
            >
              <span
                className={`w-8 h-8 grid place-items-center rounded-full text-sm font-bold ${
                  isPresent
                    ? "bg-emerald-500 text-white"
                    : isLate
                    ? "bg-amber-500 text-white"
                    : "bg-rose-500 text-white"
                }`}
              >
                {i + 1}
              </span>
              <span className="flex-1 text-left font-semibold text-slate-800 truncate">
                {s.name}
              </span>
              <span
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-bold ${
                  isPresent
                    ? "bg-emerald-500 text-white"
                    : isLate
                    ? "bg-amber-500 text-white"
                    : "bg-rose-500 text-white"
                }`}
              >
                {isPresent ? (
                  <>
                    <UserCheck size={18} />
                    Var
                  </>
                ) : isLate ? (
                  <>
                    <span className="text-lg">⏱️</span>
                    Geç
                  </>
                ) : (
                  <>
                    <UserX size={18} />
                    Yok
                  </>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <ActionBar>
        <button
          onClick={saveOnly}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 text-white font-bold active:scale-[0.98] transition"
        >
          <Database size={18} />
          Kaydet
        </button>
        <button
          onClick={copy}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold active:scale-[0.98] transition"
        >
          <ClipboardCopy size={18} />
          Kopyala
        </button>
        <button
          onClick={send}
          className="flex-[1.4] flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#25D366] text-white font-bold shadow-md active:scale-[0.98] transition"
        >
          <Send size={18} />
          WhatsApp
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
  color: "emerald" | "amber" | "rose";
  label: string;
  count: number;
}) {
  const styles =
    color === "emerald"
      ? "bg-emerald-50 text-emerald-700"
      : color === "amber"
      ? "bg-amber-50 text-amber-700"
      : "bg-rose-50 text-rose-700";
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