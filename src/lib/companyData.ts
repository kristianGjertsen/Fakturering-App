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
  contact_person: string;
  phone: string;
  payment_terms_days: number;
  invoice_notes: string;
};

export type CompanyLogoPreferenceInput = {
  logo_disabled: boolean;
  logo_url: string | null;
  logo_source: string | null;
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
    contact_person: input.contact_person.trim() || null,
    phone: input.phone.trim() || null,
    payment_terms_days: input.payment_terms_days,
    invoice_notes: input.invoice_notes.trim() || null,
  });

  if (error) {
    throw error;
  }
}

export async function updateCompanyLogoPreference(
  companyId: string,
  input: CompanyLogoPreferenceInput,
) {
  const { error } = await supabase
    .from("companies")
    .update(input)
    .eq("id", companyId);

  if (error) {
    throw error;
  }
}
