"use client";

import { useState } from "react";

interface NotificationBellProps {
  count?: number;
}

export default function NotificationBell({ count = 0 }: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="notif-wrap" style={{ position: "relative" }}>
      <button
        className="notif-btn"
        onClick={() => setOpen(!open)}
        aria-label={count > 0 ? `${count} notifications` : "No notifications"}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {count > 0 && (
          <span className="notif-badge" aria-hidden="true">{count > 9 ? "9+" : count}</span>
        )}
      </button>
      {open && (
        <div className="notif-dropdown" role="menu" aria-label="Notifications">
          {count === 0 ? (
            <p className="notif-empty">No new notifications</p>
          ) : (
            <p className="notif-empty">{count} notification{count !== 1 ? "s" : ""}</p>
          )}
        </div>
      )}
    </div>
  );
}
