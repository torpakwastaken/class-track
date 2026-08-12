import { useMemo, useState } from "react";
import { ClipboardCopy, Send } from "lucide-react";
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

type Props = {
  selectedClass: SchoolClass | null;
  addHistory: (rec: HistoryRecord) => void;
};

export default function NewHomeworkTab({ selectedClass, addHistory }: Props) {
  const today = todayISO();
  const [text, setText] = useState("");

  const message = useMemo(
    () =>
      selectedClass ? buildNewHomeworkMessage(selectedClass.name, today, text) : "",
    [selectedClass, today, text]
  );

  function send() {
    if (!selectedClass || !text.trim()) return;
    addHistory({
      id: uid(),
      classId: selectedClass.id,
      className: selectedClass.name,
      date: today,
      type: "yeni-odev",
      content: message,
      createdAt: Date.now(),
    });
    window.open(whatsappUrl(message), "_blank");
    showToast("WhatsApp açılıyor…");
  }

  async function copy() {
    const ok = await copyToClipboard(message);
    showToast(ok ? "Panoya kopyalandı" : "Kopyalanamadı", ok ? "success" : "info");
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

      <div className="px-4 mt-4">
        <label className="block text-sm font-medium text-slate-600 mb-1.5">
          Ödev Metni
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="örn. Sayfa 42-43, alıştırma 1-5 arası. Çarşamba gününe kadar."
          rows={8}
          autoFocus
          className="w-full px-4 py-3.5 rounded-2xl border border-slate-200 focus:border-violet-500 focus:ring-2 focus:ring-violet-100 outline-none text-slate-800 text-base leading-relaxed resize-none"
        />
      </div>

      <ActionBar>
        <button
          onClick={copy}
          disabled={!text.trim()}
          className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl bg-slate-100 text-slate-700 font-bold active:scale-[0.98] transition disabled:opacity-40"
        >
          <ClipboardCopy size={20} />
          Panoya Kopyala
        </button>
        <button
          onClick={send}
          disabled={!text.trim()}
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
