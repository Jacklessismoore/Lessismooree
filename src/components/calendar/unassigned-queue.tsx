'use client';

import { useState } from 'react';
import { CalendarItem, Brand, EmailStatus } from '@/lib/types';
import { deleteCalendarItem, updateCalendarItemStatus } from '@/lib/db';
import { EMAIL_STATUSES, getStatusColor } from '@/lib/constants';
import { ConfirmDialog } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';

interface QueueProps {
  items: CalendarItem[];
  brands: Brand[];
  onItemDeleted: () => void;
}

function formatSuggestedDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const month = d.toLocaleString('en', { month: 'short' });
  return `${day} ${month}`;
}

export function UnassignedQueue({ items, brands, onItemDeleted }: QueueProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [localStatuses, setLocalStatuses] = useState<Record<string, EmailStatus>>({});
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const getBrand = (brandId: string) => brands.find(b => b.id === brandId);

  const handleStatusChange = async (itemId: string, newStatus: EmailStatus) => {
    try {
      await updateCalendarItemStatus(itemId, newStatus);
      setLocalStatuses(prev => ({ ...prev, [itemId]: newStatus }));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (itemId: string) => {
    try {
      await deleteCalendarItem(itemId);
      toast.success('Item removed');
      onItemDeleted();
      setDeleteConfirmId(null);
    } catch {
      toast.error('Failed to remove item');
    }
  };

  if (items.length === 0) return null;

  return (
    <div className="glass-card rounded-xl mb-6 overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-base">📋</span>
          <span className="text-[11px] text-white font-semibold uppercase tracking-wider">
            Unassigned Items
          </span>
          <span className="text-[10px] bg-white/10 text-white px-2 py-0.5 rounded-full font-medium">
            {items.length}
          </span>
        </div>
        <svg
          width="12"
          height="7"
          viewBox="0 0 12 7"
          fill="none"
          className={cn('text-[#555] transition-transform', collapsed && '-rotate-90')}
        >
          <path d="M1 1L6 6L11 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Items list */}
      {!collapsed && (
        <div className="border-t border-white/[0.04] max-h-[240px] overflow-y-auto">
          <div className="divide-y divide-white/[0.03]">
            {items.map(item => {
              const brand = getBrand(item.brand_id);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-5 py-2.5 hover:bg-white/[0.02] transition-colors group"
                >
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-white font-medium truncate">{item.name}</span>
                      <span className="text-[9px] text-[#555] bg-white/[0.04] px-1.5 py-0.5 rounded uppercase tracking-wider flex-shrink-0">
                        {({ 'designed': 'Campaign', 'plain-text': 'Plain Text', 'sms': 'SMS' } as Record<string, string>)[item.type] || item.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[#555]">{brand?.name}</span>
                      {item.suggested_date && (
                        <>
                          <span className="text-[#333]">·</span>
                          <span className="text-[10px] text-[#555]">
                            suggested: {formatSuggestedDate(item.suggested_date)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  {(() => {
                    const status = localStatuses[item.id] || item.status || 'not_started';
                    const statusColor = getStatusColor(status);
                    return (
                      <select
                        value={status}
                        onChange={e => handleStatusChange(item.id, e.target.value as EmailStatus)}
                        className="text-[9px] font-medium rounded-md px-2 py-1 appearance-none cursor-pointer border-0 focus:outline-none flex-shrink-0"
                        style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
                      >
                        {EMAIL_STATUSES.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    );
                  })()}

                  {/* Hint */}
                  <span className="text-[9px] text-[#333] italic opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    Click cell to assign
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
