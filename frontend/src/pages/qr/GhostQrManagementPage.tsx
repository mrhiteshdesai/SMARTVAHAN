import React, { useMemo, useState } from "react";
import {
  Search,
  FileDown,
  RefreshCcw,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Upload,
} from "lucide-react";
import Modal from "../../ui/Modal";
import api from "../../api/client";
import { useAuth } from "../../auth/AuthContext";
import { useOEMs, useProducts, useStates } from "../../api/hooks";

type Tab = "V1" | "V2";

const StatCard = ({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) => {
  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <div className="text-xs font-semibold text-gray-700">{label}</div>
      <div className="text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
};

const Badge = ({
  label,
  className,
}: {
  label: string;
  className: string;
}) => {
  return <span className={`px-2 py-1 rounded text-xs font-semibold ${className}`}>{label}</span>;
};

export const GhostQrManagementPage = () => {
  const { user } = useAuth();
  const isGhostMode = localStorage.getItem("isGhostMode") === "true";
  const isGhostAdmin = isGhostMode && user?.role === "GHOST_ADMIN";

  const { data: states = [] } = useStates();
  const { data: oems = [] } = useOEMs();
  const { data: products = [] } = useProducts();

  const [tab, setTab] = useState<Tab>("V1");
  const [filterState, setFilterState] = useState("");
  const [filterOem, setFilterOem] = useState("");
  const [filterProduct, setFilterProduct] = useState("");
  const [search, setSearch] = useState("");

  const [v1Stats, setV1Stats] = useState<any>(null);
  const [v1Loading, setV1Loading] = useState(false);
  const [v1Error, setV1Error] = useState("");

  const [v2Runs, setV2Runs] = useState<any[]>([]);
  const [v2Loading, setV2Loading] = useState(false);
  const [v2Error, setV2Error] = useState("");
  const [v2Counts, setV2Counts] = useState<Record<string, any>>({});

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreJson, setRestoreJson] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoreSuccess, setRestoreSuccess] = useState("");

  const requireGhostAdmin = () => {
    if (!isGhostAdmin) {
      alert("Ghost Admin access required.");
      return false;
    }
    return true;
  };

  const params = useMemo(() => {
    const p: any = {};
    if (filterState) p.stateCode = filterState;
    if (filterOem) p.oemCode = filterOem;
    if (filterProduct) p.productCode = filterProduct;
    return p;
  }, [filterState, filterOem, filterProduct]);

  const refreshV1 = async () => {
    if (!requireGhostAdmin()) return;
    setV1Loading(true);
    setV1Error("");
    try {
      const res = await api.get("/qr/ghost-v1/stats", { params });
      setV1Stats(res.data?.data || null);
    } catch (e: any) {
      setV1Error(e.response?.data?.message || "Failed to load Ghost V1 stats");
      setV1Stats(null);
    } finally {
      setV1Loading(false);
    }
  };

  const refreshV2 = async () => {
    if (!requireGhostAdmin()) return;
    setV2Loading(true);
    setV2Error("");
    try {
      const res = await api.get("/qr/ghost-v2/runs", { params });
      const list = Array.isArray(res.data?.data) ? res.data.data : [];
      setV2Runs(list);
    } catch (e: any) {
      setV2Error(e.response?.data?.message || "Failed to load Ghost V2 runs");
      setV2Runs([]);
    } finally {
      setV2Loading(false);
    }
  };

  React.useEffect(() => {
    if (!isGhostAdmin) return;
    if (tab === "V1") {
      refreshV1();
    } else {
      refreshV2();
    }
  }, [isGhostAdmin, tab, params]);

  const refresh = async () => {
    if (tab === "V1") return refreshV1();
    return refreshV2();
  };

  const searchLower = search.trim().toLowerCase();

  const v1Rows = useMemo(() => {
    const rows = Array.isArray(v1Stats?.batches) ? v1Stats.batches : [];
    if (!searchLower) return rows;
    return rows.filter((b: any) => {
      const hay = [
        b.batchId,
        b.stateCode,
        b.oemCode,
        b.productCode,
        b.startSerial,
        b.endSerial,
      ]
        .filter(Boolean)
        .map((x: any) => String(x).toLowerCase())
        .join(" ");
      return hay.includes(searchLower);
    });
  }, [v1Stats, searchLower]);

  const v2Rows = useMemo(() => {
    if (!searchLower) return v2Runs;
    return v2Runs.filter((r: any) => {
      const hay = [
        r.id,
        r.stateCode,
        r.oemCode,
        r.productCode,
        r.startSerial,
        r.requestedQuantity,
      ]
        .filter(Boolean)
        .map((x: any) => String(x).toLowerCase())
        .join(" ");
      return hay.includes(searchLower);
    });
  }, [v2Runs, searchLower]);

  const downloadJson = (filename: string, json: any) => {
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleV1Backup = async (batchId: string) => {
    if (!requireGhostAdmin()) return;
    try {
      const res = await api.post("/qr/ghost-v1/batch/backup", { batchId });
      const payload = res.data?.data || res.data;
      const safeId = batchId.replace(/[^A-Za-z0-9_-]/g, "");
      downloadJson(`ghost_v1_batch_backup_${safeId}.json`, payload);
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to backup batch");
    }
  };

  const handleV1Delete = async (batchId: string) => {
    if (!requireGhostAdmin()) return;
    if (!confirm(`Delete ghost v1 batch ${batchId}? This cannot be undone without a backup JSON.`)) return;
    try {
      await api.post("/qr/ghost-v1/batch/delete", { batchId });
      await refreshV1();
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to delete batch");
    }
  };

  const handleV1DeactivateUnused = async (batchId: string) => {
    if (!requireGhostAdmin()) return;
    if (!confirm(`Deactivate UNUSED codes in batch ${batchId}? Used codes remain unchanged.`)) return;
    try {
      await api.post("/qr/ghost-v1/batch/deactivate-unused", { batchId });
      await refreshV1();
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to deactivate unused codes");
    }
  };

  const handleV1Reactivate = async (batchId: string) => {
    if (!requireGhostAdmin()) return;
    if (!confirm(`Reactivate deactivated codes in batch ${batchId}?`)) return;
    try {
      await api.post("/qr/ghost-v1/batch/reactivate", { batchId });
      await refreshV1();
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to reactivate batch codes");
    }
  };

  const openRestore = () => {
    if (!requireGhostAdmin()) return;
    setRestoreJson("");
    setRestoreError("");
    setRestoreSuccess("");
    setRestoreOpen(true);
  };

  const handleRestoreSubmit = async () => {
    if (!requireGhostAdmin()) return;
    setRestoreError("");
    setRestoreSuccess("");
    let parsed: any;
    try {
      parsed = JSON.parse(restoreJson);
    } catch {
      setRestoreError("Invalid JSON");
      return;
    }
    try {
      const res = await api.post("/qr/ghost-v1/batch/restore", {
        backup: parsed,
        onConflict: "FAIL",
        forceNewBatchId: false,
      });
      setRestoreSuccess(res.data?.message || "Restored successfully");
      await refreshV1();
    } catch (e: any) {
      setRestoreError(e.response?.data?.message || "Failed to restore batch");
    }
  };

  const handleV2LoadCounts = async (runId: string) => {
    if (!requireGhostAdmin()) return;
    try {
      const res = await api.get(`/qr/ghost-v2/runs/${runId}/counts`);
      setV2Counts((prev) => ({ ...prev, [runId]: res.data?.data || res.data }));
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to load run counts");
    }
  };

  const handleV2DeactivateUnused = async (runId: string) => {
    if (!requireGhostAdmin()) return;
    if (!confirm("Deactivate UNUSED codes affected by this V2 run?")) return;
    try {
      await api.post(`/qr/ghost-v2/runs/${runId}/deactivate-unused`);
      await handleV2LoadCounts(runId);
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to deactivate unused codes for run");
    }
  };

  const handleV2Reactivate = async (runId: string) => {
    if (!requireGhostAdmin()) return;
    if (!confirm("Reactivate deactivated codes affected by this V2 run?")) return;
    try {
      await api.post(`/qr/ghost-v2/runs/${runId}/reactivate`);
      await handleV2LoadCounts(runId);
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to reactivate codes for run");
    }
  };

  const parseFilenameFromContentDisposition = (headerValue: string | undefined) => {
    if (!headerValue) return null;
    const m = headerValue.match(/filename="([^"]+)"/i);
    if (m && m[1]) return m[1];
    return null;
  };

  const handleV2Download = async (runId: string) => {
    if (!requireGhostAdmin()) return;
    try {
      const response = await api.get(`/qr/ghost-v2/runs/${runId}/download`, { responseType: "blob" });
      const blob = new Blob([response.data], {
        type: response.headers["content-type"] || "application/pdf",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const name = parseFilenameFromContentDisposition(response.headers["content-disposition"]) || `ghost_v2_run_${runId}.pdf`;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e.response?.data?.message || "Failed to download run file");
    }
  };

  if (!isGhostAdmin) {
    return (
      <div className="mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="text-lg font-semibold text-gray-900">Ghost QR Management</div>
          <div className="text-sm text-gray-600 mt-1">
            This page is available only in Ghost Mode for Ghost Admin.
          </div>
        </div>
      </div>
    );
  }

  const totals = v1Stats?.totals || {};

  return (
    <div className="mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Ghost QR Management</h1>
          <p className="text-sm text-gray-600">Batch/run controls for Ghost/Regenerated QR codes (V1 & V2).</p>
        </div>
        <div className="flex items-center gap-2">
          {tab === "V1" && (
            <button
              onClick={openRestore}
              className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50 flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Restore Batch
            </button>
          )}
          <button
            onClick={refresh}
            className="px-3 py-2 rounded-md text-sm font-semibold border border-gray-200 hover:bg-gray-50 flex items-center gap-2"
            disabled={v1Loading || v2Loading}
          >
            <RefreshCcw className={`w-4 h-4 ${(v1Loading || v2Loading) ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 space-y-4 md:space-y-0 md:flex md:items-center md:gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("V1")}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
              tab === "V1" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            V1 Batches
          </button>
          <button
            onClick={() => setTab("V2")}
            className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
              tab === "V2" ? "bg-red-600 text-white border-red-600" : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
            }`}
          >
            V2 Runs
          </button>
        </div>

        <div className="flex-1 flex items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <input
              className="border border-gray-300 rounded-md pl-10 pr-3 py-2 w-full text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
              placeholder={tab === "V1" ? "Search batchId / state / oem / product / serial…" : "Search runId / state / oem / product / serial…"}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="absolute left-3 top-2.5 text-gray-400">
              <Search className="w-4 h-4" />
            </div>
          </div>

          <select
            className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={filterState}
            onChange={(e) => setFilterState(e.target.value)}
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={filterOem}
            onChange={(e) => setFilterOem(e.target.value)}
          >
            <option value="">All OEMs</option>
            {oems.map((o) => (
              <option key={o.id} value={o.code}>
                {o.name}
              </option>
            ))}
          </select>

          <select
            className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={filterProduct}
            onChange={(e) => setFilterProduct(e.target.value)}
          >
            <option value="">All Products</option>
            {products.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {tab === "V1" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Unused" value={Number(totals.ghostV1UnusedActive || 0)} className="bg-blue-50 border-blue-200" />
            <StatCard label="Used" value={Number(totals.ghostV1Used || 0)} className="bg-green-50 border-green-200" />
            <StatCard label="Deactivated" value={Number(totals.ghostV1Deactivated || 0)} className="bg-red-50 border-red-200" />
            <StatCard label="Total" value={Number(totals.ghostV1QrTotal || 0)} className="bg-gray-50 border-gray-200" />
          </div>

          {v1Error && <div className="text-sm text-red-600">{v1Error}</div>}

          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Batch</th>
                    <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Serial</th>
                    <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Counts</th>
                    <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {v1Loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : v1Rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        No Ghost V1 batches found.
                      </td>
                    </tr>
                  ) : (
                    v1Rows.map((b: any) => (
                      <tr key={b.batchId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-900">{b.batchId}</div>
                          <div className="text-xs text-gray-500">
                            {b.stateCode}-{b.oemCode}-{b.productCode}
                          </div>
                          <div className="text-xs text-gray-500">{new Date(b.createdAt).toLocaleString()}</div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-700">
                          {b.startSerial && b.endSerial ? `${b.startSerial} - ${b.endSerial}` : "-"}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Badge label={`Unused ${b.counts?.unusedActive ?? 0}`} className="bg-blue-100 text-blue-700" />
                            <Badge label={`Used ${b.counts?.used ?? 0}`} className="bg-green-100 text-green-700" />
                            <Badge label={`Deactivated ${b.counts?.deactivated ?? 0}`} className="bg-red-100 text-red-700" />
                            <Badge label={`Total ${b.counts?.total ?? 0}`} className="bg-gray-100 text-gray-700" />
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              onClick={() => handleV1DeactivateUnused(b.batchId)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 flex items-center gap-1"
                            >
                              <ShieldOff className="w-3.5 h-3.5" /> Deactivate Unused
                            </button>
                            <button
                              onClick={() => handleV1Reactivate(b.batchId)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" /> Reactivate
                            </button>
                            <button
                              onClick={() => handleV1Backup(b.batchId)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold border border-gray-200 bg-white hover:bg-gray-50 flex items-center gap-1"
                            >
                              <FileDown className="w-3.5 h-3.5" /> Backup
                            </button>
                            <button
                              onClick={() => handleV1Delete(b.batchId)}
                              className="px-2.5 py-1 rounded-md text-xs font-semibold border border-red-200 bg-white text-red-700 hover:bg-red-50 flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 text-xs text-gray-500">
              Showing {v1Rows.length} batches
            </div>
          </div>
        </div>
      )}

      {tab === "V2" && (
        <div className="space-y-4">
          {v2Error && <div className="text-sm text-red-600">{v2Error}</div>}
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Run</th>
                    <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Details</th>
                    <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Counts</th>
                    <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {v2Loading ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        Loading...
                      </td>
                    </tr>
                  ) : v2Rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                        No Ghost V2 runs found.
                      </td>
                    </tr>
                  ) : (
                    v2Rows.map((r: any) => {
                      const c = v2Counts[r.id];
                      return (
                        <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-mono text-xs text-gray-700">{r.id}</div>
                            <div className="text-xs text-gray-500">{new Date(r.createdAt).toLocaleString()}</div>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-700">
                            <div className="font-semibold">
                              {r.stateCode}-{r.oemCode}-{r.productCode}
                            </div>
                            <div>Start Serial: {r.startSerial}</div>
                            <div>Requested: {r.requestedQuantity}, Regenerated: {r.regeneratedCount}</div>
                          </td>
                          <td className="px-6 py-4">
                            {c ? (
                              <div className="flex flex-wrap gap-2">
                                <Badge label={`Unused ${c.unusedActive}`} className="bg-blue-100 text-blue-700" />
                                <Badge label={`Used ${c.used}`} className="bg-green-100 text-green-700" />
                                <Badge label={`Deactivated ${c.deactivated}`} className="bg-red-100 text-red-700" />
                                <Badge label={`Total ${c.total}`} className="bg-gray-100 text-gray-700" />
                                {c.missing ? <Badge label={`Missing ${c.missing}`} className="bg-yellow-100 text-yellow-700" /> : null}
                              </div>
                            ) : (
                              <div className="text-xs text-gray-500">Counts not loaded</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => handleV2LoadCounts(r.id)}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold border border-gray-200 bg-white hover:bg-gray-50 flex items-center gap-1"
                              >
                                <RefreshCcw className="w-3.5 h-3.5" /> Load Counts
                              </button>
                              <button
                                onClick={() => handleV2DeactivateUnused(r.id)}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 flex items-center gap-1"
                              >
                                <ShieldOff className="w-3.5 h-3.5" /> Deactivate Unused
                              </button>
                              <button
                                onClick={() => handleV2Reactivate(r.id)}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 flex items-center gap-1"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" /> Reactivate
                              </button>
                              <button
                                onClick={() => handleV2Download(r.id)}
                                className="px-2.5 py-1 rounded-md text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 flex items-center gap-1"
                              >
                                <FileDown className="w-3.5 h-3.5" /> Download
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 border-t bg-gray-50 text-xs text-gray-500">
              Showing {v2Rows.length} runs
            </div>
          </div>
        </div>
      )}

      <Modal open={restoreOpen} onClose={() => setRestoreOpen(false)} title="Restore Ghost V1 Batch">
        <div className="space-y-4">
          {restoreError && <div className="bg-red-50 text-red-700 border border-red-200 p-3 rounded text-sm">{restoreError}</div>}
          {restoreSuccess && (
            <div className="bg-green-50 text-green-700 border border-green-200 p-3 rounded text-sm">{restoreSuccess}</div>
          )}
          <div className="text-sm text-gray-700">Paste the backup JSON returned by the “Backup” action and restore it into the database.</div>
          <textarea
            value={restoreJson}
            onChange={(e) => setRestoreJson(e.target.value)}
            className="w-full h-56 border border-gray-300 rounded-md p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder='{"version":"GHOST_V1_BATCH_BACKUP_V1", ... }'
          />
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setRestoreOpen(false)}
              className="px-4 py-2 rounded-md border border-gray-200 text-sm font-semibold hover:bg-gray-50"
            >
              Close
            </button>
            <button onClick={handleRestoreSubmit} className="px-4 py-2 rounded-md bg-red-600 text-white text-sm font-semibold hover:bg-red-700">
              Restore
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
