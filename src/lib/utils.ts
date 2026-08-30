const MONTHS_TR = [
  "Ocak",
  "Şubat",
  "Mart",
  "Nisan",
  "Mayıs",
  "Haziran",
  "Temmuz",
  "Ağustos",
  "Eylül",
  "Ekim",
  "Kasım",
  "Aralık",
];

const DAYS_TR = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function formatDateTR(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS_TR[m - 1]} ${y}`;
}

export function formatDateLongTR(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dayName = DAYS_TR[new Date(y, m - 1, d).getDay()];
  return `${d} ${MONTHS_TR[m - 1]} ${y} ${dayName}`;
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function buildAttendanceMessage(
  className: string,
  dateISO: string,
  presentNames: string[],
  absentNames: string[],
  lateNames: string[] = []
): string {
  const lines: string[] = [];
  lines.push(`📋 Yoklama - ${className} - ${formatDateTR(dateISO)}`);
  lines.push(`Var (${presentNames.length}): ${presentNames.join(", ") || "-"}`);
  lines.push(`Geç (${lateNames.length}): ${lateNames.join(", ") || "-"}`);
  lines.push(`Yok (${absentNames.length}): ${absentNames.join(", ") || "-"}`);
  return lines.join("\n");
}

/**
 * Devamsız/geç kalan öğrencinin velisine gidecek bildirim metni.
 * Daha önce AttendanceTab içinde satır içi kuruluyordu; toplu yazma
 * (batch) veri katmanına taşındığı için buraya alındı.
 */
export function buildAttendanceNotificationMessage(
  studentName: string,
  className: string,
  dateISO: string,
  type: "absent" | "late"
): string {
  return type === "absent"
    ? `${studentName} bugün (${formatDateLongTR(dateISO)}) ${className} dersinde YOK olarak işaretlendi.`
    : `${studentName} bugün (${formatDateLongTR(dateISO)}) ${className} dersine GEÇ kaldı.`;
}

export function buildHomeworkCheckMessage(
  className: string,
  dateISO: string,
  doneNames: string[],
  notDoneNames: string[],
  incompleteNames: string[] = []
): string {
  const lines: string[] = [];
  lines.push(`✅ Ödev Kontrolü - ${className} - ${formatDateTR(dateISO)}`);
  lines.push(`Yaptı (${doneNames.length}): ${doneNames.join(", ") || "-"}`);
  lines.push(`Yapmadı (${notDoneNames.length}): ${notDoneNames.join(", ") || "-"}`);
  lines.push(`Eksik (${incompleteNames.length}): ${incompleteNames.join(", ") || "-"}`);
  return lines.join("\n");
}

export function buildNewHomeworkMessage(
  className: string,
  dateISO: string,
  title: string,
  description: string,
  dueDateISO?: string
): string {
  const lines: string[] = [];
  lines.push(`📚 Yeni Ödev - ${className} - ${formatDateTR(dateISO)}`);
  if (title.trim()) lines.push(`📌 ${title.trim()}`);
  if (dueDateISO) lines.push(`🗓️ Teslim: ${formatDateTR(dueDateISO)}`);
  lines.push(description.trim());
  return lines.join("\n");
}

export function whatsappUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to legacy */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
