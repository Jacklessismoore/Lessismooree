'use client';

import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  WidthType,
  BorderStyle,
  HeadingLevel,
  TableLayoutType,
} from 'docx';
import { saveAs } from 'file-saver';

// Column widths for the scores summary table (US Letter 12240 DXA, 600 margins)
const COL_DIMENSION = 3500;
const COL_SCORE = 1500;
const COL_SUMMARY = 6040;

// Column widths for the action plan
const COL_ACTION = 5400;
const COL_OWNER = 2000;
const COL_PRIORITY = 1600;
const COL_EFFORT = 2040;

const BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
};

function para(text: string, opts: Partial<{ bold: boolean; size: number; color: string; spacingAfter: number }> = {}) {
  return new Paragraph({
    spacing: { after: opts.spacingAfter ?? 100 },
    children: [
      new TextRun({
        text,
        bold: opts.bold ?? false,
        size: opts.size ?? 22,
        color: opts.color,
        font: 'Calibri',
      }),
    ],
  });
}

function heading(text: string, level: typeof HeadingLevel[keyof typeof HeadingLevel]) {
  return new Paragraph({
    heading: level,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text, bold: true, font: 'Calibri' })],
  });
}

function cell(text: string, width: number, opts: Partial<{ bold: boolean; bg: string; color: string }> = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts.bg ? { fill: opts.bg } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: opts.bold ?? false,
            size: 20,
            font: 'Calibri',
            color: opts.color || (opts.bold && opts.bg ? 'FFFFFF' : '000000'),
          }),
        ],
      }),
    ],
  });
}

function bullet(text: string) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, size: 22, font: 'Calibri' })],
  });
}

const DIMENSION_LABELS: Record<string, string> = {
  flow_architecture: 'Flow Architecture',
  flow_performance: 'Flow Performance',
  campaign_performance: 'Campaign Performance',
  deliverability_health: 'Deliverability Health',
  list_health: 'List Health & Segmentation',
  revenue_attribution: 'Revenue Attribution',
  ab_testing: 'A/B Testing History',
  content_strategy: 'Content & Send Strategy',
};

const DIMENSION_ORDER = [
  'flow_architecture',
  'flow_performance',
  'campaign_performance',
  'deliverability_health',
  'list_health',
  'revenue_attribution',
  'ab_testing',
  'content_strategy',
];

// 0-100 band labels to match the page
function scoreLabel(n: number): { text: string; color: string } {
  if (n >= 90) return { text: 'World Class', color: '0A7A3A' };
  if (n >= 75) return { text: 'Strong', color: '0A7A3A' };
  if (n >= 60) return { text: 'Good', color: '558B2F' };
  if (n >= 40) return { text: 'Needs Work', color: 'B8860B' };
  if (n >= 20) return { text: 'Poor', color: 'C2410C' };
  return { text: 'Critical', color: 'B91C1C' };
}

export interface AuditDimensionContent {
  one_liner?: string;
  what_was_found?: string;
  what_is_working?: string;
  what_needs_fixing?: string;
  recommended_actions?: string[];
}

export interface AuditExportInput {
  brandName: string;
  vertical: string;
  periodLabel: string;
  overallScore: number;
  scores: Record<string, number>;
  overallSummary: string;
  topPriorities: string[];
  dimensions: Record<string, AuditDimensionContent>;
  actionPlan: Array<{ action: string; owner: string; priority: string; effort: string }>;
}

