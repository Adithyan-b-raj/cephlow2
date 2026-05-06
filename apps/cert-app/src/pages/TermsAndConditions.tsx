import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const SECTIONS = [
  { id: "eligibility", label: "01 · Eligibility & Accounts" },
  { id: "acceptable", label: "02 · Acceptable Use" },
  { id: "content", label: "03 · Certificate Content" },
  { id: "wallet", label: "04 · Wallet & Payments" },
  { id: "google", label: "05 · Google Integration" },
  { id: "whatsapp", label: "06 · WhatsApp Delivery" },
  { id: "profiles", label: "07 · Public Profiles & QR" },
  { id: "ip", label: "08 · Intellectual Property" },
  { id: "disclaimers", label: "09 · Disclaimers" },
  { id: "liability", label: "10 · Limitation of Liability" },
  { id: "indemnification", label: "11 · Indemnification" },
  { id: "termination", label: "12 · Termination" },
  { id: "governing", label: "13 · Governing Law" },
  { id: "changes", label: "14 · Changes" },
  { id: "contact", label: "Contact" },
];

function useSectionObserver(ids: string[]) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const observers = ids.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActive(id); },
        { rootMargin: "-20% 0px -70% 0px" }
      );
      obs.observe(el);
      return obs;
    });
    return () => observers.forEach((o) => o?.disconnect());
  }, [ids]);
  return active;
}

