import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// 🔐 Ana yönetici (Admin) Firebase Auth UID'si.
// Yalnızca bu hesapla yönetim panelindeki kullanıcı ekleme/eşleştirme
// işlemleri yapılabilir. (firestore.rules ile de senkronize)
export const ADMIN_UID = "oSujlr09TDZ10zk3QU8LMdpy1Ti2";

// Verilen UID'nin ana yönetici olup olmadığını döndürür.
export const isAdminUid = (uid: string | undefined | null): boolean => {
  return !!uid && uid === ADMIN_UID;
};
