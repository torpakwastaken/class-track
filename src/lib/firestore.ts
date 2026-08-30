import { db } from "./firebase";
import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  Timestamp,
  type DocumentReference,
} from "firebase/firestore";
import type {
  SchoolClass,
  AttendanceStatus,
  NotificationRecord,
  Student,
  HomeworkCheckStatus,
  HomeworkCheckRecord,
} from "@/types";
import { buildAttendanceNotificationMessage } from "@/lib/utils";

/* ─── Toplu yazma (batched writes) altyapısı ─────────────────────────── */
// Öğretmen paneli 20-30 öğrencilik bir sınıfı tek dokunuşla kaydediyor.
// Döngü içinde `await addDoc(...)` her öğrenci için ayrı bir gidiş-dönüş
// demek (30 öğrenci = 30+ round-trip, ~5 saniye). `writeBatch` ile hepsi
// TEK gidiş-dönüşte ve atomik olarak yazılır.

// Firestore tek batch'te en fazla 500 işlem kabul eder. 400 ile güvenlik
// payı bırakıp daha kalabalık sınıflarda otomatik parçalıyoruz.
const BATCH_LIMIT = 400;

type BatchOp = {
  ref: DocumentReference;
  data: Record<string, unknown>;
  /** true ise mevcut alanlar korunur (örn. bildirimin `read` durumu). */
  merge: boolean;
};

/** Doküman ID'sinde "/" kullanılamaz; deterministik ID'leri güvenli hale getirir. */
const safeId = (value: string) => value.replace(/\//g, "-");

/**
 * Deterministik yoklama doküman ID'si: aynı sınıf + gün + öğrenci için
 * HER ZAMAN aynı dokümanı hedefler. Böylece öğretmen "Kaydet", "Kopyala"
 * ve "WhatsApp" butonlarına sırayla bassa bile mükerrer kayıt oluşmaz —
 * üzerine yazılır. (Eskiden `addDoc` ile her basışta yeni satır açılıyordu.)
 */
export const attendanceDocId = (classId: string, date: string, studentId: string) =>
  safeId(`${classId}_${date}_${studentId}`);

/** Deterministik bildirim ID'si. classId dahil: aynı öğrenci iki sınıfta olabilir. */
export const notificationDocId = (
  classId: string,
  studentId: string,
  date: string,
  type: "absent" | "late"
) => safeId(`${classId}_${studentId}_${date}_${type}`);

/** Deterministik ödev kontrolü ID'si. */
export const homeworkCheckDocId = (homeworkId: string, studentId: string, date: string) =>
  safeId(`${homeworkId}_${studentId}_${date}`);

/** İşlem listesini 400'lük parçalara bölerek commit eder. */
async function commitOps(ops: BatchOp[]): Promise<void> {
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    for (const op of chunk) {
      if (op.merge) batch.set(op.ref, op.data, { merge: true });
      else batch.set(op.ref, op.data);
    }
    await batch.commit();
  }
}

/* ─── Users ─────────────────────────────────────────────────────────── */

export const createUserProfile = async (
  uid: string,
  data: { email: string; name: string; role: "teacher" | "guardian"; phone: string }
) => {
  await setDoc(doc(db, "users", uid), {
    ...data,
    createdAt: new Date().toISOString(),
  });
  return uid;
};

export const getUserProfile = async (uid: string) => {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return { uid: snap.id, ...snap.data() };
};

