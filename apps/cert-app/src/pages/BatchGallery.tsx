import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Award, ExternalLink, Loader2, Search, Users, XCircle } from "lucide-react";

interface GalleryItem {
  id: string;
  recipientName: string;
  viewUrl: string | null;
}

interface GalleryData {
  batchName: string;
  bannerUrl: string | null;
  certificates: GalleryItem[];
}

export default function BatchGallery() {
  const [, slugParams] = useRoute("/event/:slug/:batchId");
  const [, legacyParams] = useRoute("/event/:batchId");
  const batchId = slugParams?.batchId ?? legacyParams?.batchId ?? "";

  const [data, setData] = useState<GalleryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!batchId) return;
    const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
    fetch(`${apiBase}/api/gallery/${batchId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d); })
      .catch(() => setError("Failed to load certificates"))
      .finally(() => setLoading(false));
  }, [batchId]);

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background px-4">
        <div className="border-2 border-foreground p-10 flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-xs font-bold uppercase tracking-widest">Loading certificates...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background px-4">
        <div className="border-2 border-foreground p-10 flex flex-col items-center gap-3 max-w-sm text-center">
          <XCircle className="h-8 w-8" />
          <p className="text-xs font-bold uppercase tracking-widest">{error || "Not found"}</p>
        </div>
      </div>
    );
  }

  const filtered = data.certificates.filter(c =>
    c.recipientName.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-8 sm:py-10">

        {/* Hero: banner left, event info right (stacks on mobile) */}
        <div className="border-2 border-foreground flex flex-col md:flex-row overflow-hidden">
          {data.bannerUrl && (
            <div className="w-full h-[140px] md:w-2/5 md:h-auto md:border-r-2 md:border-foreground border-b-2 md:border-b-0 border-foreground shrink-0">
              <img src={data.bannerUrl} alt="" className="w-full h-full object-cover" />
            </div>
          )}
          <div className={`flex flex-col justify-center gap-2 p-5 md:p-8 ${data.bannerUrl ? "md:w-3/5" : "w-full"}`}>
            <div className="flex items-center gap-3">
              <div className="bg-foreground text-background p-2.5 shrink-0">
                <Award className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl md:text-3xl font-display font-black uppercase tracking-wide leading-tight">{data.batchName}</h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest">Certificate Gallery</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Find your name below and view or download your certificate.
            </p>
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest mt-1">
              <Users className="h-3.5 w-3.5" />
              {data.certificates.length} {data.certificates.length === 1 ? "recipient" : "recipients"}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-6 mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search your name..."
            className="w-full border-2 border-foreground bg-background pl-9 pr-3 py-2.5 text-sm font-medium outline-none"
          />
        </div>

        {/* Recipient list */}
        <div className="border-2 border-foreground sm:grid sm:grid-cols-2 lg:grid-cols-3">
          {filtered.length === 0 ? (
            <div className="sm:col-span-2 lg:col-span-3 p-6 text-center text-xs font-bold uppercase tracking-widest text-muted-foreground">
              No matching recipients
            </div>
          ) : (
            filtered.map((item, i) => {
              const n = filtered.length;
              const lastRowSm = i >= n - (n % 2 === 0 ? 2 : 1);
              const lastRowLg = i >= n - (n % 3 === 0 ? 3 : n % 3);
              const lastColSm = i % 2 === 1;
              const lastColLg = i % 3 === 2;
              return (
                <div
                  key={item.id}
                  className={`flex items-center justify-between gap-3 px-4 py-3 border-foreground
                    ${i !== n - 1 ? "border-b-2" : ""}
                    sm:border-b-2 ${lastRowSm ? "sm:border-b-0" : ""} ${!lastRowLg ? "lg:border-b-2" : "lg:border-b-0"}
                    ${!lastColSm ? "sm:border-r-2" : "sm:border-r-0"} ${!lastColLg ? "lg:border-r-2" : "lg:border-r-0"}
                  `}
                >
                  <p className="font-bold text-sm truncate">{item.recipientName}</p>
                  {item.viewUrl ? (
                    <a
                      href={item.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 flex items-center gap-1.5 bg-foreground text-background border-2 border-foreground px-3 py-1.5 text-[10px] font-black uppercase tracking-widest hover:bg-background hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View
                    </a>
                  ) : (
                    <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">Pending</span>
                  )}
                </div>
              );
            })
          )}
        </div>

        <p className="mt-6 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
          Powered by Cephlow Certificate Authority
        </p>
      </div>
    </div>
  );
}
