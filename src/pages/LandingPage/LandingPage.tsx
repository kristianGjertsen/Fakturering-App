import { AccountingSection } from "./components/AccountingSection";
import { CustomersSection } from "./components/CustomersSection";
import { GettingStartedSection } from "./components/GettingStartedSection";
import { InvoicingSection } from "./components/InvoicingSection";
import { LandingFooter, LandingHeader } from "./components/LandingNavigation";
import { LandingHero } from "./components/LandingHero";
import { ProductsSection } from "./components/ProductsSection";
import { QuestionsSection } from "./components/QuestionsSection";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <LandingHeader />
      <main>
        <LandingHero />
        <CustomersSection />
        <ProductsSection />
        <InvoicingSection />
        <AccountingSection />
        <QuestionsSection />
        <GettingStartedSection />
      </main>
      <LandingFooter />
    </div>
  );
}
