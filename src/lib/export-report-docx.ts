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

// Render a single line of inline markdown (only **bold** is parsed)
function renderInline(text: string, opts: { bold?: boolean; size?: number } = {}): TextRun[] {
  const runs: TextRun[] = [];
  let i = 0;
  while (i < text.length) {
    const next = text.indexOf('**', i);
    if (next === -1) {
      runs.push(new TextRun({ text: text.slice(i), bold: opts.bold ?? false, size: opts.size ?? 22, font: 'Calibri' }));
      break;
    }
    if (next > i) {
      runs.push(new TextRun({ text: text.slice(i, next), bold: opts.bold ?? false, size: opts.size ?? 22, font: 'Calibri' }));
    }
    const close = text.indexOf('**', next + 2);
    if (close === -1) {
      runs.push(new TextRun({ text: text.slice(next), bold: opts.bold ?? false, size: opts.size ?? 22, font: 'Calibri' }));
      break;
    }
    runs.push(new TextRun({ text: text.slice(next + 2, close), bold: true, size: opts.size ?? 22, font: 'Calibri' }));
    i = close + 2;
  }
  return runs;
}

function paraInline(text: string, opts: { bold?: boolean; size?: number; spacingAfter?: number } = {}) {
  return new Paragraph({
    spacing: { after: opts.spacingAfter ?? 80 },
    children: renderInline(text, opts),
  });
}

function cell(text: string, width: number, opts: Partial<{ bold: boolean; bg: string }> = {}) {
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    shading: opts.bg ? { fill: opts.bg } : undefined,
    margins: { top: 100, bottom: 100, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: renderInline(text, { bold: opts.bold ?? false, size: 20 }),
      }),
    ],
  });
}

// Parse a markdown table block into rows of cells
function parseTable(lines: string[]): string[][] {
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.trim().startsWith('|')) break;
    if (/^\|\s*-+/.test(line.trim())) continue; // skip separator
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

function tableFromRows(rows: string[][]): Table {
  // US Letter usable width = 11040 DXA
  const colCount = Math.max(...rows.map((r) => r.length));
  const colWidth = Math.floor(11040 / colCount);
  const widths = Array.from({ length: colCount }, () => colWidth);

  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths,
    borders: {
      top: BORDER.top,
      bottom: BORDER.bottom,
      left: BORDER.left,
      right: BORDER.right,
      insideHorizontal: BORDER.top,
      insideVertical: BORDER.top,
    },
    rows: rows.map(
      (r, i) =>
        new TableRow({
          children: r.map((c) =>
            cell(c, widths[0], { bold: i === 0, bg: i === 0 ? 'F5F5F5' : undefined })
          ),
        })
    ),
  });
}

export interface ReportDoc {
  brandName: string;
  createdAt: string; // ISO
  startDate: string;
  endDate: string;
  markdown: string;
}

export async function exportReportDocx(doc: ReportDoc) {
  const dateStr = new Date(doc.createdAt).toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const children: (Paragraph | Table)[] = [];

  // Branded header
  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: `${doc.brandName} Performance Report`, bold: true, size: 32, font: 'Calibri' }),
      ],
    })
  );
  children.push(p(`${doc.startDate} to ${doc.endDate}`, { color: '555555', size: 22 }));
  children.push(p(`Generated ${dateStr}`, { color: '888888', size: 18 }));
  children.push(p(''));

  // Parse markdown line-by-line, building paragraphs / tables
  const lines = doc.markdown.split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Skip the brand title since we already rendered it
    if (/^#\s/.test(trimmed)) {
      const text = trimmed.replace(/^#+\s*/, '');
      // First H1 is usually the brand title — skip if it matches
      if (i < 5 && text.toLowerCase().includes(doc.brandName.toLowerCase())) {
        i += 1;
        continue;
      }
      children.push(heading(text, HeadingLevel.HEADING_1));
      i += 1;
      continue;
    }

    if (/^##\s/.test(trimmed)) {
      children.push(heading(trimmed.replace(/^#+\s*/, ''), HeadingLevel.HEADING_2));
      i += 1;
      continue;
    }

    if (/^###\s/.test(trimmed)) {
      children.push(heading(trimmed.replace(/^#+\s*/, ''), HeadingLevel.HEADING_3));
      i += 1;
      continue;
    }

    // Table
    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      const rows = parseTable(tableLines);
      if (rows.length > 0) {
        children.push(tableFromRows(rows));
        children.push(p(''));
      }
      continue;
    }

    // Bullet list
    if (/^[-*]\s/.test(trimmed)) {
      children.push(
        new Paragraph({
          spacing: { after: 60 },
          bullet: { level: 0 },
          children: renderInline(trimmed.replace(/^[-*]\s*/, ''), { size: 22 }),
        })
      );
      i += 1;
      continue;
    }

    // Empty line
    if (!trimmed) {
      i += 1;
      continue;
    }

    // Plain paragraph
    children.push(paraInline(trimmed));
    i += 1;
  }

  const docxDoc = new Document({
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 600, right: 600 },
            size: { width: 12240, height: 15840 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(docxDoc);
  const safeName = doc.brandName.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  const dateSlug = new Date(doc.createdAt).toISOString().slice(0, 10);
  saveAs(blob, `${safeName}_report_${dateSlug}.docx`);
}
