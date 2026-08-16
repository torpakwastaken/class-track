import React, { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Users, User, Key, Link2 } from 'lucide-react';
import { isAdminUid } from '@/lib/firebase';
import { showToast } from '@/components/Toast';
import {
  addPendingUser,
  getPendingUserByEmail,
  getAllUsers,
  getAllPendingUsers,
  getAllClasses,
  pairStudentToParent,
} from '@/lib/firestore';
import type { SchoolClass } from '@/types';

interface UserRecord {
  id?: string;
  name: string;
  email: string;
  phone?: string;
  role: 'teacher' | 'guardian';
  tempPassword?: string;
  createdAt?: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [pendingUsers, setPendingUsers] = useState<UserRecord[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);

  // Teacher form
  const [tName, setTName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tPassword, setTPassword] = useState('');

  // Guardian form
  const [pName, setPName] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pPassword, setPPassword] = useState('');

  // Pairing form
  const [pairClassId, setPairClassId] = useState('');
  const [pairStudentId, setPairStudentId] = useState('');
  const [pairParentUid, setPairParentUid] = useState('');

  const fetchAll = async () => {
    setDataLoading(true);
    try {
      const [userList, pendingList, classList] = await Promise.all([
        getAllUsers(),
        getAllPendingUsers(),
        getAllClasses(),
      ]);
      setUsers((userList as UserRecord[]) ?? []);
      setPendingUsers((pendingList as UserRecord[]) ?? []);
      setClasses(classList ?? []);
    } catch (err) {
      console.error('Veri çekme hatası:', err);
      showToast('Veri yüklenemedi', 'error');
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const handleAdd = async (e: React.FormEvent, type: 'teacher' | 'guardian') => {
    e.preventDefault();
    setLoading(true);

    try {
      const email = type === 'teacher' ? tEmail : pEmail;
      const password = type === 'teacher' ? tPassword : pPassword;
      const name = type === 'teacher' ? tName : pName;
      const phone = type === 'guardian' ? pPhone : undefined;

      if (!password || password.length < 6) {
        showToast('Şifre en az 6 karakterli olmalıdır', 'error');
        setLoading(false);
        return;
      }

      // Check if email already exists as pending or active
      const existingPending = await getPendingUserByEmail(email);
      if (existingPending) {
        showToast('Bu e-posta ile zaten bekleyen bir kayıt var', 'error');
        setLoading(false);
        return;
      }

      // Save to Firestore as a pending user
      // When that person logs in with the temp password for the first time,
      // LoginPage will create their real Firebase Auth account and users/{uid} profile.
      await addPendingUser({
        name,
        email,
        phone: phone || "",
        role: type,
        tempPassword: password,
      });

      showToast(`${type === 'teacher' ? 'Öğretmen' : 'Veli'} eklendi! İlk girişte hesap aktifleşecek.`, 'success');

      if (type === 'teacher') {
        setTName('');
        setTEmail('');
        setTPassword('');
      } else {
        setPName('');
        setPEmail('');
        setPPhone('');
        setPPassword('');
      }

      await fetchAll();
    } catch (err) {
      console.error('Yazma hatası:', err);
      const message = err instanceof Error ? err.message : 'Hata oluştu';
      showToast(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePair = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pairClassId || !pairStudentId || !pairParentUid) {
      showToast('Sınıf, öğrenci ve veli seçin', 'error');
      return;
    }

    try {
      await pairStudentToParent(pairClassId, pairStudentId, pairParentUid);
      showToast('Öğrenci veliye eşleştirildi! 🎉', 'success');

      // Re-select the class so students refresh with new parentUid
      setPairStudentId('');
      setPairParentUid('');
      await fetchAll();
    } catch (err) {
      console.error('Eşleştirme hatası:', err);
      const message = err instanceof Error ? err.message : 'Eşleştirme başarısız';
      showToast(message, 'error');
    }
  };

  // 🔐 ERİŞİM KONTROLÜ: Yönetim paneli YALNIZCA ana yöneticiye (Admin) açıktır.
  // Normal öğretmenler (role: "teacher") bu paneli göremez ve kullanamaz.
  if (!isAdminUid(user?.uid)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-600">Bu sayfaya erişim yetkiniz yok.</p>
          <p className="text-sm text-slate-400 mt-1">Yalnızca ana yönetici kullanıcı ekleyebilir.</p>
        </div>
      </div>
    );
  }

  const selectedClass = classes.find((c) => c.id === pairClassId) || null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
        <div className="mx-auto max-w-4xl px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 grid place-items-center text-white">
              <Users size={22} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Yönetim Paneli</h1>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-8">
        {/* Loading Indicator */}
        {dataLoading && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-8 text-center text-slate-500">
            <p>Yükleniyor...</p>
          </div>
        )}

        {/* Pairing Section */}
        <div className="bg-white rounded-2xl shadow-sm border border-purple-100 p-6 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link2 size={20} className="text-purple-600" />
            <h2 className="text-lg font-bold text-slate-800">Öğrenci – Veli Eşleştirme</h2>
          </div>
          <p className="text-sm text-slate-500 mb-4">
            Öğrenciyi bir veliye bağlayın. Veli giriş yaptığında yalnızca kendi çocuğunun verilerini görür.
          </p>

          <form onSubmit={handlePair} className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Sınıf</label>
              <select
                value={pairClassId}
                onChange={(e) => {
                  setPairClassId(e.target.value);
                  setPairStudentId('');
                }}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-purple-500 transition bg-white"
              >
                <option value="">Sınıf seçin</option>
                {(classes ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Öğrenci</label>
              <select
                value={pairStudentId}
                onChange={(e) => setPairStudentId(e.target.value)}
                required
                disabled={!selectedClass}
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-purple-500 transition bg-white disabled:opacity-50"
              >
                <option value="">Öğrenci seçin</option>
                {(selectedClass?.students ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.parentUid ? '✅' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Veli</label>
              <select
                value={pairParentUid}
                onChange={(e) => setPairParentUid(e.target.value)}
                required
                className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-purple-500 transition bg-white"
              >
                <option value="">Veli seçin</option>
                {(users ?? [])
                  .filter((u) => u.role === 'guardian')
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
              </select>
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={loading}
                className="w-full md:w-auto bg-purple-600 hover:bg-purple-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold py-2.5 px-6 rounded-lg transition"
              >
                {loading ? 'Eşleştiriliyor...' : 'Öğrenciyi Veliye Bağla'}
              </button>
            </div>
          </form>
        </div>

        {/* Forms Section */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Teacher Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <User size={20} className="text-emerald-600" />
              <h2 className="text-lg font-bold text-slate-800">Öğretmen Ekle</h2>
            </div>

            <form onSubmit={(e) => handleAdd(e, 'teacher')} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  placeholder="Örn. Ahmet Yılmaz"
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  E-posta
                </label>
                <input
                  type="email"
                  placeholder="ahmet@mail.com"
                  value={tEmail}
                  onChange={(e) => setTEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Geçici Şifre
                </label>
                <input
                  type="text"
                  placeholder="Min. 6 karakter"
                  value={tPassword}
                  onChange={(e) => setTPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition"
              >
                {loading ? 'Kaydediliyor...' : 'Öğretmen Kaydet'}
              </button>
            </form>
          </div>

          {/* Guardian Form */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Users size={20} className="text-blue-600" />
              <h2 className="text-lg font-bold text-slate-800">Veli Ekle</h2>
            </div>

            <form onSubmit={(e) => handleAdd(e, 'guardian')} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Ad Soyad
                </label>
                <input
                  type="text"
                  placeholder="Örn. Fatih Demir"
                  value={pName}
                  onChange={(e) => setPName(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  E-posta
                </label>
                <input
                  type="email"
                  placeholder="fatih@mail.com"
                  value={pEmail}
                  onChange={(e) => setPEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Telefon
                </label>
                <input
                  type="tel"
                  placeholder="555 123 45 67"
                  value={pPhone}
                  onChange={(e) => setPPhone(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Geçici Şifre
                </label>
                <input
                  type="text"
                  placeholder="Min. 6 karakter"
                  value={pPassword}
                  onChange={(e) => setPPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:border-blue-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold py-2.5 rounded-lg transition"
              >
                {loading ? 'Kaydediliyor...' : 'Veli Kaydet'}
              </button>
            </form>
          </div>
        </div>

        {/* Pending Users Table */}
        {(pendingUsers ?? []).length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <Key size={18} className="text-amber-500" />
              <h2 className="text-lg font-bold text-slate-800">Aktifleşmeyi Bekleyen Hesaplar</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Ad Soyad</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">E-posta</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Rol</th>
                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Geçici Şifre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(pendingUsers ?? []).map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50 transition">
                      <td className="px-6 py-4 text-sm text-slate-800 font-medium">{u.name}</td>
                      <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                          u.role === 'teacher'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-blue-50 text-blue-700'
                        }`}>
                          {u.role === 'teacher' ? '👨‍🏫 Öğretmen' : '👨‍👩‍👧 Veli'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <code className="bg-slate-100 px-2.5 py-1.5 rounded text-xs font-mono text-slate-800">
                          {u.tempPassword}
                        </code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-800">Kayıtlı Kişiler</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Ad Soyad</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">E-posta</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Rol</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-slate-600">Telefon</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(users ?? []).map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 text-sm text-slate-800 font-medium">{u.name}</td>
                    <td className="px-6 py-4 text-sm text-slate-600">{u.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        u.role === 'teacher'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}>
                        {u.role === 'teacher' ? '👨‍🏫 Öğretmen' : '👨‍👩‍👧 Veli'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">{u.phone || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(users ?? []).length === 0 && (
            <div className="px-6 py-12 text-center text-slate-500">
              <p>Henüz kişi eklenmemiş</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}