import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Plus, Check, Clock, LayoutGrid, ChevronRight, HelpCircle, BookOpen, Calendar, ArrowRight, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { requestPinWidget, isPinWidgetSupported, WidgetType } from '../../platform/widgetSync';
import type { ExamConfig } from '../../utils/examDates';

export interface SubjectStats {
  id: string;
  name: string;
  shortName: string;
  color?: string;
  solvedQuestions: number;
  totalQuestions: number;
  accuracy: number;
  activeUnitName?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  todayQuestions: number;
  targetQuestions: number;
  streakDays: number;
  masteryPercent: number;
  subjects?: SubjectStats[];
  exams?: ExamConfig[];
  onStartSubjectQuiz?: (subjectName: string) => void;
  onStartQuickPractice?: () => void;
}

const DEFAULT_NURSING_SUBJECT_STATS: SubjectStats[] = [
  {
    id: 'msn',
    name: 'Medical-Surgical Nursing',
    shortName: 'MSN',
    color: '#38BDF8',
    solvedQuestions: 145,
    totalQuestions: 200,
    accuracy: 82,
    activeUnitName: 'Cardiovascular & Respiratory Disorders',
  },
  {
    id: 'chn',
    name: 'Community Health Nursing',
    shortName: 'CHN',
    color: '#34D399',
    solvedQuestions: 98,
    totalQuestions: 150,
    accuracy: 78,
    activeUnitName: 'Epidemiology & National Health Programs',
  },
  {
    id: 'obg',
    name: 'Obstetrics & Gynaecological Nursing',
    shortName: 'OBG',
    color: '#FB7185',
    solvedQuestions: 112,
    totalQuestions: 160,
    accuracy: 85,
    activeUnitName: 'Antenatal Assessment & High-Risk Pregnancy',
  },
  {
    id: 'chn-child',
    name: 'Child Health Nursing (Pediatrics)',
    shortName: 'CHN-P',
    color: '#FBBF24',
    solvedQuestions: 84,
    totalQuestions: 120,
    accuracy: 80,
    activeUnitName: 'Growth, Development & Pediatric Emergencies',
  },
];

