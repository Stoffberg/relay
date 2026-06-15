import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useSpacetimeDB } from "spacetimedb/react";

type TableDef = {
  accessorName: string;
};

type SpacetimeTable<Row> = {
  iter(): Iterable<Row>;
  onInsert(handler: (ctx: unknown, row: Row) => void): void;
  onDelete(handler: (ctx: unknown, row: Row) => void): void;
  onUpdate?(handler: (ctx: unknown, oldRow: Row, newRow: Row) => void): void;
  removeOnInsert(handler: (ctx: unknown, row: Row) => void): void;
  removeOnDelete(handler: (ctx: unknown, row: Row) => void): void;
  removeOnUpdate?(handler: (ctx: unknown, oldRow: Row, newRow: Row) => void): void;
};

type SpacetimeDb<Row> = Record<string, SpacetimeTable<Row> | undefined>;

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
    () => false
  );
}

function safeIter<Row>(tbl: SpacetimeTable<Row>): Row[] | null {
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
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refreshRows = useCallback(() => {
    if (!isActive || !subscriptionReady) return;
    const conn = getConnection();
    if (!conn) return;
    const tbl = (conn.db as unknown as SpacetimeDb<Row>)[accessorName];
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
  }, [getConnection, accessorName, isActive, subscriptionReady]);

  useEffect(() => {
    refreshRows();
  }, [refreshRows]);

  useEffect(() => {
    const conn = getConnection();
    if (!conn) return;

    const tbl = (conn.db as unknown as SpacetimeDb<Row>)[accessorName];
    if (!tbl) return;

    const onInsert = (_ctx: unknown, _row: Row) => refreshRows();
    const onDelete = (_ctx: unknown, _row: Row) => refreshRows();
    const onUpdate = (_ctx: unknown, _old: Row, _new: Row) => refreshRows();

    tbl.onInsert(onInsert);
    tbl.onDelete(onDelete);
    tbl.onUpdate?.(onUpdate);

    refreshRows();

    return () => {
      tbl.removeOnInsert(onInsert);
      tbl.removeOnDelete(onDelete);
      tbl.removeOnUpdate?.(onUpdate);
    };
  }, [getConnection, accessorName, refreshRows]);

  return rows;
}
