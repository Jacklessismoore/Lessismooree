'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { Brand, BriefHistory, Strategy, EmailStatus } from '@/lib/types';
import {
  getBriefAndStrategyCounts,
  getBriefHistory,
  getStrategiesForBrand,
  updateCalendarItemStatus,
  updateBriefHistoryStatus,
  deleteBriefHistory,
} from '@/lib/db';
import { BRIEF_TYPES, EMAIL_STATUSES } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { BrandCard } from '@/components/ui/brand-card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { formatDate, copyToClipboard } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/modal';
import { BriefTable } from '@/components/brief-table';
import toast from 'react-hot-toast';

// ─── Folder View (grouped by account manager) ───
function FolderView({
  brands,
  counts,
  onSelectBrand,
}: {
  brands: Brand[];
  counts: Record<string, { briefs: number; strategies: number }>;
  onSelectBrand: (brand: Brand) => void;
}) {
  if (brands.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="w-14 h-14 rounded-full border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
          <span className="text-[#555] text-xl">📁</span>
        </div>
        <p className="text-[#444] text-sm">No clients in this pod yet.</p>
        <Link href="/clients/new">
          <Button variant="secondary" className="mt-4">Add Client</Button>
        </Link>
      </div>
    );
  }

  // Group brands by manager
  const groups: { managerName: string; brands: Brand[] }[] = [];
  const map = new Map<string, { managerName: string; brands: Brand[] }>();

  for (const brand of brands) {
    const mgrId = brand.manager_id || 'unassigned';
    const mgrName = brand.manager?.name || 'Unassigned';
    if (!map.has(mgrId)) {
      const group = { managerName: mgrName, brands: [] as Brand[] };
      map.set(mgrId, group);
      groups.push(group);
    }
    map.get(mgrId)!.brands.push(brand);
  }

  let animIndex = 0;

  return (
    <div className="space-y-8">
      {groups.map(group => (
        <div key={group.managerName}>
          {/* Manager header */}
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[11px] font-bold text-white uppercase tracking-[0.15em]">
              {group.managerName}
            </h3>
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[9px] text-[#444]">
              {group.brands.length} client{group.brands.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Client cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {group.brands.map(brand => {
              const idx = animIndex++;
              const c = counts[brand.id] || { briefs: 0, strategies: 0 };
              return (
                <BrandCard
                  key={brand.id}
                  brand={brand}
                  onClick={() => onSelectBrand(brand)}
                  showEdit={false}
                  showMenu={false}
                  animDelay={idx * 30}
                  subtitle={`${c.briefs} brief${c.briefs !== 1 ? 's' : ''} · ${c.strategies} strateg${c.strategies !== 1 ? 'ies' : 'y'}`}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Client Detail View (with month folders) ───

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getMonthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_NAMES[parseInt(month) - 1]} ${year}`;
}

interface MonthData {
  key: string;
  label: string;
  briefs: BriefHistory[];
  strategy: Strategy | null;
}

function ClientDetailView({
  brand,
  onBack,
}: {
  brand: Brand;
  onBack: () => void;
}) {
  const router = useRouter();
  const [briefs, setBriefs] = useState<BriefHistory[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);
  const [localBriefStatuses, setLocalBriefStatuses] = useState<Record<string, EmailStatus>>({});
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, s] = await Promise.all([
        getBriefHistory(brand.id),
        getStrategiesForBrand(brand.id),
      ]);
      setBriefs(b);
      setStrategies(s);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [brand.id]);

  useEffect(() => { load(); }, [load]);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const handleBriefStatusChange = async (briefId: string, newStatus: EmailStatus) => {
    try {
      await updateBriefHistoryStatus(briefId, newStatus);
      setLocalBriefStatuses(prev => ({ ...prev, [briefId]: newStatus }));
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteBrief = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBriefHistory(deleteTarget);
      toast.success('Brief deleted');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Failed to delete');
    }
  };

  // Build month folders
  const monthsMap = new Map<string, MonthData>();

  // Group briefs by month (using send date from form_data, or created_at)
  for (const brief of briefs) {
    const sendDate = (brief.form_data as Record<string, string>)?.sendDate;
    const dateStr = sendDate || brief.created_at;
    const key = getMonthKey(dateStr);
    if (!monthsMap.has(key)) {
      monthsMap.set(key, { key, label: getMonthLabel(key), briefs: [], strategy: null });
    }
    monthsMap.get(key)!.briefs.push(brief);
  }

  // Group strategies by month (using the month/year from form_data or name)
  for (const strategy of strategies) {
    const key = getMonthKey(strategy.created_at);
    if (!monthsMap.has(key)) {
      monthsMap.set(key, { key, label: getMonthLabel(key), briefs: [], strategy: null });
    }
    monthsMap.get(key)!.strategy = strategy;
  }

  const months = [...monthsMap.values()].sort((a, b) => b.key.localeCompare(a.key));

  // ─── Month content view ───
  if (selectedMonth) {
    const month = monthsMap.get(selectedMonth);
    if (!month) { setSelectedMonth(null); return null; }

    return (
      <div>
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="sm" onClick={() => setSelectedMonth(null)}>← Back</Button>
          <div className="flex items-center gap-3">
            <h1 className="heading text-xl text-white">{brand.name}</h1>
            <span className="text-[#444] text-sm">/ {month.label}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left: Briefs */}
          <div className="col-span-1 lg:col-span-3">
            <p className="label-text mb-3">Briefs ({month.briefs.length})</p>

            {month.briefs.length === 0 ? (
              <Card>
                <div className="text-center py-8">
                  <p className="text-[#444] text-sm mb-3">No briefs for {month.label}.</p>
                  <Link href="/create"><Button variant="secondary" size="sm">Create Brief</Button></Link>
                </div>
              </Card>
            ) : (
              <div className="space-y-2">
                {month.briefs.map(item => {
                  const typeInfo = BRIEF_TYPES.find(t => t.value === item.type);
                  const isExpanded = expandedBrief === item.id;
                  const title = (item.form_data as Record<string, string>)?.title || typeInfo?.label || 'Brief';
                  const currentStatus = localBriefStatuses[item.id] || item.status || 'not_started';
                  const statusInfo = EMAIL_STATUSES.find(s => s.value === currentStatus);
                  const statusColor = statusInfo?.color || '#6B7280';

                  return (
                    <Card key={item.id} padding="sm" className="relative overflow-visible">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedBrief(isExpanded ? null : item.id)}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-white/[0.03] border border-white/[0.04] flex items-center justify-center flex-shrink-0">
                            <span className="text-sm">{typeInfo?.icon || '📄'}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-white truncate">{title}</p>
                            <span className="text-[9px] text-[#555]">{typeInfo?.label}{(() => { const sd = (item.form_data as Record<string, string>)?.sendDate; return sd ? ` · Send: ${formatDate(sd)}` : ''; })()}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <select
                            value={currentStatus}
                            onChange={e => { e.stopPropagation(); handleBriefStatusChange(item.id, e.target.value as EmailStatus); }}
                            onClick={e => e.stopPropagation()}
                            className="text-[9px] font-medium rounded-md px-2 py-1 appearance-none cursor-pointer border-0 focus:outline-none"
                            style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
                          >
                            {EMAIL_STATUSES.map(s => (
                              <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                          </select>
                          {/* Three-dot menu */}
                          <div className="relative">
                            <button
                              onClick={e => { e.stopPropagation(); setMenuOpen(menuOpen === item.id ? null : item.id); }}
                              className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.05] transition-colors"
                            >
                              <span className="text-[#555] text-xs leading-none">⋮</span>
                            </button>
                            {menuOpen === item.id && (
                              <>
                              <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setMenuOpen(null); }} />
                              <div className="absolute right-0 top-full mt-1 z-50 w-36 glass-card rounded-xl py-1.5 shadow-xl border border-white/10 animate-menu">
                                <button
                                  onClick={e => { e.stopPropagation(); router.push(`/briefs/${item.id}`); setMenuOpen(null); }}
                                  className="w-full text-left px-3 py-2 text-[10px] text-white hover:bg-white/[0.05] transition-colors"
                                >
                                  Open
                                </button>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    copyToClipboard(`${window.location.origin}/briefs/${item.id}`);
                                    toast.success('Link copied');
                                    setMenuOpen(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-[10px] text-white hover:bg-white/[0.05] transition-colors"
                                >
                                  Share Link
                                </button>
                                <div className="h-px bg-white/[0.04] my-1" />
                                <button
                                  onClick={e => { e.stopPropagation(); setDeleteTarget(item.id); setMenuOpen(null); }}
                                  className="w-full text-left px-3 py-2 text-[10px] text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="mt-3 pt-3 border-t border-white/[0.04] max-h-[400px] overflow-y-auto">
                          <BriefTable output={item.output} />
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Strategy */}
          <div className="col-span-1 lg:col-span-2">
            <p className="label-text mb-3">Strategy</p>
            {!month.strategy ? (
              <Card>
                <div className="text-center py-8">
                  <p className="text-[#444] text-xs mb-3">No strategy for {month.label}.</p>
                  <Link href="/create?type=strategy"><Button variant="secondary" size="sm">Create Strategy</Button></Link>
                </div>
              </Card>
            ) : (
              <Card padding="sm">
                <p className="text-[11px] font-semibold text-white uppercase tracking-wider">{month.strategy.name}</p>
                <p className="text-[9px] text-[#555] mt-1">
                  {month.strategy.calendar_items?.length || 0} emails
                </p>
                {month.strategy.calendar_items && month.strategy.calendar_items.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-1.5">
                    {month.strategy.calendar_items.map(item => {
                      const si = EMAIL_STATUSES.find(s => s.value === item.status);
                      const color = si?.color || '#6B7280';
                      return (
                        <div key={item.id} className="flex items-center justify-between py-1 px-2 rounded-md bg-white/[0.02]">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-[10px] text-white truncate">{item.name}</span>
                          </div>
                          <select
                            value={item.status}
                            onChange={async e => {
                              try {
                                await updateCalendarItemStatus(item.id, e.target.value as EmailStatus);
                                toast.success('Updated');
                                load();
                              } catch { toast.error('Failed'); }
                            }}
                            className="text-[9px] font-medium rounded px-1.5 py-0.5 appearance-none cursor-pointer border-0 focus:outline-none bg-transparent"
                            style={{ color }}
                          >
                            {EMAIL_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>

        <ConfirmDialog
          open={!!deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDeleteBrief}
          title="Delete Brief"
          message="This will permanently delete this brief and its linked calendar item."
          confirmLabel="Delete"
        />
      </div>
    );
  }

  // ─── Month folders view ───
  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <div className="flex items-center gap-3">
          <h1 className="heading text-xl text-white">{brand.name}</h1>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 glass-card rounded-xl shimmer" />)}
        </div>
      ) : months.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[#444] text-sm mb-4">No briefs or strategies yet.</p>
          <Link href="/create"><Button variant="secondary">Create Brief</Button></Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {months.map((month, i) => (
            <Card
              key={month.key}
              hoverable
              padding="md"
              onClick={() => setSelectedMonth(month.key)}
              className="animate-fade-in"
              style={{ animationDelay: `${i * 30}ms` } as React.CSSProperties}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.04] flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">📅</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-white uppercase tracking-wider">
                    {month.label}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[9px] text-[#555]">
                      {month.briefs.length} brief{month.briefs.length !== 1 ? 's' : ''}
                    </span>
                    {month.strategy && (
                      <>
                        <span className="text-[9px] text-[#333]">·</span>
                        <span className="text-[9px] text-[#555]">1 strategy</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───
export default function BriefsPage() {
  const { selectedPod, podBrands } = useApp();
  const [counts, setCounts] = useState<Record<string, { briefs: number; strategies: number }>>({});
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCounts() {
      if (podBrands.length === 0) {
        setCounts({});
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await getBriefAndStrategyCounts(podBrands.map(b => b.id));
        setCounts(data);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    loadCounts();
    setSelectedBrand(null);
  }, [selectedPod, podBrands]);

  // Detail view
  if (selectedBrand) {
    return <ClientDetailView brand={selectedBrand} onBack={() => setSelectedBrand(null)} />;
  }

  // Folder view
  return (
    <div>
      <PageHeader
        title="Briefs"
        subtitle={selectedPod ? `${selectedPod.name} — Client Briefs & Strategies` : 'Select a pod'}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 glass-card rounded-xl shimmer" />
          ))}
        </div>
      ) : (
        <FolderView brands={podBrands} counts={counts} onSelectBrand={setSelectedBrand} />
      )}
    </div>
  );
}
