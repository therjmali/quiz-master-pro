import { useState, useCallback, useEffect } from 'react';

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  dueDate: string;
  dueTime?: string;
  category?: string;
  createdAt: string;
}

const STORAGE_KEY = 'qmp_todos';

function loadTodos(): TodoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    return [
      {
        id: 'default-1',
        text: 'Practice 25 Medical-Surgical Nursing MCQs',
        completed: false,
        priority: 'high',
        dueDate: new Date().toISOString().split('T')[0],
        category: 'Practice',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'default-2',
        text: 'Review High-Yield Pharmacology Flashcards',
        completed: false,
        priority: 'medium',
        dueDate: new Date().toISOString().split('T')[0],
        category: 'Review',
        createdAt: new Date().toISOString(),
      },
    ];
  } catch {
    return [];
  }
}

function persistTodos(todos: TodoItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos));
  } catch {
    // ignore
  }
}

export function useTodos() {
  const [todos, setTodos] = useState<TodoItem[]>(loadTodos);

  useEffect(() => {
    persistTodos(todos);
  }, [todos]);

  const addTodo = useCallback((todo: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => {
    setTodos(prev => [
      ...prev,
      {
        ...todo,
        id: `todo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        completed: false,
        createdAt: new Date().toISOString(),
      },
    ]);
  }, []);

  const toggleTodo = useCallback((id: string) => {
    setTodos(prev => prev.map(t => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }, []);

  const deleteTodo = useCallback((id: string) => {
    setTodos(prev => prev.filter(t => t.id !== id));
  }, []);

  const updateTodo = useCallback((id: string, changes: Partial<TodoItem>) => {
    setTodos(prev => prev.map(t => (t.id === id ? { ...t, ...changes } : t)));
  }, []);

  const getTodosForDate = useCallback(
    (date: string) => {
      return todos.filter(t => t.dueDate === date);
    },
    [todos]
  );

  const getPendingCountForDate = useCallback(
    (date: string) => {
      return todos.filter(t => t.dueDate === date && !t.completed).length;
    },
    [todos]
  );

  return { todos, addTodo, toggleTodo, deleteTodo, updateTodo, getTodosForDate, getPendingCountForDate };
}
