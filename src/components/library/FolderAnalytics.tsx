import { useMemo } from 'react';
import { TrendingUp, TrendingDown, Target, Clock, AlertTriangle, CheckCircle2, XCircle, SkipForward } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { FileNode, getAllFiles, countQuestions } from '../../utils/fileTree';

export interface FolderStats {
  totalQuizzes: number;
  totalQuestions: number;
  avgScore: number;
  accuracy: number;
  totalCorrect: number;
  totalWrong: number;
  totalSkipped: number;
  totalTime: number;
  weakTopics: { name: string; score: number }[];
  strongTopics: { name: string; score: number }[];
  trend: number; // positive = improving
}

/** Compute analytics for a set of quizzes matched to a subject */
export function computeAnalyticsFromHistory(
  history: QuizResult[],
  subjectName: string
): FolderStats {
  const quizzes = history.filter(r => r.subject?.toLowerCase() === subjectName.toLowerCase());
  return computeFromQuizzes(quizzes);
}

/** Compute analytics for quizzes matching specific file nodes */
export function computeFromFileNodes(
  history: QuizResult[],
  files: FileNode[]
): FolderStats {
  const fileNames = new Set(files.map(f => f.name.toLowerCase()));
  const quizzes = history.filter(r =>
    fileNames.has(r.quizTitle?.toLowerCase() || '')
  );
  if (quizzes.length === 0) {
    return computeFromFileNodeData(files);
  }
  return computeFromQuizzes(quizzes);
}

function computeFromQuizzes(quizzes: QuizResult[]): FolderStats {
  if (quizzes.length === 0) {
    return {
      totalQuizzes: 0, totalQuestions: 0, avgScore: 0, accuracy: 0,
      totalCorrect: 0, totalWrong: 0, totalSkipped: 0, totalTime: 0,
      weakTopics: [], strongTopics: [], trend: 0,
    };
  }

  const totalCorrect = quizzes.reduce((a, r) => a + r.correct, 0);
  const totalWrong = quizzes.reduce((a, r) => a + r.wrong, 0);
  const totalSkipped = quizzes.reduce((a, r) => a + r.skipped, 0);
  const totalTime = quizzes.reduce((a, r) => a + r.timeTaken, 0);
  const totalQuestions = quizzes.reduce((a, r) => a + r.totalQuestions, 0);
  const avgScore = Math.round(quizzes.reduce((a, r) => a + r.percentage, 0) / quizzes.length);
  const accuracy = (totalCorrect + totalWrong) > 0
    ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0;

  // Trend: compare last 3 vs first 3
  const sorted = [...quizzes].sort((a, b) => a.timestamp - b.timestamp);
  const first3 = sorted.slice(0, Math.min(3, Math.floor(sorted.length / 2)));
  const last3 = sorted.slice(-Math.min(3, Math.ceil(sorted.length / 2)));
  const avgFirst = first3.length > 0 ? first3.reduce((a, r) => a + r.percentage, 0) / first3.length : 0;
  const avgLast = last3.length > 0 ? last3.reduce((a, r) => a + r.percentage, 0) / last3.length : 0;
  const trend = Math.round(avgLast - avgFirst);

  // Group by title for weak/strong
  const byTitle = new Map<string, { total: number; sum: number }>();
  quizzes.forEach(r => {
    const t = r.quizTitle || 'Untitled';
    const existing = byTitle.get(t) || { total: 0, sum: 0 };
    existing.total += 1;
    existing.sum += r.percentage;
    byTitle.set(t, existing);
  });

  const topicScores = Array.from(byTitle.entries())
    .map(([name, { total, sum }]) => ({ name, score: Math.round(sum / total) }))
    .sort((a, b) => a.score - b.score);

  return {
    totalQuizzes: quizzes.length, totalQuestions, avgScore, accuracy,
    totalCorrect, totalWrong, totalSkipped, totalTime,
    weakTopics: topicScores.filter(t => t.score < 60).slice(0, 5),
    strongTopics: topicScores.filter(t => t.score >= 80).slice(0, 5),
    trend,
  };
}

