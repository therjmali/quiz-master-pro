import { useState, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function timeAgo(iso: string | number | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  if (!Number.isFinite(t)) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  if (s < 86_400 * 30) return `${Math.round(s / 86_400)} d ago`;
  return new Date(t).toLocaleDateString();
}

type Tone = 'primary' | 'ghost' | 'danger' | 'success';
const TONES: Record<Tone, string> = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  ghost: 'bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1] border border-border',
  danger: 'bg-destructive/10 text-destructive hover:bg-destructive/15 border border-destructive/25',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25',
};

export function Btn({ children, onClick, tone = 'ghost', busy, disabled, icon, small, type = 'button', full }: {
  children: ReactNode; onClick?: () => void; tone?: Tone; busy?: boolean; disabled?: boolean; icon?: ReactNode; small?: boolean; type?: 'button' | 'submit'; full?: boolean;
}) {
  return (
    <button type={type} onClick={onClick} disabled={disabled || busy}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-bold transition disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${small ? 'h-8 px-3 text-[11px]' : 'h-10 px-4 text-xs'} ${full ? 'w-full' : ''} ${TONES[tone]}`}>
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function TextField({ label, value, onChange, type = 'text', placeholder, autoComplete, onEnter, invalid }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; autoComplete?: string; onEnter?: () => void; invalid?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold text-foreground/55 mb-1">{label}</span>
      <input type={type} value={value} placeholder={placeholder} autoComplete={autoComplete} aria-invalid={invalid || undefined}
        onChange={e => onChange(e.target.value)} onKeyDown={e => e.key === 'Enter' && onEnter?.()}
        className={`w-full h-10 bg-foreground/[0.04] border rounded-xl px-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50 ${invalid ? 'border-destructive/60' : 'border-border'}`} />
    </label>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }) {
  const t = {
    neutral: 'bg-foreground/[0.07] text-foreground/60', good: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
    warn: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', bad: 'bg-destructive/12 text-destructive', info: 'bg-primary/12 text-primary',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${t}`}>{children}</span>;
}

export function Card({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'warn' | 'bad' | 'info' }) {
  const t = { plain: 'border-border bg-foreground/[0.03]', warn: 'border-amber-500/30 bg-amber-500/[0.06]', bad: 'border-destructive/30 bg-destructive/[0.06]', info: 'border-primary/25 bg-primary/[0.06]' }[tone];
  return <div className={`rounded-2xl border p-3.5 ${t}`}>{children}</div>;
}

export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}
      className="h-2 w-full rounded-full bg-foreground/[0.08] overflow-hidden">
      <div className={`h-full rounded-full transition-all ${pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-amber-500' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Confirmation with an optional "type this word" guard for irreversible actions. */
export function Confirm({ open, onOpenChange, title, body, confirmLabel, onConfirm, requireText, danger = true }: {
  open: boolean; onOpenChange: (v: boolean) => void; title: string; body: ReactNode; confirmLabel: string;
  onConfirm: () => void | Promise<void>; requireText?: string; danger?: boolean;
}) {
  const [typed, setTyped] = useState('');
  const blocked = !!requireText && typed.trim().toUpperCase() !== requireText.toUpperCase();
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) setTyped(''); onOpenChange(v); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild><div className="text-sm text-muted-foreground space-y-2">{body}</div></AlertDialogDescription>
        </AlertDialogHeader>
        {requireText && (
          <TextField label={`Type ${requireText} to confirm`} value={typed} onChange={setTyped} />
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={blocked} onClick={() => { void onConfirm(); }} className={danger ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
