'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';
import { Brand, FlowBriefEmail } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { ReportSkeleton } from '@/components/ui/skeleton';
import { createFlowBrief } from '@/lib/db';
import toast from 'react-hot-toast';

type Step = 'brand' | 'details' | 'review';

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const FLOW_TYPE_OPTIONS = [
  { value: 'welcome', label: 'Welcome Flow' },
  { value: 'abandoned_cart', label: 'Abandoned Cart' },
  { value: 'browse_abandonment', label: 'Browse Abandonment' },
  { value: 'post_purchase', label: 'Post-Purchase' },
  { value: 'winback', label: 'Winback' },
  { value: 'sunset', label: 'Sunset / Re-engagement' },
  { value: 'vip', label: 'VIP / Repeat Buyer' },
  { value: 'back_in_stock', label: 'Back in Stock' },
  { value: 'review_request', label: 'Review Request' },
  { value: 'birthday', label: 'Birthday / Anniversary' },
  { value: 'custom', label: 'Custom Flow' },
];

export default function NewFlowBriefPage() {
  const { brands, managers, selectedPod } = useApp();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledBrandId = searchParams.get('brandId');

  const [step, setStep] = useState<Step>('brand');
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);

  const [flowType, setFlowType] = useState('welcome');
  const [flowName, setFlowName] = useState('');
  const [emailCount, setEmailCount] = useState(4);
  const [triggerDescription, setTriggerDescription] = useState('');
  const [purpose, setPurpose] = useState('');
  const [summary, setSummary] = useState('');
  const [dueDate, setDueDate] = useState<string>(todayPlus(7));
  const [sourceNotes, setSourceNotes] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [parsingFile, setParsingFile] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generatedEmails, setGeneratedEmails] = useState<FlowBriefEmail[] | null>(null);
  const [resolvedTrigger, setResolvedTrigger] = useState('');
  const [saving, setSaving] = useState(false);

  // Pre-select a brand if we arrived from the Create page
  useEffect(() => {
    if (!prefilledBrandId || selectedBrand) return;
    const b = brands.find((x) => x.id === prefilledBrandId);
    if (b) {
      setSelectedBrand(b);
      setStep('details');
    }
  }, [prefilledBrandId, brands, selectedBrand]);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    const isText = lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv');

    setParsingFile(true);
    try {
      let extracted = '';
      if (isText) {
        extracted = await file.text();
      } else {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/parse-document', { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Parse failed');
        extracted = data.text;
      }
      setSourceNotes((prev) => {
        if (prev && extracted) return `${prev}\n\n---\n\n${extracted}`;
        return extracted;
      });
      setUploadedFileName(file.name);
      toast.success(`Parsed ${file.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setParsingFile(false);
      e.target.value = '';
    }
  };

  const handleGenerate = async () => {
    if (!selectedBrand) return;
    if (!flowName.trim()) {
      toast.error('Flow name required');
      return;
    }
    setGenerating(true);
    setGeneratedEmails(null);
    try {
      const res = await fetch('/api/flow-briefs/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrand.id,
          flowType,
          flowName: flowName.trim(),
          emailCount,
          triggerDescription: triggerDescription.trim(),
          purpose: purpose.trim(),
          summary: summary.trim(),
          sourceNotes: sourceNotes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setGeneratedEmails(data.emails);
      setResolvedTrigger(data.trigger_description || triggerDescription);
      setStep('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!selectedBrand || !generatedEmails) return;
    setSaving(true);
    try {
      const saved = await createFlowBrief({
        brand_id: selectedBrand.id,
        manager_id: selectedBrand.manager_id || null,
        name: flowName.trim(),
        flow_type: flowType,
        trigger_description: resolvedTrigger || triggerDescription,
        purpose: purpose.trim(),
        summary: summary.trim(),
        due_date: dueDate || null,
        source_notes: sourceNotes,
        emails: generatedEmails,
        status: 'draft',
      });
      toast.success('Flow brief saved');
      router.push(`/flow-briefs/${saved.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  void user; // reserved for manager attribution later

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="NEW FLOW BRIEF"
        subtitle="Build a Klaviyo flow plan email-by-email with AI"
        actions={
          <Button variant="secondary" size="sm" onClick={() => router.push('/flow-briefs')}>
            ← Back
          </Button>
        }
      />

      {/* Step 1: Brand picker */}
      {step === 'brand' && (
        <div className="space-y-6">
          <p className="label-text">1. Select client</p>
          {groupedByManager.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-[#555] text-sm">No clients in this pod.</p>
            </Card>
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
                        setStep('details');
                      }}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Step 2: Details + generate */}
      {step === 'details' && selectedBrand && (
        <div className="space-y-6">
          {/* Brand header */}
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
                setStep('brand');
              }}
            >
              ← Change client
            </Button>
          </Card>

          <Card className="p-6 space-y-5">
            <div>
              <p className="label-text mb-3">2. Flow details</p>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                Flow type
              </label>
              <select
                value={flowType}
                onChange={(e) => setFlowType(e.target.value)}
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white cursor-pointer"
              >
                {FLOW_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#0A0A0A] text-white">
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                Flow name
              </label>
              <input
                type="text"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                placeholder="e.g. Welcome Flow v2 — Spring 2026"
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white placeholder:text-[#444]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                Number of emails
              </label>
              <div className="flex items-center gap-2">
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setEmailCount(n)}
                    className={`chip-press w-10 h-10 rounded-xl text-[12px] font-semibold transition-colors ${
                      emailCount === n
                        ? 'bg-white text-black'
                        : 'bg-white/[0.03] border border-white/[0.08] text-[#888] hover:text-white'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                What triggers the flow
              </label>
              <input
                type="text"
                value={triggerDescription}
                onChange={(e) => setTriggerDescription(e.target.value)}
                placeholder="e.g. Added to Newsletter list · Checkout Started · Placed Order"
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white placeholder:text-[#444]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                Purpose of the flow
              </label>
              <input
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. Convert cold subscribers into first-time buyers with a warm onboarding sequence"
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white placeholder:text-[#444]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                Summary (2-3 sentences)
              </label>
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Short summary of what this flow is about, who it targets, and the strategy behind it."
                rows={3}
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white placeholder:text-[#444] resize-y min-h-[80px]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                Due date (when the build should land in the design queue)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-polish w-full max-w-xs bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] uppercase tracking-wider text-[#666]">
                  Call notes or context (optional)
                </label>
                <label className="text-[10px] text-[#888] hover:text-white cursor-pointer transition-colors">
                  {parsingFile ? 'Parsing…' : '+ Upload file'}
                  <input
                    type="file"
                    accept=".txt,.md,.csv,.pdf,.docx"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={parsingFile}
                  />
                </label>
              </div>
              {uploadedFileName && (
                <p className="text-[10px] text-green-400 mb-1.5">✓ {uploadedFileName} parsed</p>
              )}
              <textarea
                value={sourceNotes}
                onChange={(e) => setSourceNotes(e.target.value)}
                placeholder="Paste call notes, a transcript, or any context. Claude will extract the goals, products mentioned, and constraints."
                rows={6}
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white placeholder:text-[#444] resize-y min-h-[120px]"
              />
            </div>

            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : `Generate ${emailCount}-email flow`}
            </Button>
            {generating && (
              <p className="text-[11px] text-[#555]">
                Claude is designing the flow. This may take up to a minute.
              </p>
            )}
          </Card>

          {generating && (
            <div className="animate-fade">
              <ReportSkeleton />
            </div>
          )}
        </div>
      )}

      {/* Step 3: Review + save */}
      {step === 'review' && selectedBrand && generatedEmails && (
        <div className="space-y-6">
          <Card className="p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-[#666]">Preview</p>
              <p className="text-sm font-semibold text-white">{flowName}</p>
              <p className="text-[10px] text-[#555] mt-1">{resolvedTrigger}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStep('details')}>
                ← Edit details
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save flow brief'}
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <p className="label-text mb-4">3. Review flow plan</p>
            <div className="space-y-4">
              {generatedEmails.map((email, i) => (
                <div
                  key={i}
                  className="relative pl-6 pb-4"
                  style={{
                    borderLeft: i < generatedEmails.length - 1 ? '1px dashed rgba(255,255,255,0.12)' : 'none',
                  }}
                >
                  <div className="absolute left-0 top-0 -translate-x-1/2 w-3 h-3 rounded-full bg-white" />
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 ml-2">
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <p className="text-[11px] font-semibold text-white">{email.label}</p>
                      <span className="text-[9px] text-[#888] uppercase tracking-wider">
                        {email.send_delay}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#aaa] italic mb-3">{email.goal}</p>
                    <div className="space-y-2 mb-3">
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-[#666] mb-0.5">Subject</p>
                        <p className="text-[12px] text-white">{email.subject}</p>
                      </div>
                      <div>
                        <p className="text-[8px] uppercase tracking-wider text-[#666] mb-0.5">Preview</p>
                        <p className="text-[11px] text-[#ccc]">{email.preview_text}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-[#666] mb-1">Body outline</p>
                      <ul className="space-y-1">
                        {email.body_outline.map((line, j) => (
                          <li key={j} className="text-[11px] text-[#bbb] flex gap-2">
                            <span className="text-[#555]">→</span>
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
