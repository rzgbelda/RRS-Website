interface LoadingSpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
  fullPage?: boolean;
}

const sizes = { sm: 24, md: 40, lg: 60 };

export default function LoadingSpinner({ size = "md", label = "Loading…", fullPage = false }: LoadingSpinnerProps) {
  const px = sizes[size];
  const spinner = (
    <span role="status" aria-label={label} className="spinner-wrap">
      <span
        className="spinner"
        style={{ width: px, height: px }}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  );

  if (fullPage) {
    return <div className="spinner-fullpage">{spinner}</div>;
  }
  return spinner;
}
