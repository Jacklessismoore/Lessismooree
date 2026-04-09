'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';
import { CalendarItem } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import {
  getCalendarItems,
  getUserCalendarSettings,
  saveUserCalendarSettings,
  getPersonalTasks,
  createPersonalTask,
  togglePersonalTask,
  deletePersonalTask,
  PersonalTask,
} from '@/lib/db';
import { createClient } from '@/lib/supabase/client';
import toast from 'react-hot-toast';

type DayTask =
  | { kind: 'non_negotiable'; id: string; title: string; date: string }
  | { kind: 'custom'; task: PersonalTask };

interface GoogleEvent {
  uid: string;
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatEventTime(iso: string, allDay: boolean): string {
  if (allDay) return 'All day';
  const d = new Date(iso);
  return d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true });
}

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

export default function MyCalendarPage() {
  const { user, role } = useAuth();
  const { brands } = useApp();
  const isAccountManager = role === 'admin' || role === 'account_manager';

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [workItems, setWorkItems] = useState<CalendarItem[]>([]);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  // Week view (mobile) — Monday-start week containing the given date
  const getMondayOf = (d: Date): Date => {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = (copy.getDay() + 6) % 7; // Mon=0 … Sun=6
    copy.setDate(copy.getDate() - dow);
    return copy;
  };
  const [weekStart, setWeekStart] = useState<Date>(() => getMondayOf(new Date()));

  // Personal tasks
  const [personalTasks, setPersonalTasks] = useState<PersonalTask[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskTime, setNewTaskTime] = useState(''); // "HH:MM"
  const [newTaskEod, setNewTaskEod] = useState(false);

  // Google settings (ICS for inline overlay)
  const [googleIcsRaw, setGoogleIcsRaw] = useState('');
  const [savedGoogleIcsSrc, setSavedGoogleIcsSrc] = useState<string | null>(null);
  const [googleEvents, setGoogleEvents] = useState<GoogleEvent[]>([]);
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
      // Load the viewed month. If the viewed week straddles into an adjacent
      // month (mobile week view), also load that month so nothing is missed.
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const monthsToLoad = new Set<string>([
        `${viewYear}-${viewMonth}`,
        `${weekStart.getFullYear()}-${weekStart.getMonth()}`,
        `${weekEnd.getFullYear()}-${weekEnd.getMonth()}`,
      ]);
      const batches = await Promise.all(
        Array.from(monthsToLoad).map((key) => {
          const [y, m] = key.split('-').map(Number);
          return getCalendarItems(userBrandIds, m, y);
        })
      );
      const seen = new Set<string>();
      const items = batches.flat().filter((i) => {
        if (seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      });
      const dated = items.filter((i) => !!i.date);

      // /my-calendar only shows work backed by a LIVE brief. We verify each
      // linked brief_history_id against the brief_history table and drop
      // anything whose brief is gone or was never linked. Orphan rows are
      // also deleted from the DB so they stop coming back.
      const linkedIds = Array.from(
        new Set(dated.map((i) => i.brief_history_id).filter((v): v is string => !!v))
      );
      let existingSet = new Set<string>();
      if (linkedIds.length > 0) {
        const sb = createClient();
        if (sb) {
          const { data: existing } = await sb
            .from('brief_history')
            .select('id')
            .in('id', linkedIds);
          existingSet = new Set((existing ?? []).map((b: { id: string }) => b.id));
        }
      }

      const live: CalendarItem[] = [];
      const orphanRowIds: string[] = [];
      for (const item of dated) {
        if (item.brief_history_id && existingSet.has(item.brief_history_id)) {
          live.push(item);
        } else if (item.brief_history_id) {
          // Linked but the brief is gone → real orphan, clean it up
          orphanRowIds.push(item.id);
        } else {
          // No brief link at all → not shown on /my-calendar, but don't delete
          // (could be a bare manual entry on the main calendar)
        }
      }

      if (orphanRowIds.length > 0) {
        const sb = createClient();
        if (sb) {
          sb.from('calendar_items').delete().in('id', orphanRowIds).then(() => {}, () => {});
        }
      }

      setWorkItems(live);
    } catch (err) {
      console.error('Failed to load work items', err);
    }
  }, [userBrandIds, viewMonth, viewYear, weekStart]);

  const loadPersonalTasks = useCallback(async () => {
    if (!user) return;
    try {
      const tasks = await getPersonalTasks(user.id, viewMonth, viewYear);
      setPersonalTasks(tasks);
    } catch (err) {
      console.error('Failed to load personal tasks', err);
    }
  }, [user, viewMonth, viewYear]);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    try {
      const s = await getUserCalendarSettings(user.id);
      if (s?.google_ics_src) {
        setSavedGoogleIcsSrc(s.google_ics_src);
        setGoogleIcsRaw(s.google_ics_src);
      }
    } catch {
      // non-critical
    }
  }, [user]);

  const loadGoogleEvents = useCallback(async () => {
    if (!savedGoogleIcsSrc) {
      setGoogleEvents([]);
      return;
    }
    try {
      // Load a generous window around the visible month so week view works too
      const start = new Date(viewYear, viewMonth - 1, 1).toISOString();
      const end = new Date(viewYear, viewMonth + 2, 1).toISOString();
      const res = await fetch('/api/my-calendar/ics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ icsUrl: savedGoogleIcsSrc, start, end }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Failed to load Google Calendar events', err);
        toast.error(`Google Calendar: ${err.error || 'fetch failed'}`);
        setGoogleEvents([]);
        return;
      }
      const data = await res.json();
      const events = Array.isArray(data.events) ? data.events : [];
      setGoogleEvents(events);
      console.log(`Loaded ${events.length} Google events (${data.total || 0} total parsed)`);
    } catch (err) {
      console.error('Google Calendar fetch error', err);
      setGoogleEvents([]);
    }
  }, [savedGoogleIcsSrc, viewMonth, viewYear]);

  useEffect(() => {
    loadWork();
  }, [loadWork]);

  useEffect(() => {
    loadPersonalTasks();
  }, [loadPersonalTasks]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    loadGoogleEvents();
  }, [loadGoogleEvents]);

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
    setWeekStart(getMondayOf(new Date()));
    setSelectedDay(today);
  };

  const goPrevWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() - 7);
    setWeekStart(next);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setSelectedDay(null);
  };
  const goNextWeek = () => {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + 7);
    setWeekStart(next);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setSelectedDay(null);
  };

  const weekDays = useMemo(() => {
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [weekStart]);

  const handleSaveSettings = async () => {
    if (!user) return;
    const trimmed = googleIcsRaw.trim();
    if (trimmed) {
      if (!/^https:\/\/calendar\.google\.com\//.test(trimmed)) {
        toast.error('Must be a Google Calendar URL (https://calendar.google.com/...)');
        return;
      }
      if (trimmed.includes('/calendar/embed')) {
        toast.error('That\'s the embed URL. Copy the "Secret address in iCal format" instead (ends in /basic.ics)');
        return;
      }
      if (!trimmed.includes('/calendar/ical/') || !trimmed.endsWith('basic.ics')) {
        toast.error('Paste the iCal URL that ends with /basic.ics (Settings → your calendar → Integrate calendar → Secret address in iCal format)');
        return;
      }
    }
    setSavingSettings(true);
    try {
      await saveUserCalendarSettings(user.id, { google_ics_src: trimmed || null });
      setSavedGoogleIcsSrc(trimmed || null);
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

  // Google Calendar events grouped by day (YYYY-MM-DD)
  const googleByDay = useMemo(() => {
    const map: Record<string, GoogleEvent[]> = {};
    for (const ev of googleEvents) {
      const key = ev.start.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(ev);
    }
    // Sort each day by start time
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.start.localeCompare(b.start));
    }
    return map;
  }, [googleEvents]);

  // Auto-generated non-negotiables: "Send over a win" every Mon/Fri for account managers
  const tasksByDay = useMemo(() => {
    const map: Record<string, DayTask[]> = {};
    if (isAccountManager) {
      for (const cell of cells) {
        if (!cell) continue;
        const dow = cell.getDay(); // 0=Sun … 6=Sat
        if (dow === 1 || dow === 5) {
          const key = ymd(cell);
          if (!map[key]) map[key] = [];
          map[key].push({
            kind: 'non_negotiable',
            id: `nn-win-${key}`,
            title: 'Send over a win',
            date: key,
          });
        }
      }
    }
    for (const t of personalTasks) {
      const key = t.date.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push({ kind: 'custom', task: t });
    }
    return map;
  }, [cells, isAccountManager, personalTasks]);

  const handleAddTask = async () => {
    if (!user || !selectedDay || !newTaskTitle.trim()) return;
    try {
      const created = await createPersonalTask({
        user_id: user.id,
        date: ymd(selectedDay),
        title: newTaskTitle.trim(),
        start_time: newTaskTime ? `${newTaskTime}:00` : null,
        is_eod: newTaskEod,
      });
      setPersonalTasks((prev) => [...prev, created]);
      setNewTaskTitle('');
      setNewTaskTime('');
      setNewTaskEod(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add task');
    }
  };

  // Build a Google Calendar "create event" URL for a given task. Opens in a
  // new tab with fields pre-filled; user just hits Save in Google.
  const googleCalendarLinkForTask = (task: PersonalTask): string => {
    const date = task.date.replace(/-/g, ''); // YYYYMMDD
    let dates: string;
    if (task.is_eod) {
      // All-day event
      const d = new Date(task.date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const nextStr = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
      dates = `${date}/${nextStr}`;
    } else if (task.start_time) {
      // Timed event — default 30 min duration
      const [h, m] = task.start_time.split(':').map(Number);
      const startLocal = new Date(task.date);
      startLocal.setHours(h, m, 0, 0);
      const endLocal = new Date(startLocal);
      endLocal.setMinutes(endLocal.getMinutes() + 30);
      const fmt = (d: Date) =>
        `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}00`;
      dates = `${fmt(startLocal)}/${fmt(endLocal)}`;
    } else {
      // All-day fallback
      const d = new Date(task.date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const nextStr = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}`;
      dates = `${date}/${nextStr}`;
    }
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: task.title,
      dates,
      details: task.is_eod ? 'Complete by end of day' : '',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  const handleToggleTask = async (task: PersonalTask) => {
    const next = !task.is_completed;
    setPersonalTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_completed: next } : t)));
    try {
      await togglePersonalTask(task.id, next);
    } catch {
      setPersonalTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, is_completed: task.is_completed } : t)));
      toast.error('Failed to update task');
    }
  };

  const handleDeleteTask = async (task: PersonalTask) => {
    setPersonalTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await deletePersonalTask(task.id);
    } catch {
      toast.error('Failed to delete task');
      loadPersonalTasks();
    }
  };

  const selectedDayKey = selectedDay ? ymd(selectedDay) : '';
  const selectedDayItems = selectedDay ? workByDay[selectedDayKey] || [] : [];
  const selectedDayTasks = selectedDay ? tasksByDay[selectedDayKey] || [] : [];
  const selectedDayGoogle = selectedDay ? googleByDay[selectedDayKey] || [] : [];

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="MY CALENDAR"
        subtitle="Client work + your Google Calendar, in one view."
        actions={
          <Button variant="secondary" size="sm" onClick={() => setShowSettings((s) => !s)}>
            {showSettings ? 'Close' : savedGoogleIcsSrc ? 'Google synced' : '+ Google'}
          </Button>
        }
      />

      {/* Google settings panel */}
      {showSettings && (
        <Card className="p-6 mb-6 animate-fade">
          <p className="label-text mb-2">Connect Google Calendar</p>
          <p className="text-[11px] text-[#888] leading-relaxed mb-4">
            In Google Calendar, go to Settings → your calendar → <span className="text-white">Integrate calendar</span> → copy the{' '}
            <span className="text-white">Secret address in iCal format</span>. Paste the URL below (ends in <code className="text-white">basic.ics</code>).
          </p>
          <input
            type="text"
            value={googleIcsRaw}
            onChange={(e) => setGoogleIcsRaw(e.target.value)}
            placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
            className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-[11px] text-white placeholder:text-[#444] mb-2 font-mono"
          />
          {savedGoogleIcsSrc && (
            <p className="text-[10px] text-[#666] mb-3 break-all font-mono">
              Currently saved: <span className="text-[#888]">{savedGoogleIcsSrc}</span>
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button onClick={handleSaveSettings} disabled={savingSettings}>
              {savingSettings ? 'Saving…' : 'Save'}
            </Button>
            {savedGoogleIcsSrc && (
              <Button
                variant="secondary"
                onClick={async () => {
                  if (!user) return;
                  await saveUserCalendarSettings(user.id, { google_ics_src: null });
                  setSavedGoogleIcsSrc(null);
                  setGoogleIcsRaw('');
                  setGoogleEvents([]);
                  toast.success('Disconnected');
                }}
              >
                Disconnect
              </Button>
            )}
          </div>
          <p className="text-[10px] text-[#555] mt-3">
            Only you can see this — the secret address is private, and events are pulled server-side and rendered inline in the grid below.
          </p>
        </Card>
      )}

      {/* Navigation — week on mobile, month on desktop */}
      <div className="flex sm:hidden items-center justify-between mb-4 gap-2">
        <p className="heading text-base text-white truncate">
          {(() => {
            const we = new Date(weekStart);
            we.setDate(we.getDate() + 6);
            const sameMonth = weekStart.getMonth() === we.getMonth();
            const startLabel = `${weekStart.getDate()} ${MONTH_NAMES[weekStart.getMonth()].slice(0, 3)}`;
            const endLabel = sameMonth
              ? `${we.getDate()}`
              : `${we.getDate()} ${MONTH_NAMES[we.getMonth()].slice(0, 3)}`;
            return `${startLabel} – ${endLabel}`;
          })()}
        </p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={goPrevWeek}
            className="chip-press w-8 h-8 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[#888] hover:text-white flex items-center justify-center"
            aria-label="Previous week"
          >
            ←
          </button>
          <button
            onClick={goNextWeek}
            className="chip-press w-8 h-8 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[#888] hover:text-white flex items-center justify-center"
            aria-label="Next week"
          >
            →
          </button>
          <Button variant="secondary" size="sm" onClick={goToday}>
            Today
          </Button>
        </div>
      </div>

      <div className="hidden sm:flex items-center justify-between mb-4 gap-2">
        <p className="heading text-xl text-white truncate">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
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
      </div>

      {/* Mobile: vertical week view with full-width day cards */}
      <div className="sm:hidden mb-6 space-y-2">
        {weekDays.map((day) => {
          const key = ymd(day);
          const dayItems = workByDay[key] || [];
          const dayTasks = tasksByDay[key] || [];
          const isToday = isSameDay(day, today);
          const isSelected = selectedDay && isSameDay(day, selectedDay);
          const hasNonNegotiable = dayTasks.some((t) => t.kind === 'non_negotiable');
          return (
            <button
              key={key}
              onClick={() => setSelectedDay(day)}
              className={`w-full text-left chip-press rounded-xl p-3 border transition-all ${
                isSelected
                  ? 'bg-white/[0.06] border-white/25'
                  : isToday
                  ? 'bg-white/[0.03] border-white/15'
                  : 'bg-white/[0.02] border-white/[0.05]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-[#666] font-semibold">
                    {DAY_HEADERS[(day.getDay() + 6) % 7]}
                  </span>
                  <span
                    className={`text-[15px] font-semibold ${
                      isToday ? 'text-white' : 'text-[#ccc]'
                    }`}
                  >
                    {day.getDate()}
                  </span>
                  {isToday && (
                    <span className="text-[9px] uppercase tracking-wider text-amber-300">
                      Today
                    </span>
                  )}
                </div>
                {hasNonNegotiable && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                )}
              </div>
              {(() => {
                const dayGoogle = googleByDay[key] || [];
                const customTasks = dayTasks.filter((t) => t.kind === 'custom');
                const nothing = dayItems.length === 0 && dayTasks.length === 0 && dayGoogle.length === 0;
                if (nothing) return <p className="text-[10px] text-[#444]">Nothing scheduled</p>;
                return (
                  <div className="flex flex-col gap-1 mt-0.5">
                    {dayItems.slice(0, 2).map((item) => (
                      <span key={item.id} className="text-[10px] text-[#aaa] flex items-center gap-1.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.brand?.color || '#666' }} />
                        {item.brand?.name}
                      </span>
                    ))}
                    {dayGoogle.slice(0, 2).map((ev) => (
                      <span key={ev.uid} className="text-[10px] text-[#9cb4ff] flex items-center gap-1.5 truncate">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#6b8cff] flex-shrink-0" />
                        <span className="truncate">{formatEventTime(ev.start, ev.allDay)} · {ev.title}</span>
                      </span>
                    ))}
                    {customTasks.slice(0, 2).map((t) => {
                      if (t.kind !== 'custom') return null;
                      const timeLabel = t.task.is_eod
                        ? 'EOD'
                        : t.task.start_time
                        ? new Date(`2000-01-01T${t.task.start_time}`).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit', hour12: true })
                        : null;
                      return (
                        <span key={t.task.id} className="text-[10px] text-[#fbbf24] flex items-center gap-1.5 truncate">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                          <span className="truncate">{timeLabel ? `${timeLabel} · ` : ''}{t.task.title}</span>
                        </span>
                      );
                    })}
                    {(dayItems.length + dayGoogle.length + customTasks.length > 5) && (
                      <span className="text-[9px] text-[#555]">
                        +{dayItems.length + dayGoogle.length + customTasks.length - 5} more
                      </span>
                    )}
                  </div>
                );
              })()}
            </button>
          );
        })}
      </div>

      {/* Desktop: month grid — client work overlay */}
      <Card className="hidden sm:block p-2 sm:p-4 mb-6">
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-2">
          {DAY_HEADERS.map((d) => (
            <div
              key={d}
              className="text-[8px] sm:text-[9px] uppercase tracking-wider text-[#555] font-semibold text-center py-1"
            >
              <span className="sm:hidden">{d[0]}</span>
              <span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
          {cells.map((cell, i) => {
            if (!cell) {
              return <div key={`empty-${i}`} className="aspect-square" />;
            }
            const key = ymd(cell);
            const dayItems = workByDay[key] || [];
            const dayTasks = tasksByDay[key] || [];
            const dayGoogle = googleByDay[key] || [];
            const hasNonNegotiable = dayTasks.some((t) => t.kind === 'non_negotiable');
            const isToday = isSameDay(cell, today);
            const isSelected = selectedDay && isSameDay(cell, selectedDay);
            return (
              <button
                key={key}
                onClick={() => setSelectedDay(cell)}
                className={`relative aspect-square rounded-md sm:rounded-lg flex flex-col items-start p-1 sm:p-1.5 transition-all text-left chip-press ${
                  isSelected
                    ? 'bg-white/[0.08] border border-white/25'
                    : isToday
                    ? 'bg-white/[0.04] border border-white/15'
                    : 'bg-white/[0.02] border border-white/[0.04] hover:border-white/10'
                }`}
              >
                <span
                  className={`text-[11px] sm:text-[10px] font-semibold ${
                    isToday ? 'text-white' : 'text-[#999]'
                  }`}
                >
                  {cell.getDate()}
                </span>
                {hasNonNegotiable && (
                  <span
                    className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-1.5 h-1.5 rounded-full bg-amber-400"
                    title="Non-negotiable"
                  />
                )}
                {(dayItems.length > 0 || dayTasks.length > 0 || dayGoogle.length > 0) && (
                  <div className="mt-auto w-full flex flex-col gap-0.5 overflow-hidden">
                    {dayItems.slice(0, 2).map((item) => (
                      <div
                        key={item.id}
                        className="w-full h-1 rounded-full"
                        style={{ backgroundColor: item.brand?.color || '#666' }}
                      />
                    ))}
                    {dayGoogle.slice(0, 2).map((ev) => (
                      <span
                        key={ev.uid}
                        className="hidden sm:inline text-[8px] text-[#9cb4ff] truncate"
                      >
                        <span className="inline-block w-1 h-1 rounded-full bg-[#6b8cff] mr-1 align-middle" />
                        {ev.title}
                      </span>
                    ))}
                    {dayTasks.length > 0 && (
                      <span className="hidden sm:inline text-[8px] text-[#999] truncate">
                        {dayTasks.length} task{dayTasks.length === 1 ? '' : 's'}
                      </span>
                    )}
                    {dayItems.length + dayGoogle.length > 4 && (
                      <span className="hidden sm:inline text-[7px] text-[#666]">+{dayItems.length + dayGoogle.length - 4}</span>
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
        <Card className="p-4 sm:p-6 mb-6 animate-fade">
          <p className="label-text mb-3">
            {selectedDay.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
          {/* Tasks (non-negotiables + custom) */}
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-[#666] mb-2">Tasks</p>
            {selectedDayTasks.length === 0 ? (
              <p className="text-[11px] text-[#555] mb-2">No tasks for this day.</p>
            ) : (
              <div className="space-y-1.5 mb-2">
                {selectedDayTasks.map((t) =>
                  t.kind === 'non_negotiable' ? (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 bg-amber-400/[0.06] border border-amber-400/20 rounded-lg px-3 py-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      <span className="text-[11px] text-white flex-1">{t.title}</span>
                      <span className="text-[9px] uppercase tracking-wider text-amber-400/70">Non-negotiable</span>
                    </div>
                  ) : (
                    <div
                      key={t.task.id}
                      className="flex items-center gap-2 bg-white/[0.02] border border-white/[0.05] rounded-lg px-3 py-2 group"
                    >
                      <button
                        onClick={() => handleToggleTask(t.task)}
                        className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                          t.task.is_completed
                            ? 'bg-white/20 border-white/40'
                            : 'border-white/20 hover:border-white/40'
                        }`}
                        aria-label={t.task.is_completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {t.task.is_completed && <span className="text-[9px] text-white">✓</span>}
                      </button>
                      <div className={`flex-1 min-w-0 ${t.task.is_completed ? 'opacity-50' : ''}`}>
                        <p
                          className={`text-[11px] truncate ${
                            t.task.is_completed ? 'text-[#555] line-through' : 'text-white'
                          }`}
                        >
                          {t.task.title}
                        </p>
                        {(t.task.start_time || t.task.is_eod) && (
                          <p className="text-[9px] text-[#888] mt-0.5">
                            {t.task.is_eod
                              ? 'By end of day'
                              : t.task.start_time
                              ? new Date(`2000-01-01T${t.task.start_time}`).toLocaleTimeString('en-AU', {
                                  hour: 'numeric',
                                  minute: '2-digit',
                                  hour12: true,
                                })
                              : ''}
                          </p>
                        )}
                      </div>
                      <a
                        href={googleCalendarLinkForTask(t.task)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[9px] uppercase tracking-wider text-[#666] hover:text-[#6b8cff] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                        title="Add to Google Calendar"
                      >
                        + GCAL
                      </a>
                      <button
                        onClick={() => handleDeleteTask(t.task)}
                        className="text-[#555] hover:text-white opacity-0 group-hover:opacity-100 transition-opacity text-[11px] flex-shrink-0"
                        aria-label="Delete task"
                      >
                        ×
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
            <div className="space-y-2">
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTask();
                }}
                placeholder="Add a task…"
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[12px] text-white placeholder:text-[#444]"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="time"
                  value={newTaskTime}
                  onChange={(e) => {
                    setNewTaskTime(e.target.value);
                    if (e.target.value) setNewTaskEod(false);
                  }}
                  disabled={newTaskEod}
                  className="input-polish bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-white disabled:opacity-40 [color-scheme:dark]"
                />
                <label className="flex items-center gap-1.5 text-[11px] text-[#aaa] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={newTaskEod}
                    onChange={(e) => {
                      setNewTaskEod(e.target.checked);
                      if (e.target.checked) setNewTaskTime('');
                    }}
                    className="w-3.5 h-3.5 accent-amber-400"
                  />
                  Complete by EOD
                </label>
                <Button
                  size="sm"
                  onClick={handleAddTask}
                  disabled={!newTaskTitle.trim()}
                  className="ml-auto flex-shrink-0"
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Google Calendar events */}
          {savedGoogleIcsSrc && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-2">Google Calendar</p>
              {selectedDayGoogle.length === 0 ? (
                <p className="text-[11px] text-[#555]">No Google events.</p>
              ) : (
                <div className="space-y-1.5">
                  {selectedDayGoogle.map((ev) => (
                    <div
                      key={ev.uid}
                      className="flex items-start gap-2 bg-[#6b8cff]/[0.06] border border-[#6b8cff]/20 rounded-lg px-3 py-2"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6b8cff] flex-shrink-0 mt-1.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] text-white truncate">{ev.title}</p>
                        <p className="text-[9px] text-[#888] mt-0.5">{formatEventTime(ev.start, ev.allDay)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-[10px] uppercase tracking-wider text-[#666] mb-2">Client work</p>
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

      {/* Empty state when Google isn't connected */}
      {!savedGoogleIcsSrc && (
        <Card className="p-6 sm:p-8 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-white/[0.04] flex items-center justify-center">
            <span className="text-xl">📅</span>
          </div>
          <p className="text-[12px] text-white mb-2">Connect Google Calendar</p>
          <p className="text-[11px] text-[#666] mb-4 max-w-sm mx-auto leading-relaxed">
            Paste your Google Calendar secret iCal URL to overlay meetings, calls, and events directly on the grid above alongside your client work.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setShowSettings(true)}>
            + Connect Google Calendar
          </Button>
        </Card>
      )}
    </div>
  );
}
