import { useEffect, useMemo, useState } from "react";
import {
  CheckCheck,
  ClipboardCopy,
  Clock,
  Database,
  Loader2,
  Send,
  UserCheck,
  UserX,
} from "lucide-react";
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
import {
  ActionBar,
  CountChip,
  EmptyHint,
  StudentStatusRow,
  type StatusOption,
} from "@/components/TeacherPanelUI";
import {
  getClassAttendanceByDate,
  persistAttendanceBatch,
  type AttendanceBatchRecord,
} from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";

type Props = {
  selectedClass: SchoolClass | null;
  addHistory: (rec: HistoryRecord) => void;
};

/** Yoklama satırındaki üç durum: her biri tek dokunuşla seçilir. */
const ATTENDANCE_OPTIONS: StatusOption<AttendanceStatus>[] = [
  {
    value: "present",
    label: "Var",
    icon: UserCheck,
    activeClassName: "bg-emerald-500 text-white",
    rowClassName: "bg-emerald-50 border-emerald-400",
    badgeClassName: "bg-emerald-500 text-white",
  },
  {
    value: "late",
    label: "Geç",
    icon: Clock,
    activeClassName: "bg-amber-500 text-white",
    rowClassName: "bg-amber-50 border-amber-400",
    badgeClassName: "bg-amber-500 text-white",
  },
  {
    value: "absent",
    label: "Yok",
    icon: UserX,
    activeClassName: "bg-rose-500 text-white",
    rowClassName: "bg-rose-50 border-rose-400",
    badgeClassName: "bg-rose-500 text-white",
  },
];

