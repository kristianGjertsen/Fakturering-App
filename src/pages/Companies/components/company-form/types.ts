export type FormStep = 1 | 2 | 3;

export type BrregCompany = {
  name: string;
  organizationNumber: string;
  address: string;
  postalAddress: string;
  email: string;
  phone: string;
  website: string;
};

export type BrregPrefilledFields = {
  email: boolean;
  phone: boolean;
  website: boolean;
};

export type CompanyFormData = {
  companyName: string;
  organizationNumber: string;
  address: string;
  postalAddress: string;
  country: string;
  email: string;
  contactPerson: string;
  phone: string;
  website: string;
  paymentTermsDays: number;
  invoiceNotes: string;
  privateNotes: string;
};

export const emptyCompanyForm: CompanyFormData = {
  companyName: "",
  organizationNumber: "",
  address: "",
  postalAddress: "",
  country: "NO",
  email: "",
  contactPerson: "",
  phone: "",
  website: "",
  paymentTermsDays: 14,
  invoiceNotes: "",
  privateNotes: "",
};
