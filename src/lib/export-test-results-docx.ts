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
// Columns for the per-variation stats table.
const COL_VARIATION = 2200;
const COL_RECIPIENTS = 1200;
const COL_OPEN = 1300;
const COL_CLICK = 1300;
const COL_CONV = 1500;
const COL_REVENUE = 1700;
const COL_RPR = 1840;

const BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
};

function para(text: string, opts: Partial<{ bold: boolean; size: number; color: string; spacingAfter: number }> = {}) {
  return new Paragraph({
    spacing: { after: opts.spacingAfter ?? 80 },
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

function cell(text: string, width: number, opts: Partial<{ bold: boolean; bg: string }> = {}) {
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
            color: opts.bold ? 'FFFFFF' : '000000',
          }),
        ],
      }),
    ],
  });
}

function money(n: number): string {
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

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
}

export interface TestResultsExportInput {
  brandName: string;
  periodLabel: string;
  markdownReport: string; // The narrative report from the AI
  tests: TestResultTest[];
}

export async function exportTestResultsDocx(input: TestResultsExportInput): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // Title block
  children.push(heading(`A/B Test Results — ${input.brandName}`, HeadingLevel.HEADING_1));
  children.push(para(input.periodLabel, { color: '666666', spacingAfter: 200 }));

  // Narrative section from the AI. We render it as plain paragraphs (the AI
  // already formatted it with headings and bullets — we keep it simple here).
  children.push(heading('Narrative', HeadingLevel.HEADING_2));
  for (const line of input.markdownReport.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(para('', { spacingAfter: 80 }));
      continue;
    }
    if (trimmed.startsWith('# ')) {
      children.push(heading(trimmed.slice(2), HeadingLevel.HEADING_1));
    } else if (trimmed.startsWith('## ')) {
      children.push(heading(trimmed.slice(3), HeadingLevel.HEADING_2));
    } else if (trimmed.startsWith('### ')) {
      children.push(heading(trimmed.slice(4), HeadingLevel.HEADING_3));
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 60 },
          children: [new TextRun({ text: trimmed.slice(2), size: 22, font: 'Calibri' })],
        })
      );
    } else if (/^\|.*\|$/.test(trimmed)) {
      // Skip markdown table lines — we render our own tables below
      continue;
    } else {
      children.push(para(trimmed));
    }
  }

  // Raw data tables — one per test
  children.push(heading('Raw Data', HeadingLevel.HEADING_2));

  for (const test of input.tests) {
    children.push(heading(`${test.flow_name}`, HeadingLevel.HEADING_3));
    if (test.server_suggested_winner) {
      children.push(
        para(`Suggested winner: ${test.server_suggested_winner}`, { color: '0A7A3A', bold: true })
      );
    }

    // Header row
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        cell('Variation', COL_VARIATION, { bold: true, bg: '1A1A1A' }),
        cell('Recipients', COL_RECIPIENTS, { bold: true, bg: '1A1A1A' }),
        cell('Open', COL_OPEN, { bold: true, bg: '1A1A1A' }),
        cell('Click', COL_CLICK, { bold: true, bg: '1A1A1A' }),
        cell('Conv.', COL_CONV, { bold: true, bg: '1A1A1A' }),
        cell('Revenue', COL_REVENUE, { bold: true, bg: '1A1A1A' }),
        cell('RPR', COL_RPR, { bold: true, bg: '1A1A1A' }),
      ],
    });

    const dataRows = test.variations.map(
      (v) =>
        new TableRow({
          children: [
            cell(v.name, COL_VARIATION),
            cell(v.recipients.toLocaleString(), COL_RECIPIENTS),
            cell(`${v.open_rate_pct.toFixed(1)}%`, COL_OPEN),
            cell(`${v.click_rate_pct.toFixed(2)}%`, COL_CLICK),
            cell(`${v.conversion_rate_pct.toFixed(2)}%`, COL_CONV),
            cell(money(v.revenue), COL_REVENUE),
            cell(money(v.rpr), COL_RPR),
          ],
        })
    );

    children.push(
      new Table({
        layout: TableLayoutType.FIXED,
        columnWidths: [COL_VARIATION, COL_RECIPIENTS, COL_OPEN, COL_CLICK, COL_CONV, COL_REVENUE, COL_RPR],
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

    children.push(para('', { spacingAfter: 160 }));
  }

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
