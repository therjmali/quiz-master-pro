import { useState } from 'react';
import AiRationaleText from '../AiRationaleText';
import { ChevronDown, ChevronUp, Trash2, Loader2 } from 'lucide-react';
import { FileNode, BookmarkData, loadFileTree, findNode, saveFileTree } from '../../utils/fileTree';
import { explainQuestion } from 'zitejs/api';

function getStatus(bm: BookmarkData) {
  if (bm.userAnswer === null) return { label: '⏭ Skipped', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
  if (bm.userAnswer === bm.correctAnswer) return { label: '✓ Correct', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  return { label: '✗ Wrong', cls: 'text-red-400 bg-red-500/10 border-red-500/20' };
}

interface Props {
  node: FileNode;
  showRationale: boolean;
  showAiRationale: boolean;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onRemove: () => void;
}

export default function BookmarkQuestionCard({ node, showRationale, showAiRationale, selectMode, selected, onToggleSelect, onRemove }: Props) {
  const bm = node.bookmarkData;
  if (!bm) return null;

  const [expanded, setExpanded] = useState(false);
  const [aiRationale, setAiRationale] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const status = getStatus(bm);

  const handleFetchAi = async () => {
    if (aiRationale || aiLoading) return;
    setAiLoading(true);
    try {
      const s = bm.userAnswer === bm.correctAnswer ? 'correct' : bm.userAnswer === null ? 'skipped' : 'wrong';
      const result = await explainQuestion({
        question: bm.question,
        correctAnswer: bm.correctAnswer,
        userAnswer: bm.userAnswer || undefined,
        status: s,
      });
      setAiRationale(result.rationale);
      // Persist AI rationale back to file tree so PDF reports can access it
      try {
        const tree = loadFileTree();
        const treeNode = findNode(tree, node.id);
        if (treeNode?.bookmarkData) {
          (treeNode.bookmarkData as any).aiRationale = result.rationale;
          saveFileTree(tree);
        }
      } catch { /* persist silently */ }
    } catch {
      setAiRationale('Failed to generate explanation.');
    } finally {
      setAiLoading(false);
    }
  };

  const diffBadge = bm.difficulty ? (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${
      bm.difficulty === 'hard' ? 'text-red-400 bg-red-500/10 border-red-500/15' :
      bm.difficulty === 'easy' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/15' :
      'text-amber-400 bg-amber-500/10 border-amber-500/15'
    }`}>{bm.difficulty}</span>
  ) : null;

  return (
    <div className={`rounded-xl border transition-all ${selected ? 'border-primary/40 bg-primary/5' : 'border-border bg-card'}`}>
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={() => !selectMode && setExpanded(v => !v)}>
        {selectMode && (
          <button onClick={e => { e.stopPropagation(); onToggleSelect(); }}
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${selected ? 'bg-primary border-primary' : 'border-foreground/20'}`}>
            {selected && <span className="text-primary-foreground text-[9px] font-black">✓</span>}
          </button>
        )}
        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${status.cls} flex-shrink-0`}>{status.label}</span>
        <p className="flex-1 text-xs font-semibold text-foreground/80 truncate">{bm.question}</p>
        {diffBadge}
        {!selectMode && (
          expanded ? <ChevronUp className="w-3.5 h-3.5 text-foreground/25 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-foreground/25 flex-shrink-0" />
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50 pt-2">
          {/* Full question */}
          <p className="text-sm font-semibold text-foreground/90 leading-relaxed">{bm.question}</p>

          {/* Options */}
          <div className="space-y-1">
            {bm.options.map((opt, i) => {
              const isCA = opt === bm.correctAnswer;
              const isUA = opt === bm.userAnswer;
              const isWrong = isUA && !isCA;
              return (
                <div key={i} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-xs ${
                  isCA ? 'bg-emerald-500/10 border-emerald-500/25 text-foreground' :
                  isWrong ? 'bg-red-500/10 border-red-500/25 text-foreground' :
                  'bg-foreground/[0.03] border-border text-foreground/70'
                }`}>
                  <span className="text-foreground/30 font-bold text-[10px]">({String.fromCharCode(97 + i)})</span>
                  <span className="flex-1">{opt}</span>
                  {isCA && <span className="text-emerald-400 text-[9px] font-bold">✓ Correct</span>}
                  {isWrong && <span className="text-red-400 text-[9px] font-bold">✗ Yours</span>}
                </div>
              );
            })}
          </div>

          {/* Book rationale */}
          {showRationale && bm.rationale && (
            <div className="bg-amber-500/10 border-l-4 border-amber-500/50 p-2.5 rounded-r-lg">
              <p className="text-[9px] font-black text-amber-400 uppercase tracking-widest mb-1">📖 Book Rationale</p>
              <AiRationaleText text={bm.rationale} className="text-xs text-foreground/70" />
            </div>
          )}

          {/* AI rationale */}
          {showAiRationale && (
            <div>
              {aiRationale ? (
                <div className="bg-violet-500/10 border-l-4 border-violet-500/50 p-2.5 rounded-r-lg">
                  <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest mb-1">💡 AI Explanation</p>
                  <AiRationaleText text={aiRationale} className="text-xs text-foreground/70" />
                </div>
              ) : (
                <button onClick={handleFetchAi} disabled={aiLoading}
                  className="flex items-center gap-1.5 text-[10px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-3 py-2 rounded-lg hover:bg-violet-500/15 transition-all disabled:opacity-50">
                  {aiLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</> : '💡 Get AI Explanation'}
                </button>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button onClick={onRemove}
              className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 rounded-lg hover:bg-red-500/15 transition-all active:scale-95">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
            <span className="text-[9px] text-foreground/20 ml-auto">
              {new Date(bm.bookmarkedAt).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
