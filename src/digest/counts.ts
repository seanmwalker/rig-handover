import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RunStatus } from './types.js';

export type StatusCounts = Record<RunStatus, number>;

// Log lines per status for one night. Lines that do not parse or carry another status are skipped.
// Returns null when the file cannot be read.
export function countLines(runsDir: string, night: string): StatusCounts | null {
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch {
    return null;
  }
  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const status: unknown = JSON.parse(line)?.status;
      if (status === 'ok' || status === 'retry' || status === 'fail') counts[status] += 1;
    } catch {
      // bad line: the digest page reports it
    }
  }
  return counts;
}
