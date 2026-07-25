import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import type { Company } from "../../../types";

const LOGO_DEV_TOKEN = "pk_Z6uB4trEQnSCsNrqOJQ0VA";
const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "live.com",
  "icloud.com",
  "me.com",
  "msn.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "yahoo.com",
  "yahoo.no",
]);
const GUESSED_DOMAIN_EXTENSIONS = ["no", "com", "dk", "se", "io"];

type CompanyLogoProps = {
  company: Company;
  updating: boolean;
  onToggleLogoDisabled: (disabled: boolean) => void;
};

type LogoSource = {
  src: string;
  label: string;
};

export function CompanyLogo({
  company,
  updating,
  onToggleLogoDisabled,
}: CompanyLogoProps) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(() => logoSourcesForCompany(company), [company]);
  const currentSource = company.logo_disabled ? null : sources[sourceIndex] ?? null;
  const initial = company.name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setSourceIndex(0);
  }, [company.id, company.email, company.name, company.logo_disabled]);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-28">
      <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg border border-blue-100 bg-white shadow-sm">
        {currentSource ? (
          <img
            src={currentSource.src}
            alt={`${company.name} logo`}
            width={64}
            height={64}
            className="max-h-14 max-w-14 object-contain"
            onError={() => setSourceIndex((index) => index + 1)}
          />
        ) : (
          <span className="text-2xl font-semibold text-blue-900" aria-label={`${company.name} logo fallback`}>
            {initial}
          </span>
        )}
      </div>

      <p className="max-w-28 text-xs text-slate-500">
        Logo hentet fra {company.logo_disabled ? "fallback" : currentSource?.label ?? "fallback"}.
      </p>

      <Button
        size="xs"
        variant="secondary"
        onClick={() => onToggleLogoDisabled(!company.logo_disabled)}
        disabled={updating}
      >
        {company.logo_disabled
          ? updating ? "Aktiverer..." : "Hent logo igjen"
          : updating ? "Fjerner..." : "Fjern logo"}
      </Button>
    </div>
  );
}

function logoSourcesForCompany(company: Company): LogoSource[] {
  const domain = domainFromEmail(company.email);
  const guessedDomains = guessedDomainsForCompanyName(company.name);
  const faviconDomains = uniqueValues([domain, ...guessedDomains].filter(isPresent));
  const logoDevBaseParams = `token=${LOGO_DEV_TOKEN}&size=128&format=png&theme=light&retina=true&fallback=404`;

  return [
    {
      src: `https://img.logo.dev/name/${encodeURIComponent(company.name)}?${logoDevBaseParams}`,
      label: "Logo.dev API-kall",
    },
    ...(domain ? [{
      src: `https://img.logo.dev/${domain}?${logoDevBaseParams}`,
      label: "maildomene",
    }] : []),
    ...faviconDomains.flatMap((faviconDomain): LogoSource[] => [
      {
        src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(faviconDomain)}&sz=128`,
        label: domain === faviconDomain ? "maildomene" : "nettside-domene",
      },
      {
        src: `https://${faviconDomain}/favicon.ico`,
        label: domain === faviconDomain ? "maildomene" : "nettside-domene",
      },
    ]),
  ];
}

function domainFromEmail(email: string | null) {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) {
    return null;
  }

  return domain;
}

function guessedDomainsForCompanyName(companyName: string) {
  const baseName = companyName
    .toLowerCase()
    .replace(/&/g, "og")
    .replace(/\b(as|asa|enk|da|ans|ba|nuf|firma|company|ltd|inc)\b/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "")
    .trim();

  if (!baseName) {
    return [];
  }

  return GUESSED_DOMAIN_EXTENSIONS.map((extension) => `${baseName}.${extension}`);
}

function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
