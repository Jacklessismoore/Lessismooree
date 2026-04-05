'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { getSOPCompletions, upsertSOPCompletion } from '@/lib/db';
import { SOPCompletion, Manager } from '@/lib/types';
import { MORNING_SOP_ITEMS, EVENING_SOP_ITEMS } from '@/lib/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import toast from 'react-hot-toast';
import { fireCelebration } from '@/lib/celebration';
import { CelebrationOverlay } from '@/components/celebration-overlay';

// SOP day resets at 4am local time — before 4am counts as previous day
function getSOPDate(timezone: string): string {
  const now = new Date();
  const localHour = parseInt(now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }));
  if (localHour < 4) {
    // Before 4am — still "yesterday's" SOP day
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    return yesterday.toLocaleDateString('en-CA', { timeZone: timezone });
  }
  return now.toLocaleDateString('en-CA', { timeZone: timezone });
}

function getManagerLocalTime(timezone: string): string {
  return new Date().toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function getManagerLocalHour(timezone: string): number {
  return parseInt(new Date().toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }));
}

type SOPStatus = 'all_done' | 'morning_done' | 'overdue' | 'needs_completing' | 'not_started_yet';

function getSOPStatus(timezone: string, morningDone: boolean, eveningDone: boolean): { status: SOPStatus; label: string; color: string; bgColor: string } {
  const hour = getManagerLocalHour(timezone);

  // Both done — always show as complete regardless of time
  if (morningDone && eveningDone) {
    return { status: 'all_done', label: 'All Done', color: '#10B981', bgColor: 'bg-green-400/10' };
  }

  // Before 4am — this is still the previous SOP day
  // If they haven't finished yesterday's SOP, show as incomplete
  if (hour < 4) {
    if (!morningDone && !eveningDone) {
      return { status: 'needs_completing', label: 'Not started', color: '#555', bgColor: 'bg-white/[0.03]' };
    }
    if (morningDone && !eveningDone) {
      return { status: 'morning_done', label: 'Evening pending', color: '#3B82F6', bgColor: 'bg-blue-400/10' };
    }
    return { status: 'needs_completing', label: 'Incomplete', color: '#F59E0B', bgColor: 'bg-amber-400/10' };
  }

  // Between 4am and 7am — new day, morning SOP window (not yet overdue)
  if (hour < 7) {
    if (morningDone) {
      return { status: 'morning_done', label: 'Evening pending', color: '#3B82F6', bgColor: 'bg-blue-400/10' };
    }
    return { status: 'needs_completing', label: 'Needs completing', color: '#3B82F6', bgColor: 'bg-blue-400/10' };
  }

  // After 7am — morning should be done by now
  if (!morningDone) {
    return { status: 'overdue', label: 'Overdue', color: '#EF4444', bgColor: 'bg-red-400/10' };
  }
  // Morning done, evening pending
  return { status: 'morning_done', label: 'Evening pending', color: '#3B82F6', bgColor: 'bg-blue-400/10' };
}

type View = 'managers' | 'checklist';
type SOPTab = 'morning' | 'evening';

