'use client';

import { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';
import { ReviewBanner } from '@/components/review-banner';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { loading, canAccess, isPendingRole, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    // Load initial state
    const saved = localStorage.getItem('lim-sidebar-collapsed');
    if (saved === 'true') setSidebarCollapsed(true);

    // Listen for toggle events from sidebar
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setSidebarCollapsed(detail.collapsed);
    };
    window.addEventListener('sidebar-toggle', handler);
    return () => window.removeEventListener('sidebar-toggle', handler);
  }, []);

  // Role-based page access guard
  useEffect(() => {
    if (loading || !pathname) return;
    if (pathname === '/') return; // Home is always accessible
    if (!canAccess(pathname)) {
      router.replace('/');
    }
  }, [pathname, loading, canAccess, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-[#555] heading text-sm">Loading...</div>
      </div>
    );
  }

  if (isPendingRole) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <div className="bg-mesh" />
        <div className="bg-haze" />
        <div className="bg-dots" />
        <div className="bg-noise" />

        <div className="w-full max-w-sm relative z-10 animate-fade-in">
          <div className="text-center mb-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://ik.imagekit.io/ebethb3mi/svgviewer-output.svg?updatedAt=1775207768259"
              alt="Less Is Moore"
              className="h-14 w-auto mx-auto mb-3"
            />
            <p className="text-[10px] text-[#444] uppercase tracking-[0.2em]">Email Workbench</p>
          </div>

          <div className="glass-card rounded-2xl p-7 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-amber-400 glow-dot" />
            </div>
            <h2 className="heading text-sm mb-2">Pending Role</h2>
            <p className="text-[11px] text-[#888] leading-relaxed mb-6">
              Your account is waiting for an admin to assign your role. Until then you can&apos;t access the workbench.
              Check back shortly or ping an admin to set you up.
            </p>
            <button
              onClick={signOut}
              className="w-full chip-press bg-white/[0.03] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.05] rounded-xl py-2.5 text-[11px] uppercase tracking-wider font-medium text-[#888] hover:text-white transition-all"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen relative">
      {/* Dynamic background layers */}
      <div className="bg-mesh" />
      <div className="bg-haze" />
      <div className="aurora" />
      <div className="bg-dots" />
      <div className="bg-noise" />

      <Sidebar />
      <main
        className={`flex-1 p-4 pt-16 sm:p-6 sm:pt-16 lg:p-10 min-h-screen relative z-10 transition-all duration-300 ease-out overflow-x-hidden ${
          sidebarCollapsed ? 'lg:ml-[60px]' : 'lg:ml-[230px]'
        }`}
      >
        <div key={pathname} className="route-fade">
          <ReviewBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
