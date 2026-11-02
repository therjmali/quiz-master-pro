import { useState, useCallback, useEffect, useRef } from 'react';
import { Share2, Download, Image, X, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { QuizResult } from '../../types/quiz';
import { formatTime } from '../../utils/scoring';

interface Props {
  result: QuizResult;
  onClose: () => void;
}

/** Draw a rounded rect path on the canvas */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Draw a score arc gauge */
function drawArc(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number, pct: number) {
  const startAngle = Math.PI * 0.75;
  const endAngle = Math.PI * 2.25;
  const sweep = endAngle - startAngle;

  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Fill
  const fillEnd = startAngle + sweep * (pct / 100);
  const grad = ctx.createLinearGradient(cx - radius, cy, cx + radius, cy);
  if (pct >= 70) {
    grad.addColorStop(0, '#34d399');
    grad.addColorStop(1, '#10b981');
  } else if (pct >= 40) {
    grad.addColorStop(0, '#fbbf24');
    grad.addColorStop(1, '#f59e0b');
  } else {
    grad.addColorStop(0, '#f87171');
    grad.addColorStop(1, '#ef4444');
  }
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, fillEnd);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Glow
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, fillEnd);
  ctx.strokeStyle = pct >= 70 ? 'rgba(16,185,129,0.3)' : pct >= 40 ? 'rgba(245,158,11,0.3)' : 'rgba(239,68,68,0.3)';
  ctx.lineWidth = 24;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawStatBox(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  value: string, label: string, color: string
) {
  // Background
  roundRect(ctx, x, y, w, h, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Value
  ctx.fillStyle = color;
  ctx.font = 'bold 28px "DM Sans", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(value, x + w / 2, y + h / 2 - 2);

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.font = '600 10px "DM Sans", "Plus Jakarta Sans", sans-serif';
  ctx.letterSpacing = '0.08em';
  ctx.fillText(label.toUpperCase(), x + w / 2, y + h / 2 + 18);
}

function generateCanvas(result: QuizResult): HTMLCanvasElement {
  const W = 720;
  const H = 920;
  const canvas = document.createElement('canvas');
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);

  // ── Background gradient ──
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#0a0c1a');
  bgGrad.addColorStop(0.5, '#0d1025');
  bgGrad.addColorStop(1, '#0a0c1a');
  ctx.fillStyle = bgGrad;
  roundRect(ctx, 0, 0, W, H, 32);
  ctx.fill();

  // Subtle radial glow
  const radGrad = ctx.createRadialGradient(W / 2, 280, 20, W / 2, 280, 300);
  radGrad.addColorStop(0, 'rgba(240,165,0,0.08)');
  radGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = radGrad;
  ctx.fillRect(0, 0, W, H);

  // Border
  roundRect(ctx, 0, 0, W, H, 32);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Inner border highlight
  roundRect(ctx, 1, 1, W - 2, H - 2, 31);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const { percentage, netScore, maxScore, correct, wrong, skipped, accuracy, timeTaken, totalQuestions } = result;

  // ── Header: App name ──
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(240,165,0,0.7)';
  ctx.font = '800 11px "DM Sans", sans-serif';
  ctx.fillText('QUIZ MASTER PRO', W / 2, 44);

  // Decorative line
  ctx.beginPath();
  ctx.moveTo(W / 2 - 60, 56);
  ctx.lineTo(W / 2 + 60, 56);
  ctx.strokeStyle = 'rgba(240,165,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // ── Quiz Title & Subject ──
  let titleY = 80;
  if (result.quizTitle) {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 18px "DM Sans", "Plus Jakarta Sans", sans-serif';
    const title = result.quizTitle.length > 40 ? result.quizTitle.slice(0, 38) + '…' : result.quizTitle;
    ctx.fillText(title, W / 2, titleY);
    titleY += 28;
  }
  if (result.subject) {
    // Subject badge
    ctx.font = 'bold 12px "DM Sans", sans-serif';
    const sw = ctx.measureText(result.subject).width + 24;
    roundRect(ctx, W / 2 - sw / 2, titleY - 14, sw, 24, 8);
    ctx.fillStyle = 'rgba(240,165,0,0.12)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,165,0,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = 'rgba(240,165,0,0.8)';
    ctx.textAlign = 'center';
    ctx.fillText(result.subject, W / 2, titleY);
    titleY += 32;
  }

  // ── Score Arc ──
  const arcCx = W / 2;
  const arcCy = titleY + 110;
  const arcR = 90;
  drawArc(ctx, arcCx, arcCy, arcR, percentage);

  // Percentage text in center
  ctx.fillStyle = '#fff';
  ctx.font = '900 52px "DM Sans", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${percentage}%`, arcCx, arcCy - 8);

  // Score below percentage
  ctx.font = '600 14px "DM Sans", sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText(`${netScore} / ${maxScore}`, arcCx, arcCy + 28);

  // Emoji
  const emoji = percentage === 100 ? '🌟' : percentage >= 90 ? '🏆' : percentage >= 70 ? '🌟' : percentage >= 50 ? '👍' : '📚';
  ctx.font = '36px serif';
  ctx.fillText(emoji, arcCx, arcCy - 60);

  // Pass/Fail badge
  const isPassed = percentage >= (result.passMark ?? 50);
  const badgeText = isPassed ? '✓ PASSED' : '✗ FAILED';
  const badgeW = 120;
  const badgeY = arcCy + 52;
  roundRect(ctx, arcCx - badgeW / 2, badgeY, badgeW, 30, 15);
  ctx.fillStyle = isPassed ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
  ctx.fill();
  ctx.strokeStyle = isPassed ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = isPassed ? '#4ade80' : '#f87171';
  ctx.font = '800 12px "DM Sans", sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(badgeText, arcCx, badgeY + 20);

  // ── Stats Grid (2×3) ──
  const gridY = badgeY + 56;
  const gap = 12;
  const boxW = (W - 80 - gap * 2) / 3;
  const boxH = 72;
  const gridX = 40;

  const stats = [
    { value: String(totalQuestions), label: 'Total Qs', color: '#60a5fa' },
    { value: String(correct), label: 'Correct ✓', color: '#4ade80' },
    { value: String(wrong), label: 'Wrong ✗', color: '#f87171' },
    { value: String(skipped), label: 'Skipped ⏭', color: '#fbbf24' },
    { value: formatTime(timeTaken), label: 'Time', color: '#c084fc' },
    { value: `${accuracy}%`, label: 'Accuracy', color: '#f0abfc' },
  ];

  stats.forEach((s, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = gridX + col * (boxW + gap);
    const y = gridY + row * (boxH + gap);
    drawStatBox(ctx, x, y, boxW, boxH, s.value, s.label, s.color);
  });

  // ── Score Formula Bar ──
  const formulaY = gridY + boxH * 2 + gap + 24;
  roundRect(ctx, 60, formulaY, W - 120, 60, 16);
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const gain = result.gain ?? correct;
  const penalty = result.penalty ?? 0;
  const fmY = formulaY + 35;
  ctx.font = '800 20px "DM Sans", sans-serif';
  ctx.textAlign = 'center';

  // Gain
  ctx.fillStyle = '#4ade80';
  ctx.fillText(String(gain), W / 2 - 100, fmY);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '600 9px "DM Sans", sans-serif';
  ctx.fillText('GAIN', W / 2 - 100, fmY + 16);

  // Minus
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '700 20px "DM Sans", sans-serif';
  ctx.fillText('−', W / 2 - 40, fmY);

  // Penalty
  ctx.fillStyle = '#f87171';
  ctx.font = '800 20px "DM Sans", sans-serif';
  ctx.fillText(String(penalty), W / 2, fmY);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '600 9px "DM Sans", sans-serif';
  ctx.fillText('PENALTY', W / 2, fmY + 16);

  // Equals
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.font = '700 20px "DM Sans", sans-serif';
  ctx.fillText('=', W / 2 + 50, fmY);

  // Net Score
  ctx.fillStyle = '#60a5fa';
  ctx.font = '900 22px "DM Sans", sans-serif';
  ctx.fillText(String(netScore), W / 2 + 100, fmY);
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '600 9px "DM Sans", sans-serif';
  ctx.fillText('NET', W / 2 + 100, fmY + 16);

  // ── Footer branding ──
  const footY = H - 40;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.font = '600 10px "DM Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Generated by Quiz Master Pro  ·  quizmasterpro.app', W / 2, footY);

  // Decorative top line
  ctx.beginPath();
  ctx.moveTo(W / 2 - 100, footY - 16);
  ctx.lineTo(W / 2 + 100, footY - 16);
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Date
  const dateStr = new Date(result.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.font = '500 10px "DM Sans", sans-serif';
  ctx.fillText(dateStr, W / 2, footY + 16);

  return canvas;
}

