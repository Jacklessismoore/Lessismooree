'use client';

import { useState, useEffect, useCallback } from 'react';
import { getEmailReferences, createEmailReference, deleteEmailReference } from '@/lib/db';
import { EmailReference } from '@/lib/types';
import { FRAMEWORKS } from '@/lib/constants';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Textarea, Select, Label } from '@/components/ui/form-fields';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import toast from 'react-hot-toast';

const INDUSTRIES = [
  'Pet / Animal Care', 'Health & Wellness', 'Fashion & Apparel', 'Beauty & Skincare',
  'Food & Beverage', 'Home & Garden', 'Kids & Baby', 'Sports & Fitness',
  'Jewellery & Accessories', 'Tech & Electronics', 'Supplements', 'Other',
];

const TAG_OPTIONS = [
  'Whole Email', 'Great Subject Line', 'Strong CTA', 'Good Layout', 'Social Proof', 'Product Feature',
  'Founder Voice', 'Urgency', 'Educational', 'Minimal Design', 'Bold Design',
  'Good Mobile', 'Infographic', 'Comparison', 'Review Feature', 'Launch',
];

export default function ReferencesPage() {
  const [references, setReferences] = useState<EmailReference[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [filterFramework, setFilterFramework] = useState('');
  const [filterIndustry, setFilterIndustry] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRef, setSelectedRef] = useState<EmailReference | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // Add form state
  const [addMode, setAddMode] = useState<'url' | 'manual'>('url');
  const [formUrl, setFormUrl] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formFramework, setFormFramework] = useState('');
  const [formIndustry, setFormIndustry] = useState('');
  const [formTags, setFormTags] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [formImageUrl, setFormImageUrl] = useState('');
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generatingNotes, setGeneratingNotes] = useState(false);

  // Close menu on click outside
  useEffect(() => {
    if (!menuOpenId) return;
    const handler = () => setMenuOpenId(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [menuOpenId]);

  const loadReferences = useCallback(async () => {
    try {
      const data = await getEmailReferences();
      setReferences(data);
    } catch (e) {
      console.error('Failed to load references:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadReferences(); }, [loadReferences]);

  // Convert Google Drive share links to direct image URLs
  const getDirectImageUrl = (url: string): string | null => {
    // Google Drive: extract file ID and convert to direct link
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
    }
    // Google Drive alternate format
    const driveMatch2 = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
    if (driveMatch2) {
      return `https://lh3.googleusercontent.com/d/${driveMatch2[1]}`;
    }
    // Direct image URL
    if (/\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url)) {
      return url;
    }
    return null;
  };

  const handleFetchUrl = async () => {
    if (!formUrl.trim()) return;
    setFetchingUrl(true);

    const url = formUrl.trim();

    // Try to get a direct image URL first (Google Drive, direct images)
    const directUrl = getDirectImageUrl(url);
    if (directUrl) {
      setFormImageUrl(directUrl);
      toast.success('Image collected');
      setFetchingUrl(false);
      return;
    }

    // For web pages (Milled, Really Good Emails, etc.) — try to fetch og:image
    try {
      const res = await fetch('/api/fetch-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (data.blocked) {
        toast(data.error, { duration: 6000, icon: '🔒' });
      } else if (data.error) {
        toast(data.error, { duration: 5000, icon: '⚠️' });
      } else {
        if (data.title && !formTitle) setFormTitle(data.title);
        if (data.ogImage) {
          setFormImageUrl(data.ogImage);
          toast.success('Image found');
        } else {
          toast('No preview image found. Try a Google Drive link or direct image URL instead.', { duration: 4000, icon: '📷' });
        }
      }
    } catch {
      toast.error('Failed to fetch. Try a direct image URL or Google Drive link.');
    }
    setFetchingUrl(false);
  };

  const handleAiAnalyse = async () => {
    if (!formImageUrl && !formUrl.trim()) { toast.error('Fetch the image first, then click AI'); return; }
    if (!formImageUrl) { toast.error('Click Fetch first to resolve the image, then click AI to analyse it'); return; }
    setGeneratingNotes(true);
    try {
      // Use the vision API to actually look at the email screenshot
      const res = await fetch('/api/analyze-reference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: formImageUrl }),
      });
      const data = await res.json();
      if (data.title) setFormTitle(data.title);
      if (data.framework) setFormFramework(data.framework);
      if (data.industry) setFormIndustry(data.industry);
      if (data.notes) setFormNotes(data.notes);
      if (data.tags?.length) setFormTags(data.tags.filter((t: string) => TAG_OPTIONS.includes(t)));
      toast.success('Email analysed and fields auto-filled');
    } catch {
      toast.error('Failed to analyse');
    }
    setGeneratingNotes(false);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) { toast.error('Title is required'); return; }
    setSaving(true);
    try {
      await createEmailReference({
        title: formTitle.trim(),
        source_url: formUrl.trim() || undefined,
        source_type: addMode,
        framework: formFramework || undefined,
        industry: formIndustry || undefined,
        tags: formTags,
        notes: formNotes.trim() || undefined,
        image_url: formImageUrl.trim() || formUrl.trim() || undefined,
      });
      toast.success('Reference saved');
      resetForm();
      setShowAdd(false);
      await loadReferences();
    } catch {
      toast.error('Failed to save reference');
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteEmailReference(deleteTarget);
      toast.success('Reference deleted');
      setDeleteTarget(null);
      await loadReferences();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const resetForm = () => {
    setFormUrl(''); setFormTitle(''); setFormFramework(''); setFormIndustry('');
    setFormTags([]); setFormNotes(''); setFormImageUrl(''); setAddMode('url');
  };

  // Filter references
  const filtered = references.filter(ref => {
    if (filterFramework && ref.framework !== filterFramework) return false;
    if (filterIndustry && ref.industry !== filterIndustry) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matches = ref.title.toLowerCase().includes(q) ||
        ref.notes?.toLowerCase().includes(q) ||
        ref.tags.some(t => t.toLowerCase().includes(q));
      if (!matches) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-pulse text-[#555] heading text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <PageHeader
        title="REFERENCES"
        subtitle={`${references.length} email reference${references.length !== 1 ? 's' : ''} saved`}
        actions={
          <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }} className="mt-2 sm:mt-0">
            + Add Reference
          </Button>
        }
      />

      {/* Add Reference — inline card at top */}
      {showAdd && (
        <Card padding="lg" className="mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-5">
            <h3 className="heading text-sm">Add Reference</h3>
            <button onClick={() => setShowAdd(false)} className="text-[#444] hover:text-white transition-colors">
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Label className="!mb-0">URL</Label>
                <div className="relative group inline-flex">
                  <div className="w-3.5 h-3.5 rounded-full border border-white/10 flex items-center justify-center cursor-help flex-shrink-0">
                    <span className="text-[7px] text-[#555] font-bold leading-none">?</span>
                  </div>
                  <div className="absolute bottom-full left-0 mb-1.5 px-2.5 py-1.5 bg-[#1a1a1a] border border-white/[0.08] rounded-lg text-[9px] text-[#999] w-56 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    Paste a Milled, Really Good Emails, Pinterest link, or upload a screenshot to Google Drive (set to &quot;Anyone with the link&quot;) and paste here
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="url"
                  value={formUrl}
                  onChange={e => {
                    setFormUrl(e.target.value);
                  }}
                  placeholder="https://milled.com/... or Google Drive link"
                  className="flex-1 bg-[#0E0E0E] border border-[#252525] rounded-md px-3 py-2.5 text-xs text-white placeholder:text-[#555] focus:outline-none focus:border-white/20"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleFetchUrl} loading={fetchingUrl} className="flex-1 sm:flex-none">
                    Fetch Image
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleAiAnalyse} loading={generatingNotes} disabled={!formImageUrl} className="flex-1 sm:flex-none">
                    ✨ AI Fill
                  </Button>
                </div>
              </div>
              {formUrl && formUrl.includes('drive.google.com') && (
                <p className="text-[9px] text-green-400/70 mt-1">
                  Google Drive link detected. Click Fetch to collect the image.
                </p>
              )}
            </div>

            <Input label="Title" placeholder="e.g. Casely Flash Sale Email" value={formTitle} onChange={e => setFormTitle(e.target.value)} required />

            <div className="grid grid-cols-2 gap-3">
              <Select label="Framework" options={FRAMEWORKS.map(f => ({ value: f, label: f }))} value={formFramework} onChange={e => setFormFramework(e.target.value)} />
              <div>
                <Label>Industry</Label>
                <select value={formIndustry} onChange={e => setFormIndustry(e.target.value)} className="w-full bg-[#0E0E0E] border border-[#252525] rounded-md px-3 py-2.5 text-xs text-white focus:outline-none focus:border-white/20 appearance-none">
                  <option value="">Select...</option>
                  {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1">
                {TAG_OPTIONS.map(tag => (
                  <button key={tag} type="button" onClick={() => setFormTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                    className={`text-[8px] px-1.5 py-0.5 rounded transition-all ${formTags.includes(tag) ? 'bg-white text-black font-semibold' : 'bg-white/[0.03] border border-white/[0.06] text-[#666] hover:text-white hover:border-white/15'}`}
                  >{tag}</button>
                ))}
              </div>
            </div>

            <div>
              <Label>Notes</Label>
              <Textarea placeholder="Why is this a good reference? What stands out?" value={formNotes} onChange={e => setFormNotes(e.target.value)} rows={2} />
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="secondary" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search references..."
          className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-[11px] text-white placeholder:text-[#444] focus:outline-none focus:border-white/15 transition-colors w-48"
        />
        <select
          value={filterFramework}
          onChange={e => setFilterFramework(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-[10px] text-[#999] focus:outline-none appearance-none cursor-pointer"
        >
          <option value="">All Frameworks</option>
          {FRAMEWORKS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          value={filterIndustry}
          onChange={e => setFilterIndustry(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-3 py-2 text-[10px] text-[#999] focus:outline-none appearance-none cursor-pointer"
        >
          <option value="">All Industries</option>
          {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
      </div>

      {/* Reference Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-[#555] text-sm mb-4">
            {references.length === 0 ? 'No references yet. Start building your library.' : 'No references match your filters.'}
          </p>
          {references.length === 0 && (
            <Button size="sm" onClick={() => { resetForm(); setShowAdd(true); }}>
              + Add First Reference
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {filtered.map((ref, i) => (
            <Card
              key={ref.id}
              hoverable
              padding="sm"
              className="animate-fade-in group relative !p-2"
              style={{ animationDelay: `${i * 30}ms` } as React.CSSProperties}
              onClick={() => setSelectedRef(ref)}
            >
              {/* Image preview */}
              {ref.image_url || ref.source_url ? (
                <div className="w-full h-28 sm:h-32 rounded-lg overflow-hidden mb-2 bg-white/[0.02]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={ref.image_url || ref.source_url || ''}
                    alt={ref.title}
                    className="w-full h-full object-cover object-top"
                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ) : (
                <div className="w-full h-28 sm:h-32 rounded-lg mb-2 bg-white/[0.03] border border-white/[0.04] flex items-center justify-center">
                  <span className="text-xl">📧</span>
                </div>
              )}

              {/* Info */}
              <p className="text-[10px] font-medium text-white truncate mb-0.5">{ref.title}</p>
              <div className="flex items-center gap-1 flex-wrap">
                {ref.framework && (
                  <span className="text-[7px] bg-white/[0.04] px-1 py-0.5 rounded text-[#888] uppercase tracking-wider">
                    {ref.framework}
                  </span>
                )}
                {ref.industry && (
                  <span className="text-[7px] bg-white/[0.04] px-1 py-0.5 rounded text-[#888] uppercase tracking-wider">
                    {ref.industry}
                  </span>
                )}
              </div>

              {/* 3-dot menu on hover */}
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={e => { e.stopPropagation(); setMenuOpenId(menuOpenId === ref.id ? null : ref.id); }}
                  className="w-6 h-6 rounded-md bg-black/70 backdrop-blur-sm flex items-center justify-center hover:bg-black/90 transition-colors"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="2.5" r="1" fill="#999"/>
                    <circle cx="6" cy="6" r="1" fill="#999"/>
                    <circle cx="6" cy="9.5" r="1" fill="#999"/>
                  </svg>
                </button>

                {menuOpenId === ref.id && (
                  <div className="absolute top-full right-0 mt-1 bg-[#1a1a1a] border border-white/[0.08] rounded-lg overflow-hidden shadow-xl z-20 min-w-[100px]">
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(ref.id); setMenuOpenId(null); }}
                      className="w-full px-3 py-2 text-left text-[10px] text-red-400 hover:bg-white/[0.04] transition-colors uppercase tracking-wider"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}


      {/* View Reference — simple info card */}
      {selectedRef && (
        <Modal open={!!selectedRef} onClose={() => setSelectedRef(null)}>
          <h3 className="text-base font-semibold text-white mb-2 pr-6">{selectedRef.title}</h3>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {selectedRef.framework && (
              <span className="text-[9px] bg-white/[0.06] px-2 py-0.5 rounded text-[#999] uppercase tracking-wider">
                {selectedRef.framework}
              </span>
            )}
            {selectedRef.industry && (
              <span className="text-[9px] bg-white/[0.06] px-2 py-0.5 rounded text-[#999] uppercase tracking-wider">
                {selectedRef.industry}
              </span>
            )}
            {selectedRef.tags.map(tag => (
              <span key={tag} className="text-[9px] bg-white/[0.04] px-2 py-0.5 rounded text-[#777]">
                {tag}
              </span>
            ))}
          </div>

          {/* Small thumbnail preview */}
          {selectedRef.image_url && (
            <div className="w-full h-40 rounded-lg overflow-y-auto mb-3 bg-white/[0.02] border border-white/[0.06]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedRef.image_url}
                alt={selectedRef.title}
                className="w-full"
                style={{ display: 'block' }}
              />
            </div>
          )}

          {selectedRef.notes && (
            <p className="text-[11px] text-[#999] leading-relaxed mb-3">{selectedRef.notes}</p>
          )}
          {selectedRef.source_url && (
            <a href={selectedRef.source_url} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm" className="w-full">
                View Original
              </Button>
            </a>
          )}
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Reference"
        message="Are you sure you want to delete this reference? This action cannot be undone."
        confirmLabel="Delete"
      />
    </div>
  );
}
