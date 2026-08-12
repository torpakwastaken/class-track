import { useState } from "react";
import { ChevronLeft, Pencil, Plus, Trash2, Users } from "lucide-react";
import type { SchoolClass, Student } from "@/types";
import { uid } from "@/lib/utils";
import Modal from "@/components/Modal";
import { showToast } from "@/components/Toast";

type Props = {
  classes: SchoolClass[];
  setClasses: (updater: (prev: SchoolClass[]) => SchoolClass[]) => void;
  selectedClassId: string | null;
  onSelectClass: (id: string) => void;
  onBack: () => void;
};

export default function ClassManager({
  classes,
  setClasses,
  selectedClassId,
  onSelectClass,
  onBack,
}: Props) {
  const [openClassModal, setOpenClassModal] = useState(false);
  const [editingClass, setEditingClass] = useState<SchoolClass | null>(null);
  const [className, setClassName] = useState("");

  const [openStudentModal, setOpenStudentModal] = useState(false);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  const activeClass = classes.find((c) => c.id === activeClassId) || null;

  function openNewClass() {
    setEditingClass(null);
    setClassName("");
    setOpenClassModal(true);
  }

  function openEditClass(c: SchoolClass) {
    setEditingClass(c);
    setClassName(c.name);
    setOpenClassModal(true);
  }

  function saveClass() {
    const name = className.trim();
    if (!name) return;
    if (editingClass) {
      setClasses((prev) =>
        prev.map((c) => (c.id === editingClass.id ? { ...c, name } : c))
      );
      showToast("Sınıf güncellendi");
    } else {
      const c: SchoolClass = { id: uid(), name, students: [] };
      setClasses((prev) => [...prev, c]);
      showToast("Sınıf oluşturuldu");
    }
    setOpenClassModal(false);
  }

  function deleteClass(id: string) {
    const c = classes.find((x) => x.id === id);
    if (!c) return;
    if (!confirm(`"${c.name}" sınıfını ve tüm öğrencilerini silmek istiyor musunuz?`)) return;
    setClasses((prev) => prev.filter((x) => x.id !== id));
    if (selectedClassId === id) onSelectClass("");
    showToast("Sınıf silindi", "info");
  }

  function openStudents(c: SchoolClass) {
    setActiveClassId(c.id);
    setOpenStudentModal(true);
  }

  function addStudent() {
    const name = studentName.trim();
    if (!name || !activeClassId) return;
    const s: Student = { id: uid(), name };
    setClasses((prev) =>
      prev.map((c) =>
        c.id === activeClassId ? { ...c, students: [...c.students, s] } : c
      )
    );
    setStudentName("");
  }

  function startEditStudent(s: Student) {
    setEditingStudent(s);
    setStudentName(s.name);
  }

  function saveEditStudent() {
    const name = studentName.trim();
    if (!name || !activeClassId || !editingStudent) return;
    setClasses((prev) =>
      prev.map((c) =>
        c.id === activeClassId
          ? {
              ...c,
              students: c.students.map((s) =>
                s.id === editingStudent.id ? { ...s, name } : s
              ),
            }
          : c
      )
    );
    setEditingStudent(null);
    setStudentName("");
  }

  function deleteStudent(id: string) {
    if (!activeClassId) return;
    setClasses((prev) =>
      prev.map((c) =>
        c.id === activeClassId
          ? { ...c, students: c.students.filter((s) => s.id !== id) }
          : c
      )
    );
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-3 pb-2 flex items-center gap-2">
        <button
          onClick={onBack}
          className="w-10 h-10 grid place-items-center rounded-full text-slate-600 hover:bg-slate-100 active:scale-95 transition"
          aria-label="Geri"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-xl font-bold text-slate-800">Sınıflarım</h1>
      </div>

      <div className="px-4">
        <button
          onClick={openNewClass}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-emerald-600 text-white font-semibold shadow-sm active:scale-[0.98] transition"
        >
          <Plus size={20} />
          Yeni Sınıf Oluştur
        </button>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {classes.length === 0 && (
          <p className="text-center text-slate-400 py-10 text-sm">
            Henüz sınıf yok. Yukarıdan oluşturun.
          </p>
        )}
        {classes.map((c) => (
          <div
            key={c.id}
            className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
          >
            <div className="flex items-center">
              <button
                onClick={() => {
                  onSelectClass(c.id);
                  onBack();
                }}
                className="flex-1 flex items-center gap-3 p-4 text-left active:bg-slate-50 transition"
              >
                <div className="w-11 h-11 rounded-xl bg-emerald-50 grid place-items-center text-emerald-600">
                  <Users size={20} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800 truncate">{c.name}</p>
                  <p className="text-xs text-slate-400">{c.students.length} öğrenci</p>
                </div>
              </button>
              <button
                onClick={() => openStudents(c)}
                className="px-3 h-12 grid place-items-center text-slate-400 hover:text-emerald-600 transition"
                aria-label="Öğrencileri yönet"
              >
                <Pencil size={18} />
              </button>
              <button
                onClick={() => deleteClass(c.id)}
                className="px-3 h-12 grid place-items-center text-slate-400 hover:text-rose-500 transition"
                aria-label="Sınıfı sil"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Class modal */}
      <Modal
        open={openClassModal}
        onClose={() => setOpenClassModal(false)}
        title={editingClass ? "Sınıfı Düzenle" : "Yeni Sınıf"}
      >
        <label className="block text-sm font-medium text-slate-600 mb-1.5">
          Sınıf Adı
        </label>
        <input
          value={className}
          onChange={(e) => setClassName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && saveClass()}
          placeholder="örn. 5-A Sınıfı"
          autoFocus
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-800"
        />
        <button
          onClick={saveClass}
          className="mt-4 w-full py-3.5 rounded-xl bg-emerald-600 text-white font-semibold active:scale-[0.98] transition"
        >
          {editingClass ? "Kaydet" : "Oluştur"}
        </button>
      </Modal>

      {/* Student modal */}
      <Modal
        open={openStudentModal}
        onClose={() => {
          setOpenStudentModal(false);
          setEditingStudent(null);
          setStudentName("");
        }}
        title={activeClass ? `Öğrenciler - ${activeClass.name}` : "Öğrenciler"}
      >
        <div className="flex gap-2 mb-4">
          <input
            value={studentName}
            onChange={(e) =>
              editingStudent ? setStudentName(e.target.value) : setStudentName(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") editingStudent ? saveEditStudent() : addStudent();
            }}
            placeholder={editingStudent ? "İsmi düzenle" : "Öğrenci adı soyadı"}
            autoFocus
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none text-slate-800"
          />
          {editingStudent ? (
            <button
              onClick={saveEditStudent}
              className="px-4 rounded-xl bg-emerald-600 text-white font-semibold active:scale-95 transition"
            >
              Kaydet
            </button>
          ) : (
            <button
              onClick={addStudent}
              className="px-4 rounded-xl bg-emerald-600 text-white font-semibold active:scale-95 transition"
            >
              Ekle
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {activeClass && activeClass.students.length === 0 && (
            <p className="text-center text-slate-400 py-6 text-sm">
              Henüz öğrenci yok. Yukarıdan ekleyin.
            </p>
          )}
          {activeClass?.students.map((s, i) => (
            <div
              key={s.id}
              className="flex items-center gap-3 p-3 rounded-xl bg-slate-50"
            >
              <span className="w-7 h-7 grid place-items-center rounded-full bg-slate-200 text-slate-500 text-xs font-bold">
                {i + 1}
              </span>
              <span className="flex-1 text-slate-700 font-medium">{s.name}</span>
              <button
                onClick={() => startEditStudent(s)}
                className="w-9 h-9 grid place-items-center text-slate-400 hover:text-emerald-600 transition"
                aria-label="Düzenle"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => deleteStudent(s.id)}
                className="w-9 h-9 grid place-items-center text-slate-400 hover:text-rose-500 transition"
                aria-label="Sil"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
