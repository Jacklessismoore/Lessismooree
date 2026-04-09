'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';
import { CalendarItem } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { getCalendarItems, getUserCalendarSettings, saveUserCalendarSettings } from '@/lib/db';
import toast from 'react-hot-toast';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_HEADERS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Monday-start week: shift so Mon=0 … Sun=6
  const firstDow = (firstOfMonth.getDay() + 6) % 7;

  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Parse a Google Calendar embed value into a proper iframe src.
// Users will paste one of:
//   - full iframe: <iframe src="https://calendar.google.com/calendar/embed?..." ...></iframe>
//   - raw URL: https://calendar.google.com/calendar/embed?src=...
//   - just the calendar ID / email: jack@lessismoore.com
function parseGoogleEmbed(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Full iframe string — extract src
  if (trimmed.startsWith('<iframe')) {
    const srcMatch = trimmed.match(/src=["']([^"']+)["']/);
    if (srcMatch) return srcMatch[1];
    return null;
  }

  // Already a full embed URL
  if (trimmed.startsWith('https://calendar.google.com/') || trimmed.startsWith('http://calendar.google.com/')) {
    return trimmed;
  }

  // Looks like an email / calendar ID → build a default embed URL
  if (/@/.test(trimmed)) {
    return `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(trimmed)}&ctz=Australia%2FSydney`;
  }

  return null;
}

