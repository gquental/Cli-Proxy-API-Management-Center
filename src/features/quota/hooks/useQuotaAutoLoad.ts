import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useQuotaStore } from '@/stores/useQuotaStore';
import { getQuotaCacheKey } from '@/utils/quota/identity';
import { MINUTE_MS } from '@/utils/time/durations';
import { MINUTE_CLOCK } from '@/utils/time/sharedClock';
import type { QuotaFileEntry } from '../logic';
import { QUOTA_ADAPTERS, getQuotaMap } from '../providers';

export const QUOTA_AUTO_REFRESH_MS = 5 * MINUTE_MS;

export const quotaRefreshBucket = (now: number): number => Math.floor(now / QUOTA_AUTO_REFRESH_MS);

/**
 * Credentials not yet attempted in this refresh bucket, marked as attempted. A key also changes
 * with the connection session and the credential's file generation, so reconnecting or replacing
 * a file loads it again right away. A failed load waits for the next bucket.
 */
export function pickQuotaAutoLoadTargets(
  entries: QuotaFileEntry[],
  session: number,
  fileGenerations: Record<string, number>,
  attempted: Set<string>,
  isLoading: (entry: QuotaFileEntry) => boolean
): QuotaFileEntry[] {
  return entries.filter((entry) => {
    const { file } = entry;
    const key = JSON.stringify([
      session,
      fileGenerations[file.name] ?? 0,
      file.name,
      file.authIndex,
    ]);
    if (attempted.has(key)) return false;
    attempted.add(key);
    return !isLoading(entry);
  });
}

const subscribeVisibility = (listener: () => void) => {
  document.addEventListener('visibilitychange', listener);
  return () => document.removeEventListener('visibilitychange', listener);
};
const isDocumentVisible = () => document.visibilityState !== 'hidden';
const alwaysVisible = () => true;
const currentRefreshBucket = () => quotaRefreshBucket(MINUTE_CLOCK.getSnapshot());

/** Loads every visible credential on page open, then every QUOTA_AUTO_REFRESH_MS while the tab is visible. */
export function useQuotaAutoLoad(
  entries: QuotaFileEntry[],
  disabled: boolean,
  loadQuota: (targets: QuotaFileEntry[]) => Promise<void>
) {
  const attempted = useRef(new Set<string>());
  const attemptedBucket = useRef<number | null>(null);
  const session = useQuotaStore((state) => state.cacheGeneration);
  const fileGenerations = useQuotaStore((state) => state.fileGenerations);
  const refreshBucket = useSyncExternalStore(
    MINUTE_CLOCK.subscribe,
    currentRefreshBucket,
    currentRefreshBucket
  );
  const visible = useSyncExternalStore(subscribeVisibility, isDocumentVisible, alwaysVisible);

  useEffect(() => {
    if (disabled || !visible) return;
    if (attemptedBucket.current !== refreshBucket) {
      attemptedBucket.current = refreshBucket;
      attempted.current.clear();
    }
    const targets = pickQuotaAutoLoadTargets(
      entries,
      session,
      fileGenerations,
      attempted.current,
      ({ type, file }) =>
        getQuotaMap(QUOTA_ADAPTERS[type])[getQuotaCacheKey(file)]?.status === 'loading'
    );
    if (targets.length > 0) void loadQuota(targets);
  }, [disabled, entries, fileGenerations, loadQuota, refreshBucket, session, visible]);
}
