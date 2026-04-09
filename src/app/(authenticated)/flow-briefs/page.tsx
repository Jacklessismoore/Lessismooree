'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { RowListSkeleton } from '@/components/ui/skeleton';
import { FlowBrief, Brand } from '@/lib/types';
import { getFlowBriefs, deleteFlowBrief } from '@/lib/db';
import toast from 'react-hot-toast';

function statusColor(s: string): { color: string; bg: string; label: string } {
  switch (s) {
    case 'approved':
      return { color: '#10B981', bg: 'rgba(16, 185, 129, 0.12)', label: 'Approved' };
    case 'building':
      return { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.12)', label: 'Building' };
    case 'live':
      return { color: '#84CC16', bg: 'rgba(132, 204, 22, 0.12)', label: 'Live' };
    default:
      return { color: '#888', bg: 'rgba(255, 255, 255, 0.04)', label: 'Draft' };
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function FlowBriefsPage() {
  const { brands, selectedPod } = useApp();
  const [flowBriefs, setFlowBriefs] = useState<FlowBrief[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFlowBriefs();
      setFlowBriefs(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load flow briefs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Filter to selected pod
  const podBrandIds = useMemo(
    () => new Set((selectedPod ? brands.filter((b) => b.pod_id === selectedPod.id) : brands).map((b) => b.id)),
    [brands, selectedPod]
  );

  const filteredBriefs = useMemo(
    () => (flowBriefs || []).filter((fb) => podBrandIds.has(fb.brand_id)),
    [flowBriefs, podBrandIds]
  );

  // Group by brand
  const grouped = useMemo(() => {
    const byBrand: Record<string, { brand: Brand | undefined; briefs: FlowBrief[] }> = {};
    for (const fb of filteredBriefs) {
      if (!byBrand[fb.brand_id]) {
        byBrand[fb.brand_id] = {
          brand: brands.find((b) => b.id === fb.brand_id),
          briefs: [],
        };
      }
      byBrand[fb.brand_id].briefs.push(fb);
    }
    return Object.values(byBrand).sort((a, b) =>
      (a.brand?.name || '').localeCompare(b.brand?.name || '')
    );
  }, [filteredBriefs, brands]);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This can't be undone.`)) return;
    setDeletingId(id);
    try {
      await deleteFlowBrief(id);
      toast.success('Flow brief deleted');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="FLOW BRIEFS"
        subtitle="Plan Klaviyo flows with AI, email-by-email"
        actions={
          <Link href="/flow-briefs/new">
            <Button size="sm">+ New Flow Brief</Button>
          </Link>
        }
      />

      {loading ? (
        <Card className="p-6">
          <RowListSkeleton rows={5} />
        </Card>
      ) : grouped.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-[#555] text-sm mb-4">No flow briefs yet.</p>
          <Link href="/flow-briefs/new">
            <Button size="sm">Build your first flow brief</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ brand, briefs }) => (
            <div key={brand?.id || 'unknown'}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                  style={{ background: brand?.color || '#444' }}
                >
                  {brand?.name?.charAt(0).toUpperCase() || '?'}
                </div>
                <p className="label-text">{brand?.name || 'Unknown brand'}</p>
                <span className="text-[10px] text-[#555]">
                  {briefs.length} flow{briefs.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 stagger-fast">
                {briefs.map((fb) => {
                  const s = statusColor(fb.status);
                  return (
                    <div
                      key={fb.id}
                      className="relative glass-card rounded-xl p-4 group hover:border-white/10 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0 flex-1">
                          <Link href={`/flow-briefs/${fb.id}`} className="block">
                            <p className="text-[13px] font-semibold text-white truncate hover:underline">
                              {fb.name}
                            </p>
                          </Link>
                          <p className="text-[10px] text-[#555] mt-1 capitalize">
                            {fb.flow_type.replace(/_/g, ' ')} · {fb.emails.length} email
                            {fb.emails.length === 1 ? '' : 's'} · {formatDate(fb.created_at)}
                          </p>
                        </div>
                        <span
                          className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex-shrink-0"
                          style={{ color: s.color, background: s.bg }}
                        >
                          {s.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Link href={`/flow-briefs/${fb.id}`} className="flex-1">
                          <Button variant="secondary" size="sm" className="w-full">
                            Open
                          </Button>
                        </Link>
                        <button
                          onClick={() => handleDelete(fb.id, fb.name)}
                          disabled={deletingId === fb.id}
                          className="text-[10px] uppercase tracking-wider text-[#555] hover:text-red-400 transition-colors px-2 disabled:opacity-30"
                        >
                          {deletingId === fb.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
