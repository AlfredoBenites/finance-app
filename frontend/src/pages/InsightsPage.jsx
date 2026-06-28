import { PageHeader, Card } from "../components/ui";

// Placeholder — the spending charts (pie/bar by category per month) land in the
// next slice. Kept here so the nav item works and the shell renders end to end.
export default function InsightsPage() {
  return (
    <div>
      <PageHeader title="Insights" subtitle="Spending breakdowns by category and month." />
      <Card className="text-sm text-muted">Charts coming next.</Card>
    </div>
  );
}
