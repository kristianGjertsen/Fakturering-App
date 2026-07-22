import { supabase } from "../supabaseClient";
import type { Profile, ProfileBankAccount } from "../types";

export type ProfileDetailsInput = {
  full_name: string;
  company_name: string;
  address: string;
  postal_address: string;
  country: string;
  org_number: string;
  bank_accounts: Array<{
    account_name: string;
    account_number: string;
  }>;
};

export async function ensureProfile(
  userId: string,
  email: string | null | undefined,
  fullName?: string | null,
) {
  const normalizedName = fullName?.trim() || null;
  const normalizedEmail = email ?? null;

  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, email, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (fetchError) {
    throw fetchError;
  }

  if (!existingProfile) {
    const { error: insertError } = await supabase.from("profiles").insert({
      id: userId,
      email: normalizedEmail,
      full_name: normalizedName,
    });

    if (insertError) {
      throw insertError;
    }

    return;
  }

  const shouldUpdate =
    existingProfile.email !== normalizedEmail
    || (normalizedName !== null && existingProfile.full_name === null);

  if (!shouldUpdate) {
    return;
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      email: normalizedEmail,
      full_name: normalizedName ?? existingProfile.full_name,
    })
    .eq("id", userId);

  if (updateError) {
    throw updateError;
  }
}

export async function fetchProfileDetails(userId: string) {
  const [profileResult, bankAccountsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase
      .from("profile_bank_accounts")
      .select("*")
      .eq("profile_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  if (profileResult.error) {
    throw profileResult.error;
  }

  if (bankAccountsResult.error) {
    throw bankAccountsResult.error;
  }

  return {
    profile: profileResult.data as Profile,
    bankAccounts: (bankAccountsResult.data ?? []) as ProfileBankAccount[],
  };
}

export async function saveProfileDetails(input: ProfileDetailsInput) {
  const normalizedAccounts = input.bank_accounts
    .map((account) => ({
      account_name: account.account_name.trim(),
      account_number: account.account_number.trim(),
    }))
    .filter((account) => account.account_name && account.account_number);

  const { error } = await supabase.rpc("save_profile_details", {
    p_full_name: input.full_name,
    p_company_name: input.company_name,
    p_address: input.address,
    p_postal_address: input.postal_address,
    p_country: input.country,
    p_org_number: input.org_number,
    p_bank_accounts: normalizedAccounts,
  });

  if (error) {
    throw error;
  }

  const { error: authError } = await supabase.auth.updateUser({
    data: {
      full_name: input.full_name.trim(),
    },
  });

  if (authError) {
    throw authError;
  }
}

export async function deleteCurrentUser() {
  const { error } = await supabase.functions.invoke("delete-user", {
    body: {},
  });

  if (error) {
    throw error;
  }
}
