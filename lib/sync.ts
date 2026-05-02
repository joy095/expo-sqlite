import NetInfo from "@react-native-community/netinfo";
import { eq } from "drizzle-orm";
import * as Crypto from "expo-crypto";
import { db } from "../db/client";
import { outbox, syncMeta, todos } from "../db/schema";

const API_BASE = "http://192.168.0.102:3001"; // Use your machine IP for real devices

// ─── Helpers ─────────────────────────────────────────────

function generateId() {
  return Crypto.randomUUID();
}

function getIdempotencyKey(
  entity: string,
  op: string,
  id: string,
  timestamp: number,
) {
  return `${entity}:${op}:${id}:${timestamp}`;
}

async function getLastSyncCursor(): Promise<string> {
  const row = await db
    .select()
    .from(syncMeta)
    .where(eq(syncMeta.key, "cursor"))
    .get();
  return row?.value ?? "0";
}

async function setLastSyncCursor(cursor: string) {
  await db
    .insert(syncMeta)
    .values({ key: "cursor", value: cursor })
    .onConflictDoUpdate({
      target: syncMeta.key,
      set: { value: cursor },
    });
}

// ─── Local Mutations (always write to SQLite first) ──────

export async function createTodoLocal(title: string) {
  const id = generateId();
  const now = Date.now();
  const idempotencyKey = getIdempotencyKey("todos", "create", id, now);

  await db.transaction(async (tx) => {
    await tx.insert(todos).values({
      id,
      title,
      completed: false,
      createdAt: new Date(now),
      updatedAt: new Date(now),
      syncStatus: "pending",
    });

    await tx.insert(outbox).values({
      id: generateId(),
      entity: "todos",
      entityId: id,
      operation: "create",
      payload: JSON.stringify({
        id,
        title,
        completed: false,
        createdAt: now,
        updatedAt: now,
      }),
      idempotencyKey,
      createdAt: new Date(now),
    });
  });

  return id;
}

export async function updateTodoLocal(
  id: string,
  updates: Partial<{ title: string; completed: boolean }>,
) {
  const now = Date.now();
  const idempotencyKey = getIdempotencyKey("todos", "update", id, now);

  await db.transaction(async (tx) => {
    await tx
      .update(todos)
      .set({ ...updates, updatedAt: new Date(now), syncStatus: "pending" })
      .where(eq(todos.id, id));

    const current = await tx.select().from(todos).where(eq(todos.id, id)).get();

    await tx.insert(outbox).values({
      id: generateId(),
      entity: "todos",
      entityId: id,
      operation: "update",
      payload: JSON.stringify({ ...current, ...updates, updatedAt: now }),
      idempotencyKey,
      createdAt: new Date(now),
    });
  });
}

export async function deleteTodoLocal(id: string) {
  const now = Date.now();
  const idempotencyKey = getIdempotencyKey("todos", "delete", id, now);

  await db.transaction(async (tx) => {
    await tx
      .update(todos)
      .set({ syncStatus: "pending", updatedAt: new Date(now) })
      .where(eq(todos.id, id));

    await tx.insert(outbox).values({
      id: generateId(),
      entity: "todos",
      entityId: id,
      operation: "delete",
      payload: JSON.stringify({ id }),
      idempotencyKey,
      createdAt: new Date(now),
    });
  });
}

// ─── Sync Engine ─────────────────────────────────────────

class SyncManager {
  private running = false;
  private queued = false;

  async requestSync() {
    if (this.running) {
      this.queued = true;
      return;
    }

    const net = await NetInfo.fetch();
    if (!net.isConnected) return;

    this.running = true;
    try {
      await this.syncOnce();
    } finally {
      this.running = false;
      if (this.queued) {
        this.queued = false;
        await this.requestSync();
      }
    }
  }

  private async syncOnce() {
    await this.pushOutbox();
    await this.pullChanges();
  }

  private async pushOutbox() {
    const pendingItems = await db
      .select()
      .from(outbox)
      .orderBy(outbox.createdAt)
      .limit(25)
      .all();

    for (const item of pendingItems) {
      try {
        const method =
          item.operation === "delete"
            ? "DELETE"
            : item.operation === "create"
              ? "POST"
              : "PATCH";

        const url =
          item.operation === "create"
            ? `${API_BASE}/todos`
            : `${API_BASE}/todos/${item.entityId}`;

        const res = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": item.idempotencyKey,
          },
          body: item.operation !== "delete" ? item.payload : undefined,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        // Success: remove from outbox and mark todo as synced
        await db.transaction(async (tx) => {
          await tx.delete(outbox).where(eq(outbox.id, item.id));

          if (item.operation !== "delete") {
            await tx
              .update(todos)
              .set({ syncStatus: "synced" })
              .where(eq(todos.id, item.entityId));
          } else {
            await tx.delete(todos).where(eq(todos.id, item.entityId));
          }
        });
      } catch (err: any) {
        await db
          .update(outbox)
          .set({
            attempts: item.attempts + 1,
            lastError: err.message,
          })
          .where(eq(outbox.id, item.id));
      }
    }
  }

  private async pullChanges() {
    const cursor = await getLastSyncCursor();

    try {
      // JSON Server doesn't support cursors natively, so we use _sort and _since
      const res = await fetch(
        `${API_BASE}/todos?updatedAt_gte=${cursor}&_sort=updatedAt&_order=asc`,
      );
      if (!res.ok) throw new Error(`Pull failed: ${res.status}`);

      const serverTodos = await res.json();
      if (!serverTodos.length) return;

      const lastTimestamp = serverTodos[serverTodos.length - 1].updatedAt;

      await db.transaction(async (tx) => {
        for (const serverTodo of serverTodos) {
          // Skip if we have a pending local change for this item
          const pendingOps = await tx
            .select()
            .from(outbox)
            .where(eq(outbox.entityId, serverTodo.id))
            .all();

          if (pendingOps.length > 0) continue;

          const local = await tx
            .select()
            .from(todos)
            .where(eq(todos.id, serverTodo.id))
            .get();

          // Conflict resolution: server wins if newer
          if (!local || new Date(serverTodo.updatedAt) > local.updatedAt) {
            await tx
              .insert(todos)
              .values({
                ...serverTodo,
                syncStatus: "synced",
                createdAt: new Date(serverTodo.createdAt),
                updatedAt: new Date(serverTodo.updatedAt),
              })
              .onConflictDoUpdate({
                target: todos.id,
                set: {
                  title: serverTodo.title,
                  completed: serverTodo.completed,
                  updatedAt: new Date(serverTodo.updatedAt),
                  syncStatus: "synced",
                },
              });
          }
        }

        await setLastSyncCursor(lastTimestamp);
      });
    } catch (err) {
      console.error("Pull failed:", err);
    }
  }
}

export const syncManager = new SyncManager();
