import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { calculateLogoHash, isBlacklistedHash } from "../../../lib/logoBlacklist";
import type { Company } from "../../../types";

const LOGO_DEV_TOKEN = "pk_Z6uB4trEQnSCsNrqOJQ0VA";
const LOGO_CACHE_VERSION = "2";
const COMPANY_FORM_SUFFIXES = new Set([
  "a/s",
  "ab",
  "al",
  "ans",
  "as",
  "asa",
  "ba",
  "da",
  "enk",
  "fkf",
  "iks",
  "inc",
  "kf",
  "ks",
  "llc",
  "ltd",
  "nuf",
  "sa",
  "se",
  "sti",
]);
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
  discover?: boolean;
  updating?: boolean;
  variant?: "detail" | "compact";
  onLogoResolved?: (source: LogoSource) => void;
  onToggleLogoDisabled?: (disabled: boolean) => void;
};

type LogoSource = {
  src: string;
  label: string;
};

export function CompanyLogo({
  company,
  discover = false,
  updating = false,
  variant = "detail",
  onLogoResolved,
  onToggleLogoDisabled,
}: CompanyLogoProps) {
  const [rejectedSourceUrls, setRejectedSourceUrls] = useState<string[]>([]);
  const [savedResolvedSource, setSavedResolvedSource] = useState("");
  const [exactNameDomain, setExactNameDomain] = useState<string | null>(null);
  const [nameSearchComplete, setNameSearchComplete] = useState(false);
  const websiteDomain = domainFromWebsite(company.website);
  const emailDomain = domainFromEmail(company.email);
  const needsNameSearch = !websiteDomain && !emailDomain;
  const sources = useMemo(
    () => logoSourcesForCompany(company, exactNameDomain),
    [company, exactNameDomain],
  );
  const availableSources = sources.filter((source) => !rejectedSourceUrls.includes(source.src));
  const savedLogoNeedsRefresh = Boolean(
    company.logo_url
      && (
        company.logo_source === "Logo.dev API-kall"
        || (
          websiteDomain
          && company.logo_source !== (
            company.website_from_brreg ? "BRREG-nettside" : "nettside-domene"
          )
        )
      ),
  );
  const savedSource = company.logo_url
    && !savedLogoNeedsRefresh
    && !rejectedSourceUrls.includes(company.logo_url)
    ? { src: company.logo_url, label: company.logo_source ?? "lagret logo" }
    : null;
  const shouldDiscoverLogo = (variant === "detail" || discover) && !savedSource;
  const discoveryReady = !needsNameSearch || nameSearchComplete;
  const currentSource = company.logo_disabled
    ? null
    : savedSource ?? (shouldDiscoverLogo && discoveryReady ? availableSources[0] ?? null : null);
  const initial = company.name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setRejectedSourceUrls([]);
    setSavedResolvedSource("");
  }, [
    company.id,
    company.email,
    company.name,
    company.website,
    company.logo_disabled,
    company.logo_url,
  ]);

  useEffect(() => {
    setExactNameDomain(null);

    if (!needsNameSearch || company.logo_disabled) {
      setNameSearchComplete(true);
      return;
    }

    const controller = new AbortController();
    setNameSearchComplete(false);

    void fetch(`/api/logo-search?q=${encodeURIComponent(companyNameWithoutLegalSuffix(company.name))}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        return await response.json() as { domain?: string | null };
      })
      .then((result) => {
        if (!controller.signal.aborted) {
          setExactNameDomain(result?.domain ?? null);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setExactNameDomain(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setNameSearchComplete(true);
      });

    return () => controller.abort();
  }, [company.id, company.name, company.logo_disabled, needsNameSearch]);

  function handleLogoLoaded(source: LogoSource) {
    if (!shouldDiscoverLogo || savedResolvedSource === source.src) {
      return;
    }

    setSavedResolvedSource(source.src);
    onLogoResolved?.(source);
  }

  function handleSourceRejected(source: LogoSource) {
    setRejectedSourceUrls((urls) =>
      urls.includes(source.src) ? urls : [...urls, source.src],
    );
  }

  if (variant === "compact") {
    return (
      <LogoMark
        companyName={company.name}
        currentSource={currentSource}
        initial={initial}
        size="compact"
        onSourceRejected={handleSourceRejected}
        onLogoLoaded={handleLogoLoaded}
      />
    );
  }

  return (
    <div className="flex w-full flex-col gap-2 sm:w-28">
      <LogoMark
        companyName={company.name}
        currentSource={currentSource}
        initial={initial}
        size="detail"
        onSourceRejected={handleSourceRejected}
        onLogoLoaded={handleLogoLoaded}
      />

      <p className="max-w-28 text-xs text-slate-500">
        Logo hentet fra {company.logo_disabled ? "fallback" : currentSource?.label ?? "fallback"}.
      </p>

      {onToggleLogoDisabled && (
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
      )}
    </div>
  );
}

function LogoMark({
  companyName,
  currentSource,
  initial,
  onSourceRejected,
  onLogoLoaded,
  size,
}: {
  companyName: string;
  currentSource: LogoSource | null;
  initial: string;
  onSourceRejected: (source: LogoSource) => void;
  onLogoLoaded: (source: LogoSource) => void;
  size: "detail" | "compact";
}) {
  const [verifiedSourceUrl, setVerifiedSourceUrl] = useState("");
  const boxClass = size === "detail" ? "h-20 w-20" : "h-11 w-11";
  const imageClass = size === "detail" ? "max-h-14 max-w-14" : "max-h-8 max-w-8";
  const textClass = size === "detail" ? "text-2xl" : "text-base";
  const sourceIsVerified = currentSource?.src === verifiedSourceUrl;

  function handleCandidateLoaded(image: HTMLImageElement, source: LogoSource) {
    try {
      const hash = calculateLogoHash(image);
      if (isBlacklistedHash(hash)) {
        onSourceRejected(source);
        return;
      }

      setVerifiedSourceUrl(source.src);
      onLogoLoaded(source);
    } catch {
      onSourceRejected(source);
    }
  }

  return (
    <div className={`grid shrink-0 place-items-center rounded-lg border border-blue-100 bg-white shadow-sm ${boxClass}`}>
      {currentSource ? (
        <>
          {!sourceIsVerified && (
            <span
              className={`col-start-1 row-start-1 font-semibold text-blue-900 ${textClass}`}
              aria-label={`${companyName} logo kontrolleres`}
            >
              {initial}
            </span>
          )}
          <img
            key={currentSource.src}
            src={withLogoCacheVersion(currentSource.src)}
            crossOrigin="anonymous"
            alt={`${companyName} logo`}
            width={size === "detail" ? 64 : 32}
            height={size === "detail" ? 64 : 32}
            className={`col-start-1 row-start-1 object-contain ${imageClass} ${sourceIsVerified ? "" : "invisible"}`}
            onError={() => onSourceRejected(currentSource)}
            onLoad={(event) => handleCandidateLoaded(event.currentTarget, currentSource)}
          />
        </>
      ) : (
        <span className={`font-semibold text-blue-900 ${textClass}`} aria-label={`${companyName} logo fallback`}>
          {initial}
        </span>
      )}
    </div>
  );
}

function withLogoCacheVersion(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    url.searchParams.set("autofaktura_cache", LOGO_CACHE_VERSION);
    return url.toString();
  } catch {
    return imageUrl;
  }
}

function logoSourcesForCompany(company: Company, exactNameDomain: string | null): LogoSource[] {
  const websiteDomain = domainFromWebsite(company.website);
  const emailDomain = domainFromEmail(company.email);
  const lookupName = companyNameWithoutLegalSuffix(company.name);
  const shouldUseNameFallback = !websiteDomain && !emailDomain;
  const guessedDomains = guessedDomainsForCompanyName(company.name);
  const preciseDomains = uniqueValues(
    [websiteDomain, emailDomain, exactNameDomain].filter(isPresent),
  );
  const faviconDomains = uniqueValues([...preciseDomains, ...guessedDomains]);
  const logoDevBaseParams = `token=${LOGO_DEV_TOKEN}&size=128&format=png&theme=light&retina=true&fallback=404`;

  return [
    ...preciseDomains.map((domain): LogoSource => ({
      src: `https://img.logo.dev/${domain}?${logoDevBaseParams}`,
      label: logoSourceLabel(domain, websiteDomain, emailDomain, company.website_from_brreg),
    })),
    ...(shouldUseNameFallback ? [{
      src: `https://img.logo.dev/name/${encodeURIComponent(lookupName)}?${logoDevBaseParams}`,
      label: "Logo.dev navneoppslag",
    }] : []),
    ...faviconDomains.flatMap((faviconDomain): LogoSource[] => [
      {
        src: `https://www.google.com/s2/favicons?domain=${encodeURIComponent(faviconDomain)}&sz=128`,
        label: logoSourceLabel(faviconDomain, websiteDomain, emailDomain, company.website_from_brreg),
      },
      {
        src: `https://${faviconDomain}/favicon.ico`,
        label: logoSourceLabel(faviconDomain, websiteDomain, emailDomain, company.website_from_brreg),
      },
      {
        src: `https://www.${faviconDomain}/favicon.ico`,
        label: logoSourceLabel(faviconDomain, websiteDomain, emailDomain, company.website_from_brreg),
      },
    ]),
  ];
}

