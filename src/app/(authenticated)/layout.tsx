'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Sidebar } from '@/components/sidebar';
import toast from 'react-hot-toast';

const SCAN_INTERVAL = 10 * 60 * 1000; // 10 minutes

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  const { loading, canAccess, needsRoleSelection, setRole } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [timeSinceScan, setTimeSinceScan] = useState('');
  const isFirstScan = useRef(true);

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

  // Global Slack scan
  const runScan = useCallback(async () => {
    try {
      const res = await fetch('/api/slack/scan-all', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setLastScanTime(new Date());
        // Save to localStorage so it persists across pages
        localStorage.setItem('lim-last-slack-scan', new Date().toISOString());

        // Always show toast for every scan
        if (data.totalNewItems > 0) {
          toast.success(`${data.totalNewItems} new Slack message${data.totalNewItems !== 1 ? 's' : ''}`);
        } else {
          toast(`Slack scanned — no new messages`, { icon: '✅', duration: 2000 });
        }
        isFirstScan.current = false;
      }
    } catch {
      // Silently fail — scan is non-critical
    }
  }, []);

  // Run scan on mount and every 10 minutes
  useEffect(() => {
    if (loading) return;

    // Check if we scanned recently (within last 2 minutes) from localStorage
    const lastSaved = localStorage.getItem('lim-last-slack-scan');
    if (lastSaved) {
      const lastDate = new Date(lastSaved);
      const timeSince = Date.now() - lastDate.getTime();
      setLastScanTime(lastDate);
      if (timeSince < 2 * 60 * 1000) {
        // Scanned less than 2 min ago, skip initial scan
        isFirstScan.current = false;
      } else {
        runScan();
      }
    } else {
      runScan();
    }

    const interval = setInterval(runScan, SCAN_INTERVAL);
    return () => clearInterval(interval);
  }, [loading, runScan]);

  // Update "time since scan" display every 15 seconds
  const [nextScanIn, setNextScanIn] = useState('');
  useEffect(() => {
    const update = () => {
      if (!lastScanTime) {
        setTimeSinceScan('');
        setNextScanIn('');
        return;
      }
      const diff = Math.floor((Date.now() - lastScanTime.getTime()) / 1000);
      if (diff < 60) setTimeSinceScan('just now');
      else if (diff < 3600) setTimeSinceScan(`${Math.floor(diff / 60)}m ago`);
      else setTimeSinceScan(`${Math.floor(diff / 3600)}h ago`);

      // Next scan countdown
      const remaining = Math.max(0, Math.floor((SCAN_INTERVAL - (Date.now() - lastScanTime.getTime())) / 1000));
      if (remaining <= 0) setNextScanIn('now');
      else if (remaining < 60) setNextScanIn(`${remaining}s`);
      else setNextScanIn(`${Math.ceil(remaining / 60)}m`);
    };
    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, [lastScanTime]);

  // Role-based page access guard
  useEffect(() => {
    if (loading || !pathname) return;
    if (pathname === '/') return; // Home is always accessible
    if (!canAccess(pathname)) {
      router.replace('/');
    }
  }, [pathname, loading, canAccess, router]);

  // Expose scan function globally so inbox page can trigger it
  useEffect(() => {
    const handler = () => { runScan(); };
    window.addEventListener('trigger-slack-scan', handler);
    return () => window.removeEventListener('trigger-slack-scan', handler);
  }, [runScan]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-[#555] heading text-sm">Loading...</div>
      </div>
    );
  }

  if (needsRoleSelection) {
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

          <div className="glass-card rounded-2xl p-7">
            <h2 className="heading text-xs text-center mb-2">Welcome</h2>
            <p className="text-[11px] text-[#555] text-center mb-6">Select your role to get started</p>

            <div className="space-y-2">
              {([
                { role: 'account_manager' as const, label: 'Account Manager', desc: 'Full access to all features', icon: '👑' },
                { role: 'designer' as const, label: 'Designer', desc: 'Create, Calendar, Briefs & Design Queue', icon: '🎨' },
                { role: 'klaviyo_tech' as const, label: 'Klaviyo Technician', desc: 'Calendar, Briefs & Reports', icon: '⚙️' },
                { role: 'scheduler' as const, label: 'Scheduler', desc: 'Calendar & Briefs', icon: '📅' },
              ]).map(option => (
                <button
                  key={option.role}
                  onClick={() => setRole(option.role)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.05] transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-white/[0.04] flex items-center justify-center flex-shrink-0 group-hover:bg-white/[0.08] transition-colors">
                    <span className="text-sm">{option.icon}</span>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-white uppercase tracking-wider">{option.label}</p>
                    <p className="text-[9px] text-[#555]">{option.desc}</p>
                  </div>
                </button>
              ))}
            </div>
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
        {/* Global Slack scan indicator — bottom right to avoid clipping with page buttons */}
        {timeSinceScan && (
          <div className="fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-30">
            <div className="flex items-center gap-1.5 bg-black/70 backdrop-blur-sm border border-white/[0.04] rounded-lg px-2.5 py-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500/80 glow-dot" />
              <span className="text-[8px] text-[#555]">
                Slack scanned {timeSinceScan}{nextScanIn ? ` · next in ${nextScanIn}` : ''}
              </span>
            </div>
          </div>
        )}

        <div key={pathname} className="route-fade">
          {children}
        </div>
      </main>
    </div>
  );
}
