import { useState } from "react";
import { cn } from "./cn";

// Text input with inline ghost-text completion: as you type, the first option
// that starts with your text is suggested as faded text after the cursor; press
// Tab or → (at the end) to accept it. Good when there are many options and a
// dropdown would be a hassle.
export default function Autocomplete({ value, onChange, options = [], placeholder, className, ...props }) {
  const [focused, setFocused] = useState(false);

  const suggestion =
    value && focused
      ? options.find((o) => o.toLowerCase().startsWith(value.toLowerCase()) && o.toLowerCase() !== value.toLowerCase())
      : null;

  function accept(e) {
    if (suggestion) {
      e.preventDefault();
      onChange(suggestion);
    }
  }

  function onKeyDown(e) {
    if (e.key === "Tab" && suggestion) accept(e);
    else if (e.key === "ArrowRight" && suggestion) {
      const el = e.target;
      if (el.selectionStart === value.length) accept(e);
    }
  }

  return (
    <div className={cn("relative bg-surface rounded-md", className)}>
      {/* Ghost layer: the typed text is invisible, the remainder shows muted. */}
      {suggestion && (
        <div className="absolute inset-0 px-3 py-2 text-sm border border-transparent pointer-events-none whitespace-pre overflow-hidden">
          <span className="invisible">{value}</span>
          <span className="text-muted">{suggestion.slice(value.length)}</span>
        </div>
      )}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        className="relative bg-transparent text-ink border border-border rounded-md px-3 py-2 text-sm w-full placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        {...props}
      />
    </div>
  );
}
