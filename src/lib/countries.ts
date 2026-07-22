export const countryOptions = [
  { value: "NO", label: "Norge" },
  { value: "SE", label: "Sverige" },
  { value: "DK", label: "Danmark" },
  { value: "FI", label: "Finland" },
  { value: "IS", label: "Island" },
  { value: "DE", label: "Tyskland" },
  { value: "NL", label: "Nederland" },
  { value: "GB", label: "Storbritannia" },
  { value: "US", label: "USA" },
  { value: "FR", label: "Frankrike" },
  { value: "ES", label: "Spania" },
  { value: "IT", label: "Italia" },
  { value: "PL", label: "Polen" },
] as const;

export function countryLabel(value: string | null | undefined) {
  if (!value) return null;

  const option = countryOptions.find((country) => country.value === value);
  return option?.label ?? value;
}
