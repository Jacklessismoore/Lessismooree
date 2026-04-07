'use client';

import { useState, useCallback, useMemo } from 'react';
import { useApp } from '@/lib/app-context';
import { Brand } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { BrandCard } from '@/components/ui/brand-card';
import { exportReportDocx } from '@/lib/export-report-docx';
import toast from 'react-hot-toast';

// =====================================================================
// Lightweight markdown renderer for the report. Handles headings, bold,
// pipe tables, and bullet lists. No new dependencies.
// =====================================================================

function renderInline(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const open = text.indexOf('**', i);
    if (open === -1) {
      out.push(<span key={key++}>{text.slice(i)}</span>);
      break;
    }
    if (open > i) out.push(<span key={key++}>{text.slice(i, open)}</span>);
    const close = text.indexOf('**', open + 2);
    if (close === -1) {
      out.push(<span key={key++}>{text.slice(open)}</span>);
      break;
    }
    out.push(
      <strong key={key++} className="text-white">
        {text.slice(open + 2, close)}
      </strong>
    );
    i = close + 2;
  }
  return out;
}

function MarkdownReport({ markdown }: { markdown: string }) {
  const blocks = useMemo(() => {
    const lines = markdown.split('\n');
    const out: React.ReactNode[] = [];
    let i = 0;
    let key = 0;
    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();

      // Headings
      if (/^####\s/.test(trimmed)) {
        out.push(
          <h4 key={key++} className="text-[12px] font-bold text-white uppercase tracking-wider mt-5 mb-2">
            {trimmed.replace(/^#+\s*/, '')}
          </h4>
        );
        i += 1;
        continue;
      }
      if (/^###\s/.test(trimmed)) {
        out.push(
          <h3 key={key++} className="text-sm font-bold text-white mt-5 mb-2">
            {trimmed.replace(/^#+\s*/, '')}
          </h3>
        );
        i += 1;
        continue;
      }
      if (/^##\s/.test(trimmed)) {
        out.push(
          <h2 key={key++} className="text-base font-bold text-white mt-6 mb-3 uppercase tracking-wider">
            {trimmed.replace(/^#+\s*/, '')}
          </h2>
        );
        i += 1;
        continue;
      }
      if (/^#\s/.test(trimmed)) {
        out.push(
          <h1 key={key++} className="text-xl font-bold text-white mt-6 mb-3">
            {trimmed.replace(/^#+\s*/, '')}
          </h1>
        );
        i += 1;
        continue;
      }

      // Pipe table
      if (trimmed.startsWith('|')) {
        const tbl: string[] = [];
        while (i < lines.length && lines[i].trim().startsWith('|')) {
          tbl.push(lines[i]);
          i += 1;
        }
        const rows = tbl
          .filter((l) => !/^\|\s*-+/.test(l.trim()))
          .map((l) =>
            l
              .trim()
              .replace(/^\||\|$/g, '')
              .split('|')
              .map((c) => c.trim())
          );
        if (rows.length > 0) {
          const [header, ...body] = rows;
          out.push(
            <div key={key++} className="my-4 overflow-x-auto">
              <table className="w-full text-[12px] border border-white/[0.06] rounded-lg overflow-hidden">
                <thead className="bg-[#0a0a0a]">
                  <tr>
                    {header.map((c, ci) => (
                      <th key={ci} className="text-left p-2 text-[10px] uppercase tracking-wider text-[#888] font-bold border-b border-white/[0.06]">
                        {renderInline(c)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, ri) => (
                    <tr key={ri} className="border-b border-white/[0.04] last:border-b-0">
                      {row.map((c, ci) => (
                        <td key={ci} className="p-2 text-[#ccc] align-top">
                          {renderInline(c)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        continue;
      }

      // Bullet
      if (/^[-*]\s/.test(trimmed)) {
        const items: string[] = [];
        while (i < lines.length && /^[-*]\s/.test(lines[i].trim())) {
          items.push(lines[i].trim().replace(/^[-*]\s*/, ''));
          i += 1;
        }
        out.push(
          <ul key={key++} className="list-disc pl-5 my-2 space-y-1 text-[12px] text-[#ccc]">
            {items.map((it, ii) => (
              <li key={ii}>{renderInline(it)}</li>
            ))}
          </ul>
        );
        continue;
      }

      // Empty line
      if (!trimmed) {
        i += 1;
        continue;
      }

      // Paragraph
      out.push(
        <p key={key++} className="text-[12px] text-[#ccc] my-2 leading-relaxed">
          {renderInline(trimmed)}
        </p>
      );
      i += 1;
    }
    return out;
  }, [markdown]);

  return <div className="report-rendered">{blocks}</div>;
}

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
  const [showRaw, setShowRaw] = useState(false);

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
    const loadingToast = toast.loading('Building report. This can take 30-50 seconds…');
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
      let data: { markdown?: string; error?: string; raw?: string } = {};
      try {
        data = await res.json();
      } catch {
        // gateway timeout returns no body
      }
      if (!res.ok) {
        throw new Error(
          data.error ||
            (res.status === 504
              ? 'The Klaviyo report timed out (60s). Try a narrower request or shorter date range.'
              : `Failed (${res.status})`)
        );
      }
      if (!data.markdown) throw new Error('AI returned no markdown');
      setReportMd(data.markdown);
      toast.success('Report ready', { id: loadingToast });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to build report', { id: loadingToast });
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
              {building ? 'Building report (this can take ~30 seconds)…' : 'Build report'}
            </Button>
          </div>
        </Card>

        {reportMd && (
          <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-bold uppercase tracking-wider">Generated report</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="secondary" onClick={() => setShowRaw((v) => !v)}>
                  {showRaw ? 'Show formatted' : 'Show raw markdown'}
                </Button>
                <Button onClick={downloadDocx} disabled={exporting}>
                  {exporting ? 'Exporting…' : 'Export to DOCX'}
                </Button>
              </div>
            </div>

            {showRaw ? (
              <textarea
                value={reportMd}
                onChange={(e) => setReportMd(e.target.value)}
                rows={28}
                className="w-full bg-[#0a0a0a] border border-white/[0.06] rounded-md p-4 text-[12px] text-[#ccc] font-mono"
              />
            ) : (
              <div className="bg-[#0a0a0a] border border-white/[0.06] rounded-md p-6 max-h-[700px] overflow-y-auto">
                <MarkdownReport markdown={reportMd} />
              </div>
            )}

            <p className="text-[11px] text-[#555]">
              Toggle to raw markdown if you want to edit the report before exporting. The DOCX will reflect whatever is in the markdown.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
