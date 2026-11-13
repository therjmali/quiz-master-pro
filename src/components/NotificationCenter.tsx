import React, { useState, useMemo, useCallback } from 'react';
import Overlay from './ui/Overlay';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Bell, Plus, Trash2, Clock, ListChecks, CheckCircle2,
  Flame, Search, Check, Layers, ChevronRight,
  Sparkles, AlertTriangle, Target, Zap, BookOpen, Calendar
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';
import type { TodoItem } from '../hooks/useTodos';
import { generateSmartAlerts, type SmartAlert } from '../lib/smartAlerts';

interface Props {
  open: boolean;
  onClose: () => void;
  todos: TodoItem[];
  onAddTodo: (todo: Omit<TodoItem, 'id' | 'createdAt' | 'completed'>) => void;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onUpdateTodo?: (id: string, changes: Partial<TodoItem>) => void;
  streakDays?: number;
  todayQuestionsDone?: number;
  targetQuestions?: number;
  totalQuestionsSolved?: number;
  onNavigate?: (screen: string) => void;
}

type MainTab = 'all' | 'todos' | 'alerts';
type PriorityFilter = 'all' | 'high' | 'medium' | 'low';

const PRIORITIES = [
  { value: 'high' as const, label: 'High', emoji: '🔴', color: 'destructive' },
  { value: 'medium' as const, label: 'Medium', emoji: '🟡', color: 'chart-4' },
  { value: 'low' as const, label: 'Low', emoji: '🟢', color: 'secondary' },
];

const CATEGORIES = ['Practice', 'Review', 'Mock Test', 'NORCET', 'Notes', 'General'];

const PRIORITY_STYLES: Record<string, { bg: string; border: string; dot: string }> = {
  high: { bg: 'bg-destructive/10', border: 'border-l-destructive', dot: 'bg-destructive' },
  medium: { bg: 'bg-chart-4/10', border: 'border-l-chart-4', dot: 'bg-chart-4' },
  low: { bg: 'bg-secondary/10', border: 'border-l-secondary', dot: 'bg-secondary' },
};

function getLocalDateStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getLocalDateStr(d);
}

