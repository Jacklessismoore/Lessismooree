// Parses AI-generated brief output into structured sections for table display
// Supports both the new table format (| Section | Copy |) and legacy heading-based format

export interface BriefSection {
  heading: string;
  content: string;
  subsections?: { label: string; value: string }[];
}

/**
 * Parses a raw brief output string into structured sections.
 * New format: | Section | Copy | markdown table
 * Legacy format: ALL CAPS headings with - Label: Value subsections
 */
export function parseBriefOutput(raw: string): BriefSection[] {
  // Detect if this is the new table format
  if (raw.includes('| Section | Copy |') || raw.includes('| ----- | ----- |')) {
    return parseTableFormat(raw);
  }
  // Fall back to legacy format
  return parseLegacyFormat(raw);
}

function parseTableFormat(raw: string): BriefSection[] {
  const sections: BriefSection[] = [];
  const lines = raw.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip header row and separator row
    if (trimmed === '| Section | Copy |' || /^\|[\s-:|]+\|[\s-:|]+\|$/.test(trimmed)) {
      continue;
    }

    // Parse table rows: | Section Name | Copy content |
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const cells = trimmed.split('|').filter(c => c.trim() !== '');
      if (cells.length >= 2) {
        const sectionName = cells[0].trim().replace(/\*\*/g, '');
        const copyContent = cells.slice(1).join('|').trim().replace(/\*\*/g, '');

        sections.push({
          heading: sectionName,
          content: copyContent,
          subsections: [{ label: '', value: copyContent }],
        });
      }
    }
  }

  return sections.filter(s => s.heading && s.content);
}

function parseLegacyFormat(raw: string): BriefSection[] {
  const sections: BriefSection[] = [];
  const lines = raw.split('\n');

  let currentSection: BriefSection | null = null;
  let currentSubLabel: string | null = null;
  let currentSubValue: string[] = [];

  const flushSub = () => {
    if (currentSection && currentSubLabel && currentSubValue.length > 0) {
      if (!currentSection.subsections) currentSection.subsections = [];
      currentSection.subsections.push({
        label: currentSubLabel,
        value: currentSubValue.join('\n').trim(),
      });
    }
    currentSubLabel = null;
    currentSubValue = [];
  };

  const flushSection = () => {
    flushSub();
    if (currentSection) {
      if (!currentSection.subsections || currentSection.subsections.length === 0) {
        if (currentSection.content.trim()) {
          currentSection.subsections = [{
            label: '',
            value: currentSection.content.trim(),
          }];
        }
      }
      sections.push(currentSection);
    }
    currentSection = null;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim()
      .replace(/^\#{1,3}\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/^\-{3,}$/, '');

    if (!trimmed) continue;

    const isHeader = /^[A-Z][A-Z\s\d/():.&—-]{2,}$/.test(trimmed.replace(/[:(].*$/, '').trim())
      && trimmed.length > 2
      && trimmed.length < 80
      && !trimmed.startsWith('-')
      && !trimmed.startsWith('•');

    if (isHeader) {
      flushSection();
      currentSection = { heading: trimmed.replace(/:$/, ''), content: '' };
      continue;
    }

    if (!currentSection) {
      if (trimmed) {
        if (!sections.length || sections[sections.length - 1].heading !== 'Overview') {
          flushSection();
          currentSection = { heading: 'Overview', content: '' };
        } else {
          currentSection = sections.pop()!;
        }
        currentSection.content += trimmed + '\n';
      }
      continue;
    }

    const subMatch = trimmed.match(/^(?:[-•]\s*)?([A-Za-z][A-Za-z\s/()]+?):\s*(.*)$/);
    if (subMatch && subMatch[1].length < 40) {
      flushSub();
      currentSubLabel = subMatch[1].trim();
      currentSubValue = subMatch[2] ? [subMatch[2]] : [];
      continue;
    }

    const letterMatch = trimmed.match(/^([A-C]):\s+(.+)$/);
    if (letterMatch) {
      flushSub();
      currentSubLabel = `Option ${letterMatch[1]}`;
      currentSubValue = [letterMatch[2]];
      continue;
    }

    if (currentSubLabel) {
      currentSubValue.push(trimmed);
    } else {
      currentSection.content += trimmed + '\n';
    }
  }

  flushSection();

  return sections.filter(s =>
    (s.subsections && s.subsections.length > 0) ||
    s.content.trim().length > 0
  );
}
