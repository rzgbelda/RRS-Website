interface PageHeaderProps {
  title: string;
  subtitle?: string;
  accent?: boolean;
  center?: boolean;
}

export default function PageHeader({ title, subtitle, accent = false, center = true }: PageHeaderProps) {
  return (
    <div className={`page-header-block${center ? " centered" : ""}`}>
      <h1 className={accent ? "ph-title accent" : "ph-title"}>{title}</h1>
      <div className="ph-line" aria-hidden="true" />
      {subtitle && <p className="ph-sub">{subtitle}</p>}
    </div>
  );
}
