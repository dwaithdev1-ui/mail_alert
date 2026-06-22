import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface ToastContextType {
  showToast: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(null);
    }, 30000); // Hide after 30s
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* The Toast Element */}
      <div 
        className="glass-panel"
        style={{
          position: 'fixed',
          bottom: '2rem',
          right: '2rem',
          padding: '1rem 1.5rem',
          transform: toastMessage ? 'translateX(0)' : 'translateX(150%)',
          opacity: toastMessage ? 1 : 0,
          transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
          borderLeft: '4px solid var(--accent-primary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{ fontSize: '1.25rem' }}>✅</span>
          <span style={{ fontWeight: 'bold' }}>{toastMessage}</span>
        </div>
        <button 
          onClick={() => setToastMessage(null)}
          style={{ 
            background: 'none', border: 'none', color: 'var(--text-secondary)', 
            cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.25rem' 
          }}
        >
          ✕
        </button>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
