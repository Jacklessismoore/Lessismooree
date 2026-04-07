'use client';

import { useState, KeyboardEvent } from 'react';
import { Brand, Pod, Manager, Designer, AnalysisResult } from '@/lib/types';
import { Input, Textarea, Select, Label } from '@/components/ui/form-fields';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import toast from 'react-hot-toast';

interface FormState {
  name: string;
  pod_id: string;
  manager_id: string;
  designer_id: string;
  location: string;
  category: string;
  founder: string;
  color: string;
  website: string;
  instagram: string;
  klaviyo_api_key: string;
  slack_channel_id: string;
  voice: string;
  rules: string;
  audiences: string[];
  products: string[];
  notes: string;
}

// ─── Tag Input Component ───
function TagInput({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [input, setInput] = useState('');

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  return (
    <div>
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map(tag => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 bg-white/10 text-white text-xs px-2 py-1 rounded"
          >
            {tag}
            <button
              onClick={() => onChange(tags.filter(t => t !== tag))}
              className="text-[#555] hover:text-white ml-0.5"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addTag}
        placeholder={placeholder}
        className="w-full bg-[#0E0E0E] border border-[#252525] rounded-md px-4 py-2.5 text-sm text-white placeholder:text-[#555] focus:outline-none focus:border-white transition-colors"
      />
    </div>
  );
}

// ─── Step 1: Basics (color picker removed) ───
export function BasicInfoStep({
  form,
  onChange,
  pods,
  managers,
  designers,
}: {
  form: FormState;
  onChange: (updates: Partial<FormState>) => void;
  pods: Pod[];
  managers: Manager[];
  designers: Designer[];
}) {
  return (
    <div className="space-y-4">
      <Input
        label="Client Name *"
        value={form.name}
        onChange={e => onChange({ name: e.target.value })}
        placeholder="e.g. Brand Name"
        required
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Select
          label="Pod"
          options={pods.map(p => ({ value: p.id, label: p.name }))}
          value={form.pod_id || ''}
          onChange={e => onChange({ pod_id: e.target.value })}
        />
        <Select
          label="Account Manager"
          options={managers.map(m => ({ value: m.id, label: m.name }))}
          value={form.manager_id || ''}
          onChange={e => onChange({ manager_id: e.target.value })}
        />
      </div>
      <Select
        label="Designer"
        options={designers.map(d => ({ value: d.id, label: d.name }))}
        value={form.designer_id || ''}
        onChange={e => onChange({ designer_id: e.target.value })}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Location"
          value={form.location}
          onChange={e => onChange({ location: e.target.value })}
          placeholder="e.g. Los Angeles, CA"
        />
        <Input
          label="Category *"
          value={form.category}
          onChange={e => onChange({ category: e.target.value })}
          placeholder="e.g. Skincare, Fashion"
          required
        />
      </div>
      <Input
        label="Founder"
        value={form.founder}
        onChange={e => onChange({ founder: e.target.value })}
        placeholder="Founder name"
      />
      <Input
        label="Klaviyo API Key"
        value={form.klaviyo_api_key}
        onChange={e => onChange({ klaviyo_api_key: e.target.value })}
        placeholder="pk_xxxxxxxxxxxxxxxx"
      />
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <label className="label-text block">Slack Channel ID</label>
          <span
            className="group relative inline-flex items-center justify-center w-4 h-4 rounded-full border border-white/20 text-[9px] text-[#888] cursor-help hover:border-white/40 hover:text-white transition-colors"
            aria-label="How to find Slack channel ID"
          >
            ?
            <span className="pointer-events-none absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-64 rounded-lg bg-[#111] border border-white/[0.08] px-3 py-2 text-[11px] leading-snug text-[#ccc] opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-xl text-left normal-case tracking-normal">
              <p className="font-semibold text-white mb-1.5">How to find the channel ID</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Open the external Slack channel</li>
                <li>Click the three dots in the top right</li>
                <li>Open channel details</li>
                <li>Scroll to the bottom to find the Channel ID</li>
              </ul>
            </span>
          </span>
        </div>
        <input
          value={form.slack_channel_id}
          onChange={e => onChange({ slack_channel_id: e.target.value })}
          placeholder="C0XXXXXXXXX"
          className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-sm text-white placeholder:text-[#444] focus:outline-none focus:border-white/20 focus:bg-white/[0.04] transition-all duration-200 ease-out"
        />
      </div>
    </div>
  );
}

// ─── Step 2: Voice & Rules (with website/Instagram + AI generate) ───
export function VoiceRulesStep({
  form,
  onChange,
  brandId,
}: {
  form: FormState;
  onChange: (updates: Partial<FormState>) => void;
  brandId?: string;
}) {
  const [generating, setGenerating] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [scrapedCount, setScrapedCount] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (!form.website && !form.instagram) {
      toast.error('Add a website URL or Instagram first');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/analyze-brand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          website: form.website,
          instagram: form.instagram,
          brandName: form.name,
        }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      const result: AnalysisResult = await res.json();

      onChange({
        voice: result.voice || form.voice,
        rules: result.rules || form.rules,
        audiences: result.audiences?.length > 0 ? result.audiences : form.audiences,
        products: result.products?.length > 0 ? result.products : form.products,
      });
      toast.success('Brand profile generated');
    } catch {
      toast.error('Failed to generate brand profile');
    }
    setGenerating(false);
  };

  return (
    <div className="space-y-4">
      {/* Website + Instagram URLs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Website URL"
          value={form.website}
          onChange={e => onChange({ website: e.target.value })}
          placeholder="https://brandname.com"
        />
        <Input
          label="Instagram"
          value={form.instagram}
          onChange={e => onChange({ instagram: e.target.value })}
          placeholder="@brandname or URL"
        />
      </div>

      {/* AI Generate Button */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={generating || (!form.website && !form.instagram)}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
      >
        <div className="w-8 h-8 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0 group-hover:bg-white/[0.06] transition-colors">
          {generating ? (
            <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <span className="text-sm">✨</span>
          )}
        </div>
        <div className="text-left">
          <p className="text-[11px] text-white font-medium">
            {generating ? 'Generating brand profile...' : 'Generate with AI'}
          </p>
          <p className="text-[8px] text-[#555] mt-0.5">
            {form.website || form.instagram
              ? 'Analyse website & Instagram to auto-fill voice, rules, audiences & products'
              : 'Add a website or Instagram above first'}
          </p>
        </div>
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-white/[0.04]" />
        <span className="text-[8px] text-[#444] uppercase tracking-wider">or fill manually</span>
        <div className="flex-1 h-px bg-white/[0.04]" />
      </div>

      {/* Manual fields */}
      <Textarea
        label="Brand Voice"
        value={form.voice}
        onChange={e => onChange({ voice: e.target.value })}
        placeholder="Describe the brand's voice, tone, and personality..."
        className="min-h-[120px]"
      />
      <Textarea
        label="Brand Rules"
        value={form.rules}
        onChange={e => onChange({ rules: e.target.value })}
        placeholder="Any copy rules, restrictions, or guidelines..."
        className="min-h-[120px]"
      />
      <TagInput
        label="Audiences"
        tags={form.audiences}
        onChange={audiences => onChange({ audiences })}
        placeholder="Type audience and press Enter..."
      />
      <TagInput
        label="Products"
        tags={form.products}
        onChange={products => onChange({ products })}
        placeholder="Type product/collection and press Enter..."
      />

      {/* Scrape Products from Shopify */}
      {form.website && (
        <button
          type="button"
          onClick={async () => {
            if (!form.website) return;
            setScraping(true);
            setScrapedCount(null);
            try {
              const res = await fetch('/api/scrape-products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ websiteUrl: form.website, brandId: brandId || 'temp' }),
              });
              if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Scraping failed');
              }
              const data = await res.json();
              setScrapedCount(data.count);

              // Add product titles to the tags
              const productNames = data.products.map((p: { title: string }) => p.title);
              const merged = [...new Set([...form.products, ...productNames])];
              onChange({ products: merged });
              toast.success(`${data.count} products scraped from Shopify`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Failed to scrape products');
            }
            setScraping(false);
          }}
          disabled={scraping}
          className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] transition-all disabled:opacity-30 disabled:cursor-not-allowed group"
        >
          <div className="w-8 h-8 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0">
            {scraping ? (
              <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <span className="text-sm">🛒</span>
            )}
          </div>
          <div className="text-left">
            <p className="text-[11px] text-white font-medium">
              {scraping ? 'Scraping products...' : 'Scrape Products from Shopify'}
            </p>
            <p className="text-[8px] text-[#555] mt-0.5">
              {scrapedCount !== null
                ? `${scrapedCount} products found`
                : 'Auto-pull all products from the Shopify store'}
            </p>
          </div>
        </button>
      )}
    </div>
  );
}

