import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  ClipboardCopy,
  Database,
  Send,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import type { HistoryRecord, HomeworkCheckStatus, SchoolClass } from "@/types";
import {
  buildHomeworkCheckMessage,
  copyToClipboard,
  formatDateLongTR,
  formatDateTR,
  todayISO,
  uid,
  whatsappUrl,
} from "@/lib/utils";
import { showToast } from "@/components/Toast";
import { ActionBar } from "@/components/AttendanceTab";
import {
  getHomeworkByClassId,
  getHomeworkChecksByHomeworkId,
  persistHomeworkChecks,
} from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";

type Props = {
  selectedClass: SchoolClass | null;
  addHistory: (rec: HistoryRecord) => void;
};

type HomeworkListItem = Record<string, unknown> & { id: string };

export default function HomeworkCheckTab({ selectedClass, addHistory }: Props) {
  const { user } = useAuth();
  const today = todayISO();
  const [statuses, setStatuses] = useState<Record<string, HomeworkCheckStatus>>({});
  const [homeworkList, setHomeworkList] = useState<HomeworkListItem[]>([]);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string>("");

  const students = selectedClass?.students ?? [];

  // Seçilen sınıfa ait ödevleri yükle; en güncel ödev seçili gelsin.
  useEffect(() => {
    if (!selectedClass) {
      setHomeworkList([]);
      setSelectedHomeworkId("");
      setStatuses({});
      return;
    }

    let active = true;
    getHomeworkByClassId(selectedClass.id)
      .then((list) => {
        if (!active) return;
        const items = list as HomeworkListItem[];
        setHomeworkList(items);
        setSelectedHomeworkId(items.length > 0 ? items[0].id : "");
        setStatuses({});
      })
      .catch((e) => {
        console.error("Ödev listesi yüklenemedi:", e);
        setHomeworkList([]);
        setSelectedHomeworkId("");
      });

    return () => {
      active = false;
    };
  }, [selectedClass]);

  // Seçilen ödev için daha önce kaydedilmiş kontrol sonuçlarını geri yükle.
  useEffect(() => {
    if (!selectedHomeworkId) {
      setStatuses({});
      return;
    }

    let active = true;
    getHomeworkChecksByHomeworkId(selectedHomeworkId)
      .then((checks) => {
        if (!active) return;
        const latestByStudent = new Map<string, { status: HomeworkCheckStatus; date: string }>();
        for (const c of checks) {
          const existing = latestByStudent.get(c.studentId);
          if (!existing || (c.date || "") > existing.date) {
            latestByStudent.set(c.studentId, { status: c.status, date: c.date || "" });
          }
        }
        const loaded: Record<string, HomeworkCheckStatus> = {};
        for (const [sid, rec] of latestByStudent) {
          loaded[sid] = rec.status;
        }
        setStatuses(loaded);
      })
      .catch((e) => {
        console.error("Ödev kontrol kayıtları yüklenemedi:", e);
      });

    return () => {
      active = false;
    };
  }, [selectedHomeworkId]);

  const doneNames = students
    .filter((s) => (statuses[s.id] ?? "done") === "done")
    .map((s) => s.name);
  const notDoneNames = students
    .filter((s) => (statuses[s.id] ?? "done") === "notdone")
    .map((s) => s.name);
  const incompleteNames = students
    .filter((s) => (statuses[s.id] ?? "done") === "incomplete")
    .map((s) => s.name);

  function toggle(id: string) {
    setStatuses((prev) => {
      const current = prev[id] ?? "done";
      const next: HomeworkCheckStatus =
        current === "done" ? "notdone" : current === "notdone" ? "incomplete" : "done";
      return { ...prev, [id]: next };
    });
  }

  function markAllDone() {
    setStatuses({});
    showToast("Tüm öğrenciler yaptı işaretlendi");
  }

  const selectedHomework = homeworkList.find((h) => h.id === selectedHomeworkId) ?? null;

  const message = useMemo(
    () =>
      selectedClass
        ? buildHomeworkCheckMessage(
            selectedClass.name,
            today,
            doneNames,
            notDoneNames,
            incompleteNames
          )
        : "",
    [selectedClass, today, doneNames, notDoneNames, incompleteNames]
  );

  async function buildCheckRecords() {
    if (!selectedClass || !user || !selectedHomeworkId || students.length === 0) return null;
    const homeworkTitle = selectedHomework
      ? String(selectedHomework.title || selectedHomework.content || "")
      : "";
    return students.map((s) => ({
      classId: selectedClass.id,
      className: selectedClass.name,
      homeworkId: selectedHomeworkId,
      homeworkTitle,
      date: today,
      studentId: s.id,
      studentName: s.name,
      status: (statuses[s.id] ?? "done") as HomeworkCheckStatus,
      teacherUid: user.uid,
    }));
  }

  async function persistAll(): Promise<boolean> {
    if (!selectedHomeworkId) {
      showToast("Lütfen kontrol edilecek ödevi seçin", "info");
      return false;
    }
    try {
      const records = await buildCheckRecords();
      if (!records) return false;
      await persistHomeworkChecks(records);
      return true;
    } catch (err) {
      console.error("Kontrol sonuçları kaydedilemedi:", err);
      showToast("Kontrol sonuçları kaydedilemedi", "error");
      return false;
    }
  }

  // Kontrol sonuçlarını Firestore'daki `homework_checks` koleksiyonuna yazar.
  async function saveOnly() {
    if (!selectedClass || students.length === 0) return;
    const ok = await persistAll();
    if (!ok) return;
    addHistory({
      id: uid(),
      classId: selectedClass.id,
      className: selectedClass.name,
      date: today,
      type: "odev-kontrol",
      content: message,
      createdAt: Date.now(),
    });
    showToast("Kontrol sonuçları kaydedildi ✅", "success");
  }

  // WhatsApp butonuna basıldığında kontrol sonuçlarını otomatik kaydeder.
  async function send() {
    if (!selectedClass || students.length === 0) return;
    const ok = await persistAll();
    if (!ok) return;
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
    showToast("Kontrol kaydedildi, WhatsApp açılıyor…");
  }

  async function copy() {
    if (!selectedClass || students.length === 0) return;
    const ok = await copyToClipboard(message);
    if (ok) {
      await persistAll();
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
          <p className="text-xs font-medium text-sky-600 uppercase tracking-wide">
            Ödev Kontrolü
          </p>
          <h2 className="text-lg font-bold text-slate-800 mt-0.5">{selectedClass.name}</h2>
          <p className="text-sm text-slate-400">{formatDateLongTR(today)}</p>

          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Kontrol Edilen Ödev
            </label>
            <select
              value={selectedHomeworkId}
              onChange={(e) => setSelectedHomeworkId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
            >
              {homeworkList.length === 0 && <option value="">Ödev bulunamadı</option>}
              {homeworkList.map((h) => (
                <option key={h.id} value={h.id}>
                  {homeworkLabel(h)}
                </option>
              ))}
            </select>
            {selectedHomework && (
              <p className="text-xs text-slate-500 mt-1.5 truncate">
                {String(selectedHomework.description || selectedHomework.content || "")}
              </p>
            )}
            <p className="text-[11px] text-slate-400 mt-1.5">
              Kontrol sonuçları veli panelinde anlık görünür.
            </p>
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
            <CountChip color="emerald" label="Yaptı" count={doneNames.length} />
            <CountChip color="amber" label="Yapmadı" count={notDoneNames.length} />
            <CountChip color="rose" label="Eksik" count={incompleteNames.length} />
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
          const status = statuses[s.id] ?? "done";
          const isDone = status === "done";
          const isNotDone = status === "notdone";
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition active:scale-[0.98] ${
                isDone
                  ? "bg-emerald-50 border-emerald-500"
                  : isNotDone
                  ? "bg-amber-50 border-amber-400"
                  : "bg-rose-50 border-rose-400"
              }`}
            >
              <span
                className={`w-8 h-8 grid place-items-center rounded-full text-sm font-bold ${
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isNotDone
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
                  isDone
                    ? "bg-emerald-500 text-white"
                    : isNotDone
                    ? "bg-amber-500 text-white"
                    : "bg-rose-500 text-white"
                }`}
              >
                {isDone ? (
                  <>
                    <ThumbsUp size={18} />
                    Yaptı
                  </>
                ) : isNotDone ? (
                  <>
                    <ThumbsDown size={18} />
                    Yapmadı
                  </>
                ) : (
                  <>
                    <AlertTriangle size={18} />
                    Eksik
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
          <ClipboardCopy size={20} />
          Kopyala
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

function homeworkLabel(h: HomeworkListItem): string {
  const title = String(h.title || h.content || "Odev");
  const date = String(h.date || "");
  return date ? `${title} (${formatDateTR(date)})` : title;
}
