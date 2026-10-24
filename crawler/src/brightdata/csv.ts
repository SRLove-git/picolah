/**
 * Minimal RFC 4180 CSV reader.
 *
 * Bright Data dataset snapshots are CSV with quoted fields that may contain
 * commas, doubled quotes and embedded newlines (product descriptions), so a
 * plain `split(',')` is not enough. No external dependency needed.
 */
export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string): ParsedCsv {
  const content = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const headers: string[] = [];
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let sawHeader = false;

  const pushField = (): void => {
    row.push(field);
    field = '';
  };

  const pushRow = (): void => {
    if (!row.length) return;
    if (!sawHeader) {
      headers.push(...row);
      sawHeader = true;
    } else if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
    row = [];
  };

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (inQuotes) {
      if (char === '"') {
        if (content[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      pushField();
      continue;
    }
    if (char === '\n' || char === '\r') {
      if (char === '\r' && content[index + 1] === '\n') index += 1;
      pushField();
      pushRow();
      continue;
    }
    field += char;
  }

  if (inQuotes) throw new Error('CSV 解析失败：字段引号未闭合');
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return { headers, rows };
}

/** Parse a CSV document into plain header -> value records. */
export function parseCsvRecords(text: string): Array<Record<string, string>> {
  const { headers, rows } = parseCsv(text);
  return rows.map((row) => {
    const record: Record<string, string> = {};
    for (let index = 0; index < headers.length; index += 1) {
      record[headers[index]] = row[index] ?? '';
    }
    return record;
  });
}