function logoSourceLabel(
  domain: string,
  websiteDomain: string | null,
  emailDomain: string | null,
  websiteFromBrreg: boolean,
) {
  if (domain === websiteDomain) return websiteFromBrreg ? "BRREG-nettside" : "nettside-domene";
  if (domain === emailDomain) return "maildomene";
  return "eksakt navnetreff";
}

function domainFromWebsite(website: string | null) {
  const value = website?.trim();
  if (!value) return null;

  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
      .hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

function domainFromEmail(email: string | null) {
  const domain = email?.split("@")[1]?.trim().toLowerCase();
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) {
    return null;
  }

  return domain;
}

function guessedDomainsForCompanyName(companyName: string) {
  const baseName = companyNameWithoutLegalSuffix(companyName)
    .toLowerCase()
    .replace(/&/g, "og")
    .normalize("NFC")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u00e6\u00f8\u00e5]+/g, "")
    .trim();

  if (!baseName) {
    return [];
  }

  const asciiBaseName = baseName
    .replace(/\u00e6/g, "ae")
    .replace(/\u00f8/g, "o")
    .replace(/\u00e5/g, "a");

  return uniqueValues([baseName, asciiBaseName]).flatMap((domainName) =>
    GUESSED_DOMAIN_EXTENSIONS.map((extension) => `${domainName}.${extension}`),
  );
}

function companyNameWithoutLegalSuffix(companyName: string) {
  const nameParts = companyName.trim().split(/\s+/);

  while (nameParts.length > 1) {
    const lastPart = nameParts[nameParts.length - 1].toLowerCase().replace(/[.,]+$/g, "");
    if (!COMPANY_FORM_SUFFIXES.has(lastPart)) {
      break;
    }

    nameParts.pop();
  }

  return nameParts.join(" ");
}

function uniqueValues<T>(values: T[]) {
  return Array.from(new Set(values));
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
