'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { createClient } from '@/lib/supabase/client';

/**
 * Banner shown at the top of the authenticated layout for account managers
 * and admins. Counts briefs currently sitting in "internal_approval" status
 * across all brands and prompts the user to review them.
 */
export function ReviewBanner() {
  const { user, role } = useAuth();
  const [count, setCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  const isReviewer = role === 'admin' || role === 'account_manager';

  useEffect(() => {
    if (!isReviewer || !user) return;
    let cancelled = false;

    const load = async () => {
      const sb = createClient();
      if (!sb) return;
      const { count: c } = await sb
        .from('brief_history')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'internal_approval');
      if (!cancelled && typeof c === 'number') setCount(c);
    };

    load();
    // Refresh every 60s so new submissions appear without a hard reload
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isReviewer, user]);

  if (!isReviewer || count === 0 || dismissed) return null;

  return (
    <div className="mb-4 animate-fade">
      <div className="flex items-center gap-3 bg-amber-400/[0.06] border border-amber-400/25 rounded-xl px-4 py-3">
        <span className="w-2 h-2 rounded-full bg-amber-400 glow-dot flex-shrink-0" />
        <p className="text-[12px] text-white flex-1">
          You have <span className="font-semibold text-amber-300">{count}</span>{' '}
          email{count === 1 ? '' : 's'} to review
        </p>
        <Link
          href="/briefs"
          className="chip-press text-[10px] uppercase tracking-wider font-medium text-amber-300 hover:text-white bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/30 hover:border-amber-400/50 rounded-lg px-3 py-1.5 transition-colors"
        >
          Review
        </Link>
        <button
          onClick={() => setDismissed(true)}
          className="text-[#666] hover:text-white text-[14px] leading-none px-1"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
