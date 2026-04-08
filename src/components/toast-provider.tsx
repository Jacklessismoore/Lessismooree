'use client';

import dynamic from 'next/dynamic';

// Dynamic import to avoid SSR hydration mismatch with react-hot-toast
const ToasterComponent = dynamic(
  () => import('react-hot-toast').then(mod => {
    const { Toaster } = mod;
    return function ToasterWrapper() {
      return (
        <Toaster
          position="top-right"
          gutter={8}
          toastOptions={{
            duration: 3000,
            style: {
              background: 'linear-gradient(135deg, rgba(14, 14, 14, 0.95) 0%, rgba(20, 20, 20, 0.9) 100%)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              color: '#F5F5F5',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '14px',
              fontSize: '11px',
              fontFamily: 'Poppins, sans-serif',
              fontWeight: '500',
              letterSpacing: '0.04em',
              padding: '12px 16px',
              boxShadow: '0 12px 48px -8px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.04), 0 0 60px -20px rgba(255, 255, 255, 0.06)',
              maxWidth: '360px',
            },
            success: {
              style: {
                borderLeft: '3px solid #10B981',
              },
              iconTheme: { primary: '#10B981', secondary: 'transparent' },
            },
            error: {
              style: {
                borderLeft: '3px solid #EF4444',
              },
              iconTheme: { primary: '#EF4444', secondary: 'transparent' },
            },
          }}
        />
      );
    };
  }),
  { ssr: false }
);

export function ToastProvider() {
  return <ToasterComponent />;
}
