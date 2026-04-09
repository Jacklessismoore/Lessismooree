'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { getBrand, createBrand, updateBrand, getBrandComments } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BasicInfoStep, VoiceRulesStep, DocumentsStep, FormState } from '@/components/clients/client-form-steps';
import { BrandComment } from '@/lib/types';
import toast from 'react-hot-toast';

const STEPS = ['Basics', 'Voice & Rules', 'Documents', 'Comments'];

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

function groupByMonth(comments: BrandComment[]) {
  const groups: Record<string, BrandComment[]> = {};
  for (const c of comments) {
    const k = monthKey(c.created_at);
    if (!groups[k]) groups[k] = [];
    groups[k].push(c);
  }
  return Object.keys(groups)
    .sort((a, b) => b.localeCompare(a))
    .map((k) => ({ key: k, label: monthLabel(k), items: groups[k] }));
}

export default function ClientFormPage() {
  const params = useParams();
  const router = useRouter();
  const { pods, managers, designers, selectedPod, refreshBrands } = useApp();

  const isNew = params.id === 'new';
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

  // Client comments loaded lazily for the Comments step
  const [comments, setComments] = useState<BrandComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const loadComments = useCallback(async () => {
    if (isNew || !params.id) return;
    setCommentsLoading(true);
    try {
      const data = await getBrandComments(params.id as string);
      setComments(data);
    } catch {
      // non-critical
    } finally {
      setCommentsLoading(false);
    }
  }, [isNew, params.id]);

  useEffect(() => {
    if (step === 3) loadComments();
  }, [step, loadComments]);

  const [form, setForm] = useState<FormState>({
    name: '',
    pod_id: selectedPod?.id || '',
    manager_id: '',
    designer_id: '',
    location: '',
    category: '',
    founder: '',
    color: '#3B82F6',
    website: '',
    instagram: '',
    klaviyo_api_key: '',
    voice: '',
    rules: '',
    avoid: '',
    audiences: [],
    products: [],
    notes: '',
  });

  // Load existing brand for edit
  useEffect(() => {
    if (!isNew && params.id) {
      setLoading(true);
      getBrand(params.id as string)
        .then(brand => {
          setForm({
            name: brand.name,
            pod_id: brand.pod_id || '',
            manager_id: brand.manager_id || '',
            designer_id: brand.designer_id || '',
            location: brand.location,
            category: brand.category,
            founder: brand.founder || '',
            color: brand.color,
            website: brand.website || '',
            instagram: brand.instagram || '',
            klaviyo_api_key: brand.klaviyo_api_key || '',
            voice: brand.voice,
            rules: brand.rules,
            avoid: brand.avoid || '',
            audiences: brand.audiences || [],
            products: brand.products || [],
            notes: brand.notes,
          });
        })
        .catch(() => toast.error('Failed to load client'))
        .finally(() => setLoading(false));
    }
  }, [isNew, params.id]);

  const onChange = (updates: Partial<FormState>) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const handleSave = async () => {
    if (!form.name || !form.category) {
      toast.error('Name and category are required');
      return;
    }

    setSaving(true);
    try {
      const base = {
        name: form.name,
        pod_id: form.pod_id || null,
        manager_id: form.manager_id || null,
        designer_id: form.designer_id || null,
        location: form.location || '',
        category: form.category || '',
        founder: form.founder || null,
        color: form.color || '#3B82F6',
        website: form.website || '',
        instagram: form.instagram || '',
        klaviyo_api_key: form.klaviyo_api_key || '',
        voice: form.voice || '',
        rules: form.rules || '',
        avoid: form.avoid || '',
        audiences: form.audiences || [],
        products: form.products || [],
        notes: form.notes || '',
      };

      if (isNew) {
        await createBrand({ ...base, slug: slugify(form.name) + `-${Date.now().toString(36)}` });
        toast.success('Client created');
      } else {
        await updateBrand(params.id as string, base);
        toast.success('Client updated');
      }

      await refreshBrands();
      router.push('/clients');
    } catch (e: unknown) {
      const err = e as Record<string, unknown>;
      console.error('Client save error:', JSON.stringify(err), err?.message, err?.code, err?.details);
      const msg = (err?.message as string) || (isNew ? 'Failed to create client' : 'Failed to update client');
      toast.error(msg);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="h-96 bg-[#0E0E0E] border border-[#1A1A1A] rounded-lg animate-pulse" />;
  }

  return (
    <div>
      <PageHeader
        title={isNew ? 'Add Client' : `Edit ${form.name}`}
        actions={
          <Button variant="ghost" size="sm" onClick={() => router.push('/clients')}>
            ← Back
          </Button>
        }
      />

      {/* Step Indicators */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <button
            key={s}
            onClick={() => setStep(i)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs uppercase tracking-wider transition-all ${
              step === i
                ? 'bg-white text-black font-medium'
                : step > i
                ? 'bg-white/10 text-white'
                : 'text-[#555] hover:text-white'
            }`}
          >
            <span className="w-5 h-5 rounded-full border flex items-center justify-center text-[10px]">
              {step > i ? '✓' : i + 1}
            </span>
            {s}
          </button>
        ))}
      </div>

      <Card className="max-w-2xl">
        {step === 0 && (
          <BasicInfoStep form={form} onChange={onChange} pods={pods} managers={managers} designers={designers} />
        )}
        {step === 1 && (
          <VoiceRulesStep form={form} onChange={onChange} brandId={isNew ? undefined : params.id as string} />
        )}
        {step === 2 && (
          <DocumentsStep form={form} onChange={onChange} />
        )}
        {step === 3 && (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <p className="label-text">Client comments by month</p>
                <p className="text-[10px] text-[#555] mt-1">
                  Notes from calls, DMs, meetings — grouped by the month they were added.
                </p>
              </div>
              {!isNew && (
                <Link href={`/client-comments`}>
                  <Button variant="secondary" size="sm">
                    + Add comment
                  </Button>
                </Link>
              )}
            </div>
            {isNew ? (
              <div className="text-center py-12">
                <p className="text-[11px] text-[#555]">
                  Save the client first, then come back to add comments.
                </p>
              </div>
            ) : commentsLoading ? (
              <p className="text-[11px] text-[#555] text-center py-8">Loading…</p>
            ) : comments.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-[11px] text-[#555] mb-3">No comments yet for this client.</p>
                <Link href={`/client-comments`}>
                  <Button variant="secondary" size="sm">
                    Add the first comment
                  </Button>
                </Link>
              </div>
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
                    <div className="space-y-2">
                      {group.items.map((c) => (
                        <div
                          key={c.id}
                          className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-3"
                        >
                          <p className="text-[9px] uppercase tracking-wider text-[#666] mb-1">
                            {new Date(c.created_at).toLocaleDateString('en-AU', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                            {c.author_email && (
                              <span className="text-[#444] normal-case"> · {c.author_email}</span>
                            )}
                          </p>
                          <p className="text-[11px] text-[#e5e5e5] leading-relaxed whitespace-pre-wrap">
                            {c.content}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between mt-6 pt-4 border-t border-[#1A1A1A]">
          <div>
            {step > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setStep(s => s - 1)}>
                Previous
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={() => setStep(s => s + 1)}>
                Next
              </Button>
            ) : (
              <Button size="sm" onClick={handleSave} loading={saving}>
                {isNew ? 'Create Client' : 'Save Changes'}
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
