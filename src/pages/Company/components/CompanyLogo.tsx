import { useEffect, useMemo, useState } from "react";
import { Button } from "../../../components/Button";
import { calculateLogoHash, isBlacklistedHash } from "../../../lib/logoBlacklist";
import type { Company } from "../../../types";

const LOGO_DEV_TOKEN = "pk_Z6uB4trEQnSCsNrqOJQ0VA";
const LOGO_CACHE_VERSION = "2";
export const NO_LOGO_FOUND_SOURCE = "Bokstav-fallback (ingen logo funnet)";
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
  onLogoResolved?: (source: LogoSource, logoBlob?: Blob) => void;
  onLogoSearchExhausted?: () => void;
  onToggleLogoDisabled?: (disabled: boolean) => void;
};

type LogoSource = {
  src: string;
  label: string;
  trusted?: boolean;
};

export function CompanyLogo({
  company,
  discover = false,
  updating = false,
  variant = "detail",
  onLogoResolved,
  onLogoSearchExhausted,
  onToggleLogoDisabled,
}: CompanyLogoProps) {
  const [rejectedSourceUrls, setRejectedSourceUrls] = useState<string[]>([]);
  const [savedResolvedSource, setSavedResolvedSource] = useState("");
  const [exactNameDomain, setExactNameDomain] = useState<string | null>(null);
  const [nameSearchComplete, setNameSearchComplete] = useState(false);
  const [exhaustedResultSaved, setExhaustedResultSaved] = useState(false);
  const websiteDomain = domainFromWebsite(company.website);
  const emailDomain = domainFromEmail(company.email);
  const savedSource = company.logo_url
    && !rejectedSourceUrls.includes(company.logo_url)
    ? {
        src: company.logo_url,
        label: company.logo_source ?? "lagret logo",
        trusted: true,
      }
    : null;
  const hasSavedFallback = (
    !company.logo_url
    && company.logo_source === NO_LOGO_FOUND_SOURCE
  );
  const shouldDiscoverLogo = discover && !savedSource && !hasSavedFallback;
  const knownDomainSources = useMemo(
    () => knownDomainLogoSources(company),
    [company],
  );
  const knownDomainsExhausted = knownDomainSources.every(
    (source) => rejectedSourceUrls.includes(source.src),
  );
  const shouldSearchByName = shouldDiscoverLogo && knownDomainsExhausted;
  const sources = useMemo(
    () => [
      ...knownDomainSources,
      ...(nameSearchComplete
        ? nameBasedLogoSources(company, exactNameDomain)
        : []),
    ],
    [company, exactNameDomain, knownDomainSources, nameSearchComplete],
  );
  const availableSources = sources.filter((source) => !rejectedSourceUrls.includes(source.src));
  const currentSource = company.logo_disabled
    ? null
    : savedSource ?? (shouldDiscoverLogo ? availableSources[0] ?? null : null);
  const initial = company.name.trim().charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setRejectedSourceUrls([]);
    setSavedResolvedSource("");
    setExhaustedResultSaved(false);
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

    if (!shouldSearchByName || company.logo_disabled) {
      setNameSearchComplete(false);
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
  }, [company.id, company.name, company.logo_disabled, shouldSearchByName]);

  useEffect(() => {
    if (
      !shouldDiscoverLogo
      || !nameSearchComplete
      || availableSources.length > 0
      || exhaustedResultSaved
    ) {
      return;
    }

    setExhaustedResultSaved(true);
    onLogoSearchExhausted?.();
  }, [
    availableSources.length,
    exhaustedResultSaved,
    nameSearchComplete,
    onLogoSearchExhausted,
    shouldDiscoverLogo,
  ]);

  function handleLogoLoaded(source: LogoSource, logoBlob?: Blob) {
    if (!shouldDiscoverLogo || savedResolvedSource === source.src) {
      return;
    }

    setSavedResolvedSource(source.src);
    onLogoResolved?.(source, logoBlob);
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
        Opprinnelig kilde: {company.logo_disabled ? "bokstav-fallback" : currentSource?.label ?? "bokstav-fallback"}.
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
  onLogoLoaded: (source: LogoSource, logoBlob?: Blob) => void;
  size: "detail" | "compact";
}) {
  const [verifiedSourceUrl, setVerifiedSourceUrl] = useState("");
  const boxClass = size === "detail" ? "h-20 w-20" : "h-11 w-11";
  const imageClass = size === "detail" ? "max-h-14 max-w-14" : "max-h-8 max-w-8";
  const textClass = size === "detail" ? "text-2xl" : "text-base";
  const sourceIsVerified = Boolean(
    currentSource?.trusted || currentSource?.src === verifiedSourceUrl,
  );

  function handleCandidateLoaded(image: HTMLImageElement, source: LogoSource) {
    try {
      if (image.naturalWidth <= 16 && image.naturalHeight <= 16) {
        onSourceRejected(source);
        return;
      }

      const hash = calculateLogoHash(image);
      if (isBlacklistedHash(hash)) {
        onSourceRejected(source);
        return;
      }

      setVerifiedSourceUrl(source.src);
      void logoPngBlob(image)
        .then((logoBlob) => onLogoLoaded(source, logoBlob))
        .catch(() => onLogoLoaded(source));
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
            onLoad={(event) => {
              if (!currentSource.trusted) {
                handleCandidateLoaded(event.currentTarget, currentSource);
              }
            }}
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

function logoPngBlob(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Nettleseren støtter ikke bildebehandling.");
  }

  context.drawImage(image, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Kunne ikke lagre logoen som PNG."));
      }
    }, "image/png");
  });
}

