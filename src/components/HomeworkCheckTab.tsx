import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCheck,
  ClipboardCopy,
  Database,
  Loader2,
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
import {
  ActionBar,
  CountChip,
  EmptyHint,
  StudentStatusRow,
  type StatusOption,
} from "@/components/TeacherPanelUI";
import {
  getHomeworkByClassId,
  getHomeworkChecksByHomeworkId,
  persistHomeworkChecksBatch,
  type HomeworkCheckBatchRecord,
} from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";

type Props = {
  selectedClass: SchoolClass | null;
  addHistory: (rec: HistoryRecord) => void;
};

type HomeworkListItem = Record<string, unknown> & { id: string };

/**
 * Ödev kontrolündeki üç durum, ağırlık sırasına göre (iyi → kötü).
 * Renkler veli panelindeki `CHECK_STATUS_META` ile birebir aynı tutuldu:
 * öğretmen ve veli aynı öğrenci için aynı rengi görsün.
 */
const CHECK_OPTIONS: StatusOption<HomeworkCheckStatus>[] = [
  {
    value: "done",
    label: "Yaptı",
    icon: ThumbsUp,
    activeClassName: "bg-emerald-500 text-white",
    rowClassName: "bg-emerald-50 border-emerald-400",
    badgeClassName: "bg-emerald-500 text-white",
  },
  {
    value: "incomplete",
    label: "Eksik",
    icon: AlertTriangle,
    activeClassName: "bg-rose-500 text-white",
    rowClassName: "bg-rose-50 border-rose-400",
    badgeClassName: "bg-rose-500 text-white",
  },
  {
    value: "notdone",
    label: "Yapmadı",
    icon: ThumbsDown,
    activeClassName: "bg-slate-700 text-white",
    rowClassName: "bg-slate-100 border-slate-400",
    badgeClassName: "bg-slate-700 text-white",
  },
];

