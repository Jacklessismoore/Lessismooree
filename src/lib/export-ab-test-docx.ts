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
  AlignmentType,
  HeadingLevel,
  TableLayoutType,
} from 'docx';
import { saveAs } from 'file-saver';

// Page: US Letter 12240 DXA wide, 600 DXA left/right margin = 11040 usable.
// Column split 18 / 41 / 41 % for Label / Subject / Preview.
const COL_LABEL = 1987;
const COL_SUBJECT = 4526;
const COL_PREVIEW = 4527;

const BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
};

function p(text: string, opts: Partial<{ bold: boolean; size: number; color: string; spacingAfter: number }> = {}) {
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
          }),
        ],
      }),
    ],
  });
}

export interface ABTestDoc {
  brandName: string;
  createdAt: string; // ISO
  hypothesis: string | null;
  managerName: string | null;
  tests: Array<{
    flow_name: string;
    flow_message_label: string | null;
    flow_message_id: string;
    hypothesis: string | null;
    original_subject: string | null;
    original_preview: string | null;
    variant_subject: string;
    variant_preview: string | null;
  }>;
}

export async function exportABTestDocx(doc: ABTestDoc) {
  const dateStr = new Date(doc.createdAt).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const children: (Paragraph | Table)[] = [];

  // Header
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 120 },
      children: [
        new TextRun({ text: `${doc.brandName} — Flow A/B Test Plan`, bold: true, size: 32, font: 'Calibri' }),
      ],
    })
  );
  children.push(p(`Generated ${dateStr}${doc.managerName ? ` by ${doc.managerName}` : ''}`, { color: '888888', size: 20 }));
  if (doc.hypothesis) {
    children.push(p(`Round theme: ${doc.hypothesis}`, { color: '555555' }));
  }
  children.push(p(''));

  // One test per section
  doc.tests.forEach((t, i) => {
    children.push(heading(`Test ${i + 1}: ${t.flow_name} — ${t.flow_message_label || 'Email'}`, HeadingLevel.HEADING_2));
    children.push(p(`Flow message ID: ${t.flow_message_id}`, { color: '888888', size: 18 }));
    if (t.hypothesis) {
      children.push(p(`Why: ${t.hypothesis}`));
    }

    const table = new Table({
      layout: TableLayoutType.FIXED,
      width: { size: 100, type: WidthType.PERCENTAGE },
      columnWidths: [COL_LABEL, COL_SUBJECT, COL_PREVIEW],
      borders: {
        top: BORDER.top,
        bottom: BORDER.bottom,
        left: BORDER.left,
        right: BORDER.right,
        insideHorizontal: BORDER.top,
        insideVertical: BORDER.top,
      },
      rows: [
        new TableRow({
          children: [
            cell('', COL_LABEL, { bg: 'F5F5F5' }),
            cell('Subject line', COL_SUBJECT, { bold: true, bg: 'F5F5F5' }),
            cell('Preview text', COL_PREVIEW, { bold: true, bg: 'F5F5F5' }),
          ],
        }),
        new TableRow({
          children: [
            cell('Variant A (Control)', COL_LABEL, { bold: true }),
            cell(t.original_subject || '(empty)', COL_SUBJECT),
            cell(t.original_preview || '(empty)', COL_PREVIEW),
          ],
        }),
        new TableRow({
          children: [
            cell('Variant B (Challenger)', COL_LABEL, { bold: true }),
            cell(t.variant_subject, COL_SUBJECT),
            cell(t.variant_preview || '(empty)', COL_PREVIEW),
          ],
        }),
      ],
    });
    children.push(table);
    children.push(p(''));
    children.push(p('Winning metric: revenue per recipient', { color: '555555', size: 20 }));
    children.push(p('Minimum runtime: 1 week', { color: '555555', size: 20 }));
    children.push(p(''));
  });

  const docxDoc = new Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 600, right: 600 },
            size: { width: 12240, height: 15840 }, // US Letter
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(docxDoc);
  const safeName = doc.brandName.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const dateSlug = new Date(doc.createdAt).toISOString().slice(0, 10);
  saveAs(blob, `${safeName}_flow_ab_tests_${dateSlug}.docx`);
}
