export interface ParsedLevel {
  rows: string[];
  cols: number;
  numRows: number;
}

/**
 * Parse a multiline level string into padded rows.
 * - Trims leading and trailing fully-empty lines (typical from template literal newlines).
 * - Keeps interior empty lines (they become rows of all spaces).
 * - Pads every row to the longest row's length with spaces.
 */
export function parseLevel(level: string): ParsedLevel {
  const lines = level.split('\n');
  while (lines.length > 0 && lines[0].length === 0) lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].length === 0) lines.pop();
  const cols = lines.reduce((m, l) => Math.max(m, l.length), 0);
  const rows = lines.map((l) => l.padEnd(cols, ' '));
  return { rows, cols, numRows: rows.length };
}
