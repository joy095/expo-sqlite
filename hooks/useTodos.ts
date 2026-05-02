import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db } from '../db/client';
import { todos } from '../db/schema';
import { desc } from 'drizzle-orm';

export function useTodos() {
  const { data, error } = useLiveQuery(
    db.select().from(todos).orderBy(desc(todos.updatedAt))
  );
  
  return { 
    todos: data ?? [], 
    isLoading: !data && !error,
    error 
  };
}