import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

interface IcsEvent {
  uid: string;
  title: string;
  start: string; // ISO date or datetime
  end: string | null;
  allDay: boolean;
}

interface RawEvent {
  uid?: string;
  title?: string;
  start?: string;
  end?: string;
  allDay?: boolean;
  rrule?: string;
  exdates?: string[];
  recurrenceId?: string;
}

// Minimal VEVENT parser. Handles the subset of iCalendar that Google Calendar
// emits: DTSTART/DTEND (with or without TZID), DATE-only all-day events,
// SUMMARY, UID, RRULE (FREQ=DAILY/WEEKLY/MONTHLY with INTERVAL/UNTIL/COUNT/BYDAY),
// EXDATE, and line folding.
function parseIcs(text: string, windowStart: Date, windowEnd: Date): IcsEvent[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);

  const raws: RawEvent[] = [];
  let current: RawEvent | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (current && current.start) raws.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const keyPart = line.slice(0, colonIdx);
    const valuePart = line.slice(colonIdx + 1);
    const [rawKey] = keyPart.split(';');

    if (rawKey === 'SUMMARY') {
      current.title = unescapeIcsText(valuePart);
    } else if (rawKey === 'UID') {
      current.uid = valuePart;
    } else if (rawKey === 'DTSTART') {
      const parsed = parseIcsDate(keyPart, valuePart);
      current.start = parsed.iso;
      if (parsed.allDay) current.allDay = true;
    } else if (rawKey === 'DTEND') {
      const parsed = parseIcsDate(keyPart, valuePart);
      current.end = parsed.iso;
    } else if (rawKey === 'RRULE') {
      current.rrule = valuePart;
    } else if (rawKey === 'EXDATE') {
      const vals = valuePart.split(',').map((v) => parseIcsDate(keyPart, v).iso);
      current.exdates = [...(current.exdates ?? []), ...vals];
    } else if (rawKey === 'RECURRENCE-ID') {
      current.recurrenceId = valuePart;
    }
  }

  // Expand into concrete occurrences within the requested window.
  const out: IcsEvent[] = [];
  for (const raw of raws) {
    if (!raw.start) continue;
    const base: IcsEvent = {
      uid: raw.uid || Math.random().toString(36).slice(2),
      title: raw.title || '(Untitled)',
      start: raw.start,
      end: raw.end ?? null,
      allDay: !!raw.allDay,
    };

    if (!raw.rrule) {
      out.push(base);
      continue;
    }

    // Expand RRULE
    const occurrences = expandRRule(base, raw.rrule, windowStart, windowEnd, raw.exdates ?? []);
    out.push(...occurrences);
  }

  return out;
}

