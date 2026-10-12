import type { SupabaseClient } from "@supabase/supabase-js";

export type FakeTables = Record<string, Record<string, unknown>[]>;

export interface FakeError {
  code?: string;
  message: string;
}

export type InsertHandler = (
  table: string,
  row: Record<string, unknown>,
  tables: FakeTables
) => { data?: Record<string, unknown>; error?: FakeError };

/**
 * Like InsertHandler, but for simulating a constraint violation on
 * `.update()` (e.g. a unique index on a column being edited to a value
 * another row already has). Returning `{}` (the default, if no onUpdate is
 * given) falls through to the normal "always succeeds" update behavior.
 */
export type UpdateHandler = (
  table: string,
  partial: Record<string, unknown>,
  matching: Record<string, unknown>[],
  tables: FakeTables
) => { error?: FakeError } | undefined;

export type RpcHandler = (
  fnName: string,
  args: Record<string, unknown>,
  tables: FakeTables
) => { data?: unknown; error?: FakeError };

interface FakeResult {
  data: unknown;
  error: FakeError | null;
  count?: number;
}

function parseOrFilter(expr: string): (row: Record<string, unknown>) => boolean {
  // Supports the two forms our routes actually use: "col.ilike.%val%" and "col.eq.val".
  const clauses = expr.split(",").map((clause) => {
    const [columnPart, op, ...rest] = clause.split(".");
    const column = columnPart ?? "";
    const rawValue = rest.join(".");
    if (op === "ilike") {
      const needle = rawValue.replace(/^%|%$/g, "").toLowerCase();
      return (row: Record<string, unknown>) => String(row[column] ?? "").toLowerCase().includes(needle);
    }
    if (op === "eq") {
      return (row: Record<string, unknown>) => String(row[column] ?? "") === rawValue;
    }
    return () => false;
  });
  return (row) => clauses.some((clause) => clause(row));
}

/**
 * A minimal in-memory stand-in for the subset of the supabase-js query
 * builder our API routes use: select/eq/in/or/order/range,
 * maybeSingle/single, insert/update/delete, and rpc(). Good enough to
 * exercise route LOGIC (validation, status codes, error-code handling,
 * concurrency guards) without a real database. It does not enforce actual
 * SQL constraints -- callers simulate those via `onInsert`/`onRpc` (see
 * tests/helpers/bookings-insert-handler.ts), and it does not perform real
 * foreign-key joins -- seed any `turfs: { name }` embed directly onto test
 * fixture rows instead.
 */
