import { cn } from "./cn";

// Big bold page title with optional subtitle and right-aligned
// controls (filters, YearSelect, an "Add" button).
export default function PageHeader({ title, subtitle, actions, className }) {
  return (
    <div className={cn("mb-6", className)}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
      </div>
    </div>
  );
}
