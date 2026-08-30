import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  GraduationCap,
  LogOut,
  Bell,
  BookOpen,
  CalendarCheck,
  User,
  ChevronDown,
  Check,
  ClipboardCheck,
  Hourglass,
} from "lucide-react";
import { showToast } from "@/components/Toast";
import {
  getStudentsByParentUid,
  getAttendanceByParentUid,
  getHomeworkByParentUid,
  getNotificationsByParentUid,
  markNotificationRead,
  subscribeNotifications,
  subscribeClasses,
  subscribeAttendanceByStudentIds,
  subscribeHomeworkByClassIds,
  subscribeHomeworkChecksByStudentId,
} from "@/lib/firestore";
import { formatDateLongTR, formatDateTR } from "@/lib/utils";
import type { HomeworkCheckRecord, NotificationRecord } from "@/types";

type Tab = "overview" | "attendance" | "homework" | "tracking" | "notifications";

interface AttendanceRecord {
  id: string;
  studentId: string;
  studentName: string;
  className: string;
  status: "present" | "late" | "absent";
  date: string;
}

interface HomeworkRecord {
  id: string;
  classId: string;
  className: string;
  date: string;
  title?: string;
  description?: string;
  content?: string;
  dueDateISO?: string;
}

interface ChildRecord {
  id: string;
  name: string;
  className: string;
  classId: string;
}

/**
 * Veli panelinde bir ödevin seçili öğrenci için aldığı durum.
 * `pending` = öğretmen bu ödevi henüz kontrol etmedi.
 */
type CheckStatusKey = "done" | "incomplete" | "notdone" | "pending";

const CHECK_STATUS_META: Record<
  CheckStatusKey,
  { label: string; pillClassName: string; dotClassName: string; countClassName: string }
> = {
  done: {
    label: "Tamamlandı 🟢",
    pillClassName: "bg-emerald-50 text-emerald-700",
    dotClassName: "bg-emerald-500",
    countClassName: "bg-emerald-50 text-emerald-700",
  },
  incomplete: {
    label: "Eksik 🔴",
    pillClassName: "bg-rose-50 text-rose-700",
    dotClassName: "bg-rose-500",
    countClassName: "bg-rose-50 text-rose-700",
  },
  notdone: {
    label: "Yapılmadı ✖️",
    pillClassName: "bg-slate-700 text-white",
    dotClassName: "bg-slate-700",
    countClassName: "bg-slate-100 text-slate-700",
  },
  pending: {
    label: "Kontrol Bekliyor 🟡",
    pillClassName: "bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-400",
    countClassName: "bg-amber-50 text-amber-700",
  },
};

/** "Ödev Takibi" sekmesindeki sayaçların ve legend'ın kısa etiketleri. */
const CHECK_STATUS_SHORT: Record<CheckStatusKey, string> = {
  done: "Tamamlandı",
  incomplete: "Eksik",
  notdone: "Yapılmadı",
  pending: "Bekliyor",
};

/**
 * Bir ödevin belirli bir öğrenci için son kontrol durumunu döndürür.
 * Aynı ödev + öğrenci için birden fazla kontrol kaydı varsa en güncel
 * tarihli olan geçerlidir. Hiç kayıt yoksa "pending".
 */
function resolveCheckStatus(
  checks: HomeworkCheckRecord[],
  homeworkId: string,
  studentId: string
): { key: CheckStatusKey; record: HomeworkCheckRecord | null } {
  let latest: HomeworkCheckRecord | null = null;
  for (const c of checks) {
    if (c.homeworkId !== homeworkId || c.studentId !== studentId) continue;
    if (!latest || (c.date || "") > (latest.date || "")) latest = c;
  }
  return { key: latest ? latest.status : "pending", record: latest };
}