export default function NotificationCenter({
  open,
  onClose,
  todos,
  onAddTodo,
  onToggleTodo,
  onDeleteTodo,
  onUpdateTodo,
  streakDays = 0,
  todayQuestionsDone = 0,
  targetQuestions = 50,
  totalQuestionsSolved = 0,
  onNavigate,
}: Props) {
  const [mainTab, setMainTab] = useState<MainTab>('all');
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['completed']));

  // Modals & Dialogs
  const [deleteTarget, setDeleteTarget] = useState<TodoItem | null>(null);
  const [confirmComplete, setConfirmComplete] = useState<TodoItem | null>(null);
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  // New todo form state
  const [newText, setNewText] = useState('');
  const [newPriority, setNewPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [newCategory, setNewCategory] = useState('Practice');
  const [newDueDate, setNewDueDate] = useState(getLocalDateStr());

  // Batch
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());

  const today = getLocalDateStr();
  const tomorrow = getTomorrow();

  // Smart alerts
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(() => new Set());
  const smartAlerts = useMemo(() => {
    const list = generateSmartAlerts({
      todos,
      streakDays,
      todayQuestionsDone,
      targetQuestions,
      totalQuestionsSolved,
    });
    return list.filter(a => !dismissedAlerts.has(a.dismissKey));
  }, [todos, streakDays, todayQuestionsDone, targetQuestions, totalQuestionsSolved, dismissedAlerts]);

  const dismissSmartAlert = useCallback((key: string) => {
    setDismissedAlerts(prev => new Set(prev).add(key));
  }, []);

  // Filtered todos
  const filteredTodos = useMemo(() => {
    let f = [...todos];
    if (priorityFilter !== 'all') f = f.filter(t => t.priority === priorityFilter);
    if (categoryFilter !== 'all') f = f.filter(t => t.category === categoryFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      f = f.filter(t => t.text.toLowerCase().includes(q) || (t.category || '').toLowerCase().includes(q));
    }
    return f.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      const po = { high: 0, medium: 1, low: 2 };
      return po[a.priority] - po[b.priority];
    });
  }, [todos, priorityFilter, categoryFilter, searchQuery]);

  const grouped = useMemo(() => {
    const g = {
      overdue: [] as TodoItem[],
      today: [] as TodoItem[],
      tomorrow: [] as TodoItem[],
      upcoming: [] as TodoItem[],
      completed: [] as TodoItem[],
    };
    filteredTodos.forEach(t => {
      if (t.completed) {
        g.completed.push(t);
        return;
      }
      if (t.dueDate < today) g.overdue.push(t);
      else if (t.dueDate === today) g.today.push(t);
      else if (t.dueDate === tomorrow) g.tomorrow.push(t);
      else g.upcoming.push(t);
    });
    return g;
  }, [filteredTodos, today, tomorrow]);

  const todoStats = useMemo(() => {
    const all = todos.length;
    const done = todos.filter(t => t.completed).length;
    const overdue = todos.filter(t => !t.completed && t.dueDate < today).length;
    return {
      all,
      done,
      pending: all - done,
      overdue,
      pct: all > 0 ? Math.round((done / all) * 100) : 0,
    };
  }, [todos, today]);

  const toggleSection = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreateTodo = () => {
    if (!newText.trim()) return;
    onAddTodo({
      text: newText.trim(),
      priority: newPriority,
      category: newCategory,
      dueDate: newDueDate || today,
    });
    setNewText('');
    setAddSheetOpen(false);
    toast.success('✅ Study task added!');
  };

  const handleBatchComplete = () => {
    batchSelected.forEach(id => onToggleTodo(id));
    toast.success(`✅ Completed ${batchSelected.size} tasks!`);
    setBatchSelected(new Set());
    setBatchMode(false);
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <>
          <Overlay
            open={open}
            onClose={onClose}
            kind="right"
            layer="panel"
            hideClose
            noAnimation
            className="max-w-[420px] border-l border-border/15 bg-card/95 !backdrop-blur-2xl"
            labelledBy="command-center-title"
          >
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="flex h-full min-h-0 flex-col"
            >
            {/* Header */}
            <div className="shrink-0 border-b border-border/10 px-5 pb-3 pt-5">
            
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shadow-sm">
                    <Bell className="w-4.5 h-4.5" />
                  </div>
                  <div>
                    <h2 id="command-center-title" className="text-sm font-black text-foreground leading-tight tracking-tight">Command Center</h2>
                    <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                      {todoStats.pending > 0 ? `${todoStats.pending} pending tasks` : '✨ All tasks complete!'}
                      {smartAlerts.length > 0 && ` · ${smartAlerts.length} smart alerts`}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {streakDays > 0 && (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-chart-4/15 border border-chart-4/25 text-chart-4 text-xs font-black">
                      <Flame className="w-3.5 h-3.5 fill-current" />
                      <span>{streakDays}d streak</span>
                    </div>
                  )}
                  <button
                    onClick={onClose}
                    className="w-8 h-8 rounded-xl bg-muted/20 border border-border/15 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 p-1 rounded-xl bg-muted/20 border border-border/10 text-xs font-bold">
                <button
                  onClick={() => setMainTab('all')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                    mainTab === 'all' ? 'bg-primary text-primary-foreground font-black shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>All</span>
                  {smartAlerts.length > 0 && (
                    <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center">
                      {smartAlerts.length}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setMainTab('todos')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                    mainTab === 'todos' ? 'bg-primary text-primary-foreground font-black shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ListChecks className="w-3.5 h-3.5" />
                  <span>Tasks</span>
                  <span className="text-[10px] opacity-75">({todoStats.pending})</span>
                </button>
                <button
                  onClick={() => setMainTab('alerts')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg transition-all ${
                    mainTab === 'alerts' ? 'bg-primary text-primary-foreground font-black shadow-sm' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Smart Nudges</span>
                </button>
              </div>

              {/* Search */}
              <div className="relative mt-2.5">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search tasks, categories..."
                  className="h-8 pl-8 text-xs rounded-xl bg-muted/15 border-border/15"
                />
              </div>

              {/* Batch Action Bar */}
              {batchMode && (
                <div className="mt-2 flex items-center justify-between text-xs pt-1 border-t border-border/10">
                  <span className="font-bold text-primary">{batchSelected.size} selected</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setBatchMode(false);
                        setBatchSelected(new Set());
                      }}
                      className="px-2 py-1 rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBatchComplete}
                      disabled={batchSelected.size === 0}
                      className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold disabled:opacity-40"
                    >
                      Complete Selected
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Content Area */}
            <div className="qmp-panel-body space-y-3 px-5 py-3">
              {/* Smart Alerts Section */}
              {smartAlerts.length > 0 && (mainTab === 'all' || mainTab === 'alerts') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-primary" /> Proactive Smart Alerts
                    </span>
                    <span className="text-[9px] font-bold text-muted-foreground">{smartAlerts.length} active</span>
                  </div>

                  <div className="space-y-2">
                    {smartAlerts.map(alert => (
                      <div
                        key={alert.id}
                        className={`p-3 rounded-2xl border transition-all relative overflow-hidden ${
                          alert.color === 'destructive'
                            ? 'bg-destructive/10 border-destructive/25 text-foreground'
                            : alert.color === 'chart-4'
                            ? 'bg-chart-4/10 border-chart-4/25 text-foreground'
                            : 'bg-primary/10 border-primary/25 text-foreground'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <span className="text-xl shrink-0 mt-0.5">{alert.emoji}</span>
                            <div>
                              <p className="text-xs font-black leading-tight text-foreground">{alert.title}</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{alert.subtitle}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => dismissSmartAlert(alert.dismissKey)}
                            className="w-5 h-5 rounded-full bg-muted/20 flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                            title="Dismiss"
                          >
                            ✕
                          </button>
                        </div>

                        <div className="mt-2.5 flex justify-end">
                          <button
                            onClick={() => {
                              onClose();
                              if (onNavigate) onNavigate(alert.actionTab);
                            }}
                            className="px-2.5 py-1 rounded-xl bg-card border border-border/20 text-[10px] font-black text-foreground hover:bg-muted/30 transition-all flex items-center gap-1 shadow-sm"
                          >
                            <span>{alert.actionLabel}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tasks Section */}
              {(mainTab === 'all' || mainTab === 'todos') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <ListChecks className="w-3 h-3 text-primary" /> Study To-Do Backlog
                    </span>
                    <button
                      onClick={() => setBatchMode(!batchMode)}
                      className="text-[10px] font-bold text-primary hover:underline"
                    >
                      {batchMode ? 'Done Selecting' : 'Batch Complete'}
                    </button>
                  </div>

                  {/* Priority Filter */}
                  <div className="flex gap-1 overflow-x-auto pb-0.5">
                    <button
                      onClick={() => setPriorityFilter('all')}
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                        priorityFilter === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                      }`}
                    >
                      All
                    </button>
                    {PRIORITIES.map(p => (
                      <button
                        key={p.value}
                        onClick={() => setPriorityFilter(p.value)}
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1 ${
                          priorityFilter === p.value ? 'bg-primary/15 text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        <span>{p.emoji}</span>
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>

                  {/* Task Groups */}
                  {grouped.overdue.length > 0 && (
                    <div className="space-y-1.5">
                      <SectionHeading
                        label="Overdue Tasks"
                        count={grouped.overdue.length}
                        color="text-destructive"
                        collapsed={collapsed.has('overdue')}
                        onToggle={() => toggleSection('overdue')}
                      />
                      {!collapsed.has('overdue') &&
                        grouped.overdue.map(t => (
                          <TaskCard
                            key={t.id}
                            todo={t}
                            batchMode={batchMode}
                            selected={batchSelected.has(t.id)}
                            onToggleSelect={() => {
                              const s = new Set(batchSelected);
                              if (s.has(t.id)) s.delete(t.id);
                              else s.add(t.id);
                              setBatchSelected(s);
                            }}
                            onToggle={() => onToggleTodo(t.id)}
                            onDelete={() => setDeleteTarget(t)}
                          />
                        ))}
                    </div>
                  )}

                  {grouped.today.length > 0 && (
                    <div className="space-y-1.5">
                      <SectionHeading
                        label="Today"
                        count={grouped.today.length}
                        color="text-chart-4"
                        collapsed={collapsed.has('today')}
                        onToggle={() => toggleSection('today')}
                      />
                      {!collapsed.has('today') &&
                        grouped.today.map(t => (
                          <TaskCard
                            key={t.id}
                            todo={t}
                            batchMode={batchMode}
                            selected={batchSelected.has(t.id)}
                            onToggleSelect={() => {
                              const s = new Set(batchSelected);
                              if (s.has(t.id)) s.delete(t.id);
                              else s.add(t.id);
                              setBatchSelected(s);
                            }}
                            onToggle={() => onToggleTodo(t.id)}
                            onDelete={() => setDeleteTarget(t)}
                          />
                        ))}
                    </div>
                  )}

                  {grouped.upcoming.length > 0 && (
                    <div className="space-y-1.5">
                      <SectionHeading
                        label="Upcoming"
                        count={grouped.upcoming.length}
                        color="text-foreground"
                        collapsed={collapsed.has('upcoming')}
                        onToggle={() => toggleSection('upcoming')}
                      />
                      {!collapsed.has('upcoming') &&
                        grouped.upcoming.map(t => (
                          <TaskCard
                            key={t.id}
                            todo={t}
                            batchMode={batchMode}
                            selected={batchSelected.has(t.id)}
                            onToggleSelect={() => {
                              const s = new Set(batchSelected);
                              if (s.has(t.id)) s.delete(t.id);
                              else s.add(t.id);
                              setBatchSelected(s);
                            }}
                            onToggle={() => onToggleTodo(t.id)}
                            onDelete={() => setDeleteTarget(t)}
                          />
                        ))}
                    </div>
                  )}

                  {grouped.completed.length > 0 && (
                    <div className="space-y-1.5">
                      <SectionHeading
                        label="Completed"
                        count={grouped.completed.length}
                        color="text-muted-foreground"
                        collapsed={collapsed.has('completed')}
                        onToggle={() => toggleSection('completed')}
                      />
                      {!collapsed.has('completed') &&
                        grouped.completed.map(t => (
                          <TaskCard
                            key={t.id}
                            todo={t}
                            batchMode={batchMode}
                            selected={batchSelected.has(t.id)}
                            onToggleSelect={() => {
                              const s = new Set(batchSelected);
                              if (s.has(t.id)) s.delete(t.id);
                              else s.add(t.id);
                              setBatchSelected(s);
                            }}
                            onToggle={() => onToggleTodo(t.id)}
                            onDelete={() => setDeleteTarget(t)}
                          />
                        ))}
                    </div>
                  )}

                  {filteredTodos.length === 0 && (
                    <div className="py-8 text-center space-y-2">
                      <p className="text-3xl">🎉</p>
                      <p className="text-xs font-bold text-foreground">No tasks matching filters</p>
                      <p className="text-[10px] text-muted-foreground">Add a new study goal below.</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Bar: Quick Add Task */}
            <div className="flex shrink-0 items-center gap-2 border-t border-border/10 bg-card/60 p-4 pb-[max(16px,var(--qmp-inset-bottom))]">
              <Button
                onClick={() => setAddSheetOpen(true)}
                className="w-full h-10 rounded-2xl font-black text-xs gap-1.5 shadow-md"
              >
                <Plus className="w-4 h-4" /> Add Study Goal / Task
              </Button>
            </div>
          </motion.div>
          </Overlay>
          {/* Add Task Modal Dialog */}
          <AlertDialog open={addSheetOpen} onOpenChange={setAddSheetOpen}>
            <AlertDialogContent className="glass-card bg-card/95 backdrop-blur-xl border border-white/15 rounded-3xl max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-base font-black flex items-center gap-2">
                  <Plus className="w-4 h-4 text-primary" /> New Study Task
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs">
                  Add a specific goal for your quiz preparation session.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <div className="space-y-3 py-2 text-xs">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Task Description
                  </label>
                  <Input
                    value={newText}
                    onChange={e => setNewText(e.target.value)}
                    placeholder="e.g. Solve 30 Cardiology MCQs"
                    className="h-10 rounded-xl"
                    autoFocus
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Priority
                    </label>
                    <select
                      value={newPriority}
                      onChange={e => setNewPriority(e.target.value as any)}
                      className="w-full h-10 px-3 rounded-xl bg-muted/20 border border-border/20 text-xs font-bold"
                    >
                      <option value="high">🔴 High Priority</option>
                      <option value="medium">🟡 Medium</option>
                      <option value="low">🟢 Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                      Category
                    </label>
                    <select
                      value={newCategory}
                      onChange={e => setNewCategory(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-muted/20 border border-border/20 text-xs font-bold"
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                    Target Date
                  </label>
                  <Input
                    type="date"
                    value={newDueDate}
                    onChange={e => setNewDueDate(e.target.value)}
                    className="h-10 rounded-xl"
                  />
                </div>
              </div>

              <AlertDialogFooter>
                <AlertDialogCancel onClick={() => setAddSheetOpen(false)}>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleCreateTodo} disabled={!newText.trim()}>
                  Save Task
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Delete Task Confirmation */}
          <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
            <AlertDialogContent className="glass-card bg-card/95 backdrop-blur-xl border border-destructive/20 rounded-3xl max-w-xs">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-sm font-black text-destructive flex items-center gap-1.5">
                  <Trash2 className="w-4 h-4" /> Delete Task?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs">
                  Remove "{deleteTarget?.text}" from your study list?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (deleteTarget) onDeleteTodo(deleteTarget.id);
                    setDeleteTarget(null);
                    toast.success('Task removed');
                  }}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </AnimatePresence>
  );
}

function SectionHeading({
  label,
  count,
  color,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  color: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between py-1 px-1 rounded-lg hover:bg-muted/10 text-xs font-bold transition-all"
    >
      <span className={`flex items-center gap-1.5 ${color}`}>
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
        <span>{label}</span>
      </span>
      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted/20 text-muted-foreground font-black">
        {count}
      </span>
    </button>
  );
}

function TaskCard({
  todo,
  batchMode,
  selected,
  onToggleSelect,
  onToggle,
  onDelete,
}: {
  todo: TodoItem;
  batchMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const pStyle = PRIORITY_STYLES[todo.priority] || PRIORITY_STYLES.medium;

  return (
    <div
      className={`p-2.5 rounded-2xl border transition-all flex items-center gap-2.5 ${
        todo.completed
          ? 'bg-muted/10 border-border/10 opacity-60'
          : `${pStyle.bg} border-border/15`
      }`}
    >
      {batchMode ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="w-4 h-4 rounded text-primary"
        />
      ) : (
        <button
          onClick={onToggle}
          className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
            todo.completed ? 'bg-primary border-primary text-primary-foreground' : 'border-border/40 hover:border-primary'
          }`}
        >
          {todo.completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </button>
      )}

      <div className="flex-1 min-w-0">
        <p className={`text-xs font-bold text-foreground leading-snug truncate ${todo.completed ? 'line-through text-muted-foreground' : ''}`}>
          {todo.text}
        </p>
        <div className="flex items-center gap-2 text-[9px] text-muted-foreground mt-0.5">
          <span className="capitalize">{todo.category || 'Practice'}</span>
          <span>·</span>
          <span>{todo.dueDate}</span>
        </div>
      </div>

      <button
        onClick={onDelete}
        className="w-6 h-6 rounded-lg bg-muted/20 hover:bg-destructive/15 hover:text-destructive flex items-center justify-center text-muted-foreground transition-all shrink-0"
        title="Delete"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}
