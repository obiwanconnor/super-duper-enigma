"use client";

import { useId, useState } from "react";

type Item = { id: string; title: string; body: string };

/**
 * Inserts a saved reply into a textarea at the cursor. Uses a native select
 * plus a button (no auto-insert on change), moves focus back to the text,
 * and announces the result for screen-reader users.
 */
export function CannedPicker({ items, targetId }: { items: Item[]; targetId: string }) {
  const selectId = useId();
  const [selected, setSelected] = useState("");
  const [message, setMessage] = useState("");
  if (items.length === 0) return null;

  function insert() {
    const item = items.find((i) => i.id === selected);
    const textarea = document.getElementById(targetId) as HTMLTextAreaElement | null;
    if (!item || !textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const before = textarea.value.slice(0, start);
    const spacer = before && !before.endsWith("\n") ? "\n\n" : "";
    textarea.value = `${before}${spacer}${item.body}${textarea.value.slice(end)}`;
    const caret = before.length + spacer.length + item.body.length;
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    setMessage(`Inserted saved reply “${item.title}”.`);
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor={selectId} className="label">
          Saved reply
        </label>
        <select id={selectId} value={selected} onChange={(e) => setSelected(e.target.value)} className="input w-auto py-1">
          <option value="">Choose a saved reply…</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </select>
      </div>
      <button type="button" onClick={insert} disabled={!selected} className="btn-secondary py-1.5">
        Insert
      </button>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
