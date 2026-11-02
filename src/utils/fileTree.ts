import { QuizQuestion } from '../types/quiz';
import { idbGet, idbSet } from './indexedDB';

// ─── Unified File Tree Node ────────────────────────────────────────────────────

export interface BookmarkData {
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string | null;
  rationale?: string;
  difficulty?: string;
  questionType?: string;
  quizTitle: string;
  subject: string;
  bookmarkedAt: number;
  notes?: string;
}

export interface FileNode {
  id: string;
  name: string;
  type: 'folder' | 'file' | 'bookmark';
  icon?: string;
  posterUrl?: string;
  createdAt: number;
  updatedAt: number;
  position?: number;
  children?: FileNode[];
  // File-specific (collection data)
  questions?: QuizQuestion[];
  tags?: string[];
  description?: string;
  // Link back to quiz history result
  sourceResultId?: string;
  sourceTimestamp?: number;
  // Bookmark-specific
  bookmarkData?: BookmarkData;
}

export interface TrashItem {
  node: FileNode;
  parentId: string;
  deletedAt: number;
}

export type ClipboardAction = 'cut' | 'copy';

export interface ClipboardState {
  nodeIds: string[];
  action: ClipboardAction;
  sourceParentId: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const TREE_KEY = 'qmp_file_tree';
const TRASH_KEY = 'qmp_file_trash';
const IDB_TREE_KEY = 'qmp_file_tree_idb';
const IDB_TRASH_KEY = 'qmp_file_trash_idb';
const ROOT_ID = 'root';

// In-memory caches for sync reads
let _treeCache: FileNode | null = null;
let _trashCache: TrashItem[] | null = null;

/** Fired by screens (e.g. the main Trash) that change the organizer tree outside the FileManager. */
export const ORGANIZER_CHANGED_EVENT = 'qmp-organizer-changed';
export function notifyOrganizerChanged(): void {
  try { window.dispatchEvent(new Event(ORGANIZER_CHANGED_EVENT)); } catch {}
}

/** Drop the in-memory caches (used by the full local-data reset). */
export function resetFileTreeCaches(): void {
  _treeCache = null;
  _trashCache = null;
}

function genId(): string {
  return `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Create default root ───────────────────────────────────────────────────────

function createRoot(): FileNode {
  return {
    id: ROOT_ID,
    name: 'Home',
    type: 'folder',
    icon: '🏠',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    children: [],
  };
}

// ─── Migration from old SubjectFolder/UnitFolder/Collection ────────────────────

function migrateOldTree(): FileNode | null {
  try {
    const raw = localStorage.getItem('qmp_library_tree');
    if (!raw) return null;
    const old = JSON.parse(raw);
    if (!Array.isArray(old) || old.length === 0) return null;

    const now = Date.now();
    const root = createRoot();
    root.children = old.map((subject: any) => {
      const subNode: FileNode = {
        id: subject.id || genId(),
        name: subject.name || 'Untitled',
        type: 'folder',
        icon: subject.icon || '📁',
        posterUrl: subject.posterUrl,
        createdAt: now,
        updatedAt: now,
        children: (subject.units || []).map((unit: any) => {
          const unitNode: FileNode = {
            id: unit.id || genId(),
            name: unit.name || 'Untitled',
            type: 'folder',
            icon: unit.icon || '📂',
            createdAt: now,
            updatedAt: now,
            children: (unit.collections || []).map((col: any) => ({
              id: col.id || genId(),
              name: col.name || 'Untitled',
              type: 'file' as const,
              icon: col.icon || '📄',
              createdAt: col.createdAt || now,
              updatedAt: col.updatedAt || now,
              questions: col.questions || [],
              tags: col.tags || [],
              description: col.description || '',
            })),
          };
          return unitNode;
        }),
      };
      return subNode;
    });

    return root;
  } catch {
    return null;
  }
}

// ─── Load / Save ───────────────────────────────────────────────────────────────

/**
 * Legacy cleanup: older builds renamed organizer files to "⊘ name" when the linked quiz
 * was deleted from the Library. Organizer files are independent now — strip the marker.
 */
function stripLegacyTrashMarkers(node: FileNode): boolean {
  let changed = false;
  if (node.name && node.name.startsWith('⊘ ')) {
    node.name = node.name.replace(/^(?:⊘\s*)+/, '').trim() || 'Untitled';
    changed = true;
  }
  if (node.children) for (const c of node.children) if (stripLegacyTrashMarkers(c)) changed = true;
  return changed;
}

function normalizeLoadedTree(tree: FileNode): FileNode {
  const migrated = migrateOldBookmarks(tree);
  if (stripLegacyTrashMarkers(migrated)) saveFileTree(migrated);
  return migrated;
}

/**
 * Initialize file tree + trash from IndexedDB (authoritative — it is written on every save and
 * has no 5 MB limit), falling back to localStorage. Must complete BEFORE the UI reads the tree.
 */
export async function initFileTreeStore(): Promise<FileNode> {
  let fromIdb: FileNode | null = null;
  try {
    const idbData = await idbGet<FileNode>(IDB_TREE_KEY);
    if (idbData && idbData.id === ROOT_ID) fromIdb = idbData;
  } catch {}

  try {
    const idbTrash = await idbGet<TrashItem[]>(IDB_TRASH_KEY);
    if (Array.isArray(idbTrash)) _trashCache = idbTrash;
  } catch {}

  if (fromIdb) {
    _treeCache = normalizeLoadedTree(fromIdb);
    return _treeCache;
  }
  // Fall through to sync load (migrates from localStorage), then seed IDB
  _treeCache = null;
  const tree = loadFileTree();
  idbSet(IDB_TREE_KEY, tree).catch(() => {});
  return tree;
}

export function loadFileTree(): FileNode {
  if (_treeCache) return _treeCache;
  try {
    const raw = localStorage.getItem(TREE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id === ROOT_ID) {
        _treeCache = normalizeLoadedTree(parsed);
        return _treeCache;
      }
    }
    const migrated = migrateOldTree();
    if (migrated) {
      _treeCache = migrateOldBookmarks(migrated);
      saveFileTree(_treeCache);
      return _treeCache;
    }
    const root = createRoot();
    _treeCache = migrateOldBookmarks(root);
    saveFileTree(_treeCache);
    return _treeCache;
  } catch {
    _treeCache = createRoot();
    return _treeCache;
  }
}

export function saveFileTree(root: FileNode): void {
  _treeCache = root;
  // IndexedDB is authoritative (no 5 MB cap). localStorage is a fast first-paint mirror only:
  // if it is full, drop the stale mirror so it can never override newer IDB data.
  idbSet(IDB_TREE_KEY, root).catch(() => {});
  try {
    localStorage.setItem(TREE_KEY, JSON.stringify(root));
  } catch {
    try { localStorage.removeItem(TREE_KEY); } catch {}
  }
}

export function loadTrash(): TrashItem[] {
  if (_trashCache) return _trashCache;
  try {
    const raw = localStorage.getItem(TRASH_KEY);
    _trashCache = raw ? JSON.parse(raw) : [];
    return _trashCache!;
  } catch { _trashCache = []; return []; }
}

export function saveTrash(items: TrashItem[]): void {
  _trashCache = items;
  idbSet(IDB_TRASH_KEY, items).catch(() => {});
  try {
    localStorage.setItem(TRASH_KEY, JSON.stringify(items));
  } catch {
    try { localStorage.removeItem(TRASH_KEY); } catch {}
  }
}

// ─── Tree Traversal Utilities ──────────────────────────────────────────────────

/** Find a node by ID anywhere in the tree */
export function findNode(root: FileNode, id: string): FileNode | null {
  if (root.id === id) return root;
  if (root.children) {
    for (const child of root.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

/** Find parent node of a given ID */
export function findParent(root: FileNode, id: string): FileNode | null {
  if (root.children) {
    for (const child of root.children) {
      if (child.id === id) return root;
      const found = findParent(child, id);
      if (found) return found;
    }
  }
  return null;
}

/** Build breadcrumb path from root to a node ID */
export function buildBreadcrumbs(root: FileNode, targetId: string): FileNode[] {
  const path: FileNode[] = [];

  function walk(node: FileNode): boolean {
    path.push(node);
    if (node.id === targetId) return true;
    if (node.children) {
      for (const child of node.children) {
        if (walk(child)) return true;
      }
    }
    path.pop();
    return false;
  }

  walk(root);
  return path;
}

/** Recursively search for nodes matching a query */
export function searchTree(root: FileNode, query: string, scope: 'global' | 'local', currentFolderId: string): FileNode[] {
  const q = query.toLowerCase();
  const results: FileNode[] = [];

  function walk(node: FileNode, insideScope: boolean) {
    if (node.id === ROOT_ID && scope === 'local') {
      // Skip root, find current folder first
      const target = findNode(root, currentFolderId);
      if (target?.children) {
        target.children.forEach(c => walkCollect(c));
      }
      return;
    }
    if (node.id !== ROOT_ID && matchesQuery(node, q)) {
      results.push(node);
    }
    if (node.children) {
      node.children.forEach(c => walk(c, insideScope));
    }
  }

  function walkCollect(node: FileNode) {
    if (matchesQuery(node, q)) results.push(node);
    if (node.children) node.children.forEach(c => walkCollect(c));
  }

  if (scope === 'global') {
    walk(root, true);
  } else {
    const target = findNode(root, currentFolderId);
    if (target?.children) {
      target.children.forEach(c => walkCollect(c));
    }
  }

  return results;
}

function matchesQuery(node: FileNode, q: string): boolean {
  return node.name.toLowerCase().includes(q) ||
    (node.description?.toLowerCase().includes(q) ?? false) ||
    (node.tags?.some(t => t.toLowerCase().includes(q)) ?? false) ||
    (node.bookmarkData?.question.toLowerCase().includes(q) ?? false) ||
    (node.bookmarkData?.subject.toLowerCase().includes(q) ?? false);
}

/** Deep clone a node with new IDs */
export function deepClone(node: FileNode): FileNode {
  const cloned: FileNode = {
    ...node,
    id: genId(),
    name: `${node.name} (copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    questions: node.questions ? [...node.questions] : undefined,
    tags: node.tags ? [...node.tags] : undefined,
    bookmarkData: node.bookmarkData ? { ...node.bookmarkData } : undefined,
    children: node.children ? node.children.map(c => deepClone(c)) : undefined,
  };
  return cloned;
}

/** Count all files (non-folder nodes) in a subtree */
export function countFiles(node: FileNode): number {
  if (node.type === 'file' || node.type === 'bookmark') return 1;
  return (node.children || []).reduce((sum, c) => sum + countFiles(c), 0);
}

/** Count all questions in a subtree */
export function countQuestions(node: FileNode): number {
  if (node.type === 'file') return node.questions?.length || 0;
  return (node.children || []).reduce((sum, c) => sum + countQuestions(c), 0);
}

/** Get all files (collections) recursively */
export function getAllFiles(node: FileNode): FileNode[] {
  if (node.type === 'file' || node.type === 'bookmark') return [node];
  return (node.children || []).flatMap(c => getAllFiles(c));
}

/** Get all bookmark nodes recursively */
export function getAllBookmarks(node: FileNode): FileNode[] {
  if (node.type === 'bookmark') return [node];
  if (node.type === 'folder') return (node.children || []).flatMap(c => getAllBookmarks(c));
  return [];
}

/** Check if a question is bookmarked anywhere in the tree */
export function isQuestionBookmarked(root: FileNode, questionText: string): boolean {
  const bookmarks = getAllBookmarks(root);
  return bookmarks.some(b => b.bookmarkData?.question === questionText);
}

/** Get subject icon for bookmark folders */
function getSubjectEmoji(subject: string): string {
  const lower = subject.toLowerCase();
  if (lower.includes('math'))    return '📐';
  if (lower.includes('science') || lower.includes('physics') || lower.includes('chemistry') || lower.includes('bio')) return '🔬';
  if (lower.includes('english') || lower.includes('grammar') || lower.includes('language')) return '📝';
  if (lower.includes('history')) return '📜';
  if (lower.includes('geo'))    return '🌍';
  if (lower.includes('computer') || lower.includes('programming') || lower.includes('coding')) return '💻';
  if (lower.includes('economics') || lower.includes('business')) return '📊';
  if (lower.includes('law'))    return '⚖️';
  if (lower.includes('medical') || lower.includes('anatomy') || lower.includes('pharma')) return '🏥';
  if (lower.includes('general')) return '📚';
  return '📖';
}

/** Add a bookmark to the file tree with auto-created folder structure:
 *  Home → 📁 Bookmarks → 📁 {subject} → 📁 {quizTitle} → 📅 {date} → 🔖 bookmark
 *  Returns updated root (mutated in place, also saved).
 */
export function addBookmarkToTree(root: FileNode, data: BookmarkData): FileNode {
  const subject = data.subject || 'General';
  const quizTitle = data.quizTitle || 'Untitled Quiz';
  const date = new Date().toISOString().split('T')[0];
  const now = Date.now();

  // 1. Find or create "📁 Bookmarks" folder under root
  if (!root.children) root.children = [];
  let bmFolder = root.children.find(c => c.type === 'folder' && c.name === 'Bookmarks');
  if (!bmFolder) {
    bmFolder = { id: genId(), name: 'Bookmarks', type: 'folder', icon: '🔖', createdAt: now, updatedAt: now, children: [] };
    root.children.unshift(bmFolder);
  }

  // 2. Find or create subject folder
  if (!bmFolder.children) bmFolder.children = [];
  let subFolder = bmFolder.children.find(c => c.type === 'folder' && c.name === subject);
  if (!subFolder) {
    subFolder = { id: genId(), name: subject, type: 'folder', icon: getSubjectEmoji(subject), createdAt: now, updatedAt: now, children: [] };
    bmFolder.children.push(subFolder);
  }

  // 3. Find or create quiz title folder
  if (!subFolder.children) subFolder.children = [];
  let quizFolder = subFolder.children.find(c => c.type === 'folder' && c.name === quizTitle);
  if (!quizFolder) {
    quizFolder = { id: genId(), name: quizTitle, type: 'folder', icon: '📝', createdAt: now, updatedAt: now, children: [] };
    subFolder.children.push(quizFolder);
  }

  // 4. Find or create date folder
  if (!quizFolder.children) quizFolder.children = [];
  let dateFolder = quizFolder.children.find(c => c.type === 'folder' && c.name === date);
  if (!dateFolder) {
    dateFolder = { id: genId(), name: date, type: 'folder', icon: '📅', createdAt: now, updatedAt: now, children: [] };
    quizFolder.children.push(dateFolder);
  }

  // 5. Check duplicate
  if (!dateFolder.children) dateFolder.children = [];
  const exists = dateFolder.children.some(c => c.type === 'bookmark' && c.bookmarkData?.question === data.question);
  if (exists) return root; // no duplicate

  // 6. Create bookmark node
  const truncName = data.question.length > 50 ? data.question.slice(0, 50) + '…' : data.question;
  const bmNode: FileNode = {
    id: genId(),
    name: truncName,
    type: 'bookmark',
    icon: '🔖',
    createdAt: now,
    updatedAt: now,
    bookmarkData: { ...data, bookmarkedAt: now },
  };
  dateFolder.children.push(bmNode);

  // Update timestamps
  dateFolder.updatedAt = now;
  quizFolder.updatedAt = now;
  subFolder.updatedAt = now;
  bmFolder.updatedAt = now;
  root.updatedAt = now;

  saveFileTree(root);
  return root;
}

/** Remove a bookmark node and clean up empty parent folders */
export function removeBookmarkNode(root: FileNode, nodeId: string): FileNode {
  // Remove the node
  const { tree } = removeNode(root, nodeId);
  // Bubble up: clean empty folders inside Bookmarks
  const bmFolder = tree.children?.find(c => c.type === 'folder' && c.name === 'Bookmarks');
  if (bmFolder) {
    pruneEmptyFolders(bmFolder);
    // If bookmarks folder itself is empty, remove it
    if (!bmFolder.children || bmFolder.children.length === 0) {
      tree.children = tree.children?.filter(c => c.id !== bmFolder.id);
    }
  }
  saveFileTree(tree);
  return tree;
}

/** Recursively remove empty folders */
function pruneEmptyFolders(node: FileNode): void {
  if (!node.children) return;
  for (const child of node.children) {
    if (child.type === 'folder') pruneEmptyFolders(child);
  }
  node.children = node.children.filter(c => {
    if (c.type === 'folder' && (!c.children || c.children.length === 0)) return false;
    return true;
  });
}

// ─── Tree Mutation Utilities ───────────────────────────────────────────────────

/** Create a new folder inside a parent */
export function createFolder(root: FileNode, parentId: string, name: string, icon = '📁'): FileNode {
  const parent = findNode(root, parentId);
  if (!parent || parent.type !== 'folder') return root;
  const newFolder: FileNode = {
    id: genId(), name, type: 'folder', icon,
    createdAt: Date.now(), updatedAt: Date.now(), children: [],
  };
  if (!parent.children) parent.children = [];
  parent.children.push(newFolder);
  parent.updatedAt = Date.now();
  saveFileTree(root);
  return root;
}

/** Create a new file (collection) inside a parent */
/** Normalised question text used to recognise "the same quiz". */
function qKey(q: QuizQuestion | undefined): string {
  return (q?.question || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Is this quiz already a file directly inside `parentId`?
 * Same quiz = same hard link (cloud id or timestamp) OR identical questions
 * (same count, same first / middle / last question). Different quizzes that merely share a title are NOT duplicates.
 */
export function findDuplicateFile(
  root: FileNode,
  parentId: string,
  candidate: { questions?: QuizQuestion[]; sourceResultId?: string; sourceTimestamp?: number },
): FileNode | null {
  const parent = findNode(root, parentId);
  if (!parent?.children) return null;
  const cq = candidate.questions || [];
  const cLen = cq.length;
  const cKeys = cLen > 0 ? [qKey(cq[0]), qKey(cq[Math.floor(cLen / 2)]), qKey(cq[cLen - 1])] : null;

  for (const f of parent.children) {
    if (f.type !== 'file') continue;
    // 1) same hard link
    if (candidate.sourceResultId && (f.sourceResultId === candidate.sourceResultId
        || (f.sourceTimestamp && String(f.sourceTimestamp) === candidate.sourceResultId))) return f;
    if (candidate.sourceTimestamp && (f.sourceTimestamp === candidate.sourceTimestamp
        || f.sourceResultId === String(candidate.sourceTimestamp))) return f;
    // 2) identical questions
    const fq = f.questions || [];
    if (cKeys && fq.length === cLen && cLen > 0 && cKeys[0]
        && qKey(fq[0]) === cKeys[0]
        && qKey(fq[Math.floor(cLen / 2)]) === cKeys[1]
        && qKey(fq[cLen - 1]) === cKeys[2]) return f;
  }
  return null;
}

export function createFile(root: FileNode, parentId: string, name: string, questions: QuizQuestion[] = [], tags: string[] = [], icon = '📄', timestamp?: number, sourceResultId?: string, sourceTimestamp?: number): FileNode {
  const parent = findNode(root, parentId);
  if (!parent || parent.type !== 'folder') return root;
  // Never add the same quiz twice to the same folder
  if (findDuplicateFile(root, parentId, { questions, sourceResultId, sourceTimestamp })) return root;
  const ts = timestamp || Date.now();
  const newFile: FileNode = {
    id: genId(), name, type: 'file', icon,
    createdAt: ts, updatedAt: ts,
    questions, tags, description: '',
    ...(sourceResultId ? { sourceResultId } : {}),
    ...(sourceTimestamp ? { sourceTimestamp } : {}),
  };
  if (!parent.children) parent.children = [];
  parent.children.push(newFile);
  parent.updatedAt = Date.now();
  saveFileTree(root);
  return root;
}

/** Rename a node */
export function renameNode(root: FileNode, nodeId: string, newName: string): FileNode {
  const node = findNode(root, nodeId);
  if (node) {
    node.name = newName;
    node.updatedAt = Date.now();
    saveFileTree(root);
  }
  return root;
}

/** Update node properties */
export function updateNode(root: FileNode, nodeId: string, patch: Partial<Pick<FileNode, 'name' | 'icon' | 'posterUrl' | 'description' | 'tags' | 'questions' | 'sourceResultId' | 'sourceTimestamp'>>): FileNode {
  const node = findNode(root, nodeId);
  if (node) {
    Object.assign(node, patch);
    node.updatedAt = Date.now();
    saveFileTree(root);
  }
  return root;
}

/** Remove a node from its parent (returns the removed node) */
export function removeNode(root: FileNode, nodeId: string): { tree: FileNode; removed: FileNode | null } {
  let removed: FileNode | null = null;

  function walk(node: FileNode): boolean {
    if (!node.children) return false;
    const idx = node.children.findIndex(c => c.id === nodeId);
    if (idx !== -1) {
      removed = node.children[idx];
      node.children.splice(idx, 1);
      node.updatedAt = Date.now();
      return true;
    }
    return node.children.some(c => walk(c));
  }

  walk(root);
  if (removed) saveFileTree(root);
  return { tree: root, removed };
}

/** Insert a node into a folder */
export function insertNode(root: FileNode, parentId: string, node: FileNode): FileNode {
  const parent = findNode(root, parentId);
  if (!parent || parent.type !== 'folder') return root;
  if (!parent.children) parent.children = [];
  parent.children.push(node);
  parent.updatedAt = Date.now();
  saveFileTree(root);
  return root;
}

/** Move a node from one parent to another */
export function moveNode(root: FileNode, nodeId: string, targetParentId: string): FileNode {
  // Don't move into self or descendant
  const target = findNode(root, targetParentId);
  if (!target || target.type !== 'folder') return root;
  const node = findNode(root, nodeId);
  if (!node) return root;
  // Check not moving into self or descendant
  if (nodeId === targetParentId) return root;
  if (findNode(node, targetParentId)) return root;

  const { removed } = removeNode(root, nodeId);
  if (removed) {
    insertNode(root, targetParentId, removed);
  }
  return root;
}

/** Move to trash */
export function trashNode(root: FileNode, nodeId: string): { tree: FileNode; trashedItem: TrashItem | null } {
  const parent = findParent(root, nodeId);
  const { tree, removed } = removeNode(root, nodeId);
  if (removed) {
    const trash = loadTrash();
    const item: TrashItem = { node: removed, parentId: parent?.id || ROOT_ID, deletedAt: Date.now() };
    trash.unshift(item);
    saveTrash(trash);
    return { tree, trashedItem: item };
  }
  return { tree, trashedItem: null };
}

/** Restore from trash */
export function restoreFromTrash(root: FileNode, nodeId: string): FileNode {
  const trash = loadTrash();
  const idx = trash.findIndex(t => t.node.id === nodeId);
  if (idx === -1) return root;
  const item = trash[idx];
  trash.splice(idx, 1);
  saveTrash(trash);

  // Try to restore to original parent, fallback to root
  const parentExists = findNode(root, item.parentId);
  const targetId = parentExists ? item.parentId : ROOT_ID;
  return insertNode(root, targetId, item.node);
}

/** Permanently delete from trash */
export function permanentDelete(nodeId: string): void {
  const trash = loadTrash();
  saveTrash(trash.filter(t => t.node.id !== nodeId));
}

/** Empty entire trash */
export function emptyAllTrash(): void {
  saveTrash([]);
}

// ─── Migrate old bookmarks into file tree ──────────────────────────────────────

export function migrateOldBookmarks(root: FileNode): FileNode {
  try {
    const raw = localStorage.getItem('qmp_bookmarks_v2');
    if (!raw) return root;
    const store = JSON.parse(raw);
    if (!store || !Array.isArray(store.folders) || store.folders.length === 0) return root;

    let updated = root;
    let count = 0;
    for (const folder of store.folders) {
      for (const q of (folder.questions || [])) {
        if (isQuestionBookmarked(updated, q.question)) continue;
        updated = addBookmarkToTree(updated, {
          question: q.question,
          options: q.options || [],
          correctAnswer: q.correctAnswer || '',
          userAnswer: q.userAnswer ?? null,
          difficulty: q.difficulty,
          questionType: q.questionType,
          quizTitle: q.quizTitle || folder.quizTitle || 'Imported',
          subject: q.subject || folder.subject || 'General',
          bookmarkedAt: q.bookmarkedAt || Date.now(),
        });
        count++;
      }
    }
    if (count > 0) {
      saveFileTree(updated);
      // Remove old store so migration doesn't run again
      localStorage.removeItem('qmp_bookmarks_v2');
      localStorage.removeItem('qmp_bookmarks');
    }
    return updated;
  } catch { return root; }
}

// ─── Backward compatibility exports ────────────────────────────────────────────

export { ROOT_ID, genId };
