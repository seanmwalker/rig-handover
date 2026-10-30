import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './read.js';
import type { RunStatus } from './types.js';

export type StatusCounts = Record<RunStatus, number>;

// Log lines per status for one night, parsed the same way as the digest. Bad lines are skipped:
// the digest page reports them. Returns null when the file cannot be read.
export function countLines(runsDir: string, night: string): StatusCounts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of text.split('\n')) {
    const line = raw.trim() === '' ? null : parseLine(raw);
    if (line) counts[line.status] += 1;
  }
  return counts;
}
