'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { BriefType, CreateFormData } from '@/lib/types';
import { BRIEF_TYPES, EMAIL_FACTS } from '@/lib/constants';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { FORM_COMPONENTS } from '@/components/create/brief-forms';
import toast from 'react-hot-toast';
import { BriefTable } from '@/components/brief-table';
import { exportBriefAsDocx } from '@/lib/export-docx';
import { updateBriefSLPT } from '@/lib/db';

import { Brand } from '@/lib/types';

function ClientSelectionByManager({
  brands,
  onSelect,
}: {
  brands: Brand[];
  onSelect: (brand: Brand) => void;
}) {
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
              return (
                <BrandCard
                  key={brand.id}
                  brand={brand}
                  onClick={() => onSelect(brand)}
                  showEdit={false}
                  showMenu={false}
                  animDelay={idx * 30}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedClient, setSelectedClient, podBrands, selectedPod } = useApp();

  const [selectedType, setSelectedType] = useState<BriefType | null>(
    (searchParams.get('type') as BriefType) || null
  );
  const [formData, setFormData] = useState<CreateFormData>({
    title: '', brief: searchParams.get('direction') ? decodeURIComponent(searchParams.get('direction')!) : '',
  });
  const [generating, setGenerating] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [factIndex, setFactIndex] = useState(0);

  // Reset page state when nav link is clicked while already on this page
  useEffect(() => {
    const handler = () => {
      setSelectedClient(null);
      setSelectedType(null);
      setOutput(null);
      setFormData({ title: '', brief: '' });
    };
    window.addEventListener('nav-reset', handler);
    return () => window.removeEventListener('nav-reset', handler);
  }, [setSelectedClient]);
  const [progress, setProgress] = useState(0);
  const [subjectLine, setSubjectLine] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [suggestingSLPT, setSuggestingSLPT] = useState(false);
  const [savingSLPT, setSavingSLPT] = useState(false);
  const [slptSaved, setSlptSaved] = useState(false);
  const [generatedBriefId, setGeneratedBriefId] = useState<string | null>(null);

  // Rotate facts during generation
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(() => {
      setFactIndex(prev => {
        let next: number;
        do { next = Math.floor(Math.random() * EMAIL_FACTS.length); } while (next === prev && EMAIL_FACTS.length > 1);
        return next;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, [generating]);

  // Animate progress bar
  useEffect(() => {
    if (!generating) { setProgress(0); return; }
    const interval = setInterval(() => {
      setProgress(p => p < 90 ? p + Math.random() * 8 : p);
    }, 500);
    return () => clearInterval(interval);
  }, [generating]);

  const handleGenerate = async () => {
    if (!selectedClient || !selectedType) return;
    if (!formData.title || !formData.brief) {
      toast.error('Please fill in required fields');
      return;
    }

    setGenerating(true);
    setOutput(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: selectedType, formData, brand: selectedClient }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();
      setProgress(100);
      setTimeout(() => {
        setOutput(data.output);
        if (data.briefId) setGeneratedBriefId(data.briefId);

        // Auto-extract SL and PT from the new format (**SL:** ... **PT:** ...)
        const slMatch = data.output.match(/\*\*SL:\*\*\s*(.+)/);
        const ptMatch = data.output.match(/\*\*PT:\*\*\s*(.+)/);
        if (slMatch) setSubjectLine(slMatch[1].trim());
        if (ptMatch) setPreviewText(ptMatch[1].trim());

        setGenerating(false);
        toast.success('Brief generated');
      }, 500);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Generation failed');
      setGenerating(false);
    }
  };

  const handleSuggestSLPT = async () => {
    if (!selectedClient || !output) return;
    setSuggestingSLPT(true);
    try {
      const res = await fetch('/api/suggest-slpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefContent: output,
          brand: selectedClient,
          emailName: formData.title,
          isPlainText: selectedType === 'plain_text',
        }),
      });
      if (!res.ok) throw new Error('Failed to suggest');
      const data = await res.json();
      if (data.subjectLine) setSubjectLine(data.subjectLine);
      if (data.previewText) setPreviewText(data.previewText);
      toast.success('Suggestions generated');
    } catch {
      toast.error('Failed to generate suggestions');
    }
    setSuggestingSLPT(false);
  };

  const handleSaveSLPT = async () => {
    if (!generatedBriefId) {
      toast.error('No brief to save to');
      return;
    }
    setSavingSLPT(true);
    try {
      await updateBriefSLPT(generatedBriefId, subjectLine, previewText);
      setSlptSaved(true);
      toast.success('Subject line & preview text saved');
      setTimeout(() => setSlptSaved(false), 2000);
    } catch {
      toast.error('Failed to save');
    }
    setSavingSLPT(false);
  };

  // Step 0: Select a client
  if (!selectedClient) {
    return (
      <div>
        <PageHeader
          title="Create"
          subtitle={selectedPod ? `${selectedPod.name} — Select a client` : 'Select a pod first'}
        />
        {podBrands.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-12 h-12 rounded-full border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
              <span className="text-[#555] text-lg">◆</span>
            </div>
            <p className="text-[#444] text-sm mb-4">No clients in this pod yet.</p>
            <Button variant="secondary" onClick={() => router.push('/clients/new')}>Add Client</Button>
          </div>
        ) : (
          <ClientSelectionByManager brands={podBrands} onSelect={setSelectedClient} />
        )}
      </div>
    );
  }

  // Loading screen
  if (generating) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-full max-w-md text-center animate-fade-in">
          <div className="w-14 h-14 rounded-full border border-white/[0.06] flex items-center justify-center mx-auto mb-6">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
          <h2 className="heading text-xl mb-8 text-white/80">GENERATING...</h2>
          <div className="w-full bg-white/[0.04] rounded-full h-[3px] mb-8 overflow-hidden">
            <div
              className="bg-gradient-to-r from-white/40 to-white h-[3px] rounded-full transition-all duration-700 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[#444] text-xs transition-opacity duration-500 italic" key={factIndex}>
            {EMAIL_FACTS[factIndex]}
          </p>
        </div>
      </div>
    );
  }

  // Output view
  if (output) {
    return (
      <div>
        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 justify-end mb-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const url = generatedBriefId
                ? `${window.location.origin}/briefs/${generatedBriefId}`
                : window.location.href;
              navigator.clipboard.writeText(url);
              toast.success('Link copied');
            }}
          >
            Copy Link
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              exportBriefAsDocx(
                formData.title || 'brief',
                selectedClient.name,
                selectedClient.category || '',
                BRIEF_TYPES.find(t => t.value === selectedType)?.label || '',
                output,
              );
              toast.success('Downloading .docx');
            }}
          >
            Export .docx
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setOutput(null);
              setSubjectLine('');
              setPreviewText('');
              setGeneratedBriefId(null);
              setSlptSaved(false);
              setFormData({ title: '', brief: '' });
              setSelectedType(null);
            }}
          >
            Generate New Brief
          </Button>
        </div>

        {/* Title below buttons */}
        <div className="mb-6">
          <h1 className="heading text-2xl text-white">{formData.title || 'Generated Brief'}</h1>
          <p className="text-[#555] text-sm mt-1">{selectedClient.name} — {BRIEF_TYPES.find(t => t.value === selectedType)?.label}</p>
        </div>
        {selectedType === 'strategy' && (
          <div className="mb-4">
            <span className="inline-flex items-center gap-2 bg-[#10B981]/20 text-[#10B981] px-3 py-1 rounded-full text-xs uppercase tracking-wider font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
              Saved to Pending
            </span>
          </div>
        )}

        {/* Subject Line & Preview Text */}
        {selectedType !== 'strategy' && selectedType !== 'sms' && (() => {
          const isPlainText = selectedType?.includes('plain_text') || selectedType === 'plain_text';
          return (
            <Card padding="lg" className="mb-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <p className="label-text">{isPlainText ? 'Subject Line' : 'Subject Line & Preview Text'}</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSuggestSLPT}
                    loading={suggestingSLPT}
                  >
                    ✨ AI Suggest
                  </Button>
                  <Button
                    variant={slptSaved ? 'primary' : 'secondary'}
                    size="sm"
                    onClick={handleSaveSLPT}
                    loading={savingSLPT}
                    className={slptSaved ? 'bg-[#10B981] text-white hover:bg-[#10B981]' : ''}
                  >
                    {slptSaved ? 'Saved' : 'Save'}
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[9px] text-[#555] uppercase tracking-wider font-medium">Subject</span>
                  </div>
                  <input
                    type="text"
                    value={subjectLine}
                    onChange={e => setSubjectLine(e.target.value)}
                    placeholder={isPlainText ? 'e.g. a quick note from the founder' : 'Add subject line...'}
                    className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#333] focus:outline-none focus:border-white/20 transition-colors"
                  />
                </div>
                {!isPlainText && (
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[9px] text-[#555] uppercase tracking-wider font-medium">Preview</span>
                    </div>
                    <input
                      type="text"
                      value={previewText}
                      onChange={e => setPreviewText(e.target.value)}
                      placeholder="Add preview text..."
                      className="w-full bg-white/[0.03] border border-white/[0.06] rounded-lg px-4 py-2.5 text-sm text-white placeholder:text-[#333] focus:outline-none focus:border-white/20 transition-colors"
                    />
                  </div>
                )}
              </div>
              {isPlainText && (
                <p className="text-[9px] text-[#444] mt-2">Plain text emails don&apos;t use preview text. The greeting line auto-shows as the preview in Klaviyo.</p>
              )}
            </Card>
          );
        })()}

        <Card padding="lg">
          <BriefTable output={output} />
        </Card>
      </div>
    );
  }

  // Step 1: Type selection — grouped by category
  if (!selectedType) {
    const categoryOrder = ['campaigns', 'flows', 'strategy', 'testing'];
    const categoryLabels: Record<string, string> = {
      campaigns: 'Campaigns',
      flows: 'Flows',
      strategy: 'Strategy',
      testing: 'Testing',
    };
    // Hide the old text-based flow brief type from the Create UI. Flows are
    // now planned as a full sequence via the Flow Brief wizard, with an SMS
    // option alongside it. The underlying BriefType values stay in place so
    // any existing data keeps working.
    const HIDDEN_ON_CREATE: BriefType[] = ['flow_plain_text'];
    const typeGroups = categoryOrder.map(cat => ({
      label: categoryLabels[cat],
      types: BRIEF_TYPES
        .filter(t => t.category === cat)
        .filter(t => !HIDDEN_ON_CREATE.includes(t.value)),
    })).filter(g => g.types.length > 0);

    let animIndex = 0;

    return (
      <div>
        <PageHeader
          title="Create"
          subtitle={`What would you like to create for ${selectedClient.name}?`}
          actions={
            <Button variant="primary" size="sm" onClick={() => setSelectedClient(null)}>
              ← Change Client
            </Button>
          }
        />
        <div className="space-y-8">
          {typeGroups.map(group => (
            <div key={group.label}>
              {/* Group header */}
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-[11px] font-bold text-white uppercase tracking-[0.15em]">
                  {group.label}
                </h3>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>

              {/* Type cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {group.types.map(type => {
                  const idx = animIndex++;
                  // The 'Build Flow' card jumps into the dedicated flow brief
                  // wizard (which plans the whole sequence), not the single
                  // email form we used to show.
                  const isBuildFlow = type.value === 'flow';
                  const label = isBuildFlow ? 'Build Flow' : type.label;
                  const description = isBuildFlow
                    ? 'Plan a full multi-email Klaviyo flow with AI'
                    : type.description;
                  return (
                    <Card
                      key={type.value}
                      hoverable
                      padding="sm"
                      onClick={() => {
                        if (isBuildFlow) {
                          router.push(
                            `/flow-briefs/new?brandId=${encodeURIComponent(selectedClient.id)}`
                          );
                          return;
                        }
                        setSelectedType(type.value);
                      }}
                      className="animate-fade-in"
                      style={{ animationDelay: `${idx * 40}ms` } as React.CSSProperties}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-10 h-10 rounded-lg bg-white/[0.03] border border-white/[0.04] flex items-center justify-center flex-shrink-0">
                          <span className="text-xl">{isBuildFlow ? '🔀' : type.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold text-white uppercase tracking-wider">{label}</p>
                          <p className="text-[10px] text-[#444] mt-0.5 truncate">{description}</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Step 2: Form
  const FormComponent = FORM_COMPONENTS[selectedType];

  return (
    <div>
      <PageHeader
        title={BRIEF_TYPES.find(t => t.value === selectedType)?.label || 'Create'}
        subtitle={selectedClient.name}
        actions={
          <Button variant="primary" size="sm" onClick={() => { setSelectedType(null); setFormData({ title: '', brief: '' }); }}>
            ← Back
          </Button>
        }
      />
      <Card className="max-w-2xl">
        <FormComponent
          formData={formData}
          onChange={updates => setFormData(prev => ({ ...prev, ...updates }))}
          brand={selectedClient}
        />
        <div className="mt-6 flex justify-end">
          <Button onClick={handleGenerate}>
            Generate {selectedType === 'strategy' ? 'Strategy' : 'Brief'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
