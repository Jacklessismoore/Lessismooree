'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/card';
import { EMAIL_FACTS } from '@/lib/constants';
import { HomeChat } from '@/components/home-chat';

const ALL_NAV_ACTIONS = [
  { label: 'Create', href: '/create', icon: '✨', description: 'Generate briefs, strategies & more' },
  { label: 'Calendar', href: '/calendar', icon: '📅', description: 'View & manage your email schedule' },
  { label: 'Briefs', href: '/briefs', icon: '📁', description: 'Browse, manage & edit client briefs' },
  { label: 'Reports', href: '/reports', icon: '📊', description: 'Klaviyo performance & analytics' },
];

export default function HomePage() {
  const { selectedPod } = useApp();
  const { canAccess } = useAuth();
  const NAV_ACTIONS = ALL_NAV_ACTIONS.filter(a => canAccess(a.href));
  const [factIndex, setFactIndex] = useState(() => Math.floor(Math.random() * EMAIL_FACTS.length));

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
