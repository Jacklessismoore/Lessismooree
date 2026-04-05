import type { Metadata } from 'next';
import { Poppins } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { AppProvider } from '@/lib/app-context';
import { ToastProvider } from '@/components/toast-provider';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
});

export const metadata: Metadata = {
  title: 'LIM Email Workbench',
  description: 'Less Is Moore — Email Marketing Agency Workbench',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} h-full`}>
      <body className={`${poppins.className} min-h-full bg-black text-[#F5F5F5]`}>
        <AuthProvider>
          <AppProvider>
            {children}
            <ToastProvider />
          </AppProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
