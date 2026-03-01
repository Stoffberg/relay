import { useCallback, useRef, useState, useEffect, useSyncExternalStore } from "react";
import { useSpacetimeDB } from "spacetimedb/react";

type TableDef = {
  accessorName: string;
};

let _subscriptionReady = false;
const _readyListeners = new Set<() => void>();

export function markSubscriptionReady() {
  _subscriptionReady = true;
  for (const listener of _readyListeners) {
    listener();
  }
}

export function resetSubscriptionReady() {
  _subscriptionReady = false;
  for (const listener of _readyListeners) {
    listener();
  }
}

export function useSubscriptionReady(): boolean {
  return useSyncExternalStore(
    (onStoreChange) => {
      _readyListeners.add(onStoreChange);
      return () => {
        _readyListeners.delete(onStoreChange);
      };
    },
    () => _subscriptionReady,
    () => false,
  );
}

function safeIter<Row>(tbl: { iter(): Iterable<Row> }): Row[] | null {
  try {
    return Array.from(tbl.iter());
  } catch {
    return null;
  }
}

export function useRows<Row>(table: TableDef): readonly Row[] {
  const { getConnection, isActive } = useSpacetimeDB();
  const subscriptionReady = useSubscriptionReady();
  const accessorName = table.accessorName;
  const [rows, setRows] = useState<readonly Row[]>([]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refreshRows = useCallback(() => {
    const conn = getConnection();
    if (!conn) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = (conn.db as any)[accessorName];
    if (!tbl) return;
    const result = safeIter<Row>(tbl);
    if (result !== null && mountedRef.current) {
      setRows(result);
    } else if (result === null) {
      setTimeout(() => {
        if (!mountedRef.current) return;
        const retry = safeIter<Row>(tbl);
        if (retry !== null) setRows(retry);
      }, 0);
    }
  }, [getConnection, accessorName]);

  useEffect(() => {
    refreshRows();
  }, [refreshRows, isActive, subscriptionReady]);

  useEffect(() => {
    const conn = getConnection();
    if (!conn) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tbl = (conn.db as any)[accessorName];
    if (!tbl) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onInsert = (_ctx: any, _row: any) => refreshRows();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onDelete = (_ctx: any, _row: any) => refreshRows();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onUpdate = (_ctx: any, _old: any, _new: any) => refreshRows();

    tbl.onInsert(onInsert);
    tbl.onDelete(onDelete);
    tbl.onUpdate?.(onUpdate);

    refreshRows();

    return () => {
      tbl.removeOnInsert(onInsert);
      tbl.removeOnDelete(onDelete);
      tbl.removeOnUpdate?.(onUpdate);
    };
  }, [getConnection, accessorName, refreshRows, isActive]);

  return rows;
}
