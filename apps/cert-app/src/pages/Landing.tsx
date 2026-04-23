import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setInView(true);
    }, { threshold });
    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold]);
  return { ref, inView };
}

// ── Animated mockup: Dashboard ───────────────────────────────────────────────
function DashboardMockup() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const target = 167;
    let current = 0;
    const step = Math.ceil(target / 40);
    const interval = setInterval(() => {
      current = Math.min(current + step, target);
      setCount(current);
      if (current >= target) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="border border-black bg-white font-mono text-xs overflow-hidden shadow-lg">
      {/* Top bar */}
      <div className="border-b border-black px-4 py-2 flex items-center justify-between bg-black text-white">
        <span className="text-[10px] tracking-widest">CEPHLOW AUTOMATION</span>
        <div className="flex gap-1">
          <div className="w-2 h-2 rounded-full bg-white opacity-30" />
          <div className="w-2 h-2 rounded-full bg-white opacity-30" />
          <div className="w-2 h-2 rounded-full bg-white" />
        </div>
      </div>
      {/* Stats row */}
      <div className="grid grid-cols-3 border-b border-black">
        {[["TOTAL BATCHES", "9"], ["CERTS GENERATED", String(count)], ["SUCCESSFULLY SENT", "166"]].map(([label, val]) => (
          <div key={label} className="px-4 py-3 border-r border-black last:border-r-0">
            <div className="text-[9px] tracking-widest text-gray-500 mb-1">{label}</div>
            <div className="text-xl font-bold">{val}</div>
          </div>
        ))}
      </div>
      {/* Recent batches */}
      <div className="px-4 pt-3 pb-1">
        <div className="text-[9px] tracking-widest text-gray-500 mb-2">RECENT BATCHES</div>
        {[
          ["PROTOTYPE 2.0", "56 / 56", "SENT"],
          ["XCEPTHON COORDINATOR", "22 / 22", "SENT"],
          ["XCEPTHON WINNERS", "11 / 11", "SENT"],
        ].map(([name, prog, status]) => (
          <div key={name} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
            <span className="font-bold text-[10px]">{name}</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-[9px]">{prog}</span>
              <span className="bg-black text-white text-[8px] px-1.5 py-0.5">{status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Animated mockup: Verification page ──────────────────────────────────────
function VerifyMockup() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="border border-black bg-white font-mono text-xs overflow-hidden shadow-lg">
      <div className="border-b border-black px-4 py-2 bg-black text-white text-center">
        <div className="text-[9px] tracking-widest">CERTIFICATE VERIFICATION</div>
        <div className="text-[8px] text-gray-400">OFFICIAL VERIFICATION PORTAL</div>
      </div>
      <div
        className="m-3 border border-black p-3 transition-all duration-700"
        style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(8px)" }}
      >
        <div className="flex items-center gap-2 mb-3 bg-black text-white px-2 py-1.5">
          <span className="text-[9px]">✓</span>
          <div>
            <div className="text-[9px] font-bold tracking-widest">CERTIFICATE VERIFIED</div>
            <div className="text-[8px] text-gray-300">Authentic and successfully validated.</div>
          </div>
          <span className="ml-auto border border-white text-[8px] px-1">VALID</span>
        </div>
        {[["RECIPIENT", "Adithyan B Raj"], ["ISSUED FOR", "Xcepthon Coordinator"], ["ISSUE DATE", "Apr 3, 2026"]].map(([label, val]) => (
          <div key={label} className="flex items-center gap-2 border border-black px-2 py-1.5 mb-1.5">
            <div>
              <div className="text-[8px] text-gray-500 tracking-wider">{label}</div>
              <div className="text-[10px] font-bold">{val}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Interactive WhatsApp demo ────────────────────────────────────────────────
type WaMsg = {
  id: number;
  from: 'bot' | 'user';
  text: string;
  quickReplies?: string[];
  showChoose?: boolean;
  certFile?: string;
  time: string;
};

const WA_CERTS = [
  "Adithyan_Prototype_Test.pdf",
  "_trial 3_Adithyan.pdf",
  "Adithyan_B_Raj__Xcepthon_Winners.pdf",
  "Adithyan_B_Raj_Xcepthon_honors_cert.pdf",
  "aDITHYAN_b_rAJ_xbxcbc.pdf",
];

function waTime() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function WhatsAppInteractive() {
  const { ref: sectionRef, inView } = useInView(0.2);
  const started = useRef(false);
  const [messages, setMessages] = useState<WaMsg[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [certPickerOpen, setCertPickerOpen] = useState(false);
  const [selectedCert, setSelectedCert] = useState('');
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!inView || started.current) return;
    started.current = true;
    setTimeout(() => {
      setMessages([{
        id: 1, from: 'bot', time: waTime(),
        text: 'Hi\nWhat do you want to do?',
        quickReplies: ['Send all cert', 'Search a cert', 'Report Issue'],
      }]);
    }, 600);
  }, [inView]);

  useEffect(() => {
    const el = chatRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, typing, certPickerOpen]);

  function botReply(msg: Omit<WaMsg, 'id' | 'time'>, delay = 1000) {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMessages(prev => [...prev, { ...msg, id: Date.now(), time: waTime() }]);
    }, delay);
  }

  function handleUserSend(text: string) {
    if (!text.trim()) return;
    setMessages(prev => [...prev, { id: Date.now(), from: 'user', text, time: waTime() }]);
    setInput('');
    const lower = text.toLowerCase().trim();
    if (lower === 'search a cert' || lower === '/cert' || lower === 'search') {
      botReply({ from: 'bot', text: 'Select a certificate to receive:', showChoose: true });
    } else if (lower === 'send all cert' || lower === 'send all') {
      botReply({ from: 'bot', text: 'Sending all 4 of your certificates...' }, 900);
      setTimeout(() => botReply({ from: 'bot', text: 'All certificates sent successfully.' }, 2500), 1000);
    } else if (lower.includes('report') || lower.includes('issue')) {
      botReply({ from: 'bot', text: 'Please describe your issue and our team will get back to you shortly.' });
    } else {
      botReply({
        from: 'bot',
        text: 'Hi\nWhat do you want to do?',
        quickReplies: ['Send all cert', 'Search a cert', 'Report Issue'],
      });
    }
  }

  function handleCertConfirm() {
    if (!selectedCert) return;
    setCertPickerOpen(false);
    setMessages(prev => [...prev, { id: Date.now(), from: 'user', text: selectedCert, time: waTime() }]);
    const name = selectedCert.replace('.pdf', '').replace(/_/g, ' ');
    setSelectedCert('');
    botReply({
      from: 'bot',
      certFile: selectedCert,
      text: `Hi Adithyan, your certificate for ${name} is attached.\n\nSend /cert anytime to get it again.\n\nView all your certificates at cephlow.online/adithyanbraj`,
    }, 1400);
  }

  return (
    <div ref={sectionRef} className="w-full max-w-sm mx-auto font-mono">
      <div className="border-2 border-black bg-white overflow-hidden shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] relative">

        {/* Header */}
        <div className="bg-black px-4 py-3 flex items-center gap-3">
          <div className="w-7 h-7 border border-white flex items-center justify-center shrink-0">
            <span className="text-white text-[10px] font-bold">C</span>
          </div>
          <div className="flex-1">
            <div className="text-white text-[11px] font-bold tracking-widest">CEPHLOW BOT</div>
            <div className="text-gray-400 text-[8px] tracking-wider">WHATSAPP · ONLINE</div>
          </div>
          <span className="text-gray-400 text-xs">⋮</span>
        </div>

        {/* Chat area */}
        <div ref={chatRef} className="overflow-y-auto px-3 py-4 space-y-3 bg-white" style={{ height: 400 }}>
          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.from === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[82%] space-y-1">
                {msg.from === 'bot' ? (
                  <div className="border border-black bg-white p-2.5 border-l-4">
                    {msg.certFile && (
                      <div className="border border-black flex items-center gap-2 p-2 mb-2 bg-gray-50">
                        <div className="w-8 h-8 bg-black flex items-center justify-center shrink-0">
                          <span className="text-white text-[7px] font-bold">PDF</span>
                        </div>
                        <div>
                          <div className="text-[8px] font-bold truncate" style={{ maxWidth: 140 }}>{msg.certFile}</div>
                          <div className="text-gray-500 text-[7px]">344 kB · PDF</div>
                        </div>
                      </div>
                    )}
                    <div className="text-[10px] text-black whitespace-pre-line leading-relaxed">{msg.text}</div>
                    <div className="text-[8px] text-gray-400 mt-1.5">{msg.time}</div>
                  </div>
                ) : (
                  <div className="bg-black p-2.5">
                    <div className="text-[10px] text-white whitespace-pre-line leading-relaxed">{msg.text}</div>
                    <div className="text-[8px] text-gray-400 mt-1.5 text-right">{msg.time} ✓✓</div>
                  </div>
                )}
                {msg.quickReplies && (
                  <div className="space-y-1 mt-1">
                    {msg.quickReplies.map(qr => (
                      <button
                        key={qr}
                        onClick={() => handleUserSend(qr)}
                        className="w-full text-center text-[9px] px-2 py-1.5 border border-black tracking-wider hover:bg-black hover:text-white transition-colors"
                      >
                        {qr}
                      </button>
                    ))}
                  </div>
                )}
                {msg.showChoose && (
                  <button
                    onClick={() => setCertPickerOpen(true)}
                    className="w-full text-center text-[9px] px-2 py-1.5 border border-black tracking-wider hover:bg-black hover:text-white transition-colors mt-1"
                  >
                    CHOOSE CERTIFICATE
                  </button>
                )}
              </div>
            </div>
          ))}
          {typing && (
            <div className="flex items-center gap-1 border border-black border-l-4 px-3 py-2.5 w-fit bg-white">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1.5 h-1.5 bg-black animate-bounce" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          )}
        </div>

        {/* Cert picker panel */}
        {certPickerOpen && (
          <div className="absolute inset-0 z-10 flex flex-col justify-end bg-black bg-opacity-60">
            <div className="bg-white border-t-2 border-black">
              <div className="flex items-center justify-between px-4 py-3 border-b border-black">
                <button onClick={() => { setCertPickerOpen(false); setSelectedCert(''); }} className="text-xs tracking-wider hover:underline">CANCEL</button>
                <span className="text-[10px] font-bold tracking-widest">SELECT CERTIFICATE</span>
                <div className="w-12" />
              </div>
              <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
                {WA_CERTS.map(cert => (
                  <button
                    key={cert}
                    onClick={() => setSelectedCert(cert)}
                    className={`w-full flex items-center justify-between px-4 py-3 border-b border-gray-200 text-left transition-colors ${selectedCert === cert ? 'bg-black text-white' : 'bg-white hover:bg-gray-50'}`}
                  >
                    <div>
                      <div className="text-[10px] font-bold truncate" style={{ maxWidth: 210 }}>{cert.replace('.pdf', '')}</div>
                      <div className="text-[8px] opacity-50">{cert}</div>
                    </div>
                    {selectedCert === cert && <span className="text-xs shrink-0">✓</span>}
                  </button>
                ))}
              </div>
              <div className="p-3 border-t border-black">
                <button
                  onClick={handleCertConfirm}
                  disabled={!selectedCert}
                  className="w-full py-3 bg-black text-white text-xs tracking-widest font-bold disabled:opacity-30 hover:bg-gray-800 transition-colors"
                >
                  SEND
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Input bar */}
        <div className="border-t-2 border-black flex items-center">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleUserSend(input)}
            placeholder="Type a message..."
            className="flex-1 px-4 py-3 text-[11px] outline-none bg-white placeholder-gray-400 font-mono"
          />
          <button
            onClick={() => handleUserSend(input)}
            className="border-l-2 border-black bg-black text-white px-4 py-3 text-xs tracking-wider hover:bg-gray-800 transition-colors shrink-0"
          >
            SEND
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Animated mockup: Student profile ────────────────────────────────────────
function ProfileMockup() {
  return (
    <div className="border border-black bg-white font-mono text-xs overflow-hidden shadow-lg">
      <div className="px-4 pt-4 pb-3 border-b border-black flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-black text-white flex items-center justify-center font-bold text-sm">AB</div>
        <div>
          <div className="font-bold text-sm tracking-widest">ADITHYAN B RAJ</div>
          <div className="text-[9px] text-gray-500">@adithyanbraj</div>
          <div className="text-[9px] text-gray-500">1 certificate issued</div>
        </div>
      </div>
      <div className="px-4 pt-3 pb-4">
        <div className="text-[9px] tracking-widest text-gray-500 mb-2">CERTIFICATES</div>
        <div className="border border-black p-3">
          <div className="flex justify-between items-start mb-2">
            <div className="w-6 h-6 border border-black flex items-center justify-center text-[10px]">🏅</div>
            <span className="border border-black text-[8px] px-1 py-0.5">Generated</span>
          </div>
          <div className="font-bold text-[10px] mb-1">Xcepthon Coordinator</div>
          <div className="text-[9px] text-gray-500 mb-2">Apr 3, 2026</div>
          <div className="flex gap-1">
            <button className="bg-black text-white text-[8px] px-2 py-1">↗ View</button>
            <button className="border border-black text-[8px] px-2 py-1">Verify</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay }: { icon: string; title: string; desc: string; delay: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className="border border-black p-5 transition-all duration-500"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(20px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      <div className="text-2xl mb-3">{icon}</div>
      <div className="font-bold text-sm tracking-wider mb-1 font-mono">{title}</div>
      <div className="text-xs text-gray-600 leading-relaxed font-mono">{desc}</div>
    </div>
  );
}

// ── Step card ────────────────────────────────────────────────────────────────
function StepCard({ num, title, desc, delay }: { num: string; title: string; desc: string; delay: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className="flex gap-4 transition-all duration-500"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateX(0)" : "translateX(-20px)",
        transitionDelay: `${delay}ms`,
      }}
    >
      <div className="w-8 h-8 border-2 border-black flex items-center justify-center font-bold font-mono shrink-0">{num}</div>
      <div>
        <div className="font-bold font-mono text-sm mb-1">{title}</div>
        <div className="text-xs text-gray-600 font-mono leading-relaxed">{desc}</div>
      </div>
    </div>
  );
}

// ── Main landing page ────────────────────────────────────────────────────────
export default function Landing() {
  const [, navigate] = useLocation();
  const [typedText, setTypedText] = useState("");
  const fullText = "Generate. Verify. Deliver.";
  const heroRef = useRef<HTMLDivElement>(null);
  const { ref: featuresRef, inView: featuresInView } = useInView();
  const { ref: howRef, inView: howInView } = useInView();
  const { ref: screenshotsRef, inView: screenshotsInView } = useInView();
  const { ref: ctaRef, inView: ctaInView } = useInView();

  // Typewriter effect
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setTypedText(fullText.slice(0, i + 1));
      i++;
      if (i >= fullText.length) clearInterval(interval);
    }, 60);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-white font-mono">

      {/* ── Nav ── */}
      <nav className="border-b border-black px-6 py-4 flex items-center justify-between sticky top-0 bg-white z-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-black flex items-center justify-center">
            <span className="text-white text-[10px] font-bold">C</span>
          </div>
          <span className="font-bold tracking-widest text-sm">CEPHLOW</span>
          <span className="text-[9px] text-gray-400 tracking-widest">AUTOMATION</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/login")}
            className="text-xs tracking-wider border border-black px-4 py-2 hover:bg-black hover:text-white transition-colors"
          >
            SIGN IN
          </button>
          <button
            onClick={() => document.getElementById("request-access")?.scrollIntoView({ behavior: "smooth" })}
            className="text-xs tracking-wider bg-black text-white px-4 py-2 hover:bg-gray-800 transition-colors"
          >
            REQUEST ACCESS
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section ref={heroRef} className="border-b border-black">
        <div className="max-w-6xl mx-auto px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="flex flex-wrap gap-2 mb-6">
              <div className="text-[10px] tracking-widest text-gray-500 border border-gray-300 inline-block px-3 py-1">
                CERTIFICATE AUTOMATION PLATFORM
              </div>
              <div className="text-[10px] tracking-widest text-green-700 border border-green-400 bg-green-50 inline-flex items-center gap-1.5 px-3 py-1">
                <span>📱</span> RETRIEVE CERTIFICATES INSTANTLY ON WHATSAPP
              </div>
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-2">
              Issue Certificates.<br />Give Recipients a<br />Lifetime Credential.
            </h1>
            <div className="h-8 mb-6">
              <p className="text-gray-500 text-sm tracking-wider">
                {typedText}
                <span className="animate-pulse">|</span>
              </p>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed mb-8 max-w-md">
              Merge Google Sheets data into Google Slides templates. Generate hundreds of personalised certificates and deliver them via WhatsApp or email — in minutes.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => document.getElementById("request-access")?.scrollIntoView({ behavior: "smooth" })}
                className="bg-black text-white text-xs tracking-wider px-6 py-3 hover:bg-gray-800 transition-colors"
              >
                REQUEST ACCESS →
              </button>
              <button
                onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
                className="border border-black text-xs tracking-wider px-6 py-3 hover:bg-gray-50 transition-colors"
              >
                SEE HOW IT WORKS
              </button>
            </div>
            {/* Social proof */}
            <div className="flex gap-6 mt-10 pt-8 border-t border-gray-200">
              {[["167+", "Certificates issued"], ["4", "Events completed"], ["100%", "Delivery rate"]].map(([val, label]) => (
                <div key={label}>
                  <div className="text-xl font-bold">{val}</div>
                  <div className="text-[10px] text-gray-500 tracking-wider">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero mockup */}
          <div className="relative">
            <div className="absolute -top-4 -left-4 w-full h-full border border-gray-200" />
            <DashboardMockup />
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" className="border-b border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div
            ref={howRef}
            className="transition-all duration-500"
            style={{ opacity: howInView ? 1 : 0, transform: howInView ? "translateY(0)" : "translateY(20px)" }}
          >
            <div className="text-[10px] tracking-widest text-gray-500 mb-2">WORKFLOW</div>
            <h2 className="text-2xl font-bold mb-10">How it works</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-12 items-start">
            <div className="space-y-8">
              <StepCard num="1" title="Design your template" desc="Create or upload a Google Slides template. Add placeholders like <<Name>>, <<Email>>, <<Event>> — Cephlow detects them automatically." delay={0} />
              <StepCard num="2" title="Connect your spreadsheet" desc="Link a Google Sheet with your recipients' data. Map columns to template placeholders in a few clicks." delay={100} />
              <StepCard num="3" title="Generate & deliver" desc="Hit generate. Cephlow creates personalised PDFs for every recipient and delivers them via WhatsApp, email, or both. Each certificate gets a unique verification link." delay={200} />
              <StepCard num="4" title="Recipients verify anywhere" desc="Every certificate has a public profile page and QR code. Scan to verify — no login required." delay={300} />
            </div>
            <div className="space-y-4">
              <div className="text-[9px] tracking-widest text-gray-400 mb-2">BATCH SETUP — 6 SIMPLE STEPS</div>
              {/* Batch stepper mockup */}
              <div className="border border-black p-4 bg-white">
                <div className="flex items-center gap-1 mb-4">
                  {[1,2,3,4,5,6].map(n => (
                    <div key={n} className="flex items-center gap-1">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${n === 1 ? "border-black bg-black text-white" : "border-gray-300 text-gray-400"}`}>
                        {n}
                      </div>
                      {n < 6 && <div className={`w-4 h-px ${n === 1 ? "bg-black" : "bg-gray-200"}`} />}
                    </div>
                  ))}
                </div>
                <div className="text-[9px] tracking-widest mb-3 font-bold">NAME THIS BATCH</div>
                <div className="border border-black px-3 py-2 text-[10px] text-gray-400 mb-3">e.g. Xcepthon 2026 Participants</div>
                <div className="flex justify-end">
                  <div className="bg-black text-white text-[9px] px-3 py-1.5">NEXT STEP &gt;</div>
                </div>
              </div>
              {/* Template picker mockup */}
              <div className="border border-black p-4 bg-white">
                <div className="text-[9px] tracking-widest mb-3 text-gray-500">SELECT AN EXISTING GOOGLE SLIDE</div>
                <div className="grid grid-cols-2 gap-2">
                  {["Participation Cert", "Winners Cert", "Coordinator Cert", "Honours Cert"].map((name, i) => (
                    <div key={name} className={`border p-2 ${i === 0 ? "border-black" : "border-gray-200"}`}>
                      <div className="h-10 mb-1 flex items-center justify-center" style={{ background: i % 2 === 0 ? "#3d1a8e" : "#1a3d8e" }}>
                        <span className="text-white text-[8px]">CERTIFICATE</span>
                      </div>
                      <div className="text-[8px] truncate">{name}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── WhatsApp Bot ── */}
      <section className="border-b border-black bg-white">
        <div className="max-w-6xl mx-auto px-6 py-16 grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="text-[10px] tracking-widest text-gray-500 mb-2">WHATSAPP BOT — TRY IT</div>
            <h2 className="text-2xl font-bold mb-4">
              Your certificate,<br />one message away.
            </h2>
            <p className="text-sm text-gray-600 leading-relaxed mb-8 font-mono">
              Recipients message the Cephlow bot on WhatsApp, pick their certificate from a list, and receive the PDF instantly. No app. No account. No friction.
            </p>
            <ul className="space-y-3">
              {[
                ["SEND ALL CERT", "Get every certificate issued to you in one tap"],
                ["SEARCH A CERT", "Pick a specific event from your history"],
                ["/CERT", "Resend any certificate anytime with a command"],
                ["PROFILE LINK", "Bot shares your public cephlow.online page"],
              ].map(([title, desc]) => (
                <li key={title} className="flex gap-3 text-xs font-mono items-start">
                  <span className="border border-black px-2 py-1 font-bold text-[9px] tracking-wider shrink-0 mt-0.5">{title}</span>
                  <span className="text-gray-600 leading-relaxed">{desc}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-center relative">
            <WhatsAppInteractive />
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="border-b border-black bg-black text-white">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div
            ref={featuresRef}
            className="transition-all duration-500 mb-10"
            style={{ opacity: featuresInView ? 1 : 0, transform: featuresInView ? "translateY(0)" : "translateY(20px)" }}
          >
            <div className="text-[10px] tracking-widest text-gray-400 mb-2">CAPABILITIES</div>
            <h2 className="text-2xl font-bold">Everything you need</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-gray-700">
            {[
              ["📊", "Google Sheets integration", "Pull recipient data directly from any Google Sheet. Map any column to any placeholder."],
              ["🎨", "Google Slides templates", "Use your existing Slides design. Single template or multiple designs per category."],
              ["📱", "WhatsApp delivery", "Send personalised PDF certificates via WhatsApp Business API to each recipient."],
              ["✉️", "Email delivery", "Send via Gmail with custom subject and body. HTML email with PDF attached."],
              ["🔒", "Tamper-proof verification", "Every certificate has a unique verification URL and QR code. Public, no login needed."],
              ["👤", "Student profiles", "Each recipient gets a public profile page showing all their certificates across all events."],
              ["💳", "Prepaid wallet", "Top up credits, pay per generation. Transparent pricing, no surprises."],
              ["📁", "PPTX upload", "Already have a PowerPoint template? Upload it — converted to Google Slides automatically."],
              ["📈", "Batch analytics", "Track generated, sent, failed counts per batch. WhatsApp delivery status in real-time."],
            ].map(([icon, title, desc], i) => (
              <div key={title as string} className="bg-black p-5 border border-gray-800 hover:border-white transition-colors group">
                <div className="text-xl mb-3">{icon}</div>
                <div className="font-bold text-sm tracking-wider mb-1 group-hover:text-white">{title as string}</div>
                <div className="text-xs text-gray-400 leading-relaxed">{desc as string}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Screenshots ── */}
      <section className="border-b border-black">
        <div className="max-w-6xl mx-auto px-6 py-16">
          <div
            ref={screenshotsRef}
            className="transition-all duration-500 mb-10"
            style={{ opacity: screenshotsInView ? 1 : 0, transform: screenshotsInView ? "translateY(0)" : "translateY(20px)" }}
          >
            <div className="text-[10px] tracking-widest text-gray-500 mb-2">PRODUCT</div>
            <h2 className="text-2xl font-bold">Built for organisations,<br />loved by recipients.</h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Left: verification */}
            <div
              className="transition-all duration-700"
              style={{
                opacity: screenshotsInView ? 1 : 0,
                transform: screenshotsInView ? "translateX(0)" : "translateX(-30px)",
                transitionDelay: "100ms",
              }}
            >
              <div className="text-xs font-bold tracking-wider mb-3">INSTANT VERIFICATION</div>
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                Scan the QR code on any certificate. Anyone can verify in seconds — no account, no app, no friction.
              </p>
              <VerifyMockup />
            </div>

            {/* Right: profile */}
            <div
              className="transition-all duration-700"
              style={{
                opacity: screenshotsInView ? 1 : 0,
                transform: screenshotsInView ? "translateX(0)" : "translateX(30px)",
                transitionDelay: "200ms",
              }}
            >
              <div className="text-xs font-bold tracking-wider mb-3">STUDENT PROFILE PAGE</div>
              <p className="text-xs text-gray-600 mb-4 leading-relaxed">
                Every recipient gets a shareable profile URL. All their certificates in one place — perfect for LinkedIn or resumes.
              </p>
              <ProfileMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section className="border-b border-black bg-gray-50">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <div className="text-[10px] tracking-widest text-gray-500 mb-2">PRICING</div>
          <h2 className="text-2xl font-bold mb-3">Simple, transparent pricing</h2>
          <p className="text-sm text-gray-600 mb-10">Pay only for what you generate. No monthly fees, no surprises.</p>
          <div className="grid sm:grid-cols-2 gap-6 text-left">
            <div className="border-2 border-black p-6 bg-white">
              <div className="text-[10px] tracking-widest text-gray-500 mb-1">GENERATION</div>
              <div className="text-3xl font-bold mb-1">₹1<span className="text-sm font-normal text-gray-500">/cert</span></div>
              <div className="text-xs text-gray-500 mb-4">Includes PDF generation, R2 storage, verification link</div>
              <ul className="space-y-2 text-xs">
                {["Google Slides → PDF", "Cloudflare R2 storage", "Unique verification URL", "Student profile update", "QR code on certificate"].map(f => (
                  <li key={f} className="flex items-center gap-2"><span>✓</span>{f}</li>
                ))}
              </ul>
            </div>
            <div className="border border-black p-6 bg-white">
              <div className="text-[10px] tracking-widest text-gray-500 mb-1">DELIVERY</div>
              <div className="text-3xl font-bold mb-1">₹0.50<span className="text-sm font-normal text-gray-500">/send</span></div>
              <div className="text-xs text-gray-500 mb-4">WhatsApp or Email delivery per recipient</div>
              <ul className="space-y-2 text-xs">
                {["WhatsApp Business delivery", "Gmail email delivery", "Personalised message", "Delivery status tracking", "Retry on failure"].map(f => (
                  <li key={f} className="flex items-center gap-2"><span>✓</span>{f}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="text-xs text-gray-400 mt-6">Credits never expire. Top up anytime via UPI, cards, or net banking.</p>
        </div>
      </section>

      {/* ── Request access CTA ── */}
      <section id="request-access" className="border-b border-black bg-black text-white">
        <div
          ref={ctaRef}
          className="max-w-2xl mx-auto px-6 py-20 text-center transition-all duration-700"
          style={{ opacity: ctaInView ? 1 : 0, transform: ctaInView ? "translateY(0)" : "translateY(30px)" }}
        >
          <div className="text-[10px] tracking-widest text-gray-400 mb-3">GET STARTED</div>
          <h2 className="text-3xl font-bold mb-4">Ready to automate<br />your certificates?</h2>
          <p className="text-sm text-gray-400 mb-8">
            Cephlow is currently invite-only for organisations. Request access and we'll get you set up within 24 hours.
          </p>
          <a
            href="https://wa.me/919188501611?text=Hi%2C%20I%27d%20like%20to%20request%20access%20to%20Cephlow%20for%20my%20organisation."
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-white text-black text-xs tracking-wider px-8 py-4 hover:bg-gray-100 transition-colors font-bold"
          >
            REQUEST ACCESS VIA WHATSAPP →
          </a>
          <div className="mt-4">
            <button
              onClick={() => navigate("/login")}
              className="text-xs text-gray-500 hover:text-white transition-colors underline underline-offset-4"
            >
              Already have access? Sign in
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="px-6 py-8 border-t border-black flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-black flex items-center justify-center">
            <span className="text-white text-[9px] font-bold">C</span>
          </div>
          <span className="font-bold tracking-widest text-xs">CEPHLOW</span>
        </div>
        <div className="text-[10px] text-gray-400 tracking-wider">
          © 2026 CEPHLOW CERTIFICATE AUTHORITY
        </div>
        <div className="flex gap-4 text-[10px] text-gray-500 tracking-wider">
          <a href="/verify" className="hover:text-black">VERIFY</a>
          <span>·</span>
          <a href="/login" className="hover:text-black">SIGN IN</a>
        </div>
      </footer>
    </div>
  );
}
