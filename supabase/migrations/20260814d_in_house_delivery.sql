-- In-house delivery: Room Ready Supply delivers the order itself with its
-- own vehicle and sets the delivery charge by hand, instead of routing the
-- order through an Estes freight quote or a Shippo parcel label.
--
-- fulfillment_method already carries 'ship' (carrier) and 'pickup' (customer
-- collects); 'in_house' is the third mode. The column is free text with no
-- check constraint, so it needs no alteration -- only the fee does.

-- Quote side: staff tick the box and type a fee while building the quote,
-- so the customer sees the delivery charge on the quotation itself.
alter table public.quote_requests
  add column if not exists fulfillment_method    text    not null default 'ship',
  add column if not exists in_house_delivery_fee numeric(10,2) not null default 0;

-- Order side: the fee has to survive onto the order so the invoice total,
-- the Stripe payment link and the P&L all agree on the same number.
alter table public.orders
  add column if not exists in_house_delivery_fee numeric(10,2) not null default 0;
