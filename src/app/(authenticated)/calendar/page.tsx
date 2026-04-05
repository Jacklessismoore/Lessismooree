'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { CalendarItem } from '@/lib/types';
import { getCalendarItemsForWeek, getUnassignedCalendarItems } from '@/lib/db';
import { MONTHS, EMAIL_STATUSES } from '@/lib/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { CalendarSpreadsheet } from '@/components/calendar/calendar-spreadsheet';
import { UnassignedQueue } from '@/components/calendar/unassigned-queue';

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatWeekLabel(weekStart: Date): string {
  const day = weekStart.getDate();
  const month = MONTHS[weekStart.getMonth()];
  return `Week of ${day} ${month}`;
}

export default function CalendarPage() {
  const { selectedPod, podBrands } = useApp();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [unassigned, setUnassigned] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  // Close legend on click outside
  useEffect(() => {
    if (!showLegend) return;
    const handler = () => setShowLegend(false);
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [showLegend]);

  const loadData = useCallback(async () => {
    if (!selectedPod || podBrands.length === 0) {
      setItems([]);
      setUnassigned([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const brandIds = podBrands.map(b => b.id);
      const weekStartStr = weekStart.toISOString().split('T')[0];
      const [weekItems, queueItems] = await Promise.all([
        getCalendarItemsForWeek(brandIds, weekStartStr),
        getUnassignedCalendarItems(brandIds),
      ]);
      setItems(weekItems);
      setUnassigned(queueItems);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [selectedPod, podBrands, weekStart]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const prevWeek = () => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() - 7);
      return d;
    });
  };

  const nextWeek = () => {
    setWeekStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + 7);
      return d;
    });
  };

  const goToToday = () => setWeekStart(getMonday(new Date()));

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={selectedPod ? `${selectedPod.name} — Email Schedule` : 'Select a pod'}
        actions={
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowLegend(!showLegend)}
                className="w-7 h-7 rounded-full border border-white/10 flex items-center justify-center text-[#555] hover:text-white hover:border-white/20 transition-colors"
              >
                <span className="text-[9px] font-bold">?</span>
              </button>
              {showLegend && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#1a1a1a] border border-white/[0.08] rounded-xl p-3 shadow-2xl z-50">
                  <p className="text-[9px] text-[#666] uppercase tracking-wider font-semibold mb-2">Status Colours</p>
                  <div className="space-y-1.5">
                    {EMAIL_STATUSES.map(s => (
                      <div key={s.value} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                        <span className="text-[10px] text-[#999]">{s.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button variant="ghost" size="sm" onClick={goToToday}>
              Today
            </Button>
          </div>
        }
      />

      {/* Week Navigation */}
      <div className="flex items-center justify-between mb-6">
        <Button variant="secondary" size="sm" onClick={prevWeek}>← Prev</Button>
        <Button variant="secondary" size="sm" onClick={nextWeek}>Next →</Button>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="h-16 glass-card rounded-xl shimmer" />
          <div className="h-96 glass-card rounded-xl shimmer" />
        </div>
      ) : (
        <>
          {/* Unassigned items queue */}
          <UnassignedQueue
            items={unassigned}
            brands={podBrands}
            onItemDeleted={loadData}
          />

          {/* Spreadsheet calendar */}
          <CalendarSpreadsheet
            items={items}
            unassignedItems={unassigned}
            brands={podBrands}
            weekStart={weekStart}
            onItemAssigned={loadData}
            onItemUnassigned={loadData}
          />
        </>
      )}
    </div>
  );
}
