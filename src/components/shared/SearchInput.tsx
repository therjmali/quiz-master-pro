import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { useDebouncedCallback } from 'use-debounce';

/**
 * Shared search input used across the app.
 *
 * - Keeps the typed text in local state, so a keystroke only re-renders this
 *   input — the parent receives `onChange` once typing pauses (`debounceMs`).
 * - The <input> element is never remounted, so focus is never lost.
 * - Clear (×) and Escape fire immediately and keep focus in the field.
 * - If the parent changes `value` (e.g. "Clear filters"), the field follows.
 */
export interface SearchInputHandle { focus: () => void; clear: () => void }

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  debounceMs?: number;
  size?: 'sm' | 'md';
  right?: ReactNode;
  className?: string;
  ariaLabel?: string;
}

const SearchInput = forwardRef<SearchInputHandle, Props>(function SearchInput(
  { value, onChange, placeholder, debounceMs = 200, size = 'md', right, className = '', ariaLabel }, ref,
) {
  const [text, setText] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastSent = useRef(value);
  const emit = useDebouncedCallback((v: string) => { lastSent.current = v; onChange(v); }, debounceMs);

  // Follow external resets without clobbering what the user is typing
  useEffect(() => {
    if (value !== lastSent.current) { lastSent.current = value; setText(value); emit.cancel(); }
  }, [value, emit]);
  useEffect(() => () => emit.flush(), [emit]);

  const clear = () => { emit.cancel(); setText(''); lastSent.current = ''; onChange(''); inputRef.current?.focus(); };
  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus(), clear }));

  const md = size === 'md';
  return (
    <div className={`relative ${className}`}>
      <Search className={`absolute top-1/2 -translate-y-1/2 text-foreground/35 pointer-events-none ${md ? 'left-3.5 w-4 h-4' : 'left-3 w-3.5 h-3.5'}`} />
      <input
        ref={inputRef}
        type="text" inputMode="search" enterKeyHint="search" autoComplete="off" spellCheck={false}
        value={text}
        aria-label={ariaLabel || placeholder}
        placeholder={placeholder}
        onChange={e => { setText(e.target.value); emit(e.target.value); }}
        onKeyDown={e => {
          if (e.key === 'Escape' && text) { e.stopPropagation(); clear(); }
          if (e.key === 'Enter') emit.flush();
        }}
        className={`w-full bg-card border border-border focus:border-primary/40 focus:ring-2 focus:ring-primary/15 text-foreground placeholder:text-foreground/30 focus:outline-none transition-shadow ${
          md ? `h-11 rounded-2xl pl-10 text-sm shadow-sm ${right ? 'pr-28' : 'pr-10'}` : `h-9 rounded-xl pl-8 text-xs ${right ? 'pr-24' : 'pr-8'}`
        }`}
      />
      <div className={`absolute top-1/2 -translate-y-1/2 flex items-center gap-1 ${md ? 'right-1.5' : 'right-1'}`}>
        {text && (
          <button type="button" onClick={clear} aria-label="Clear search"
            className={`rounded-lg flex items-center justify-center text-foreground/40 hover:text-foreground/80 active:scale-90 transition-all ${md ? 'w-7 h-7' : 'w-6 h-6'}`}>
            <X className={md ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
          </button>
        )}
        {right}
      </div>
    </div>
  );
});

export default SearchInput;

/** Consistent "no results" block for any searched list. */
export function SearchEmptyState({ query, onClear, noun = 'items' }: { query: string; onClear: () => void; noun?: string }) {
  return (
    <div className="text-center py-8 px-4">
      <div className="w-11 h-11 mx-auto mb-2.5 rounded-2xl bg-foreground/[0.05] flex items-center justify-center">
        <Search className="w-5 h-5 text-foreground/35" />
      </div>
      <p className="text-sm font-bold text-foreground">No {noun} match “{query}”</p>
      <p className="text-[11px] text-foreground/45 mt-1">Check the spelling or try a shorter word.</p>
      <button type="button" onClick={onClear} className="mt-3 h-8 px-4 rounded-lg bg-foreground/[0.06] hover:bg-foreground/[0.1] text-xs font-bold text-foreground transition-colors">
        Clear search
      </button>
    </div>
  );
}