// ─── Step 3: Documents & Context (with AI onboarding notes) ───
// ─── Fathom Notetaker Upload ───
function FathomUpload({ form, onChange }: { form: FormState; onChange: (updates: Partial<FormState>) => void }) {
  const [fathomUrl, setFathomUrl] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyzeFathom = async () => {
    if (!fathomUrl.trim()) { toast.error('Paste a Fathom link first'); return; }
    setAnalyzing(true);
    try {
      // Fetch the Fathom page content
      const fetchRes = await fetch('/api/fetch-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: fathomUrl }),
      });
      const fetchData = await fetchRes.json();

      // Use the page title/content to extract client insights
      const analyzeRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Analyse this Fathom call transcript/notes page and extract any useful client information for an email marketing agency.

URL: ${fathomUrl}
Page title: ${fetchData.title || 'Unknown'}
${fetchData.html ? `Content preview: ${fetchData.html.slice(0, 3000)}` : ''}

Current client notes: ${form.notes || 'None'}
Current voice: ${form.voice || 'Not set'}
Current rules: ${form.rules || 'Not set'}

Extract any new information about:
- Brand voice, tone, or communication style mentioned in the call
- Specific rules or restrictions the client mentioned (things to avoid, requirements)
- New audience segments discussed
- Products or collections mentioned
- Action items or decisions made
- Any other relevant context for email marketing

Return ONLY a JSON object:
{
  "newNotes": "Concise summary of key takeaways from the call relevant to email marketing. Include action items, decisions, and any new information about the brand.",
  "voiceUpdates": "Any new voice/tone insights (or empty string if none)",
  "ruleUpdates": "Any new rules or restrictions mentioned (or empty string if none)"
}`
          }],
        }),
      });
      const analyzeData = await analyzeRes.json();

      if (analyzeData.message) {
        try {
          const jsonMatch = analyzeData.message.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            // Append new notes to existing notes
            if (parsed.newNotes) {
              const existingNotes = form.notes || '';
              const separator = existingNotes ? '\n\n---\n\n' : '';
              const fathomHeader = `📞 Fathom Call Notes (${new Date().toLocaleDateString('en-GB')}):\n`;
              onChange({ notes: existingNotes + separator + fathomHeader + parsed.newNotes });
            }
            if (parsed.voiceUpdates && !form.voice) {
              onChange({ voice: parsed.voiceUpdates });
            }
            if (parsed.ruleUpdates && !form.rules) {
              onChange({ rules: parsed.ruleUpdates });
            }
            toast.success('Call notes extracted and added');
          }
        } catch {
          toast.error('Could not parse call notes');
        }
      }
    } catch {
      toast.error('Failed to analyse Fathom link');
    }
    setAnalyzing(false);
  };

  return (
    <div>
      <Label>Fathom Call Notes</Label>
      <p className="text-[9px] text-[#444] mb-2">Paste a Fathom notetaker link to extract client insights</p>
      <div className="flex gap-2">
        <input
          type="url"
          value={fathomUrl}
          onChange={e => setFathomUrl(e.target.value)}
          placeholder="https://fathom.video/..."
          className="flex-1 bg-[#0E0E0E] border border-[#252525] rounded-md px-3 py-2 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-white/20"
        />
        <Button size="sm" variant="secondary" onClick={handleAnalyzeFathom} loading={analyzing}>
          Extract
        </Button>
      </div>
    </div>
  );
}

export function DocumentsStep({
  form,
  onChange,
}: {
  form: FormState;
  onChange: (updates: Partial<FormState>) => void;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      setFileText(text);
      setFileName(file.name);
      toast.success(`File loaded: ${file.name}`);
    };
    reader.readAsText(file);
  };

  const handleAnalyze = async () => {
    if (!fileText) {
      toast.error('Upload a file first');
      return;
    }
    setAnalyzing(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentText: fileText }),
      });
      if (!res.ok) throw new Error('Analysis failed');
      const result: AnalysisResult = await res.json();
      setAnalysisResult(result);
      toast.success('Analysis complete');
    } catch {
      toast.error('Failed to analyze document');
    }
    setAnalyzing(false);
  };

  const handleGenerateNotes = async () => {
    if (!fileText) {
      toast.error('Upload a file first');
      return;
    }
    setGeneratingNotes(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentText: fileText,
          mode: 'onboarding_notes',
        }),
      });
      if (!res.ok) throw new Error('Generation failed');
      const result = await res.json();
      const notes = result.notes || result.voice || '';
      onChange({ notes: notes });
      toast.success('Onboarding notes generated');
    } catch {
      toast.error('Failed to generate notes');
    }
    setGeneratingNotes(false);
  };

  const applyAnalysis = () => {
    if (!analysisResult) return;
    onChange({
      voice: analysisResult.voice || form.voice,
      rules: analysisResult.rules || form.rules,
      audiences: analysisResult.audiences.length > 0 ? analysisResult.audiences : form.audiences,
      products: analysisResult.products.length > 0 ? analysisResult.products : form.products,
    });
    toast.success('Analysis applied to brand fields');
    setAnalysisResult(null);
  };

  return (
    <div className="space-y-4">
      {/* File Upload */}
      <div>
        <Label>Upload Document</Label>
        <label className="block mt-1 border-2 border-dashed border-[#252525] rounded-lg p-8 text-center cursor-pointer hover:border-white/20 transition-colors">
          <input
            type="file"
            accept=".txt,.csv,.md"
            onChange={handleFileUpload}
            className="hidden"
          />
          {fileName ? (
            <>
              <p className="text-sm text-white">{fileName}</p>
              <p className="text-[10px] text-[#555] mt-1">Click to replace</p>
            </>
          ) : (
            <>
              <p className="text-sm text-[#555]">Click to upload or drag and drop</p>
              <p className="text-[10px] text-[#333] mt-1">.txt, .csv, .md files</p>
            </>
          )}
        </label>
      </div>

      {/* Action buttons when file is loaded */}
      {fileText && (
        <div className="grid grid-cols-2 gap-2">
          {/* Extract brand info */}
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={analyzing}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] transition-all disabled:opacity-30 text-left group"
          >
            <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              {analyzing ? (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="text-xs">🔍</span>
              )}
            </div>
            <div>
              <p className="text-[10px] text-white font-medium">Extract Brand Info</p>
              <p className="text-[8px] text-[#555] mt-0.5">Auto-fill voice, rules, audiences</p>
            </div>
          </button>

          {/* Generate onboarding notes */}
          <button
            type="button"
            onClick={handleGenerateNotes}
            disabled={generatingNotes}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white/[0.02] border border-white/[0.06] hover:border-white/15 hover:bg-white/[0.04] transition-all disabled:opacity-30 text-left group"
          >
            <div className="w-7 h-7 rounded-md bg-white/[0.04] flex items-center justify-center flex-shrink-0">
              {generatingNotes ? (
                <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="text-xs">📝</span>
              )}
            </div>
            <div>
              <p className="text-[10px] text-white font-medium">Generate Notes</p>
              <p className="text-[8px] text-[#555] mt-0.5">AI onboarding notes from doc</p>
            </div>
          </button>
        </div>
      )}

      {/* Analysis Result Preview */}
      {analysisResult && (
        <Card className="border-[#F59E0B]/30">
          <p className="label-text text-[#F59E0B] mb-3">AI Analysis Results</p>
          <div className="space-y-2 text-xs">
            <div><span className="text-[#555]">Voice:</span> <span className="text-[#999]">{analysisResult.voice}</span></div>
            <div><span className="text-[#555]">Rules:</span> <span className="text-[#999]">{analysisResult.rules}</span></div>
            <div><span className="text-[#555]">Audiences:</span> <span className="text-[#999]">{analysisResult.audiences.join(', ')}</span></div>
            <div><span className="text-[#555]">Products:</span> <span className="text-[#999]">{analysisResult.products.join(', ')}</span></div>
          </div>
          <Button variant="primary" size="sm" className="mt-3" onClick={applyAnalysis}>
            Apply to Brand
          </Button>
        </Card>
      )}

      {/* Fathom Notetaker */}
      <FathomUpload form={form} onChange={onChange} />

      {/* Notes */}
      <Textarea
        label="Onboarding Notes"
        value={form.notes}
        onChange={e => onChange({ notes: e.target.value })}
        placeholder="Paste any additional context, docs, onboarding notes..."
        className="min-h-[200px]"
      />
    </div>
  );
}

export type { FormState };
