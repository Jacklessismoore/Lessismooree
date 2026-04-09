'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';
import { Brand, LiveFlow, FlowEmail } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { exportABTestDocx } from '@/lib/export-ab-test-docx';
import toast from 'react-hot-toast';

interface VariantState {
  variant_subject: string;
  variant_preview: string;
  variable_tested: string | null;
  hypothesis: string | null;
  generating: boolean;
}

function emptyVariant(): VariantState {
  return {
    variant_subject: '',
    variant_preview: '',
    variable_tested: null,
    hypothesis: null,
    generating: false,
  };
}

function ClientSelectionPanel({ brands, onSelect }: { brands: Brand[]; onSelect: (b: Brand) => void }) {
  const eligible = brands.filter((b) => !!b.klaviyo_api_key);

  if (eligible.length === 0) {
    return (
      <p className="text-sm text-[#666]">
        None of your clients in this pod have a Klaviyo API key configured. Add one on the client page first.
      </p>
    );
  }

  // Group eligible brands by account manager (same pattern as Reports page)
  const groups: { managerName: string; brands: Brand[] }[] = [];
  const map = new Map<string, { managerName: string; brands: Brand[] }>();
  for (const brand of eligible) {
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
      {groups.map((group) => (
        <div key={group.managerName}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[11px] font-bold text-white uppercase tracking-[0.15em]">
              {group.managerName}
            </h3>
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[9px] text-[#444]">
              {group.brands.length} client{group.brands.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {group.brands.map((brand) => {
              const idx = animIndex++;
              return (
                <BrandCard
                  key={brand.id}
                  brand={brand}
                  onClick={() => onSelect(brand)}
                  showEdit={false}
                  showMenu={false}
                  animDelay={idx * 30}
                  subtitle={brand.category || 'Uncategorised'}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ABTestsPage() {
  const { podBrands: brands } = useApp();
  const { role, loading: authLoading } = useAuth();

  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [flows, setFlows] = useState<LiveFlow[] | null>(null);
  const [loadingFlows, setLoadingFlows] = useState(false);
  // IDs the user is currently ticking in the flow picker, before confirming
  const [flowPickerIds, setFlowPickerIds] = useState<Set<string>>(new Set());
  // The flows the user has confirmed to work on (one or more)
  const [activeFlows, setActiveFlows] = useState<LiveFlow[]>([]);
  // One test theme per flow. Drives every email's variant in that flow.
  const [flowThemes, setFlowThemes] = useState<Record<string, string>>({});
  const [suggestingThemeFor, setSuggestingThemeFor] = useState<string | null>(null);
  const [variants, setVariants] = useState<Record<string, VariantState>>({});
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saving, setSaving] = useState(false);

  // Past A/B test batches for the selected brand
  interface HistoryBatch {
    batch_id: string;
    created_at: string;
    hypothesis: string | null;
    num_tests: number;
    tests: Array<{
      id: string;
      flow_id: string;
      flow_name: string;
      flow_message_id: string;
      flow_message_label: string | null;
      original_subject: string | null;
      original_preview: string | null;
      variant_subject: string;
      variant_preview: string | null;
      hypothesis: string | null;
    }>;
  }
  const [history, setHistory] = useState<HistoryBatch[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [reExportingBatchId, setReExportingBatchId] = useState<string | null>(null);
  const [deleteConfirmBatchId, setDeleteConfirmBatchId] = useState<string | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const allowed = role === 'account_manager' || role === 'klaviyo_tech' || role === 'admin';

  // Reset when brand changes
  useEffect(() => {
    setFlows(null);
    setFlowPickerIds(new Set());
    setActiveFlows([]);
    setVariants({});
    setFlowThemes({});
    setHistory(null);
  }, [selectedBrand?.id]);

  // Load A/B test history whenever a brand is selected
  const loadHistory = useCallback(async (brandId: string) => {
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/ab-tests?brandId=${brandId}`);
      const data = await res.json();
      if (res.ok) setHistory(data.batches || []);
    } catch {
      // non-fatal
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBrand) loadHistory(selectedBrand.id);
  }, [selectedBrand, loadHistory]);

  // Seed an empty variant row for every email in every active flow
  useEffect(() => {
    if (activeFlows.length === 0) {
      setVariants({});
      return;
    }
    const next: Record<string, VariantState> = {};
    for (const f of activeFlows) {
      for (const e of f.emails) {
        next[e.messageId] = emptyVariant();
      }
    }
    setVariants(next);
  }, [activeFlows]);

  const pullFlows = useCallback(async () => {
    if (!selectedBrand) return;
    setLoadingFlows(true);
    setFlows(null);
    setFlowPickerIds(new Set());
    setActiveFlows([]);
    try {
      const res = await fetch('/api/klaviyo/live-flows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brandId: selectedBrand.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load flows');
      setFlows(data.flows);
      if (!data.flows?.length) toast.error('No live flows with email subject lines found');
      else toast.success(`Loaded ${data.flows.length} live flows`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoadingFlows(false);
    }
  }, [selectedBrand]);

  const suggestThemeForFlow = useCallback(
    async (flow: LiveFlow) => {
      if (!selectedBrand) return;
      setSuggestingThemeFor(flow.flowId);
      try {
        const summary = `${flow.flowName}\n${flow.emails
          .map((e) => `  Email ${e.position}: ${e.subject}`)
          .join('\n')}`;
        const res = await fetch('/api/ab-tests/suggest-theme', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ brandId: selectedBrand.id, flowSummary: summary }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        setFlowThemes((prev) => ({ ...prev, [flow.flowId]: data.theme || '' }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to suggest theme');
      } finally {
        setSuggestingThemeFor(null);
      }
    },
    [selectedBrand]
  );

  const generateVariantForEmail = useCallback(
    async (flow: LiveFlow, email: FlowEmail) => {
      if (!selectedBrand) return;
      setVariants((prev) => ({
        ...prev,
        [email.messageId]: { ...(prev[email.messageId] || emptyVariant()), generating: true },
      }));
      try {
        const theme = (flowThemes[flow.flowId] || '').trim();
        const res = await fetch('/api/ab-tests/generate-variant', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            brandId: selectedBrand.id,
            flowName: flow.flowName,
            flowTriggerType: flow.triggerType,
            email,
            siblingEmails: flow.emails,
            hypothesis: theme || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        setVariants((prev) => ({
          ...prev,
          [email.messageId]: {
            variant_subject: data.variant_subject || '',
            variant_preview: data.variant_preview || '',
            variable_tested: data.variable_tested || null,
            hypothesis: data.hypothesis || null,
            generating: false,
          },
        }));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to generate variant');
        setVariants((prev) => ({
          ...prev,
          [email.messageId]: { ...(prev[email.messageId] || emptyVariant()), generating: false },
        }));
      }
    },
    [selectedBrand, flowThemes]
  );

  // Track which flow is currently bulk-generating (null if none)
  const [bulkGeneratingFlowId, setBulkGeneratingFlowId] = useState<string | null>(null);

  // Inline single-email fetch that takes an explicit theme override. Used by
  // generateAllForFlow so the first email's picked variable can be locked in
  // as the flow theme for subsequent emails without relying on React state.
  const fetchVariant = useCallback(
    async (flow: LiveFlow, email: FlowEmail, themeOverride: string | undefined) => {
      if (!selectedBrand) return null;
      const res = await fetch('/api/ab-tests/generate-variant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrand.id,
          flowName: flow.flowName,
          flowTriggerType: flow.triggerType,
          email,
          siblingEmails: flow.emails,
          hypothesis: themeOverride || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      return data as {
        variant_subject: string;
        variant_preview: string;
        variable_tested: string | null;
        hypothesis: string | null;
      };
    },
    [selectedBrand]
  );

  const generateAllForFlow = useCallback(
    async (flow: LiveFlow) => {
      if (!selectedBrand) return;
      setBulkGeneratingFlowId(flow.flowId);
      setBulkGenerating(true);
      try {
        // Use typed theme if present, otherwise let email 1 pick one and lock
        // that variable in for the remaining emails so every variant in this
        // flow tests the same thing.
        let effectiveTheme = (flowThemes[flow.flowId] || '').trim();

        for (let i = 0; i < flow.emails.length; i += 1) {
          const e = flow.emails[i];
          setVariants((prev) => ({
            ...prev,
            [e.messageId]: { ...(prev[e.messageId] || emptyVariant()), generating: true },
          }));
          try {
            const data = await fetchVariant(flow, e, effectiveTheme || undefined);
            if (!data) break;

            // If no theme was set going in and this is email 1, lock in
            // whatever variable Claude picked as the theme for the rest.
            if (!effectiveTheme && data.variable_tested) {
              effectiveTheme = data.variable_tested;
              setFlowThemes((prev) => ({ ...prev, [flow.flowId]: data.variable_tested! }));
            }

            setVariants((prev) => ({
              ...prev,
              [e.messageId]: {
                variant_subject: data.variant_subject || '',
                variant_preview: data.variant_preview || '',
                variable_tested: data.variable_tested || null,
                hypothesis: data.hypothesis || null,
                generating: false,
              },
            }));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate variant');
            setVariants((prev) => ({
              ...prev,
              [e.messageId]: { ...(prev[e.messageId] || emptyVariant()), generating: false },
            }));
          }
        }
      } finally {
        setBulkGenerating(false);
        setBulkGeneratingFlowId(null);
      }
    },
    [generateVariantForEmail]
  );

  // Every row that currently has a variant filled in, across all active flows
  const filledRows = useMemo(() => {
    const rows: Array<{ flow: LiveFlow; email: FlowEmail; v: VariantState }> = [];
    for (const f of activeFlows) {
      for (const e of f.emails) {
        const v = variants[e.messageId];
        if (v && (v.variant_subject || '').trim().length > 0) {
          rows.push({ flow: f, email: e, v });
        }
      }
    }
    return rows;
  }, [activeFlows, variants]);

  const totalEmails = useMemo(
    () => activeFlows.reduce((sum, f) => sum + f.emails.length, 0),
    [activeFlows]
  );

  const saveBatch = useCallback(async () => {
    if (!selectedBrand || filledRows.length === 0) return;
    setSaving(true);
    try {
      let totalSaved = 0;
      const byFlow = new Map<string, { flow: LiveFlow; rows: typeof filledRows }>();
      for (const r of filledRows) {
        if (!byFlow.has(r.flow.flowId)) byFlow.set(r.flow.flowId, { flow: r.flow, rows: [] });
        byFlow.get(r.flow.flowId)!.rows.push(r);
      }

      for (const { flow, rows } of byFlow.values()) {
        const flowTheme = (flowThemes[flow.flowId] || '').trim();
        const saveRes = await fetch('/api/ab-tests', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            brandId: selectedBrand.id,
            flowId: flow.flowId,
            flowName: flow.flowName,
            hypothesis: flowTheme || undefined,
            tests: rows.map(({ email, v }) => ({
              flow_message_id: email.messageId,
              flow_message_label: email.messageLabel,
              original_subject: email.subject,
              original_preview: email.previewText,
              variant_subject: v.variant_subject,
              variant_preview: v.variant_preview,
              hypothesis: v.hypothesis,
            })),
          }),
        });
        const saveData = await saveRes.json();
        if (!saveRes.ok) throw new Error(saveData.error || 'Save failed');
        totalSaved += saveData.saved || rows.length;
      }

      toast.success(`Saved ${totalSaved} test${totalSaved === 1 ? '' : 's'}`);
      loadHistory(selectedBrand.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [selectedBrand, filledRows, flowThemes, loadHistory]);

  const exportDocx = useCallback(async () => {
    if (!selectedBrand || filledRows.length === 0) return;
    setExporting(true);
    try {
      const themeSummary = Object.entries(flowThemes)
        .filter(([, t]) => t && t.trim())
        .map(([flowId, t]) => {
          const f = activeFlows.find((x) => x.flowId === flowId);
          return f ? `${f.flowName}: ${t.trim()}` : null;
        })
        .filter(Boolean)
        .join(' · ');

      await exportABTestDocx({
        brandName: selectedBrand.name,
        createdAt: new Date().toISOString(),
        hypothesis: themeSummary || null,
        managerName: null,
        tests: filledRows.map(({ flow, email, v }) => ({
          flow_name: flow.flowName,
          flow_message_label: email.messageLabel,
          flow_message_id: email.messageId,
          hypothesis: v.hypothesis,
          original_subject: email.subject,
          original_preview: email.previewText,
          variant_subject: v.variant_subject,
          variant_preview: v.variant_preview,
        })),
      });
      toast.success('Downloaded DOCX');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [selectedBrand, filledRows, flowThemes, activeFlows]);

  const deleteBatch = useCallback(
    async (batchId: string) => {
      if (!selectedBrand) return;
      setDeletingBatchId(batchId);
      try {
        const res = await fetch(`/api/ab-tests?batchId=${batchId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Delete failed');
        toast.success(`Deleted ${data.deleted} test${data.deleted === 1 ? '' : 's'}`);
        setDeleteConfirmBatchId(null);
        loadHistory(selectedBrand.id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Delete failed');
      } finally {
        setDeletingBatchId(null);
      }
    },
    [selectedBrand, loadHistory]
  );

  const reExportBatch = useCallback(
    async (batch: HistoryBatch) => {
      if (!selectedBrand) return;
      setReExportingBatchId(batch.batch_id);
      try {
        await exportABTestDocx({
          brandName: selectedBrand.name,
          createdAt: batch.created_at,
          hypothesis: batch.hypothesis,
          managerName: null,
          tests: batch.tests.map((t) => ({
            flow_name: t.flow_name,
            flow_message_label: t.flow_message_label,
            flow_message_id: t.flow_message_id,
            hypothesis: t.hypothesis,
            original_subject: t.original_subject,
            original_preview: t.original_preview,
            variant_subject: t.variant_subject,
            variant_preview: t.variant_preview,
          })),
        });
        toast.success('Downloaded DOCX');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Export failed');
      } finally {
        setReExportingBatchId(null);
      }
    },
    [selectedBrand]
  );

  if (authLoading) return <div className="p-10 text-[#555]">Loading…</div>;

  if (!allowed) {
    return (
      <div>
        <PageHeader title="A/B Tests" subtitle="Not authorized" />
        <Card className="p-6 mt-4 max-w-xl">
          <p className="text-sm text-[#888]">
            The A/B Tests tool is only available to Account Managers and Klaviyo Technicians.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="A/B Tests"
        subtitle="Pick a client, pick the flows you want to test, then generate subject line and preview text variants."
      />

      {/* Step 1: brand */}
      {!selectedBrand && (
        <div className="mt-8">
          <ClientSelectionPanel brands={brands} onSelect={setSelectedBrand} />
        </div>
      )}

      {selectedBrand && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="label-text">Client</p>
              <h2 className="text-2xl font-bold">{selectedBrand.name}</h2>
              <p className="text-xs text-[#666] mt-1">{selectedBrand.category || 'Uncategorised'}</p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedBrand(null);
                setFlows(null);
                setActiveFlows([]);
                setFlowPickerIds(new Set());
              }}
            >
              Change client
            </Button>
          </div>

          {/* Step 2: pull flows */}
          {!flows && (
            <Card className="p-6">
              <p className="text-sm text-[#888] mb-4">
                Pull every live flow from this client&apos;s Klaviyo account so you can pick one to test.
              </p>
              <Button onClick={pullFlows} disabled={loadingFlows}>
                {loadingFlows ? 'Pulling flows…' : 'Pull live flows'}
              </Button>
              {loadingFlows && (
                <p className="text-[12px] text-[#666] mt-3">This may take a moment.</p>
              )}
            </Card>
          )}

          {/* Step 3: pick one or more flows */}
          {flows && flows.length > 0 && activeFlows.length === 0 && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider">
                  Pick flows to test ({flows.length} available)
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setFlowPickerIds(
                        flowPickerIds.size === flows.length ? new Set() : new Set(flows.map((f) => f.flowId))
                      )
                    }
                  >
                    {flowPickerIds.size === flows.length ? 'Deselect all' : 'Select all'}
                  </Button>
                  <Button variant="secondary" onClick={pullFlows} disabled={loadingFlows}>
                    {loadingFlows ? 'Refreshing…' : 'Refresh'}
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                {flows.map((f) => {
                  const selected = flowPickerIds.has(f.flowId);
                  return (
                    <button
                      key={f.flowId}
                      type="button"
                      onClick={() =>
                        setFlowPickerIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(f.flowId)) next.delete(f.flowId);
                          else next.add(f.flowId);
                          return next;
                        })
                      }
                      className={`text-left p-4 rounded-lg border transition-all ${
                        selected
                          ? 'border-white bg-white text-black shadow-[0_0_12px_rgba(255,255,255,0.1)]'
                          : 'border-white/[0.06] bg-[#0f0f0f] text-white hover:border-white/20 hover:bg-white/[0.02]'
                      }`}
                    >
                      <p className={`text-sm font-semibold ${selected ? 'text-black' : 'text-white'}`}>
                        {f.flowName}
                      </p>
                      <p className={`text-[11px] mt-1 ${selected ? 'text-black/60' : 'text-[#666]'}`}>
                        {f.emails.length} email{f.emails.length === 1 ? '' : 's'} · {f.triggerType}
                      </p>
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-[12px] text-[#666]">
                  {flowPickerIds.size} of {flows.length} flows selected
                </p>
                <Button
                  onClick={() => {
                    const chosen = flows.filter((f) => flowPickerIds.has(f.flowId));
                    if (chosen.length === 0) {
                      toast.error('Pick at least one flow');
                      return;
                    }
                    setActiveFlows(chosen);
                  }}
                  disabled={flowPickerIds.size === 0}
                >
                  Continue with {flowPickerIds.size} flow{flowPickerIds.size === 1 ? '' : 's'}
                </Button>
              </div>
            </Card>
          )}

          {/* Step 4: editable tables for every active flow */}
          {activeFlows.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="label-text">Flows</p>
                  <h3 className="text-xl font-bold">
                    {activeFlows.length} flow{activeFlows.length === 1 ? '' : 's'} · {totalEmails} email{totalEmails === 1 ? '' : 's'}
                  </h3>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setActiveFlows([]);
                    setFlowPickerIds(new Set());
                  }}
                >
                  Change flows
                </Button>
              </div>

              {activeFlows.map((flow) => {
                const theme = flowThemes[flow.flowId] || '';
                const suggesting = suggestingThemeFor === flow.flowId;
                const thisFlowBulk = bulkGeneratingFlowId === flow.flowId;
                return (
                  <div key={flow.flowId} className="space-y-3">
                    <div className="flex items-baseline justify-between flex-wrap gap-2">
                      <h4 className="text-base font-bold text-white">{flow.flowName}</h4>
                      <span className="text-[10px] uppercase tracking-wider text-[#666]">
                        {flow.emails.length} email{flow.emails.length === 1 ? '' : 's'} · {flow.triggerType}
                      </span>
                    </div>

                    {/* What are you testing? — per flow */}
                    <Card className="p-4">
                      <label className="label-text block mb-2">What are you testing in this flow?</label>
                      <textarea
                        value={theme}
                        onChange={(e) =>
                          setFlowThemes((prev) => ({ ...prev, [flow.flowId]: e.target.value }))
                        }
                        rows={2}
                        placeholder="e.g. first name personalization, urgency, curiosity vs clarity"
                        className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-sm"
                      />
                      <p className="text-[11px] text-[#555] mt-1">
                        Every email in this flow will test the same variable so results are comparable.
                      </p>
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        <Button
                          variant="secondary"
                          onClick={() => suggestThemeForFlow(flow)}
                          disabled={suggesting || thisFlowBulk}
                        >
                          {suggesting ? 'Thinking…' : 'Suggest with AI'}
                        </Button>
                        <Button
                          onClick={() => generateAllForFlow(flow)}
                          disabled={thisFlowBulk || suggesting}
                        >
                          {thisFlowBulk
                            ? 'Generating…'
                            : `Generate variants (${flow.emails.length})`}
                        </Button>
                      </div>
                    </Card>

                    {/* Emails: table on desktop, stacked cards on mobile */}
                    <Card className="p-0 overflow-hidden">
                      {/* Desktop table (md and up) */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-white/[0.06] bg-[#0a0a0a]">
                              <th className="text-left text-[10px] uppercase tracking-wider text-[#666] font-bold p-3">Email</th>
                              <th className="text-left text-[10px] uppercase tracking-wider text-[#666] font-bold p-3">Variant A (Control)</th>
                              <th className="text-left text-[10px] uppercase tracking-wider text-[#666] font-bold p-3">Variant B (Challenger)</th>
                              <th className="text-right text-[10px] uppercase tracking-wider text-[#666] font-bold p-3">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {flow.emails.map((email) => {
                              const v = variants[email.messageId] || emptyVariant();
                              return (
                                <tr key={email.messageId} className="border-b border-white/[0.04] align-top">
                                  <td className="p-3 w-[14%] min-w-[120px]">
                                    <p className="text-[11px] text-[#666] uppercase tracking-wider">Email {email.position}</p>
                                    {email.messageLabel && (
                                      <p className="text-[11px] text-[#888] mt-1">{email.messageLabel}</p>
                                    )}
                                  </td>
                                  <td className="p-3 w-[36%]">
                                    <p className="text-[11px] text-[#555] uppercase tracking-wider">Subject</p>
                                    <p className="text-[13px] text-white mb-2">
                                      {email.subject || <span className="text-[#555]">(empty)</span>}
                                    </p>
                                    <p className="text-[11px] text-[#555] uppercase tracking-wider">Preview</p>
                                    <p className="text-[12px] text-[#aaa]">
                                      {email.previewText || <span className="text-[#555]">(empty)</span>}
                                    </p>
                                  </td>
                                  <td className="p-3 w-[36%]">
                                    <p className="text-[11px] text-[#555] uppercase tracking-wider">Subject</p>
                                    <input
                                      type="text"
                                      value={v.variant_subject}
                                      onChange={(e) =>
                                        setVariants((prev) => ({
                                          ...prev,
                                          [email.messageId]: {
                                            ...(prev[email.messageId] || emptyVariant()),
                                            variant_subject: e.target.value,
                                          },
                                        }))
                                      }
                                      placeholder="(empty - click AI to generate)"
                                      className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-md px-2 py-1.5 text-[13px] mb-2"
                                    />
                                    <p className="text-[11px] text-[#555] uppercase tracking-wider">Preview</p>
                                    <input
                                      type="text"
                                      value={v.variant_preview}
                                      onChange={(e) =>
                                        setVariants((prev) => ({
                                          ...prev,
                                          [email.messageId]: {
                                            ...(prev[email.messageId] || emptyVariant()),
                                            variant_preview: e.target.value,
                                          },
                                        }))
                                      }
                                      placeholder=""
                                      className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-md px-2 py-1.5 text-[12px]"
                                    />
                                    {v.variable_tested && (
                                      <p className="text-[10px] text-[#666] mt-2">
                                        Testing: <span className="text-[#888]">{v.variable_tested}</span>
                                      </p>
                                    )}
                                    {v.hypothesis && (
                                      <p className="text-[10px] text-[#666] mt-1 italic">{v.hypothesis}</p>
                                    )}
                                  </td>
                                  <td className="p-3 w-[14%] text-right">
                                    <Button
                                      variant="secondary"
                                      onClick={() => generateVariantForEmail(flow, email)}
                                      disabled={v.generating || bulkGenerating}
                                    >
                                      {v.generating ? '…' : v.variant_subject ? 'Redo' : 'AI'}
                                    </Button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile stacked cards (below md) */}
                      <div className="md:hidden divide-y divide-white/[0.04]">
                        {flow.emails.map((email) => {
                          const v = variants[email.messageId] || emptyVariant();
                          return (
                            <div key={email.messageId} className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-[11px] text-[#666] uppercase tracking-wider">Email {email.position}</p>
                                  {email.messageLabel && (
                                    <p className="text-[11px] text-[#888] mt-0.5">{email.messageLabel}</p>
                                  )}
                                </div>
                                <Button
                                  variant="secondary"
                                  onClick={() => generateVariantForEmail(flow, email)}
                                  disabled={v.generating || bulkGenerating}
                                >
                                  {v.generating ? '…' : v.variant_subject ? 'Redo' : 'AI'}
                                </Button>
                              </div>

                              <div>
                                <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold">Variant A (Control)</p>
                                <p className="text-[11px] text-[#555] uppercase tracking-wider mt-2">Subject</p>
                                <p className="text-[13px] text-white">
                                  {email.subject || <span className="text-[#555]">(empty)</span>}
                                </p>
                                <p className="text-[11px] text-[#555] uppercase tracking-wider mt-2">Preview</p>
                                <p className="text-[12px] text-[#aaa]">
                                  {email.previewText || <span className="text-[#555]">(empty)</span>}
                                </p>
                              </div>

                              <div>
                                <p className="text-[10px] text-[#555] uppercase tracking-wider font-semibold">Variant B (Challenger)</p>
                                <p className="text-[11px] text-[#555] uppercase tracking-wider mt-2">Subject</p>
                                <input
                                  type="text"
                                  value={v.variant_subject}
                                  onChange={(e) =>
                                    setVariants((prev) => ({
                                      ...prev,
                                      [email.messageId]: {
                                        ...(prev[email.messageId] || emptyVariant()),
                                        variant_subject: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder="(empty - click ✨ to generate)"
                                  className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-md px-2 py-1.5 text-[13px] mt-1"
                                />
                                <p className="text-[11px] text-[#555] uppercase tracking-wider mt-2">Preview</p>
                                <input
                                  type="text"
                                  value={v.variant_preview}
                                  onChange={(e) =>
                                    setVariants((prev) => ({
                                      ...prev,
                                      [email.messageId]: {
                                        ...(prev[email.messageId] || emptyVariant()),
                                        variant_preview: e.target.value,
                                      },
                                    }))
                                  }
                                  placeholder=""
                                  className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-md px-2 py-1.5 text-[12px] mt-1"
                                />
                                {v.variable_tested && (
                                  <p className="text-[10px] text-[#666] mt-2">
                                    Testing: <span className="text-[#888]">{v.variable_tested}</span>
                                  </p>
                                )}
                                {v.hypothesis && (
                                  <p className="text-[10px] text-[#666] mt-1 italic">{v.hypothesis}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                );
              })}

              <div className="flex items-center justify-between flex-wrap gap-3">
                <p className="text-[12px] text-[#666]">
                  {filledRows.length} of {totalEmails} variants ready
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    variant="secondary"
                    onClick={saveBatch}
                    disabled={filledRows.length === 0 || saving}
                  >
                    {saving ? 'Saving…' : `Save (${filledRows.length})`}
                  </Button>
                  <Button onClick={exportDocx} disabled={filledRows.length === 0 || exporting}>
                    {exporting ? 'Exporting…' : `Export to DOCX (${filledRows.length})`}
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* History — past A/B test batches for this brand */}
          {history !== null && (
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-sm font-bold uppercase tracking-wider">Past A/B tests</h3>
                <span className="text-[10px] uppercase tracking-wider text-[#666]">
                  {history.length} run{history.length === 1 ? '' : 's'}
                </span>
              </div>
              {loadingHistory ? (
                <p className="text-[12px] text-[#555]">Loading…</p>
              ) : history.length === 0 ? (
                <p className="text-[12px] text-[#555]">No A/B tests exported for this client yet.</p>
              ) : (
                <div className="space-y-2">
                  {history.map((batch) => {
                    const flowNames = Array.from(new Set(batch.tests.map((t) => t.flow_name)));
                    const date = new Date(batch.created_at).toLocaleDateString('en-AU', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    });
                    const confirming = deleteConfirmBatchId === batch.batch_id;
                    const deleting = deletingBatchId === batch.batch_id;
                    return (
                      <div
                        key={batch.batch_id}
                        className="flex items-start justify-between gap-3 p-3 rounded-lg border border-white/[0.06] bg-[#0f0f0f]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-white font-semibold">
                            {flowNames.join(', ')}
                          </p>
                          <p className="text-[11px] text-[#666] mt-0.5">
                            {date} · {batch.num_tests} test{batch.num_tests === 1 ? '' : 's'}
                          </p>
                          {batch.hypothesis && (
                            <p className="text-[11px] text-[#888] mt-1 italic">{batch.hypothesis}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {confirming ? (
                            <>
                              <Button
                                variant="danger"
                                onClick={() => deleteBatch(batch.batch_id)}
                                disabled={deleting}
                              >
                                {deleting ? 'Deleting…' : 'Confirm delete'}
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => setDeleteConfirmBatchId(null)}
                                disabled={deleting}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                onClick={() => reExportBatch(batch)}
                                disabled={reExportingBatchId === batch.batch_id}
                              >
                                {reExportingBatchId === batch.batch_id ? 'Exporting…' : 'Export DOCX'}
                              </Button>
                              <Button
                                variant="danger"
                                onClick={() => setDeleteConfirmBatchId(batch.batch_id)}
                              >
                                Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