export default function WidgetManagerModal({
  open,
  onClose,
  todayQuestions,
  targetQuestions = 50,
  streakDays,
  masteryPercent,
  subjects = DEFAULT_NURSING_SUBJECT_STATS,
  exams = [],
  onStartSubjectQuiz,
  onStartQuickPractice,
}: Props) {
  const [activeTab, setActiveTab] = useState<WidgetType>('study');
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [pinnedWidgets, setPinnedWidgets] = useState<Record<string, boolean>>({});
  
  const displaySubjects = subjects.length > 0 ? subjects : DEFAULT_NURSING_SUBJECT_STATS;
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>(displaySubjects[0]?.id || 'msn');

  if (!open) return null;

  const currentSubject = displaySubjects.find(s => s.id === selectedSubjectId) || displaySubjects[0];

  // Calculate upcoming exam
  const today = new Date().toISOString().split('T')[0];
  const now = new Date(today).getTime();
  const upcomingExam = exams
    .map(x => ({ ...x, time: new Date(x.date).getTime() }))
    .filter(x => !isNaN(x.time) && x.time >= now)
    .sort((a, b) => a.time - b.time)[0] || exams[0] || {
      id: 'norcet-2026',
      title: 'NORCET Nursing Officer Exam',
      date: '2026-09-15',
      time: '09:00',
      label: 'NORCET 2026 AIIMS',
      subject: 'Nursing Officer Recruitment',
      color: 'from-amber-500 to-rose-600',
    };

  const examDaysLeft = upcomingExam ? Math.max(0, Math.ceil((new Date(upcomingExam.date).getTime() - now) / (1000 * 60 * 60 * 24))) : 0;
  const examTargetPace = examDaysLeft > 0 ? Math.max(20, Math.round(1500 / examDaysLeft)) : 50;

  const handleAddWidget = (type: WidgetType) => {
    const supported = isPinWidgetSupported();
    if (supported) {
      const ok = requestPinWidget(type);
      if (ok) {
        setPinnedWidgets(prev => ({ ...prev, [type]: true }));
        const names: Record<WidgetType, string> = {
          study: 'Daily Practice & Streak',
          subject: 'Subject Mastery & Quiz',
          exam: 'Exam Countdown & Pace',
          focus: 'Quick Quiz Launcher',
        };
        toast.success(`📌 ${names[type]} widget request sent to your home screen!`);
        return;
      }
    }

    // Fallback: prompt manual launcher add
    setShowManualGuide(true);
    toast.info('To add widget: Long-press home screen → Widgets → R.J QUIZ PRO');
  };

  const progressPct = Math.min(100, Math.round((todayQuestions / (targetQuestions || 50)) * 100));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        className="w-full sm:max-w-xl max-h-[92vh] overflow-y-auto rounded-t-[28px] sm:rounded-3xl border border-white/15 bg-card/95 backdrop-blur-2xl shadow-2xl p-5 sm:p-6 space-y-4"
        style={{
          background: 'radial-gradient(120% 120% at 50% 0%, hsl(var(--card) / 0.98), hsl(var(--card) / 0.92))',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.08)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-border/15">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary shadow-sm">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-foreground tracking-tight flex items-center gap-1.5">
                Android Home Screen Widgets
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-primary uppercase">v2.2</span>
              </h2>
              <p className="text-xs text-muted-foreground font-medium">Glanceable quiz stats, subject mastery &amp; instant exam practice</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted/30 hover:bg-muted/50 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 4 Widget Category Selector Tabs */}
        <div className="grid grid-cols-4 gap-1.5 p-1 rounded-2xl bg-muted/25 border border-border/15 text-[11px] font-bold">
          <button
            onClick={() => setActiveTab('study')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center gap-1 ${
              activeTab === 'study' ? 'bg-primary text-primary-foreground shadow-md font-black' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span className="truncate">Progress</span>
          </button>
          <button
            onClick={() => setActiveTab('subject')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center gap-1 ${
              activeTab === 'subject' ? 'bg-primary text-primary-foreground shadow-md font-black' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="truncate">Subject</span>
          </button>
          <button
            onClick={() => setActiveTab('exam')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center gap-1 ${
              activeTab === 'exam' ? 'bg-primary text-primary-foreground shadow-md font-black' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span className="truncate">Exams</span>
          </button>
          <button
            onClick={() => setActiveTab('focus')}
            className={`py-2 px-1 rounded-xl transition-all flex flex-col items-center gap-1 ${
              activeTab === 'focus' ? 'bg-primary text-primary-foreground shadow-md font-black' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="truncate">Quick Quiz</span>
          </button>
        </div>

        {/* Widget 1: Daily Quiz Progress & Goals (4x2) */}
        {activeTab === 'study' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5 text-primary" /> Daily Practice &amp; Goals (4×2)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">Standard</span>
            </div>

            {/* Realistic Widget Render */}
            <div
              className="rounded-3xl p-4 border border-white/15 shadow-xl relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #1A1F26 0%, #151920 100%)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-primary/30 flex items-center justify-center text-[10px]">⚡</div>
                  <span className="text-[11px] font-black text-white uppercase tracking-wider">R.J QUIZ PRO</span>
                </div>
                <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#242B35] border border-[#3B4654] text-[#FB923C]">
                  🔥 {streakDays}d
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 pt-1">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">QUESTIONS TODAY</p>
                  <p className="text-xl font-black font-mono text-[#38BDF8] mt-0.5">{todayQuestions} Qs</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">DAILY TARGET</p>
                  <p className="text-sm font-black font-mono text-[#34D399] mt-0.5">{todayQuestions} / {targetQuestions || 50} Qs</p>
                </div>
              </div>

              <div className="mt-3">
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#E0764F] to-[#B4452B]" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1 font-semibold">
                  <span>{masteryPercent}% Overall Mastery</span>
                  <span className="text-[#E0764F] font-bold">Tap to practice ⚡</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => handleAddWidget('study')}
              className="w-full h-10 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
            >
              {pinnedWidgets['study'] ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {pinnedWidgets['study'] ? 'Widget Requested — Tap to Request Again' : 'Pin Daily Practice Widget to Home Screen'}
            </button>
          </motion.div>
        )}

        {/* Widget 2: Subject Mastery & Quiz (4x2) */}
        {activeTab === 'subject' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-primary" /> Subject Mastery &amp; Quiz (4×2)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">Subject-Specific</span>
            </div>

            {/* Subject Selector for preview */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {displaySubjects.map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedSubjectId(s.id)}
                  className={`px-2.5 py-1 rounded-xl text-[10px] font-bold shrink-0 transition-all ${
                    s.id === currentSubject.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {s.shortName}
                </button>
              ))}
            </div>

            {/* Realistic Subject Widget Render */}
            <div
              className="rounded-3xl p-4 border border-white/15 shadow-xl relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #1A1F26 0%, #151920 100%)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-lg border backdrop-blur-md shrink-0"
                    style={{
                      backgroundColor: (currentSubject.color || '#38BDF8') + '30',
                      color: '#fff',
                      borderColor: (currentSubject.color || '#38BDF8') + '50',
                    }}
                  >
                    {currentSubject.shortName}
                  </span>
                  <span className="text-xs font-bold text-white truncate drop-shadow-sm">
                    {currentSubject.name}
                  </span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#242B35] border border-[#3B4654] text-[#34D399] shrink-0">
                  {currentSubject.accuracy}% Acc
                </span>
              </div>

              <div className="mt-2.5 pt-1 border-t border-white/5">
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">ACTIVE UNIT &amp; TOPIC</p>
                <p className="text-xs font-black text-white truncate mt-0.5">{currentSubject.activeUnitName || 'High-Yield MCQ Pool'}</p>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {currentSubject.solvedQuestions} / {currentSubject.totalQuestions} Questions Solved
                </p>
              </div>

              <div className="mt-2.5">
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#E0764F] to-[#B4452B]"
                    style={{ width: `${Math.min(100, Math.round((currentSubject.solvedQuestions / Math.max(1, currentSubject.totalQuestions)) * 100))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] text-slate-500 mt-1 font-semibold">
                  <span>Tap to jump into quiz</span>
                  <span className="text-[#E0764F] font-bold">⚡ Start Quiz ›</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAddWidget('subject')}
                className="flex-1 h-10 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
              >
                {pinnedWidgets['subject'] ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                {pinnedWidgets['subject'] ? 'Widget Requested — Tap to Request Again' : `Pin ${currentSubject.shortName} Widget`}
              </button>
              {onStartSubjectQuiz && (
                <button
                  onClick={() => {
                    onClose();
                    onStartSubjectQuiz(currentSubject.name);
                  }}
                  className="h-10 px-3.5 rounded-2xl bg-muted/40 hover:bg-muted/60 text-foreground text-xs font-bold flex items-center gap-1 transition-all"
                  title="Practice this subject right now"
                >
                  <span>Practice</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Widget 3: Exam Countdown & Target Pace (4x1) */}
        {activeTab === 'exam' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-primary" /> Exam Countdown &amp; Pace (4×1)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">Target Tracker</span>
            </div>

            {/* Realistic Exam Widget Render */}
            <div
              className="rounded-3xl p-4 border border-white/15 shadow-xl relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, #1A1F26 0%, #151920 100%)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center text-[9px] font-bold">🎯</div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">EXAM COUNTDOWN</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#242B35] border border-[#3B4654] text-slate-300">
                  {upcomingExam.date}
                </span>
              </div>

              <div className="flex items-center justify-between mt-2 pt-0.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-white truncate">{upcomingExam.title || upcomingExam.label}</p>
                  <p className="text-[10px] font-bold text-[#38BDF8] mt-0.5">
                    {examDaysLeft > 0 ? `⚡ Target: ${examTargetPace} Qs / day` : '⚡ Exam Today!'}
                  </p>
                </div>
                <div className="px-3 py-1.5 rounded-2xl bg-[#241B18] border border-[#E0764F] text-[#FB923C] text-sm font-black shrink-0 ml-2">
                  {examDaysLeft > 0 ? `${examDaysLeft} Days` : 'TODAY!'}
                </div>
              </div>

              <p className="text-[8px] text-slate-500 mt-2 font-medium">Tap to view exam schedule &amp; practice tests 🎯</p>
            </div>

            <button
              onClick={() => handleAddWidget('exam')}
              className="w-full h-10 rounded-2xl bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
            >
              {pinnedWidgets['exam'] ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {pinnedWidgets['exam'] ? 'Widget Requested — Tap to Request Again' : 'Pin Exam Countdown Widget to Home Screen'}
            </button>
          </motion.div>
        )}

        {/* Widget 4: Quick Quiz Launcher (2x2) */}
        {activeTab === 'focus' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-chart-4" /> Quick Quiz Launcher (2×2)
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/40 text-muted-foreground">Compact</span>
            </div>

            {/* Compact Widget Render */}
            <div
              className="max-w-[200px] mx-auto rounded-3xl p-3.5 border border-white/15 shadow-xl text-center space-y-2"
              style={{
                background: 'linear-gradient(135deg, #1A1F26 0%, #151920 100%)',
                boxShadow: '0 12px 30px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)',
              }}
            >
              <div className="flex items-center justify-between text-[10px] font-bold">
                <span className="text-[#E0764F]">⚡ QUICK QUIZ</span>
                <span className="text-[#FB923C]">🔥 {streakDays}d</span>
              </div>
              <div>
                <p className="text-2xl font-black font-mono text-white tracking-tight">⚡ 20 Qs</p>
                <p className="text-[10px] text-slate-400 font-medium">Practice Ready</p>
              </div>
              <div
                onClick={() => {
                  if (onStartQuickPractice) {
                    onClose();
                    onStartQuickPractice();
                  }
                }}
                className="h-7 rounded-xl bg-[#B4452B] hover:bg-[#c54e33] active:scale-95 transition-all cursor-pointer text-white text-[10px] font-bold flex items-center justify-center gap-1 shadow-sm"
              >
                ⏱️ Start Quiz
              </div>
            </div>

            <button
              onClick={() => handleAddWidget('focus')}
              className="w-full h-10 rounded-2xl bg-primary/15 border border-primary/25 text-primary text-xs font-bold flex items-center justify-center gap-2 hover:bg-primary/20 active:scale-[0.98] transition-all"
            >
              {pinnedWidgets['focus'] ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {pinnedWidgets['focus'] ? 'Widget Requested — Tap to Request Again' : 'Pin Quick Quiz Widget to Home Screen'}
            </button>
          </motion.div>
        )}

        {/* Manual launcher guide */}
        <div className="pt-2 border-t border-border/15">
          <button
            onClick={() => setShowManualGuide(!showManualGuide)}
            className="w-full flex items-center justify-between p-3 rounded-2xl bg-muted/20 border border-border/15 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <span className="flex items-center gap-1.5 font-bold">
              <HelpCircle className="w-4 h-4 text-primary" /> How to add widgets manually on Android
            </span>
            <ChevronRight className={`w-4 h-4 transition-transform ${showManualGuide ? 'rotate-90' : ''}`} />
          </button>

          <AnimatePresence>
            {showManualGuide && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden space-y-2 pt-2.5 px-2 text-xs text-muted-foreground font-medium"
              >
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-black flex items-center justify-center shrink-0">1</span>
                  <p>Long-press any empty space on your Android device's home screen.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-black flex items-center justify-center shrink-0">2</span>
                  <p>Tap <strong>Widgets</strong> and find <strong>R.J QUIZ</strong> in the list.</p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-primary/15 text-primary text-[11px] font-black flex items-center justify-center shrink-0">3</span>
                  <p>Select any of the 4 widgets (Daily Practice, Subject Mastery, Exam Countdown, Quick Quiz) and place it on your screen!</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
