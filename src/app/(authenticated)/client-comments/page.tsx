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

export default function ClientCommentsPage() {
  const { brands, managers, selectedPod } = useApp();
  const { user } = useAuth();
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [comments, setComments] = useState<BrandComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

          {/* Comments list */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <p className="label-text">All comments</p>
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
              <div className="space-y-3">
                {comments.map((c) => (
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
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
