"use server";

// These server actions handle form submissions.
// In production, wire them to your Supabase client.

export async function submitOrderRequest(formData: FormData) {
  const data = {
    businessName: formData.get("businessName") as string,
    contactName: formData.get("contactName") as string,
    email: formData.get("email") as string,
    phone: formData.get("phone") as string,
    address: formData.get("address") as string,
    city: formData.get("city") as string,
    state: formData.get("state") as string,
    zip: formData.get("zip") as string,
    products: formData.get("products") as string,
    quantity: formData.get("quantity") as string,
    orderType: formData.get("orderType") as string,
    frequency: formData.get("frequency") as string,
    notes: formData.get("notes") as string,
  };

  // TODO: Insert into Supabase
  // const { error } = await supabase.from("orders").insert({...});

  console.log("Order submitted:", data);
  return { success: true, orderId: `ORD-${Date.now()}` };
}

export async function submitQuoteRequest(formData: FormData) {
  const data = {
    businessName: formData.get("businessName") as string,
    customerType: formData.get("customerType") as string,
    contactName: formData.get("contactName") as string,
    phone: formData.get("phone") as string,
    email: formData.get("email") as string,
    currentSupplier: formData.get("currentSupplier") as string,
    products: formData.get("products") as string,
    monthlyUsage: formData.get("monthlyUsage") as string,
    notes: formData.get("notes") as string,
  };

  // TODO: Insert into Supabase
  // const { error } = await supabase.from("quote_requests").insert({...});

  console.log("Quote submitted:", data);
  return { success: true, quoteId: `QT-${Date.now()}` };
}

export async function submitReorderSchedule(formData: FormData) {
  const data = {
    businessName: formData.get("businessName") as string,
    contactName: formData.get("contactName") as string,
    email: formData.get("email") as string,
    phone: formData.get("phone") as string,
    frequency: formData.get("frequency") as string,
    customFreq: formData.get("customFreq") as string,
    products: formData.get("products") as string,
    startDate: formData.get("startDate") as string,
    notes: formData.get("notes") as string,
  };

  console.log("Reorder submitted:", data);
  return { success: true, scheduleId: `REO-${Date.now()}` };
}
