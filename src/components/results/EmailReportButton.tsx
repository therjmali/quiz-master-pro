import { useState } from 'react';
import { Mail, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from 'zitejs/auth';
import { QuizResult } from '../../types/quiz';
import { emailReport, generateReportPdf } from 'zitejs/api';
import { getPreferredEmail } from '../../utils/preferredEmail';

interface Props { result: QuizResult; rationaleCache: Record<string, string>; }

export default function EmailReportButton({ result, rationaleCache }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (!user) return null;

  const handleEmail = async () => {
    setLoading(true);
    try {
      // Generate PDF first
      let pdfUrl: string | undefined;
      try {
        const pdfResult = await generateReportPdf({
          results: [{
            quizTitle: result.quizTitle, subject: result.subject,
            percentage: result.percentage, netScore: result.netScore, maxScore: result.maxScore,
            correct: result.correct, wrong: result.wrong, skipped: result.skipped,
            totalQuestions: result.totalQuestions, accuracy: result.accuracy,
            gain: result.gain, penalty: result.penalty, timeTaken: result.timeTaken,
            timestamp: result.timestamp, passMark: result.passMark ?? 50,
            quizData: result.quizData.map(q => ({
              question: q.question, options: q.options, correctAnswer: q.correctAnswer,
              difficulty: q.difficulty || 'medium', rationale: q.rationale, questionType: q.questionType,
            })),
            userAnswers: result.userAnswers,
          }],
          filter: 'all', reportType: 'full', rationaleCache, includeRationale: true,
        });
        pdfUrl = pdfResult.url;
      } catch { /* Continue without PDF attachment */ }

      const targetEmail = getPreferredEmail(user.email);
      await emailReport({
        email: targetEmail,
        quizTitle: result.quizTitle,
        subject: result.subject,
        percentage: result.percentage,
        correct: result.correct,
        wrong: result.wrong,
        skipped: result.skipped,
        totalQuestions: result.totalQuestions,
        accuracy: result.accuracy,
        timeTaken: result.timeTaken,
        pdfUrl,
      });
      setSent(true);
      toast.success(`📧 Report sent to ${targetEmail}!`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to send email');
    } finally { setLoading(false); }
  };

  return (
    <button onClick={handleEmail} disabled={loading || sent}
      className={`flex items-center gap-2 text-xs font-bold px-4 py-2.5 rounded-xl transition-all active:scale-95 disabled:opacity-50 ${
        sent
          ? 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-400'
          : 'bg-foreground/5 border border-border text-foreground/40 hover:text-foreground/70'
      }`}>
      {loading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…</>
        : sent ? <><Check className="w-3.5 h-3.5" /> Sent!</>
        : <><Mail className="w-3.5 h-3.5" /> Email Report</>}
    </button>
  );
}