export default function HomeworkCheckTab({ selectedClass, addHistory }: Props) {
  const { user } = useAuth();
  const today = todayISO();
  // Ekrandaki güncel durumlar; listede olmayan öğrenci varsayılan "done".
  const [statuses, setStatuses] = useState<Record<string, HomeworkCheckStatus>>({});
  // Firestore'da kayıtlı olan durumlar — "kaç öğrenci değişti" karşılaştırması.
  const [baseline, setBaseline] = useState<Record<string, HomeworkCheckStatus>>({});
  const [homeworkList, setHomeworkList] = useState<HomeworkListItem[]>([]);
  const [selectedHomeworkId, setSelectedHomeworkId] = useState<string>("");
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const students = selectedClass?.students ?? [];

  // Seçilen sınıfa ait ödevleri yükle; en güncel ödev seçili gelsin.
  useEffect(() => {
    if (!selectedClass) {
      setHomeworkList([]);
      setSelectedHomeworkId("");
      setStatuses({});
      setBaseline({});
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
        setBaseline({});
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
    setStatuses({});
    setBaseline({});

    if (!selectedHomeworkId) return;

    let active = true;
    setLoadingSaved(true);
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
        setBaseline(loaded);
      })
      .catch((e) => {
        console.error("Ödev kontrol kayıtları yüklenemedi:", e);
      })
      .finally(() => {
        if (active) setLoadingSaved(false);
      });

    return () => {
      active = false;
    };
  }, [selectedHomeworkId]);

  const statusOf = (id: string): HomeworkCheckStatus => statuses[id] ?? "done";
  const baselineOf = (id: string): HomeworkCheckStatus => baseline[id] ?? "done";

  const doneNames = students.filter((s) => statusOf(s.id) === "done").map((s) => s.name);
  const notDoneNames = students.filter((s) => statusOf(s.id) === "notdone").map((s) => s.name);
  const incompleteNames = students
    .filter((s) => statusOf(s.id) === "incomplete")
    .map((s) => s.name);

  const savedBefore = Object.keys(baseline).length > 0;
  const changedCount = students.filter((s) => statusOf(s.id) !== baselineOf(s.id)).length;
  const hasPendingWrite = !savedBefore || changedCount > 0;

  function setStatus(id: string, value: HomeworkCheckStatus) {
    setStatuses((prev) => ({ ...prev, [id]: value }));
  }

  /**
   * Tüm sınıfı açıkça "Tamamlandı" yapar. Eskiden `setStatuses({})` ile
   * yapılıyordu; default "done" olduğu için çalışıyordu ama örtüktü ve
   * yüklenmiş kayıtları da siliyordu.
   */
  function markAllDone() {
    setStatuses(Object.fromEntries(students.map((s) => [s.id, "done" as HomeworkCheckStatus])));
    showToast("Tüm sınıf tamamlandı olarak işaretlendi");
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

  /** Kontrol sonuçlarını TEK batch'te yazar (öğrenci başına sorgu yok). */
  async function persistAll(): Promise<boolean> {
    if (!selectedHomeworkId) {
      showToast("Lütfen kontrol edilecek ödevi seçin", "info");
      return false;
    }
    if (!selectedClass || !user || students.length === 0) return false;

    const homeworkTitle = selectedHomework
      ? String(selectedHomework.title || selectedHomework.content || "")
      : "";

    const records: HomeworkCheckBatchRecord[] = students.map((s) => ({
      classId: selectedClass.id,
      className: selectedClass.name,
      homeworkId: selectedHomeworkId,
      homeworkTitle,
      date: today,
      studentId: s.id,
      studentName: s.name,
      status: statusOf(s.id),
      teacherUid: user.uid,
    }));

    try {
      await persistHomeworkChecksBatch(records);
      setBaseline(Object.fromEntries(records.map((r) => [r.studentId, r.status])));
      return true;
    } catch (err) {
      console.error("Kontrol sonuçları kaydedilemedi:", err);
      showToast("Kontrol sonuçları kaydedilemedi", "error");
      return false;
    }
  }

  function logHistory() {
    if (!selectedClass) return;
    addHistory({
      id: uid(),
      classId: selectedClass.id,
      className: selectedClass.name,
      date: today,
      type: "odev-kontrol",
      content: message,
      createdAt: Date.now(),
    });
  }

  /** Çift tıklamayı ve eşzamanlı yazmayı engelleyen sarmalayıcı. */
  async function runSaving(action: () => Promise<void>) {
    if (saving || !selectedClass || students.length === 0) return;
    setSaving(true);
    try {
      await action();
    } finally {
      setSaving(false);
    }
  }

  async function saveOnly() {
    await runSaving(async () => {
      const ok = await persistAll();
      if (!ok) return;
      logHistory();
      showToast("Kontrol sonuçları kaydedildi ✅", "success");
    });
  }

  async function send() {
    await runSaving(async () => {
      const ok = await persistAll();
      if (!ok) return;
      logHistory();
      window.open(whatsappUrl(message), "_blank");
      showToast("Kontrol kaydedildi, WhatsApp açılıyor…");
    });
  }

  async function copy() {
    await runSaving(async () => {
      const ok = await copyToClipboard(message);
      if (ok) {
        await persistAll();
        logHistory();
      }
      showToast(ok ? "Panoya kopyalandı" : "Kopyalanamadı", ok ? "success" : "info");
    });
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
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-sky-600 uppercase tracking-wide">
                Ödev Kontrolü
              </p>
              <h2 className="text-lg font-bold text-slate-800 mt-0.5 truncate">
                {selectedClass.name}
              </h2>
              <p className="text-sm text-slate-400">{formatDateLongTR(today)}</p>
            </div>
            {loadingSaved ? (
              <span className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-500 text-[11px] font-semibold">
                <Loader2 size={12} className="animate-spin" />
                Yükleniyor
              </span>
            ) : (
              savedBefore && (
                <span className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                  ✓ Kaydedildi
                </span>
              )
            )}
          </div>

          <div className="mt-3">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              Kontrol Edilen Ödev
            </label>
            <select
              value={selectedHomeworkId}
              onChange={(e) => setSelectedHomeworkId(e.target.value)}
              disabled={saving}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-medium outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:opacity-50"
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
            <CountChip color="rose" label="Eksik" count={incompleteNames.length} />
            <CountChip color="slate" label="Yapmadı" count={notDoneNames.length} />
            {changedCount > 0 && (
              <CountChip color="amber" label="Değişen" count={changedCount} />
            )}
          </div>
        </div>
      </div>

      <div className="px-4 mt-3">
        <button
          onClick={markAllDone}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-800 text-white font-semibold active:scale-[0.98] transition disabled:opacity-50"
        >
          <CheckCheck size={20} />
          Herkes Yaptı
        </button>
        <p className="text-[11px] text-slate-400 mt-2 text-center">
          Tek dokunuşla tüm sınıf tamamlandı olur; sonra yalnızca yapmayan
          öğrencileri değiştirip kaydedin.
        </p>
      </div>

      <div className="px-4 mt-3 space-y-2">
        {students.map((s, i) => (
          <StudentStatusRow
            key={s.id}
            index={i}
            name={s.name}
            value={statusOf(s.id)}
            options={CHECK_OPTIONS}
            onChange={(value) => setStatus(s.id, value)}
            changed={statusOf(s.id) !== baselineOf(s.id)}
            disabled={saving}
          />
        ))}
      </div>

      <ActionBar>
        <button
          onClick={saveOnly}
          disabled={saving || !hasPendingWrite}
          className="flex-[1.5] flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 text-white font-bold active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
          {saving
            ? "Kaydediliyor"
            : !hasPendingWrite
            ? "Kaydedildi"
            : changedCount > 0
            ? `Kaydet (${changedCount})`
            : "Kaydet"}
        </button>
        <button
          onClick={copy}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold active:scale-[0.98] transition disabled:opacity-50"
        >
          <ClipboardCopy size={20} />
          Kopyala
        </button>
        <button
          onClick={send}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#25D366] text-white font-bold shadow-md active:scale-[0.98] transition disabled:opacity-50"
        >
          <Send size={20} />
          WhatsApp
        </button>
      </ActionBar>
    </div>
  );
}

function homeworkLabel(h: HomeworkListItem): string {
  const title = String(h.title || h.content || "Odev");
  const date = String(h.date || "");
  return date ? `${title} (${formatDateTR(date)})` : title;
}
