'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { useAuth } from '@/lib/auth-context';
import { Brand, BrandComment } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { RowListSkeleton } from '@/components/ui/skeleton';
import { getBrandComments, createBrandComment, deleteBrandComment } from '@/lib/db';
import toast from 'react-hot-toast';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function monthKey(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  } catch {
    return '0000-00';
  }
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

// Group comments by YYYY-MM, newest month first
function groupByMonth(comments: BrandComment[]): Array<{ key: string; label: string; items: BrandComment[] }> {
  const groups: Record<string, BrandComment[]> = {};
  for (const c of comments) {
    const k = monthKey(c.created_at);
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  }
  return Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .map((k) => ({
      key: k,
      label: monthLabel(k),
      items: groups[k],
    }));
}

export default function ClientCommentsPage() {
  const { brands, managers, selectedPod } = useApp();
  const { user } = useAuth();
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [comments, setComments] = useState<BrandComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [fathomUrl, setFathomUrl] = useState('');
  const [extractingFathom, setExtractingFathom] = useState(false);

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

  const loadComments = useCallback(async (brandId: string) => {
    setLoading(true);
    try {
      const data = await getBrandComments(brandId);
      setComments(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load comments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBrand) loadComments(selectedBrand.id);
  }, [selectedBrand, loadComments]);

  const handleAdd = async () => {
    if (!selectedBrand || !newComment.trim()) return;
    setSaving(true);
    try {
      await createBrandComment({
        brand_id: selectedBrand.id,
        content: newComment.trim(),
        author_id: user?.id || null,
        author_email: user?.email || null,
      });
      setNewComment('');
      toast.success('Comment added');
      await loadComments(selectedBrand.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleExtractFathom = async () => {
    if (!selectedBrand || !fathomUrl.trim()) {
      toast.error('Paste a Fathom link first');
      return;
    }
    setExtractingFathom(true);
    try {
      const res = await fetch('/api/fathom-extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: fathomUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');

      // Save the extracted content as a comment tagged with the source url
      const content = `📞 From Fathom call (${fathomUrl.trim()})\n\n${data.content}`;
      await createBrandComment({
        brand_id: selectedBrand.id,
        content,
        author_id: user?.id || null,
        author_email: user?.email || null,
      });
      setFathomUrl('');
      toast.success('Call notes extracted and saved as a comment');
      await loadComments(selectedBrand.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtractingFathom(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this comment?')) return;
    setDeletingId(id);
    try {
      await deleteBrandComment(id);
      toast.success('Deleted');
      if (selectedBrand) await loadComments(selectedBrand.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <PageHeader
        title="CLIENT COMMENTS"
        subtitle="Drop notes from calls, DMs, or meetings — they flow into every brief and strategy for that client"
      />

      {!selectedBrand ? (
        <div className="space-y-6">
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
                      onClick={() => setSelectedBrand(brand)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
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
                setComments([]);
              }}
            >
              ← Change client
            </Button>
          </Card>

          {/* Add comment */}
          <Card className="p-6">
            <p className="label-text mb-3">Add a comment</p>
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={`e.g. Client wants to push the new linen collection in May. No discounts before Black Friday. Founder mentioned they want more lifestyle photography in sends.`}
              rows={5}
              className="input-polish w-full bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-3 text-[12px] text-white placeholder:text-[#444] resize-y min-h-[120px] mb-3"
            />
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-[10px] text-[#555]">
                These notes get passed into every brief and strategy generation for this client.
              </p>
              <Button onClick={handleAdd} disabled={saving || !newComment.trim()}>
                {saving ? 'Saving…' : 'Add comment'}
              </Button>
            </div>
          </Card>

          {/* Fathom importer */}
          <Card className="p-6">
            <p className="label-text mb-3">Import from Fathom call</p>
            <p className="text-[10px] text-[#555] mb-3">
              Paste a Fathom call notes link. Claude will extract the key takeaways and save them as a comment on this client.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={fathomUrl}
                onChange={(e) => setFathomUrl(e.target.value)}
                placeholder="https://fathom.video/..."
                className="input-polish flex-1 bg-white/[0.03] border border-white/[0.08] rounded-xl px-4 py-2.5 text-[12px] text-white placeholder:text-[#444]"
              />
              <Button
                variant="secondary"
                onClick={handleExtractFathom}
                disabled={extractingFathom || !fathomUrl.trim()}
              >
                {extractingFathom ? 'Extracting…' : 'Extract call notes'}
              </Button>
            </div>
            <p className="text-[9px] text-[#555] mt-2 italic">
              If the Fathom page is private, the fetch will fail — in that case paste the transcript into the comment box above instead.
            </p>
          </Card>

          {/* Comments grouped by month */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="label-text">All comments by month</p>
              <span className="text-[10px] text-[#555]">
                {comments.length} note{comments.length === 1 ? '' : 's'}
              </span>
            </div>
            {loading ? (
              <RowListSkeleton rows={3} />
            ) : comments.length === 0 ? (
              <p className="text-[11px] text-[#555] text-center py-8">
                No comments yet. Drop the first one above.
              </p>
            ) : (
              <div className="space-y-6">
                {groupByMonth(comments).map((group) => (
                  <div key={group.key}>
                    <div className="flex items-center gap-3 mb-3">
                      <p className="text-[11px] font-semibold text-white uppercase tracking-wider">
                        {group.label}
                      </p>
                      <div className="flex-1 h-px bg-white/[0.04]" />
                      <span className="text-[9px] text-[#444]">
                        {group.items.length} note{group.items.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {group.items.map((c) => (
                        <div
                          key={c.id}
                          className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4 group"
                        >
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <p className="text-[10px] uppercase tracking-wider text-[#666]">
                              {formatDate(c.created_at)}
                              {c.author_email && (
                                <span className="text-[#444] normal-case"> · {c.author_email}</span>
                              )}
                            </p>
                            <button
                              onClick={() => handleDelete(c.id)}
                              disabled={deletingId === c.id}
                              className="text-[9px] uppercase tracking-wider text-[#444] hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-30"
                            >
                              {deletingId === c.id ? '…' : 'Delete'}
                            </button>
                          </div>
                          <p className="text-[12px] text-[#e5e5e5] leading-relaxed whitespace-pre-wrap">
                            {c.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
