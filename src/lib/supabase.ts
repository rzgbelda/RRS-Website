import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: "customer" | "admin";
          created_at: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          sort_order: number;
        };
      };
      products: {
        Row: {
          id: string;
          category_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          pack_size: string | null;
          case_quantity: string | null;
          price_per_case: number | null;
          price_display: string;
          min_order_quantity: number;
          delivery_notes: string | null;
          stock_status: "in_stock" | "low_stock" | "out_of_stock";
          is_active: boolean;
          created_at: string;
        };
      };
      orders: {
        Row: {
          id: string;
          user_id: string | null;
          order_number: string;
          business_name: string;
          contact_name: string;
          email: string;
          phone: string | null;
          delivery_address: Record<string, unknown> | null;
          order_type: "one_time" | "reorder";
          status: "new" | "confirmed" | "processing" | "delivered" | "cancelled";
          notes: string | null;
          total_estimate: number | null;
          created_at: string;
        };
      };
      quote_requests: {
        Row: {
          id: string;
          quote_number: string;
          business_name: string;
          customer_type: string;
          contact_name: string;
          phone: string | null;
          email: string;
          current_supplier: string | null;
          regular_products: string | null;
          monthly_usage: string | null;
          notes: string | null;
          invoice_url: string | null;
          status: "new" | "under_review" | "quoted" | "completed" | "declined";
          created_at: string;
        };
      };
      reorder_schedules: {
        Row: {
          id: string;
          user_id: string;
          business_name: string;
          contact_name: string;
          email: string;
          frequency: "weekly" | "biweekly" | "monthly" | "45_days" | "60_days" | "custom";
          custom_frequency: string | null;
          supply_list: unknown[];
          next_order_date: string | null;
          status: "active" | "paused" | "cancelled";
          created_at: string;
        };
      };
    };
  };
};
