import { useMemo, useState } from "react";
import { ClipboardCopy, Database, Send } from "lucide-react";
import type { HistoryRecord, SchoolClass } from "@/types";
import {
  buildNewHomeworkMessage,
  copyToClipboard,
  formatDateLongTR,
  todayISO,
  uid,
  whatsappUrl,
} from "@/lib/utils";
import { showToast } from "@/components/Toast";
import { ActionBar } from "@/components/AttendanceTab";
import { persistHomework } from "@/lib/firestore";
import { useAuth } from "@/context/AuthContext";

type Props = {
  selectedClass: SchoolClass | null;
  addHistory: (rec: HistoryRecord) => void;
};

export default function NewHomeworkTab({ selectedClass, addHistory }: Props) {
  const { user } = useAuth();
  const today = todayISO();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(today);

  const message = useMemo(
    () =>
      selectedClass
        ? buildNewHomeworkMessage(selectedClass.name, today, title, description, dueDate)
        : "",
    [selectedClass, today, title, description, dueDate]
  );

  // Ödevi Firestore'daki `homework` koleksiyonuna kalıcı olarak yazar.
  async function persist() {
    if (!selectedClass || !user) return;
    await persistHomework({
      classId: selectedClass.id,
      className: selectedClass.name,
      title: title.trim(),
      description: description.trim(),
      date: today,
      dueDate,
      teacherUid: user.uid,
    });
    addHistory({
      id: uid(),
      classId: selectedClass.id,
      className: selectedClass.name,
      date: today,
      type: "yeni-odev",
      content: message,
      createdAt: Date.now(),
    });
  }

  // Ödevi yalnızca veritabanına kaydeder (WhatsApp / panoya kopyalamadan bağımsız).
  async function saveOnly() {
    if (!selectedClass || !title.trim() || !description.trim()) return;
    try {
      await persist();
      showToast("Ödev veritabanına kaydedildi ✅", "success");
    } catch (err) {
      console.error("Ödev kaydedilemedi:", err);
      showToast("Ödev kaydedilemedi", "error");
    }
  }

  async function send() {
    if (!selectedClass || !title.trim() || !description.trim()) return;
    try {
      await persist();
      window.open(whatsappUrl(message), "_blank");
      showToast("Ödev kaydedildi, WhatsApp açılıyor…");
    } catch (err) {
      console.error("Ödev kaydedilemedi:", err);
      showToast("Ödev kaydedilemedi", "error");
    }
  }

  async function copy() {
    if (!selectedClass || !title.trim() || !description.trim()) return;
    const ok = await copyToClipboard(message);
    if (ok) {
      try {
        await persist();
      } catch (err) {
        console.error("Ödev kaydedilemedi:", err);
        showToast("Ödev kaydedilemedi", "error");
        return;
      }
    }
    showToast(ok ? "Panoya kopyalandı ve ödev kaydedildi" : "Kopyalanamadı", ok ? "success" : "info");
  }

  if (!selectedClass) {
    return <EmptyHint text="Lütfen üstten bir sınıf seçin." />;
  }

  return (
    <div className="pb-40">
      <div className="px-4 pt-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
          <p className="text-xs font-medium text-violet-600 uppercase tracking-wide">
            Yeni Ödev
          </p>
          <h2 className="text-lg font-bold text-slate-800 mt-0.5">{selectedClass.name}</h2>
          <p className="text-sm text-slate-400">{formatDateLongTR(today)}</p>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">
            Ödev Başlığı
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="örn. Matematik Alıştırmaları"
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none text-slate-800 text-base"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">
            Ödev Açıklaması
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="örn. Sayfa 42-43, alıştırma 1-5 arası. Çarşamba gününe kadar."
            rows={6}
            autoFocus
            className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none text-slate-800 text-base leading-relaxed resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">
            Teslim Tarihi
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-4 py-3 rounded-2xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none text-slate-800 text-base"
          />
        </div>
      </div>

      <ActionBar>
        <button
          onClick={saveOnly}
          disabled={!title.trim() || !description.trim()}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-emerald-600 text-white font-bold active:scale-[0.98] transition disabled:opacity-40"
        >
          <Database size={20} />
          Ödevi Veritabanına Kaydet
        </button>
        <button
          onClick={copy}
          disabled={!title.trim() || !description.trim()}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold active:scale-[0.98] transition disabled:opacity-40"
        >
          <ClipboardCopy size={20} />
          Panoya Kopyala
        </button>
        <button
          onClick={send}
          disabled={!title.trim() || !description.trim()}
          className="flex-[1.6] flex items-center justify-center gap-2 py-4 rounded-2xl bg-[#25D366] text-white font-bold shadow-md active:scale-[0.98] transition disabled:opacity-40 disabled:shadow-none"
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