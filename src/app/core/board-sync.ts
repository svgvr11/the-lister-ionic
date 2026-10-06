export class OwnBoardSnapshots {
  private readonly pending = new Map<string, string>();
  private readonly savedSnapshots: string[] = [];
  private nextToken = 0;
  private readonly maxSavedSnapshots = 20;

  begin(board: unknown): string {
    const token = `snapshot-${++this.nextToken}`;
    this.pending.set(token, canonicalBoardContentKey(board));
    return token;
  }

  complete(token: string, saved: boolean): void {
    const key = this.pending.get(token);
    this.pending.delete(token);
    if (!saved || key === undefined) return;
    const previous = this.savedSnapshots.indexOf(key);
    if (previous >= 0) this.savedSnapshots.splice(previous, 1);
    this.savedSnapshots.push(key);
    if (this.savedSnapshots.length > this.maxSavedSnapshots) {
      this.savedSnapshots.splice(0, this.savedSnapshots.length - this.maxSavedSnapshots);
    }
  }

  has(board: unknown): boolean {
    const key = canonicalBoardContentKey(board);
    return this.pendingHas(key) || this.savedSnapshots.includes(key);
  }

  private pendingHas(key: string): boolean {
    for (const pendingKey of this.pending.values()) {
      if (pendingKey === key) return true;
    }
    return false;
  }
}

const SERVER_METADATA_KEYS = new Set([
  'updatedat',
  'modifiedat',
  'version',
  'boardversion',
  'revision',
  'etag',
  'lastmodified',
  'lastmodifiedat',
  'syncversion',
  'syncedat',
  'rowversion',
  'xmin'
]);

export function canonicalBoardContentKey(board: unknown): string {
  const record = board && typeof board === 'object' && !Array.isArray(board)
    ? board as Record<string, unknown>
    : null;
  if (!record) return JSON.stringify(canonicalize(board));
  return JSON.stringify(canonicalize({
    id: record['id'],
    title: record['title'],
    createdAt: record['createdAt'],
    pinnedListId: record['pinnedListId'] ?? null,
    lists: Array.isArray(record['lists']) ? record['lists'] : [],
    trashedLists: Array.isArray(record['trashedLists']) ? record['trashedLists'] : [],
    archivedLists: Array.isArray(record['archivedLists']) ? record['archivedLists'] : []
  }));
}

function canonicalize(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((property) => !isServerMetadataKey(property))
        .sort()
        .map((property) => [property, canonicalize(record[property], property)])
    );
  }
  if (typeof value === 'string' && isDateField(key)) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString();
  }
  return value;
}

function normalizeKey(key: string): string {
  return key.replace(/[^a-z\d]/gi, '').toLowerCase();
}

function isServerMetadataKey(key: string): boolean {
  const normalized = normalizeKey(key);
  return SERVER_METADATA_KEYS.has(normalized)
    || /^(?:server|remote|lastknown|lastremote|sync).*(?:updatedat|modifiedat|version|revision|etag)$/.test(normalized);
}

function isDateField(key: string): boolean {
  return /(?:date|at|time)$/i.test(key) || /^(?:due|start|end)date$/i.test(key);
}
