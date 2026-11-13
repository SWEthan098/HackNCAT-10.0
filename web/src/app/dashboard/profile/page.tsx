"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/layout/AppShell";
import { Alert, Button, DashboardCard, ErrorState, Field, LoadingState } from "@/components/ui";
import { ApiError, type Me, type Profile } from "@/lib/api";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Not yet";
}

export default function ProfilePage() {
  const { api } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const data = await api<Me>("/me");
      setMe(data);
      setDisplayName(data.profile.display_name ?? "");
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : "Could not load your profile.");
    }
  }, [api]);

  useEffect(() => {
    let cancelled = false;
    api<Me>("/me")
      .then((data) => {
        if (cancelled) return;
        setMe(data);
        setDisplayName(data.profile.display_name ?? "");
      })
      .catch((e) => !cancelled && setLoadError(e instanceof ApiError ? e.message : "Could not load your profile."));
    return () => {
      cancelled = true;
    };
  }, [api]);

  function retry() {
    setLoadError(null);
    setMe(null);
    fetchMe();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const profile = await api<Profile>("/me/profile", { method: "PATCH", body: { display_name: displayName } });
      setMe((m) => (m ? { ...m, profile } : m));
      setDisplayName(profile.display_name ?? "");
      setSaveResult({ tone: "success", text: "Profile saved." });
    } catch (err) {
      setSaveResult({ tone: "error", text: err instanceof ApiError ? err.message : "Could not save your profile." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Profile" description="Loaded from the FastAPI /me endpoint, which verifies your session token." />
      {loadError ? (
        <ErrorState message={loadError} onRetry={retry} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <DashboardCard title="Account">
            {!me ? (
              <LoadingState lines={4} label="Loading account" />
            ) : (
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-3 text-sm" data-testid="account-details">
                <dt className="text-muted">Email</dt>
                <dd className="truncate" data-testid="profile-email">{me.email}</dd>
                <dt className="text-muted">User id</dt>
                <dd className="truncate font-mono text-xs leading-5" data-testid="profile-id">{me.id}</dd>
                <dt className="text-muted">Profile created</dt>
                <dd>{formatDate(me.profile.created_at)}</dd>
                <dt className="text-muted">Last updated</dt>
                <dd>{formatDate(me.profile.updated_at)}</dd>
              </dl>
            )}
          </DashboardCard>
          <DashboardCard title="Public profile" description="Shown to other users once your app has social features.">
            {!me ? (
              <LoadingState lines={2} label="Loading profile" />
            ) : (
              <form onSubmit={save} className="flex flex-col gap-1">
                <Field
                  label="Display name"
                  name="display_name"
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  helper="Up to 80 characters. Leave empty to clear it."
                />
                {saveResult && (
                  <div className="mb-3">
                    <Alert tone={saveResult.tone}>{saveResult.text}</Alert>
                  </div>
                )}
                <div>
                  <Button type="submit" loading={saving}>
                    Save profile
                  </Button>
                </div>
              </form>
            )}
          </DashboardCard>
        </div>
      )}
    </>
  );
}
