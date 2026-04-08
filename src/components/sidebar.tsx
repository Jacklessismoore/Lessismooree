'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth, ROLE_LABELS } from '@/lib/auth-context';
import { useApp } from '@/lib/app-context';
import { NAV_SECTIONS, MANAGEMENT_NAV } from '@/lib/constants';
import { cn } from '@/lib/utils';

function LimLogo() {
  return (
    <Link href="/" className="block px-6 pt-9 pb-7 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://ik.imagekit.io/ebethb3mi/svgviewer-output.svg?updatedAt=1775207768259"
        alt="Less Is Moore"
        className="h-14 w-14 mb-4"
      />
      <p className="text-[9px] text-[#444] uppercase tracking-[0.25em] font-medium mt-1">
        Email Workbench
      </p>
    </Link>
  );
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();
  const { user, signOut, canAccess, role } = useAuth();
  const { pods, selectedPod, setSelectedPod } = useApp();

  // Section collapse state — default all open, persist to localStorage
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const saved = localStorage.getItem('lim-nav-collapsed');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  const toggleSection = (label: string) => {
    setCollapsedSections(prev => {
      const next = { ...prev, [label]: !prev[label] };
      localStorage.setItem('lim-nav-collapsed', JSON.stringify(next));
      return next;
    });
  };

  return (
    <>
      <LimLogo />

      {/* Pod Selector */}
      <div className="px-5 py-4 border-b border-white/[0.04]">
        <p className="label-text mb-2.5">Pod</p>
        <div className="flex gap-1.5">
          {pods.map(pod => (
            <button
              key={pod.id}
              onClick={() => { setSelectedPod(pod); onNavClick?.(); }}
              className={cn(
                'flex-1 px-2 py-1.5 rounded-md text-[10px] uppercase tracking-wider transition-all duration-200',
                selectedPod?.id === pod.id
                  ? 'bg-white text-black font-semibold shadow-[0_0_12px_rgba(255,255,255,0.1)]'
                  : 'bg-transparent border border-white/[0.06] text-[#666] hover:text-white hover:border-white/20'
              )}
            >
              {pod.name}
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV_SECTIONS.map((section, sIdx) => {
          const visibleItems = section.items.filter(item => canAccess(item.href));
          if (visibleItems.length === 0) return null;
          const isCollapsed = collapsedSections[section.label];
          const hasActive = visibleItems.some(i => pathname === i.href);
          return (
            <div key={section.label} className={sIdx > 0 ? 'mt-0.5' : ''}>
              <button
                onClick={() => toggleSection(section.label)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.03] transition-colors rounded-lg mx-0"
              >
                <p className="text-[10px] text-[#555] uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5">
                  {section.label}
                  {isCollapsed && hasActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </p>
                <svg
                  className={cn('w-3 h-3 text-[#444] transition-transform duration-200', isCollapsed ? '-rotate-90' : '')}
                  viewBox="0 0 10 6" fill="none"
                >
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div className={cn(
                'overflow-hidden transition-all duration-200 ease-out',
                isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
              )}>
                {visibleItems.map(item => {
                  const isActive = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={(e) => {
                        onNavClick?.();
                        if (isActive) {
                          e.preventDefault();
                          window.location.href = item.href;
                        }
                      }}
                      className={cn(
                        'flex items-center gap-3 px-5 py-2.5 transition-all duration-300 relative group',
                        isActive ? 'text-white' : 'text-[#666] hover:text-white'
                      )}
                    >
                      {/* Right-edge bar — grows from centre */}
                      <div
                        className={cn(
                          'absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-white rounded-l origin-center transition-transform duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                          isActive ? 'scale-y-100' : 'scale-y-0'
                        )}
                      />
                      {/* Background wash — fades in */}
                      <div
                        className={cn(
                          'absolute inset-0 bg-gradient-to-r from-white/[0.06] via-white/[0.02] to-transparent transition-opacity duration-400 ease-out',
                          isActive ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {/* Soft glow behind active item */}
                      <div
                        className={cn(
                          'absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 blur-2xl transition-opacity duration-500 ease-out pointer-events-none',
                          isActive ? 'opacity-60' : 'opacity-0'
                        )}
                      />
                      <span className="text-base relative z-10">{item.icon}</span>
                      <span className="uppercase tracking-wider text-[11px] font-medium relative z-10">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Settings section — only for account managers */}
        {role === 'account_manager' && (() => {
          const isCollapsed = collapsedSections['Settings'];
          const hasActive = MANAGEMENT_NAV.some(i => pathname === i.href || pathname.startsWith(i.href + '/'));
          return (
            <div className="mt-0.5">
              <button
                onClick={() => toggleSection('Settings')}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.03] transition-colors rounded-lg"
              >
                <p className="text-[10px] text-[#555] uppercase tracking-[0.15em] font-semibold flex items-center gap-1.5">
                  Settings
                  {isCollapsed && hasActive && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                </p>
                <svg
                  className={cn('w-3 h-3 text-[#444] transition-transform duration-200', isCollapsed ? '-rotate-90' : '')}
                  viewBox="0 0 10 6" fill="none"
                >
                  <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              <div className={cn(
                'overflow-hidden transition-all duration-200 ease-out',
                isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[500px] opacity-100'
              )}>
                {MANAGEMENT_NAV.map(item => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={(e) => {
                        onNavClick?.();
                        if (isActive) {
                          e.preventDefault();
                          window.location.href = item.href;
                        }
                      }}
                      className={cn(
                        'flex items-center gap-3 px-5 py-2.5 transition-all duration-300 relative group',
                        isActive ? 'text-white' : 'text-[#666] hover:text-white'
                      )}
                    >
                      <div
                        className={cn(
                          'absolute right-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-white rounded-l origin-center transition-transform duration-400 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
                          isActive ? 'scale-y-100' : 'scale-y-0'
                        )}
                      />
                      <div
                        className={cn(
                          'absolute inset-0 bg-gradient-to-r from-white/[0.06] via-white/[0.02] to-transparent transition-opacity duration-400 ease-out',
                          isActive ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <div
                        className={cn(
                          'absolute right-0 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/20 blur-2xl transition-opacity duration-500 ease-out pointer-events-none',
                          isActive ? 'opacity-60' : 'opacity-0'
                        )}
                      />
                      <span className="text-base relative z-10">{item.icon}</span>
                      <span className="uppercase tracking-wider text-[11px] font-medium relative z-10">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </nav>

      {/* User */}
      {user && (
        <div className="px-5 py-4 border-t border-white/[0.04]">
          <p className="text-[10px] text-[#444] truncate">{user.email}</p>
          <p className="text-[8px] text-[#333] uppercase tracking-wider mb-1.5">{ROLE_LABELS[role]}</p>
          <button
            onClick={signOut}
            className="text-[10px] text-[#444] hover:text-white uppercase tracking-wider transition-colors duration-200"
          >
            Sign Out
          </button>
        </div>
      )}
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { canAccess, role } = useAuth();

  // Load collapsed state from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('lim-sidebar-collapsed');
    if (saved === 'true') setCollapsed(true);
  }, []);

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('lim-sidebar-collapsed', String(next));
    // Dispatch event so layout can react
    window.dispatchEvent(new CustomEvent('sidebar-toggle', { detail: { collapsed: next } }));
  };

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed top-4 left-4 z-50 w-10 h-10 flex items-center justify-center rounded-lg bg-black/80 backdrop-blur border border-white/[0.06] lg:hidden"
        aria-label="Open menu"
      >
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none">
          <path d="M1 1H17M1 6H17M1 11H17" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'hidden lg:flex fixed left-0 top-0 bottom-0 sidebar-glass border-r border-white/[0.04] flex-col z-40 transition-all duration-300 ease-out',
          collapsed ? 'w-[60px]' : 'w-[230px]'
        )}
      >
        {collapsed ? (
          // Collapsed view — icons only
          <div className="flex flex-col h-full">
            {/* Logo */}
            <Link href="/" className="flex items-center justify-center py-6 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://ik.imagekit.io/ebethb3mi/svgviewer-output.svg?updatedAt=1775207768259"
                alt="LIM"
                className="h-8 w-8"
              />
            </Link>

            {/* Nav icons */}
            <nav className="flex-1 py-3 flex flex-col items-center gap-0.5 overflow-y-auto">
              {NAV_SECTIONS.map((section, sIdx) => {
                const filteredItems = section.items.filter(item => canAccess(item.href));
                if (filteredItems.length === 0) return null;
                return (
                <div key={section.label} className="flex flex-col items-center gap-0.5">
                  {sIdx > 0 && <div className="w-5 h-px bg-white/[0.04] my-1" />}
                  {filteredItems.map(item => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 relative group',
                          isActive ? 'text-white bg-white/[0.06]' : 'text-[#555] hover:text-white hover:bg-white/[0.04]'
                        )}
                        title={item.label}
                      >
                        <span className="text-sm">{item.icon}</span>
                        <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-[#1a1a1a] text-[9px] text-white uppercase tracking-wider whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                          {item.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              );
              })}

              {role === 'account_manager' && <>
              <div className="w-5 h-px bg-white/[0.04] my-1" />

              {MANAGEMENT_NAV.map(item => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200 relative group',
                      isActive ? 'text-white bg-white/[0.06]' : 'text-[#555] hover:text-white hover:bg-white/[0.04]'
                    )}
                    title={item.label}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-[#1a1a1a] text-[10px] text-white uppercase tracking-wider whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      {item.label}
                    </span>
                  </Link>
                );
              })}
              </>}
            </nav>

            {/* Expand button */}
            <button
              onClick={toggleCollapsed}
              className="flex items-center justify-center py-4 border-t border-white/[0.04] text-[#444] hover:text-white transition-colors"
              title="Expand sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M5 1L11 7L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        ) : (
          // Full sidebar
          <>
            <SidebarContent />
            {/* Collapse button */}
            <button
              onClick={toggleCollapsed}
              className="flex items-center justify-center gap-2 py-3 border-t border-white/[0.04] text-[#444] hover:text-white transition-colors"
              title="Collapse sidebar"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M9 1L3 7L9 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-[9px] uppercase tracking-wider font-medium">Minimise</span>
            </button>
          </>
        )}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40 sidebar-overlay lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed left-0 top-0 bottom-0 w-4/5 max-w-[270px] sidebar-glass border-r border-white/[0.04] flex flex-col z-50 sidebar-slide-in lg:hidden">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/[0.05] transition-colors"
              aria-label="Close menu"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M13 1L1 13" stroke="#666" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </aside>
        </>
      )}
    </>
  );
}
