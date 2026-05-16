import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const SECTIONS = [
  { id: "collect", label: "01 · Data We Collect" },
  { id: "use", label: "02 · How We Use It" },
  { id: "sharing", label: "03 · Data Sharing" },
  { id: "profiles", label: "04 · Public Profiles & QR" },
  { id: "retention", label: "05 · Data Retention" },
  { id: "security", label: "06 · Security" },
  { id: "rights", label: "07 · Your Rights" },
  { id: "cookies", label: "08 · Cookies" },
  { id: "children", label: "09 · Children's Privacy" },
  { id: "changes", label: "10 · Changes" },
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

export default function PrivacyPolicy() {
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
        <div className="text-[9px] tracking-widest text-gray-400 hidden sm:block">PRIVACY POLICY</div>
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
          <h1 className="text-4xl lg:text-6xl font-bold mb-6 leading-tight text-white">Privacy Policy</h1>
          <div className="flex flex-wrap gap-6 text-sm text-gray-400">
            <span>Last updated: <span className="text-white font-bold">06 May 2026</span></span>
            <span>·</span>
            <span>Effective: <span className="text-white font-bold">06 May 2026</span></span>
          </div>
          <p className="mt-8 text-base text-gray-400 max-w-2xl leading-relaxed">
            This policy explains what data Cephlow collects, how it is used, and your rights. By using
            the platform you agree to the practices described here.
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
            Cephlow Certificate Authority ("Cephlow", "we", "our", or "us") operates the platform at{" "}
            <span className="font-bold">cephlow.online</span>. We are committed to protecting your personal
            data and being transparent about how we use it.
          </p>

          <hr className="border-gray-200" />

          {/* 01 */}
          <section id="collect" className="scroll-mt-24 space-y-6">
            <SectionHead num="01" title="Data We Collect" />
            <SubSection title="Account & Identity">
              When you sign in we receive your email address and profile information. We store these in
              Supabase Auth to identify your account and workspace.
            </SubSection>
            <SubSection title="Google Workspace Data">
              <p>To automate certificate generation you grant Cephlow access to specific Google services:</p>
              <div className="mt-4 space-y-3">
                {[
                  ["Google Sheets", "Read recipient data (names, emails, event details) from spreadsheets you select."],
                  ["Google Slides", "Read certificate templates from presentations you select; create personalised copies."],
                  ["Google Drive", "Store generated certificate PDFs in your Drive in batch-specific folders."],
                  ["Amazon SES (email)", "Send personalised emails with certificate PDFs attached via our own sending infrastructure."],
                ].map(([svc, desc]) => (
                  <div key={svc} className="flex gap-4 items-start">
                    <span className="border border-black px-2 py-0.5 text-[9px] tracking-widest font-bold shrink-0 mt-0.5">{svc}</span>
                    <span className="text-sm text-gray-600 leading-relaxed">{desc}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-gray-500">
                We access only the specific files you choose during batch creation. We do not scan, index,
                or retain any other Drive or Sheets content.
              </p>
            </SubSection>
            <SubSection title="Recipient Data">
              Recipient information (names, phone numbers, email addresses) is read from your spreadsheet
              at generation time and used solely to personalise and deliver certificates. Recipient data
              is never sold or shared with third parties.
            </SubSection>
            <SubSection title="Usage & Technical Data">
              We collect standard server logs (IP address, browser type, pages visited, timestamps) for
              security, debugging, and abuse prevention. We do not use third-party advertising trackers.
            </SubSection>
            <SubSection title="Payment Data">
              Wallet top-ups are processed by Cashfree Payments. We receive only a transaction reference
              and the credited amount; we never see or store your card or UPI details.
            </SubSection>
          </section>

          <hr className="border-gray-200" />

          {/* 02 */}
          <section id="use" className="scroll-mt-24 space-y-4">
            <SectionHead num="02" title="How We Use Your Data" />
            <BulletList items={[
              "Authenticate you and manage your workspace.",
              "Generate personalised certificate PDFs from your templates and recipient lists.",
              "Deliver certificates via email (Amazon SES) and WhatsApp Business API.",
              "Store PDFs on Cloudflare R2 (edge CDN) so WhatsApp and verification links work reliably.",
              "Inject unique QR codes linking to public verification pages.",
              "Maintain public student profile pages showing certificates issued to each recipient.",
              "Process wallet transactions and maintain credit balances.",
              "Send transactional notifications about batch status and account activity.",
              "Improve the platform through aggregate, anonymised analytics.",
            ]} />
          </section>

          <hr className="border-gray-200" />

          {/* 03 */}
          <section id="sharing" className="scroll-mt-24 space-y-4">
            <SectionHead num="03" title="Data Sharing & Third-Party Services" />
            <p className="text-sm text-gray-700 leading-relaxed">
              We share data only as necessary to deliver the service:
            </p>
            <div className="border border-black overflow-hidden">
              <div className="grid grid-cols-2 bg-black text-white text-[10px] tracking-widest px-5 py-3">
                <span>PARTY</span>
                <span>PURPOSE</span>
              </div>
              {[
                ["Google LLC", "OAuth authentication, Sheets / Slides / Drive access"],
                ["Amazon Web Services (SES)", "Transactional email delivery"],
                ["Cloudflare Inc. (R2)", "PDF storage and public CDN delivery"],
                ["Meta Platforms (WhatsApp Business API)", "Certificate delivery via WhatsApp"],
                ["Cashfree Payments India", "Wallet top-up and payment processing"],
                ["Supabase", "Authentication and user session management"],
              ].map(([party, purpose], i) => (
                <div key={party} className={`grid grid-cols-2 px-5 py-3 border-t border-gray-200 text-sm ${i % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
                  <span className="font-bold pr-4">{party}</span>
                  <span className="text-gray-600">{purpose}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              We do not sell, rent, or trade your personal data to advertisers or data brokers.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 04 */}
          <section id="profiles" className="scroll-mt-24 space-y-4">
            <SectionHead num="04" title="Public Profiles & QR Verification" />
            <p className="text-sm text-gray-700 leading-relaxed">
              Each certificate recipient gets a public profile page at{" "}
              <span className="font-bold">cephlow.online/&lt;username&gt;</span> and a unique QR code
              embedded in their certificate PDF. These pages allow anyone to verify authenticity without
              logging in.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              Public profiles display only the recipient's name and the certificates you have issued to
              them through Cephlow. If a recipient wishes to have their profile delisted, they may
              contact us at <span className="font-bold">approvals@cephlow.online</span>.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 05 */}
          <section id="retention" className="scroll-mt-24 space-y-4">
            <SectionHead num="05" title="Data Retention" />
            <BulletList items={[
              "Account data is retained for as long as your account is active.",
              "Certificate PDFs stored on Cloudflare R2 are retained indefinitely to support QR code verification links.",
              "Google OAuth tokens (refresh tokens) are stored encrypted and deleted when you disconnect your Google account.",
              "Batch logs and recipient lists are retained to support re-delivery and dispute resolution.",
              "You may request deletion of your account and associated data at any time (see Your Rights).",
            ]} />
          </section>

          <hr className="border-gray-200" />

          {/* 06 */}
          <section id="security" className="scroll-mt-24 space-y-4">
            <SectionHead num="06" title="Security" />
            <p className="text-sm text-gray-700 leading-relaxed">
              All data is transmitted over HTTPS. Google OAuth refresh tokens are stored encrypted at rest
              on our server. Certificate PDFs on Cloudflare R2 are served over HTTPS with unique, random
              identifiers. We follow Google's OAuth policy and never request more scopes than are required
              for the features you use.
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">
              No system is perfectly secure. If you discover a security issue please report it responsibly
              to <span className="font-bold">approvals@cephlow.online</span>.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 07 */}
          <section id="rights" className="scroll-mt-24 space-y-4">
            <SectionHead num="07" title="Your Rights" />
            <p className="text-sm text-gray-700 leading-relaxed">
              Depending on your jurisdiction you may have the right to:
            </p>
            <BulletList items={[
              "Access the personal data we hold about you.",
              "Correct inaccurate or incomplete data.",
              "Request deletion of your account and personal data.",
              "Withdraw your Google OAuth consent via your Google Account settings.",
              "Object to or restrict certain processing activities.",
              "Receive a copy of your data in a portable format.",
            ]} />
            <p className="text-sm text-gray-700 leading-relaxed">
              To exercise any of these rights, email{" "}
              <span className="font-bold">approvals@cephlow.online</span>. We will respond within 30 days.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 08 */}
          <section id="cookies" className="scroll-mt-24 space-y-4">
            <SectionHead num="08" title="Cookies & Local Storage" />
            <p className="text-sm text-gray-700 leading-relaxed">
              Cephlow uses browser localStorage and session storage to persist authentication state and
              user preferences. We do not use advertising cookies or cross-site tracking cookies.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 09 */}
          <section id="children" className="scroll-mt-24 space-y-4">
            <SectionHead num="09" title="Children's Privacy" />
            <p className="text-sm text-gray-700 leading-relaxed">
              Cephlow is intended for organisations and their administrators (aged 18+). We do not
              knowingly collect personal data from children under 13. If you believe a child has provided
              us data, contact us immediately at{" "}
              <span className="font-bold">approvals@cephlow.online</span>.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* 10 */}
          <section id="changes" className="scroll-mt-24 space-y-4">
            <SectionHead num="10" title="Changes to This Policy" />
            <p className="text-sm text-gray-700 leading-relaxed">
              We may update this Privacy Policy from time to time. Material changes will be communicated
              by updating the "Last updated" date above and, where appropriate, by email. Continued use
              of Cephlow after changes take effect constitutes acceptance of the updated policy.
            </p>
          </section>

          <hr className="border-gray-200" />

          {/* Contact */}
          <section id="contact" className="scroll-mt-24">
            <div className="border border-black p-8">
              <div className="text-[9px] tracking-widest text-gray-400 mb-3">CONTACT US</div>
              <h2 className="text-xl font-bold mb-4">Questions about this policy?</h2>
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
          <button onClick={() => navigate("/terms")} className="hover:text-black">TERMS</button>
          <span>·</span>
          <button onClick={() => navigate("/privacy")} className="hover:text-black font-bold text-black">PRIVACY</button>
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
