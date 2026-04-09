'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ReportSkeleton } from '@/components/ui/skeleton';
import { getFlowBrief, updateFlowBrief, deleteFlowBrief } from '@/lib/db';
import { FlowBrief } from '@/lib/types';
import toast from 'react-hot-toast';

const STATUS_OPTIONS: Array<{
  value: FlowBrief['status'];
  label: string;
  color: string;
  bg: string;
}> = [
  { value: 'draft', label: 'Draft', color: '#888', bg: 'rgba(255,255,255,0.05)' },
  { value: 'approved', label: 'Approved', color: '#10B981', bg: 'rgba(16,185,129,0.12)' },
  { value: 'building', label: 'Building', color: '#3B82F6', bg: 'rgba(59,130,246,0.12)' },
  { value: 'live', label: 'Live', color: '#84CC16', bg: 'rgba(132,204,22,0.12)' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function FlowBriefViewerPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [brief, setBrief] = useState<FlowBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFlowBrief(id);
      setBrief(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load flow brief');
      router.push('/flow-briefs');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (status: FlowBrief['status']) => {
    if (!brief) return;
    setUpdatingStatus(true);
    try {
      await updateFlowBrief(brief.id, { status });
      setBrief({ ...brief, status });
      toast.success('Status updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!brief) return;
    if (!confirm(`Delete "${brief.name}"? This can't be undone.`)) return;
    try {
      await deleteFlowBrief(brief.id);
      toast.success('Deleted');
      router.push('/flow-briefs');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleCopyAll = async () => {
    if (!brief) return;
    const text = [
      `${brief.name}`,
      `Trigger: ${brief.trigger_description}`,
      '',
      ...brief.emails.map(
        (e) =>
          `${e.label}
Delay: ${e.send_delay}
Goal: ${e.goal}
Subject: ${e.subject}
Preview: ${e.preview_text}
Body outline:
${e.body_outline.map((l) => `  - ${l}`).join('\n')}
`
      ),
    ].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Copy failed');
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <PageHeader title="FLOW BRIEF" subtitle="Loading…" />
        <ReportSkeleton />
      </div>
    );
  }

  if (!brief) return null;

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title={brief.name.toUpperCase()}
        subtitle={`${brief.flow_type.replace(/_/g, ' ')} · ${brief.emails.length} emails · Created ${formatDate(brief.created_at)}`}
        actions={
          <Button variant="secondary" size="sm" onClick={() => router.push('/flow-briefs')}>
            ← All flow briefs
          </Button>
        }
      />

      {/* Brand + status + actions */}
      <Card className="p-4 mb-6 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold"
            style={{ background: brief.brand?.color || '#444' }}
          >
            {brief.brand?.name?.charAt(0).toUpperCase() || '?'}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-[#666]">Client</p>
            <p className="text-sm font-semibold text-white">{brief.brand?.name || 'Unknown'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleStatusChange(opt.value)}
                disabled={updatingStatus}
                className="chip-press text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded transition-all"
                style={{
                  color: brief.status === opt.value ? opt.color : '#555',
                  background: brief.status === opt.value ? opt.bg : 'transparent',
                  border: `1px solid ${brief.status === opt.value ? opt.color + '40' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={handleCopyAll}>
            Copy
          </Button>
          <button
            onClick={handleDelete}
            className="text-[10px] uppercase tracking-wider text-[#555] hover:text-red-400 transition-colors px-2"
          >
            Delete
          </button>
        </div>
      </Card>

      {/* Trigger banner */}
      {brief.trigger_description && (
        <Card className="p-4 mb-6">
          <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Trigger</p>
          <p className="text-[13px] text-white">{brief.trigger_description}</p>
        </Card>
      )}

      {/* Vertical flow timeline */}
      <Card className="p-6 mb-6">
        <p className="label-text mb-5">Flow plan</p>
        <div className="space-y-4">
          {brief.emails.map((email, i) => {
            const isLast = i === brief.emails.length - 1;
            return (
              <div
                key={i}
                className="relative pl-7"
                style={{
                  borderLeft: isLast ? 'none' : '1px dashed rgba(255,255,255,0.14)',
                  paddingBottom: isLast ? '0' : '1rem',
                  marginLeft: '6px',
                }}
              >
                {/* Timeline dot */}
                <div className="absolute left-0 top-2 -translate-x-1/2 w-3 h-3 rounded-full bg-white" />
                {/* Delay pill */}
                <div className="absolute left-[-4px] top-[-6px] -translate-x-full pr-3">
                  <span className="text-[8px] text-[#666] uppercase tracking-wider whitespace-nowrap">
                    {i === 0 ? 'Start' : ''}
                  </span>
                </div>

                <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <p className="text-[12px] font-semibold text-white">{email.label}</p>
                    <span className="text-[9px] text-[#888] uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.04]">
                      {email.send_delay}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#999] italic mb-4 leading-relaxed">{email.goal}</p>

                  <div className="grid grid-cols-1 gap-3 mb-4">
                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-[#555] mb-1">
                        Subject line
                      </p>
                      <p className="text-[13px] text-white font-medium">{email.subject}</p>
                    </div>
                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-[#555] mb-1">
                        Preview text
                      </p>
                      <p className="text-[12px] text-[#ccc]">{email.preview_text}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-[8px] uppercase tracking-wider text-[#555] mb-1.5">
                      Body outline
                    </p>
                    <ul className="space-y-1">
                      {email.body_outline.map((line, j) => (
                        <li key={j} className="text-[11px] text-[#bbb] flex gap-2 leading-relaxed">
                          <span className="text-[#444] flex-shrink-0">→</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Source notes (collapsed-looking) */}
      {brief.source_notes && (
        <Card className="p-6 mb-6">
          <details>
            <summary className="label-text cursor-pointer hover:text-white transition-colors">
              Original notes / context
            </summary>
            <pre className="whitespace-pre-wrap text-[11px] text-[#888] mt-3 font-sans leading-relaxed">
              {brief.source_notes}
            </pre>
          </details>
        </Card>
      )}
    </div>
  );
}
