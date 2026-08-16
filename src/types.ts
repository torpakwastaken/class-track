export type UserRole = "teacher" | "guardian";

export type Student = {
  id: string;
  name: string;
  parentUid?: string | null;
};

export type SchoolClass = {
  id: string;
  name: string;
  students: Student[];
};

export type AttendanceStatus = "present" | "absent" | "late";

export type HomeworkStatus = "done" | "notdone";

export type HomeworkCheckStatus = "done" | "notdone" | "incomplete";

/**
 * Öğretmenin ödev kontrol sonucunu veli panelinde göstermek için
 * `homework_checks` koleksiyonuna kaydedilen kayıt.
 */
export type HomeworkCheckRecord = {
  id: string;
  classId: string;
  className: string;
  homeworkId: string;
  homeworkTitle?: string;
  date: string; // kontrol tarihi (ISO yyyy-mm-dd)
  studentId: string;
  studentName: string;
  status: HomeworkCheckStatus;
  teacherUid: string;
  createdAt?: string;
};

export type HistoryRecord = {
  id: string;
  classId: string;
  className: string;
  date: string; // ISO yyyy-mm-dd
  type: "yoklama" | "odev-kontrol" | "yeni-odev";
  content: string;
  createdAt: number;
};

export type TabKey = "yoklama" | "odev-kontrol" | "yeni-odev" | "gecmis" | "siniflar" | "yonetim";

export type NotificationRecord = {
  id: string;
  parentUid: string;
  studentId: string;
  studentName: string;
  className: string;
  date: string;
  type: "absent" | "late";
  message: string;
  read: boolean;
  createdAt: string;
};
