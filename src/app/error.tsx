"use client";

import Link from "next/link";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <div className="not-found-page">
          <div className="not-found-code" style={{ color: "#e53e3e" }}>!</div>
          <h1 className="not-found-title">Something went wrong</h1>
          <p className="not-found-msg">An unexpected error occurred. Please try again.</p>
          <div className="not-found-actions">
            <button onClick={reset} className="btn-primary">Try Again</button>
            <Link href="/" className="btn-secondary">Go Home</Link>
          </div>
        </div>
      </body>
    </html>
  );
}
