'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BriefHistory, EmailStatus } from '@/lib/types';
import { BRIEF_TYPES, EMAIL_STATUSES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { BriefTable } from '@/components/brief-table';
import { exportBriefAsDocx } from '@/lib/export-docx';
import { updateBriefHistoryStatus, updateBriefSLPT } from '@/lib/db';
import { createClient } from '@/lib/supabase/client';
import { formatDate, copyToClipboard } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function BriefPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const briefId = params.id as string;

  const [brief, setBrief] = useState<BriefHistory & { brand?: { name: string; color: string; category: string } } | null>(null);
  const [loading, setLoading] = useState(true);
  const [subjectLine, setSubjectLine] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [currentStatus, setCurrentStatus] = useState<EmailStatus>('not_started');
  const [suggestingSLPT, setSuggestingSLPT] = useState(false);
  const [savingSLPT, setSavingSLPT] = useState(false);
  const [slptSaved, setSlptSaved] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;

    const { data, error } = await supabase
      .from('brief_history')
      .select('*, brand:brands(name, color, category)')
      .eq('id', briefId)
      .single();

    if (error || !data) {
      setLoading(false);
      return;
    }

    setBrief(data as typeof brief);
    setCurrentStatus((data.status as EmailStatus) || 'not_started');

    // Load saved SL/PT from DB first, fallback to extracting from output
    if (data.subject_line) {
      setSubjectLine(data.subject_line);
    } else {
      // Try new format first (**SL:** ...), then legacy format
      const newSlMatch = data.output.match(/\*\*SL:\*\*\s*(.+)/);
      if (newSlMatch) {
        setSubjectLine(newSlMatch[1].trim());
      } else {
        const clean = (s: string) => s.replace(/\*\*/g, '').replace(/^\s*[A-C]:\s*/, '').trim();
        const slMatch = data.output.match(/(?:Subject Line|SUBJECT LINE)[^:]*:?\s*\n?\s*(?:\*\*)?(?:A:|Option A:?)?\s*\*?\*?\s*(.+)/i);
        if (slMatch) setSubjectLine(clean(slMatch[1]));
      }
    }

    if (data.preview_text) {
      setPreviewText(data.preview_text);
    } else {
      const newPtMatch = data.output.match(/\*\*PT:\*\*\s*(.+)/);
      if (newPtMatch) {
        setPreviewText(newPtMatch[1].trim());
      } else {
        const clean = (s: string) => s.replace(/\*\*/g, '').replace(/^\s*[A-C]:\s*/, '').trim();
        const ptMatch = data.output.match(/(?:Preview Text|PREVIEW TEXT)[^:]*:?\s*\n?\s*(?:\*\*)?(?:A:|Option A:?)?\s*\*?\*?\s*(.+)/i);
        if (ptMatch) setPreviewText(clean(ptMatch[1]));
      }
    }

    setLoading(false);
  }, [briefId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (newStatus: EmailStatus) => {
    try {
      await updateBriefHistoryStatus(briefId, newStatus);
      setCurrentStatus(newStatus);
      toast.success('Status updated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    copyToClipboard(url);
    toast.success('Link copied — share with designer');
  };

  const handleSaveSLPT = async () => {
    setSavingSLPT(true);
    try {
      await updateBriefSLPT(briefId, subjectLine, previewText);
      setSlptSaved(true);
      toast.success('Subject line & preview text saved');
      setTimeout(() => setSlptSaved(false), 2000);
    } catch {
      toast.error('Failed to save');
    }
    setSavingSLPT(false);
  };

  const handleSuggestSLPT = async () => {
    if (!brief) return;
    setSuggestingSLPT(true);
    try {
      const brand = brief.brand as { name: string; color: string; category: string } | undefined;
      const formTitle = (brief.form_data as Record<string, string>)?.title || '';
      const res = await fetch('/api/suggest-slpt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          briefContent: brief.output,
          brand: { name: brand?.name || '', category: brand?.category || '', voice: '' },
          emailName: formTitle,
          isPlainText: brief.type === 'plain_text',
        }),
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      if (data.subjectLine) setSubjectLine(data.subjectLine);
      if (data.previewText) setPreviewText(data.previewText);
      toast.success('AI suggestions generated');
    } catch {
      toast.error('Failed to generate suggestions');
    }
    setSuggestingSLPT(false);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="h-12 glass-card rounded-xl shimmer mb-4" />
        <div className="h-96 glass-card rounded-xl shimmer" />
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h1 className="heading text-xl mb-3">BRIEF NOT FOUND</h1>
          <p className="text-[#444] text-sm mb-4">This brief may have been deleted.</p>
          <Button variant="secondary" onClick={() => router.push('/briefs')}>Back to Briefs</Button>
        </div>
      </div>
    );
  }

  const typeInfo = BRIEF_TYPES.find(t => t.value === brief.type);
  const title = (brief.form_data as Record<string, string>)?.title || typeInfo?.label || 'Brief';
  const brand = brief.brand as { name: string; color: string; category: string } | undefined;
  const statusInfo = EMAIL_STATUSES.find(s => s.value === currentStatus);
  const statusColor = statusInfo?.color || '#6B7280';
  const isPlainText = brief.type === 'plain_text' || brief.type === 'sms';

  return (
    <div className="max-w-4xl mx-auto">
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/briefs')}>← Briefs</Button>
          <div className="h-4 w-px bg-white/[0.06]" />
          <span className="text-[11px] text-[#888] uppercase tracking-wider">{brand?.name}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Status */}
          <select
            value={currentStatus}
            onChange={e => handleStatusChange(e.target.value as EmailStatus)}
            className="text-[10px] font-medium rounded-md px-2.5 py-1.5 appearance-none cursor-pointer border-0 focus:outline-none"
            style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
          >
            {EMAIL_STATUSES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {/* Share */}
          <Button variant="secondary" size="sm" onClick={handleCopyLink}>
            Share Link
          </Button>
          {/* Export */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              exportBriefAsDocx(title, brand?.name || '', brand?.category || '', typeInfo?.label || '', brief.output);
              toast.success('Downloading .docx');
            }}
          >
            ↓ .docx
          </Button>
        </div>
      </div>

      {/* Title */}
      <div className="mb-6">
        <h1 className="heading text-2xl text-white mb-1">{title}</h1>
        <p className="text-[11px] text-[#555]">
          {typeInfo?.label} · {formatDate(brief.created_at)} · {brand?.name}
        </p>
      </div>

      {/* SL / PT Input Fields */}
      <div className="glass-card rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <p className="label-text">Subject Line & Preview Text</p>
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
          {/* Subject Line */}
          <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-3">
            <label className="text-[10px] text-[#666] uppercase tracking-wider font-medium w-full sm:w-16 flex-shrink-0">
              Subject
            </label>
            <input
              type="text"
              value={subjectLine}
              onChange={e => { setSubjectLine(e.target.value); setSlptSaved(false); }}
              placeholder="Add subject line..."
              className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-md px-3 py-2 text-[13px] text-white placeholder-[#333] focus:outline-none focus:border-white/15 transition-colors"
            />
          </div>

          {/* Preview Text — only for non-plain-text */}
          {!isPlainText && (
            <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-3">
              <label className="text-[10px] text-[#666] uppercase tracking-wider font-medium w-full sm:w-16 flex-shrink-0">
                Preview
              </label>
              <input
                type="text"
                value={previewText}
                onChange={e => { setPreviewText(e.target.value); setSlptSaved(false); }}
                placeholder="Add preview text..."
                className="flex-1 bg-white/[0.03] border border-white/[0.06] rounded-md px-3 py-2 text-[13px] text-white placeholder-[#333] focus:outline-none focus:border-white/15 transition-colors"
              />
            </div>
          )}
        </div>
      </div>

      {/* Brief Content Table */}
      <div className="glass-card rounded-xl p-6">
        <BriefTable output={brief.output} />
      </div>
    </div>
  );
}
