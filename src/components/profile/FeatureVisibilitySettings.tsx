import { useState } from 'react';
import { ChevronDown, ChevronUp, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { FeatureVisibility, DEFAULT_VISIBILITY } from '../../hooks/useProfileStore';

interface Props {
  visibility: FeatureVisibility;
  onUpdate: (updates: Partial<FeatureVisibility>) => void;
}

interface FeatureItem {
  key: keyof FeatureVisibility;
  label: string;
  desc: string;
}

interface Category {
  masterKey: keyof FeatureVisibility;
  icon: string;
  label: string;
  desc: string;
  items: FeatureItem[];
}

const CATEGORIES: Category[] = [
  {
    masterKey: 'quizSetup',
    icon: '🛠️',
    label: 'Quiz Setup',
    desc: 'Creation screen features and shortcuts',
    items: [
      { key: 'templates', label: 'Quick Templates', desc: 'Pre-built quiz setting templates' },
      { key: 'folderSelector', label: 'Folder Selector', desc: 'Choose folder to save quiz into' },
      { key: 'photoQuiz', label: 'Photo Quiz (OCR)', desc: 'Create quiz from camera photo' },
      { key: 'highlighter', label: 'Text Highlighter', desc: 'Highlight text for targeted quiz' },
      { key: 'csvImport', label: 'CSV Import', desc: 'Bulk import from spreadsheet' },
    ],
  },
  {
    masterKey: 'dashboardWidgets',
    icon: '🏠',
    label: 'Dashboard Widgets',
    desc: 'Cards and sections on your home screen',
    items: [
      { key: 'dailyChallenge', label: 'Daily Challenge', desc: 'Daily practice challenge card' },
      { key: 'examCountdown', label: 'Exam Countdown', desc: 'Countdown to your exam dates' },
      { key: 'spacedRepetition', label: 'Spaced Repetition', desc: 'Review reminders for weak areas' },
      { key: 'weakTopics', label: 'Weak Topics', desc: 'Topics needing more practice' },
      { key: 'mistakePatterns', label: 'Mistake Patterns', desc: 'Common error analysis' },
      { key: 'prediction', label: 'Score Prediction', desc: 'Predicted score based on trends' },
      { key: 'studyPlan', label: 'Study Plan', desc: 'AI-generated study recommendations' },
      { key: 'smartNudge', label: 'Smart Nudge', desc: 'Contextual study suggestions' },
      { key: 'examReadiness', label: 'Exam Readiness', desc: 'Readiness assessment card' },
      { key: 'performanceRating', label: 'Performance Rating', desc: 'Rate your last quiz difficulty' },
    ],
  },
  {
    masterKey: 'quizBehavior',
    icon: '📝',
    label: 'Quiz Behavior',
    desc: 'In-quiz features and options',
    items: [
      { key: 'shuffleQuestions', label: 'Shuffle Questions', desc: 'Allow question shuffling toggle' },
      { key: 'shuffleOptions', label: 'Shuffle Options', desc: 'Allow option shuffling toggle' },
      { key: 'confidenceTracking', label: 'Confidence Tracking', desc: 'Sure/guessing markers per question' },
      { key: 'adaptiveMode', label: 'Adaptive Mode', desc: 'Dynamic difficulty adjustment' },
      { key: 'flagging', label: 'Question Flagging', desc: 'Flag questions for review' },
    ],
  },
  {
    masterKey: 'aiFeatures',
    icon: '🤖',
    label: 'AI Features',
    desc: 'AI-powered explanations and insights',
    items: [
      { key: 'aiRationale', label: 'AI Rationale', desc: 'AI explanations per question' },
      { key: 'aiStudyStrategy', label: 'AI Study Strategy', desc: 'Personalized study advice' },
      { key: 'aiExplainAll', label: 'AI Explain All', desc: 'Batch explain all questions' },
      { key: 'bgRationale', label: 'Background Rationale', desc: 'Pre-fetch explanations silently' },
    ],
  },
  {
    masterKey: 'reports',
    icon: '📊',
    label: 'Reports & Downloads',
    desc: 'Export and reporting features',
    items: [
      { key: 'pdfReports', label: 'PDF Reports', desc: 'Download PDF reports' },
      { key: 'emailReports', label: 'Email Reports', desc: 'Send reports via email' },
      { key: 'revisionSheets', label: 'Revision Sheets', desc: 'Generate revision summaries' },
      { key: 'reportPreview', label: 'Report Preview', desc: 'In-app report preview' },
    ],
  },
  {
    masterKey: 'notifications',
    icon: '🔔',
    label: 'Notifications',
    desc: 'Reminders and email alerts',
    items: [
      { key: 'studyReminders', label: 'Study Reminders', desc: 'Daily push notifications' },
      { key: 'weeklyEmail', label: 'Weekly Email', desc: 'Weekly progress report email' },
    ],
  },
];

const Toggle = ({ value, onToggle, size = 'sm' }: { value: boolean; onToggle: () => void; size?: 'sm' | 'md' }) => (
  <button onClick={onToggle} className={`rounded-full transition-colors flex-shrink-0 ${value ? 'bg-primary' : 'bg-foreground/15'} ${size === 'md' ? 'w-12 h-6' : 'w-10 h-5'}`}>
    <div className={`bg-white rounded-full shadow transition-transform ${size === 'md' ? 'w-5 h-5 m-0.5' : 'w-4 h-4 m-0.5'} ${value ? (size === 'md' ? 'translate-x-6' : 'translate-x-5') : 'translate-x-0'}`} />
  </button>
);

function CategorySection({ category, visibility, onUpdate }: { category: Category; visibility: FeatureVisibility; onUpdate: (u: Partial<FeatureVisibility>) => void }) {
  const [expanded, setExpanded] = useState(false);
  const masterOn = visibility[category.masterKey];
  const activeCount = category.items.filter(it => visibility[it.key]).length;

  const handleMasterToggle = () => {
    const newVal = !masterOn;
    const updates: Partial<FeatureVisibility> = { [category.masterKey]: newVal };
    // When turning off master, also turn off all children. When turning on, turn on all.
    category.items.forEach(it => { updates[it.key] = newVal; });
    onUpdate(updates);
    toast.success(`${category.icon} ${category.label}: ${newVal ? 'Enabled' : 'Disabled'}`);
  };

  return (
    <div className={`border rounded-2xl transition-all ${masterOn ? 'border-border bg-card/50' : 'border-border/50 bg-foreground/[0.02] opacity-70'}`}>
      {/* Category header */}
      <div className="flex items-center gap-3 p-3.5">
        <span className="text-lg flex-shrink-0">{category.icon}</span>
        <button onClick={() => setExpanded(p => !p)} className="flex-1 text-left min-w-0">
          <p className="text-sm font-bold text-foreground leading-tight">{category.label}</p>
          <p className="text-[10px] text-foreground/35 mt-0.5 leading-tight">
            {masterOn ? `${activeCount}/${category.items.length} features active` : 'All disabled'}
          </p>
        </button>
        <Toggle value={masterOn} onToggle={handleMasterToggle} size="md" />
        <button onClick={() => setExpanded(p => !p)} className="p-1 text-foreground/25 hover:text-foreground/50 transition-colors">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {/* Expanded items */}
      {expanded && masterOn && (
        <div className="border-t border-border px-3.5 pb-3 pt-1 space-y-0.5 animate-fade-in">
          {category.items.map(item => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <div className="min-w-0 flex-1 pr-3">
                <p className="text-xs font-semibold text-foreground/70">{item.label}</p>
                <p className="text-[10px] text-foreground/30 leading-tight mt-0.5">{item.desc}</p>
              </div>
              <Toggle
                value={visibility[item.key]}
                onToggle={() => onUpdate({ [item.key]: !visibility[item.key] })}
              />
            </div>
          ))}
        </div>
      )}

      {expanded && !masterOn && (
        <div className="border-t border-border/50 px-4 py-3 animate-fade-in">
          <p className="text-[10px] text-foreground/30 text-center">
            Enable the category toggle above to configure individual features
          </p>
        </div>
      )}
    </div>
  );
}

