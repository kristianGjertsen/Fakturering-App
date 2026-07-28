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
  website: string;
  website_from_brreg: boolean;
};

export type CompanyLogoPreferenceInput = {
  logo_disabled: boolean;
  logo_url: string | null;
  logo_source: string | null;
  logo_blob?: Blob;
};

export type CompanyLogoPreference = Pick<
  Company,
  "logo_disabled" | "logo_url" | "logo_source"
>;

const COMPANY_LOGOS_BUCKET = "company-logos";

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
    website: normalizeWebsite(input.website),
    website_from_brreg: Boolean(input.website.trim() && input.website_from_brreg),
  });

  if (error) {
    throw error;
  }
}

function normalizeWebsite(value: string) {
  const website = value.trim();
  if (!website) return null;

  return /^https?:\/\//i.test(website) ? website : `https://${website}`;
}

export async function updateCompanyLogoPreference(
  companyId: string,
  input: CompanyLogoPreferenceInput,
): Promise<CompanyLogoPreference> {
  let logoUrl = input.logo_url;
  if (input.logo_blob) {
    try {
      logoUrl = await uploadCompanyLogo(companyId, input.logo_blob);
    } catch {
      logoUrl = input.logo_url;
    }
  }

  const { error } = await supabase
    .from("companies")
    .update({
      logo_disabled: input.logo_disabled,
      logo_url: logoUrl,
      logo_source: input.logo_source,
    })
    .eq("id", companyId);

  if (error) {
    throw error;
  }

  return {
    logo_disabled: input.logo_disabled,
    logo_url: logoUrl,
    logo_source: input.logo_source,
  };
}

async function uploadCompanyLogo(companyId: string, logoBlob: Blob) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user.id) {
    throw new Error("Du må være innlogget for å lagre logo.");
  }

  const storagePath = `${session.user.id}/${companyId}/logo.png`;
  const { error } = await supabase.storage
    .from(COMPANY_LOGOS_BUCKET)
    .upload(storagePath, logoBlob, {
      cacheControl: "31536000",
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage
    .from(COMPANY_LOGOS_BUCKET)
    .getPublicUrl(storagePath);
  const publicUrl = new URL(data.publicUrl);
  publicUrl.searchParams.set("v", Date.now().toString());
  return publicUrl.toString();
}
