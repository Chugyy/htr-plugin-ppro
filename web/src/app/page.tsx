import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { Pain } from "@/components/landing/pain";
import { Features } from "@/components/landing/features";
import { RoiCalculator } from "@/components/landing/roi-calculator";
import { Pricing } from "@/components/landing/pricing";
import { Testimonials } from "@/components/landing/testimonials";
import { Faq } from "@/components/landing/faq";
import { CtaBanner } from "@/components/landing/cta-banner";
import { Student } from "@/components/landing/student";
import { Footer } from "@/components/landing/footer";

export default function HomePage() {
  return (
    <>
      <Navbar />
      <Hero />
      <div className="flex flex-col items-center">
        <Pain />
        <Features />
        <RoiCalculator />
        <Pricing />
        <Testimonials />
        <Faq />
      </div>
      <CtaBanner />
      <Student />
      <Footer />
    </>
  );
}
