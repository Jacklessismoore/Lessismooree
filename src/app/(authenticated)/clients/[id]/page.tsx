'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/lib/app-context';
import { getBrand, createBrand, updateBrand } from '@/lib/db';
import { slugify } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BasicInfoStep, VoiceRulesStep, DocumentsStep, FormState } from '@/components/clients/client-form-steps';
import toast from 'react-hot-toast';

const STEPS = ['Basics', 'Voice & Rules', 'Documents'];

export default function ClientFormPage() {
  const params = useParams();
  const router = useRouter();
  const { pods, managers, designers, selectedPod, refreshBrands } = useApp();

  const isNew = params.id === 'new';
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);

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
    slack_channel_id: '',
    voice: '',
    rules: '',
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
            slack_channel_id: brand.slack_channel_id || '',
            voice: brand.voice,
            rules: brand.rules,
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
        slack_channel_id: form.slack_channel_id || '',
        voice: form.voice || '',
        rules: form.rules || '',
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

        <div className="flex justify-between mt-6 pt-4 border-t border-[#1A1A1A]">
          <div>
            {step > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setStep(s => s - 1)}>
                Previous
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {step < 2 ? (
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
