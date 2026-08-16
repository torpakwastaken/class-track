import { useState, useEffect, useCallback } from "react";
import type { SchoolClass, Student } from "@/types";
import {
  getClassesByTeacher,
  createClass,
  updateClassName,
  deleteClass as deleteClassFromStore,
  addStudentToClass,
  updateStudentInClass,
  deleteStudentFromClass,
} from "@/lib/firestore";
import { uid as genUid } from "@/lib/utils";

/**
 * Loads and mutates classes in Firestore while keeping local state in sync.
 */
export function useClasses(teacherUid?: string) {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!teacherUid) {
      setClasses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    getClassesByTeacher(teacherUid)
      .then((list) => {
        if (active) setClasses(list);
      })
      .catch((err) => console.error("Sınıflar yüklenemedi:", err))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [teacherUid]);

  const saveClass = useCallback(
    async (name: string, classId?: string) => {
      if (!teacherUid) return;
      if (classId) {
        await updateClassName(classId, name);
        setClasses((prev) =>
          prev.map((c) => (c.id === classId ? { ...c, name } : c))
        );
      } else {
        const ref = await createClass({ name, teacherUid });
        const newClass: SchoolClass = {
          id: ref.id,
          name,
          students: [],
        };
        setClasses((prev) => [...prev, newClass]);
      }
    },
    [teacherUid]
  );

  const removeClass = useCallback(
    async (classId: string) => {
      await deleteClassFromStore(classId);
      setClasses((prev) => prev.filter((c) => c.id !== classId));
    },
    []
  );

  const addStudent = useCallback(
    async (classId: string, name: string) => {
      const student: Student = { id: genUid(), name };
      await addStudentToClass(classId, student);
      setClasses((prev) =>
        prev.map((c) =>
          c.id === classId ? { ...c, students: [...c.students, student] } : c
        )
      );
      return student.id;
    },
    []
  );

  const editStudent = useCallback(
    async (classId: string, studentId: string, name: string) => {
      await updateStudentInClass(classId, studentId, { name });
      setClasses((prev) =>
        prev.map((c) =>
          c.id === classId
            ? {
                ...c,
                students: c.students.map((s) =>
                  s.id === studentId ? { ...s, name } : s
                ),
              }
            : c
        )
      );
    },
    []
  );

  const removeStudent = useCallback(
    async (classId: string, studentId: string) => {
      await deleteStudentFromClass(classId, studentId);
      setClasses((prev) =>
        prev.map((c) =>
          c.id === classId
            ? { ...c, students: c.students.filter((s) => s.id !== studentId) }
            : c
        )
      );
    },
    []
  );

  return {
    classes,
    setClasses,
    loading,
    saveClass,
    removeClass,
    addStudent,
    editStudent,
    removeStudent,
  };
}