function expandRRule(
  base: IcsEvent,
  rruleStr: string,
  windowStart: Date,
  windowEnd: Date,
  exdates: string[]
): IcsEvent[] {
  const parts = Object.fromEntries(
    rruleStr.split(';').map((p) => {
      const [k, v] = p.split('=');
      return [k, v];
    })
  );
  const freq = parts.FREQ;
  const interval = parseInt(parts.INTERVAL || '1', 10);
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) : null;
  const until = parts.UNTIL ? parseIcsDate('', parts.UNTIL).iso : null;
  const byDay: string[] = parts.BYDAY ? parts.BYDAY.split(',') : [];

  const dayMap: Record<string, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

  const startDate = new Date(base.start);
  if (isNaN(startDate.getTime())) return [base];

  const untilDate = until ? new Date(until) : null;
  const effectiveEnd = untilDate && untilDate < windowEnd ? untilDate : windowEnd;

  const exSet = new Set(exdates.map((d) => d.slice(0, 19)));

  const out: IcsEvent[] = [];
  let emitted = 0;
  const maxIterations = 2000; // safety cap
  let iterations = 0;

  const pushOccurrence = (occStart: Date) => {
    if (count !== null && emitted >= count) return;
    if (occStart > effectiveEnd) return;
    if (occStart < windowStart) return;
    const iso = toIsoLike(occStart, base.allDay);
    if (exSet.has(iso.slice(0, 19))) return;
    let occEnd: string | null = null;
    if (base.end) {
      const duration = new Date(base.end).getTime() - new Date(base.start).getTime();
      if (!isNaN(duration)) {
        occEnd = toIsoLike(new Date(occStart.getTime() + duration), base.allDay);
      }
    }
    out.push({
      ...base,
      uid: `${base.uid}-${iso}`,
      start: iso,
      end: occEnd,
    });
    emitted++;
  };

  if (freq === 'DAILY') {
    const cursor = new Date(startDate);
    while (cursor <= effectiveEnd && iterations < maxIterations) {
      pushOccurrence(new Date(cursor));
      cursor.setDate(cursor.getDate() + interval);
      iterations++;
      if (count !== null && emitted >= count) break;
    }
  } else if (freq === 'WEEKLY') {
    const weekDayNums = byDay.length > 0 ? byDay.map((d) => dayMap[d.slice(-2)]).filter((n) => n !== undefined) : [startDate.getDay()];
    const weekCursor = new Date(startDate);
    // Move cursor back to the Sunday of the starting week for alignment
    weekCursor.setDate(weekCursor.getDate() - weekCursor.getDay());
    while (weekCursor <= effectiveEnd && iterations < maxIterations) {
      for (const dow of weekDayNums) {
        const occ = new Date(weekCursor);
        occ.setDate(occ.getDate() + dow);
        if (occ < startDate) continue;
        pushOccurrence(occ);
        if (count !== null && emitted >= count) break;
      }
      weekCursor.setDate(weekCursor.getDate() + 7 * interval);
      iterations++;
      if (count !== null && emitted >= count) break;
    }
  } else if (freq === 'MONTHLY') {
    const cursor = new Date(startDate);
    while (cursor <= effectiveEnd && iterations < maxIterations) {
      pushOccurrence(new Date(cursor));
      cursor.setMonth(cursor.getMonth() + interval);
      iterations++;
      if (count !== null && emitted >= count) break;
    }
  } else if (freq === 'YEARLY') {
    const cursor = new Date(startDate);
    while (cursor <= effectiveEnd && iterations < maxIterations) {
      pushOccurrence(new Date(cursor));
      cursor.setFullYear(cursor.getFullYear() + interval);
      iterations++;
      if (count !== null && emitted >= count) break;
    }
  } else {
    // Unknown freq — just emit the base if it's in window
    if (startDate >= windowStart && startDate <= windowEnd) {
      out.push(base);
    }
  }

  return out;
}

function toIsoLike(d: Date, allDay: boolean): string {
  if (allDay) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  return d.toISOString();
}

function unescapeIcsText(s: string): string {
  return s
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcsDate(keyPart: string, value: string): { iso: string; allDay: boolean } {
  const isAllDay = /VALUE=DATE(?!-TIME)/.test(keyPart);
  if (isAllDay) {
    // YYYYMMDD
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}`, allDay: true };
  }
  // YYYYMMDDTHHMMSS(Z)
  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  const hh = value.slice(9, 11);
  const mm = value.slice(11, 13);
  const ss = value.slice(13, 15) || '00';
  const z = value.endsWith('Z') ? 'Z' : '';
  return { iso: `${y}-${m}-${d}T${hh}:${mm}:${ss}${z}`, allDay: false };
}

export async function POST(req: NextRequest) {
  try {
    const { icsUrl, start, end } = await req.json();
    if (!icsUrl || typeof icsUrl !== 'string') {
      return NextResponse.json({ error: 'Missing icsUrl' }, { status: 400 });
    }
    // Only allow Google calendar hosts for safety
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(icsUrl);
    } catch {
      return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
    }
    if (!/\.google\.com$/.test(parsedUrl.hostname) && parsedUrl.hostname !== 'calendar.google.com') {
      return NextResponse.json({ error: 'Only Google Calendar URLs are supported' }, { status: 400 });
    }

    const res = await fetch(icsUrl, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch calendar (${res.status})` },
        { status: 502 }
      );
    }
    const text = await res.text();
    // Default to a wide window if caller didn't pass one
    const windowStart = start ? new Date(start) : new Date(Date.now() - 90 * 24 * 3600 * 1000);
    const windowEnd = end ? new Date(end) : new Date(Date.now() + 365 * 24 * 3600 * 1000);
    const allEvents = parseIcs(text, windowStart, windowEnd);

    // Tight final filter to the requested window (one-off events bypass RRULE expansion filtering)
    const events = allEvents.filter((e) => {
      const evMs = new Date(e.start).getTime();
      return evMs >= windowStart.getTime() && evMs < windowEnd.getTime();
    });

    return NextResponse.json({ events, total: allEvents.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
