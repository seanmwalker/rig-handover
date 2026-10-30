import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs sorted by job and counts the 1 bad line', () => {
    expect(night?.night).toBe('2026-10-28');
    expect(night?.badLines).toBe(1);
    expect(night?.rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
  });

  it('counts runs and retries, keeps the last status and the log offset', () => {
    const rows = night?.rows ?? [];
    expect(rows.find((r) => r.job === 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    const sync = rows.find((r) => r.job === 'lane/sync');
    expect(sync).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' });
    expect(rows.find((r) => r.job === 'notes/backup')).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded', owner: 'lane-07' });
    expect(rows.find((r) => r.job === 'digest/render')?.owner).toBeNull();
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null when the file does not exist', () => {
    expect(readNight(dir, '1999-01-01')).toBeNull();
  });

  it('gives no rows and no bad lines for an empty file', () => {
    writeFileSync(join(dir, 'empty.jsonl'), '');
    expect(readNight(dir, 'empty')).toEqual({ night: 'empty', rows: [], badLines: 0 });
  });

  it('keeps a row with a null owner', () => {
    writeFileSync(join(dir, 'nullowner.jsonl'), '{"at":"2026-10-29T05:41:09+01:00","job":"a","status":"ok","owner":null}\n');
    expect(readNight(dir, 'nullowner')?.rows).toEqual([
      { job: 'a', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
    ]);
  });

  it('counts valid JSON with a bad status or missing fields as bad lines', () => {
    writeFileSync(
      join(dir, 'shape.jsonl'),
      ['{"at":"x","job":"a","status":"maybe","owner":null}', '{"job":"a","status":"ok","owner":null}', '[]', '42'].join('\n'),
    );
    expect(readNight(dir, 'shape')).toEqual({ night: 'shape', rows: [], badLines: 4 });
  });
});
