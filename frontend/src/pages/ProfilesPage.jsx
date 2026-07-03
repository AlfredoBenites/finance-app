import { useEffect, useState } from "react";
import { profilesApi, sharesApi, bucketsApi } from "../api/client";
import { writeStatement } from "../statement";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  Banner,
  Input,
  Select,
  Table,
  THead,
  TH,
  TR,
  TD,
} from "../components/ui";
import ProfileDetailPanel from "../components/profiles/ProfileDetailPanel";

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState([]);
  const [buckets, setBuckets] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState(null);
  const [stmtLang, setStmtLang] = useState("en");

  // Detail panel state (persist the profile through the close animation).
  const [detailId, setDetailId] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [shares, setShares] = useState([]);
  const [shareEmail, setShareEmail] = useState("");

  async function loadProfiles() {
    try {
      setProfiles(await profilesApi.list());
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    loadProfiles();
    bucketsApi.list().then(setBuckets).catch(() => {});
  }, []);

  const bucketName = (id) => buckets.find((b) => b.id === id)?.name ?? "—";

  async function openDetail(profile) {
    setDetailId(profile.id);
    setDetailOpen(true);
    setSummary(null);
    setShares([]);
    setShareEmail("");
    setError(null);
    setSummaryLoading(true);
    try {
      const [summaryData, shareList] = await Promise.all([
        profilesApi.summary(profile.id),
        sharesApi.listForProfile(profile.id),
      ]);
      setSummary(summaryData);
      setShares(shareList);
    } catch (e) {
      setError(e.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await profilesApi.create({ name: name.trim() });
      setName("");
      setError(null);
      loadProfiles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function setDefaultBucket(bucketId) {
    if (!detailId) return;
    try {
      await profilesApi.update(detailId, { default_bucket_id: bucketId || null });
      loadProfiles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function setCashbackTarget(targetId) {
    if (!detailId) return;
    try {
      await profilesApi.update(detailId, { cashback_to_profile_id: targetId || null });
      await loadProfiles();
      // Re-fetch this profile's summary so its cashback reflects the change.
      setSummaryLoading(true);
      setSummary(await profilesApi.summary(detailId));
    } catch (e) {
      setError(e.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  async function handleMakePrimary() {
    if (!detailId) return;
    try {
      await profilesApi.makePrimary(detailId);
      loadProfiles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete() {
    if (!detailId) return;
    try {
      await profilesApi.remove(detailId);
      setDetailOpen(false);
      loadProfiles();
    } catch (e) {
      setError(e.message);
    }
  }

  async function downloadStatement() {
    if (!detailId) return;
    // Open the window now, inside the click, so pop-up blockers allow it;
    // fill it once the data loads.
    const win = window.open("", "_blank");
    if (!win) {
      setError("Allow pop-ups for this site to open the statement.");
      return;
    }
    try {
      setError(null);
      const s = await profilesApi.statement(detailId);
      writeStatement(win, s, stmtLang);
    } catch (e) {
      win.close();
      setError(e.message);
    }
  }

  async function handleShare(e) {
    e.preventDefault();
    if (!shareEmail.trim() || !detailId) return;
    try {
      await sharesApi.create(detailId, shareEmail.trim());
      setShareEmail("");
      setShares(await sharesApi.listForProfile(detailId));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRevoke(shareId) {
    try {
      await sharesApi.remove(shareId);
      setShares(await sharesApi.listForProfile(detailId));
    } catch (e) {
      setError(e.message);
    }
  }

  // Keep the panel populated during its exit animation.
  const shown = detailId ? profiles.find((p) => p.id === detailId) || null : null;

  return (
    <div>
      <PageHeader
        title="Profiles"
        subtitle="People whose spending you track."
        actions={
          <label className="flex items-center gap-2 text-sm text-muted">
            Statement language
            <Select value={stmtLang} onChange={(e) => setStmtLang(e.target.value)}>
              <option value="en">English</option>
              <option value="es">Español</option>
            </Select>
          </label>
        }
      />

      {/* Add form (add only) */}
      <Card className="mb-6">
        <form onSubmit={handleAdd} className="flex items-end gap-2 flex-wrap">
          <label className="flex flex-col gap-1 flex-1 min-w-[14rem]">
            <span className="text-xs text-muted">Name</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Profile name (e.g., Mom)"
            />
          </label>
          <Button type="submit" variant="primary">Add profile</Button>
        </form>
      </Card>

      {error && <Banner tone="danger" className="mb-4">Error: {error}</Banner>}

      {profiles.length === 0 ? (
        <p className="text-muted text-sm">No profiles yet.</p>
      ) : (
        <Table className="table-fixed min-w-[32rem]">
          <THead>
            <tr>
              <TH className="w-[55%]">Profile</TH>
              <TH className="w-[45%]">Money bucket</TH>
            </tr>
          </THead>
          <tbody>
            {profiles.map((p) => (
              <TR key={p.id} onClick={() => openDetail(p)} className="cursor-pointer">
                <TD>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-ink font-medium truncate">{p.name}</span>
                    {p.is_primary && <Badge tone="teal">Me</Badge>}
                  </span>
                </TD>
                <TD className="text-muted truncate">{bucketName(p.default_bucket_id)}</TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      <ProfileDetailPanel
        profile={shown}
        profiles={profiles}
        summary={summary}
        loading={summaryLoading}
        buckets={buckets}
        shares={shares}
        shareEmail={shareEmail}
        onShareEmailChange={setShareEmail}
        onShare={handleShare}
        onRevoke={handleRevoke}
        onSetBucket={setDefaultBucket}
        onSetCashbackTarget={setCashbackTarget}
        onMakePrimary={handleMakePrimary}
        onStatement={downloadStatement}
        onDelete={handleDelete}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}
