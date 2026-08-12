export type Student = {
  id: string;
  name: string;
};

export type SchoolClass = {
  id: string;
  name: string;
  students: Student[];
};

export type AttendanceStatus = "present" | "absent";

export type HomeworkStatus = "done" | "notdone";

export type HistoryRecord = {
  id: string;
  classId: string;
  className: string;
  date: string; // ISO yyyy-mm-dd
  type: "yoklama" | "odev-kontrol" | "yeni-odev";
  content: string;
  createdAt: number;
};

export type TabKey = "yoklama" | "odev-kontrol" | "yeni-odev" | "gecmis" | "siniflar";
