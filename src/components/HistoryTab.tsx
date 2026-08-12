import { useState } from "react";
import { ClipboardCopy, Send, Trash2 } from "lucide-react";
import type { HistoryRecord } from "@/types";
import { copyToClipboard, formatDateLongTR, whatsappUrl } from "@/lib/utils";
import { showToast } from "@/components/Toast";
import Modal from "@/components/Modal";

type Props = {
  history: HistoryRecord[];
  clearHistory: () => void;
};

const TYPE_LABEL: Record<HistoryRecord["type"], string> = {
  yoklama: "Yoklama",
  "odev-kontrol": "Ödev Kontrolü",
  "yeni-odev": "Yeni Ödev",
};

const TYPE_COLOR: Record<HistoryRecord["type"], string> = {
  yoklama: "bg-emerald-50 text-emerald-700",
  "odev-kontrol": "bg-sky-50 text-sky-700",
  "yeni-odev": "bg-violet-50 text-violet-700",
};

export default function HistoryTab({ history, clearHistory }: Props) {
  const [active, setActive] = useState<HistoryRecord | null>(null);
  const sorted = [...history].sort((a, b) => b.createdAt - a.createdAt);

  async function copy(rec: HistoryRecord) {
    const ok = await copyToClipboard(rec.content);
    showToast(ok ? "Panoya kopyalandı" : "Kopyalanamadı", ok ? "success" : "info");
  }

  function resend(rec: HistoryRecord) {
    window.open(whatsappUrl(rec.content), "_blank");
    showToast("WhatsApp açılıyor…");
  }

  function clearAll() {
    if (!confirm("Tüm geçmiş kayıtları silmek istiyor musunuz?")) return;
    clearHistory();
    showToast("Geçmiş temizlendi", "info");
  }

  return (
    <div className="pb-24">
      <div className="px-4 pt-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-800">Geçmiş Kayıtlar</h1>
        {history.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-500 text-sm font-medium hover:bg-rose-50 transition"
          >
            <Trash2 size={16} />
            Temizle
          </button>
        )}
      </div>

      <div className="px-4 mt-3 space-y-2.5">
        {sorted.length === 0 && (
          <p className="text-center text-slate-400 py-16 text-sm">
            Henüz kayıt yok. Gönderilen yoklama ve ödevler burada görünür.
          </p>
        )}
        {sorted.map((rec) => (
          <button
            key={rec.id}
            onClick={() => setActive(rec)}
            className="w-full text-left bg-white rounded-2xl shadow-sm border border-slate-100 p-4 active:scale-[0.98] transition"
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={`px-2.5 py-1 rounded-lg text-xs font-bold ${TYPE_COLOR[rec.type]}`}
              >
                {TYPE_LABEL[rec.type]}
              </span>
              <span className="text-xs text-slate-400">{formatDateLongTR(rec.date)}</span>
            </div>
            <p className="mt-2 font-semibold text-slate-800 text-sm truncate">
              {rec.className}
            </p>
            <p className="mt-1 text-xs text-slate-400 line-clamp-2 whitespace-pre-line">
              {rec.content}
            </p>
          </button>
        ))}
      </div>

      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        title={active ? TYPE_LABEL[active.type] : ""}
      >
        {active && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-slate-800">{active.className}</span>
              <span className="text-sm text-slate-400">{formatDateLongTR(active.date)}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words text-sm text-slate-700 bg-slate-50 rounded-2xl p-4 font-sans leading-relaxed">
              {active.content}
            </pre>
            <div className="mt-4 flex gap-2.5">
              <button
                onClick={() => copy(active)}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-slate-100 text-slate-700 font-bold active:scale-[0.98] transition"
              >
                <ClipboardCopy size={20} />
                Kopyala
              </button>
              <button
                onClick={() => resend(active)}
                className="flex-[1.6] flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[#25D366] text-white font-bold shadow-md active:scale-[0.98] transition"
              >
                <Send size={20} />
                Tekrar Gönder
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
