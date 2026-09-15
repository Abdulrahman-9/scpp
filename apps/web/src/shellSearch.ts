import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
  type SetStateAction,
} from 'react';

/**
 * د2 — the keyboard contract of the LIVE search, written once and worn by both shells.
 *
 * The reference deck answers `Ctrl+K` with a SECOND surface — a command palette listing
 * «إجراءات» that no endpoint stands behind. That is refused (plan §2-أ/22, §7-ب): the shells
 * already carry a search that works and jumps deep into the record, so the two shortcuts do the
 * only honest thing left — they FOCUS that field. Nothing new is opened, nothing is invented.
 *
 * The two shells were about to grow one copy each of this behaviour, which is how two surfaces
 * start disagreeing about what Escape means. It lives here instead, and «الصدفتان متكافئتان»
 * becomes a property of the code rather than a promise in a report.
 */

/** What the field announces to assistive tech, and what the chip stands for. */
export const SEARCH_KEYS = '/ Control+K';

/**
 * د15-م5 — the operator portal's second page-level key: raise a new request from anywhere.
 *
 * Written once and read three ways — the matcher, the `aria-keyshortcuts` the row announces, and
 * the `<kbd>` cap the row prints — so the key a reader is TOLD about is the key that fires.
 */
export const NEW_REQUEST_KEY = 'N';

/**
 * §7-أ-4 — the guard that keeps a typed «/» as DATA.
 *
 * Dates and paths are typed with slashes all day in this product; a page-level listener that
 * grabs every «/» would eat them mid-word and move the caret to a search box. So the shortcut
 * stands down whenever the event came from somewhere that accepts typing — a field, a textarea,
 * a select, or a rich-text host. `closest` rather than a tag check, because the target inside a
 * `contenteditable` region is usually a descendant text node's element, not the host itself.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as Element | null;
  if (!el || typeof el.closest !== 'function') return false;
  return el.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null;
}

/**
 * د15-م5 — the ARMING half of the د2 contract, lifted out of `useShellSearch` so a second
 * page-level shortcut wears it rather than copying it.
 *
 * Three properties travel together and are the whole reason this is one function:
 *
 *   1. **the typing guard** — `isTypingTarget` above, so a keystroke that is DATA stays data. It
 *      is not optional per shortcut: «N» is a letter, so a page listener that grabbed it would
 *      eat it inside every field on the screen, which is the same defect «/» had.
 *   2. **the IME guard** — a composition in progress is a word being formed, not a shortcut.
 *   3. **`armed`** — true only while the listener is genuinely planted. The visible `<kbd>` cap
 *      is rendered off THIS, never off a constant, so a hint can never advertise a key that does
 *      nothing: not on the first paint, and not after the shell unmounts (§6, قانون الصدق).
 *
 * `matches` and `fire` are read through refs, so the listener is planted once and a re-render
 * with fresh closures never re-plants it — and `armed` therefore never flickers false.
 */
export function useArmedShortcut(matches: (e: KeyboardEvent) => boolean, fire: () => void): boolean {
  const [armed, setArmed] = useState(false);
  const matchRef = useRef(matches);
  matchRef.current = matches;
  const fireRef = useRef(fire);
  fireRef.current = fire;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing) return; // an IME is mid-word; nothing here is a shortcut yet
      if (!matchRef.current(e)) return;
      if (isTypingTarget(e.target)) return; // §7-أ-4 — focus is in a field: this keystroke is data
      e.preventDefault();
      fireRef.current();
    };
    document.addEventListener('keydown', onKey);
    setArmed(true);
    return () => {
      document.removeEventListener('keydown', onKey);
      setArmed(false);
    };
  }, []);

  return armed;
}

export interface ShellSearch {
  /** planted on the live field — the one field both shortcuts focus */
  inputRef: RefObject<HTMLInputElement>;
  /**
   * True only once the document listener is actually planted (قانون الصدق, plan §6):
   * the `<kbd>` chip is rendered off this, so a hint can never advertise a key that does
   * nothing — not on the first paint, and not after the shell unmounts the listener.
   */
  armed: boolean;
  /** the result panel is open: a query is live AND Escape has not dismissed it */
  open: boolean;
  /** id of the listbox, and the stem of every option id — unique per shell instance */
  listId: string;
  active: number;
  /** what `aria-activedescendant` should say right now, or undefined when nothing is active */
  activeId: string | undefined;
  optionId: (index: number) => string;
  setActive: Dispatch<SetStateAction<number>>;
  onInputKeyDown: (e: ReactKeyboardEvent<HTMLInputElement>) => void;
}

export function useShellSearch({
  query,
  count,
  hasQuery,
  onPick,
}: {
  /** the raw field value — a change to it revives a dismissed panel and drops the active row */
  query: string;
  /** how many results are rendered right now */
  count: number;
  /** the shell's own «there is a query worth answering» rule (both use ≥ 2 characters) */
  hasQuery: boolean;
  onPick: (index: number) => void;
}): ShellSearch {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [active, setActive] = useState(-1);

  // the picker is read through a ref so the document listener below never has to be re-planted
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  /**
   * The two keys that focus the live field, spoken through the shared arming contract above.
   * The field's presence is part of the MATCH rather than of the action: with no field mounted
   * there is nothing to focus, so the keystroke was never ours to swallow and `preventDefault`
   * must not fire on it.
   */
  const armed = useArmedShortcut(
    (e) => {
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
      const cmdK = (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K');
      return (slash || cmdK) && !!inputRef.current;
    },
    () => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    },
  );

  // a new query is a new question: the panel comes back and no row is pre-selected
  useEffect(() => {
    setDismissed(false);
    setActive(-1);
  }, [query]);

  const open = hasQuery && !dismissed;
  const optionId = useCallback((index: number) => `${listId}res${index}`, [listId]);
  // results shrink as the query grows; an index left pointing past the end names no element
  const activeIdx = active >= 0 && active < count ? active : -1;
  const activeId = open && activeIdx >= 0 ? optionId(activeIdx) : undefined;

  /**
   * Logical scrolling: `block: 'nearest'` moves along the BLOCK axis only, so it behaves the
   * same in both writing directions and never scrolls the panel sideways (§7-أ-7 in spirit —
   * no physical horizontal motion anywhere in this wave).
   */
  useEffect(() => {
    if (!activeId) return;
    const el = document.getElementById(activeId);
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const onInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      // Escape closes the LIST, not the search: the query and the focus both stay put, so the
      // reader can keep editing what they typed. With no list open it is somebody else's key.
      if (!open) return;
      e.preventDefault();
      setDismissed(true);
      setActive(-1);
      return;
    }
    // no arrow hijack while the list is closed — ↑↓ are caret keys in a text field
    if (!open || count === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1 >= count ? 0 : i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? count - 1 : i - 1));
    } else if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      pickRef.current(activeIdx);
    }
  };

  return { inputRef, armed, open, listId, active: activeIdx, activeId, optionId, setActive, onInputKeyDown };
}
