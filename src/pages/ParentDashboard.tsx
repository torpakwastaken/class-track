import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { GraduationCap, LogOut, Bell, BookOpen, CalendarCheck, User } from "lucide-react";
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
import { formatDateLongTR } from "@/lib/utils";
import type { HomeworkCheckRecord, NotificationRecord } from "@/types";

type Tab = "overview" | "attendance" | "homework" | "notifications";

interface AttendanceRecord {
  id: string;
  studentName: string;
  className: string;
  status: "present" | "late" | "absent";
  date: string;
}

interface HomeworkRecord {
  id: string;
  className: string;
  date: string;
  title?: string;
  description?: string;
  content?: string;
  dueDateISO?: string;
}

export default function ParentDashboard() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [students, setStudents] = useState<{ id: string; name: string; className: string; classId: string }[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [homework, setHomework] = useState<HomeworkRecord[]>([]);
  const [homeworkChecks, setHomeworkChecks] = useState<HomeworkCheckRecord[]>([]);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
      const matched: { id: string; name: string; className: string; classId: string }[] = [];
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

  // Live attendance: teacher yoklama kaydettiğinde sayaçlar ve liste
  // anında güncellenir. Eşleşen öğrenci listesi değiştiğinde aboneliği
  // yeniden kur.
  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
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
  // bastığında veli panelindeki ödev kartlarındaki durum etiketleri anında
  // güncellenir. Eşleşen öğrenci listesi değiştiğinde aboneliği yeniden kur.
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

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function handleMarkRead(id: string) {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
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
                  ? students.map((s) => s.name).join(", ")
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
      {students.length > 0 && tab === "overview" && (
        <div className="mx-auto max-w-md px-4 pt-4 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <StatCard
              icon={<CalendarCheck size={20} className="text-emerald-600" />}
              label="Yoklama"
              value={attendance.length}
              bg="bg-emerald-50"
            />
            <StatCard
              icon={<BookOpen size={20} className="text-violet-600" />}
              label="Ödev"
              value={homework.length}
              bg="bg-violet-50"
            />
            <StatCard
              icon={<Bell size={20} className="text-rose-600" />}
              label="Bildirim"
              value={unreadCount}
              bg="bg-rose-50"
            />
          </div>

          {/* Children */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
            <h2 className="text-sm font-bold text-slate-800 mb-3">Çocuklarım</h2>
            <div className="space-y-2">
              {students.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50"
                >
                  <div className="w-9 h-9 rounded-full bg-blue-500 grid place-items-center text-white text-sm font-bold">
                    {s.name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 truncate">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.className}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent notifications */}
          {notifications.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <h2 className="text-sm font-bold text-slate-800 mb-3">Son Bildirimler</h2>
              <div className="space-y-2">
                {notifications.slice(0, 3).map((n) => (
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
      {students.length > 0 && tab === "attendance" && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Yoklama Geçmişi</h2>
          {attendance.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">
              Henüz yoklama kaydı yok.
            </p>
          ) : (
            <div className="space-y-2.5">
              {attendance.map((rec) => (
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

      {/* Homework */}
      {students.length > 0 && tab === "homework" && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Ödevler</h2>
          {homework.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">
              Henüz ödev paylaşılmadı.
            </p>
          ) : (
            <div className="space-y-2.5">
              {homework.map((h) => {
                const checks = homeworkChecks.filter((c) => c.homeworkId === h.id);
                const latestByStudent = new Map<string, HomeworkCheckRecord>();
                for (const c of checks) {
                  const existing = latestByStudent.get(c.studentId);
                  if (!existing || (c.date || "") > (existing.date || "")) {
                    latestByStudent.set(c.studentId, c);
                  }
                }
                const checkList = Array.from(latestByStudent.values());
                const allDone = checkList.length > 0 && checkList.every((c) => c.status === "done");
                const anyIncomplete = checkList.some((c) => c.status === "incomplete");
                type CheckStatusKey = "done" | "incomplete" | "notdone" | "pending";
                const statusKey: CheckStatusKey =
                  checkList.length === 0
                    ? "pending"
                    : allDone
                    ? "done"
                    : anyIncomplete
                    ? "incomplete"
                    : "notdone";
                const statusMeta: Record<CheckStatusKey, { label: string; className: string }> = {
                  done: { label: "Tamamlandı 🟢", className: "bg-emerald-50 text-emerald-700" },
                  incomplete: { label: "Eksik 🔴", className: "bg-rose-50 text-rose-700" },
                  notdone: { label: "Yapılmadı ✖️", className: "bg-slate-700 text-white" },
                  pending: { label: "Kontrol Bekliyor 🟡", className: "bg-amber-50 text-amber-700" },
                };
                const status = statusMeta[statusKey];
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
                      <p className="text-xs text-slate-400">
                        {formatDateLongTR(h.date)}
                      </p>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold whitespace-nowrap ${status.className}`}
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

      {/* Notifications */}
      {students.length > 0 && tab === "notifications" && (
        <div className="mx-auto max-w-md px-4 pt-4">
          <h2 className="text-lg font-bold text-slate-800 mb-3">Bildirimler</h2>
          {notifications.length === 0 ? (
            <p className="text-center text-slate-400 py-10 text-sm">
              Henüz bildirim yok.
            </p>
          ) : (
            <div className="space-y-2.5">
              {notifications.map((n) => (
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
                    {!n.read && (
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                    )}
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {formatDateLongTR(n.date)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom nav */}
      {students.length > 0 && (
        <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-100 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
          <div className="mx-auto max-w-md grid grid-cols-4">
            {(
              [
                { key: "overview", label: "Genel", icon: GraduationCap },
                { key: "attendance", label: "Yoklama", icon: CalendarCheck },
                { key: "homework", label: "Ödev", icon: BookOpen },
                { key: "notifications", label: "Bildirim", icon: Bell },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              const showBadge = t.key === "notifications" && unreadCount > 0;
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
                    <span className="absolute top-1.5 right-[calc(50%-22px)] w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold grid place-items-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
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