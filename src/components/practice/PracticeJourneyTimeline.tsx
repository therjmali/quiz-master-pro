import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { PracticeJourney } from '../../utils/practiceUtils';
import { formatDateShort } from '../../utils/dateFormat';

interface Props {
  journeys: PracticeJourney[];
  onViewResult: (r: QuizResult) => void;
}

function scoreColor(pct: number) {
  return pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
}
function scoreBg(pct: number) {
  return pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
}
function scoreBorder(pct: number) {
  return pct >= 80 ? 'border-emerald-500/40' : pct >= 60 ? 'border-amber-500/40' : 'border-red-500/40';
}
function scoreRingBg(pct: number) {
  return pct >= 80 ? 'bg-emerald-500/15' : pct >= 60 ? 'bg-amber-500/15' : 'bg-red-500/15';
}

function JourneyCard({ journey, onViewResult }: { journey: PracticeJourney; onViewResult: (r: QuizResult) => void }) {
  const { nodes, improvement } = journey;
  const isPositive = improvement > 0;

  return (
    <div className="bg-card border border-amber-500/10 rounded-2xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{journey.quizTitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {journey.subject && (
              <span className="text-[9px] font-bold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
                {journey.subject}
              </span>
            )}
            <span className="text-[9px] text-foreground/30">{nodes.length} attempts</span>
          </div>
        </div>
        <div className={`flex items-center gap-1 text-[11px] font-black px-2.5 py-1 rounded-lg ${
          isPositive ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
            : improvement < 0 ? 'text-red-400 bg-red-500/10 border border-red-500/20'
            : 'text-foreground/40 bg-foreground/5 border border-border'
        }`}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : improvement < 0 ? <TrendingDown className="w-3 h-3" /> : null}
          {isPositive ? '+' : ''}{improvement}%
        </div>
      </div>

      {/* Timeline Nodes */}
      <div className="flex items-center gap-0 overflow-x-auto no-scrollbar pb-1">
        {nodes.map((node, i) => (
          <div key={node.timestamp} className="flex items-center flex-shrink-0">
            <button
              onClick={() => onViewResult(node.result)}
              className="flex flex-col items-center gap-1.5 group"
            >
              <div className={`w-11 h-11 rounded-full ${scoreRingBg(node.percentage)} border-2 ${scoreBorder(node.percentage)} flex items-center justify-center transition-all group-hover:scale-110 group-active:scale-95`}>
                <span className={`text-[12px] font-black ${scoreColor(node.percentage)}`}>{node.percentage}%</span>
              </div>
              <div className="text-center">
                <span className={`text-[9px] font-bold block leading-tight ${node.type === 'main' ? 'text-primary' : 'text-amber-400'}`}>
                  {node.type === 'main' ? 'Main' : `P${node.attemptNumber}`}
                </span>
                <span className="text-[8px] text-foreground/25 block">{formatDateShort(node.timestamp)}</span>
              </div>
            </button>
            {/* Connector line */}
            {i < nodes.length - 1 && (() => {
              const next = nodes[i + 1];
              const diff = next.percentage - node.percentage;
              return (
                <div className="flex flex-col items-center mx-1.5 flex-shrink-0">
                  <div className={`h-0.5 w-6 rounded-full ${diff > 0 ? 'bg-emerald-500/40' : diff < 0 ? 'bg-red-500/40' : 'bg-foreground/10'}`} />
                  {diff !== 0 && (
                    <span className={`text-[7px] font-bold mt-0.5 ${diff > 0 ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                      {diff > 0 ? '+' : ''}{diff}
                    </span>
                  )}
                </div>
              );
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PracticeJourneyTimeline({ journeys, onViewResult }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? journeys : journeys.slice(0, 3);

  if (journeys.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">Practice Journeys</p>
        <span className="text-[9px] text-foreground/25">{journeys.length} quizzes</span>
      </div>
      <div className="space-y-2">
        {visible.map(j => (
          <JourneyCard key={j.parentId} journey={j} onViewResult={onViewResult} />
        ))}
      </div>
      {journeys.length > 3 && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="w-full flex items-center justify-center gap-1.5 text-[11px] font-bold text-amber-400/70 hover:text-amber-400 py-2 transition-colors"
        >
          {expanded ? <><ChevronUp className="w-3 h-3" /> Show Less</> : <><ChevronDown className="w-3 h-3" /> Show All ({journeys.length})</>}
        </button>
      )}
    </div>
  );
}
