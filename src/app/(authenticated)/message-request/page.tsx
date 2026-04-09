'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { Brand, BriefType } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { ReportSkeleton } from '@/components/ui/skeleton';
import toast from 'react-hot-toast';

type Step = 'brand' | 'details';

type MessageType = 'campaign' | 'campaign_plain_text' | 'campaign_sms';

const MESSAGE_TYPES: Array<{ value: MessageType; label: string; icon: string; description: string }> = [
  { value: 'campaign', label: 'Designed Campaign', icon: '📧', description: 'Full designed email with hero, body, and product sections' },
  { value: 'campaign_plain_text', label: 'Text-based Campaign', icon: '✍️', description: 'Plain text / founder-style email' },
  { value: 'campaign_sms', label: 'SMS Campaign', icon: '💬', description: 'SMS message to subscribers' },
];

type Urgency = 'asap' | 'scheduled';

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function MessageRequestPage() {
  const { brands, managers, selectedPod } = useApp();
  const router = useRouter();

  const [step, setStep] = useState<Step>('brand');
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [messageType, setMessageType] = useState<MessageType>('campaign');
  const [pastedMessage, setPastedMessage] = useState('');
  const [title, setTitle] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('scheduled');
  const [scheduledDate, setScheduledDate] = useState<string>(todayPlus(7));
  const [generating, setGenerating] = useState(false);

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
    if (!pastedMessage.trim()) {
      toast.error('Paste the client message first');
      return;
    }
    if (!title.trim()) {
      toast.error('Give the brief a name');
      return;
    }
    if (urgency === 'scheduled' && !scheduledDate) {
      toast.error('Pick a send date');
      return;
    }

    setGenerating(true);
    try {
      // The pasted client message is the literal source of truth for what
      // goes in the brief. Claude is normally allowed to use its reasoning
      // engine to pick a framework and section count, but for message
      // requests we need it to MATCH the client's stated scope exactly —
      // if the client said "hero only", the brief has a hero only.
      const direction = [
        '=== CLIENT MESSAGE (LITERAL SOURCE OF TRUTH) ===',
        pastedMessage.trim(),
        '=== END CLIENT MESSAGE ===',
        '',
        'BRIEF RULES — THESE OVERRIDE YOUR DEFAULT REASONING ENGINE:',
        '',
        '1. The client message above is the EXACT scope of this brief. Do not add sections the client did not ask for.',
        '2. If the client said "hero only" or "just a hero section" or "one-section email" — produce a brief with ONLY a hero. No body, no product grid, no CTA row, nothing else.',
        '3. If the client specified a section count (e.g. "3 sections", "two blocks"), match it exactly.',
        '4. If the client listed specific sections by name (e.g. "hero, one product, CTA"), output exactly those sections in that order — nothing more, nothing less.',
        '5. If the client only mentioned ONE specific product/collection/offer, the brief is about that ONE thing. Do not pad with unrelated products.',
        '6. If the client gave vague direction (e.g. "send something about spring"), THEN and only then use your normal framework logic to flesh it out.',
        '7. Ignore your normal "minimum sections per framework" rule for this brief. The client overrides it.',
        '',
        "Read the client message carefully. Count the things they actually asked for. Build a brief for exactly that — not more, not less.",
      ].join('\n');

      const formData = {
        title: title.trim(),
        brief: direction,
        framework: 'Auto',
        // When urgency is ASAP we flag it as a last-minute design priority so
        // the design queue treats it correctly.
        designPriority: (urgency === 'asap' ? 'last_minute' : 'calendar') as
          | 'last_minute'
          | 'calendar',
        sendDate: urgency === 'scheduled' ? scheduledDate : '',
      };

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: messageType as BriefType,
          formData,
          brand: selectedBrand,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();
      if (!data.briefId) throw new Error('Brief saved but no id returned');

      toast.success('Brief generated and added to design queue');
      router.push(`/briefs/${data.briefId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate brief');
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="MESSAGE REQUEST"
        subtitle="Turn a pasted client message into a proper brief in the design queue"
      />

      {/* Step 1: Brand */}
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

      {/* Step 2: Details */}
      {step === 'details' && selectedBrand && (
        <div className="space-y-6">
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
            <p className="label-text">2. Request details</p>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-2">
                Type of email
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {MESSAGE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setMessageType(t.value)}
                    className={`chip-press flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                      messageType === t.value
                        ? 'bg-white/[0.06] border border-white/20'
                        : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/12'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.04] flex items-center justify-center flex-shrink-0">
                      <span className="text-sm">{t.icon}</span>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold text-white">{t.label}</p>
                      <p className="text-[9px] text-[#555] mt-0.5 leading-snug">{t.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                Brief name
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Spring drop follow-up"
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white placeholder:text-[#444]"
              />
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                Paste the client message
              </label>
              <textarea
                value={pastedMessage}
                onChange={(e) => setPastedMessage(e.target.value)}
                placeholder={`Hey team, can we send out an email this week pushing our Spring collection? We want to focus on the new linen shirts and mention the free shipping over $100...`}
                rows={8}
                className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-[12px] text-white placeholder:text-[#444] resize-y min-h-[160px]"
              />
              <p className="text-[9px] text-[#555] mt-1.5">
                Paste exactly what the client said. Claude will figure out the ask and turn it into a proper brief.
              </p>
            </div>

            <div>
              <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-2">
                Urgency
              </label>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => setUrgency('asap')}
                  className={`chip-press px-4 py-3 rounded-xl text-[11px] uppercase tracking-wider font-semibold transition-colors min-h-[44px] ${
                    urgency === 'asap'
                      ? 'bg-red-500/20 border border-red-500/40 text-red-400'
                      : 'bg-white/[0.03] border border-white/[0.08] text-[#888] hover:text-white'
                  }`}
                >
                  ASAP
                </button>
                <button
                  type="button"
                  onClick={() => setUrgency('scheduled')}
                  className={`chip-press px-4 py-3 rounded-xl text-[11px] uppercase tracking-wider font-semibold transition-colors min-h-[44px] ${
                    urgency === 'scheduled'
                      ? 'bg-white text-black'
                      : 'bg-white/[0.03] border border-white/[0.08] text-[#888] hover:text-white'
                  }`}
                >
                  Scheduled
                </button>
              </div>
              {urgency === 'scheduled' && (
                <div className="animate-fade">
                  <label className="block text-[10px] uppercase tracking-wider text-[#666] mb-1.5">
                    Send date
                  </label>
                  <input
                    type="date"
                    value={scheduledDate}
                    min={todayISO()}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    className="input-polish w-full max-w-xs bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white"
                  />
                </div>
              )}
              {urgency === 'asap' && (
                <p className="text-[10px] text-red-400/80 mt-1 animate-fade">
                  This request will be flagged as a last-minute design priority.
                </p>
              )}
            </div>

            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate brief'}
            </Button>
            {generating && (
              <p className="text-[11px] text-[#555]">
                Claude is writing the brief. It will land in the design queue when done.
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
    </div>
  );
}