export default function AttendanceTab({ selectedClass, addHistory }: Props) {
  const { user } = useAuth();
  const today = todayISO();
  // Ekrandaki güncel durumlar. Bir öğrenci burada yoksa varsayılan "present"
  // kabul edilir — öğretmen yalnızca gelmeyen/geç kalanlara dokunur.
  const [statuses, setStatuses] = useState<Record<string, AttendanceStatus>>({});
  // Firestore'da bugün için KAYITLI olan durumlar. "Değişti mi?" karşılaştırması
  // ve mükerrer kayıt uyarısı bunun üzerinden yapılır.
  const [baseline, setBaseline] = useState<Record<string, AttendanceStatus>>({});
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const students = selectedClass?.students ?? [];

  // Bugünün kaydını geri yükle. Önceden bu yapılmadığı için öğretmen
  // uygulamayı kapatıp açtığında ekran "hepsi Var" olarak sıfırlanıyor ve
  // tekrar kaydedince mükerrer satır oluşuyordu.
  useEffect(() => {
    setStatuses({});
    setBaseline({});

    if (!selectedClass) return;

    let active = true;
    setLoadingSaved(true);
    getClassAttendanceByDate(selectedClass.id, today)
      .then((records) => {
        if (!active) return;
        const saved: Record<string, AttendanceStatus> = {};
        for (const r of records as { studentId?: string; status?: AttendanceStatus }[]) {
          if (r.studentId && r.status) saved[r.studentId] = r.status;
        }
        setBaseline(saved);
        setStatuses(saved);
      })
      .catch((e) => {
        console.error("Bugünün yoklaması yüklenemedi:", e);
      })
      .finally(() => {
        if (active) setLoadingSaved(false);
      });

    return () => {
      active = false;
    };
  }, [selectedClass, today]);

  const statusOf = (id: string): AttendanceStatus => statuses[id] ?? "present";
  const baselineOf = (id: string): AttendanceStatus => baseline[id] ?? "present";

  const presentNames = students.filter((s) => statusOf(s.id) === "present").map((s) => s.name);
  const lateNames = students.filter((s) => statusOf(s.id) === "late").map((s) => s.name);
  const absentNames = students.filter((s) => statusOf(s.id) === "absent").map((s) => s.name);

  const savedToday = Object.keys(baseline).length > 0;
  const changedIds = students.filter((s) => statusOf(s.id) !== baselineOf(s.id)).map((s) => s.id);
  const changedCount = changedIds.length;
  // Hiç kaydedilmemişse ilk kayıt gerekir; kaydedilmişse yalnızca değişiklik varsa.
  const hasPendingWrite = !savedToday || changedCount > 0;

  function setStatus(id: string, value: AttendanceStatus) {
    setStatuses((prev) => ({ ...prev, [id]: value }));
  }

  function markAllPresent() {
    setStatuses(Object.fromEntries(students.map((s) => [s.id, "present" as AttendanceStatus])));
    showToast("Tüm öğrenciler var işaretlendi");
  }

  const message = useMemo(
    () =>
      selectedClass
        ? buildAttendanceMessage(selectedClass.name, today, presentNames, absentNames, lateNames)
        : "",
    [selectedClass, today, presentNames, absentNames, lateNames]
  );

  /**
   * Yoklamayı ve devamsız/geç velilerinin bildirimlerini TEK batch'te yazar.
   * Deterministik doküman ID'leri sayesinde tekrar çağrılması güvenlidir
   * (üzerine yazar, mükerrer kayıt üretmez).
   */
  async function persistAttendance() {
    if (!selectedClass || !user) return;

    const records: AttendanceBatchRecord[] = students.map((s) => ({
      classId: selectedClass.id,
      className: selectedClass.name,
      date: today,
      studentId: s.id,
      studentName: s.name,
      status: statusOf(s.id),
      teacherUid: user.uid,
      parentUid: s.parentUid ?? null,
    }));

    await persistAttendanceBatch(records);

    // Kaydedilen hâl artık yeni referans: "değişiklik" sayacı sıfırlanır.
    setBaseline(Object.fromEntries(records.map((r) => [r.studentId, r.status])));
  }

  function logHistory() {
    if (!selectedClass) return;
    addHistory({
      id: uid(),
      classId: selectedClass.id,
      className: selectedClass.name,
      date: today,
      type: "yoklama",
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
      try {
        await persistAttendance();
        logHistory();
        showToast("Yoklama veritabanına kaydedildi ✅", "success");
      } catch (err) {
        console.error("Yoklama kaydedilemedi:", err);
        showToast("Yoklama kaydedilemedi", "error");
      }
    });
  }

  async function send() {
    await runSaving(async () => {
      try {
        await persistAttendance();
        logHistory();
        window.open(whatsappUrl(message), "_blank");
        showToast("Yoklama kaydedildi, WhatsApp açılıyor…");
      } catch (err) {
        console.error("Yoklama kaydedilemedi:", err);
        showToast("Yoklama kaydedilemedi", "error");
      }
    });
  }

  async function copy() {
    await runSaving(async () => {
      const ok = await copyToClipboard(message);
      if (ok) {
        try {
          await persistAttendance();
          logHistory();
        } catch (err) {
          console.error("Yoklama kaydedilemedi:", err);
        }
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
              <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">
                Yoklama
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
              savedToday && (
                <span className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-[11px] font-bold">
                  ✓ Bugün kaydedildi
                </span>
              )
            )}
          </div>

          <div className="mt-3 flex gap-2 flex-wrap">
            <CountChip color="emerald" label="Var" count={presentNames.length} />
            <CountChip color="amber" label="Geç" count={lateNames.length} />
            <CountChip color="rose" label="Yok" count={absentNames.length} />
            {changedCount > 0 && (
              <CountChip color="slate" label="Değişen" count={changedCount} />
            )}
          </div>

          <p className="text-[11px] text-slate-400 mt-2.5">
            Herkes varsayılan olarak <span className="font-semibold">Var</span>. Yalnızca
            gelmeyen veya geç kalanlara dokunmanız yeterli.
          </p>
        </div>
      </div>

      <div className="px-4 mt-3">
        <button
          onClick={markAllPresent}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-slate-800 text-white font-semibold active:scale-[0.98] transition disabled:opacity-50"
        >
          <CheckCheck size={20} />
          Hepsini Var İşaretle
        </button>
      </div>

      <div className="px-4 mt-4 space-y-2">
        {students.map((s, i) => (
          <StudentStatusRow
            key={s.id}
            index={i}
            name={s.name}
            value={statusOf(s.id)}
            options={ATTENDANCE_OPTIONS}
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
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 text-white font-bold active:scale-[0.98] transition disabled:opacity-50 disabled:active:scale-100"
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : <Database size={18} />}
          {saving ? "Kaydediliyor" : hasPendingWrite ? "Kaydet" : "Kaydedildi"}
        </button>
        <button
          onClick={copy}
          disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold active:scale-[0.98] transition disabled:opacity-50"
        >
          <ClipboardCopy size={18} />
          Kopyala
        </button>
        <button
          onClick={send}
          disabled={saving}
          className="flex-[1.4] flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#25D366] text-white font-bold shadow-md active:scale-[0.98] transition disabled:opacity-50"
        >
          <Send size={18} />
          WhatsApp
        </button>
      </ActionBar>
    </div>
  );
}
