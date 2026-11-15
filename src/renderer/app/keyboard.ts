import { useEffect, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
export function advanceField(event: ReactKeyboardEvent<HTMLFormElement>) {
  const target = event.target as HTMLElement;
  if (event.key !== 'Enter' || !target.matches('input:not([type="radio"]):not([type="checkbox"])'))
    return;
  event.preventDefault();
  const controls = Array.from(
    event.currentTarget.querySelectorAll<HTMLElement>(
      'input:not([disabled]):not([type="hidden"]),textarea:not([disabled]),button[role="combobox"]:not([disabled]),button[type="submit"]',
    ),
  ).filter((control) => control.getClientRects().length > 0);
  controls[controls.indexOf(target) + 1]?.focus();
}
export function useSaveShortcut(form: RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        const dialog = Array.from(
          document.querySelectorAll('[role="dialog"][data-state="open"]'),
        ).at(-1);
        if (dialog && (!form.current || !dialog.contains(form.current))) return;
        form.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [form]);
}
