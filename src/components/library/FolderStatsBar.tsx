import { useMemo } from 'react';
import { FileNode, getAllFiles } from '../../utils/fileTree';
import { QuizResult } from '../../types/quiz';
import { formatTime } from '../../utils/scoring';
import { resolveLinkedResults } from '../../utils/historyLink';

/* ─── Performance Stats (real quiz scores) ──────────────────────────── */
export interface FolderPerformance {
  attempts: number;
  totalQuestions: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  avgPercentage: number;
  bestPercentage: number;
  worstPercentage: number;
  avgAccuracy: number;
  totalTime: number;
  latestDate: number;
  oldestDate: number;
  scores: number[];           // individual percentages for sparkline
  matchedResults: QuizResult[];
}

/** Match a file to its history records — delegated to the single shared link resolver */
function matchFileToHistory(file: FileNode, history: QuizResult[]): QuizResult[] {
  return resolveLinkedResults(file, history);
}

/** Compute performance stats for a folder by matching its files to history */
export function computeFolderPerformance(node: FileNode, history: QuizResult[]): FolderPerformance {
  const files = getAllFiles(node);
  const allMatched: QuizResult[] = [];
  const seen = new Set<string>();

  for (const file of files) {
    const matches = matchFileToHistory(file, history);
    for (const m of matches) {
      const key = m.id || String(m.timestamp);
      if (!seen.has(key)) {
        seen.add(key);
        allMatched.push(m);
      }
    }
  }

  if (allMatched.length === 0) {
    return {
      attempts: 0, totalQuestions: files.reduce((s, f) => s + (f.questions?.length || 0), 0),
      totalCorrect: 0, totalWrong: 0, totalSkipped: 0,
      avgPercentage: 0, bestPercentage: 0, worstPercentage: 0, avgAccuracy: 0,
      totalTime: 0, latestDate: 0, oldestDate: 0, scores: [], matchedResults: [],
    };
  }

  const totalCorrect = allMatched.reduce((s, r) => s + r.correct, 0);
  const totalWrong = allMatched.reduce((s, r) => s + r.wrong, 0);
  const totalSkipped = allMatched.reduce((s, r) => s + r.skipped, 0);
  const totalTime = allMatched.reduce((s, r) => s + r.timeTaken, 0);
  const scores = allMatched.map(r => r.percentage);
  const avgPercentage = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const answeredTotal = totalCorrect + totalWrong;
  const avgAccuracy = answeredTotal > 0 ? Math.round((totalCorrect / answeredTotal) * 100) : 0;

  return {
    attempts: allMatched.length,
    totalQuestions: allMatched.reduce((s, r) => s + r.totalQuestions, 0),
    totalCorrect, totalWrong, totalSkipped,
    avgPercentage,
    bestPercentage: Math.max(...scores),
    worstPercentage: Math.min(...scores),
    avgAccuracy,
    totalTime,
    latestDate: Math.max(...allMatched.map(r => r.timestamp)),
    oldestDate: Math.min(...allMatched.map(r => r.timestamp)),
    scores: allMatched.sort((a, b) => a.timestamp - b.timestamp).map(r => r.percentage),
    matchedResults: allMatched,
  };
}

