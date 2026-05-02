import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Main domain table
export const todos = sqliteTable('todos', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
  syncStatus: text('sync_status', { enum: ['synced', 'pending', 'failed'] }).notNull().default('pending'),
});

// Outbox for pending mutations
export const outbox = sqliteTable('outbox', {
  id: text('id').primaryKey(),
  entity: text('entity').notNull(),        // 'todos'
  entityId: text('entity_id').notNull(),   // todo id
  operation: text('operation', { enum: ['create', 'update', 'delete'] }).notNull(),
  payload: text('payload').notNull(),      // JSON string
  idempotencyKey: text('idempotency_key').notNull().unique(),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
});

// Sync metadata
export const syncMeta = sqliteTable('sync_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export type Todo = typeof todos.$inferSelect;
export type NewTodo = typeof todos.$inferInsert;
export type OutboxItem = typeof outbox.$inferSelect;