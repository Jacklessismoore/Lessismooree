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
  ShadingType,
  TableLayoutType,
} from 'docx';
import { saveAs } from 'file-saver';
import { parseBriefOutput } from './brief-parser';

const BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' },
};

function makeHeaderRow(text: string, subtext?: string): TableRow {
  const children = [
    new Paragraph({
      spacing: { after: subtext ? 60 : 0 },
      children: [
        new TextRun({ text: text.toUpperCase(), bold: true, size: 24, font: 'Calibri' }),
      ],
    }),
  ];
  if (subtext) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: subtext, size: 18, font: 'Calibri', color: '888888' }),
        ],
      })
    );
  }
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: BORDER,
        shading: { type: ShadingType.SOLID, color: 'F5F5F0' },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children,
      }),
    ],
  });
}

function makeSectionHeader(heading: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: BORDER,
        shading: { type: ShadingType.SOLID, color: 'EEEEEE' },
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: heading.toUpperCase(),
                bold: true,
                size: 20,
                font: 'Calibri',
                color: '333333',
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function makeLabelValueRow(label: string, value: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 30, type: WidthType.PERCENTAGE },
        borders: BORDER,
        shading: { type: ShadingType.SOLID, color: 'FAFAFA' },
        margins: { top: 80, bottom: 80, left: 140, right: 100 },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: label.toUpperCase(),
                bold: true,
                size: 18,
                font: 'Calibri',
                color: '996600',
              }),
            ],
          }),
        ],
      }),
      new TableCell({
        width: { size: 70, type: WidthType.PERCENTAGE },
        borders: BORDER,
        margins: { top: 80, bottom: 80, left: 140, right: 140 },
        children: value.split('\n').filter(l => l.trim()).map(
          line => new Paragraph({
            spacing: { after: 60 },
            children: [
              new TextRun({ text: line, size: 22, font: 'Calibri', color: '333333' }),
            ],
          })
        ),
      }),
    ],
  });
}

function makeFullWidthRow(text: string): TableRow {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: 2,
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: BORDER,
        margins: { top: 60, bottom: 60, left: 120, right: 120 },
        children: text.split('\n').filter(l => l.trim()).map(
          line => new Paragraph({
            spacing: { after: 40 },
            children: [
              new TextRun({ text: line, size: 20, font: 'Calibri', color: '444444' }),
            ],
          })
        ),
      }),
    ],
  });
}

export async function exportBriefAsDocx(
  title: string,
  brandName: string,
  category: string,
  briefType: string,
  output: string,
): Promise<void> {
  const sections = parseBriefOutput(output);
  const rows: TableRow[] = [];

  // Title header
  rows.push(makeHeaderRow(title, `${brandName} — ${category} — ${briefType}`));

  // Sections
  for (const section of sections) {
    rows.push(makeSectionHeader(section.heading));

    if (section.subsections && section.subsections.length > 0) {
      for (const sub of section.subsections) {
        if (!sub.label && sub.value) {
          rows.push(makeFullWidthRow(sub.value));
        } else if (sub.label) {
          rows.push(makeLabelValueRow(sub.label, sub.value));
        }
      }
    } else if (section.content.trim()) {
      rows.push(makeFullWidthRow(section.content.trim()));
    }
  }

  const table = new Table({
    layout: TableLayoutType.FIXED,
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 600, bottom: 600, left: 600, right: 600 },
          size: { width: 12240, height: 15840 }, // US Letter
        },
      },
      children: [table],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${title || 'brief'}.docx`);
}
