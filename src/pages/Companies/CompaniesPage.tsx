import { useState } from "react";
import { Button } from "../../components/Button";
import { SectionHeader } from "../../components/SectionHeader";
import { Notice } from "../../components/layout/Notice";
import type { CompanyInput } from "../../lib/data";
import type { Company } from "../../types";
import { CompanyListPanel } from "./components/CompanyListPanel";
import { NewCompanyDialog } from "./components/NewCompanyDialog";

type CompaniesPageProps = {
  companies: Company[];
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onOpenCompany: (companyId: string) => void;
};

export default function CompaniesPage({
  companies,
  onCreateCompany,
  onOpenCompany,
}: CompaniesPageProps) {
  const [message, setMessage] = useState("");
  const [showNewCompany, setShowNewCompany] = useState(false);

  return (
    <>
      <SectionHeader
        title="Selskaper"
        description="Åpne et selskap for å se informasjon, produkter og fakturaer."
        action={
          <Button onClick={() => setShowNewCompany(true)}>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="h-4 w-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M10 4v12M4 10h12" />
            </svg>
            Nytt selskap
          </Button>
        }
      />

      <NewCompanyDialog
        open={showNewCompany}
        onClose={() => setShowNewCompany(false)}
        onCreateCompany={onCreateCompany}
        onMessage={setMessage}
      />

      {message && <Notice>{message}</Notice>}

      <CompanyListPanel companies={companies} onOpenCompany={onOpenCompany} />
    </>
  );
}
