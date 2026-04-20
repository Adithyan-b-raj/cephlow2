import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { format } from "date-fns";
import { Award, CalendarDays, Check, ExternalLink, Loader2, Pencil, User, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/lib/supabase";

interface ProfileCert {
  certId: string;
  batchId: string;
  batchName: string;
  recipientName: string;
  r2PdfUrl: string | null;
  pdfUrl: string | null;
  slideUrl: string | null;
  issuedAt: string | null;
  status: string;
}

interface ProfileData {
  slug: string;
  name: string;
  certificates: ProfileCert[];
}

export default function StudentProfile() {
  const [, params] = useRoute("/:username");
  const username = params?.username ?? "";
  const { user } = useAuth();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit name state
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!username) return;
    fetch(`/api/p/${username}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setProfile(data);
      })
      .catch(() => setError("Failed to load profile"))
      .finally(() => setLoading(false));
  }, [username]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function handleSaveName() {
    if (!editName.trim() || !profile) return;
    setSaving(true);
    setSaveError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const idToken = sessionData.session?.access_token;
      const res = await fetch(`/api/p/${username}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Failed to save");
      } else {
        setProfile((p) => p ? { ...p, name: data.name } : p);
        setEditing(false);
      }
    } catch {
      setSaveError("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function startEdit() {
    setEditName(profile?.name ?? "");
    setSaveError(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveError(null);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 text-center px-4">
        <div className="rounded-full bg-slate-100 p-4">
          <User className="h-8 w-8 text-slate-400" />
        </div>
        <h1 className="text-xl font-semibold text-slate-800">Profile not found</h1>
        <p className="text-sm text-slate-500">
          No profile exists for <span className="font-mono font-medium">@{username}</span>
        </p>
      </div>
    );
  }

  const initials = profile.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
        {/* Profile header */}
        <div className="mb-8 flex items-center gap-5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xl font-bold text-white shadow sm:h-20 sm:w-20 sm:text-2xl">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") cancelEdit();
                    }}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xl font-bold text-slate-900 outline-none ring-0 focus:border-slate-500 sm:text-2xl"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={saving || !editName.trim()}
                    className="rounded-md bg-slate-900 p-1.5 text-white hover:bg-slate-700 disabled:opacity-50"
                    title="Save"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"
                    title="Cancel"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {saveError && <p className="text-xs text-red-500">{saveError}</p>}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{profile.name}</h1>
                {user && (
                  <button
                    onClick={startEdit}
                    className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    title="Edit name"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
            <p className="mt-0.5 text-sm text-slate-500">@{profile.slug}</p>
            <p className="mt-1 text-sm text-slate-600">
              {profile.certificates.length}{" "}
              {profile.certificates.length === 1 ? "certificate" : "certificates"} issued
            </p>
          </div>
        </div>

        {/* Certificates grid */}
        {profile.certificates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <Award className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm text-slate-500">No certificates yet</p>
          </div>
        ) : (
          <>
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Certificates
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {profile.certificates.map((cert) => {
                const viewUrl = cert.r2PdfUrl || cert.pdfUrl || cert.slideUrl;
                return (
                  <Card
                    key={cert.certId}
                    className="flex flex-col border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="rounded-md bg-slate-100 p-2 text-slate-600">
                          <Award className="h-4 w-4" />
                        </div>
                        <Badge
                          variant="outline"
                          className="shrink-0 text-[10px] capitalize border-slate-200 text-slate-500"
                        >
                          {cert.status}
                        </Badge>
                      </div>
                      <CardTitle className="mt-2 line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                        {cert.batchName}
                      </CardTitle>
                    </CardHeader>

                    <CardContent className="flex flex-1 flex-col justify-between gap-4 pt-0">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                        {cert.issuedAt
                          ? format(new Date(cert.issuedAt), "MMM d, yyyy")
                          : "—"}
                      </div>

                      <div className="flex items-center gap-2">
                        {viewUrl && (
                          <a
                            href={viewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-slate-700"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View
                          </a>
                        )}
                        <a
                          href={`/verify/${cert.batchId}/${cert.certId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50"
                        >
                          Verify
                        </a>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        <p className="mt-10 text-center text-[11px] text-slate-400">
          Powered by Cephlow Certificate Authority
        </p>
      </div>
    </div>
  );
}
