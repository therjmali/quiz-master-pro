import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@project/components/ui/dialog';
import { ChevronRight, ChevronLeft, FolderPlus, Plus, Home, Check } from 'lucide-react';
import { loadQuizQuestions } from '../../utils/ensureQuestions';
import { toast } from 'sonner';
import { FileNode, loadFileTree, saveFileTree, createFile, createFolder, findDuplicateFile, findNode, ROOT_ID } from '../../utils/fileTree';
import { QuizQuestion } from '../../types/quiz';

interface Props {
  open: boolean;
  onClose: () => void;
  questions: QuizQuestion[];
  defaultName?: string;
  tags?: string[];
  sourceResultId?: string;
  sourceTimestamp?: number;
  onSaved?: () => void;
}

export default function FolderPickerSheet({
  open, onClose, questions, defaultName = '', tags = [], sourceResultId, sourceTimestamp, onSaved,
}: Props) {
  const [root, setRoot] = useState<FileNode>(() => loadFileTree());
  const [browsing, setBrowsing] = useState(ROOT_ID);
  const [fileName, setFileName] = useState(defaultName);
  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const currentFolder = useMemo(() => findNode(root, browsing), [root, browsing]);
  const subfolders = useMemo(
    () => (currentFolder?.children || []).filter(c => c.type === 'folder'),
    [currentFolder],
  );

  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!fileName.trim()) { toast.error('Enter a name'); return; }
    if (saving) return;
    setSaving(true);
    try {
      // Callers may pass a cloud summary (no questions) — resolve the real ones so the file is never empty.
      const qs = questions.length > 0
        ? questions
        : await loadQuizQuestions({ id: sourceResultId, timestamp: sourceTimestamp ?? 0, quizData: questions });
      // Re-read the live tree: background healing or other screens may have saved since this sheet mounted.
      const live = loadFileTree();
      if (findDuplicateFile(live, browsing, { questions: qs, sourceResultId, sourceTimestamp })) {
        toast.info(`This quiz is already in ${currentFolder?.name || 'Home'}`);
        onClose();
        return;
      }
      const updated = createFile(
        live, browsing, fileName.trim(), qs, tags, '📄',
        sourceTimestamp, sourceResultId, sourceTimestamp,
      );
      setRoot({ ...updated });
      saveFileTree(updated);
      toast.success(`📁 Saved "${fileName.trim()}" with ${qs.length} questions to ${currentFolder?.name || 'Home'}!`);
      onSaved?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    const updated = createFolder(root, browsing, newFolderName.trim());
    setRoot({ ...updated });
    setCreating(false);
    setNewFolderName('');
    toast.success(`📁 Created "${newFolderName.trim()}"`);
  };

  const navigateUp = () => {
    if (browsing === ROOT_ID) return;
    // walk tree to find parent
    function findParent(node: FileNode, id: string): string | null {
      if (node.children) {
        for (const c of node.children) {
          if (c.id === id) return node.id;
          const f = findParent(c, id);
          if (f) return f;
        }
      }
      return null;
    }
    const parentId = findParent(root, browsing);
    setBrowsing(parentId || ROOT_ID);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-sm max-h-[75vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border flex-shrink-0">
          <DialogTitle className="text-foreground font-bold flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-primary" /> Add to Folder
          </DialogTitle>
        </DialogHeader>

        {/* File name input */}
        <div className="px-5 pt-3">
          <label className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-1.5 block">File Name</label>
          <input
            value={fileName}
            onChange={e => setFileName(e.target.value.slice(0, 60))}
            placeholder="Quiz name…"
            autoFocus
            className="w-full bg-muted/30 border border-border focus:border-primary/40 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/25 focus:outline-none transition-colors"
          />
          <p className="text-[10px] text-foreground/25 mt-1">{questions.length} questions will be saved</p>
        </div>

        {/* Folder browser */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {browsing !== ROOT_ID && (
                <button onClick={navigateUp}
                  className="w-7 h-7 rounded-lg bg-foreground/5 border border-border flex items-center justify-center text-foreground/40 hover:text-foreground transition-all active:scale-90">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
              <div className="flex items-center gap-1.5">
                <Home className="w-3.5 h-3.5 text-foreground/30" />
                <span className="text-xs font-bold text-foreground/60">{currentFolder?.name || 'Home'}</span>
              </div>
            </div>
            <button onClick={() => setCreating(true)}
              className="flex items-center gap-1 text-[10px] font-bold text-primary/70 hover:text-primary bg-primary/10 border border-primary/20 px-2.5 py-1.5 rounded-lg transition-all active:scale-95">
              <Plus className="w-3 h-3" /> New Folder
            </button>
          </div>

          {/* Inline folder creation */}
          {creating && (
            <div className="flex gap-2 mb-2 animate-fade-in">
              <input
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value.slice(0, 40))}
                placeholder="Folder name…"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                className="flex-1 bg-muted/30 border border-border focus:border-primary/40 rounded-lg px-3 py-2 text-xs text-foreground placeholder-foreground/25 focus:outline-none"
              />
              <button onClick={handleCreateFolder} disabled={!newFolderName.trim()}
                className="text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-3 rounded-lg disabled:opacity-30">
                Create
              </button>
              <button onClick={() => { setCreating(false); setNewFolderName(''); }}
                className="text-xs text-foreground/40 px-2">✕</button>
            </div>
          )}

          {/* Save here button */}
          <button onClick={handleSave} disabled={!fileName.trim()}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 text-xs font-bold text-primary bg-primary/10 border border-primary/20 rounded-xl transition-all hover:bg-primary/15 active:scale-[0.98] disabled:opacity-30">
            <Check className="w-4 h-4" /> Save here — {currentFolder?.name || 'Home'}
          </button>

          {/* Subfolder list */}
          {subfolders.length > 0 && (
            <p className="text-[9px] font-black text-foreground/25 uppercase tracking-widest mt-3 mb-1">Subfolders</p>
          )}
          {subfolders.map(f => (
            <button key={f.id} onClick={() => setBrowsing(f.id)}
              className="w-full flex items-center gap-2.5 px-3.5 py-3 text-xs font-semibold text-foreground/70 hover:bg-foreground/5 rounded-xl border border-transparent hover:border-border transition-all">
              <span className="text-base">{f.icon || '📁'}</span>
              <span className="flex-1 text-left truncate">{f.name}</span>
              <span className="text-[9px] text-foreground/20">{(f.children?.length || 0)} items</span>
              <ChevronRight className="w-3.5 h-3.5 text-foreground/20" />
            </button>
          ))}
          {subfolders.length === 0 && !creating && (
            <p className="text-center text-[10px] text-foreground/20 py-4">No subfolders — save here or create one</p>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border flex-shrink-0">
          <button onClick={onClose} className="text-sm font-bold px-4 py-2.5 rounded-xl border border-border text-muted-foreground w-full">
            Cancel
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
