'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { ReportSkeleton } from '@/components/ui/skeleton';
import { BriefTable } from '@/components/brief-table';
import { exportBriefAsDocx } from '@/lib/export-docx';
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

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
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
  const [expandedEmailIndex, setExpandedEmailIndex] = useState<number | null>(null);
  const [exportingIndex, setExportingIndex] = useState<number | null>(null);

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

  const handleExportEmail = async (index: number) => {
    if (!brief) return;
    const email = brief.emails[index];
    if (!email?.brief_markdown) {
      toast.error('No brief body available for this email');
      return;
    }
    setExportingIndex(index);
    try {
      await exportBriefAsDocx(
        `${brief.name} — ${email.label}`,
        brief.brand?.name || 'Client',
        '',
        `Flow Email ${email.position}`,
        email.brief_markdown
      );
      toast.success('Downloading .docx');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExportingIndex(null);
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
        subtitle={`${brief.flow_type.replace(/_/g, ' ')} · ${brief.emails.length} emails · Created ${formatDate(brief.created_at)}${brief.due_date ? ` · Due ${formatDate(brief.due_date)}` : ''}`}
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
          <button
            onClick={handleDelete}
            className="text-[10px] uppercase tracking-wider text-[#555] hover:text-red-400 transition-colors px-2"
          >
            Delete
          </button>
        </div>
      </Card>

      {/* Purpose + summary */}
      {(brief.purpose || brief.summary || brief.trigger_description) && (
        <Card className="p-5 mb-6 space-y-3">
          {brief.purpose && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Purpose</p>
              <p className="text-[13px] text-white leading-relaxed">{brief.purpose}</p>
            </div>
          )}
          {brief.summary && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Summary</p>
              <p className="text-[12px] text-[#ccc] leading-relaxed">{brief.summary}</p>
            </div>
          )}
          {brief.trigger_description && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#666] mb-1">Trigger</p>
              <p className="text-[12px] text-[#ccc] leading-relaxed">{brief.trigger_description}</p>
            </div>
          )}
        </Card>
      )}

      {/* Flow chart: vertical timeline, click email to expand full brief */}
      <Card className="p-6 mb-6">
        <p className="label-text mb-5">Flow chart</p>
        <div className="space-y-3">
          {brief.emails.map((email, i) => {
            const isLast = i === brief.emails.length - 1;
            const isExpanded = expandedEmailIndex === i;
            return (
              <div
                key={i}
                className="relative pl-7"
                style={{
                  borderLeft: isLast ? 'none' : '1px dashed rgba(255,255,255,0.14)',
                  paddingBottom: isLast ? '0' : '0.75rem',
                  marginLeft: '6px',
                }}
              >
                {/* Timeline dot */}
                <div className="absolute left-0 top-4 -translate-x-1/2 w-3 h-3 rounded-full bg-white" />

                {/* Summary row — clickable to expand */}
                <button
                  onClick={() => setExpandedEmailIndex(isExpanded ? null : i)}
                  className="w-full text-left bg-white/[0.02] border border-white/[0.05] hover:border-white/[0.12] rounded-xl p-4 transition-all"
                >
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <p className="text-[12px] font-semibold text-white">{email.label}</p>
                    <span className="text-[9px] text-[#888] uppercase tracking-wider px-2 py-0.5 rounded bg-white/[0.04]">
                      {email.send_delay}
                    </span>
                  </div>
                  <p className="text-[11px] text-[#999] italic mb-3 leading-relaxed">{email.goal}</p>
                  <div className="flex items-start gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] uppercase tracking-wider text-[#555] mb-0.5">Subject</p>
                      <p className="text-[12px] text-white font-medium truncate">{email.subject}</p>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[8px] uppercase tracking-wider text-[#555] mb-0.5">Preview</p>
                      <p className="text-[11px] text-[#ccc] truncate">{email.preview_text}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-[#555]">
                    <span className="uppercase tracking-wider">
                      {isExpanded ? 'Click to collapse' : 'Click to open full brief'}
                    </span>
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
                    >
                      <path
                        d="M2 3.5L5 6.5L8 3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                </button>

                {/* Expanded full brief */}
                {isExpanded && email.brief_markdown && (
                  <div className="mt-3 animate-fade">
                    <div className="flex items-center justify-end gap-2 mb-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleExportEmail(i)}
                        disabled={exportingIndex === i}
                      >
                        {exportingIndex === i ? 'Exporting…' : 'Export .docx'}
                      </Button>
                    </div>
                    <Card padding="lg" className="bg-black/20">
                      <BriefTable output={email.brief_markdown} />
                    </Card>
                  </div>
                )}

                {isExpanded && !email.brief_markdown && (
                  <div className="mt-3 text-[11px] text-[#666] italic pl-4">
                    No full brief body was generated for this email.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Source notes (collapsed) */}
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
