import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  FileNode, TrashItem, ClipboardState,
  loadFileTree, saveFileTree, loadTrash,
  findNode, buildBreadcrumbs, searchTree,
  createFolder, createFile as createFileNode, findDuplicateFile, ORGANIZER_CHANGED_EVENT, renameNode, updateNode,
  removeNode, moveNode, deepClone, insertNode,
  trashNode, restoreFromTrash, permanentDelete, emptyAllTrash,
  countFiles, countQuestions, getAllFiles,
  ROOT_ID,
} from '../utils/fileTree';
import { QuizQuestion } from '../types/quiz';

export type ViewMode = 'grid' | 'list';
export type SearchScope = 'global' | 'local';

export interface FileManagerState {
  root: FileNode;
  currentFolderId: string;
  clipboard: ClipboardState | null;
  selectedIds: Set<string>;
  selectMode: boolean;
  viewMode: ViewMode;
  search: string;
  searchScope: SearchScope;
  trash: TrashItem[];
  showTrash: boolean;
  navStack: string[];
}

export function useFileManager() {
  const [root, setRoot] = useState<FileNode>(() => loadFileTree());
  const [currentFolderId, setCurrentFolderId] = useState(ROOT_ID);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    (localStorage.getItem('qmp_fm_view') as ViewMode) || 'list'
  );
  const [search, setSearch] = useState('');
  const [searchScope, setSearchScope] = useState<SearchScope>('local');
  const [trash, setTrash] = useState<TrashItem[]>(() => loadTrash());
  const [showTrash, setShowTrash] = useState(false);
  const navStackRef = useRef<string[]>([ROOT_ID]);

  // Stay in sync when the organizer tree / trash is changed elsewhere (e.g. restored from the main Trash)
  useEffect(() => {
    const onChanged = () => {
      setRoot({ ...loadFileTree() });
      setTrash(loadTrash());
    };
    window.addEventListener(ORGANIZER_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(ORGANIZER_CHANGED_EVENT, onChanged);
  }, []);

  // Persist view mode
  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next = prev === 'grid' ? 'list' : 'grid';
      localStorage.setItem('qmp_fm_view', next);
      return next;
    });
  }, []);

  // ─── Derived data ──────────────────────────────────────────────────────
  const currentFolder = useMemo(() => findNode(root, currentFolderId), [root, currentFolderId]);
  const children = useMemo(() => currentFolder?.children || [], [currentFolder]);
  const breadcrumbs = useMemo(() => buildBreadcrumbs(root, currentFolderId), [root, currentFolderId]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    return searchTree(root, search.trim(), searchScope, currentFolderId);
  }, [root, search, searchScope, currentFolderId]);

  // What to display: search results or current folder children
  const displayItems = useMemo(() => {
    if (searchResults) return searchResults;
    // Sort: folders first, then by name
    return [...children].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [searchResults, children]);

  // ─── Navigation ────────────────────────────────────────────────────────
  const navigateTo = useCallback((folderId: string) => {
    setSearch('');
    setShowTrash(false);
    navStackRef.current = [...navStackRef.current, folderId];
    setCurrentFolderId(folderId);
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  const navigateBack = useCallback(() => {
    if (showTrash) { setShowTrash(false); return; }
    const stack = navStackRef.current;
    if (stack.length > 1) {
      stack.pop();
      const prev = stack[stack.length - 1];
      setCurrentFolderId(prev);
      setSearch('');
      setSelectedIds(new Set());
      setSelectMode(false);
    }
  }, [showTrash]);

  const navigateHome = useCallback(() => {
    navStackRef.current = [ROOT_ID];
    setCurrentFolderId(ROOT_ID);
    setSearch('');
    setShowTrash(false);
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  // ─── Refresh helper (deep clone to trigger React re-renders) ─────────
  const refresh = useCallback((newRoot: FileNode) => {
    saveFileTree(newRoot);
    setRoot(JSON.parse(JSON.stringify(newRoot)));
  }, []);

  // ─── CRUD Operations ──────────────────────────────────────────────────
  const addFolder = useCallback((name: string, icon?: string) => {
    const updated = createFolder(root, currentFolderId, name, icon);
    refresh(updated);
    return true;
  }, [root, currentFolderId, refresh]);

  const addFile = useCallback((name: string, questions: QuizQuestion[] = [], tags: string[] = [], icon?: string, timestamp?: number, sourceResultId?: string, sourceTimestamp?: number) => {
    if (findDuplicateFile(root, currentFolderId, { questions, sourceResultId, sourceTimestamp })) return false;
    const updated = createFileNode(root, currentFolderId, name, questions, tags, icon, timestamp, sourceResultId, sourceTimestamp);
    refresh(updated);
    return true;
  }, [root, currentFolderId, refresh]);

  /** Apply many node patches with ONE save + ONE re-render (used by background link/question healing). */
  const batchUpdate = useCallback((patches: { id: string; patch: Partial<Pick<FileNode, 'name' | 'questions' | 'tags' | 'sourceResultId' | 'sourceTimestamp'>> }[]) => {
    if (!patches.length) return;
    let updated = root;
    for (const { id, patch } of patches) updated = updateNode(updated, id, patch);
    refresh(updated);
  }, [root, refresh]);

  const rename = useCallback((nodeId: string, newName: string) => {
    const updated = renameNode(root, nodeId, newName);
    refresh(updated);
  }, [root, refresh]);

  const update = useCallback((nodeId: string, patch: Partial<Pick<FileNode, 'name' | 'icon' | 'posterUrl' | 'description' | 'tags' | 'questions' | 'sourceResultId' | 'sourceTimestamp'>>) => {
    const updated = updateNode(root, nodeId, patch);
    refresh(updated);
  }, [root, refresh]);

  // ─── Clipboard (Cut/Copy/Paste) ────────────────────────────────────────
  const clipCut = useCallback((nodeIds: string[]) => {
    setClipboard({ nodeIds, action: 'cut', sourceParentId: currentFolderId });
  }, [currentFolderId]);

  const clipCopy = useCallback((nodeIds: string[]) => {
    setClipboard({ nodeIds, action: 'copy', sourceParentId: currentFolderId });
  }, [currentFolderId]);

  const clipPaste = useCallback(() => {
    if (!clipboard) return;
    let updated = root;

    for (const nodeId of clipboard.nodeIds) {
      if (clipboard.action === 'cut') {
        updated = moveNode(updated, nodeId, currentFolderId);
      } else {
        // Copy: deep clone and insert
        const original = findNode(updated, nodeId);
        if (original) {
          const cloned = deepClone(original);
          updated = insertNode(updated, currentFolderId, cloned);
        }
      }
    }

    saveFileTree(updated);
    refresh(updated);
    setClipboard(null);
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [clipboard, root, currentFolderId, refresh]);

  const clipCancel = useCallback(() => {
    setClipboard(null);
  }, []);

  // ─── Delete / Trash ────────────────────────────────────────────────────
  const moveToTrash = useCallback((nodeId: string) => {
    const { tree } = trashNode(root, nodeId);
    setTrash(loadTrash());
    refresh(tree);
  }, [root, refresh]);

  const bulkMoveToTrash = useCallback((nodeIds: string[]) => {
    let updated = root;
    for (const id of nodeIds) {
      const { tree } = trashNode(updated, id);
      updated = tree;
    }
    setTrash(loadTrash());
    refresh(updated);
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [root, refresh]);

  const restoreTrashItem = useCallback((nodeId: string) => {
    const updated = restoreFromTrash(root, nodeId);
    setTrash(loadTrash());
    refresh(updated);
  }, [root, refresh]);

  const permDelete = useCallback((nodeId: string) => {
    permanentDelete(nodeId);
    setTrash(loadTrash());
  }, []);

  const emptyTrash = useCallback(() => {
    emptyAllTrash();
    setTrash([]);
  }, []);

  // ─── Selection ─────────────────────────────────────────────────────────
  const toggleSelect = useCallback((nodeId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(displayItems.map(n => n.id)));
  }, [displayItems]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  const enterSelectMode = useCallback(() => {
    setSelectMode(true);
  }, []);

  // ─── Bulk Operations ───────────────────────────────────────────────────
  const bulkMove = useCallback((targetFolderId: string, explicitIds?: string[]) => {
    let updated = root;
    const ids = explicitIds || [...selectedIds];
    for (const id of ids) {
      updated = moveNode(updated, id, targetFolderId);
    }
    saveFileTree(updated);
    refresh(updated);
    setSelectedIds(new Set());
    setSelectMode(false);
  }, [root, selectedIds, refresh]);

  // ─── Stats for current view ────────────────────────────────────────────
  const stats = useMemo(() => {
    const folder = currentFolder;
    if (!folder) return { folders: 0, files: 0, totalQuestions: 0 };
    const ch = folder.children || [];
    return {
      folders: ch.filter(c => c.type === 'folder').length,
      files: ch.filter(c => c.type === 'file' || c.type === 'bookmark').length,
      totalQuestions: countQuestions(folder),
    };
  }, [currentFolder]);

  return {
    // State
    root,
    currentFolderId,
    currentFolder,
    clipboard,
    selectedIds,
    selectMode,
    viewMode,
    search,
    searchScope,
    trash,
    showTrash,
    breadcrumbs,
    displayItems,
    stats,

    // Navigation
    navigateTo,
    navigateBack,
    navigateHome,

    // View
    toggleViewMode,
    setSearch,
    setSearchScope,
    setShowTrash,

    // CRUD
    addFolder,
    addFile,
    rename,
    update,
    batchUpdate,

    // Clipboard
    clipCut,
    clipCopy,
    clipPaste,
    clipCancel,

    // Trash
    moveToTrash,
    bulkMoveToTrash,
    restoreTrashItem,
    permDelete,
    emptyTrash,

    // Selection
    toggleSelect,
    selectAll,
    clearSelection,
    enterSelectMode,

    // Bulk
    bulkMove,

    // Force refresh (deep clone for reorder)
    forceRefresh: () => { saveFileTree(root); setRoot(JSON.parse(JSON.stringify(root))); },
    forceRefreshWith: (newRoot: FileNode) => { saveFileTree(newRoot); setRoot(JSON.parse(JSON.stringify(newRoot))); },

    // Helpers
    findNode: (id: string) => findNode(root, id),
    getAllFiles: () => getAllFiles(root),
    countQuestions: (node: FileNode) => countQuestions(node),
    countFiles: (node: FileNode) => countFiles(node),
  };
}
