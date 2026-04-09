'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/lib/app-context';
import { Brand } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { ReportSkeleton } from '@/components/ui/skeleton';
import { exportAuditDocx, AuditDimensionContent } from '@/lib/export-audit-docx';
import { VERTICAL_LIST } from '@/lib/skills/klaviyo-audit';
import toast from 'react-hot-toast';

interface AuditPayload {
  brand: { id: string; name: string };
  vertical: string;
  period_label: string;
  computed: {
    overall_score: number;
    scores: Record<string, number>;
  };
  audit: {
    overall_summary: string;
    top_3_priorities: string[];
    dimensions: Record<string, AuditDimensionContent>;
    action_plan: Array<{ action: string; owner: string; priority: string; effort: string }>;
  };
}

const DIMENSION_LABELS: Record<string, string> = {
  flow_architecture: 'Flow Architecture',
  flow_performance: 'Flow Performance',
  campaign_performance: 'Campaign Performance',
  deliverability_health: 'Deliverability',
  list_health: 'List & Segmentation',
  revenue_attribution: 'Revenue Attribution',
  ab_testing: 'A/B Testing',
  content_strategy: 'Content Strategy',
};

const DIMENSION_ORDER = [
  'flow_architecture',
  'flow_performance',
  'campaign_performance',
  'deliverability_health',
  'list_health',
  'revenue_attribution',
  'ab_testing',
  'content_strategy',
];

function scoreBadge(n: number): { text: string; color: string; bg: string } {
  if (n >= 3) return { text: 'STRONG', color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)' };
  if (n >= 2) return { text: 'NEEDS WORK', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.12)' };
  return { text: 'CRITICAL', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.12)' };
}

function priorityColor(p: string): string {
  const lower = p.toLowerCase();
  if (lower === 'high') return '#EF4444';
  if (lower === 'medium') return '#F59E0B';
  return '#666';
}

