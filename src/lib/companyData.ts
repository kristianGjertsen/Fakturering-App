import { supabase } from "../supabaseClient";
import type { Company } from "../types";

export type CompanyInput = {
  name: string;
  org_number: string;
  email: string;
  address: string;
  postal_address: string;
  country: string;
  private_notes: string;
};

export async function fetchCompanies() {
  const { data, error } = await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as Company[];
}

export async function createCompany(ownerUserId: string, input: CompanyInput) {
  const { error } = await supabase.from("companies").insert({
    owner_user_id: ownerUserId,
    name: input.name.trim(),
    org_number: input.org_number.trim() || null,
    email: input.email.trim() || null,
    address: input.address.trim() || null,
    postal_address: input.postal_address.trim() || null,
    country: input.country.trim() || "NO",
    private_notes: input.private_notes.trim() || null,
  });

  if (error) {
    throw error;
  }
}
