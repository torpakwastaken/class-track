import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import ToastHost from '@/components/Toast';
import './index.css';

// ToastHost uygulamanın kökünde durur: böylece giriş ekranı, yükleme
// durumu, veli paneli ve öğretmen paneli dahil TÜM dallarda toast'lar
// görünür. (Daha önce yalnızca App.tsx'in öğretmen dalında render
// edildiği için veli panelindeki showToast çağrıları ekrana hiç
// yansımıyordu.) Tek bir host olmalı; ikinci bir host aynı toast'ı
// iki kez gösterir.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <ToastHost />
      <App />
    </AuthProvider>
  </StrictMode>
);