export default function SOPPage() {
  const { managers, selectedPod } = useApp();
  const podManagers = selectedPod
    ? managers.filter(m => m.pod_id === selectedPod.id || !m.pod_id)
    : managers;
  const [view, setView] = useState<View>('managers');
  const [selectedManager, setSelectedManager] = useState<Manager | null>(null);
  const [completions, setCompletions] = useState<SOPCompletion[]>([]);
  const [morningChecked, setMorningChecked] = useState<string[]>([]);
  const [eveningChecked, setEveningChecked] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<SOPTab>('morning');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [celebrationWord, setCelebrationWord] = useState<string | null>(null);
  const [allManagerCompletions, setAllManagerCompletions] = useState<Record<string, { morning: boolean; evening: boolean }>>({});

  const tz = selectedManager?.timezone || 'Australia/Sydney';
  const today = selectedManager ? getSOPDate(tz) : '';
  const currentMonth = today.slice(0, 7);

  // Load all manager completions for the manager selection screen
  const loadAllManagerCompletions = useCallback(async () => {
    const results: Record<string, { morning: boolean; evening: boolean }> = {};
    for (const manager of podManagers) {
      try {
        const mTz = manager.timezone || 'Australia/Sydney';
        const mDate = getSOPDate(mTz);
        const data = await getSOPCompletions(manager.id, mDate.slice(0, 7));
        const morningToday = data.find(c => c.date === mDate && c.sop_type === 'morning');
        const eveningToday = data.find(c => c.date === mDate && c.sop_type === 'evening');
        results[manager.id] = {
          morning: morningToday?.completed_at != null,
          evening: eveningToday?.completed_at != null,
        };
      } catch {
        results[manager.id] = { morning: false, evening: false };
      }
    }
    setAllManagerCompletions(results);
  }, [podManagers]);

  useEffect(() => {
    loadAllManagerCompletions();
  }, [loadAllManagerCompletions]);

  const loadCompletions = useCallback(async () => {
    if (!selectedManager) return;
    setLoading(true);
    try {
      const data = await getSOPCompletions(selectedManager.id, currentMonth);
      setCompletions(data);

      const morningToday = data.find(c => c.date === today && c.sop_type === 'morning');
      setMorningChecked(morningToday?.completed_items || []);

      const eveningToday = data.find(c => c.date === today && c.sop_type === 'evening');
      setEveningChecked(eveningToday?.completed_items || []);
    } catch (e) {
      console.error('Failed to load SOP:', e);
    }
    setLoading(false);
  }, [selectedManager, today, currentMonth]);

  useEffect(() => {
    if (selectedManager) loadCompletions();
  }, [selectedManager, loadCompletions]);

  const handleToggleItem = async (itemId: string, sopType: SOPTab) => {
    if (!selectedManager) return;

    const currentChecked = sopType === 'morning' ? morningChecked : eveningChecked;
    const setChecked = sopType === 'morning' ? setMorningChecked : setEveningChecked;
    const items = sopType === 'morning' ? MORNING_SOP_ITEMS : EVENING_SOP_ITEMS;

    const newChecked = currentChecked.includes(itemId)
      ? currentChecked.filter(id => id !== itemId)
      : [...currentChecked, itemId];

    setChecked(newChecked);
    const allDone = newChecked.length === items.length;

    setSaving(true);
    try {
      await upsertSOPCompletion({
        manager_id: selectedManager.id,
        date: today,
        sop_type: sopType,
        completed_items: newChecked,
        completed_at: allDone ? new Date().toISOString() : null,
      });
      if (allDone) {
        // Only celebrate if morning SOP is on time (not overdue)
        const isOnTime = sopType === 'evening' || !morningOverdue;
        if (isOnTime) {
          const word = fireCelebration();
          setCelebrationWord(word);
          setTimeout(() => setCelebrationWord(null), 3500);
        } else {
          toast.success(`${sopType === 'morning' ? 'Morning' : 'Evening'} SOP completed (late)`);
        }
      }
      await loadCompletions();
    } catch {
      toast.error('Failed to save');
    }
    setSaving(false);
  };

  // Computed values (must be before any conditional returns for hook safety)
  const localTime = selectedManager ? getManagerLocalTime(tz) : '';
  const morningOverdue = getManagerLocalHour(tz) >= 7;
  const morningAllDone = morningChecked.length === MORNING_SOP_ITEMS.length;
  const eveningAllDone = eveningChecked.length === EVENING_SOP_ITEMS.length;
  const eveningLocked = !morningAllDone;

  // Auto-switch to evening tab when morning is done
  useEffect(() => {
    if (morningAllDone && activeTab === 'morning') {
      setActiveTab('evening');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morningAllDone]);

  // ─── Manager Selection ───
  if (view === 'managers') {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader title="SOP CHECKLIST" subtitle="Daily standard operating procedures" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {podManagers.map((manager, i) => {
            const mTz = manager.timezone || 'Australia/Sydney';
            const localTime = getManagerLocalTime(mTz);
            const comp = allManagerCompletions[manager.id] || { morning: false, evening: false };
            const sopStatus = getSOPStatus(mTz, comp.morning, comp.evening);

            return (
              <Card
                key={manager.id}
                hoverable
                padding="md"
                onClick={() => { setSelectedManager(manager); setView('checklist'); }}
                className="animate-fade-in"
                style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-semibold text-white">{manager.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-white uppercase tracking-wider">{manager.name}</p>
                    <p className="text-[9px] text-[#555] mt-0.5">{localTime} local</p>
                  </div>
                  {sopStatus.label && (
                    <span
                      className={`text-[9px] font-semibold px-2 py-0.5 rounded flex-shrink-0 ${sopStatus.bgColor}`}
                      style={{ color: sopStatus.color }}
                    >
                      {sopStatus.label}
                    </span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>

        {podManagers.length === 0 && (
          <div className="text-center py-16">
            <p className="text-[#555] text-sm">No account managers yet. Add managers in Pods & Team.</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Checklist View ───
  const activeItems = activeTab === 'morning' ? MORNING_SOP_ITEMS : EVENING_SOP_ITEMS;
  const activeChecked = activeTab === 'morning' ? morningChecked : eveningChecked;
  const activeAllDone = activeTab === 'morning' ? morningAllDone : eveningAllDone;

  const morningCompletion = completions.find(c => c.date === today && c.sop_type === 'morning');
  const eveningCompletion = completions.find(c => c.date === today && c.sop_type === 'evening');

  // Calendar data
  const [calYear, calMonth] = currentMonth.split('-').map(Number);
  const daysInMonth = new Date(calYear, calMonth, 0).getDate();
  const calDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const dateStr = `${currentMonth}-${String(day).padStart(2, '0')}`;
    const morning = completions.find(c => c.date === dateStr && c.sop_type === 'morning');
    const evening = completions.find(c => c.date === dateStr && c.sop_type === 'evening');
    const isToday = dateStr === today;
    const isPast = dateStr < today;
    const isFuture = dateStr > today;
    const morningDone = morning?.completed_at != null;
    const eveningDone = evening?.completed_at != null;
    const morningPartial = morning && !morning.completed_at && (morning.completed_items?.length || 0) > 0;
    const eveningPartial = evening && !evening.completed_at && (evening.completed_items?.length || 0) > 0;
    const bothDone = morningDone && eveningDone;
    const anyPartial = morningPartial || eveningPartial || (morningDone && !eveningDone) || (!morningDone && eveningDone);

    return { day, dateStr, isToday, isPast, isFuture, bothDone, anyPartial, morningDone, eveningDone };
  });

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={selectedManager?.name?.toUpperCase() || 'SOP'}
        subtitle={`${localTime} local time`}
        actions={
          <Button variant="secondary" size="sm" onClick={() => { setView('managers'); setSelectedManager(null); loadAllManagerCompletions(); }}>
            ← Back
          </Button>
        }
      />

      {/* Morning/Evening tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setActiveTab('morning')}
          className={`px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider font-medium transition-all duration-200 flex items-center gap-2 ${
            activeTab === 'morning'
              ? 'bg-white text-black'
              : 'bg-white/[0.03] border border-white/[0.06] text-[#666] hover:text-white hover:border-white/15'
          }`}
        >
          Morning
          {morningAllDone ? (
            <span className="text-[8px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded">Done</span>
          ) : (
            <span className="opacity-60">{morningChecked.length}/{MORNING_SOP_ITEMS.length}</span>
          )}
        </button>
        <button
          onClick={() => !eveningLocked && setActiveTab('evening')}
          disabled={eveningLocked}
          className={`px-4 py-2 rounded-xl text-[10px] uppercase tracking-wider font-medium transition-all duration-200 flex items-center gap-2 ${
            eveningLocked
              ? 'bg-white/[0.02] border border-white/[0.04] text-[#333] cursor-not-allowed'
              : activeTab === 'evening'
              ? 'bg-white text-black'
              : 'bg-white/[0.03] border border-white/[0.06] text-[#666] hover:text-white hover:border-white/15'
          }`}
        >
          Evening
          {eveningLocked ? (
            <span className="text-[8px] text-[#333]">🔒</span>
          ) : eveningAllDone ? (
            <span className="text-[8px] bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded">Done</span>
          ) : (
            <span className="opacity-60">{eveningChecked.length}/{EVENING_SOP_ITEMS.length}</span>
          )}
        </button>
      </div>

      {/* Status banners */}
      {activeTab === 'morning' && morningOverdue && !morningAllDone && (
        <div className="glass-card rounded-xl mb-4 px-4 py-3 border-l-2 border-red-500 animate-fade-in">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <p className="text-[11px] text-red-400 font-medium">Morning SOP overdue. Should be completed by 7:00 AM</p>
          </div>
        </div>
      )}

      {activeAllDone && (
        <div className="glass-card rounded-xl mb-4 px-4 py-3 border-l-2 border-green-500 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="text-sm">✅</span>
            <p className="text-[11px] text-green-400 font-medium">
              {activeTab === 'morning' ? 'Morning' : 'Evening'} SOP completed
              {(() => {
                const comp = activeTab === 'morning' ? morningCompletion : eveningCompletion;
                return comp?.completed_at ? ` at ${new Date(comp.completed_at).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })}` : '';
              })()}
            </p>
          </div>
        </div>
      )}

      {/* Checklist */}
      <Card className="mb-6">
        <p className="label-text mb-4">
          {activeTab === 'morning' ? 'Morning Checklist — Due by 7:00 AM' : 'Evening Checklist'}
        </p>
        <div className="space-y-1">
          {activeItems.map((item) => {
            const isChecked = activeChecked.includes(item.id);
            return (
              <button
                key={item.id}
                onClick={() => handleToggleItem(item.id, activeTab)}
                disabled={saving}
                className={`w-full flex items-start gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 group ${
                  isChecked ? 'bg-white/[0.02] opacity-60' : 'hover:bg-white/[0.03]'
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all duration-200 ${
                  isChecked ? 'bg-green-500 border-green-500' : 'border-white/[0.15] group-hover:border-white/30'
                }`}>
                  {isChecked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className={`text-[12px] font-medium transition-all duration-200 ${isChecked ? 'text-[#555] line-through' : 'text-white'}`}>
                    {item.label}
                  </p>
                  <p className={`text-[10px] mt-0.5 transition-all duration-200 ${isChecked ? 'text-[#333]' : 'text-[#555]'}`}>
                    {item.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Progress */}
        <div className="mt-4 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-[#555]">{activeChecked.length} of {activeItems.length} completed</span>
            <span className="text-[10px] text-[#555]">{Math.round((activeChecked.length / activeItems.length) * 100)}%</span>
          </div>
          <div className="w-full bg-white/[0.04] rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${(activeChecked.length / activeItems.length) * 100}%`,
                backgroundColor: activeAllDone ? '#10B981' : '#F59E0B',
              }}
            />
          </div>
        </div>
      </Card>

      {/* Monthly completion calendar */}
      <Card>
        <p className="label-text mb-4">
          {new Date(calYear, calMonth - 1).toLocaleString('en', { month: 'long', year: 'numeric' })} — Completion Tracker
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[8px] text-[#444] uppercase font-medium pb-1">{d}</div>
          ))}

          {(() => {
            const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
            const offset = firstDay === 0 ? 6 : firstDay - 1;
            return Array.from({ length: offset }, (_, i) => <div key={`empty-${i}`} />);
          })()}

          {calDays.map(({ day, isToday, isPast, isFuture, bothDone, anyPartial, morningDone, eveningDone }) => (
            <div
              key={day}
              className={`rounded-xl p-1.5 sm:p-2 flex flex-col items-center justify-center transition-all duration-200 min-h-[52px] sm:min-h-[64px] ${
                isToday ? 'ring-1 ring-white/25' : ''
              } ${
                bothDone
                  ? 'bg-green-500/15'
                  : anyPartial
                  ? 'bg-amber-500/10'
                  : isPast && !isFuture
                  ? 'bg-red-500/[0.07]'
                  : ''
              }`}
            >
              <span className={`text-[11px] font-semibold mb-1 ${
                bothDone ? 'text-green-400' :
                anyPartial ? 'text-amber-400' :
                isPast && !isFuture ? 'text-red-400/50' :
                isFuture ? 'text-[#333]' : 'text-[#999]'
              }`}>{day}</span>

              {/* AM/PM indicators */}
              {(isPast || isToday) && !isFuture && (
                <div className="flex flex-col gap-0.5 w-full">
                  <div className={`flex items-center justify-center gap-1 rounded px-1 py-0.5 ${
                    morningDone ? 'bg-green-500/20' : 'bg-white/[0.03]'
                  }`}>
                    <span className={`text-[7px] font-bold uppercase ${morningDone ? 'text-green-400' : 'text-[#333]'}`}>AM</span>
                  </div>
                  <div className={`flex items-center justify-center gap-1 rounded px-1 py-0.5 ${
                    eveningDone ? 'bg-green-500/20' : 'bg-white/[0.03]'
                  }`}>
                    <span className={`text-[7px] font-bold uppercase ${eveningDone ? 'text-green-400' : 'text-[#333]'}`}>PM</span>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-4 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-green-500/15 flex items-center justify-center">
              <span className="text-[5px] text-green-400 font-bold">AM</span>
            </div>
            <span className="text-[9px] text-[#555]">Completed</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-500/10" />
            <span className="text-[9px] text-[#555]">Partial</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-red-500/[0.07]" />
            <span className="text-[9px] text-[#555]">Missed</span>
          </div>
        </div>
      </Card>

      {loading && (
        <div className="text-center py-4">
          <span className="text-[10px] text-[#444]">Loading...</span>
        </div>
      )}

      <CelebrationOverlay word={celebrationWord} />
    </div>
  );
}
