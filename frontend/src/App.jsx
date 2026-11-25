import React from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import { Toaster } from 'react-hot-toast';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f9] flex flex-col items-center justify-center">
        <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/30 animate-bounce">
          <span className="text-xl">⚡</span>
        </div>
        <p className="mt-4 text-xs font-semibold text-slate-500 tracking-wider uppercase">
          Initializing OtherSync...
        </p>
      </div>
    );
  }

  return (
    <>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '16px',
            background: '#ffffff',
            color: '#1e293b',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)',
            border: '1px solid #f1f5f9',
            fontSize: '13px',
            fontWeight: '600',
          },
        }}
      />
      {user ? <DashboardPage /> : <LoginPage />}
    </>
  );
}
