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
  metadataBase: new URL('https://lessismoore.app'),
  title: 'LIM Email Workbench',
  description: 'Less Is Moore. Email Marketing Agency Workbench.',
  applicationName: 'LIM Email Workbench',
  appleWebApp: {
    capable: true,
    title: 'LIM',
    statusBarStyle: 'black-translucent',
  },
  openGraph: {
    type: 'website',
    siteName: 'LIM Email Workbench',
    title: 'LIM Email Workbench',
    description: 'Less Is Moore. Email Marketing Agency Workbench.',
    url: 'https://lessismoore.app',
    images: [
      {
        url: '/apple-icon.png',
        width: 180,
        height: 180,
        alt: 'LIM',
      },
    ],
  },
  twitter: {
    card: 'summary',
    title: 'LIM Email Workbench',
    description: 'Less Is Moore. Email Marketing Agency Workbench.',
    images: ['/apple-icon.png'],
  },
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