export default function MyCalendarPage() {
  const { user } = useAuth();
  const { brands } = useApp();

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [workItems, setWorkItems] = useState<CalendarItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Google settings
  const [googleEmbedRaw, setGoogleEmbedRaw] = useState('');
  const [savedGoogleSrc, setSavedGoogleSrc] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Brands the user "owns" — we use manager_id match against auth user for
  // now. Since managers are a separate concept, fall back to ALL brands the
  // user can see if no match. Later this can be tightened.
  const userBrandIds = useMemo(() => brands.map((b) => b.id), [brands]);

  const loadWork = useCallback(async () => {
    if (userBrandIds.length === 0) {
      setWorkItems([]);
      return;
    }
    try {
      const items = await getCalendarItems(userBrandIds, viewMonth, viewYear);
      // Filter to items with a real date (not unassigned queue items)
      setWorkItems(items.filter((i) => !!i.date));
    } catch (err) {
      console.error('Failed to load work items', err);
    }
  }, [userBrandIds, viewMonth, viewYear]);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      const s = await getUserCalendarSettings(user.id);
      if (s?.google_embed_src) {
        setSavedGoogleSrc(s.google_embed_src);
        setGoogleEmbedRaw(s.google_embed_src);
      }
    } catch {
      // non-critical
    }
  }, [user]);

  useEffect(() => {
    loadWork();
  }, [loadWork]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
    setSelectedDay(null);
  };
  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
    setSelectedDay(null);
  };
  const goToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDay(today);
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    const parsed = parseGoogleEmbed(googleEmbedRaw);
    if (!parsed && googleEmbedRaw.trim()) {
      toast.error("Couldn't understand that embed. Paste the full <iframe> or the embed URL.");
      return;
    }
    setSavingSettings(true);
    try {
      await saveUserCalendarSettings(user.id, parsed || '');
      setSavedGoogleSrc(parsed || null);
      toast.success('Google Calendar saved');
      setShowSettings(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingSettings(false);
    }
  };

  // Build the month grid + map work items onto days
  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const workByDay = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of workItems) {
      if (!item.date) continue;
      const key = item.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    }
    return map;
  }, [workItems]);

  const selectedDayItems = selectedDay
    ? workByDay[`${selectedDay.getFullYear()}-${String(selectedDay.getMonth() + 1).padStart(2, '0')}-${String(selectedDay.getDate()).padStart(2, '0')}`] || []
    : [];

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="MY CALENDAR"
        subtitle={`${user?.email || 'Your personal calendar'} — client work overlaid with your Google Calendar`}
        actions={
          <Button variant="secondary" size="sm" onClick={() => setShowSettings((s) => !s)}>
            {showSettings ? 'Close settings' : savedGoogleSrc ? 'Google synced' : '+ Connect Google'}
          </Button>
        }
      />

      {/* Google settings panel */}
      {showSettings && (
        <Card className="p-6 mb-6 animate-fade">
          <p className="label-text mb-2">Connect Google Calendar</p>
          <p className="text-[11px] text-[#888] leading-relaxed mb-4">
            In Google Calendar, go to Settings → your calendar → Integrate calendar → copy the{' '}
            <span className="text-white">Embed code</span> or the public URL. Paste it below.
          </p>
          <textarea
            value={googleEmbedRaw}
            onChange={(e) => setGoogleEmbedRaw(e.target.value)}
            placeholder={`<iframe src="https://calendar.google.com/calendar/embed?src=..."></iframe>\nor just\nhttps://calendar.google.com/calendar/embed?src=...\nor your calendar ID (email)`}
            rows={4}
            className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-[11px] text-white placeholder:text-[#444] resize-y min-h-[100px] mb-3 font-mono"
          />
          <div className="flex items-center gap-2">
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? 'Saving…' : 'Save'}
            </Button>
            {savedGoogleSrc && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!user) return;
                  await saveUserCalendarSettings(user.id, '');
                  setSavedGoogleSrc(null);
                  setGoogleEmbedRaw('');
                  toast.success('Disconnected');
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
          <p className="text-[10px] text-[#555] mt-3">
            Note: the calendar must be shared publicly or with a secret address for the embed to load — this is a Google requirement, not an app limit.
          </p>
        </Card>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrevMonth}
            className="chip-press w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[#888] hover:text-white flex items-center justify-center"
            aria-label="Previous month"
          >
            ←
          </button>
          <button
            onClick={goNextMonth}
            className="chip-press w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[#888] hover:text-white flex items-center justify-center"
            aria-label="Next month"
          >
            →
          </button>
          <Button variant="secondary" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>
        <p className="heading text-xl text-white">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </p>
        <div className="w-[130px]" />
      </div>

      {/* Month grid — client work overlay */}
      <Card className="p-4 mb-6">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="text-[9px] uppercase tracking-wider text-[#555] font-semibold text-center py-1"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={`empty-${i}`} className="aspect-square" />;
            }
            const key = `${cell.getFullYear()}-${String(cell.getMonth() + 1).padStart(2, '0')}-${String(cell.getDate()).padStart(2, '0')}`;
            const dayItems = workByDay[key] || [];
            const isToday = isSameDay(cell, today);
            const isSelected = selectedDay && isSameDay(cell, selectedDay);
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(cell)}
                className={`aspect-square rounded-lg flex flex-col items-start p-1.5 transition-all text-left chip-press ${
                  isSelected
                    ? 'bg-white/[0.08] border border-white/25'
                    : isToday
                    ? 'bg-white/[0.04] border border-white/15'
                    : 'bg-white/[0.02] border border-white/[0.04] hover:border-white/10'
                }`}
              >
                <span
                  className={`text-[10px] font-semibold ${
                    isToday ? 'text-white' : 'text-[#999]'
                  }`}
                >
                  {cell.getDate()}
                </span>
                {dayItems.length > 0 && (
                  <div className="mt-auto w-full flex flex-col gap-0.5 overflow-hidden">
                    {dayItems.slice(0, 2).map((item) => (
                      <div
                        key={item.id}
                        className="w-full h-1 rounded-full"
                        style={{ backgroundColor: item.brand?.color || '#666' }}
                      />
                    ))}
                    {dayItems.length > 2 && (
                      <span className="text-[7px] text-[#666]">+{dayItems.length - 2}</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected day detail */}
      {selectedDay && (
        <Card className="p-6 mb-6 animate-fade">
          <p className="label-text mb-3">
            {selectedDay.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {selectedDayItems.length === 0 ? (
            <p className="text-[11px] text-[#555]">No client work scheduled on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayItems.map((item) => (
                <Link
                  key={item.id}
                  href={item.brief_history_id ? `/briefs/${item.brief_history_id}` : `/calendar`}
                  className="block bg-white/[0.02] border border-white/[0.05] hover:border-white/15 rounded-xl p-3 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: item.brand?.color || '#666' }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-white truncate">{item.name}</p>
                      <p className="text-[10px] text-[#666] mt-0.5">
                        {item.brand?.name}
                        {item.type && <span> · {item.type}</span>}
                        {item.status && <span> · {item.status.replace(/_/g, ' ')}</span>}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Google Calendar embed */}
      {savedGoogleSrc ? (
        <Card className="p-0 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/[0.04]">
            <p className="label-text">Google Calendar</p>
            <p className="text-[10px] text-[#555] mt-1">Your personal Google Calendar, live-embedded.</p>
          </div>
          <div className="w-full bg-white/[0.01]" style={{ aspectRatio: '16/10', minHeight: 500 }}>
            <iframe
              src={savedGoogleSrc}
              className="w-full h-full border-0"
              title="Google Calendar"
              loading="lazy"
            />
          </div>
        </Card>
      ) : (
        <Card className="p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/[0.04] flex items-center justify-center">
            <span className="text-xl">📅</span>
          </div>
          <p className="text-[12px] text-white mb-2">Connect Google Calendar</p>
          <p className="text-[11px] text-[#666] mb-4 max-w-sm mx-auto leading-relaxed">
            Embed your personal Google Calendar inside the workbench so you can see your meetings, calls, and client work all in one place.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setShowSettings(true)}>
            + Connect Google Calendar
          </Button>
        </Card>
      )}
    </div>
  );
}