export default function AccountAuditPage() {
  const { brands, managers, selectedPod } = useApp();
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [vertical, setVertical] = useState<string>('General DTC E-Commerce');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AuditPayload | null>(null);
  const [exporting, setExporting] = useState(false);

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
    const orphans = podBrands.filter(
      (b) => !b.manager_id || !podManagers.some((m) => m.id === b.manager_id)
    );
    if (orphans.length > 0) groups.push({ manager: null, brands: orphans });
    return groups;
  }, [podBrands, podManagers]);

  const handleRun = async () => {
    if (!selectedBrand) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/account-audit/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId: selectedBrand.id, vertical }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Audit failed');
      setResult(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Audit failed');
    } finally {
      setRunning(false);
    }
  };

  const handleExport = async () => {
    if (!result || !selectedBrand) return;
    setExporting(true);
    try {
      await exportAuditDocx({
        brandName: selectedBrand.name,
        vertical: result.vertical,
        periodLabel: result.period_label,
        overallScore: result.computed.overall_score,
        scores: result.computed.scores,
        overallSummary: result.audit.overall_summary,
        topPriorities: result.audit.top_3_priorities,
        dimensions: result.audit.dimensions,
        actionPlan: result.audit.action_plan,
      });
      toast.success('DOCX downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    setSelectedBrand(null);
    setResult(null);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="ACCOUNT AUDIT"
        subtitle="Full 8-dimension Klaviyo account review with scores, findings, and a prioritised action plan"
      />

      {/* Brand picker */}
      {!selectedBrand ? (
        <div className="space-y-6">
          {groupedByManager.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[#555] text-sm">No clients in this pod.</p>
            </div>
          ) : (
            groupedByManager.map(({ manager, brands: mBrands }) => (
              <div key={manager?.id || 'orphans'}>
                <p className="label-text mb-3">{manager ? manager.name : 'Unassigned'}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 stagger-fast">
                  {mBrands.map((brand) => (
                    <BrandCard
                      key={brand.id}
                      brand={brand}
                      showEdit={false}
                      onClick={() => {
                        setSelectedBrand(brand);
                        setResult(null);
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
          {/* Header */}
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
            <Button variant="secondary" size="sm" onClick={reset}>
              ← Change client
            </Button>
          </Card>

          {/* Vertical + run */}
          <Card className="p-6">
            <p className="label-text mb-3">Client vertical (for benchmark comparison)</p>
            <select
              value={vertical}
              onChange={(e) => setVertical(e.target.value)}
              className="w-full max-w-md bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white focus:outline-none focus:border-white/25 transition-colors cursor-pointer mb-6"
            >
              {VERTICAL_LIST.map((v) => (
                <option key={v} value={v} className="bg-[#0A0A0A] text-white">
                  {v}
                </option>
              ))}
            </select>

            <Button onClick={handleRun} disabled={running}>
              {running ? 'Running audit…' : 'Run full audit'}
            </Button>
            {running && (
              <p className="text-[11px] text-[#555] mt-2">
                Pulling 90 days of data across 8 dimensions and scoring each. This may take up to a minute.
              </p>
            )}
          </Card>

          {/* Skeleton while running */}
          {running && !result && (
            <div className="animate-fade">
              <ReportSkeleton />
            </div>
          )}

          {/* Results */}
          {result && (
            <>
              {/* Overall score + summary */}
              <Card className="p-6 animate-fade">
                <div className="flex items-start justify-between flex-wrap gap-4 mb-4">
                  <div>
                    <p className="label-text mb-2">Overall score</p>
                    <div className="flex items-baseline gap-2">
                      <span className="count-pop text-4xl font-bold text-white">
                        {result.computed.overall_score.toFixed(2)}
                      </span>
                      <span className="text-sm text-[#666]">/ 3.00</span>
                    </div>
                    <p className="text-[10px] text-[#555] mt-1 uppercase tracking-wider">
                      {result.vertical} · {result.period_label}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={handleExport} disabled={exporting}>
                      {exporting ? 'Exporting…' : 'Export DOCX'}
                    </Button>
                  </div>
                </div>
                <p className="text-[12px] text-[#ccc] leading-relaxed">{result.audit.overall_summary}</p>
              </Card>

              {/* Top 3 priorities */}
              <Card className="p-6 animate-fade">
                <p className="label-text mb-4">Top 3 priorities</p>
                <ol className="space-y-3">
                  {result.audit.top_3_priorities.map((p, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 text-white text-[11px] font-bold flex items-center justify-center">
                        {i + 1}
                      </span>
                      <p className="text-[12px] text-[#e5e5e5] leading-relaxed">{p}</p>
                    </li>
                  ))}
                </ol>
              </Card>

              {/* Dimension scores grid */}
              <Card className="p-6 animate-fade">
                <p className="label-text mb-4">Dimension scores</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger-fast">
                  {DIMENSION_ORDER.map((key) => {
                    const score = result.computed.scores[key] || 0;
                    const badge = scoreBadge(score);
                    const dim = result.audit.dimensions[key];
                    return (
                      <div
                        key={key}
                        className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="text-[11px] font-semibold text-white">
                            {DIMENSION_LABELS[key]}
                          </p>
                          <span
                            className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                            style={{ color: badge.color, background: badge.bg }}
                          >
                            {badge.text}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#888] leading-relaxed">{dim?.one_liner}</p>
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Detailed findings */}
              <Card className="p-6 animate-fade">
                <p className="label-text mb-4">Detailed findings</p>
                <div className="space-y-6">
                  {DIMENSION_ORDER.map((key) => {
                    const score = result.computed.scores[key] || 0;
                    const badge = scoreBadge(score);
                    const dim = result.audit.dimensions[key];
                    if (!dim) return null;
                    return (
                      <div key={key} className="border-l-2 pl-4" style={{ borderColor: badge.color }}>
                        <div className="flex items-center gap-2 mb-2">
                          <p className="text-[12px] font-semibold text-white">{DIMENSION_LABELS[key]}</p>
                          <span
                            className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                            style={{ color: badge.color, background: badge.bg }}
                          >
                            {badge.text}
                          </span>
                        </div>
                        {dim.what_was_found && (
                          <div className="mb-2">
                            <p className="text-[9px] uppercase tracking-wider text-[#666] mb-1">What we found</p>
                            <p className="text-[11px] text-[#ccc] leading-relaxed">{dim.what_was_found}</p>
                          </div>
                        )}
                        {dim.what_is_working && (
                          <div className="mb-2">
                            <p className="text-[9px] uppercase tracking-wider text-green-500/70 mb-1">Working</p>
                            <p className="text-[11px] text-[#ccc] leading-relaxed">{dim.what_is_working}</p>
                          </div>
                        )}
                        {dim.what_needs_fixing && (
                          <div className="mb-2">
                            <p className="text-[9px] uppercase tracking-wider text-red-500/70 mb-1">Needs fixing</p>
                            <p className="text-[11px] text-[#ccc] leading-relaxed">{dim.what_needs_fixing}</p>
                          </div>
                        )}
                        {dim.recommended_actions && dim.recommended_actions.length > 0 && (
                          <div>
                            <p className="text-[9px] uppercase tracking-wider text-[#666] mb-1">Actions</p>
                            <ul className="space-y-1">
                              {dim.recommended_actions.map((a, i) => (
                                <li
                                  key={i}
                                  className="text-[11px] text-[#ccc] leading-relaxed flex gap-2"
                                >
                                  <span className="text-[#555]">→</span>
                                  <span>{a}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* Action plan */}
              <Card className="p-6 animate-fade">
                <p className="label-text mb-4">Prioritised action plan</p>
                <div className="overflow-x-auto -mx-6 px-6">
                  <table className="w-full text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.08]">
                        <th className="text-left py-2 px-2 text-[9px] uppercase tracking-wider text-[#666] font-semibold">
                          Action
                        </th>
                        <th className="text-left py-2 px-2 text-[9px] uppercase tracking-wider text-[#666] font-semibold">
                          Owner
                        </th>
                        <th className="text-left py-2 px-2 text-[9px] uppercase tracking-wider text-[#666] font-semibold">
                          Priority
                        </th>
                        <th className="text-left py-2 px-2 text-[9px] uppercase tracking-wider text-[#666] font-semibold">
                          Effort
                        </th>
                      </tr>
                    </thead>
                    <tbody className="stagger-rows">
                      {result.audit.action_plan.map((p, i) => (
                        <tr key={i} className="border-b border-white/[0.03]">
                          <td className="py-3 px-2 text-[#e5e5e5] align-top">{p.action}</td>
                          <td className="py-3 px-2 text-[#888] align-top whitespace-nowrap">{p.owner}</td>
                          <td
                            className="py-3 px-2 font-semibold uppercase tracking-wider text-[9px] align-top whitespace-nowrap"
                            style={{ color: priorityColor(p.priority) }}
                          >
                            {p.priority}
                          </td>
                          <td className="py-3 px-2 text-[#888] align-top whitespace-nowrap">{p.effort}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