export default function ShareResultCard({ result, onClose }: Props) {
  const [generating, setGenerating] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const didAutoGenerate = useRef(false);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      // Small delay for UI feedback
      await new Promise(r => setTimeout(r, 100));
      const canvas = generateCanvas(result);
      const url = canvas.toDataURL('image/png', 1.0);
      setImageUrl(url);
    } catch (e) {
      toast.error('Could not generate image');
    } finally {
      setGenerating(false);
    }
  }, [result]);

  // Auto-generate on mount
  useEffect(() => {
    if (!didAutoGenerate.current) {
      didAutoGenerate.current = true;
      handleGenerate();
    }
  }, [handleGenerate]);

  const handleDownload = useCallback(() => {
    if (!imageUrl) return;
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `quiz-results-${result.percentage}pct-${Date.now()}.png`;
    a.click();
    toast.success('📥 Image downloaded!');
  }, [imageUrl, result.percentage]);

  const handleShare = useCallback(async () => {
    if (!imageUrl) return;
    try {
      const res = await fetch(imageUrl);
      const blob = await res.blob();
      const file = new File([blob], 'quiz-results.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: 'Quiz Master Pro Results',
          text: `I scored ${result.percentage}% on my quiz! 🎯`,
          files: [file],
        });
        toast.success('Shared! 🎉');
      } else {
        // Fallback: download
        handleDownload();
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        handleDownload();
      }
    }
  }, [imageUrl, result.percentage, handleDownload]);

  const handleCopyText = useCallback(async () => {
    const { percentage, netScore, maxScore, correct, wrong, skipped, accuracy, timeTaken } = result;
    const emoji = percentage === 100 ? '🌟' : percentage >= 90 ? '🏆' : percentage >= 70 ? '🌟' : percentage >= 50 ? '👍' : '📚';
    const title = percentage >= 90 ? 'Outstanding!' : percentage >= 70 ? 'Great Job!' : percentage >= 50 ? 'Good Effort!' : 'Keep Practicing!';
    const text = `📊 Quiz Master Pro Results\n${emoji} ${title}\n\nScore: ${netScore}/${maxScore} (${percentage}%)\n✓ Correct: ${correct} | ✗ Wrong: ${wrong} | ⏭ Skipped: ${skipped}\nAccuracy: ${accuracy}% | Time: ${formatTime(timeTaken)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy');
    }
  }, [result]);

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-8 sm:pt-12 p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card rounded-3xl p-5 sm:p-6 max-w-md w-full animate-fade-in max-h-[90vh] overflow-y-auto thin-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground">Share Results</h3>
              <p className="text-[10px] text-foreground/40">Generate a beautiful results card</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-foreground/5 border border-border flex items-center justify-center text-foreground/40 hover:text-foreground/70 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preview or Generate */}
        {!imageUrl ? (
          <div className="flex flex-col items-center gap-4 py-8">
            {/* Skeleton preview while auto-generating */}
            <div className="w-full aspect-[720/920] rounded-2xl bg-foreground/[0.03] border border-border overflow-hidden relative">
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-6 h-6 text-primary/50 animate-spin" />
                <p className="text-xs text-foreground/30 font-bold">Generating share card…</p>
              </div>
              {/* Shimmer overlay */}
              <div className="absolute inset-0 shimmer" />
            </div>
          </div>
        ) : (
          <>
            {/* Image preview */}
            <div className="rounded-2xl overflow-hidden border border-border mb-4 bg-black/30">
              <img src={imageUrl} alt="Quiz results card" className="w-full h-auto" />
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={handleShare}
                className="flex flex-col items-center gap-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/25 rounded-2xl py-3.5 transition-all active:scale-[0.97]"
              >
                <Share2 className="w-5 h-5 text-primary" />
                <span className="text-[10px] font-bold text-primary">Share</span>
              </button>
              <button
                onClick={handleDownload}
                className="flex flex-col items-center gap-1.5 bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/20 rounded-2xl py-3.5 transition-all active:scale-[0.97]"
              >
                <Download className="w-5 h-5 text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-400">Download</span>
              </button>
              <button
                onClick={handleCopyText}
                className="flex flex-col items-center gap-1.5 bg-foreground/5 hover:bg-foreground/10 border border-border rounded-2xl py-3.5 transition-all active:scale-[0.97]"
              >
                {copied ? <Check className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5 text-foreground/50" />}
                <span className="text-[10px] font-bold text-foreground/50">{copied ? 'Copied!' : 'Copy Text'}</span>
              </button>
            </div>

            {/* Regenerate */}
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full mt-3 text-xs text-foreground/30 hover:text-foreground/60 font-bold py-2 transition-colors"
            >
              {generating ? 'Regenerating…' : '↻ Regenerate card'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
