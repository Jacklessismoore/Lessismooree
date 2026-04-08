'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/lib/app-context';
import { Brand } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { ReportSkeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';

type Period = '7d' | '14d' | '30d' | '90d' | 'custom';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom date range…' },
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function WeeklyWrapPage() {
  const { brands, managers, selectedPod } = useApp();
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [period, setPeriod] = useState<Period>('7d');
  const [customStart, setCustomStart] = useState<string>(daysAgoISO(7));
  const [customEnd, setCustomEnd] = useState<string>(todayISO());
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  // Filter brands to selected pod, then group by account manager
  const podBrands = useMemo(
    () => (selectedPod ? brands.filter((b) => b.pod_id === selectedPod.id) : brands),
    [brands, selectedPod]
  );

  const podManagers = useMemo(
    () => (selectedPod ? managers.filter((m) => m.pod_id === selectedPod.id || !m.pod_id) : managers),
    [managers, selectedPod]
  );

  const groupedByManager = useMemo(() => {
    const groups: Array<{ manager: { id: string; name: string } | null; brands: Brand[] }> = [];
    for (const m of podManagers) {
      const mBrands = podBrands.filter((b) => b.manager_id === m.id);
      if (mBrands.length > 0) groups.push({ manager: { id: m.id, name: m.name }, brands: mBrands });
    }
    const orphans = podBrands.filter((b) => !b.manager_id || !podManagers.some((m) => m.id === b.manager_id));
    if (orphans.length > 0) groups.push({ manager: null, brands: orphans });
    return groups;
  }, [podBrands, podManagers]);

  const handleGenerate = async () => {
    if (!selectedBrand) return;
    if (period === 'custom') {
      if (!customStart || !customEnd) {
        toast.error('Pick both a start and end date');
        return;
      }
      if (new Date(customEnd) < new Date(customStart)) {
        toast.error('End date must be after start date');
        return;
      }
    }
    setGenerating(true);
    setReport(null);
    try {
      const res = await fetch('/api/weekly-wrap/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrand.id,
          period,
          ...(period === 'custom' ? { customStart, customEnd } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      setReport(data.report);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="WEEKLY WRAP"
        subtitle="Generate a copy-ready Klaviyo performance report for any client"
      />

      {/* Brand selection */}
      {!selectedBrand ? (
        <div className="space-y-6">
          {groupedByManager.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[#555] text-sm">No clients in this pod.</p>
            </div>
          ) : (
            groupedByManager.map(({ manager, brands: mBrands }) => (
              <div key={manager?.id || 'orphans'}>
                <p className="label-text mb-3">
                  {manager ? manager.name : 'Unassigned'}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 stagger-fast">
                  {mBrands.map((brand) => (
                    <BrandCard
                      key={brand.id}
                      brand={brand}
                      showEdit={false}
                      onClick={() => {
                        setSelectedBrand(brand);
                        setReport(null);
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Header bar */}
          <Card className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
                style={{ background: selectedBrand.color || '#444' }}
              >
                {selectedBrand.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-[#666]">Client</p>
                <p className="text-sm font-semibold text-white">{selectedBrand.name}</p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedBrand(null);
                setReport(null);
              }}
            >
              ← Change client
            </Button>
          </Card>

          {/* Period selector + generate */}
          <Card className="p-6">
            <p className="label-text mb-3">Time period</p>
            <div className="mb-4">
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value as Period)}
                className="w-full max-w-xs bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white focus:outline-none focus:border-white/25 transition-colors cursor-pointer"
              >
                {PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-[#0A0A0A] text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {period === 'custom' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 animate-fade">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">Start date</label>
                  <input
                    type="date"
                    value={customStart}
                    max={customEnd || todayISO()}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">End date</label>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart}
                    max={todayISO()}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white focus:outline-none focus:border-white/25 transition-colors"
                  />
                </div>
              </div>
            )}

            {period !== 'custom' && <div className="mb-6" />}

            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate report'}
            </Button>
            {generating && (
              <p className="text-[11px] text-[#555] mt-2">
                Pulling Klaviyo data and writing the report. This may take a moment.
              </p>
            )}
          </Card>

          {/* Skeleton placeholder while generating */}
          {generating && !report && (
            <div className="animate-fade">
              <ReportSkeleton />
            </div>
          )}

          {/* Output */}
          {report && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="label-text flex items-center gap-2">
                  <span className="count-pop">Generated report</span>
                </p>
                <Button variant="secondary" size="sm" onClick={handleCopy}>
                  Copy to clipboard
                </Button>
              </div>
              <pre className="whitespace-pre-wrap text-[12px] text-[#e5e5e5] leading-relaxed font-sans bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 overflow-x-auto">
                {report}
              </pre>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
