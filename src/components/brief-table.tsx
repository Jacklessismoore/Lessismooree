'use client';

import { useMemo } from 'react';
import { parseBriefOutput, BriefSection } from '@/lib/brief-parser';
import { cn } from '@/lib/utils';

interface BriefTableProps {
  output: string;
  className?: string;
}

function renderCopy(text: string) {
  // Clean up any literal <br> tags the AI might produce
  let cleaned = text.replace(/<br\s*\/?>/gi, '\n');

  // Render {{design cues}} as styled inline elements
  const parts = cleaned.split(/(\{\{[^}]+\}\})/g);
  return parts.map((part, i) => {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      const cue = part.slice(2, -2);
      return (
        <span key={i} className="inline-flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.06] rounded px-2 py-0.5 text-[10px] text-[#888] italic my-1">
          <span className="text-[#666]">🎨</span>
          {cue}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function SectionRow({ section, isLast }: { section: BriefSection; isLast: boolean }) {
  // Determine if this is a CTA row, product CTA, pattern break, or trust block for special styling
  const headingLower = section.heading.toLowerCase();
  const isCTA = headingLower.includes('cta') || headingLower === 'shop all';
  const isPatternBreak = headingLower.includes('pattern break');
  const isTrustBlock = headingLower.includes('trust block');
  const isHeader = headingLower === 'header' || headingLower === 'hero headline';
  const isSubheader = headingLower === 'subheader' || headingLower === 'hero subheadline';

  const copyValue = section.subsections?.[0]?.value || section.content.trim();

  return (
    <>
      {/* Desktop: table row */}
      <tr className={cn(
        'hidden sm:table-row border-b border-white/[0.04] hover:bg-white/[0.01] transition-colors',
        isPatternBreak && 'bg-white/[0.02]',
        isTrustBlock && 'bg-white/[0.02]',
        isLast && 'border-b-0',
      )}>
        <td className="px-4 py-3 w-[140px] sm:w-[160px] align-top border-r border-white/[0.04]">
          <span className={cn(
            'text-[10px] uppercase tracking-[0.1em] font-semibold',
            isCTA ? 'text-[#10B981]' : isHeader || isSubheader ? 'text-white' : 'text-[#F59E0B]'
          )}>
            {section.heading}
          </span>
        </td>
        <td className="px-4 py-3 align-top">
          <div className={cn(
            'text-[12px] leading-relaxed whitespace-pre-wrap',
            isCTA ? 'text-white font-semibold' : isHeader ? 'text-white font-bold text-[14px]' : isSubheader ? 'text-[#ccc]' : isPatternBreak ? 'text-white italic' : 'text-[#999]'
          )}>
            {renderCopy(copyValue)}
          </div>
        </td>
      </tr>

      {/* Mobile: stacked layout */}
      <tr className={cn(
        'sm:hidden border-b border-white/[0.04]',
        isPatternBreak && 'bg-white/[0.02]',
        isTrustBlock && 'bg-white/[0.02]',
        isLast && 'border-b-0',
      )}>
        <td colSpan={2} className="px-3 py-2.5">
          <span className={cn(
            'text-[9px] uppercase tracking-[0.1em] font-semibold block mb-1',
            isCTA ? 'text-[#10B981]' : isHeader || isSubheader ? 'text-white' : 'text-[#F59E0B]'
          )}>
            {section.heading}
          </span>
          <div className={cn(
            'text-[11px] leading-relaxed whitespace-pre-wrap',
            isCTA ? 'text-white font-semibold' : isHeader ? 'text-white font-bold text-[13px]' : isSubheader ? 'text-[#ccc]' : isPatternBreak ? 'text-white italic' : 'text-[#999]'
          )}>
            {renderCopy(copyValue)}
          </div>
        </td>
      </tr>
    </>
  );
}

const HIDDEN_SECTIONS = ['send notes', 'designer notes', 'subject line', 'preview text', 'design direction'];

export function BriefTable({ output, className }: BriefTableProps) {
  const allSections = useMemo(() => parseBriefOutput(output), [output]);
  const sections = useMemo(
    () => allSections.filter(s => !HIDDEN_SECTIONS.includes(s.heading.toLowerCase())),
    [allSections]
  );

  if (sections.length === 0) {
    return (
      <pre className="whitespace-pre-wrap text-[11px] text-[#777] font-[Poppins] leading-relaxed">
        {output}
      </pre>
    );
  }

  return (
    <div className={cn('overflow-hidden rounded-lg border border-white/[0.04]', className)}>
      <table className="w-full">
        <tbody>
          {sections.map((section, i) => (
            <SectionRow
              key={i}
              section={section}
              isLast={i === sections.length - 1}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
