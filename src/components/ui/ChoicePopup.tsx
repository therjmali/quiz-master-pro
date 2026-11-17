/**
 * Small premium popup windows. Settings that used to change by tapping a button (and cycled silently through
 * their values) open one of these instead: you see every option, pick one, and the window closes.
 *
 *   <PopupShell open onClose title subtitle icon> <ChoiceList .../> <SwitchRow .../> </PopupShell>
 *
 * Built on <Overlay> (centred small window, menu layer): scroll lock, Escape, Android back, focus trap,
 * safe-area and zoom handling all come from there.
 */
import { Check, ChevronDown } from 'lucide-react';
import Overlay, { OverlayHeader } from './Overlay';

export function PopupShell({ open, onClose, title, subtitle, icon, children, testId }: {
  open: boolean; onClose: () => void; title: string; subtitle?: string; icon?: React.ReactNode; children: React.ReactNode; testId?: string;
}) {
  return (
    <Overlay open={open} onClose={onClose} kind="center" layer="menu" className="qmp-popup" label={title} hideClose>
      <OverlayHeader title={title} subtitle={subtitle} icon={icon} onClose={onClose} />
      <div className="qmp-popup-body" data-testid={testId}>{children}</div>
    </Overlay>
  );
}

export function PopupSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="qmp-popup-section">
      {title && <p className="qmp-popup-section-title">{title}</p>}
      {children}
    </div>
  );
}

export interface ChoiceOption<T extends string | number> { value: T; label: string; hint?: string; icon?: React.ReactNode }

/** Pick exactly one. The selected row is ticked; tapping a row selects it. */
export function ChoiceList<T extends string | number>({ label, options, value, onSelect }: {
  label: string; options: ChoiceOption<T>[]; value: T; onSelect: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="qmp-choice-list">
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} data-choice={String(o.value)} onClick={() => onSelect(o.value)}
            className={`qmp-choice ${on ? 'is-on' : ''}`} style={{ minHeight: 0, minWidth: 0 }}>
            {o.icon != null && <span className="qmp-choice-icon" aria-hidden="true">{o.icon}</span>}
            <span className="qmp-choice-text">
              <span className="qmp-choice-label">{o.label}</span>
              {o.hint && <span className="qmp-choice-hint">{o.hint}</span>}
            </span>
            <span className="qmp-choice-tick" aria-hidden="true">{on && <Check className="h-4 w-4" />}</span>
          </button>
        );
      })}
    </div>
  );
}

/** An on/off row inside a popup (stays open so several can be changed). */
export function SwitchRow({ label, hint, icon, checked, onChange, disabled }: {
  label: string; hint?: string; icon?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={`qmp-choice qmp-switch-row ${checked ? 'is-on' : ''}`} style={{ minHeight: 0, minWidth: 0 }}>
      {icon != null && <span className="qmp-choice-icon" aria-hidden="true">{icon}</span>}
      <span className="qmp-choice-text">
        <span className="qmp-choice-label">{label}</span>
        {hint && <span className="qmp-choice-hint">{hint}</span>}
      </span>
      <span
        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
          checked ? 'bg-primary' : 'bg-foreground/20'
        }`}
        aria-hidden="true"
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
    </button>
  );
}

/** The small button that opens a popup: icon, label and the current value. */
export function PopupTrigger({ icon, label, value, onClick, active, testId }: {
  icon?: React.ReactNode; label: string; value?: string; onClick: () => void; active?: boolean; testId?: string;
}) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" data-testid={testId}
      className={`qmp-popup-trigger ${active ? 'is-active' : ''}`} style={{ minHeight: 0, minWidth: 0 }}>
      {icon != null && <span aria-hidden="true">{icon}</span>}
      <span className="font-black">{label}</span>
      {value && <span className="qmp-popup-trigger-value">{value}</span>}
      <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden="true" />
    </button>
  );
}
