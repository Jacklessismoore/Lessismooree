'use client';

import { useState, useMemo } from 'react';
import { useApp } from '@/lib/app-context';
import { Brand } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { exportTestResultsDocx, TestResultTest } from '@/lib/export-test-results-docx';
import toast from 'react-hot-toast';

type Period = '7d' | '14d' | '30d' | '90d' | 'custom';

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'custom', label: 'Custom date range…' },
];

interface PulledFlow {
  flow_id: string;
  flow_name: string;
  trigger: string;
  status: string;
  test_count: number;
  variation_count: number;
  recipients: number;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function TestResultsPage() {
  const { brands, managers, selectedPod } = useApp();
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [period, setPeriod] = useState<Period>('30d');
  const [customStart, setCustomStart] = useState<string>(daysAgoISO(30));
  const [customEnd, setCustomEnd] = useState<string>(todayISO());

  const [pulling, setPulling] = useState(false);
  const [pulledFlows, setPulledFlows] = useState<PulledFlow[] | null>(null);
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(new Set());

  const [analysing, setAnalysing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [rawTests, setRawTests] = useState<TestResultTest[] | null>(null);
  const [exporting, setExporting] = useState(false);

  // Brand grouping
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

  const resetWorkflow = () => {
    setPulledFlows(null);
    setSelectedFlowIds(new Set());
    setSummary(null);
    setInsights({});
    setRawTests(null);
  };

  const validatePeriod = (): boolean => {
    if (period !== 'custom') return true;
    if (!customStart || !customEnd) {
      toast.error('Pick both a start and end date');
      return false;
    }
    if (new Date(customEnd) < new Date(customStart)) {
      toast.error('End date must be after start date');
      return false;
    }
    return true;
  };

  const handlePullFlows = async () => {
    if (!selectedBrand || !validatePeriod()) return;
    setPulling(true);
    setPulledFlows(null);
    setSummary(null);
    setInsights({});
    setRawTests(null);
    try {
      const res = await fetch('/api/test-results/pull-flows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrand.id,
          period,
          ...(period === 'custom' ? { customStart, customEnd } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to pull flows');
      setPulledFlows(data.flows || []);
      // Pre-select all pulled flows
      setSelectedFlowIds(new Set((data.flows || []).map((f: PulledFlow) => f.flow_id)));
      if ((data.flows || []).length === 0) {
        toast('No flows with A/B tests found for this period');
      } else {
        toast.success(`Found ${data.flows.length} flow${data.flows.length === 1 ? '' : 's'} with A/B tests`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to pull flows');
    } finally {
      setPulling(false);
    }
  };

  const toggleFlow = (id: string) => {
    setSelectedFlowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAnalyse = async () => {
    if (!selectedBrand || selectedFlowIds.size === 0) return;
    setAnalysing(true);
    setSummary(null);
    setInsights({});
    setRawTests(null);
    try {
      const res = await fetch('/api/test-results/analyse', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrand.id,
          period,
          ...(period === 'custom' ? { customStart, customEnd } : {}),
          flowIds: Array.from(selectedFlowIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to analyse');
      setSummary(data.summary || null);
      setInsights(data.insights || {});
      setRawTests(data.tests || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to analyse');
    } finally {
      setAnalysing(false);
    }
  };

  // Build a Slack-friendly text representation of the table for copy-paste
  const buildSlackText = (): string => {
    if (!summary || !rawTests) return '';
    const lines: string[] = [];
    lines.push(`*A/B Test Results — ${selectedBrand?.name || ''}*`);
    lines.push(
      period === 'custom'
        ? `${customStart} to ${customEnd}`
        : PERIOD_OPTIONS.find((p) => p.value === period)?.label || ''
    );
    lines.push('');
    lines.push(summary);
    lines.push('');
    for (const t of rawTests) {
      const id = `${t.flow_id}:${t.flow_message_id}`;
      const why = insights[id] || '';
      const verdict = verdictFor(t);
      lines.push(`• *${t.flow_name} — ${t.flow_message_label}*`);
      lines.push(`  Winner: ${verdict}`);
      if (why) lines.push(`  Why: ${why}`);
    }
    return lines.join('\n');
  };

  const verdictFor = (t: TestResultTest): string => {
    const ct = (t as TestResultTest & { classification?: string; lift_pct?: number | null }).classification;
    const lift = (t as TestResultTest & { lift_pct?: number | null }).lift_pct;
    if (ct === 'clear_winner' && t.server_suggested_winner) {
      return `${t.server_suggested_winner}${lift != null ? ` (+${lift}%)` : ''}`;
    }
    if (ct === 'too_close') return 'Inconclusive — too close';
    if (ct === 'no_revenue') return 'Inconclusive — no revenue';
    if (ct === 'insufficient_sample') return 'Inconclusive — low sample';
    return 'Inconclusive';
  };

  const handleCopy = async () => {
    const text = buildSlackText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleExport = async () => {
    if (!selectedBrand || !summary || !rawTests) return;
    setExporting(true);
    try {
      await exportTestResultsDocx({
        brandName: selectedBrand.name,
        periodLabel: period === 'custom' ? `${customStart} to ${customEnd}` : PERIOD_OPTIONS.find((p) => p.value === period)?.label || '',
        summary,
        insights,
        tests: rawTests,
      });
      toast.success('DOCX downloaded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="TEST RESULTS"
        subtitle="Pull live flow A/B tests and document the winners"
      />

      {/* ── Brand picker ── */}
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
                        resetWorkflow();
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSelectedBrand(null);
                resetWorkflow();
              }}
            >
              ← Change client
            </Button>
          </Card>

          {/* Step 1: Pick period + pull */}
          <Card className="p-6">
            <p className="label-text mb-3">1. Time period</p>
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

            <Button onClick={handlePullFlows} disabled={pulling}>
              {pulling ? 'Pulling…' : 'Pull live A/B tests'}
            </Button>
            {pulling && (
              <p className="text-[11px] text-[#555] mt-2">
                Fetching flow variation data from Klaviyo. This may take a moment.
              </p>
            )}
          </Card>

          {/* Step 2: Select flows */}
          {pulledFlows !== null && pulledFlows.length > 0 && (
            <Card className="p-6 animate-fade">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="label-text">2. Select flows to analyse</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedFlowIds(new Set(pulledFlows.map((f) => f.flow_id)))}
                    className="text-[10px] uppercase tracking-wider text-[#888] hover:text-white transition-colors"
                  >
                    Select all
                  </button>
                  <span className="text-[#333]">·</span>
                  <button
                    onClick={() => setSelectedFlowIds(new Set())}
                    className="text-[10px] uppercase tracking-wider text-[#888] hover:text-white transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="space-y-2 mb-4 stagger-fast">
                {pulledFlows.map((flow) => {
                  const checked = selectedFlowIds.has(flow.flow_id);
                  return (
                    <button
                      key={flow.flow_id}
                      onClick={() => toggleFlow(flow.flow_id)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-xl text-left chip-press transition-colors duration-200 ${
                        checked ? 'bg-white/[0.05] border border-white/15' : 'bg-white/[0.02] border border-white/[0.04] hover:border-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors duration-200 ${
                            checked ? 'bg-green-500 border-green-500' : 'border-white/20'
                          }`}
                        >
                          {checked && (
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none" className="check-draw">
                              <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-white truncate">{flow.flow_name}</p>
                          <p className="text-[10px] text-[#555] mt-0.5">
                            {flow.test_count} test{flow.test_count === 1 ? '' : 's'} · {flow.recipients.toLocaleString()} recipients · {flow.status}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <Button onClick={handleAnalyse} disabled={analysing || selectedFlowIds.size === 0}>
                {analysing ? 'Analysing…' : `Analyse ${selectedFlowIds.size} flow${selectedFlowIds.size === 1 ? '' : 's'}`}
              </Button>
              {analysing && (
                <p className="text-[11px] text-[#555] mt-2">
                  Running analysis and writing recommendations. This may take a moment.
                </p>
              )}
            </Card>
          )}

          {/* Step 3: Output */}
          {summary && rawTests && (
            <Card className="p-6 animate-fade">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <p className="label-text">3. Findings</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="secondary" size="sm" onClick={handleCopy}>
                    Copy to clipboard
                  </Button>
                  <Button size="sm" onClick={handleExport} disabled={exporting}>
                    {exporting ? 'Exporting…' : 'Export DOCX'}
                  </Button>
                </div>
              </div>

              <p className="text-[12px] text-[#ccc] leading-relaxed mb-5">{summary}</p>

              <div className="overflow-x-auto -mx-6 px-6">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="border-b border-white/[0.08]">
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-[#888] font-semibold">Flow</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-[#888] font-semibold">Message</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-[#888] font-semibold">Winner</th>
                      <th className="text-right px-3 py-2 text-[10px] uppercase tracking-wider text-[#888] font-semibold">Lift</th>
                      <th className="text-left px-3 py-2 text-[10px] uppercase tracking-wider text-[#888] font-semibold">Why</th>
                    </tr>
                  </thead>
                  <tbody className="stagger-rows">
                    {rawTests.map((t) => {
                      const id = `${t.flow_id}:${t.flow_message_id}`;
                      const why = insights[id] || '';
                      const verdict = verdictFor(t);
                      const ct = (t as TestResultTest & { classification?: string }).classification;
                      const lift = (t as TestResultTest & { lift_pct?: number | null }).lift_pct;
                      const isWinner = ct === 'clear_winner';
                      return (
                        <tr key={id} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                          <td className="px-3 py-3 text-white align-top">{t.flow_name}</td>
                          <td className="px-3 py-3 text-[#aaa] align-top">{t.flow_message_label}</td>
                          <td className="px-3 py-3 align-top">
                            <span className={isWinner ? 'text-green-400 font-medium' : 'text-[#666]'}>
                              {verdict}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right align-top">
                            {isWinner && lift != null ? (
                              <span className="text-green-400 font-medium">+{lift}%</span>
                            ) : (
                              <span className="text-[#444]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-[#ccc] align-top">{why}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
