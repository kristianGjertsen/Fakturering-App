import { supabase } from "../supabaseClient";
import type { Product } from "../types";

export type ProductInput = {
  company_id: string;
  name: string;
  description: string;
  unit: string;
  unit_price: number;
  vat_rate: number;
};

export async function fetchProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Product[];
}

export async function createProduct(input: ProductInput) {
  const { error } = await supabase.from("products").insert({
    company_id: input.company_id,
    name: input.name.trim(),
    description: input.description.trim() || null,
    unit: input.unit.trim() || "stk",
    unit_price: input.unit_price,
    vat_rate: input.vat_rate,
    is_active: true,
  });

  if (error) {
    throw error;
  }
}
