import { cn } from "./cn";

// Shared form-control styling so every input/select/textarea matches the system.
// `autofilled` highlights a value the app filled in for you (pale yellow box).
const base =
  "bg-surface text-ink border border-border rounded-md px-3 py-2 text-sm " +
  "placeholder:text-muted focus:outline-none focus-visible:border-border-strong " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export function Input({ className, autofilled = false, ...props }) {
  return (
    <input
      className={cn(base, autofilled && "bg-autofill border-border-strong", className)}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }) {
  return <textarea className={cn(base, "resize-y", className)} {...props} />;
}

export function Select({ className, autofilled = false, ...props }) {
  return (
    <select
      className={cn(base, "cursor-pointer", autofilled && "bg-autofill", className)}
      {...props}
    />
  );
}

// Optional label + control wrapper for stacked forms.
export function Field({ label, hint, className, children }) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      {label && <span className="text-xs text-muted">{label}</span>}
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}
