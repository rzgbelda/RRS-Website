import Link from "next/link";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: { label: string; href: string };
  icon?: string;
}

export default function EmptyState({ title, description, action, icon = "📭" }: EmptyStateProps) {
  return (
    <div className="empty-state" role="status">
      <span className="empty-icon" aria-hidden="true">{icon}</span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && (
        <Link href={action.href} className="btn-primary" style={{ marginTop: "20px", display: "inline-flex" }}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