export default function FeatureVisibilitySettings({ visibility, onUpdate }: Props) {
  const [showAll, setShowAll] = useState(false);

  const handleResetAll = () => {
    onUpdate({ ...DEFAULT_VISIBILITY });
    toast.success('🔄 All features reset to defaults');
  };

  const totalFeatures = CATEGORIES.reduce((a, c) => a + c.items.length, 0);
  const activeFeatures = CATEGORIES.reduce((a, c) => a + c.items.filter(it => visibility[it.key]).length, 0);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {activeFeatures === totalFeatures
            ? <Eye className="w-3.5 h-3.5 text-primary" />
            : <EyeOff className="w-3.5 h-3.5 text-foreground/30" />}
          <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-widest">
            Feature Visibility
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-bold text-foreground/30">{activeFeatures}/{totalFeatures}</span>
          <button
            onClick={handleResetAll}
            className="flex items-center gap-1 text-[9px] font-bold text-foreground/30 hover:text-foreground/60 bg-foreground/5 border border-border px-2 py-1 rounded-lg transition-all active:scale-95"
          >
            <RotateCcw className="w-2.5 h-2.5" /> Reset
          </button>
        </div>
      </div>

      <p className="text-[10px] text-foreground/30 mb-3 leading-relaxed">
        Customize which features are visible throughout the app. Disable categories or individual features you don't need.
      </p>

      <div className="space-y-2">
        {CATEGORIES.slice(0, showAll ? undefined : 4).map(cat => (
          <CategorySection
            key={cat.masterKey}
            category={cat}
            visibility={visibility}
            onUpdate={onUpdate}
          />
        ))}
      </div>

      {CATEGORIES.length > 3 && (
        <button
          onClick={() => setShowAll(p => !p)}
          className="w-full mt-2 text-xs font-bold text-primary/60 hover:text-primary py-2 transition-colors"
        >
          {showAll ? 'Show Less ↑' : `Show All ${CATEGORIES.length} Categories ↓`}
        </button>
      )}
    </div>
  );
}
