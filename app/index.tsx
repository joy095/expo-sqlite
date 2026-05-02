import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { useState } from 'react';
import { useTodos } from '../hooks/useTodos';
import { useSync } from '../hooks/useSync';
import { createTodoLocal, updateTodoLocal, deleteTodoLocal } from '../lib/sync';
import { Todo } from '../db/schema';

export default function TodoScreen() {
  const { todos, isLoading } = useTodos();
  const { sync } = useSync();
  const [newTitle, setNewTitle] = useState('');

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await createTodoLocal(newTitle.trim());
    setNewTitle('');
    sync(); // Trigger background sync
  };

  const toggleTodo = async (todo: Todo) => {
    await updateTodoLocal(todo.id, { completed: !todo.completed });
    sync();
  };

  const handleDelete = async (id: string) => {
    await deleteTodoLocal(id);
    sync();
  };

  const renderItem = ({ item }: { item: Todo }) => (
    <View style={styles.todoItem}>
      <TouchableOpacity onPress={() => toggleTodo(item)} style={styles.todoContent}>
        <Text style={[styles.todoText, item.completed && styles.completed]}>
          {item.title}
        </Text>
        <Text style={styles.syncBadge}>
          {item.syncStatus === 'pending' ? '⏳' : item.syncStatus === 'failed' ? '❌' : '✅'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
        <Text style={styles.deleteText}>🗑️</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Offline-First Todos</Text>
      
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={newTitle}
          onChangeText={setNewTitle}
          placeholder="Add a todo..."
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity style={styles.addBtn} onPress={handleAdd}>
          <Text style={styles.addText}>+</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.syncBtn} onPress={sync}>
        <Text style={styles.syncText}>🔄 Sync Now</Text>
      </TouchableOpacity>

      {isLoading ? (
        <Text>Loading...</Text>
      ) : (
        <FlatList
          data={todos}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, paddingTop: 60, backgroundColor: '#fff' },
  header: { fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
  inputRow: { flexDirection: 'row', marginBottom: 15, gap: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  addBtn: { backgroundColor: '#007AFF', width: 50, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  addText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  syncBtn: { backgroundColor: '#34C759', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 15 },
  syncText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  list: { gap: 10 },
  todoItem: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#f8f8f8', borderRadius: 10 },
  todoContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  todoText: { fontSize: 16, flex: 1 },
  completed: { textDecorationLine: 'line-through', color: '#999' },
  syncBadge: { fontSize: 14 },
  deleteBtn: { padding: 8 },
  deleteText: { fontSize: 18 },
});