export const getUsersByRole = async (role: "teacher" | "guardian") => {
  const q = query(collection(db, "users"), where("role", "==", role));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getAllUsers = async () => {
  const snap = await getDocs(collection(db, "users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

/* ─── Pending Users (auto-signup) ──────────────────────────────────── */
// Admin creates accounts by writing a "pending user" record. When that user
// logs in for the first time, LoginPage verifies the temp password, creates
// the real Firebase Auth account, writes users/{uid}, and deletes this record.
// NOTE: For production, replace this client-side flow with Firebase Admin SDK
// (e.g. a Cloud Function) so passwords are not stored in plaintext.

export const addPendingUser = async (data: {
  name: string;
  email: string;
  phone?: string;
  role: "teacher" | "guardian";
  tempPassword: string;
}) => {
  await setDoc(doc(db, "pending_users", data.email), {
    ...data,
    createdAt: new Date().toISOString(),
  });
};

export const getPendingUserByEmail = async (email: string) => {
  const snap = await getDoc(doc(db, "pending_users", email));
  if (!snap.exists()) return null;
  const data = snap.data() as {
    name: string;
    phone?: string;
    role: "teacher" | "guardian";
    tempPassword: string;
  };
  return { email: snap.id, ...data };
};

export const getAllPendingUsers = async () => {
  const snap = await getDocs(collection(db, "pending_users"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const deletePendingUser = async (email: string) => {
  await deleteDoc(doc(db, "pending_users", email));
};

/* ─── Classes & Students ───────────────────────────────────────────── */

export const createClass = async (data: { name: string; teacherUid: string }) => {
  return await addDoc(collection(db, "classes"), { ...data, createdAt: new Date().toISOString() });
};

export const getClassesByTeacher = async (teacherUid: string) => {
  const q = query(collection(db, "classes"), where("teacherUid", "==", teacherUid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => normalizeClass(d.id, d.data())) as SchoolClass[];
};

export const getAllClasses = async () => {
  const snap = await getDocs(collection(db, "classes"));
  return snap.docs.map((d) => normalizeClass(d.id, d.data())) as SchoolClass[];
};

/**
 * Real-time subscription to all classes.
 * Used by ParentDashboard so that when an admin pairs a student to a parent,
 * the parent's dashboard updates immediately without a manual refresh.
 */
export const subscribeClasses = (
  onUpdate: (classes: SchoolClass[]) => void
) => {
  return onSnapshot(collection(db, "classes"), (snap) => {
    onUpdate(snap.docs.map((d) => normalizeClass(d.id, d.data())) as SchoolClass[]);
  });
};

/**
 * Ensure a class document always has a `students` array.
 * Firestore docs may lack the field entirely (or store null),
 * which would crash `.map()` calls in the UI.
 */
const normalizeClass = (id: string, data: Record<string, unknown>): SchoolClass => ({
  id,
  name: (data.name as string) || "",
  students: Array.isArray(data.students) ? (data.students as SchoolClass["students"]) : [],
});

export const updateClassName = async (classId: string, name: string) => {
  await updateDoc(doc(db, "classes", classId), { name });
};

export const deleteClass = async (classId: string) => {
  await deleteDoc(doc(db, "classes", classId));
};

export const addStudentToClass = async (classId: string, student: { id: string; name: string; parentUid?: string | null }) => {
  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!classDoc.exists()) throw new Error("Sınıf bulunamadı");
  const current = classDoc.data().students || [];
  await updateDoc(doc(db, "classes", classId), { students: [...current, student] });
};

export const updateStudentInClass = async (
  classId: string,
  studentId: string,
  data: { name?: string; parentUid?: string | null }
) => {
  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!classDoc.exists()) throw new Error("Sınıf bulunamadı");
  const current = (classDoc.data().students || []) as Student[];
  const updated = current.map((s) => (s.id === studentId ? { ...s, ...data } : s));
  await updateDoc(doc(db, "classes", classId), { students: updated });
};

export const deleteStudentFromClass = async (classId: string, studentId: string) => {
  const classDoc = await getDoc(doc(db, "classes", classId));
  if (!classDoc.exists()) throw new Error("Sınıf bulunamadı");
  const current = (classDoc.data().students || []) as Student[];
  const updated = current.filter((s) => s.id !== studentId);
  await updateDoc(doc(db, "classes", classId), { students: updated });
};

/**
 * Pair a student to a parent by saving the parent's uid into the student's `parentUid` field.
 */
export const pairStudentToParent = async (classId: string, studentId: string, parentUid: string) => {
  await updateStudentInClass(classId, studentId, { parentUid });
};

/* ─── Attendance ────────────────────────────────────────────────────── */

export const addAttendanceRecord = async (record: {
  classId: string;
  className: string;
  date: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  teacherUid: string;
}) => {
  return await addDoc(collection(db, "attendance"), {
    ...record,
    createdAt: new Date().toISOString(),
  });
};

export const getStudentAttendance = async (studentId: string) => {
  const q = query(collection(db, "attendance"), where("studentId", "==", studentId));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

export const getClassAttendanceByDate = async (classId: string, date: string) => {
  const q = query(
    collection(db, "attendance"),
    where("classId", "==", classId),
    where("date", "==", date)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
};

/**
 * Get all students that belong to this parent via `parentUid`, then fetch their attendance.
 */
export const getAttendanceByParentUid = async (parentUid: string) => {
  const students = await getStudentsByParentUid(parentUid);
  if (students.length === 0) return [];

  const results: Record<string, unknown>[] = [];
  for (const s of students) {
    const records = await getStudentAttendance(s.id);
    results.push(...records.map((r) => ({ ...r, studentName: s.name })));
  }
  return results.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
};

export type AttendanceBatchRecord = {
  classId: string;
  className: string;
  date: string;
  studentId: string;
  studentName: string;
  status: AttendanceStatus;
  teacherUid: string;
  /** Öğrencinin velisi eşleştirilmişse, devamsız/geç durumunda bildirim yazılır. */
  parentUid?: string | null;
};

/**
 * Bir sınıfın TÜM yoklamasını + devamsız/geç velilerine gidecek bildirimleri
 * tek `writeBatch` içinde yazar.
 *
 * Eski `addAttendanceRecord` döngüsüne göre iki kazanç:
 *   1. Hız: 30 öğrenci için 30+ gidiş-dönüş yerine 1 sorgu + 1 batch.
 *   2. Doğruluk: deterministik doküman ID'leri sayesinde aynı gün tekrar
 *      kaydetmek mükerrer satır değil, üzerine yazma üretir.
 *
 * Bildirimlerde `read` alanı yalnızca doküman YENİ oluşturulurken false
 * yazılır; velinin okuduğu bir bildirim, öğretmen yoklamayı tekrar
 * kaydettiğinde yeniden "okunmadı" durumuna DÜŞMEZ. Bunun için mevcut
 * bildirim ID'leri tek bir sorguyla önden okunur.
 */
export const persistAttendanceBatch = async (
  records: AttendanceBatchRecord[]
): Promise<{ written: number; notified: number }> => {
  if (records.length === 0) return { written: 0, notified: 0 };

  const date = records[0].date;
  const now = new Date().toISOString();

  // Bildirim yazılacak öğrenciler (devamsız/geç + velisi eşleştirilmiş).
  const notifiable = records.filter(
    (r) => (r.status === "absent" || r.status === "late") && r.parentUid
  );

  // Hangi dokümanlar zaten var? Deterministik ID kullandığımız için ilgili
  // güne ait kayıtları çekip ID setine bakmak yeterli. `createdAt` ve
  // bildirimin `read` alanı yalnızca YENİ dokümanlarda yazılır.
  // İki sorgu paralel çalışır (toplam: 2 sorgu + 1 batch).
  const [existingAttendanceIds, existingNotificationIds] = await Promise.all([
    getDocs(
      query(
        collection(db, "attendance"),
        where("classId", "==", records[0].classId),
        where("date", "==", date)
      )
    )
      .then((snap) => new Set(snap.docs.map((d) => d.id)))
      .catch((e) => {
        console.error("Mevcut yoklama kayıtları okunamadı:", e);
        return new Set<string>();
      }),
    notifiable.length === 0
      ? Promise.resolve(new Set<string>())
      : getDocs(query(collection(db, "notifications"), where("date", "==", date)))
          .then((snap) => new Set(snap.docs.map((d) => d.id)))
          .catch((e) => {
            // Sorgu başarısız olsa bile yoklama kaydını bloke etmeyiz; en kötü
            // senaryoda bildirim yeniden "okunmadı" durumuna döner.
            console.error("Mevcut bildirimler okunamadı:", e);
            return new Set<string>();
          }),
  ]);

  const ops: BatchOp[] = [];

  for (const rec of records) {
    const id = attendanceDocId(rec.classId, rec.date, rec.studentId);
    const data: Record<string, unknown> = {
      classId: rec.classId,
      className: rec.className,
      date: rec.date,
      studentId: rec.studentId,
      studentName: rec.studentName,
      status: rec.status,
      teacherUid: rec.teacherUid,
      updatedAt: now,
    };
    // İlk kaydın oluşturulma zamanı korunur; güncellemede ezilmez.
    if (!existingAttendanceIds.has(id)) data.createdAt = now;
    ops.push({ ref: doc(db, "attendance", id), data, merge: true });
  }

  for (const rec of notifiable) {
    const id = notificationDocId(rec.classId, rec.studentId, rec.date, rec.status as "absent" | "late");
    const isNew = !existingNotificationIds.has(id);
    const data: Record<string, unknown> = {
      parentUid: rec.parentUid,
      classId: rec.classId,
      studentId: rec.studentId,
      studentName: rec.studentName,
      className: rec.className,
      date: rec.date,
      type: rec.status,
      message: buildAttendanceNotificationMessage(
        rec.studentName,
        rec.className,
        rec.date,
        rec.status as "absent" | "late"
      ),
      updatedAt: now,
    };
    // `read` ve `createdAt` yalnızca yeni bildirimde yazılır.
    if (isNew) {
      data.read = false;
      data.createdAt = now;
    }
    ops.push({ ref: doc(db, "notifications", id), data, merge: true });
  }

  await commitOps(ops);
  return { written: records.length, notified: notifiable.length };
};

/* ─── Homework ──────────────────────────────────────────────────────── */

/**
 * Kalıcı olarak bir ödevi Firestore'daki `homework` koleksiyonuna yazar.
 * `dueDate` (teslim tarihi) Firestore Timestamp olarak, diğer metin alanları
 * ise String olarak kaydedilir. `content` alanı eski veli paneli görünümüyle
 * geriye dönük uyumluluk için `description` ile aynı değeri taşır.
 */
export const persistHomework = async (record: {
  classId: string;
  className: string;
  title: string;
  description: string;
  date: string; // ödevin verildiği tarih (ISO yyyy-mm-dd)
  dueDate: string; // teslim tarihi (ISO yyyy-mm-dd)
  teacherUid: string;
}) => {
  return await addDoc(collection(db, "homework"), {
    classId: record.classId,
    className: record.className,
    title: record.title,
    description: record.description,
    date: record.date,
    dueDate: Timestamp.fromDate(new Date(`${record.dueDate}T23:59:59`)),
    dueDateISO: record.dueDate,
    content: record.description, // geriye dönük uyumluluk
    teacherUid: record.teacherUid,
    createdAt: new Date().toISOString(),
  });
};

/** Eski çağrılar için geriye dönük uyumlu sarmalayıcı. */
export const addHomeworkRecord = async (record: {
  classId: string;
  className: string;
  date: string;
  content: string;
  teacherUid: string;
}) => {
  return await persistHomework({
    classId: record.classId,
    className: record.className,
    title: record.content,
    description: record.content,
    date: record.date,
    dueDate: record.date,
    teacherUid: record.teacherUid,
  });
};

export const getHomeworkByParentUid = async (parentUid: string) => {
  const students = await getStudentsByParentUid(parentUid);
  if (students.length === 0) return [];

  // Fetch all homework and filter client-side by matching class membership
  const snap = await getDocs(collection(db, "homework"));
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // We need to know which classes the parent's students belong to
  const allClasses = await getAllClasses();
  const parentClassIds = new Set<string>();

  for (const c of allClasses) {
    const hasChild = c.students?.some((s) => s.parentUid === parentUid);
    if (hasChild) parentClassIds.add(c.id);
  }

  return all
    .filter((h) => parentClassIds.has((h as unknown as { classId: string }).classId))
    .sort((a, b) =>
      String((b as unknown as { date?: string }).date || "").localeCompare(String((a as unknown as { date?: string }).date || ""))
    );
};

/**
 * Veli panelindeki Ödev sayacının ve listesinin canlı güncellenmesi için
 * belirli sınıflara ait ödev kayıtlarını dinler. Öğretmen ödev kaydettiğinde
 * sayaç anında güncellenir (yoklama aboneliğiyle aynı desen).
 */
export const subscribeHomeworkByClassIds = (
  classIds: string[],
  onUpdate: (records: Record<string, unknown>[]) => void
) => {
  if (classIds.length === 0) {
    onUpdate([]);
    return () => {};
  }

  const recordsByClass = new Map<string, Record<string, unknown>[]>();

  const emit = () => {
    const all: Record<string, unknown>[] = [];
    for (const records of recordsByClass.values()) {
      all.push(...records);
    }
    all.sort((a, b) =>
      String((b as unknown as { date?: string }).date || "").localeCompare(String((a as unknown as { date?: string }).date || ""))
    );
    onUpdate(all);
  };

  // Firestore `in` sorgusu en fazla 10 değer destekler, bu yüzden sınıf başına dinleriz.
  const unsubs = classIds.map((classId) => {
    const q = query(collection(db, "homework"), where("classId", "==", classId));
    return onSnapshot(q, (snap) => {
      recordsByClass.set(
        classId,
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      emit();
    });
  });

  return () => {
    recordsByClass.clear();
    unsubs.forEach((u) => u());
  };
};

/* ─── Homework Checks ───────────────────────────────────────────────── */

/**
 * Belirli bir sınıfın ödevlerini (tek seferlik) getirir.
 * Öğretmen panelindeki "Ödev Kontrolü" sekmesinde hangi ödevin
 * kontrol edildiğini seçmek için kullanılır.
 */
export const getHomeworkByClassId = async (classId: string) => {
  const q = query(collection(db, "homework"), where("classId", "==", classId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) =>
      String((b as unknown as { date?: string }).date || "").localeCompare(String((a as unknown as { date?: string }).date || ""))
    );
};

/**
 * Öğretmenin ödev kontrol sonuçlarını `homework_checks` koleksiyonuna
 * kalıcı olarak yazar. Her kayıt mutlaka `studentId`, `homeworkId` ve
 * `status` ("done" | "notdone" | "incomplete") içerir.
 *
 * Aynı öğrenci + ödev + tarih için daha önce kayıt varsa yeni kayıt
 * oluşturmak yerine mevcut kaydın `status` alanını günceller (upsert).
 */
export const persistHomeworkChecks = async (
  records: {
    classId: string;
    className: string;
    homeworkId: string;
    homeworkTitle?: string;
    date: string; // kontrol tarihi (ISO yyyy-mm-dd)
    studentId: string;
    studentName: string;
    status: HomeworkCheckStatus;
    teacherUid: string;
  }[]
) => {
  const saved: { id: string; status: HomeworkCheckStatus }[] = [];

  for (const rec of records) {
    // Aynı ödev + öğrenci + tarih kaydı var mı?
    const q = query(
      collection(db, "homework_checks"),
      where("homeworkId", "==", rec.homeworkId),
      where("studentId", "==", rec.studentId),
      where("date", "==", rec.date)
    );
    const existing = await getDocs(q);

    if (!existing.empty) {
      // Mevcut kaydın durumunu güncelle (upsert)
      const existingId = existing.docs[0].id;
      await updateDoc(doc(db, "homework_checks", existingId), {
        status: rec.status,
        className: rec.className,
        homeworkTitle: rec.homeworkTitle ?? "",
        teacherUid: rec.teacherUid,
        updatedAt: new Date().toISOString(),
      });
      saved.push({ id: existingId, status: rec.status });
    } else {
      const ref = await addDoc(collection(db, "homework_checks"), {
        ...rec,
        homeworkTitle: rec.homeworkTitle ?? "",
        createdAt: new Date().toISOString(),
      });
      saved.push({ id: ref.id, status: rec.status });
    }
  }

  return saved;
};

export type HomeworkCheckBatchRecord = {
  classId: string;
  className: string;
  homeworkId: string;
  homeworkTitle?: string;
  date: string;
  studentId: string;
  studentName: string;
  status: HomeworkCheckStatus;
  teacherUid: string;
};

/**
 * Ödev kontrol sonuçlarını tek `writeBatch` içinde yazar.
 *
 * `persistHomeworkChecks` her öğrenci için AYRI bir `getDocs` + yazma
 * yapıyordu (30 öğrenci = 60 ardışık gidiş-dönüş). Burada ödev başına
 * TEK sorgu ile mevcut kayıtlar bulunur, ardından tüm yazmalar tek
 * batch'te gider: 1 sorgu + 1 batch.
 *
 * Geriye dönük uyumluluk: eski `addDoc` ile rastgele ID almış kayıtlar
 * varsa onların ID'leri kullanılır (yeni deterministik ID ile ikinci bir
 * kopya oluşmasın). Yeni kayıtlar `homeworkId_studentId_date` ID'sini alır.
 */
export const persistHomeworkChecksBatch = async (
  records: HomeworkCheckBatchRecord[]
): Promise<{ written: number }> => {
  if (records.length === 0) return { written: 0 };

  const now = new Date().toISOString();
  const homeworkIds = Array.from(new Set(records.map((r) => r.homeworkId)));

  // Ödev başına tek sorgu: (studentId + date) → mevcut doküman ID'si.
  const existingByKey = new Map<string, string>();
  await Promise.all(
    homeworkIds.map(async (homeworkId) => {
      try {
        const snap = await getDocs(
          query(collection(db, "homework_checks"), where("homeworkId", "==", homeworkId))
        );
        for (const d of snap.docs) {
          const data = d.data() as { studentId?: string; date?: string };
          existingByKey.set(`${homeworkId}_${data.studentId ?? ""}_${data.date ?? ""}`, d.id);
        }
      } catch (e) {
        console.error("Mevcut ödev kontrol kayıtları okunamadı:", e);
      }
    })
  );

  const ops: BatchOp[] = [];
  for (const rec of records) {
    const key = `${rec.homeworkId}_${rec.studentId}_${rec.date}`;
    const existingId = existingByKey.get(key);
    const id = existingId ?? homeworkCheckDocId(rec.homeworkId, rec.studentId, rec.date);
    const data: Record<string, unknown> = {
      classId: rec.classId,
      className: rec.className,
      homeworkId: rec.homeworkId,
      homeworkTitle: rec.homeworkTitle ?? "",
      date: rec.date,
      studentId: rec.studentId,
      studentName: rec.studentName,
      status: rec.status,
      teacherUid: rec.teacherUid,
      updatedAt: now,
    };
    if (!existingId) data.createdAt = now;
    ops.push({ ref: doc(db, "homework_checks", id), data, merge: true });
  }

  await commitOps(ops);
  return { written: records.length };
};

/**
 * Belirli bir ödeve ait kontrol kayıtlarını (tek seferlik) getirir.
 * Öğretmen paneli, daha önce kaydedilmiş durumları geri yüklemek için kullanır.
 */
export const getHomeworkChecksByHomeworkId = async (homeworkId: string) => {
  const q = query(collection(db, "homework_checks"), where("homeworkId", "==", homeworkId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HomeworkCheckRecord);
};

/**
 * Veli panelindeki ödev kartlarının yanında canlı durum etiketi göstermek için
 * belirli öğrencilere ait ödev kontrol kayıtlarını dinler. Öğretmen
 * "Kontrol Sonuçlarını Kaydet" butonuna bastığında veli ekranı anında güncellenir.
 *
 * Tüm öğrenci aboneliklerinden gelen kayıtlar birleştirilir ve
 * `onUpdate` her değişiklikte tam liste ile çağrılır.
 */
export const subscribeHomeworkChecksByStudentId = (
  studentIds: string[],
  onUpdate: (records: HomeworkCheckRecord[]) => void
) => {
  if (studentIds.length === 0) {
    onUpdate([]);
    return () => {};
  }

  const recordsByStudent = new Map<string, HomeworkCheckRecord[]>();

  const emit = () => {
    const all: HomeworkCheckRecord[] = [];
    for (const records of recordsByStudent.values()) {
      all.push(...records);
    }
    all.sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
    onUpdate(all);
  };

  // Firestore `in` query supports max 10 values, so we listen per student id.
  const unsubs = studentIds.map((studentId) => {
    const q = query(collection(db, "homework_checks"), where("studentId", "==", studentId));
    return onSnapshot(q, (snap) => {
      recordsByStudent.set(
        studentId,
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as HomeworkCheckRecord)
      );
      emit();
    });
  });

  return () => {
    recordsByStudent.clear();
    unsubs.forEach((u) => u());
  };
};

/* ─── Student lookups for parent ────────────────────────────────────── */

export const getStudentsByParentUid = async (parentUid: string) => {
  const allClasses = await getAllClasses();
  const students: (Student & { classId: string; className: string })[] = [];

  for (const c of allClasses) {
    const matched = c.students?.filter((s) => s.parentUid === parentUid) || [];
    for (const s of matched) {
      students.push({ ...s, classId: c.id, className: c.name });
    }
  }
  return students;
};

/* ─── Notifications ─────────────────────────────────────────────────── */

export const createNotification = async (data: Omit<NotificationRecord, "id" | "createdAt" | "read">) => {
  return await addDoc(collection(db, "notifications"), {
    ...data,
    read: false,
    createdAt: new Date().toISOString(),
  });
};

export const getNotificationsByParentUid = async (parentUid: string) => {
  // NOTE: Composite index gerekmesin diye `orderBy("createdAt")` kullanmıyoruz.
  // createdAt'e göre sıralama istemci tarafında yapılır.
  const q = query(
    collection(db, "notifications"),
    where("parentUid", "==", parentUid)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }) as NotificationRecord)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
};

export const markNotificationRead = async (notificationId: string) => {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
};

export const subscribeNotifications = (
  parentUid: string,
  onUpdate: (notifs: NotificationRecord[]) => void
) => {
  // Composite index gerektiren orderBy'yi bilinçli olarak kullanmıyoruz;
  // sıralama istemci tarafında yapılır.
  const q = query(
    collection(db, "notifications"),
    where("parentUid", "==", parentUid)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NotificationRecord);
    onUpdate(list.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
  });
};

/**
 * Real-time attendance records for a set of student ids.
 * Used by ParentDashboard so attendance counters update immediately
 * when a teacher records attendance.
 *
 * Tüm öğrenci aboneliklerinden gelen kayıtlar birleştirilir ve
 * `onUpdate` her değişiklikte tam liste ile çağrılır.
 */
export const subscribeAttendanceByStudentIds = (
  studentIds: string[],
  onUpdate: (records: Record<string, unknown>[]) => void
) => {
  if (studentIds.length === 0) {
    onUpdate([]);
    return () => {};
  }

  const recordsByStudent = new Map<string, Record<string, unknown>[]>();

  const emit = () => {
    const all: Record<string, unknown>[] = [];
    for (const records of recordsByStudent.values()) {
      all.push(...records);
    }
    all.sort((a, b) =>
      String((b as unknown as { date?: string }).date || "").localeCompare(String((a as unknown as { date?: string }).date || ""))
    );
    onUpdate(all);
  };

  // Firestore `in` query supports max 10 values, so we listen per student id.
  const unsubs = studentIds.map((studentId) => {
    const q = query(collection(db, "attendance"), where("studentId", "==", studentId));
    return onSnapshot(q, (snap) => {
      recordsByStudent.set(
        studentId,
        snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      );
      emit();
    });
  });

  return () => {
    recordsByStudent.clear();
    unsubs.forEach((u) => u());
  };
};