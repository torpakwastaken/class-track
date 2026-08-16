import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { GraduationCap } from 'lucide-react';
import { showToast } from '@/components/Toast';
import { getPendingUserByEmail, createUserProfile, deletePendingUser } from '@/lib/firestore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First try normal sign-in (existing account)
      try {
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Giriş başarılı!', 'success');
        return;
      } catch (err) {
        const error = err as { code?: string; message?: string };
        // If not found, check if this is a pending account awaiting activation
        if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-credential') {
          const pending = await getPendingUserByEmail(email);
          if (pending) {
            // Verify the temp password
            if (password === pending.tempPassword) {
              // Create the real Firebase Auth account
              const cred = await createUserWithEmailAndPassword(auth, email, password);

              // Store the user profile with role
              await createUserProfile(cred.user.uid, {
                email,
                name: pending.name,
                role: pending.role as 'teacher' | 'guardian',
                phone: pending.phone || '',
              });

              // Remove the pending record
              await deletePendingUser(email);

              showToast('Hesabınız oluşturuldu! Hoş geldiniz 🎉', 'success');
              return;
            } else {
              showToast('Geçici şifre hatalı. Yöneticiden kontrol edin.', 'error');
              return;
            }
          }
        }
        // Fall back to original error
        throw err;
      }
    } catch (err) {
      console.error('Giriş hatası:', err);
      const error = err as { message?: string };
      showToast(error?.message || 'Giriş başarısız', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-xl bg-emerald-600 grid place-items-center text-white mx-auto mb-4">
            <GraduationCap size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Class-Track</h1>
          <p className="text-slate-500 mt-2">Giriş Yap</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                E-posta
              </label>
              <input
                type="email"
                placeholder="example@mail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Şifre
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition mt-6"
            >
              {loading ? '...' : 'Giriş Yap'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-500 mt-6">
          Admin tarafından oluşturulmuş hesapla giriş yapın
        </p>
      </div>
    </div>
  );
}