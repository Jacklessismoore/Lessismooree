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

// Page: US Letter 12240 DXA wide, 600 DXA each side margin = 11040 usable.
// Column widths for the consolidated findings table.
const COL_FLOW = 2600;
const COL_MESSAGE = 2000;
const COL_WINNER = 2200;
const COL_LIFT = 900;
const COL_WHY = 3340;

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

// Re-exported so the page can still import the type
export interface TestResultVariation {
  name: string;
  recipients: number;
  delivered: number;
  open_rate_pct: number;
  click_rate_pct: number;
  conversion_rate_pct: number;
  conversions: number;
  revenue: number;
  rpr: number;
}

export interface TestResultTest {
  flow_id: string;
  flow_name: string;
  flow_message_id: string;
  flow_message_label: string;
  variations: TestResultVariation[];
  server_suggested_winner: string | null;
  classification?: 'clear_winner' | 'no_revenue' | 'insufficient_sample' | 'too_close';
  lift_pct?: number | null;
}

export interface TestResultsExportInput {
  brandName: string;
  periodLabel: string;
  summary: string;
  insights: Record<string, string>;
  tests: TestResultTest[];
}

function verdictFor(t: TestResultTest): { text: string; color: string } {
  const ct = t.classification;
  if (ct === 'clear_winner' && t.server_suggested_winner) {
    return { text: t.server_suggested_winner, color: '0A7A3A' };
  }
  if (ct === 'too_close') return { text: 'Inconclusive — too close', color: '666666' };
  if (ct === 'no_revenue') return { text: 'Inconclusive — no revenue', color: '666666' };
  if (ct === 'insufficient_sample') return { text: 'Inconclusive — low sample', color: '666666' };
  return { text: 'Inconclusive', color: '666666' };
}

export async function exportTestResultsDocx(input: TestResultsExportInput): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // Title + period
  children.push(heading(`A/B Test Results — ${input.brandName}`, HeadingLevel.HEADING_1));
  children.push(para(input.periodLabel, { color: '666666', spacingAfter: 200 }));

  // Summary paragraph
  children.push(para(input.summary, { size: 22, spacingAfter: 240 }));

  // One consolidated findings table
  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      cell('Flow', COL_FLOW, { bold: true, bg: '1A1A1A' }),
      cell('Message', COL_MESSAGE, { bold: true, bg: '1A1A1A' }),
      cell('Winner', COL_WINNER, { bold: true, bg: '1A1A1A' }),
      cell('Lift', COL_LIFT, { bold: true, bg: '1A1A1A' }),
      cell('Why', COL_WHY, { bold: true, bg: '1A1A1A' }),
    ],
  });

  const dataRows = input.tests.map((t) => {
    const id = `${t.flow_id}:${t.flow_message_id}`;
    const why = input.insights[id] || '';
    const verdict = verdictFor(t);
    const liftText =
      t.classification === 'clear_winner' && t.lift_pct != null ? `+${t.lift_pct}%` : '—';
    return new TableRow({
      children: [
        cell(t.flow_name, COL_FLOW),
        cell(t.flow_message_label, COL_MESSAGE),
        cell(verdict.text, COL_WINNER, { color: verdict.color, bold: t.classification === 'clear_winner' }),
        cell(liftText, COL_LIFT, {
          color: t.classification === 'clear_winner' ? '0A7A3A' : '999999',
          bold: t.classification === 'clear_winner',
        }),
        cell(why, COL_WHY),
      ],
    });
  });

  children.push(
    new Table({
      layout: TableLayoutType.FIXED,
      columnWidths: [COL_FLOW, COL_MESSAGE, COL_WINNER, COL_LIFT, COL_WHY],
      borders: {
        top: BORDER.top,
        bottom: BORDER.bottom,
        left: BORDER.left,
        right: BORDER.right,
        insideHorizontal: BORDER.top,
        insideVertical: BORDER.left,
      },
      rows: [headerRow, ...dataRows],
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
  saveAs(blob, `${safeName}_AB_Test_Results_${new Date().toISOString().slice(0, 10)}.docx`);
}
