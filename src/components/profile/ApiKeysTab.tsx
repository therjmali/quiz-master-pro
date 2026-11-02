import { useState, useEffect } from 'react';
import { Eye, EyeOff, Save, Trash2, ExternalLink, Key, CheckCircle, AlertCircle, Wifi, WifiOff, Power } from 'lucide-react';
import { Switch } from '@project/components/ui/switch';
import { toast } from 'sonner';
import {
  UserApiKeys, getUserApiKeys, saveUserApiKeys,
  maskKey, getActiveProvider, PROVIDER_INFO, isKeyEnabled,
} from '../../utils/apiKeys';

interface ProviderConfig {
  id: keyof Pick<UserApiKeys, 'gemini' | 'cohere' | 'openai' | 'anthropic'>;
  enabledKey: keyof Pick<UserApiKeys, 'geminiEnabled' | 'cohereEnabled' | 'openaiEnabled' | 'anthropicEnabled'>;
  name: string;
  icon: string;
  color: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
  placeholder: string;
  getKeyUrl: string;
  getKeyLabel: string;
  description: string;
  model: string;
}

const PROVIDERS: ProviderConfig[] = [
  {
    id: 'gemini',
    enabledKey: 'geminiEnabled',
    name: 'Google Gemini',
    icon: '✨',
    color: 'blue',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-300',
    placeholder: 'AIzaSy...',
    getKeyUrl: 'https://aistudio.google.com/app/apikey',
    getKeyLabel: 'Get free key at aistudio.google.com',
    description: 'Gemini 2.5 Flash — best balance of speed & quality. Free tier available.',
    model: 'gemini-2.5-flash',
  },
  {
    id: 'cohere',
    enabledKey: 'cohereEnabled',
    name: 'Cohere AI',
    icon: '⚡',
    color: 'violet',
    borderColor: 'border-violet-500/30',
    bgColor: 'bg-violet-500/10',
    textColor: 'text-violet-300',
    placeholder: 'hrbrD5...',
    getKeyUrl: 'https://dashboard.cohere.com/api-keys',
    getKeyLabel: 'Get free key at dashboard.cohere.com',
    description: 'Command R+ — powerful language model. 1000 free calls/month.',
    model: 'command-r-plus',
  },
  {
    id: 'openai',
    enabledKey: 'openaiEnabled',
    name: 'ChatGPT / OpenAI',
    icon: '🤖',
    color: 'emerald',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-300',
    placeholder: 'sk-...',
    getKeyUrl: 'https://platform.openai.com/api-keys',
    getKeyLabel: 'Get key at platform.openai.com',
    description: 'GPT-4o Mini — fast & affordable. Pay-as-you-go, no free tier.',
    model: 'gpt-4o-mini',
  },
  {
    id: 'anthropic',
    enabledKey: 'anthropicEnabled',
    name: 'Anthropic Claude',
    icon: '🧠',
    color: 'orange',
    borderColor: 'border-orange-500/30',
    bgColor: 'bg-orange-500/10',
    textColor: 'text-orange-300',
    placeholder: 'sk-ant-...',
    getKeyUrl: 'https://console.anthropic.com/settings/keys',
    getKeyLabel: 'Get key at console.anthropic.com',
    description: 'Claude 3.5 Sonnet — excellent reasoning & explanations. Pay-as-you-go.',
    model: 'claude-3.5-sonnet',
  },
];

interface KeyCardProps {
  config: ProviderConfig;
  currentKey: string | undefined;
  enabled: boolean;
  isActive: boolean;
  onSave: (key: string) => void;
  onClear: () => void;
  onToggle: (enabled: boolean) => void;
}

