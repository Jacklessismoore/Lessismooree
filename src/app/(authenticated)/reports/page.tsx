'use client';

import { useState, useCallback } from 'react';
import { useApp } from '@/lib/app-context';
import { Brand } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { exportReportDocx } from '@/lib/export-report-docx';
import toast from 'react-hot-toast';

// Default to last 30 days
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultEnd() {
  return new Date().toISOString().slice(0, 10);
}

function ClientSelectionByManager({
  brands,
  onSelect,
}: {
  brands: Brand[];
  onSelect: (brand: Brand) => void;
}) {
  const groups: { managerName: string; brands: Brand[] }[] = [];
  const map = new Map<string, { managerName: string; brands: Brand[] }>();

  for (const brand of brands) {
    const mgrId = brand.manager_id || 'unassigned';
    const mgrName = brand.manager?.name || 'Unassigned';
    if (!map.has(mgrId)) {
      const group = { managerName: mgrName, brands: [] as Brand[] };
      map.set(mgrId, group);
      groups.push(group);
    }
    map.get(mgrId)!.brands.push(brand);
  }

  let animIndex = 0;

  return (
    <div className="space-y-8">
      {groups.map((group) => (
        <div key={group.managerName}>
          <div className="flex items-center gap-3 mb-3">
            <h3 className="text-[11px] font-bold text-white uppercase tracking-[0.15em]">
              {group.managerName}
            </h3>
            <div className="flex-1 h-px bg-white/[0.06]" />
            <span className="text-[9px] text-[#444]">
              {group.brands.length} client{group.brands.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {group.brands.map((brand) => {
              const idx = animIndex++;
              const hasKey = !!brand.klaviyo_api_key;
              return (
                <BrandCard
                  key={brand.id}
                  brand={brand}
                  onClick={hasKey ? () => onSelect(brand) : undefined}
                  showEdit={false}
                  showMenu={false}
                  animDelay={idx * 30}
                  subtitle={hasKey ? brand.category || 'Uncategorised' : 'No Klaviyo key'}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const { podBrands } = useApp();

  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [startDate, setStartDate] = useState(defaultStart());
  const [endDate, setEndDate] = useState(defaultEnd());
  const [prompt, setPrompt] = useState('');
  const [building, setBuilding] = useState(false);
  const [reportMd, setReportMd] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleSelectBrand = (brand: Brand) => {
    if (!brand.klaviyo_api_key) {
      toast.error('This client has no Klaviyo API key configured');
      return;
    }
    setSelectedBrand(brand);
    setReportMd(null);
  };

  const buildReport = useCallback(async () => {
    if (!selectedBrand) return;
    setBuilding(true);
    setReportMd(null);
    try {
      const res = await fetch('/api/reports/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          brandId: selectedBrand.id,
          prompt: prompt.trim(),
          startDate,
          endDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setReportMd(data.markdown);
      toast.success('Report ready');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to build report');
    } finally {
      setBuilding(false);
    }
  }, [selectedBrand, prompt, startDate, endDate]);

  const downloadDocx = useCallback(async () => {
    if (!selectedBrand || !reportMd) return;
    setExporting(true);
    try {
      await exportReportDocx({
        brandName: selectedBrand.name,
        createdAt: new Date().toISOString(),
        startDate,
        endDate,
        markdown: reportMd,
      });
      toast.success('Downloaded DOCX');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export');
    } finally {
      setExporting(false);
    }
  }, [selectedBrand, reportMd, startDate, endDate]);

  if (!selectedBrand) {
    return (
      <div>
        <PageHeader title="Reports" subtitle="Pick a client to build a report" />
        <div className="mt-8">
          {podBrands.length === 0 ? (
            <p className="text-sm text-[#666]">No clients in this pod yet.</p>
          ) : (
            <ClientSelectionByManager brands={podBrands} onSelect={handleSelectBrand} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Reports" subtitle="Build a Klaviyo performance report and export to DOCX" />

      <div className="mt-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="label-text">Client</p>
            <h2 className="text-2xl font-bold">{selectedBrand.name}</h2>
            <p className="text-xs text-[#666] mt-1">{selectedBrand.category || 'Uncategorised'}</p>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedBrand(null);
              setReportMd(null);
            }}
          >
            Change client
          </Button>
        </div>

        <Card className="p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider mb-4">Report inputs</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label-text mb-2 block">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="label-text mb-2 block">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          <label className="label-text mb-2 block">What do you want in this report?</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="e.g. flow performance for last 30 days, top 5 campaigns by revenue, open + click + revenue summary"
            className="w-full bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-sm"
          />
          <p className="text-[11px] text-[#555] mt-1">
            Leave blank to get a full default report (campaigns, flows, opens, clicks, revenue).
          </p>

          <div className="mt-4">
            <Button onClick={buildReport} disabled={building}>
              {building ? 'Building report (this can take ~30 seconds)…' : '✨ Build report'}
            </Button>
          </div>
        </Card>

        {reportMd && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider">Generated report</h3>
              <Button onClick={downloadDocx} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Export to DOCX'}
              </Button>
            </div>
            <textarea
              value={reportMd}
              onChange={(e) => setReportMd(e.target.value)}
              rows={28}
              className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-md p-4 text-[12px] text-[#ccc] font-mono"
            />
            <p className="text-[11px] text-[#555]">
              You can edit the markdown before exporting. Tables, headings, and bullets are preserved in the DOCX.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