export default function TermsAndConditions() {
  const [, navigate] = useLocation();
  const activeId = useSectionObserver(SECTIONS.map((s) => s.id));

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen font-mono bg-white text-black">
      {/* Header */}
      <header className="border-b border-black px-6 lg:px-10 py-4 flex items-center justify-between sticky top-0 bg-white z-20">
        <button onClick={() => navigate("/")} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
          <div className="w-7 h-7 bg-black flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">C</span>
          </div>
          <span className="font-bold tracking-widest text-sm">CEPHLOW</span>
        </button>
        <div className="text-[9px] tracking-widest text-gray-400 hidden sm:block">TERMS &amp; CONDITIONS</div>
        <button
          onClick={() => navigate("/")}
          className="text-[10px] tracking-widest border border-black px-3 py-1.5 hover:bg-black hover:text-white transition-colors"
        >
          ← BACK
        </button>
      </header>

      {/* Hero */}
      <section className="bg-black text-white px-6 lg:px-10 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto">
          <div className="text-[10px] tracking-widest text-gray-500 mb-4">LEGAL DOCUMENT</div>
          <h1 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight">Terms &amp; Conditions</h1>
          <div className="flex flex-wrap gap-6 text-sm text-gray-400">
            <span>Last updated: <span className="text-white font-bold">06 May 2026</span></span>
            <span>·</span>
            <span>Effective: <span className="text-white font-bold">06 May 2026</span></span>
          </div>
          <p className="mt-8 text-base text-gray-400 max-w-2xl leading-relaxed">
            These Terms govern your access to and use of Cephlow. By creating an account or using the
            platform you agree to be bound by them.
          </p>
        </div>
      </section>

      {/* Body — sidebar + content */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-12 lg:py-16 flex gap-16">

        {/* Sticky TOC sidebar — desktop only */}
        <aside className="hidden lg:block w-56 shrink-0">
          <div className="sticky top-24 space-y-1">
            <div className="text-[9px] tracking-widest text-gray-400 mb-4">CONTENTS</div>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`block text-left w-full text-[11px] tracking-wide py-1.5 px-2 transition-all border-l-2 ${
                  activeId === s.id
                    ? "border-black text-black font-bold"
                    : "border-transparent text-gray-400 hover:text-black hover:border-gray-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 space-y-14">

          {/* Intro */}
          <p className="text-base text-gray-700 leading-relaxed max-w-3xl">
            These Terms and Conditions ("Terms") govern your access to and use of the Cephlow platform
            operated by <span className="font-bold">Cephlow Certificate Authority</span> ("Cephlow",
            "we", "our", or "us") at <span className="font-bold">cephlow.online</span>. If you do not
            agree, do not use the platform.
          </p>

          <hr className="border-gray-200" />

          {/* 01 */}
          <section id="eligibility" className="scroll-mt-24 space-y-4">
            <SectionHead num="01" title="Eligibility & Accounts" />
            <BulletList items={[
              "You must be at least 18 years old and have the legal authority to bind the organisation you represent.",
              "You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.",
              "Each workspace account must be connected to a valid Google account. You are responsible for the Google permissions you grant.",
              "Cephlow reserves the right to suspend or terminate accounts that violate these Terms.",
            ]} />
          </section>

          <hr className="border-gray-200" />

          {/* 02 */}
          <section id="acceptable" className="scroll-mt-24 space-y-4">
            <SectionHead num="02" title="Acceptable Use" />
            <p className="text-sm text-gray-700 leading-relaxed">You agree to use Cephlow only for lawful purposes. You must not:</p>
            <BulletList items={[
              "Generate or distribute fraudulent, forged, or misleading certificates.",
              "Issue certificates for achievements, events, or qualifications that did not occur.",
              "Upload or use recipient data that you do not have the legal right to process.",
              "Send unsolicited bulk messages (spam) via the email or WhatsApp delivery features.",
              "Attempt to circumvent rate limits, abuse the wallet system, or exploit billing errors.",
              "Use the platform to harass, defame, or harm any individual.",
              "Reverse-engineer, decompile, or attempt to extract the source code of the platform.",
              "Resell or sublicense access to Cephlow without written permission.",
            ]} />
          </section>

          <hr className="border-gray-200" />

          {/* 03 */}
          <section id="content" className="scroll-mt-24 space-y-4">
            <SectionHead num="03" title="Certificate Content & Accuracy" />
            <p className="text-sm text-gray-700 leading-relaxed">
              You are solely responsible for the accuracy and legality of:
            </p>
            <BulletList items={[
              "The names, details, and achievements stated on certificates you generate.",
              "The template design, including any logos, seals, or branding you include.",
              "Recipient data imported from Google Sheets.",
              "The event names, dates, and descriptions used as template placeholders.",
            ]} />
            <p className="text-sm text-gray-700 leading-relaxed">
              Cephlow acts as a technical platform only and does not verify the truthfulness of
              certificate content. Any misuse (e.g. fraudulent credentials) is your sole responsibility
              and may be reported to the appropriate authorities.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 04 */}
          <section id="wallet" className="scroll-mt-24 space-y-6">
            <SectionHead num="04" title="Wallet, Credits & Payments" />
            <SubSection title="Prepaid Wallet">
              Cephlow operates on a prepaid credit system. You top up your wallet via Cashfree Payments
              using UPI, cards, or net banking. Credits are deducted at the time of PDF generation and
              certificate delivery.
            </SubSection>
            <SubSection title="Pricing">
              Current rates: <span className="font-bold">₹1.00 per certificate generated</span> and{" "}
              <span className="font-bold">₹0.50 per certificate delivered</span> (WhatsApp or email).
              Prices are subject to change with 14 days' notice posted on the platform.
            </SubSection>
            <SubSection title="Refunds">
              Credits are non-refundable once consumed (generation or delivery attempted). Unused wallet
              balance may be refunded within 30 days of a written request to{" "}
              <span className="font-bold">approvals@cephlow.online</span>, subject to a processing fee.
              Credits never expire.
            </SubSection>
            <SubSection title="Failed Deliveries">
              Delivery credits are consumed when a delivery is attempted, regardless of whether the
              recipient's email or WhatsApp is reachable. Re-delivery consumes additional credits.
            </SubSection>
          </section>

          <hr className="border-gray-200" />

          {/* 05 */}
          <section id="google" className="scroll-mt-24 space-y-4">
            <SectionHead num="05" title="Google Integration & OAuth" />
            <p className="text-sm text-gray-700 leading-relaxed">
              By connecting your Google account you authorise Cephlow to access the specific Google
              services described in our Privacy Policy on your behalf. You may revoke this access at any
              time via your Google Account settings. Revoking access will prevent generation and delivery
              of future batches but will not affect previously issued certificates.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              You are responsible for ensuring that your use of Google services through Cephlow complies
              with Google's Terms of Service. Cephlow is not affiliated with or endorsed by Google LLC.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 06 */}
          <section id="whatsapp" className="scroll-mt-24 space-y-4">
            <SectionHead num="06" title="WhatsApp Delivery" />
            <p className="text-sm text-gray-700 leading-relaxed">
              WhatsApp delivery is powered by the WhatsApp Business API via Meta Platforms. By using
              this feature you confirm that you have obtained the necessary consent from recipients to
              receive messages on WhatsApp. Cephlow is not responsible for delivery failures caused by
              WhatsApp policy changes, account restrictions, or recipient opt-outs.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 07 */}
          <section id="profiles" className="scroll-mt-24 space-y-4">
            <SectionHead num="07" title="Public Profiles & QR Codes" />
            <p className="text-sm text-gray-700 leading-relaxed">
              Issuing a certificate via Cephlow creates a public verification page at{" "}
              <span className="font-bold">cephlow.online/&lt;recipient-username&gt;</span> and embeds a
              QR code in the certificate PDF. These are permanent by design to support lifetime
              certificate verification.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              You must ensure that recipients have consented to the creation of these public pages before
              issuing certificates. Cephlow will delist a profile upon a verified request from the
              certificate recipient.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 08 */}
          <section id="ip" className="scroll-mt-24 space-y-6">
            <SectionHead num="08" title="Intellectual Property" />
            <SubSection title="Your Content">
              You retain ownership of all certificate templates, logos, and content you provide. By
              using Cephlow you grant us a limited, non-exclusive licence to process and store your
              content solely to provide the service.
            </SubSection>
            <SubSection title="Cephlow Platform">
              All rights in the Cephlow platform — including its design, code, trademarks, and branding
              — are owned by Cephlow Certificate Authority. Nothing in these Terms transfers any
              intellectual property rights to you.
            </SubSection>
            <SubSection title="Feedback">
              If you submit feedback, suggestions, or ideas about Cephlow, you grant us a perpetual,
              royalty-free licence to use them without any obligation to compensate you.
            </SubSection>
          </section>

          <hr className="border-gray-200" />

          {/* 09 */}
          <section id="disclaimers" className="scroll-mt-24 space-y-4">
            <SectionHead num="09" title="Disclaimers" />
            <div className="border border-black p-6 space-y-3">
              <p className="text-sm text-gray-700 leading-relaxed">
                THE PLATFORM IS PROVIDED <span className="font-bold">"AS IS"</span> AND{" "}
                <span className="font-bold">"AS AVAILABLE"</span> WITHOUT WARRANTIES OF ANY KIND,
                EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY,
                FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">
                We do not warrant that the platform will be uninterrupted, error-free, or free from
                harmful components, nor do we warrant the accuracy of any certificate content generated.
              </p>
            </div>
          </section>

          <hr className="border-gray-200" />

          {/* 10 */}
          <section id="liability" className="scroll-mt-24 space-y-4">
            <SectionHead num="10" title="Limitation of Liability" />
            <p className="text-sm text-gray-700 leading-relaxed">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, CEPHLOW SHALL NOT BE LIABLE FOR ANY INDIRECT,
              INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO:
            </p>
            <BulletList items={[
              "Loss of data, revenue, or profits.",
              "Failure to deliver certificates due to third-party service outages (Google, WhatsApp, Cloudflare).",
              "Misuse of certificates by recipients or third parties.",
              "Unauthorised access to your account or data.",
              "Changes to Google OAuth or WhatsApp Business API policies that affect delivery.",
            ]} />
            <p className="text-sm text-gray-700 leading-relaxed">
              In any event, our total liability to you shall not exceed the amount you paid to Cephlow
              in the 30 days preceding the claim.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 11 */}
          <section id="indemnification" className="scroll-mt-24 space-y-4">
            <SectionHead num="11" title="Indemnification" />
            <p className="text-sm text-gray-700 leading-relaxed">
              You agree to indemnify and hold harmless Cephlow Certificate Authority and its officers,
              employees, and agents from any claims, losses, damages, or expenses (including reasonable
              legal fees) arising from: (a) your use of the platform; (b) content you submit or
              certificates you generate; (c) your violation of these Terms; or (d) your violation of
              any applicable law.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 12 */}
          <section id="termination" className="scroll-mt-24 space-y-4">
            <SectionHead num="12" title="Suspension & Termination" />
            <BulletList items={[
              "We may suspend or terminate your account immediately if you breach these Terms.",
              "We may discontinue or modify the platform with reasonable notice.",
              "Upon termination, your access to the platform ends, but previously issued certificate verification pages remain live.",
              "You may close your account at any time by contacting approvals@cephlow.online.",
            ]} />
          </section>

          <hr className="border-gray-200" />

          {/* 13 */}
          <section id="governing" className="scroll-mt-24 space-y-4">
            <SectionHead num="13" title="Governing Law & Disputes" />
            <p className="text-sm text-gray-700 leading-relaxed">
              These Terms are governed by the laws of India. Any dispute arising out of or relating to
              these Terms shall first be attempted to be resolved through good-faith negotiation. If
              unresolved, disputes shall be subject to the exclusive jurisdiction of the courts of
              Kerala, India.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 14 */}
          <section id="changes" className="scroll-mt-24 space-y-4">
            <SectionHead num="14" title="Changes to These Terms" />
            <p className="text-sm text-gray-700 leading-relaxed">
              We may update these Terms from time to time. We will notify you of material changes by
              updating the "Last updated" date above and, where appropriate, via email. Continued use
              of Cephlow after changes become effective constitutes acceptance of the revised Terms.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* Contact */}
          <section id="contact" className="scroll-mt-24">
            <div className="border border-black p-8">
              <div className="text-[9px] tracking-widest text-gray-400 mb-3">CONTACT US</div>
              <h2 className="text-xl font-bold mb-4">Questions about these Terms?</h2>
              <div className="space-y-1 text-sm">
                <div className="font-bold">CEPHLOW CERTIFICATE AUTHORITY</div>
                <div className="text-gray-600">approvals@cephlow.online</div>
                <div className="text-gray-600">cephlow.online</div>
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* Footer */}
      <footer className="px-6 lg:px-10 py-8 border-t border-black flex flex-col sm:flex-row items-center justify-between gap-4 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-black flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">C</span>
          </div>
          <span className="font-bold tracking-widest text-xs">CEPHLOW</span>
        </div>
        <div className="text-[10px] text-gray-400 tracking-wider">© 2026 CEPHLOW CERTIFICATE AUTHORITY</div>
        <div className="flex gap-4 text-[10px] text-gray-500 tracking-wider">
          <button onClick={() => navigate("/terms")} className="hover:text-black font-bold text-black">TERMS</button>
          <span>·</span>
          <button onClick={() => navigate("/privacy")} className="hover:text-black">PRIVACY</button>
          <span>·</span>
          <button onClick={() => navigate("/login")} className="hover:text-black">SIGN IN</button>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ num, title }: { num: string; title: string }) {
  return (
    <div>
      <div className="text-[9px] tracking-widest text-gray-400 mb-1">{num}</div>
      <h2 className="text-2xl font-bold">{title}</h2>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-black pl-5 space-y-2">
      <div className="text-[10px] tracking-widest font-bold">{title}</div>
      <div className="text-sm text-gray-700 leading-relaxed">{children}</div>
    </div>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item) => (
        <li key={item} className="flex gap-4 text-sm text-gray-700">
          <span className="text-black font-bold shrink-0 mt-0.5">—</span>
          <span className="leading-relaxed">{item}</span>
        </li>
      ))}
    </ul>
  );
}
