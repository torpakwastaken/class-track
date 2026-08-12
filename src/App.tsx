import { useState } from "react";
import {
  BookPlus,
  CalendarCheck,
  CheckSquare,
  ChevronDown,
  GraduationCap,
  History as HistoryIcon,
  Users,
} from "lucide-react";
import type { HistoryRecord, SchoolClass, TabKey } from "@/types";
import { useLocalStorage } from "@/lib/storage";
import ClassManager from "@/components/ClassManager";
import AttendanceTab from "@/components/AttendanceTab";
import HomeworkCheckTab from "@/components/HomeworkCheckTab";
import NewHomeworkTab from "@/components/NewHomeworkTab";
import HistoryTab from "@/components/HistoryTab";
import ToastHost from "@/components/Toast";

const TABS: { key: TabKey; label: string; icon: typeof Users }[] = [
  { key: "yoklama", label: "Yoklama", icon: CalendarCheck },
  { key: "odev-kontrol", label: "Ödev Kontrolü", icon: CheckSquare },
  { key: "yeni-odev", label: "Yeni Ödev", icon: BookPlus },
  { key: "gecmis", label: "Geçmiş", icon: HistoryIcon },
  { key: "siniflar", label: "Sınıflar", icon: Users },
];

export default function App() {
  const [classes, setClasses] = useLocalStorage<SchoolClass[]>("siniflar_v1", []);
  const [selectedClassId, setSelectedClassId] = useLocalStorage<string>(
    "secili_sinif_v1",
    ""
  );
  const [history, setHistory] = useLocalStorage<HistoryRecord[]>("gecmis_v1", []);
  const [tab, setTab] = useState<TabKey>("yoklama");
  const [classPickerOpen, setClassPickerOpen] = useState(false);

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
      <ToastHost />

      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-slate-100">
        <div className="mx-auto max-w-md px-4 py-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 grid place-items-center text-white shrink-0">
            <GraduationCap size={22} />
          </div>
          <button
            onClick={() => setClassPickerOpen((v) => !v)}
            className="flex-1 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 active:scale-[0.98] transition"
          >
            <span className="font-semibold text-slate-800 truncate">
              {selectedClass ? selectedClass.name : "Sınıf seçin"}
            </span>
            <ChevronDown
              size={18}
              className={`text-slate-400 transition-transform ${classPickerOpen ? "rotate-180" : ""}`}
            />
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
      <main className="mx-auto max-w-md">
        {tab === "yoklama" && (
          <AttendanceTab selectedClass={selectedClass} addHistory={addHistory} />
        )}
        {tab === "odev-kontrol" && (
          <HomeworkCheckTab selectedClass={selectedClass} addHistory={addHistory} />
        )}
        {tab === "yeni-odev" && (
          <NewHomeworkTab selectedClass={selectedClass} addHistory={addHistory} />
        )}
        {tab === "gecmis" && (
          <HistoryTab history={history} clearHistory={() => setHistory([])} />
        )}
        {tab === "siniflar" && (
          <ClassManager
            classes={classes}
            setClasses={setClasses}
            selectedClassId={selectedClassId}
            onSelectClass={setSelectedClassId}
            onBack={() => setTab("yoklama")}
          />
        )}
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-100 shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
        <div className="mx-auto max-w-md grid grid-cols-5">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex flex-col items-center gap-1 py-2.5 transition ${
                  active ? "text-emerald-600" : "text-slate-400"
                }`}
              >
                <Icon
                  size={22}
                  strokeWidth={active ? 2.5 : 2}
                  className={active ? "scale-110 transition-transform" : ""}
                />
                <span className={`text-[11px] ${active ? "font-bold" : "font-medium"}`}>
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
