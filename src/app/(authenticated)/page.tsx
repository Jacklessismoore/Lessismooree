'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
import { EMAIL_FACTS } from '@/lib/constants';
import { getInboxItems } from '@/lib/db';
import { InboxItem } from '@/lib/types';
import { HomeChat } from '@/components/home-chat';

const ALL_NAV_ACTIONS = [
  { label: 'Create', href: '/create', icon: '✨', description: 'Generate briefs, strategies & more' },
  { label: 'Calendar', href: '/calendar', icon: '📅', description: 'View & manage your email schedule' },
  { label: 'Briefs', href: '/briefs', icon: '📁', description: 'Browse, manage & edit client briefs' },
  { label: 'Reports', href: '/reports', icon: '📊', description: 'Klaviyo performance & analytics' },
];

// Management actions removed from home page

interface ManagerInboxSummary {
  managerName: string;
  managerId: string;
  pendingCount: number;
  urgentCount: number;
}

export default function HomePage() {
  const { selectedPod, podBrands } = useApp();
  const { canAccess } = useAuth();
  const NAV_ACTIONS = ALL_NAV_ACTIONS.filter(a => canAccess(a.href));
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * EMAIL_FACTS.length));
  const [inboxSummaries, setInboxSummaries] = useState<ManagerInboxSummary[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setFactIndex(prev => {
        let next: number;
        do { next = Math.floor(Math.random() * EMAIL_FACTS.length); } while (next === prev && EMAIL_FACTS.length > 1);
        return next;
      });
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Load inbox summaries grouped by manager
  const loadInboxSummaries = useCallback(async () => {
    try {
      const items = await getInboxItems({ resolved: false });
      // Filter by current pod
      const podItems = items.filter(i => {
        if (!selectedPod) return true;
        return i.brand?.pod_id === selectedPod.id;
      });

      // Group by manager
      const map = new Map<string, ManagerInboxSummary>();
      for (const item of podItems) {
        const mgrId = item.brand?.manager_id || 'unassigned';
        const mgrName = item.brand?.manager?.name || 'Unassigned';
        if (!map.has(mgrId)) {
          map.set(mgrId, { managerId: mgrId, managerName: mgrName, pendingCount: 0, urgentCount: 0 });
        }
        const summary = map.get(mgrId)!;
        summary.pendingCount++;
        if (item.action_type === 'urgent') summary.urgentCount++;
      }

      setInboxSummaries(Array.from(map.values()).filter(s => s.pendingCount > 0));
    } catch {
      // Silently fail — inbox summaries are non-critical
    }
  }, [selectedPod]);

  useEffect(() => {
    loadInboxSummaries();
    // Refresh every 2 minutes
    const interval = setInterval(loadInboxSummaries, 120000);
    return () => clearInterval(interval);
  }, [loadInboxSummaries]);

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[calc(100vh-5rem)]">
      {/* Header */}
      <div className="mb-10 text-center">
        {selectedPod && (
          <p className="text-[10px] text-[#444] uppercase tracking-[0.2em] mb-3">{selectedPod.name}</p>
        )}
        <h1 className="heading text-2xl sm:text-3xl mb-2 leading-tight">
          WHAT ARE WE UP TO TODAY?
        </h1>
        <p className="text-[#555] text-sm">Select an action to get started.</p>
      </div>

      {/* Inbox notifications per manager — only for roles that can access inbox */}
      {inboxSummaries.length > 0 && canAccess('/inbox') && (
        <Link href="/inbox" className="mb-6 w-full animate-fade-in block">
          <div className="glass-card rounded-xl hover:border-white/10 transition-all duration-200 cursor-pointer overflow-hidden">
            {inboxSummaries.map((summary, i) => (
              <div
                key={summary.managerId}
                className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-white/[0.04]' : ''}`}
              >
                <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <span className="text-[9px] font-semibold text-white">{summary.managerName.charAt(0)}</span>
                </div>
                <span className="text-[11px] text-[#999] flex-1">
                  <span className="text-white font-medium">{summary.pendingCount}</span>
                  {' '}new message{summary.pendingCount !== 1 ? 's' : ''} for{' '}
                  <span className="text-white">{summary.managerName}</span>
                </span>
                {summary.urgentCount > 0 && (
                  <span className="text-[9px] text-red-400 font-semibold bg-red-400/10 px-2 py-0.5 rounded flex-shrink-0">
                    {summary.urgentCount} urgent
                  </span>
                )}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#333] flex-shrink-0">
                  <path d="M5 1L11 7L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            ))}
          </div>
        </Link>
      )}

      {/* Workbench — 4 column grid */}
      <div className="mb-6 w-full">
        <div className={`grid gap-2 ${NAV_ACTIONS.length <= 2 ? 'grid-cols-2' : NAV_ACTIONS.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
          {NAV_ACTIONS.map((action, i) => (
            <Link key={action.href} href={action.href}>
              <Card
                hoverable
                padding="sm"
                className="animate-fade-in text-center"
                style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
              >
                <div className="flex flex-col items-center gap-2 py-2">
                  <div className="w-11 h-11 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center">
                    <span className="text-xl">{action.icon}</span>
                  </div>
                  <p className="text-[10px] font-semibold text-white uppercase tracking-wider">{action.label}</p>
                  <p className="text-[9px] text-[#444] leading-tight hidden sm:block">{action.description}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="mb-4 w-full max-w-lg">
        <HomeChat />
      </div>

      {/* Rotating tip */}
      <div className="w-full max-w-lg">
        <div className="glass-card rounded-xl px-6 py-4 text-center">
          <p className="text-[9px] text-[#555] uppercase tracking-[0.2em] font-semibold mb-2">Did you know?</p>
          <p
            className="text-[11px] text-[#777] leading-relaxed"
            key={factIndex}
            style={{ animation: 'fade-in 0.5s ease-out' }}
          >
            {EMAIL_FACTS[factIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}