function pctColor(p: number) { return p >= 80 ? 'text-emerald-400' : p >= 60 ? 'text-amber-400' : 'text-red-400'; }
function pctBg(p: number) { return p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500'; }
function pctBgLight(p: number) { return p >= 80 ? 'bg-emerald-500/15 border-emerald-500/30' : p >= 60 ? 'bg-amber-500/15 border-amber-500/30' : 'bg-red-500/15 border-red-500/30'; }

/* ─── Compact Inline Stats (List View) ──────────────────────────────── */
export function InlineFolderStats({ node, history }: { node: FileNode; history: QuizResult[] }) {
  const perf = useMemo(() => computeFolderPerformance(node, history), [node, history]);

  if (perf.attempts === 0) {
    const allFiles = getAllFiles(node);
    const fileCount = allFiles.length;
    const qCount = allFiles.reduce((s, f) => s + (f.questions?.length || 0), 0);
    if (fileCount === 0) return null;
    return (
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-[9px] text-foreground/25 font-medium">{fileCount} quiz{fileCount !== 1 ? 'zes' : ''} · {qCount} Qs · No attempts yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-1">
      {/* Avg Score Badge */}
      <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-md border ${pctBgLight(perf.avgPercentage)} ${pctColor(perf.avgPercentage)}`}>
        {perf.avgPercentage}%
      </span>
      {/* Mini bar */}
      <div className="flex h-1 w-12 rounded-full overflow-hidden bg-muted/40 flex-shrink-0">
        <div className={`h-full rounded-full ${pctBg(perf.avgPercentage)}`} style={{ width: `${perf.avgPercentage}%` }} />
      </div>
      {/* CWS */}
      <span className="text-[8px] font-bold text-emerald-400">✓{perf.totalCorrect}</span>
      <span className="text-[8px] font-bold text-red-400">✗{perf.totalWrong}</span>
      <span className="text-[8px] font-bold text-amber-400">⏭{perf.totalSkipped}</span>
      <span className="text-[8px] text-foreground/20">· {perf.attempts}x</span>
    </div>
  );
}

/* ─── Grid Card Stats (Grid View) ──────────────────────────────────── */
export function GridFolderStats({ node, history }: { node: FileNode; history: QuizResult[] }) {
  const perf = useMemo(() => computeFolderPerformance(node, history), [node, history]);

  if (perf.attempts === 0) return null;

  return (
    <div className="mt-2 space-y-1">
      {/* Score + bar */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-black ${pctColor(perf.avgPercentage)}`}>{perf.avgPercentage}%</span>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted/30">
          <div className={`h-full rounded-full transition-all ${pctBg(perf.avgPercentage)}`} style={{ width: `${perf.avgPercentage}%` }} />
        </div>
      </div>
      {/* CWS row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <span className="text-[7px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded">✓{perf.totalCorrect}</span>
          <span className="text-[7px] font-bold text-red-400 bg-red-500/10 px-1 py-0.5 rounded">✗{perf.totalWrong}</span>
          <span className="text-[7px] font-bold text-amber-400 bg-amber-500/10 px-1 py-0.5 rounded">⏭{perf.totalSkipped}</span>
        </div>
        <span className="text-[7px] text-foreground/25 font-bold">{perf.attempts} attempt{perf.attempts !== 1 ? 's' : ''}</span>
      </div>
      {/* Mini sparkline */}
      {perf.scores.length > 1 && (
        <MiniSparkline scores={perf.scores} />
      )}
    </div>
  );
}

/* ─── Mini Sparkline ────────────────────────────────────────────────── */
function MiniSparkline({ scores }: { scores: number[] }) {
  const max = 100;
  const h = 16;
  const w = 80;
  const step = w / Math.max(scores.length - 1, 1);
  const points = scores.map((s, i) => `${i * step},${h - (s / max) * h}`).join(' ');

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-4" preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5"
        className={pctColor(scores[scores.length - 1])} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Full Stats Panel (current folder header) ──────────────────────── */
export default function FolderStatsPanel({ node, history }: { node: FileNode; history: QuizResult[] }) {
  const perf = useMemo(() => computeFolderPerformance(node, history), [node, history]);
  const files = useMemo(() => getAllFiles(node), [node]);
  const fileCount = files.length;
  const totalUniqueQuestions = useMemo(() => files.reduce((s, f) => s + (f.questions?.length || resolveLinkedResults(f, history)[0]?.totalQuestions || 0), 0), [files, history]);
  const folderCount = (node.children || []).filter(c => c.type === 'folder').length;

  if (perf.attempts === 0 && fileCount === 0) return null;

  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-3 space-y-3.5 shadow-lg shadow-black/5 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/3 pointer-events-none" />
      {/* Key metrics */}
      <div className="relative z-10 grid grid-cols-5 gap-1.5">
        <MetricBox label="Avg Score" value={perf.attempts > 0 ? `${perf.avgPercentage}%` : '—'} color={perf.attempts > 0 ? pctColor(perf.avgPercentage) : 'text-foreground/30'} />
        <MetricBox label="Accuracy" value={perf.attempts > 0 ? `${perf.avgAccuracy}%` : '—'} color={perf.attempts > 0 ? pctColor(perf.avgAccuracy) : 'text-foreground/30'} />
        <MetricBox label="Attempts" value={String(perf.attempts)} color="text-primary" />
        <MetricBox label="Quizzes" value={String(fileCount)} color="text-foreground/60" />
        <MetricBox label="Questions" value={String(totalUniqueQuestions)} color="text-foreground/60" />
      </div>

      {perf.attempts > 0 && (
        <>
          {/* Score progress bar */}
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-black text-foreground/35 uppercase tracking-widest">Overall Performance</span>
              <span className={`text-base font-black ${pctColor(perf.avgPercentage)}`}>{perf.avgPercentage}%</span>
            </div>
            <div className="h-3 rounded-full overflow-hidden bg-muted/30">
              <div className={`h-full rounded-full transition-all duration-500 ${pctBg(perf.avgPercentage)}`} style={{ width: `${perf.avgPercentage}%` }} />
            </div>
          </div>

          {/* Correct / Wrong / Skipped */}
          <div className="relative z-10 grid grid-cols-3 gap-2">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-3 py-3 text-center">
              <p className="text-xl font-black text-emerald-400 leading-tight">{perf.totalCorrect}</p>
              <p className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-wide">Correct</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-3 py-3 text-center">
              <p className="text-xl font-black text-red-400 leading-tight">{perf.totalWrong}</p>
              <p className="text-[9px] font-bold text-red-400/60 uppercase tracking-wide">Wrong</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-3 py-3 text-center">
              <p className="text-xl font-black text-amber-400 leading-tight">{perf.totalSkipped}</p>
              <p className="text-[9px] font-bold text-amber-400/60 uppercase tracking-wide">Skipped</p>
            </div>
          </div>

          {/* Best / Worst / Time */}
          <div className="relative z-10 flex items-center gap-3 flex-wrap">
            <InfoPill label="Best" value={`${perf.bestPercentage}%`} color={pctColor(perf.bestPercentage)} />
            <InfoPill label="Worst" value={`${perf.worstPercentage}%`} color={pctColor(perf.worstPercentage)} />
            <InfoPill label="Total Time" value={formatTime(perf.totalTime)} color="text-foreground/60" />
            {folderCount > 0 && <InfoPill label="Subfolders" value={String(folderCount)} color="text-foreground/40" />}
          </div>

          {/* Trend sparkline */}
          {perf.scores.length > 1 && (
            <div className="relative z-10">
              <p className="text-[10px] font-black text-foreground/35 uppercase tracking-widest mb-1.5">Score Trend</p>
              <div className="bg-foreground/[0.03] border border-border/50 rounded-2xl p-3">
                <svg viewBox="0 0 200 40" className="w-full h-12" preserveAspectRatio="none">
                  {/* Grid lines */}
                  <line x1="0" y1="10" x2="200" y2="10" stroke="currentColor" strokeWidth="0.3" className="text-foreground/10" />
                  <line x1="0" y1="20" x2="200" y2="20" stroke="currentColor" strokeWidth="0.3" className="text-foreground/10" />
                  <line x1="0" y1="30" x2="200" y2="30" stroke="currentColor" strokeWidth="0.3" className="text-foreground/10" />
                  {/* Area fill */}
                  <polygon
                    points={`0,40 ${perf.scores.map((s, i) => `${(i / Math.max(perf.scores.length - 1, 1)) * 200},${40 - (s / 100) * 40}`).join(' ')} 200,40`}
                    className={pctColor(perf.avgPercentage)}
                    fill="currentColor" opacity="0.08"
                  />
                  {/* Line */}
                  <polyline
                    points={perf.scores.map((s, i) => `${(i / Math.max(perf.scores.length - 1, 1)) * 200},${40 - (s / 100) * 40}`).join(' ')}
                    fill="none" stroke="currentColor" strokeWidth="2"
                    className={pctColor(perf.avgPercentage)}
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                  {/* Dots */}
                  {perf.scores.map((s, i) => (
                    <circle key={i}
                      cx={(i / Math.max(perf.scores.length - 1, 1)) * 200}
                      cy={40 - (s / 100) * 40}
                      r="2.5" fill="currentColor"
                      className={pctColor(s)}
                    />
                  ))}
                </svg>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[8px] text-foreground/20">{perf.scores.length} attempts</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] text-foreground/25">First: {perf.scores[0]}%</span>
                    <span className="text-foreground/10">→</span>
                    <span className={`text-[8px] font-bold ${pctColor(perf.scores[perf.scores.length - 1])}`}>Latest: {perf.scores[perf.scores.length - 1]}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {perf.attempts === 0 && fileCount > 0 && (
        <div className="relative z-10 text-center py-2">
          <p className="text-xs text-foreground/30">{fileCount} quiz{fileCount !== 1 ? 'zes' : ''} · {totalUniqueQuestions} Qs · No attempts matched yet</p>
        </div>
      )}
    </div>
  );
}

function MetricBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-foreground/[0.03] border border-border/50 rounded-2xl px-2 py-3 text-center">
      <p className={`text-xl font-black ${color} leading-tight`}>{value}</p>
      <p className="text-[8px] font-bold text-foreground/30 uppercase tracking-wider mt-1">{label}</p>
    </div>
  );
}

function InfoPill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-foreground/[0.03] border border-border/50 rounded-xl px-3 py-1.5">
      <span className="text-[10px] font-bold text-foreground/35">{label}</span>
      <span className={`text-[11px] font-black ${color}`}>{value}</span>
    </div>
  );
}
