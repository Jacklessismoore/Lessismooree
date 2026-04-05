'use client';

import { useState } from 'react';
import { CalendarItem, Brand, EmailStatus } from '@/lib/types';
import { DAYS_OF_WEEK, EMAIL_STATUSES, getStatusColor } from '@/lib/constants';
import { updateCalendarItemStatus } from '@/lib/db';
import { StatusBadge } from '@/components/ui/status-badge';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface CalendarGridProps {
  items: CalendarItem[];
  brands: Brand[];
  month: number;
  year: number;
}

export function CalendarGrid({ items, brands, month, year }: CalendarGridProps) {
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [itemStatuses, setItemStatuses] = useState<Record<string, EmailStatus>>({});

  const firstDay = new Date(year, month, 1);
  const offset = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  // Group items by date
  const itemsByDate: Record<string, CalendarItem[]> = {};
  items.forEach(item => {
    const dateKey = item.date.split('T')[0]; // Handle ISO dates
    if (!itemsByDate[dateKey]) itemsByDate[dateKey] = [];
    itemsByDate[dateKey].push(item);
  });

  const handleStatusChange = async (itemId: string, newStatus: EmailStatus) => {
    try {
      await updateCalendarItemStatus(itemId, newStatus);
      setItemStatuses(prev => ({ ...prev, [itemId]: newStatus }));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const getBrand = (brandId: string) => brands.find(b => b.id === brandId);

  return (
    <div>
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-[#1A1A1A]">
        {DAYS_OF_WEEK.map(day => (
          <div key={day} className="px-2 py-2 text-center">
            <span className="label-text">{day}</span>
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {/* Empty offset cells */}
        {Array.from({ length: offset }).map((_, i) => (
          <div key={`empty-${i}`} className="min-h-[110px] border-b border-r border-[#1A1A1A] bg-black/30" />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const dayItems = itemsByDate[dateKey] || [];
          const isToday = isCurrentMonth && today.getDate() === day;

          return (
            <div
              key={day}
              className={cn(
                'min-h-[110px] border-b border-r border-[#1A1A1A] p-1.5',
                isToday && 'bg-white/5'
              )}
            >
              <span className={cn(
                'text-xs font-medium inline-block w-6 h-6 flex items-center justify-center rounded-full mb-1',
                isToday ? 'bg-white text-black' : 'text-[#555]'
              )}>
                {day}
              </span>

              <div className="space-y-1">
                {dayItems.map(item => {
                  const brand = getBrand(item.brand_id);
                  const currentStatus = itemStatuses[item.id] || item.status;
                  const isExpanded = expandedItem === item.id;

                  return (
                    <div key={item.id}>
                      <button
                        onClick={() => setExpandedItem(isExpanded ? null : item.id)}
                        className="w-full text-left rounded px-1.5 py-1 text-[10px] hover:bg-white/5 transition-colors"
                        style={{ borderLeft: `3px solid ${brand?.color || '#555'}` }}
                      >
                        <div className="flex items-center gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: getStatusColor(currentStatus) }}
                          />
                          <span className="text-white truncate font-medium">{item.name}</span>
                        </div>
                        <div className="text-[#555] truncate ml-2.5">
                          {brand?.name} • {item.manager_name}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="mt-1 ml-1 p-2 bg-[#0E0E0E] rounded border border-[#252525]">
                          <p className="text-[10px] text-white font-medium mb-1">{item.name}</p>
                          <p className="text-[10px] text-[#555] mb-2">{item.type} • {item.manager_name}</p>
                          <StatusBadge status={currentStatus} size="sm" />
                          <select
                            value={currentStatus}
                            onChange={e => handleStatusChange(item.id, e.target.value as EmailStatus)}
                            className="mt-2 w-full bg-black border border-[#252525] rounded px-2 py-1 text-[10px] text-white focus:outline-none"
                          >
                            {EMAIL_STATUSES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Status Legend */}
      <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t border-[#1A1A1A]">
        {EMAIL_STATUSES.map(s => (
          <div key={s.value} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[10px] text-[#555]">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
