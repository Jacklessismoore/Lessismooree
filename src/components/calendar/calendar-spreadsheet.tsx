'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { CalendarItem, Brand, Manager, EmailStatus } from '@/lib/types';
import { EMAIL_STATUSES, getStatusColor } from '@/lib/constants';
import { updateCalendarItemStatus, assignCalendarItemDate, unassignCalendarItem } from '@/lib/db';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface SpreadsheetProps {
  items: CalendarItem[];
  unassignedItems: CalendarItem[];
  brands: Brand[];
  weekStart: Date;
  onItemAssigned: () => void;
  onItemUnassigned: () => void;
}

interface ManagerGroup {
  manager: Manager | null;
  managerName: string;
  brands: Brand[];
}

const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
const DAYS_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekDates(weekStart: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── Status Legend with info bubble on mobile ───
function StatusLegend() {
  const [showLegend, setShowLegend] = useState(false);

  return (
    <>
      {/* Desktop — inline legend */}
      <div className="hidden sm:flex flex-wrap gap-4 px-4 py-3 border-t border-white/[0.04] bg-white/[0.01]">
        {EMAIL_STATUSES.map(s => (
          <div key={s.value} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[9px] text-[#555]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Mobile — info bubble */}
      <div className="sm:hidden px-4 py-2 border-t border-white/[0.04] bg-white/[0.01]">
        <button
          onClick={() => setShowLegend(!showLegend)}
          className="flex items-center gap-1.5 text-[9px] text-[#555] hover:text-white transition-colors"
        >
          <div className="w-4 h-4 rounded-full border border-white/10 flex items-center justify-center">
            <span className="text-[7px] font-bold">?</span>
          </div>
          Status colours
          <svg className={cn('w-2 h-2 transition-transform', showLegend ? 'rotate-180' : '')} viewBox="0 0 8 5" fill="none">
            <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        </button>
        {showLegend && (
          <div className="grid grid-cols-2 gap-2 mt-2 pb-1">
            {EMAIL_STATUSES.map(s => (
              <div key={s.value} className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-[9px] text-[#555]">{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function StatusDropdown({
  itemId,
  currentStatus,
  onStatusChange,
  onUnassign,
}: {
  itemId: string;
  currentStatus: EmailStatus;
  onStatusChange: (id: string, status: EmailStatus) => void;
  onUnassign: (id: string) => void;
}) {
  const statusInfo = EMAIL_STATUSES.find(s => s.value === currentStatus);
  const color = statusInfo?.color || '#6B7280';

  return (
    <div className="group relative w-full">
      <select
        value={currentStatus}
        onChange={e => onStatusChange(itemId, e.target.value as EmailStatus)}
        className="w-full text-[10px] font-medium rounded-md px-2 py-1.5 appearance-none cursor-pointer border-0 focus:outline-none focus:ring-1 focus:ring-white/20 transition-all"
        style={{
          backgroundColor: `${color}25`,
          color: color,
        }}
      >
        {EMAIL_STATUSES.map(s => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      {/* Dropdown arrow */}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M1 1L4 4L7 1" stroke={color} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      {/* Unassign button on hover */}
      <button
        onClick={e => { e.stopPropagation(); onUnassign(itemId); }}
        className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
        title="Remove from calendar"
      >
        ×
      </button>
    </div>
  );
}

function EmptyCellPicker({
  brandId,
  dateStr,
  unassignedItems,
  onAssign,
  onClose,
  triggerRef,
}: {
  brandId: string;
  dateStr: string;
  unassignedItems: CalendarItem[];
  onAssign: (itemId: string, date: string) => void;
  onClose: () => void;
  triggerRef: HTMLElement | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const brandItems = unassignedItems.filter(i => i.brand_id === brandId);
  const [pos, setPos] = useState({ top: 0, left: 0, goAbove: false });

  const updatePos = useCallback(() => {
    if (!triggerRef) return;
    const rect = triggerRef.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const goAbove = spaceBelow < 200;
    setPos({ top: goAbove ? rect.top : rect.bottom + 4, left: rect.left, goAbove });
  }, [triggerRef]);

  useEffect(() => { updatePos(); }, [updatePos]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] w-56 rounded-lg p-2 shadow-2xl border border-white/10 animate-fade"
      style={{
        background: '#1a1a1a',
        top: pos.goAbove ? undefined : pos.top,
        bottom: pos.goAbove ? window.innerHeight - pos.top + 4 : undefined,
        left: Math.min(pos.left, window.innerWidth - 240),
      }}
    >
      {brandItems.length === 0 ? (
        <p className="text-[10px] text-[#555] px-2 py-2">No items to assign</p>
      ) : (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          <p className="text-[9px] text-[#555] uppercase tracking-wider px-2 pt-1 pb-1.5 font-medium">Assign an item</p>
          {brandItems.map(item => (
            <button
              key={item.id}
              onClick={() => onAssign(item.id, dateStr)}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-white/5 transition-colors group"
            >
              <p className="text-[10px] text-white font-medium truncate">{item.name}</p>
              <p className="text-[9px] text-[#555]">
                {({ 'designed': 'Campaign', 'plain-text': 'Plain Text', 'sms': 'SMS' } as Record<string, string>)[item.type] || item.type} {item.suggested_date ? `· suggested: ${formatDateShort(item.suggested_date)}` : ''}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body
  );
}

export function CalendarSpreadsheet({
  items,
  unassignedItems,
  brands,
  weekStart,
  onItemAssigned,
  onItemUnassigned,
}: SpreadsheetProps) {
  const [localStatuses, setLocalStatuses] = useState<Record<string, EmailStatus>>({});
  const [activePicker, setActivePicker] = useState<{ brandId: string; dateStr: string } | null>(null);

  const weekDates = getWeekDates(weekStart);
  const todayStr = new Date().toISOString().split('T')[0];

  // Group brands by manager
  const managerGroups: ManagerGroup[] = [];
  const managerMap = new Map<string, ManagerGroup>();

  brands.forEach(brand => {
    const mgrName = brand.manager?.name || 'Unassigned';
    const mgrId = brand.manager_id || 'unassigned';
    if (!managerMap.has(mgrId)) {
      const group: ManagerGroup = { manager: brand.manager || null, managerName: mgrName, brands: [] };
      managerMap.set(mgrId, group);
      managerGroups.push(group);
    }
    managerMap.get(mgrId)!.brands.push(brand);
  });

  // Index items by brandId+date
  const itemIndex: Record<string, CalendarItem> = {};
  items.forEach(item => {
    if (item.date) {
      const key = `${item.brand_id}:${item.date.split('T')[0]}`;
      itemIndex[key] = item;
    }
  });

  const handleStatusChange = async (itemId: string, newStatus: EmailStatus) => {
    try {
      await updateCalendarItemStatus(itemId, newStatus);
      setLocalStatuses(prev => ({ ...prev, [itemId]: newStatus }));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleUnassign = async (itemId: string) => {
    try {
      await unassignCalendarItem(itemId);
      toast.success('Moved back to queue');
      onItemUnassigned();
    } catch {
      toast.error('Failed to unassign');
    }
  };

  const handleAssign = async (itemId: string, dateStr: string) => {
    try {
      await assignCalendarItemDate(itemId, dateStr);
      setActivePicker(null);
      toast.success('Item assigned');
      onItemAssigned();
    } catch {
      toast.error('Failed to assign');
    }
  };

  return (
    <div className="glass-card rounded-xl overflow-x-auto">
      {/* Header row — dates */}
      <div className="grid" style={{ gridTemplateColumns: '160px repeat(7, minmax(120px, 1fr))' }}>
        <div className="px-4 py-3 border-b border-r border-white/[0.04] bg-white/[0.02]">
          <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold">Accounts</p>
        </div>
        {weekDates.map((dateStr, i) => {
          const isToday = dateStr === todayStr;
          return (
            <div
              key={dateStr}
              className={cn(
                'px-2 py-3 border-b border-r border-white/[0.04] text-center',
                isToday ? 'bg-white/[0.04]' : 'bg-white/[0.01]'
              )}
            >
              <p className={cn('text-[11px] font-medium', isToday ? 'text-white' : 'text-[#888]')}>
                {formatDateShort(dateStr)}
              </p>
              <p className={cn('text-[9px] uppercase tracking-wider', isToday ? 'text-white/60' : 'text-[#444]')}>
                {DAYS[i]}
              </p>
            </div>
          );
        })}
      </div>

      {/* Manager groups → Brand rows */}
      {managerGroups.map(group => (
        <div key={group.managerName}>
          {/* Manager header row */}
          <div
            className="grid"
            style={{ gridTemplateColumns: '160px repeat(7, minmax(120px, 1fr))' }}
          >
            <div className="px-4 py-2 border-b border-r border-white/[0.04] bg-white/[0.03]">
              <p className="text-[10px] font-bold text-white uppercase tracking-wider">
                {group.managerName}
              </p>
            </div>
            {weekDates.map(dateStr => (
              <div key={dateStr} className="border-b border-r border-white/[0.04] bg-white/[0.02]" />
            ))}
          </div>

          {/* Brand rows */}
          {group.brands.map(brand => (
            <div
              key={brand.id}
              className="grid hover:bg-white/[0.01] transition-colors"
              style={{ gridTemplateColumns: '160px repeat(7, minmax(120px, 1fr))' }}
            >
              {/* Brand name cell */}
              <div className="px-4 py-2.5 border-b border-r border-white/[0.04] flex items-center">
                <span className="text-[11px] text-white font-medium truncate">{brand.name}</span>
              </div>

              {/* Day cells */}
              {weekDates.map(dateStr => {
                const key = `${brand.id}:${dateStr}`;
                const item = itemIndex[key];
                const isToday = dateStr === todayStr;
                const isPickerOpen = activePicker?.brandId === brand.id && activePicker?.dateStr === dateStr;

                return (
                  <div
                    key={dateStr}
                    className={cn(
                      'border-b border-r border-white/[0.04] px-1.5 py-1.5 relative min-h-[40px] flex items-center',
                      isToday && 'bg-white/[0.02]'
                    )}
                  >
                    {item ? (
                      <StatusDropdown
                        itemId={item.id}
                        currentStatus={localStatuses[item.id] || item.status}
                        onStatusChange={handleStatusChange}
                        onUnassign={handleUnassign}
                      />
                    ) : (
                      <>
                        <button
                          onClick={(e) => {
                            setActivePicker(isPickerOpen ? null : { brandId: brand.id, dateStr });
                            // Store the button element for portal positioning
                            if (!isPickerOpen) {
                              (e.currentTarget as HTMLElement).dataset.pickertrigger = 'true';
                            }
                          }}
                          data-picker-cell={`${brand.id}:${dateStr}`}
                          className="w-full h-full flex items-center justify-center opacity-20 hover:opacity-60 transition-opacity rounded hover:bg-white/[0.03]"
                        >
                          <span className="text-[#555] text-xs">+</span>
                        </button>
                        {isPickerOpen && (
                          <EmptyCellPicker
                            brandId={brand.id}
                            dateStr={dateStr}
                            unassignedItems={unassignedItems}
                            onAssign={handleAssign}
                            onClose={() => setActivePicker(null)}
                            triggerRef={document.querySelector(`[data-picker-cell="${brand.id}:${dateStr}"]`) as HTMLElement}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ))}

      {/* Empty state */}
      {brands.length === 0 && (
        <div className="px-8 py-12 text-center">
          <p className="text-[#444] text-sm">No clients in this pod yet.</p>
        </div>
      )}

    </div>
  );
}