export async function exportAuditDocx(input: AuditExportInput): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // ── Title + meta ──
  children.push(heading(`Klaviyo Account Audit — ${input.brandName}`, HeadingLevel.HEADING_1));
  children.push(para(`${input.vertical} · ${input.periodLabel}`, { color: '666666', spacingAfter: 120 }));
  children.push(
    para(`Overall Score: ${Math.round(input.overallScore)} / 100`, { bold: true, size: 24, spacingAfter: 240 })
  );

  // ── Overall summary ──
  children.push(heading('Summary', HeadingLevel.HEADING_2));
  children.push(para(input.overallSummary, { spacingAfter: 200 }));

  // ── Top 3 priorities ──
  children.push(heading('Top 3 Priorities', HeadingLevel.HEADING_2));
  for (const p of input.topPriorities) {
    children.push(bullet(p));
  }
  children.push(para('', { spacingAfter: 120 }));

  // ── Scores table ──
  children.push(heading('Dimension Scores', HeadingLevel.HEADING_2));
  const scoresHeader = new TableRow({
    tableHeader: true,
    children: [
      cell('Dimension', COL_DIMENSION, { bold: true, bg: '1A1A1A' }),
      cell('Score', COL_SCORE, { bold: true, bg: '1A1A1A' }),
      cell('Summary', COL_SUMMARY, { bold: true, bg: '1A1A1A' }),
    ],
  });
  const scoreRows = DIMENSION_ORDER.map((key) => {
    const s = input.scores[key] || 0;
    const lbl = scoreLabel(s);
    const dim = input.dimensions[key];
    return new TableRow({
      children: [
        cell(DIMENSION_LABELS[key], COL_DIMENSION),
        cell(`${Math.round(s)} / 100 (${lbl.text})`, COL_SCORE, { color: lbl.color, bold: true }),
        cell(dim?.one_liner || '', COL_SUMMARY),
      ],
    });
  });
  children.push(
    new Table({
      layout: TableLayoutType.FIXED,
      columnWidths: [COL_DIMENSION, COL_SCORE, COL_SUMMARY],
      borders: {
        top: BORDER.top,
        bottom: BORDER.bottom,
        left: BORDER.left,
        right: BORDER.right,
        insideHorizontal: BORDER.top,
        insideVertical: BORDER.left,
      },
      rows: [scoresHeader, ...scoreRows],
    })
  );
  children.push(para('', { spacingAfter: 240 }));

  // ── Detailed findings ──
  children.push(heading('Detailed Findings', HeadingLevel.HEADING_1));

  for (const key of DIMENSION_ORDER) {
    const dim = input.dimensions[key];
    if (!dim) continue;
    const score = input.scores[key] || 0;
    const lbl = scoreLabel(score);

    children.push(heading(`${DIMENSION_LABELS[key]} — ${Math.round(score)}/100 (${lbl.text})`, HeadingLevel.HEADING_2));

    if (dim.what_was_found) {
      children.push(para('What we found', { bold: true }));
      children.push(para(dim.what_was_found, { spacingAfter: 120 }));
    }

    if (dim.what_is_working) {
      children.push(para('What is working', { bold: true, color: '0A7A3A' }));
      children.push(para(dim.what_is_working, { spacingAfter: 120 }));
    }

    if (dim.what_needs_fixing) {
      children.push(para('What needs fixing', { bold: true, color: 'B91C1C' }));
      children.push(para(dim.what_needs_fixing, { spacingAfter: 120 }));
    }

    if (dim.recommended_actions && dim.recommended_actions.length > 0) {
      children.push(para('Recommended actions', { bold: true }));
      for (const a of dim.recommended_actions) {
        children.push(bullet(a));
      }
      children.push(para('', { spacingAfter: 120 }));
    }
  }

  // ── Action plan table ──
  children.push(heading('Prioritised Action Plan', HeadingLevel.HEADING_1));

  const planHeader = new TableRow({
    tableHeader: true,
    children: [
      cell('Action', COL_ACTION, { bold: true, bg: '1A1A1A' }),
      cell('Owner', COL_OWNER, { bold: true, bg: '1A1A1A' }),
      cell('Priority', COL_PRIORITY, { bold: true, bg: '1A1A1A' }),
      cell('Effort', COL_EFFORT, { bold: true, bg: '1A1A1A' }),
    ],
  });
  const planRows = input.actionPlan.map((p) => {
    const priorityColor =
      p.priority.toLowerCase() === 'high'
        ? 'B91C1C'
        : p.priority.toLowerCase() === 'medium'
        ? 'B8860B'
        : '666666';
    return new TableRow({
      children: [
        cell(p.action, COL_ACTION),
        cell(p.owner, COL_OWNER),
        cell(p.priority, COL_PRIORITY, { color: priorityColor, bold: true }),
        cell(p.effort, COL_EFFORT),
      ],
    });
  });
  children.push(
    new Table({
      layout: TableLayoutType.FIXED,
      columnWidths: [COL_ACTION, COL_OWNER, COL_PRIORITY, COL_EFFORT],
      borders: {
        top: BORDER.top,
        bottom: BORDER.bottom,
        left: BORDER.left,
        right: BORDER.right,
        insideHorizontal: BORDER.top,
        insideVertical: BORDER.left,
      },
      rows: [planHeader, ...planRows],
    })
  );

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 600, right: 600, bottom: 600, left: 600 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safeName = input.brandName.replace(/[^a-z0-9]+/gi, '_');
  saveAs(blob, `${safeName}_Klaviyo_Audit_${new Date().toISOString().slice(0, 10)}.docx`);
}
