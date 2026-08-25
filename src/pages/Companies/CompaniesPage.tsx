import { useState } from "react";
import { Plus } from "@animateicons/react/lucide";
import { AnimatedIconButton } from "../../components/AnimatedIconButton";
import { SectionHeader } from "../../components/SectionHeader";
import { Notice } from "../../components/layout/Notice";
import type { CompanyInput, CompanyLogoPreferenceInput } from "../../lib/data";
import type { Company } from "../../types";
import { CompanyListPanel } from "./components/CompanyListPanel";
import { NewCompanyDialog } from "./components/NewCompanyDialog";

type CompaniesPageProps = {
  companies: Company[];
  onCreateCompany: (input: CompanyInput) => Promise<void>;
  onOpenCompany: (companyId: string) => void;
  onUpdateCompanyLogoPreference: (
    companyId: string,
    input: CompanyLogoPreferenceInput,
  ) => Promise<void>;
};

export default function CompaniesPage({
  companies,
  onCreateCompany,
  onOpenCompany,
  onUpdateCompanyLogoPreference,
}: CompaniesPageProps) {
  const [message, setMessage] = useState("");
  const [showNewCompany, setShowNewCompany] = useState(false);

  return (
    <>
      <SectionHeader
        title="Selskaper"
        description="Registrer et selskap for å se informasjon, produkter og fakturaer. Dette gjør det enklere fakturere gjentagende kunder og holde oversikt over selskapets fakturaer."
        action={
          <AnimatedIconButton className="w-full sm:w-auto" icon={Plus} onClick={() => setShowNewCompany(true)}>
            Registrer nytt selskap
          </AnimatedIconButton>
        }
      />

      <NewCompanyDialog
        open={showNewCompany}
        onClose={() => setShowNewCompany(false)}
        onCreateCompany={onCreateCompany}
        onMessage={setMessage}
      />

      {message && <Notice>{message}</Notice>}

      <CompanyListPanel
        companies={companies}
        onOpenCompany={onOpenCompany}
        onUpdateCompanyLogoPreference={onUpdateCompanyLogoPreference}
      />
    </>
  );
}
