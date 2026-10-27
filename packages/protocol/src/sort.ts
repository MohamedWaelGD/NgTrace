export type SortDirection = 'asc' | 'desc';

/**
 * Stable sort by a column value. Rows with no value (null) go last in both directions;
 * strings compare case-insensitively and numbers inside them numerically ("item2" < "item10").
 */
export function sortRows<T>(rows: readonly T[], key: (row: T) => string | number | null, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: key(row) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) return a.value === b.value ? a.index - b.index : a.value === null ? 1 : -1;
      const order =
        typeof a.value === 'number' && typeof b.value === 'number'
          ? a.value - b.value
          : String(a.value).localeCompare(String(b.value), undefined, { numeric: true, sensitivity: 'base' });
      return order * sign || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** The next sort state when a column header is clicked: ascending, then descending, then unsorted. */
export function nextSort<K extends string>(
  current: { key: K; direction: SortDirection } | null,
  key: K,
): { key: K; direction: SortDirection } | null {
  if (current?.key !== key) return { key, direction: 'asc' };
  return current.direction === 'asc' ? { key, direction: 'desc' } : null;
}