function computeFromFileNodeData(files: FileNode[]): FolderStats {
  const totalQuestions = files.reduce((a, f) => a + (f.questions?.length || 0), 0);
  return {
    totalQuizzes: 0, totalQuestions, avgScore: 0, accuracy: 0,
    totalCorrect: 0, totalWrong: 0, totalSkipped: 0, totalTime: 0,
    weakTopics: [], strongTopics: [], trend: 0,
  };
}

/** Compute folder-level stats by aggregating child file matches */
export function computeFolderNodeStats(
  history: QuizResult[],
  folder: FileNode,
  subjectName?: string
): FolderStats {
  const files = getAllFiles(folder);
  const fileNames = new Set(files.map(f => f.name.toLowerCase()));
  const folderName = folder.name.toLowerCase();
  const subjectLc = subjectName?.toLowerCase() || '';

  const quizzes = history.filter(r => {
    if (fileNames.has(r.quizTitle?.toLowerCase() || '')) return true;
    if (r.subject?.toLowerCase() === folderName) return true;
    if (subjectLc && r.subject?.toLowerCase() === subjectLc && r.quizTitle?.toLowerCase().includes(folderName)) return true;
    return false;
  });

  if (quizzes.length > 0) return computeFromQuizzes(quizzes);
  return computeFromFileNodeData(files);
}

/** Compute stats for a folder tree node — walks children for weak/strong */
export function computeTreeNodeStats(
  history: QuizResult[],
  node: FileNode
): FolderStats {
  const nodeLc = node.name.toLowerCase();
  const allFiles = getAllFiles(node);
  const allFileNames = new Set(allFiles.map(f => f.name.toLowerCase()));

  const quizzes = history.filter(r => {
    if (r.subject?.toLowerCase() === nodeLc) return true;
    if (allFileNames.has(r.quizTitle?.toLowerCase() || '')) return true;
    return false;
  });

  if (quizzes.length === 0) {
    return computeFromFileNodeData(allFiles);
  }

  const stats = computeFromQuizzes(quizzes);

  // Compute per-child folder weak analysis
  const childFolders = (node.children || []).filter(c => c.type === 'folder');
  if (childFolders.length > 1) {
    const childScores = childFolders.map(c => {
      const childStats = computeFolderNodeStats(history, c, node.name);
      return { name: c.name, score: childStats.avgScore, quizCount: childStats.totalQuizzes };
    }).filter(c => c.quizCount > 0);

    if (childScores.length > 1) {
      stats.weakTopics = childScores
        .filter(c => c.score < 60)
        .sort((a, b) => a.score - b.score)
        .slice(0, 5)
        .map(c => ({ name: c.name, score: c.score }));
      stats.strongTopics = childScores
        .filter(c => c.score >= 80)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
        .map(c => ({ name: c.name, score: c.score }));
    }
  }

  return stats;
}

function formatTime(secs: number): string {
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  return `${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m`;
}