function KeyCard({ config, currentKey, enabled, isActive, onSave, onClear, onToggle }: KeyCardProps) {
  const [editing, setEditing] = useState(!currentKey);
  const [input, setInput] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    setEditing(!currentKey);
    setInput('');
  }, [currentKey]);

  const handleSave = () => {
    const trimmed = input.trim();
    if (!trimmed) { toast.error('Please enter an API key'); return; }
    if (trimmed.length < 10) { toast.error('Key seems too short — please check'); return; }
    onSave(trimmed);
    setEditing(false);
    setInput('');
    setShow(false);
    toast.success(`${config.name} key saved!`);
  };

  const handleClear = () => {
    onClear();
    setEditing(true);
    setInput('');
    toast.success(`${config.name} key removed`);
  };

  const handleToggle = (val: boolean) => {
    onToggle(val);
    toast.success(`${config.name} ${val ? 'enabled' : 'disabled'}`);
  };

  const isDisabled = !!currentKey && !enabled;

  return (
    <div className={`rounded-2xl border p-4 transition-all duration-200 ${
      isActive
        ? `${config.bgColor} ${config.borderColor} shadow-lg`
        : isDisabled
        ? 'bg-white/3 border-white/5 opacity-60'
        : 'bg-white/3 border-white/10'
    }`}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`text-xl transition-all ${isDisabled ? 'grayscale opacity-50' : ''}`}>
            {config.icon}
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-black text-white">{config.name}</span>
              {isActive && (
                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border ${config.bgColor} ${config.borderColor} ${config.textColor}`}>
                  ACTIVE
                </span>
              )}
              {currentKey && !enabled && (
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border border-white/15 bg-white/5 text-white/30">
                  OFF
                </span>
              )}
            </div>
            <p className="text-[10px] text-white/40 mt-0.5">{config.model}</p>
          </div>
        </div>

        {/* ON/OFF Toggle — only show when key exists */}
        {currentKey ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Power className={`w-3 h-3 ${enabled ? config.textColor : 'text-white/20'}`} />
              <span className={`text-[9px] font-bold ${enabled ? config.textColor : 'text-white/25'}`}>
                {enabled ? 'ON' : 'OFF'}
              </span>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={handleToggle}
              className="scale-90"
            />
          </div>
        ) : (
          <AlertCircle className="w-5 h-5 text-white/20" />
        )}
      </div>

      <p className="text-[11px] text-white/40 mb-3 leading-relaxed">{config.description}</p>

      {/* Key display / input */}
      {!editing && currentKey ? (
        <div className="flex items-center gap-2 mb-3">
          <div className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
            enabled ? config.borderColor : 'border-white/10'
          } bg-black/30 transition-all`}>
            <Key className={`w-3 h-3 ${enabled ? config.textColor : 'text-white/20'} flex-shrink-0`} />
            <span className={`text-xs font-mono flex-1 truncate ${enabled ? 'text-white/60' : 'text-white/25'}`}>
              {show ? currentKey : maskKey(currentKey)}
            </span>
            <button onClick={() => setShow(s => !s)} className="text-white/30 hover:text-white/60 transition-colors">
              {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            onClick={() => setEditing(true)}
            className={`px-3 py-2.5 rounded-xl text-xs font-bold border ${config.borderColor} ${config.textColor} ${config.bgColor} hover:opacity-80 transition-all`}
          >
            Edit
          </button>
          <button
            onClick={handleClear}
            className="px-3 py-2.5 rounded-xl text-xs font-bold border border-red-500/30 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={show ? 'text' : 'password'}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                placeholder={config.placeholder}
                className={`w-full bg-black/40 border ${config.borderColor} rounded-xl px-3 py-2.5 text-xs font-mono text-white placeholder-white/20 focus:outline-none focus:ring-1 pr-10`}
              />
              <button
                onClick={() => setShow(s => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
              >
                {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={handleSave}
              className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold ${config.bgColor} ${config.borderColor} border ${config.textColor} hover:opacity-80 transition-all`}
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            {currentKey && (
              <button
                onClick={() => setEditing(false)}
                className="px-3 py-2.5 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-white/40 hover:bg-white/10 transition-all"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      )}

      {/* Get key link */}
      <a
        href={config.getKeyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`flex items-center gap-1.5 text-[10px] font-bold ${config.textColor} opacity-60 hover:opacity-100 transition-opacity`}
      >
        <ExternalLink className="w-3 h-3" />
        {config.getKeyLabel}
      </a>
    </div>
  );
}

export default function ApiKeysTab() {
  const [keys, setKeys] = useState<UserApiKeys>(getUserApiKeys);
  const activeProvider = getActiveProvider(keys);
  const providerInfo = PROVIDER_INFO[activeProvider];
  const hasAnyActiveKey = activeProvider !== 'system';

  const handleSave = (id: keyof Pick<UserApiKeys, 'gemini' | 'cohere' | 'openai' | 'anthropic'>, value: string) => {
    const updated = { ...keys, [id]: value, [`${id}Enabled`]: true };
    setKeys(updated);
    saveUserApiKeys(updated);
  };

  const handleClear = (id: keyof Pick<UserApiKeys, 'gemini' | 'cohere' | 'openai' | 'anthropic'>) => {
    const updated = { ...keys, [id]: undefined, [`${id}Enabled`]: true };
    setKeys(updated);
    saveUserApiKeys(updated);
  };

  const handleToggle = (id: keyof Pick<UserApiKeys, 'gemini' | 'cohere' | 'openai' | 'anthropic'>, enabled: boolean) => {
    const updated = { ...keys, [`${id}Enabled`]: enabled };
    setKeys(updated);
    saveUserApiKeys(updated);
  };

  return (
    <div className="space-y-4">
      {/* Active provider banner */}
      <div className={`rounded-2xl border p-4 flex items-center gap-3 ${providerInfo.badge}`}>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          hasAnyActiveKey ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-white/20'
        }`} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-white">
            {hasAnyActiveKey ? (
              <><span className={providerInfo.color}>✓ Active:</span> {providerInfo.label}</>
            ) : (
              'Using system default API key'
            )}
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">
            {hasAnyActiveKey
              ? 'Your personal key is used — no quota sharing with other users'
              : 'Add your own key below to avoid rate limits and get dedicated quota'}
          </p>
        </div>
        {hasAnyActiveKey ? (
          <Wifi className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        ) : (
          <WifiOff className="w-4 h-4 text-white/20 flex-shrink-0" />
        )}
      </div>

      {/* Priority info */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
        <p className="text-[10px] text-amber-300 font-bold flex items-center gap-1.5">
          <span>💡</span> Priority Order
        </p>
        <p className="text-[10px] text-white/40 mt-1 leading-relaxed">
          Gemini (yours) → Cohere (yours) → ChatGPT (yours) → Anthropic (yours) → System Gemini (fallback)
        </p>
        <p className="text-[10px] text-white/30 mt-1 leading-relaxed">
          Toggle OFF any key to skip it and use the next provider in priority.
        </p>
      </div>

      {/* Key cards */}
      <div className="space-y-3">
        {PROVIDERS.map(p => (
          <KeyCard
            key={p.id}
            config={p}
            currentKey={keys[p.id]}
            enabled={isKeyEnabled(keys, p.id)}
            isActive={
              (p.id === 'gemini' && activeProvider === 'gemini_user') ||
              (p.id === 'cohere' && activeProvider === 'cohere') ||
              (p.id === 'openai' && activeProvider === 'openai') ||
              (p.id === 'anthropic' && activeProvider === 'anthropic')
            }
            onSave={(val) => handleSave(p.id, val)}
            onClear={() => handleClear(p.id)}
            onToggle={(enabled) => handleToggle(p.id, enabled)}
          />
        ))}
      </div>

      {/* Privacy notice */}
      <div className="rounded-xl border border-white/5 bg-white/3 p-3">
        <p className="text-[10px] text-white/30 leading-relaxed">
          🔒 <strong className="text-white/40">Privacy:</strong> Your API keys are stored <strong className="text-white/40">only in this browser</strong> (localStorage) and sent directly to the respective AI provider. They are never stored on any server or shared with anyone.
        </p>
      </div>

      {/* Offline mode info */}
      <div className="rounded-xl border border-white/5 bg-white/3 p-3">
        <p className="text-[10px] text-white/30 leading-relaxed">
          📴 <strong className="text-white/40">Offline Mode:</strong> When all keys are unavailable, paste MCQs in the required format and the offline parser loads them instantly — no AI needed! Format: <code className="bg-white/10 px-1 rounded text-white/40">Q1(E). Question</code> · <code className="bg-white/10 px-1 rounded text-white/40">(a)–(d)</code> · <code className="bg-white/10 px-1 rounded text-white/40">Answer - (b) text</code> · <code className="bg-white/10 px-1 rounded text-white/40">• explanation</code>.
        </p>
      </div>
    </div>
  );
}
