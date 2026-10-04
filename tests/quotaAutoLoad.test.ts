import { describe, expect, test } from 'bun:test';
import {
  QUOTA_AUTO_REFRESH_MS,
  pickQuotaAutoLoadTargets,
  quotaRefreshBucket,
} from '@/features/quota/hooks/useQuotaAutoLoad';
import type { QuotaFileEntry } from '@/features/quota/logic';
import type { AuthFileItem } from '@/types';

const entry = (name: string, type: QuotaFileEntry['type'] = 'claude'): QuotaFileEntry => ({
  file: { name, provider: type, authIndex: `idx-${name}` } as AuthFileItem,
  type,
});

const names = (entries: QuotaFileEntry[]) => entries.map(({ file }) => file.name);
const notLoading = () => false;

describe('quota auto-load targets', () => {
  test('loads every visible credential once, across providers', () => {
    const attempted = new Set<string>();
    const entries = [entry('a.json'), entry('b.json', 'codex'), entry('c.json', 'devin')];

    expect(names(pickQuotaAutoLoadTargets(entries, 1, {}, attempted, notLoading))).toEqual([
      'a.json',
      'b.json',
      'c.json',
    ]);
    expect(pickQuotaAutoLoadTargets(entries, 1, {}, attempted, notLoading)).toEqual([]);
  });

  test('a new session or file generation loads the credential again', () => {
    const attempted = new Set<string>();
    const entries = [entry('a.json'), entry('b.json')];
    pickQuotaAutoLoadTargets(entries, 1, {}, attempted, notLoading);

    expect(
      names(pickQuotaAutoLoadTargets(entries, 1, { 'b.json': 1 }, attempted, notLoading))
    ).toEqual(['b.json']);
    expect(
      names(pickQuotaAutoLoadTargets(entries, 2, { 'b.json': 1 }, attempted, notLoading))
    ).toEqual(['a.json', 'b.json']);
  });

  test('a credential already loading is marked attempted but not requested twice', () => {
    const attempted = new Set<string>();
    const entries = [entry('a.json'), entry('b.json')];
    const isLoading = ({ file }: QuotaFileEntry) => file.name === 'a.json';

    expect(names(pickQuotaAutoLoadTargets(entries, 1, {}, attempted, isLoading))).toEqual([
      'b.json',
    ]);
    expect(pickQuotaAutoLoadTargets(entries, 1, {}, attempted, notLoading)).toEqual([]);
  });
});

describe('quota refresh bucket', () => {
  test('changes once per refresh interval', () => {
    const start = 10 * QUOTA_AUTO_REFRESH_MS;
    expect(quotaRefreshBucket(start)).toBe(quotaRefreshBucket(start + QUOTA_AUTO_REFRESH_MS - 1));
    expect(quotaRefreshBucket(start + QUOTA_AUTO_REFRESH_MS)).toBe(quotaRefreshBucket(start) + 1);
  });
});