function knownDomainLogoSources(company: Company): LogoSource[] {
  const websiteDomain = domainFromWebsite(company.website);
  const emailDomain = domainFromEmail(company.email);

  return uniqueLogoSources([
    websiteDomain
      ? domainLogoSource(
          websiteDomain,
          company.website_from_brreg
            ? `Logo.dev via nettside fra BRREG (${websiteDomain})`
            : `Logo.dev via registrert nettside (${websiteDomain})`,
        )
      : null,
    emailDomain
      ? domainLogoSource(emailDomain, `Logo.dev via maildomene (${emailDomain})`)
      : null,
  ]);
}

function nameBasedLogoSources(
  company: Company,
  exactNameDomain: string | null,
): LogoSource[] {
  const knownDomains = new Set(
    [domainFromWebsite(company.website), domainFromEmail(company.email)].filter(isPresent),
  );
  const sources: Array<LogoSource | null> = [
    exactNameDomain && !knownDomains.has(exactNameDomain)
      ? domainLogoSource(
          exactNameDomain,
          `Logo.dev – eksakt navnetreff (${exactNameDomain})`,
        )
      : null,
  ];

  const guessedDomains = guessedDomainsForCompanyName(company.name)
    .filter((domain) => domain !== exactNameDomain && !knownDomains.has(domain));
  sources.push(
    ...guessedDomains.map((domain) =>
      domainLogoSource(
        domain,
        `Logo.dev – gjettet nettsidedomene (${domain})`,
      )),
    {
      src: logoDevNameUrl(companyNameWithoutLegalSuffix(company.name)),
      label: "Logo.dev – usikkert navnetreff",
    },
  );

  return uniqueLogoSources(sources);
}

function domainLogoSource(domain: string, label: string): LogoSource {
  return {
    src: `https://img.logo.dev/${domain}?${logoDevBaseParams()}`,
    label,
  };
}

function logoDevNameUrl(companyName: string) {
  return `https://img.logo.dev/name/${encodeURIComponent(companyName)}?${logoDevBaseParams()}`;
}

function logoDevBaseParams() {
  return `token=${LOGO_DEV_TOKEN}&size=128&format=png&theme=light&retina=true&fallback=404`;
}

function uniqueLogoSources(sources: Array<LogoSource | null>) {
  const seenUrls = new Set<string>();
  return sources.filter((source): source is LogoSource => {
    if (!source || seenUrls.has(source.src)) {
      return false;
    }

    seenUrls.add(source.src);
    return true;
  });
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
