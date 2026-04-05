'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { getBriefHistory, updateBriefHistoryStatus } from '@/lib/db';
import { BriefHistory, Brand, Designer } from '@/lib/types';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EMAIL_STATUSES } from '@/lib/constants';
import toast from 'react-hot-toast';

const QUEUE_STATUSES = ['not_started', 'awaiting_design', 'needs_upload', 'needs_revision'];
const DESIGN_LEAD_DAYS = 7; // Design due 7 days before send
const QUEUE_WINDOW_DAYS = 14; // Only show if design due within 14 days

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getDesignPriority(brief: BriefHistory): 'last_minute' | 'calendar' {
  const formData = brief.form_data as Record<string, string>;
  return (formData?.designPriority as 'last_minute' | 'calendar') || 'calendar';
}

function getDesignDueInfo(sendDateStr: string | null, priority?: 'last_minute' | 'calendar'): { dueDate: Date | null; daysRemaining: number | null; urgency: 'overdue' | 'today' | 'urgent' | 'normal' | 'no-date' | 'asap'; label: string; color: string } {
  // Last minute requests are always ASAP, regardless of send date
  if (priority === 'last_minute') {
    return { dueDate: null, daysRemaining: 0, urgency: 'asap', label: 'ASAP', color: '#EF4444' };
  }

  if (!sendDateStr) {
    return { dueDate: null, daysRemaining: null, urgency: 'no-date', label: 'No send date', color: '#555' };
  }

  const sendDate = new Date(sendDateStr);
  const dueDate = new Date(sendDate);
  dueDate.setDate(dueDate.getDate() - DESIGN_LEAD_DAYS);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffMs = dueDate.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return { dueDate, daysRemaining, urgency: 'overdue', label: `${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''} overdue`, color: '#EF4444' };
  }
  if (daysRemaining === 0) {
    return { dueDate, daysRemaining, urgency: 'today', label: 'Due today', color: '#EF4444' };
  }
  if (daysRemaining <= 3) {
    return { dueDate, daysRemaining, urgency: 'urgent', label: `Due in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`, color: '#F59E0B' };
  }
  return { dueDate, daysRemaining, urgency: 'normal', label: `Due in ${daysRemaining} days`, color: '#10B981' };
}

function isWithinQueueWindow(sendDateStr: string | null): boolean {
  if (!sendDateStr) return true; // No date = always show (can't prioritise without a date)

  const sendDate = new Date(sendDateStr);
  const dueDate = new Date(sendDate);
  dueDate.setDate(dueDate.getDate() - DESIGN_LEAD_DAYS);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  dueDate.setHours(0, 0, 0, 0);

  const diffMs = dueDate.getTime() - today.getTime();
  const daysUntilDue = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Show if overdue or due within 14 days
  return daysUntilDue <= QUEUE_WINDOW_DAYS;
}

function getBriefTitle(brief: BriefHistory): string {
  const formData = brief.form_data as Record<string, string>;
  return formData?.title || formData?.name || brief.type || 'Untitled';
}

function getBriefSendDate(brief: BriefHistory): string | null {
  const formData = brief.form_data as Record<string, string>;
  return formData?.sendDate || null;
}

type View = 'designers' | 'briefs';
type Tab = 'campaigns' | 'flows';

interface DesignerInfo {
  id: string;
  name: string;
  campaignCount: number;
  flowCount: number;
  totalCount: number;
  dueTodayCount: number;
  overdueCount: number;
}