export default function ParentDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [students, setStudents] = useState<ChildRecord[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [homework, setHomework] = useState<HomeworkRecord[]>([]);
  const [homeworkChecks, setHomeworkChecks] = useState<HomeworkCheckRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  // Seçili çocuk: tüm sekmeler bu öğrenciye göre filtrelenir.
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [childPickerOpen, setChildPickerOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    let active = true;

    async function load() {
      try {
        // Her sorguyu ayrı ayrı dene; biri başarısız olsa bile diğerleri
        // paneli güncelleyebilsin (Promise.all tek hata ile her şeyi bloke eder).
        const [studentList, attendanceList, homeworkList, notifList] = await Promise.all([
          getStudentsByParentUid(uid).catch((e) => {
            console.error("Öğrenciler yüklenemedi:", e);
            return [];
          }),
          getAttendanceByParentUid(uid).catch((e) => {
            console.error("Yoklamalar yüklenemedi:", e);
            return [];
          }),
          getHomeworkByParentUid(uid).catch((e) => {
            console.error("Ödevler yüklenemedi:", e);
            return [];
          }),
          getNotificationsByParentUid(uid).catch((e) => {
            console.error("Bildirimler yüklenemedi:", e);
            return [];
          }),
        ]);
        if (!active) return;
        setStudents(studentList);
        setAttendance(attendanceList as unknown as AttendanceRecord[]);
        setHomework(homeworkList as unknown as HomeworkRecord[]);
        setNotifications(notifList as NotificationRecord[]);
      } catch (err) {
        console.error("Veli paneli yüklenemedi:", err);
        showToast("Veriler yüklenemedi", "error");
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    // Live notifications
    const unsubNotif = subscribeNotifications(uid, (list) => {
      if (active) setNotifications(list);
    });

    // Live classes: when admin pairs a student to this parent,
    // the students list updates immediately without a manual refresh.
    const unsubClasses = subscribeClasses((classList) => {
      if (!active) return;
      const matched: ChildRecord[] = [];
      for (const c of classList) {
        const classStudents = c.students?.filter((s) => s.parentUid === uid) || [];
        for (const s of classStudents) {
          matched.push({ id: s.id, name: s.name, className: c.name, classId: c.id });
        }
      }
      // Yalnızca gerçekten değişiklik varsa state'i güncelle;
      // aksi halde aynı referansla abonelik yeniden kurulmaz.
      setStudents((prev) => {
        if (
          prev.length === matched.length &&
          prev.every(
            (s, i) =>
              s.id === matched[i].id &&
              s.name === matched[i].name &&
              s.className === matched[i].className
          )
        ) {
          return prev;
        }
        return matched;
      });
    });

    return () => {
      active = false;
      unsubNotif();
      unsubClasses();
    };
  }, [user]);

  // Seçili çocuğu güncel tut: ilk yüklemede ilk çocuk seçilir. Seçili
  // çocuk listeden kalkarsa (eşleştirme kaldırıldı) yine ilk çocuğa döner.
  useEffect(() => {
    if (students.length === 0) {
      setSelectedStudentId("");
      return;
    }
    setSelectedStudentId((prev) =>
      students.some((s) => s.id === prev) ? prev : students[0].id
    );
  }, [students]);

  // Live attendance: teacher yoklama kaydettiğinde sayaçlar ve liste
  // anında güncellenir. Eşleşen öğrenci listesi değiştiğinde aboneliği
  // yeniden kur.
  //
  // NOT: Abonelikler TÜM çocuklar için kurulur, filtreleme render
  // sırasında yapılır. Böylece veli çocuk değiştirdiğinde yeniden veri
  // çekilmez, geçiş anında olur.
  useEffect(() => {
    if (!user) return;
    let active = true;

    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) {
      setAttendance([]);
      return;
    }

    const unsubAttendance = subscribeAttendanceByStudentIds(studentIds, (records) => {
      if (!active) return;
      setAttendance(records as unknown as AttendanceRecord[]);
    });

    return () => {
      active = false;
      unsubAttendance();
    };
  }, [user, students]);

  // Live homework: teacher ödev kaydettiğinde Ödev sayacı ve liste
  // anında güncellenir. Eşleşen sınıf listesi değiştiğinde aboneliği
  // yeniden kur.
  useEffect(() => {
    if (!user) return;
    let active = true;

    const classIds = Array.from(new Set(students.map((s) => s.classId)));
    if (classIds.length === 0) {
      setHomework([]);
      return;
    }

    const unsubHomework = subscribeHomeworkByClassIds(classIds, (records) => {
      if (!active) return;
      setHomework(records as unknown as HomeworkRecord[]);
    });

    return () => {
      active = false;
      unsubHomework();
    };
  }, [user, students]);

  // Live homework checks: teacher "Kontrol Sonuçlarını Kaydet" butonuna
  // bastığında veli panelindeki ödev kartlarındaki durum etiketleri ve
  // "Ödev Takibi" sekmesi anında güncellenir. Eşleşen öğrenci listesi
  // değiştiğinde aboneliği yeniden kur.
  useEffect(() => {
    if (!user) return;
    let active = true;

    const studentIds = students.map((s) => s.id);
    if (studentIds.length === 0) {
      setHomeworkChecks([]);
      return;
    }

    const unsubChecks = subscribeHomeworkChecksByStudentId(studentIds, (records) => {
      if (!active) return;
      setHomeworkChecks(records);
    });

    return () => {
      active = false;
      unsubChecks();
    };
  }, [user, students]);

  // ─── Seçili çocuğa göre filtrelenmiş veriler ───────────────────────
  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedStudentId) || students[0] || null,
    [students, selectedStudentId]
  );

  const childAttendance = useMemo(
    () =>
      selectedStudent
        ? attendance.filter((a) => a.studentId === selectedStudent.id)
        : [],
    [attendance, selectedStudent]
  );

  const childHomework = useMemo(
    () =>
      selectedStudent
        ? homework.filter((h) => h.classId === selectedStudent.classId)
        : [],
    [homework, selectedStudent]
  );

  const childNotifications = useMemo(
    () =>
      selectedStudent
        ? notifications.filter((n) => n.studentId === selectedStudent.id)
        : [],
    [notifications, selectedStudent]
  );

  /**
   * "Ödev Takibi" sekmesinin veri modeli: seçili çocuğun sınıfına ait her
   * ödev, öğretmenin `homework_checks` kaydına göre bir duruma bağlanır.
   * Liste kronolojik (en yeni önce) — `childHomework` zaten tarihe göre
   * azalan sırada geliyor.
   */
  const trackingRows = useMemo(() => {
    if (!selectedStudent) return [];
    return childHomework.map((h) => {
      const { key, record } = resolveCheckStatus(homeworkChecks, h.id, selectedStudent.id);
      return { homework: h, statusKey: key, check: record };
    });
  }, [childHomework, homeworkChecks, selectedStudent]);

  const trackingCounts = useMemo(() => {
    const counts: Record<CheckStatusKey, number> = {
      done: 0,
      incomplete: 0,
      notdone: 0,
      pending: 0,
    };
    for (const row of trackingRows) counts[row.statusKey]++;
    return counts;
  }, [trackingRows]);

  // Tamamlama oranı yalnızca ÖĞRETMENİN KONTROL ETTİĞİ ödevler üzerinden
  // hesaplanır; henüz kontrol edilmemiş ödevler oranı düşürmemeli.
  const checkedCount =
    trackingCounts.done + trackingCounts.incomplete + trackingCounts.notdone;
  const completionRate =
    checkedCount > 0 ? Math.round((trackingCounts.done / checkedCount) * 100) : 0;

  // Seçili çocuğun okunmamış bildirim sayısı — Genel sekmesindeki
  // "Bildirim" sayacı seçili çocuk bağlamında olduğu için bunu kullanır.
  const unreadCount = childNotifications.filter((n) => !n.read).length;

  // TÜM çocukların okunmamış bildirim toplamı — alt bardaki kırmızı rozet
  // bunu gösterir. Böylece veli Ahmet'in ekranındayken Ayşe'ye gelen bir
  // bildirimi de anında fark eder.
  const totalUnreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications]
  );

  async function handleMarkRead(id: string) {
    try {
      await markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch (err) {
      console.error("Bildirim okundu olarak işaretlenemedi:", err);
      showToast("Bildirim güncellenemedi", "error");
    }
  }

  function selectChild(id: string) {
    setSelectedStudentId(id);
    setChildPickerOpen(false);
    const child = students.find((s) => s.id === id);
    if (child) showToast(`${child.name} seçildi`, "info");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-blue-600 grid place-items-center text-white mx-auto mb-4 animate-spin">
            <GraduationCap size={24} />
          </div>
          <p className="text-slate-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-600 grid place-items-center text-white shrink-0">
              <GraduationCap size={22} />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-800 truncate">Veli Paneli</h1>
              <p className="text-xs text-slate-400 truncate">
                {students.length > 0
                  ? `${students.length} çocuk eşleştirildi`
                  : "Çocuk eşleştirilmedi"}
              </p>
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              showToast("Çıkış yapıldı", "info");
            }}
            className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-600 transition"
            title="Çıkış Yap"
          >
            <LogOut size={20} />
          </button>
        </div>

        {/* Çocuk seçici: tek çocukta sabit kart, çoklu çocukta dropdown. */}
        {selectedStudent && (
          <div className="mx-auto max-w-md px-4 pb-3">
            {students.length > 1 ? (
              <button
                onClick={() => setChildPickerOpen((v) => !v)}
                aria-expanded={childPickerOpen}
                className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 active:scale-[0.98] transition"
              >
                <div className="w-8 h-8 rounded-full bg-blue-500 grid place-items-center text-white text-sm font-bold shrink-0">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-semibold text-slate-800 truncate leading-tight">
                    {selectedStudent.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {selectedStudent.className}
                  </p>
                </div>
                <ChevronDown
                  size={18}
                  className={`text-slate-400 transition-transform shrink-0 ${
                    childPickerOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
            ) : (
              <div className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="w-8 h-8 rounded-full bg-blue-500 grid place-items-center text-white text-sm font-bold shrink-0">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 truncate leading-tight">
                    {selectedStudent.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {selectedStudent.className}
                  </p>
                </div>
              </div>
            )}

            {childPickerOpen && students.length > 1 && (
              <div className="mt-2 bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <p className="px-4 pt-3 pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                  Öğrenci Seçin
                </p>
                {students.map((s) => {
                  const active = s.id === selectedStudent.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => selectChild(s.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition ${
                        active ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-full grid place-items-center text-white text-sm font-bold shrink-0 ${
                          active ? "bg-blue-600" : "bg-slate-300"
                        }`}
                      >
                        {s.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className={`truncate ${
                            active ? "font-bold text-blue-700" : "font-semibold text-slate-700"
                          }`}
                        >
                          {s.name}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">{s.className}</p>
                      </div>
                      {active && <Check size={18} className="text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </header>

      {/* No children paired */}
      {students.length === 0 && (
        <div className="mx-auto max-w-md px-4 pt-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 grid place-items-center text-blue-500 mx-auto mb-4">
            <User size={32} />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Henüz çocuk eşleştirilmedi</h2>
          <p className="text-sm text-slate-500 mt-2">
            Yöneticinizden öğrenci profilinizi hesabınıza bağlamasını isteyin.
          </p>
        </div>
      )}

      {/* Overview */}
      {selectedStudent && tab === "overview" && (
        <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={<CalendarCheck size={20} className="text-emerald-600" />}
              label="Yoklama"
              value={childAttendance.length}
              bg="bg-emerald-50"
            />
            <StatCard
              icon={<BookOpen size={20} className="text-violet-600" />}
              label="Ödev"
              value={childHomework.length}
              bg="bg-violet-50"
            />
            <StatCard
              icon={<Bell size={20} className="text-rose-600" />}
              label="Bildirim"
              value={unreadCount}
              bg="bg-rose-50"
            />
          </div>

          {/* Ödev takibi özeti */}
          <button
            onClick={() => setTab("tracking")}
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-slate-100 p-4 active:scale-[0.99] transition"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-slate-800">Ödev Takibi</h2>
              <span className="text-xs font-semibold text-blue-600">Tümünü gör →</span>
            </div>
            {childHomework.length === 0 ? (
              <p className="text-sm text-slate-400">Henüz ödev paylaşılmadı.</p>
            ) : checkedCount === 0 ? (
              /* Hiç kontrol edilmiş ödev yoksa boş bir progress bar göstermek
                 yerine bilgilendirme mesajı gösterilir. */
              <div className="flex items-center gap-2.5 rounded-xl bg-amber-50 px-3 py-2.5">
                <Hourglass size={16} className="text-amber-600 shrink-0" />
                <p className="text-xs text-amber-700 font-medium">
                  Henüz kontrol edilen ödev bulunmuyor.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-end justify-between mb-1.5">
                  <p className="text-xs text-slate-500">Tamamlama oranı</p>
                  <p className="text-lg font-bold text-slate-800 leading-none">
                    %{completionRate}
                  </p>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-2">
                  {checkedCount} kontrol edilen ödevin {trackingCounts.done} tanesi tamamlandı
                </p>
              </>
            )}
          </button>

          {/* Children */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-3">Çocuklarım</h2>
            <div className="space-y-2">
              {students.map((s) => {
                const active = s.id === selectedStudent.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => selectChild(s.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
                      active ? "bg-blue-50 border border-blue-200" : "bg-slate-50 border border-transparent"
                    }`}
                  >
                    <div
                      className={`w-9 h-9 rounded-full grid place-items-center text-white text-sm font-bold shrink-0 ${
                        active ? "bg-blue-600" : "bg-slate-300"
                      }`}
                    >
                      {s.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{s.name}</p>
                      <p className="text-xs text-slate-400">{s.className}</p>
                    </div>
                    {active && <Check size={18} className="text-blue-600 shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recent notifications */}
          {childNotifications.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-800 mb-3">Son Bildirimler</h2>
              <div className="space-y-2">
                {childNotifications.slice(0, 3).map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl border ${
                      n.read ? "bg-slate-50 border-slate-100" : "bg-rose-50 border-rose-200"
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-800">
                      {n.type === "absent" ? "❌ Yok" : "⏱️ Geç"} — {n.studentName}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">{n.message}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Attendance */}
      {selectedStudent && tab === "attendance" && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <TabHeading title="Yoklama Geçmişi" student={selectedStudent} />
          {childAttendance.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">
              Henüz yoklama kaydı yok.
            </p>
          ) : (
            <div className="space-y-2.5">
              {childAttendance.map((rec) => (
                <div
                  key={rec.id}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{rec.studentName}</p>
                      <p className="text-xs text-slate-400">{rec.className}</p>
                    </div>
                    <span
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                        rec.status === "present"
                          ? "bg-emerald-50 text-emerald-700"
                          : rec.status === "late"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      {rec.status === "present"
                        ? "✅ Var"
                        : rec.status === "late"
                        ? "⏱️ Geç"
                        : "❌ Yok"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-2">
                    {formatDateLongTR(rec.date)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Homework — ödevlerin genel detayları */}
      {selectedStudent && tab === "homework" && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <TabHeading title="Ödevler" student={selectedStudent} />
          {childHomework.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">
              Henüz ödev paylaşılmadı.
            </p>
          ) : (
            <div className="space-y-2.5">
              {childHomework.map((h) => {
                const { key } = resolveCheckStatus(homeworkChecks, h.id, selectedStudent.id);
                const status = CHECK_STATUS_META[key];
                return (
                  <div
                    key={h.id}
                    className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800 truncate">
                          {h.title || h.className}
                        </p>
                        <p className="text-xs text-slate-400">{h.className}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <p className="text-xs text-slate-400">{formatDateLongTR(h.date)}</p>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${status.pillClassName}`}
                        >
                          {status.label}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">
                      {h.description || h.content}
                    </p>
                    {h.dueDateISO && (
                      <p className="text-xs font-semibold text-violet-600 mt-2">
                        🗓️ Teslim: {formatDateLongTR(h.dueDateISO)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Ödev Takibi — tamamlama durumu odaklı kronolojik liste */}
      {selectedStudent && tab === "tracking" && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <TabHeading title="Ödev Takibi" student={selectedStudent} />

          {trackingRows.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">
              Bu öğrenci için henüz ödev paylaşılmadı.
            </p>
          ) : (
            <>
              {/* Özet: tamamlama oranı + durum sayaçları */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4 mb-3">
                {checkedCount === 0 ? (
                  /* Öğretmen bu öğrencinin hiçbir ödevini kontrol etmediyse
                     %0'lık boş bir progress bar yerine bilgilendirme gösterilir. */
                  <div className="flex items-start gap-3 rounded-xl bg-amber-50 px-3.5 py-3">
                    <Hourglass size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-amber-800 leading-tight">
                        Henüz kontrol edilen ödev bulunmuyor
                      </p>
                      <p className="text-[11px] text-amber-700 mt-1">
                        Öğretmen {trackingRows.length} ödevi kontrol ettiğinde tamamlama
                        oranı burada görünecek.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between mb-1.5">
                      <p className="text-sm font-bold text-slate-800">Tamamlama Oranı</p>
                      <p className="text-2xl font-bold text-slate-800 leading-none">
                        %{completionRate}
                      </p>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                    <p className="text-[11px] text-slate-400 mt-2">
                      Kontrol edilen {checkedCount} ödevin {trackingCounts.done} tanesi
                      tamamlandı. Toplam {trackingRows.length} ödev.
                    </p>
                  </>
                )}

                <div className="grid grid-cols-4 gap-2 mt-4">
                  {(["done", "incomplete", "notdone", "pending"] as const).map((key) => (
                    <div
                      key={key}
                      className={`rounded-xl p-2.5 text-center ${CHECK_STATUS_META[key].countClassName}`}
                    >
                      <p className="text-lg font-bold leading-none">{trackingCounts[key]}</p>
                      <p className="text-[10px] font-semibold mt-1 leading-tight">
                        {CHECK_STATUS_SHORT[key]}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Kronolojik liste (en yeni ödev en üstte) */}
              <div className="space-y-2">
                {trackingRows.map(({ homework: h, statusKey, check }) => {
                  const status = CHECK_STATUS_META[statusKey];
                  return (
                    <div
                      key={h.id}
                      className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3.5 flex items-start gap-3"
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${status.dotClassName}`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">
                          {h.title || h.className}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Verildi: {formatDateTR(h.date)}
                          {h.dueDateISO && ` · Teslim: ${formatDateTR(h.dueDateISO)}`}
                        </p>
                        {check ? (
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Kontrol: {formatDateTR(check.date)}
                          </p>
                        ) : (
                          <p className="text-[11px] text-amber-600 mt-0.5">
                            Öğretmen henüz kontrol etmedi
                          </p>
                        )}
                      </div>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap shrink-0 ${status.pillClassName}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Notifications */}
      {selectedStudent && tab === "notifications" && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <TabHeading title="Bildirimler" student={selectedStudent} />
          {childNotifications.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">
              Henüz bildirim yok.
            </p>
          ) : (
            <div className="space-y-2.5">
              {childNotifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read && handleMarkRead(n.id)}
                  className={`w-full text-left bg-white rounded-2xl shadow-sm border p-4 transition ${
                    n.read ? "border-slate-100" : "border-rose-200 bg-rose-50/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-800">
                      {n.type === "absent" ? "❌ Yok" : "⏱️ Geç"} — {n.studentName}
                    </p>
                    {!n.read && <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-2">{formatDateLongTR(n.date)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom nav */}
      {selectedStudent && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-100 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
          <div className="mx-auto max-w-md grid grid-cols-5">
            {(
              [
                { key: "overview", label: "Genel", icon: GraduationCap },
                { key: "attendance", label: "Yoklama", icon: CalendarCheck },
                { key: "homework", label: "Ödev", icon: BookOpen },
                { key: "tracking", label: "Takip", icon: ClipboardCheck },
                { key: "notifications", label: "Bildirim", icon: Bell },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              const showBadge = t.key === "notifications" && totalUnreadCount > 0;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 transition relative ${
                    active ? "text-blue-600" : "text-slate-400"
                  }`}
                >
                  <Icon
                    size={20}
                    strokeWidth={active ? 2.5 : 2}
                    className={active ? "scale-110 transition-transform" : ""}
                  />
                  <span className={`text-[10px] ${active ? "font-bold" : "font-medium"}`}>
                    {t.label}
                  </span>
                  {showBadge && (
                    <span
                      className="absolute top-1.5 right-[calc(50%-20px)] w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold grid place-items-center"
                      title={`${totalUnreadCount} okunmamış bildirim (tüm çocuklar)`}
                    >
                      {totalUnreadCount > 9 ? "9+" : totalUnreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

/** Sekme başlığı + hangi öğrencinin verisi gösterildiğini belirten alt satır. */
function TabHeading({ title, student }: { title: string; student: ChildRecord }) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-bold text-slate-800 leading-tight">{title}</h2>
      <p className="text-xs text-slate-400">
        {student.name} · {student.className}
      </p>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-2xl p-4 text-center`}>
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-500 font-medium">{label}</p>
    </div>
  );
}
