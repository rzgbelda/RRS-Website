interface ErrorMessageProps {
  message: string;
  retry?: () => void;
  compact?: boolean;
}

export default function ErrorMessage({ message, retry, compact = false }: ErrorMessageProps) {
  return (
    <div className={compact ? "error-msg compact" : "error-msg"} role="alert" aria-live="assertive">
      <span aria-hidden="true">⚠️</span>
      <span>{message}</span>
      {retry && (
        <button onClick={retry} className="error-retry" type="button">
          Try again
        </button>
      )}
    </div>
  );
}