function BriefCard({ brief, brand, onStatusChange }: {
  brief: BriefHistory;
  brand: Brand;
  onStatusChange: (id: string, status: string) => void;
}) {
  const title = getBriefTitle(brief);
  const sendDate = getBriefSendDate(brief);
  const status = brief.status || 'not_started';
  const statusConfig = EMAIL_STATUSES.find(s => s.value === status);
  const priority = getDesignPriority(brief);
  const dueInfo = getDesignDueInfo(sendDate, priority);

  return (
    <Card padding="sm" className="border-l-2" style={{ borderLeftColor: dueInfo.color }}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="text-[11px] font-medium text-white truncate">{title}</span>
            <span className="text-[9px] text-[#555] bg-white/[0.03] px-1.5 py-0.5 rounded uppercase tracking-wider">
              {brief.type?.replace(/_/g, ' ')}
            </span>
            {/* Due date badge */}
            <span
              className="text-[9px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider"
              style={{ color: dueInfo.color, backgroundColor: `${dueInfo.color}15` }}
            >
              {dueInfo.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-[#555]">
            <span>{brand.name}</span>
            {sendDate && (
              <>
                <span>·</span>
                <span>Send: {formatDate(sendDate)}</span>
              </>
            )}
            {dueInfo.dueDate && (
              <>
                <span>·</span>
                <span>Design due: {formatDate(dueInfo.dueDate.toISOString())}</span>
              </>
            )}
          </div>
        </div>

        <select
          value={status}
          onChange={e => onStatusChange(brief.id, e.target.value)}
          className="bg-black/50 border border-white/[0.08] rounded-lg px-2 py-1.5 text-[10px] text-white uppercase tracking-wider focus:outline-none focus:border-white/20 appearance-none cursor-pointer"
          style={{ color: statusConfig?.color }}
        >
          {EMAIL_STATUSES.map(opt => (
            <option key={opt.value} value={opt.value} style={{ color: opt.color }}>
              {opt.label}
            </option>
          ))}
        </select>

        <Link href={`/briefs/${brief.id}`}>
          <Button variant="ghost" size="sm" className="text-[9px] min-h-0 px-2 py-1">
            View
          </Button>
        </Link>
      </div>
    </Card>
  );
}

export default function DesignerPriorityPage() {
  const { selectedPod, designers, podBrands } = useApp();
  const [allBriefs, setAllBriefs] = useState<BriefHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('designers');
  const [selectedDesigner, setSelectedDesigner] = useState<DesignerInfo | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('campaigns');

  const loadBriefs = useCallback(async () => {
    try {
      const briefs = await getBriefHistory();
      setAllBriefs(briefs);
    } catch (e) {
      console.error('Failed to load briefs:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBriefs();
  }, [loadBriefs]);

  const handleStatusChange = async (briefId: string, newStatus: string) => {
    try {
      await updateBriefHistoryStatus(briefId, newStatus);
      await loadBriefs();
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  // Filter briefs: in queue statuses, current pod, and within 2-week window
  const podBrandIds = new Set(podBrands.map(b => b.id));
  const queueBriefs = allBriefs.filter(brief => {
    if (!podBrandIds.has(brief.brand_id)) return false;
    const status = brief.status || 'not_started';
    if (!QUEUE_STATUSES.includes(status)) return false;
    // Last minute requests always show regardless of date
    const priority = getDesignPriority(brief);
    if (priority === 'last_minute') return true;
    const sendDate = getBriefSendDate(brief);
    return isWithinQueueWindow(sendDate);
  });

  // Build designer info cards
  const designerCards: DesignerInfo[] = (() => {
    const map = new Map<string, DesignerInfo>();

    // Include all designers even if they have 0 briefs
    for (const d of designers) {
      map.set(d.id, { id: d.id, name: d.name, campaignCount: 0, flowCount: 0, totalCount: 0, dueTodayCount: 0, overdueCount: 0 });
    }
    // Add unassigned
    map.set('unassigned', { id: 'unassigned', name: 'Unassigned', campaignCount: 0, flowCount: 0, totalCount: 0, dueTodayCount: 0, overdueCount: 0 });

    for (const brief of queueBriefs) {
      const brand = podBrands.find(b => b.id === brief.brand_id);
      if (!brand) continue;
      const designerId = brand.designer_id || 'unassigned';
      if (!map.has(designerId)) {
        map.set(designerId, { id: designerId, name: 'Unknown', campaignCount: 0, flowCount: 0, totalCount: 0, dueTodayCount: 0, overdueCount: 0 });
      }
      const info = map.get(designerId)!;
      info.totalCount++;
      const isFlow = brief.type?.includes('flow');
      if (isFlow) info.flowCount++;
      else info.campaignCount++;

      // Check if due today, overdue, or ASAP
      const sendDate = getBriefSendDate(brief);
      const priority = getDesignPriority(brief);
      const dueInfo = getDesignDueInfo(sendDate, priority);
      if (dueInfo.urgency === 'asap') { info.dueTodayCount++; } // ASAP counts as due today
      if (dueInfo.urgency === 'today') info.dueTodayCount++;
      if (dueInfo.urgency === 'overdue') { info.overdueCount++; info.dueTodayCount++; }
    }

    return Array.from(map.values())
      .filter(d => d.totalCount > 0 || d.id !== 'unassigned')
      .sort((a, b) => {
        if (a.id === 'unassigned') return 1;
        if (b.id === 'unassigned') return -1;
        return b.totalCount - a.totalCount;
      });
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-[#555] heading text-sm">Loading...</div>
      </div>
    );
  }

  // ─── Designer Selection View ───
  if (view === 'designers') {
    const totalInQueue = queueBriefs.length;
    const designersWithDueToday = designerCards.filter(d => d.dueTodayCount > 0);

    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader
          title="DESIGNER PRIORITY"
          subtitle={`${totalInQueue} brief${totalInQueue !== 1 ? 's' : ''} awaiting design`}
        />

        {/* Dynamic summary banner */}
        {designersWithDueToday.length > 0 && (
          <div className="glass-card rounded-xl mb-6 overflow-hidden animate-fade-in">
            {designersWithDueToday.map((d, i) => (
              <button
                key={d.id}
                onClick={() => { setSelectedDesigner(d); setView('briefs'); setActiveTab('campaigns'); }}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left ${
                  i > 0 ? 'border-t border-white/[0.04]' : ''
                }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${d.overdueCount > 0 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                <span className="text-[11px] text-[#999] flex-1">
                  <span className="text-white font-semibold">{d.name}</span>
                  {' '}&mdash;{' '}
                  {d.overdueCount > 0 ? (
                    <span className="text-red-400 font-medium">
                      {d.overdueCount} overdue
                      {d.dueTodayCount - d.overdueCount > 0 ? `, ${d.dueTodayCount - d.overdueCount} due today` : ''}
                    </span>
                  ) : (
                    <span className="text-amber-400 font-medium">{d.dueTodayCount} email{d.dueTodayCount !== 1 ? 's' : ''} due today</span>
                  )}
                </span>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[#333] flex-shrink-0">
                  <path d="M5 1L11 7L5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {designerCards.map((d, i) => (
            <Card
              key={d.id}
              hoverable
              padding="md"
              onClick={() => { setSelectedDesigner(d); setView('briefs'); setActiveTab('campaigns'); }}
              className="animate-fade-in"
              style={{ animationDelay: `${i * 40}ms` } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-semibold text-white">
                    {d.name.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-white uppercase tracking-wider">{d.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {d.campaignCount > 0 && (
                      <span className="text-[9px] text-[#999]">{d.campaignCount} campaign{d.campaignCount !== 1 ? 's' : ''}</span>
                    )}
                    {d.flowCount > 0 && (
                      <span className="text-[9px] text-[#999]">{d.flowCount} flow{d.flowCount !== 1 ? 's' : ''}</span>
                    )}
                    {d.totalCount === 0 && (
                      <span className="text-[9px] text-[#444]">No briefs in queue</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  {d.dueTodayCount > 0 ? (
                    <span className={`text-[10px] font-semibold ${d.overdueCount > 0 ? 'text-red-400' : 'text-amber-400'}`}>
                      {d.dueTodayCount} due today
                    </span>
                  ) : d.totalCount > 0 ? (
                    <span className="text-[10px] text-[#555]">{d.totalCount} in queue</span>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {designerCards.length === 0 && (
          <div className="text-center py-16">
            <p className="text-[#555] text-sm">No designers added yet. Add designers in Pods & Team.</p>
          </div>
        )}

      </div>
    );
  }

  // ─── Briefs View (Campaign / Flow tabs) ───
  const designerBriefs = queueBriefs.filter(brief => {
    const brand = podBrands.find(b => b.id === brief.brand_id);
    if (!brand) return false;
    const designerId = brand.designer_id || 'unassigned';
    return designerId === selectedDesigner?.id;
  });

  // Sort by urgency (most urgent first — ASAP always on top)
  const sortByUrgency = (a: BriefHistory, b: BriefHistory) => {
    const aPriority = getDesignPriority(a);
    const bPriority = getDesignPriority(b);
    // ASAP items always first
    if (aPriority === 'last_minute' && bPriority !== 'last_minute') return -1;
    if (bPriority === 'last_minute' && aPriority !== 'last_minute') return 1;

    const aDue = getDesignDueInfo(getBriefSendDate(a), aPriority).daysRemaining;
    const bDue = getDesignDueInfo(getBriefSendDate(b), bPriority).daysRemaining;
    // null dates go to the end
    if (aDue === null && bDue === null) return 0;
    if (aDue === null) return 1;
    if (bDue === null) return -1;
    return aDue - bDue;
  };

  const campaignBriefs = designerBriefs.filter(b => !b.type?.includes('flow')).sort(sortByUrgency);
  const flowBriefs = designerBriefs.filter(b => b.type?.includes('flow')).sort(sortByUrgency);
  const activeBriefs = activeTab === 'campaigns' ? campaignBriefs : flowBriefs;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title={selectedDesigner?.name?.toUpperCase() || 'DESIGNER'}
        subtitle={`${designerBriefs.length} brief${designerBriefs.length !== 1 ? 's' : ''} in queue`}
        actions={
          <Button variant="secondary" size="sm" onClick={() => { setView('designers'); setSelectedDesigner(null); }}>
            ← Back
          </Button>
        }
      />

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-2 rounded-lg text-[10px] uppercase tracking-wider font-medium transition-all duration-200 ${
            activeTab === 'campaigns'
              ? 'bg-white text-black'
              : 'bg-white/[0.03] border border-white/[0.06] text-[#666] hover:text-white hover:border-white/15'
          }`}
        >
          Campaigns
          <span className="ml-1.5 opacity-60">{campaignBriefs.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('flows')}
          className={`px-4 py-2 rounded-lg text-[10px] uppercase tracking-wider font-medium transition-all duration-200 ${
            activeTab === 'flows'
              ? 'bg-white text-black'
              : 'bg-white/[0.03] border border-white/[0.06] text-[#666] hover:text-white hover:border-white/15'
          }`}
        >
          Flows
          <span className="ml-1.5 opacity-60">{flowBriefs.length}</span>
        </button>
      </div>

      {/* Brief list */}
      {activeBriefs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-[#555] text-sm">
            No {activeTab === 'campaigns' ? 'campaign' : 'flow'} briefs in queue for {selectedDesigner?.name}.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {activeBriefs.map(brief => {
            const brand = podBrands.find(b => b.id === brief.brand_id);
            if (!brand) return null;
            return (
              <BriefCard
                key={brief.id}
                brief={brief}
                brand={brand}
                onStatusChange={handleStatusChange}
              />
            );
          })}
        </div>
      )}

    </div>
  );
}