function scoreColor(p: number) {
  if (p >= 80) return 'text-emerald-400';
  if (p >= 60) return 'text-amber-400';
  return 'text-red-400';
}
function scoreBg(p: number) {
  if (p >= 80) return 'bg-emerald-500';
  if (p >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Compact analytics bar shown inline in folder headers */
export function InlineAnalytics({ stats }: { stats: FolderStats }) {
  if (stats.totalQuizzes === 0) {
    return (
      <div className="flex items-center gap-2 text-[9px] text-foreground/25 font-bold">
        <span>{stats.totalQuestions} Qs</span>
        <span className="text-foreground/10">·</span>
        <span>No attempts yet</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className={`text-[10px] font-black ${scoreColor(stats.avgScore)}`}>
        {stats.avgScore}%
      </span>
      <div className="w-16 h-1.5 bg-foreground/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${scoreBg(stats.avgScore)}`}
          style={{ width: `${Math.min(100, stats.avgScore)}%` }} />
      </div>
      <span className="text-[9px] text-foreground/30 font-bold">{stats.totalQuizzes} quiz{stats.totalQuizzes !== 1 ? 'zes' : ''}</span>
      {stats.trend !== 0 && (
        <span className={`text-[9px] font-bold flex items-center gap-0.5 ${stats.trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {stats.trend > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {stats.trend > 0 ? '+' : ''}{stats.trend}%
        </span>
      )}
    </div>
  );
}

/** Expanded analytics dashboard for a folder */
export function AnalyticsDashboard({ stats, title, showWeakTopics = true }: {
  stats: FolderStats; title: string; showWeakTopics?: boolean;
}) {
  if (stats.totalQuizzes === 0) {
    return (
      <div className="px-4 py-3 bg-foreground/[0.02] border-t border-border/30">
        <p className="text-[10px] text-foreground/30 text-center">No quiz attempts yet — practice to see analytics</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 bg-foreground/[0.02] border-t border-border/30 space-y-3 animate-fade-in">
      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2">
        <StatMini icon={<Target className="w-3 h-3" />} label="Avg Score" value={`${stats.avgScore}%`} color={scoreColor(stats.avgScore)} />
        <StatMini icon={<CheckCircle2 className="w-3 h-3" />} label="Correct" value={String(stats.totalCorrect)} color="text-emerald-400" />
        <StatMini icon={<XCircle className="w-3 h-3" />} label="Wrong" value={String(stats.totalWrong)} color="text-red-400" />
        <StatMini icon={<Clock className="w-3 h-3" />} label="Time" value={formatTime(stats.totalTime)} color="text-foreground/50" />
      </div>

      {/* Accuracy bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-bold text-foreground/40 uppercase tracking-wider">Accuracy</span>
          <span className={`text-[10px] font-black ${scoreColor(stats.accuracy)}`}>{stats.accuracy}%</span>
        </div>
        <div className="h-1.5 bg-foreground/10 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${scoreBg(stats.accuracy)}`}
            style={{ width: `${stats.accuracy}%` }} />
        </div>
      </div>

      {/* Weak Topics */}
      {showWeakTopics && stats.weakTopics.length > 0 && (
        <div>
          <p className="text-[9px] font-black text-red-400/70 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Weak Areas — Need More Practice
          </p>
          <div className="space-y-1">
            {stats.weakTopics.map(t => (
              <div key={t.name} className="flex items-center gap-2">
                <span className="text-[10px] text-foreground/60 flex-1 truncate">{t.name}</span>
                <div className="w-20 h-1 bg-foreground/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${scoreBg(t.score)}`} style={{ width: `${t.score}%` }} />
                </div>
                <span className={`text-[10px] font-black w-8 text-right ${scoreColor(t.score)}`}>{t.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strong Topics */}
      {showWeakTopics && stats.strongTopics.length > 0 && (
        <div>
          <p className="text-[9px] font-black text-emerald-400/70 uppercase tracking-wider mb-1.5 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Strong Areas
          </p>
          <div className="space-y-1">
            {stats.strongTopics.map(t => (
              <div key={t.name} className="flex items-center gap-2">
                <span className="text-[10px] text-foreground/60 flex-1 truncate">{t.name}</span>
                <div className="w-20 h-1 bg-foreground/10 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${scoreBg(t.score)}`} style={{ width: `${t.score}%` }} />
                </div>
                <span className={`text-[10px] font-black w-8 text-right ${scoreColor(t.score)}`}>{t.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trend */}
      {stats.trend !== 0 && (
        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] font-bold ${
          stats.trend > 0 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15' : 'bg-red-500/10 text-red-400 border border-red-500/15'
        }`}>
          {stats.trend > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
          {stats.trend > 0
            ? `Improving! +${stats.trend}% from first to recent quizzes`
            : `Declining ${stats.trend}% — consider reviewing weak areas`}
        </div>
      )}
    </div>
  );
}

function StatMini({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-foreground/[0.03] border border-border/40 rounded-xl p-2 text-center">
      <div className={`flex justify-center mb-0.5 ${color}`}>{icon}</div>
      <p className={`text-xs font-black ${color}`}>{value}</p>
      <p className="text-[8px] text-foreground/30 font-bold uppercase">{label}</p>
    </div>
  );
}
