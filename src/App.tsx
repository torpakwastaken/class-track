import { useState } from "react";
import {
  BookPlus,
  CalendarCheck,
  CheckSquare,
  ChevronDown,
  GraduationCap,
  History as HistoryIcon,
  LogOut,
  Settings,
  Users,
} from "lucide-react";
import type { HistoryRecord, TabKey } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { useClasses } from "@/hooks/useClasses";
import { isAdminUid } from "@/lib/firebase";
import LoginPage from "@/pages/LoginPage";
import AdminDashboard from "@/pages/AdminDashboard";
import ParentDashboard from "@/pages/ParentDashboard";
import ClassManager from "@/components/ClassManager";
import AttendanceTab from "@/components/AttendanceTab";
import HomeworkCheckTab from "@/components/HomeworkCheckTab";
import NewHomeworkTab from "@/components/NewHomeworkTab";
import HistoryTab from "@/components/HistoryTab";
// ToastHost artık main.tsx içinde, uygulamanın kökünde render ediliyor
// (tüm rollerde görünsün diye). Burada yalnızca showToast kullanılır.
import { showToast } from "@/components/Toast";

// 🔐 "Yönetim" sekmesi YALNIZCA ana yöneticiye (Admin) gösterilir.
// Normal öğretmenler (role: "teacher") bu sekmeyi görmez.
const TABS: { key: TabKey; label: string; icon: typeof Users; adminOnly?: boolean }[] = [
  { key: "yoklama", label: "Yoklama", icon: CalendarCheck },
  { key: "odev-kontrol", label: "Ödev Kontrolü", icon: CheckSquare },
  { key: "yeni-odev", label: "Yeni Ödev", icon: BookPlus },
  { key: "gecmis", label: "Geçmiş", icon: HistoryIcon },
  { key: "siniflar", label: "Sınıflar", icon: Users },
  { key: "yonetim", label: "Yönetim", icon: Settings, adminOnly: true },
];

export default function App() {
  const { user, role, loading, logout } = useAuth();
  const isAdmin = isAdminUid(user?.uid);
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);
  const { classes, saveClass, removeClass, addStudent, editStudent, removeStudent } =
    useClasses(user?.uid);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [tab, setTab] = useState<TabKey>("yoklama");
  const [classPickerOpen, setClassPickerOpen] = useState(false);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-600 grid place-items-center text-white mx-auto mb-4 animate-spin">
            <GraduationCap size={24} />
          </div>
          <p className="text-slate-600">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <LoginPage />;
  }

  // Role-based routing: Parents get the Parent Dashboard
  if (role === "guardian") {
    return <ParentDashboard />;
  }

  const selectedClass = classes.find((c) => c.id === selectedClassId) || null;

  function addHistory(rec: HistoryRecord) {
    setHistory((prev) => [...prev, rec]);
  }

  function selectClass(id: string) {
    setSelectedClassId(id);
    setClassPickerOpen(false);
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-600 grid place-items-center text-white shrink-0">
              <GraduationCap size={22} />
            </div>
            <button
              onClick={() => setClassPickerOpen((v) => !v)}
              className="flex-1 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 active:scale-[0.98] transition min-w-0"
            >
              <span className="font-semibold text-slate-800 truncate">
                {selectedClass ? selectedClass.name : "Sınıf seçin"}
              </span>
              <ChevronDown
                size={18}
                className={`text-slate-400 transition-transform shrink-0 ${classPickerOpen ? "rotate-180" : ""}`}
              />
            </button>
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

        {classPickerOpen && (
          <div className="mx-auto max-w-md px-4 pb-3">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
              {classes.length === 0 && (
                <p className="px-4 py-5 text-sm text-slate-400 text-center">
                  Sınıf yok. Sınıflar sekmesinden oluşturun.
                </p>
              )}
              {classes.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectClass(c.id)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition ${
                    c.id === selectedClassId
                      ? "bg-emerald-50 text-emerald-700 font-bold"
                      : "hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs text-slate-400 shrink-0 ml-2">
                    {c.students.length} öğrenci
                  </span>
                </button>
              ))}
              <button
                onClick={() => {
                  setClassPickerOpen(false);
                  setTab("siniflar");
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-t border-slate-100 text-emerald-600 font-semibold text-sm hover:bg-emerald-50 transition"
              >
                <Users size={16} />
                Sınıfları Yönet
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main>
        {tab === "yoklama" && (
          <div className="mx-auto max-w-md">
            <AttendanceTab selectedClass={selectedClass} addHistory={addHistory} />
          </div>
        )}
        {tab === "odev-kontrol" && (
          <div className="mx-auto max-w-md">
            <HomeworkCheckTab selectedClass={selectedClass} addHistory={addHistory} />
          </div>
        )}
        {tab === "yeni-odev" && (
          <div className="mx-auto max-w-md">
            <NewHomeworkTab selectedClass={selectedClass} addHistory={addHistory} />
          </div>
        )}
        {tab === "gecmis" && (
          <div className="mx-auto max-w-md">
            <HistoryTab history={history} clearHistory={() => setHistory([])} />
          </div>
        )}
        {tab === "siniflar" && (
          <div className="mx-auto max-w-md">
            <ClassManager
              classes={classes}
              selectedClassId={selectedClassId}
              onSelectClass={setSelectedClassId}
              onBack={() => setTab("yoklama")}
              onSaveClass={saveClass}
              onDeleteClass={removeClass}
              onAddStudent={async (classId, name) => {
                await addStudent(classId, name);
              }}
              onEditStudent={editStudent}
              onDeleteStudent={removeStudent}
            />
          </div>
        )}
        {tab === "yonetim" && isAdmin && <AdminDashboard />}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-100 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
        <div className={`mx-auto max-w-md grid ${visibleTabs.length === 6 ? "grid-cols-6" : "grid-cols-5"} overflow-x-auto`}>
          {visibleTabs.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 transition shrink-0 ${
                  active ? "text-emerald-600" : "text-slate-400"
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
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}