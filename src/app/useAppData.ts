import { useCallback, useEffect, useState } from "react";
import { fetchAppData, type AppData } from "../lib/data";

const EMPTY_APP_DATA: AppData = {
  companies: [],
  products: [],
  invoices: [],
  schedules: [],
  profile: {
    id: "",
    email: null,
    full_name: null,
    company_name: null,
    address: null,
    postal_address: null,
    country: "NO",
    org_number: null,
    has_sent_invoices_before: false,
    last_invoice_number: 9999,
    invoice_number_prefix: "",
    invoice_number_padding_width: 0,
    created_at: "",
    updated_at: "",
  },
  bankAccounts: [],
};

export function useAppData(userId: string) {
  const [data, setData] = useState<AppData>(EMPTY_APP_DATA);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    setError("");

    try {
      setData(await fetchAppData(userId));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Kunne ikke hente data fra Supabase.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const updateCompanyInData = useCallback((
    companyId: string,
    companyPatch: Partial<AppData["companies"][number]>,
  ) => {
    setData((currentData) => ({
      ...currentData,
      companies: currentData.companies.map((company) =>
        company.id === companyId
          ? { ...company, ...companyPatch }
          : company
      ),
    }));
  }, []);

  return { data, isLoading, error, refreshData, updateCompanyInData };
}
