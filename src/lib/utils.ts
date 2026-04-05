import { Brand } from './types';

export function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'iso' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (format === 'iso') return d.toISOString().split('T')[0];
  if (format === 'long') {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function generateDocHtml(
  title: string,
  sections: { label: string; value: string }[],
  brand?: Brand
): string {
  const rows = sections
    .map(
      (s) =>
        `<tr><td class="label">${s.label}</td><td class="value">${s.value.replace(/\n/g, '<br/>')}</td></tr>`
    )
    .join('\n');

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap');
  body { font-family: 'Poppins', Arial, sans-serif; color: #222; padding: 24px; }
  h1 { font-size: 20px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  h2 { font-size: 14px; color: #666; font-weight: 400; margin-top: 0; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; }
  td { border: 1px solid #ddd; padding: 10px 14px; vertical-align: top; font-size: 13px; line-height: 1.6; }
  .label { width: 28%; background: #f7f7f7; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; font-size: 11px; color: #444; }
  .value { width: 72%; }
</style>
</head>
<body>
  <h1>${title}</h1>
  ${brand ? `<h2>${brand.name} — ${brand.category}</h2>` : ''}
  <table>${rows}</table>
</body>
</html>`;
}

export function downloadAsDoc(filename: string, htmlContent: string): void {
  const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function copyToClipboard(text: string): Promise<void> {
  // Try modern API first, fall back to execCommand for non-HTTPS
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}

function fallbackCopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (err) {
      reject(err);
    } finally {
      document.body.removeChild(textarea);
    }
  });
}
