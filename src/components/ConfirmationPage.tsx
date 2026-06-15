import Link from "next/link";

interface ConfirmationPageProps {
  title?: string;
  message?: string;
  reference?: string;
  primaryAction?: { label: string; href: string };
  secondaryAction?: { label: string; href: string };
}

export default function ConfirmationPage({
  title = "Order Submitted!",
  message = "Your order has been received. We'll be in touch shortly to confirm details.",
  reference,
  primaryAction = { label: "Go to My Orders", href: "/account/orders" },
  secondaryAction = { label: "Continue Shopping", href: "/catalog" },
}: ConfirmationPageProps) {
  return (
    <div className="confirm-page">
      <div className="confirm-box">
        <div className="confirm-icon" aria-hidden="true">
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="28" fill="#e8f5e9" />
            <path d="M16 28l9 9 15-16" stroke="#2e7d32" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="confirm-title">{title}</h1>
        <p className="confirm-msg">{message}</p>
        {reference && (
          <p className="confirm-ref">Reference: <strong>{reference}</strong></p>
        )}
        <div className="confirm-actions">
          <Link href={primaryAction.href} className="btn-primary">{primaryAction.label}</Link>
          <Link href={secondaryAction.href} className="btn-secondary">{secondaryAction.label}</Link>
        </div>
      </div>
    </div>
  );
}
