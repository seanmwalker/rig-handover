import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { RigConfig } from '../src/config.js';
import type { Night, RunLine } from '../src/digest/types.js';

const line = (l: RunLine) => JSON.stringify(l);

// File order is not job order on purpose: the routes must sort by job.
const normal = [
  line({ at: '2026-10-28T23:05:00+01:00', job: 'zeta/report', status: 'fail', owner: 'rook', error: 'timeout' }),
  line({ at: '2026-10-28T23:00:00+01:00', job: 'alpha/build', status: 'retry', owner: 'sean', error: 'flaky' }),
  line({ at: '2026-10-28T23:10:00+01:00', job: 'mid/cleanup', status: 'ok', owner: null }),
  line({ at: '2026-10-28T23:20:00+01:00', job: 'alpha/build', status: 'ok', owner: 'sean' }),
].join('\n');

const badLine = [
  line({ at: '2026-10-28T23:00:00+01:00', job: 'alpha/build', status: 'ok', owner: 'sean' }),
  'this is not json',
  line({ at: '2026-10-28T23:30:00+01:00', job: 'beta/deploy', status: 'ok', owner: 'rook' }),
].join('\n');

let runsDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  writeFileSync(join(runsDir, '2030-01-01.jsonl'), normal + '\n');
  writeFileSync(join(runsDir, '2030-01-02.jsonl'), '');
  writeFileSync(join(runsDir, '2030-01-03.jsonl'), badLine + '\n');
  const config: RigConfig = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir };
  app = createApp(config);
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

async function getNight(night: string): Promise<Night> {
  const res = await app.request(`/api/digest/${night}`);
  expect(res.status).toBe(200);
  return (await res.json()) as Night;
}

describe('GET /digest/:night', () => {
  it('renders the rows for a normal night', async () => {
    const res = await app.request('/digest/2030-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of ['alpha/build', 'mid/cleanup', 'zeta/report']) expect(html).toContain(job);
    expect(html).toContain('—');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/digest/2030-02-02');
    expect(res.status).toBe(404);
  });

  it('says "nothing ran" for an empty night', async () => {
    const res = await app.request('/digest/2030-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('still renders a night with a bad line', async () => {
    const res = await app.request('/digest/2030-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/build');
    expect(html).toContain('beta/deploy');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the night as JSON, rows sorted by job', async () => {
    const night = await getNight('2030-01-01');
    expect(night.night).toBe('2030-01-01');
    expect(night.badLines).toBe(0);
    expect(night.rows.map((r) => r.job)).toEqual(['alpha/build', 'mid/cleanup', 'zeta/report']);
    const [build, cleanup, report] = night.rows;
    expect(build).toMatchObject({ runs: 2, retries: 1, lastStatus: 'ok' });
    expect(cleanup).toMatchObject({ owner: null, lastStatus: 'ok' });
    expect(report).toMatchObject({ lastStatus: 'fail', lastError: 'timeout' });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await app.request('/api/digest/2030-02-02');
    expect(res.status).toBe(404);
  });

  it('returns no rows for an empty night', async () => {
    const night = await getNight('2030-01-02');
    expect(night.rows).toEqual([]);
    expect(night.badLines).toBe(0);
  });

  it('counts the bad line and keeps the good rows', async () => {
    const night = await getNight('2030-01-03');
    expect(night.badLines).toBe(1);
    expect(night.rows.map((r) => r.job)).toEqual(['alpha/build', 'beta/deploy']);
  });
});

describe('page and JSON agree', () => {
  it.each(['2030-01-01', '2030-01-03'])('lists the same jobs in the same order for %s', async (nightName) => {
    const night = await getNight(nightName);
    const html = await (await app.request(`/digest/${nightName}`)).text();
    const jobs = night.rows.map((r) => r.job);
    expect(jobs.length).toBeGreaterThan(0);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});
