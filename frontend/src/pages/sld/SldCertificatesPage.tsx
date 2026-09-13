import { useMemo, useRef, useState } from "react";
import { FileUp, RefreshCcw, RotateCcw } from "lucide-react";
import Modal from "../../ui/Modal";
import {
  useSldOems,
  useSldCertificates,
  useUploadSldVahan,
  useReinstateSldCert,
  useReinstateSldCertBulk,
  useDealers,
  SldCertificateRow,
} from "../../api/hooks";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function kindBadge(kind?: string) {
  const isRenewal = kind === "RENEWAL";
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
        isRenewal ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"
      }`}
      title={isRenewal ? "Use Vahan SLD Maker: Renewal" : "Use Vahan SLD Maker: New Fitment"}
    >
      {isRenewal ? "RENEWAL" : "NEW FITMENT"}
    </span>
  );
}

export default function SldCertificatesPage() {
  const [status, setStatus] = useState<"PENDING" | "COMPLETED" | "">("PENDING");
  const [kind, setKind] = useState<"NEW" | "RENEWAL" | "">("");
  const [sldOemId, setSldOemId] = useState("");
  const [dealerId, setDealerId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const [openBulk, setOpenBulk] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [reinstateTarget, setReinstateTarget] = useState<SldCertificateRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

  const { data: oems = [] } = useSldOems();
  const { data: dealers = [] } = useDealers();

  const query = useSldCertificates({
    status: status || undefined,
    kind: kind || undefined,
    sldOemId: sldOemId || undefined,
    dealerId: dealerId || undefined,
    search: search || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
    limit: 50,
  });

  const uploadMutation = useUploadSldVahan();
  const reinstateMutation = useReinstateSldCert();
  const bulkMutation = useReinstateSldCertBulk();

  const items = query.data?.items || [];
  const total = query.data?.total || 0;
  const limit = query.data?.limit || 50;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const authorizedDealers = useMemo(() => {
    if (!sldOemId) return dealers;
    return dealers.filter((d) => (d.sldOems || []).some((o) => o.id === sldOemId));
  }, [dealers, sldOemId]);

  const openPdf = (url?: string | null) => {
    if (!url) return;
    const origin = window.location.origin;
    const href = url.startsWith("http") ? url : `${origin}${url.startsWith("/") ? url : `/${url}`}`;
    window.open(href, "_blank", "noopener,noreferrer");
  };

  const onPickVahanFile = async (file: File | null) => {
    if (!file || !uploadTargetId) return;
    const pdfBase64 = await fileToBase64(file);
    await uploadMutation.mutateAsync({ id: uploadTargetId, pdfBase64 });
    setUploadTargetId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onReinstate = async () => {
    if (!reinstateTarget) return;
    await reinstateMutation.mutateAsync(reinstateTarget.id);
    setReinstateTarget(null);
  };

  const onBulkReinstate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await bulkMutation.mutateAsync(bulkCsv);
    setBulkResult(res);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SLD Certificates</h1>
          <p className="text-sm text-gray-500">
            Pending queue, Vahan PDF upload, and certificate reinstate.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setBulkResult(null);
            setOpenBulk(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm hover:bg-gray-50"
        >
          <RotateCcw className="w-4 h-4" />
          Bulk Reinstate
        </button>
      </div>

      <div className="bg-white border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <select
          className="border rounded-md p-2 text-sm"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as any);
          }}
        >
          <option value="PENDING">Pending (awaiting Vahan)</option>
          <option value="COMPLETED">Completed</option>
          <option value="">All statuses</option>
        </select>
        <select
          className="border rounded-md p-2 text-sm"
          value={kind}
          onChange={(e) => {
            setPage(1);
            setKind(e.target.value as any);
          }}
        >
          <option value="">All types</option>
          <option value="NEW">New fitment</option>
          <option value="RENEWAL">Renewal</option>
        </select>
        <select
          className="border rounded-md p-2 text-sm"
          value={sldOemId}
          onChange={(e) => {
            setPage(1);
            setSldOemId(e.target.value);
            setDealerId("");
          }}
        >
          <option value="">All SLD OEMs</option>
          {oems.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <select
          className="border rounded-md p-2 text-sm"
          value={dealerId}
          onChange={(e) => {
            setPage(1);
            setDealerId(e.target.value);
          }}
        >
          <option value="">All dealers</option>
          {authorizedDealers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <input
          className="border rounded-md p-2 text-sm"
          placeholder="Search cert / vehicle / owner"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <input
          type="date"
          className="border rounded-md p-2 text-sm"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <input
          type="date"
          className="border rounded-md p-2 text-sm"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <button
          type="button"
          onClick={() => {
            setPage(1);
            query.refetch();
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md bg-primary text-white text-sm"
        >
          <RefreshCcw className="w-4 h-4" />
          Apply
        </button>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Certificate Number</th>
                <th className="px-4 py-3">Vehicle Reg. No.</th>
                <th className="px-4 py-3">OEM</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Serial Number</th>
                <th className="px-4 py-3">Seal Number</th>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading ? (
                <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-gray-500">
                    No certificates found.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.generatedAt ? new Date(row.generatedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3">{kindBadge(row.kind)}</td>
                    <td className="px-4 py-3 font-medium">{row.certificateNumber}</td>
                    <td className="px-4 py-3">{row.vehicleNumber}</td>
                    <td className="px-4 py-3">{row.oem?.name || row.oem?.code || "—"}</td>
                    <td className="px-4 py-3">{row.model?.name || row.model?.code || "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{row.serialNumber || "—"}</td>
                    <td className="px-4 py-3">{row.sealNumber || "—"}</td>
                    <td className="px-4 py-3">{row.dealer?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          row.status === "COMPLETED"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                          onClick={() => openPdf(row.pdfUrl || row.smartvahanPdfPath)}
                        >
                          SmartVahan PDF
                        </button>
                        {row.vahanPdfPath ? (
                          <button
                            type="button"
                            className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                            onClick={() => openPdf(row.vahanPdfPath)}
                          >
                            Vahan PDF
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-xs px-2 py-1 border rounded hover:bg-gray-50 inline-flex items-center gap-1"
                            onClick={() => {
                              setUploadTargetId(row.id);
                              fileInputRef.current?.click();
                            }}
                          >
                            <FileUp className="w-3 h-3" />
                            Upload Vahan
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-xs px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50"
                          onClick={() => setReinstateTarget(row)}
                        >
                          Reinstate
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
          <span>
            {total} total · page {page} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1 border rounded disabled:opacity-40"
            >
              Prev
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="px-3 py-1 border rounded disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => onPickVahanFile(e.target.files?.[0] || null)}
      />

      <Modal open={Boolean(reinstateTarget)} onClose={() => setReinstateTarget(null)} title="Reinstate certificate">
        <p className="text-sm text-gray-600 mb-4">
          Delete certificate <strong>{reinstateTarget?.certificateNumber}</strong>, remove files, and return
          serial to <strong>ASSIGNED</strong> for the same dealer.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" className="px-4 py-2 border rounded" onClick={() => setReinstateTarget(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded bg-red-600 text-white"
            disabled={reinstateMutation.isPending}
            onClick={onReinstate}
          >
            {reinstateMutation.isPending ? "Working…" : "Confirm Reinstate"}
          </button>
        </div>
      </Modal>

      <Modal open={openBulk} onClose={() => setOpenBulk(false)} title="Bulk reinstate (CSV)">
        <form onSubmit={onBulkReinstate} className="space-y-4">
          <p className="text-sm text-gray-600">One certificate number per line (e.g. SLDABCMH12AB1234).</p>
          <textarea
            className="w-full border rounded-md p-2 text-sm min-h-[140px] font-mono"
            value={bulkCsv}
            onChange={(e) => setBulkCsv(e.target.value)}
            placeholder="SLDABCMH12AB1234&#10;SLDXYZMH01CD5678"
          />
          {bulkResult && (
            <div className="text-sm bg-gray-50 border rounded p-3 max-h-40 overflow-auto">
              <div>
                Success: {bulkResult.successCount} / {bulkResult.total}
              </div>
              {(bulkResult.results || []).slice(0, 20).map((r: any, i: number) => (
                <div key={i} className={r.success ? "text-green-700" : "text-red-700"}>
                  {r.line}: {r.message}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" className="px-4 py-2 border rounded" onClick={() => setOpenBulk(false)}>
              Close
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded bg-primary text-white"
              disabled={bulkMutation.isPending}
            >
              {bulkMutation.isPending ? "Processing…" : "Run bulk reinstate"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