export function createFakeSupabaseClient(
  tables: FakeTables,
  options: { onInsert?: InsertHandler; onUpdate?: UpdateHandler; onRpc?: RpcHandler } = {}
): SupabaseClient {
  function from(table: string) {
    const filters: Array<(row: Record<string, unknown>) => boolean> = [];
    let mode: "select" | "insert" | "update" | "delete" = "select";
    let writeRow: Record<string, unknown> | null = null;
    let singleMode: "none" | "maybe" | "strict" = "none";
    let countRequested = false;
    let sort: { column: string; ascending: boolean } | null = null;
    let rangeBounds: { from: number; to: number } | null = null;

    const builder = {
      select(_columns?: string, opts?: { count?: "exact" }) {
        if (opts?.count === "exact") countRequested = true;
        return builder;
      },
      eq(column: string, value: unknown) {
        filters.push((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        filters.push((row) => values.includes(row[column]));
        return builder;
      },
      or(expr: string) {
        filters.push(parseOrFilter(expr));
        return builder;
      },
      order(column: string, opts?: { ascending?: boolean }) {
        sort = { column, ascending: opts?.ascending !== false };
        return builder;
      },
      limit() {
        return builder;
      },
      range(from: number, to: number) {
        rangeBounds = { from, to };
        return builder;
      },
      insert(row: Record<string, unknown>) {
        mode = "insert";
        writeRow = row;
        return builder;
      },
      update(partial: Record<string, unknown>) {
        mode = "update";
        writeRow = partial;
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      maybeSingle() {
        singleMode = "maybe";
        return builder;
      },
      single() {
        singleMode = "strict";
        return builder;
      },
      then(resolve: (result: FakeResult) => void, reject: (reason: unknown) => void) {
        try {
          let result: FakeResult;

          if (mode === "insert" && writeRow) {
            const outcome = options.onInsert?.(table, writeRow, tables) ?? {};
            if (outcome.error) {
              result = { data: null, error: outcome.error };
            } else {
              const row = outcome.data ?? {
                id: `generated-${(tables[table] ?? []).length + 1}`,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                ...writeRow,
              };
              tables[table] = [...(tables[table] ?? []), row];
              result = { data: row, error: null };
            }
          } else if (mode === "update") {
            const current = tables[table] ?? [];
            const matching = current.filter((row) => filters.every((f) => f(row)));
            const outcome = writeRow ? options.onUpdate?.(table, writeRow, matching, tables) : undefined;
            if (outcome?.error) {
              result = { data: null, error: outcome.error };
            } else {
              matching.forEach((row) => Object.assign(row, writeRow));
              const data = singleMode === "none" ? matching : matching[0] ?? null;
              result = { data, error: null };
            }
          } else if (mode === "delete") {
            const current = tables[table] ?? [];
            const matching = current.filter((row) => filters.every((f) => f(row)));
            tables[table] = current.filter((row) => !matching.includes(row));
            const data = singleMode === "none" ? matching : matching[0] ?? null;
            result = { data, error: null };
          } else {
            // Clone each row: a real client gets a fresh JSON snapshot per
            // request, so mutating the table later (e.g. via .update())
            // must never retroactively change a row object a caller
            // already holds from an earlier .select().
            let rows = (tables[table] ?? [])
              .filter((row) => filters.every((f) => f(row)))
              .map((row) => ({ ...row }));
            const totalCount = rows.length;
            if (sort) {
              const { column, ascending } = sort;
              rows = [...rows].sort((a, b) => {
                const av = a[column] as string | number;
                const bv = b[column] as string | number;
                if (av === bv) return 0;
                const cmp = av < bv ? -1 : 1;
                return ascending ? cmp : -cmp;
              });
            }
            if (rangeBounds) {
              rows = rows.slice(rangeBounds.from, rangeBounds.to + 1);
            }
            if (singleMode === "strict") {
              result =
                rows.length === 1
                  ? { data: rows[0], error: null }
                  : { data: null, error: { code: "PGRST116", message: "Row not found." } };
            } else if (singleMode === "maybe") {
              result = { data: rows[0] ?? null, error: null };
            } else {
              result = { data: rows, error: null, ...(countRequested ? { count: totalCount } : {}) };
            }
          }
          resolve(result);
        } catch (err) {
          reject(err);
        }
      },
    };

    return builder;
  }

  function rpc(fnName: string, args: Record<string, unknown>) {
    return Promise.resolve(options.onRpc?.(fnName, args, tables) ?? { data: null, error: { message: "not implemented" } });
  }

  /**
   * Minimal Storage mock: enough to exercise the QR-upload route's logic
   * (it calls .upload() then .getPublicUrl()) without real Supabase
   * Storage. Uploaded "files" are just recorded, not actually stored
   * anywhere -- no test needs to read the bytes back.
   */
  const storage = {
    from(bucket: string) {
      return {
        async upload(path: string, _body: unknown, _opts?: unknown) {
          const key = `${bucket}/${path}`;
          tables.__storage__ = [...(tables.__storage__ ?? []), { key }];
          return { data: { path }, error: null };
        },
        getPublicUrl(path: string) {
          return { data: { publicUrl: `https://fake.storage.test/${bucket}/${path}` } };
        },
      };
    },
  };

  return { from, rpc, storage } as unknown as SupabaseClient;
}
