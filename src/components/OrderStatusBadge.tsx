type OrderStatus = "new" | "confirmed" | "processing" | "delivered" | "cancelled";

interface OrderStatusBadgeProps {
  status: OrderStatus;
}

const labels: Record<OrderStatus, string> = {
  new: "New",
  confirmed: "Confirmed",
  processing: "Processing",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export default function OrderStatusBadge({ status }: OrderStatusBadgeProps) {
  return (
    <span className={`order-badge order-badge--${status}`} aria-label={`Status: ${labels[status]}`}>
      {labels[status]}
    </span>
  );
}
