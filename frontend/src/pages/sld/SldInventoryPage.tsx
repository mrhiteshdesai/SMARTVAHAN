import { useMemo, useRef, useState } from "react";
import { Upload, UserPlus, Forward } from "lucide-react";
import Modal from "../../ui/Modal";
import { useAuth } from "../../auth/AuthContext";
import {
  useSldOems,
  useSldInventory,
  useSldAvailableSerials,
  useUploadSldInventory,
  useAssignSldInventory,
  useAssignSldInventoryCsv,
  useDealers,
  useSldForwardTargets,
  useSldAssignedForForward,
  useForwardSldInventory,
  useBulkDeleteSldInventory,
  useChangeSldSerialModel,
} from "../../api/hooks";

function summaryBlock(title: string, rows: string[]) {
  if (!rows?.length) return null;
  return (
    <div className="text-sm">
      <div className="font-medium">{title} ({rows.length})</div>
      <div className="text-xs text-gray-600 max-h-24 overflow-auto border rounded p-2 bg-gray-50 mt-1">
        {rows.slice(0, 50).join(", ")}
        {rows.length > 50 ? ` … +${rows.length - 50} more` : ""}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    AVAILABLE: "bg-emerald-100 text-emerald-800 border-emerald-200",
    ASSIGNED: "bg-amber-100 text-amber-900 border-amber-200",
    USED: "bg-slate-200 text-slate-800 border-slate-300",
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold border ${styles[status] || "bg-gray-100 text-gray-700"}`}>
      {status}
    </span>
  );
}

async function readCsvFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export default function SldInventoryPage() {
  const { user } = useAuth();
  const isDealer = user?.role === "DEALER_USER" || (user?.role as string) === "DEALER";
  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [sldOemId, setSldOemId] = useState("");
  const [modelId, setModelId] = useState("");
  const [status, setStatus] = useState(isDealer ? "ASSIGNED" : "");
  const [filterDealerId, setFilterDealerId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [openUpload, setOpenUpload] = useState(false);
  const [openAssign, setOpenAssign] = useState(false);
  const [openForward, setOpenForward] = useState(false);
  const [openBulkDelete, setOpenBulkDelete] = useState(false);
  const [openChangeModel, setOpenChangeModel] = useState(false);
  const [assignMode, setAssignMode] = useState<"manual" | "csv">("manual");
  const [uploadCsv, setUploadCsv] = useState("");
  const [assignCsv, setAssignCsv] = useState("");
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkTargetModelId, setBulkTargetModelId] = useState("");
  const [selectedSerialIds, setSelectedSerialIds] = useState<string[]>([]);
  const [bulkSelectedIds, setBulkSelectedIds] = useState<string[]>([]);
  const [lastSummary, setLastSummary] = useState<any>(null);

  // Assign modal: dealer first → OEM cascade
  const [assignDealerId, setAssignDealerId] = useState("");
  const [assignOemId, setAssignOemId] = useState("");
  const [assignModelId, setAssignModelId] = useState("");

  // Forward modal
  const [forwardOemId, setForwardOemId] = useState("");
  const [forwardToDealerId, setForwardToDealerId] = useState("");
  const [forwardSerialIds, setForwardSerialIds] = useState<string[]>([]);
  const [forwardMode, setForwardMode] = useState<"manual" | "csv">("manual");
  const [forwardCsv, setForwardCsv] = useState("");

  const uploadFileRef = useRef<HTMLInputElement>(null);
  const assignFileRef = useRef<HTMLInputElement>(null);
  const forwardFileRef = useRef<HTMLInputElement>(null);

  const { data: oems = [] } = useSldOems();
  const { data: dealers = [] } = useDealers({ enabled: isAdmin });

  const models = useMemo(() => {
    const oem = oems.find((o) => o.id === sldOemId);
    return oem?.models || [];
  }, [oems, sldOemId]);

  /** Dealers with at least one SLD OEM authorisation */
  const sldAuthorizedDealers = useMemo(
    () => dealers.filter((d) => (d.sldOems || []).length > 0),
    [dealers],
  );

  const assignDealer = useMemo(
    () => sldAuthorizedDealers.find((d) => d.id === assignDealerId) || null,
    [sldAuthorizedDealers, assignDealerId],
  );

  const assignOemOptions = useMemo(() => {
    if (!assignDealer) return [];
    return assignDealer.sldOems || [];
  }, [assignDealer]);

  const assignModels = useMemo(() => {
    const oem = oems.find((o) => o.id === assignOemId);
    return oem?.models || [];
  }, [oems, assignOemId]);

  const inventoryQuery = useSldInventory({
    sldOemId: sldOemId || undefined,
    modelId: modelId || undefined,
    status: status || undefined,
    dealerId: isDealer ? undefined : filterDealerId || undefined,
    search: search || undefined,
    page,
    limit: pageSize,
  });

  const availableQuery = useSldAvailableSerials(
    openAssign && assignMode === "manual" ? assignOemId : "",
    openAssign && assignMode === "manual" ? assignModelId : "",
  );

  const forwardTargetsQuery = useSldForwardTargets(openForward ? forwardOemId : "");
  const assignedForForwardQuery = useSldAssignedForForward(
    openForward && forwardMode === "manual" ? forwardOemId : "",
  );

  const uploadMutation = useUploadSldInventory();
  const assignMutation = useAssignSldInventory();
  const assignCsvMutation = useAssignSldInventoryCsv();
  const forwardMutation = useForwardSldInventory();
  const bulkDeleteMutation = useBulkDeleteSldInventory();
  const changeModelMutation = useChangeSldSerialModel();

  const items = inventoryQuery.data?.items || [];
  const total = inventoryQuery.data?.total || 0;
  const limit = inventoryQuery.data?.limit || pageSize;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const counts = inventoryQuery.data?.counts || { AVAILABLE: 0, ASSIGNED: 0, USED: 0 };

  const pageSelectableIds = useMemo(
    () => items.filter((r) => r.status === "AVAILABLE" || r.status === "ASSIGNED").map((r) => r.id),
    [items],
  );
  const allPageSelected =
    pageSelectableIds.length > 0 && pageSelectableIds.every((id) => bulkSelectedIds.includes(id));

  const bulkSelectedRows = useMemo(
    () => items.filter((r) => bulkSelectedIds.includes(r.id)),
    [items, bulkSelectedIds],
  );

  const changeModelOemId = useMemo(() => {
    if (sldOemId) return sldOemId;
    const oemsInSelection = [...new Set(bulkSelectedRows.map((r) => r.sldOem?.id).filter(Boolean))];
    return oemsInSelection.length === 1 ? (oemsInSelection[0] as string) : "";
  }, [sldOemId, bulkSelectedRows]);

  const changeModelOptions = useMemo(() => {
    const oem = oems.find((o) => o.id === changeModelOemId);
    return oem?.models || [];
  }, [oems, changeModelOemId]);

  const onUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sldOemId || !modelId || !uploadCsv.trim()) {
      alert("Select OEM, Model and provide CSV serials");
      return;
    }
    try {
      const res = await uploadMutation.mutateAsync({ sldOemId, modelId, csvText: uploadCsv });
      setLastSummary(res);
      setOpenUpload(false);
      setUploadCsv("");
    } catch (err: any) {
      alert(err?.response?.data?.message || "Upload failed");
    }
  };

  const onAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignDealerId || !assignOemId || !assignModelId) {
      alert("Select Dealer, then OEM and Model");
      return;
    }
    try {
      let res: any;
      if (assignMode === "manual") {
        if (selectedSerialIds.length === 0) {
          alert("Select at least one serial");
          return;
        }
        res = await assignMutation.mutateAsync({
          dealerId: assignDealerId,
          sldOemId: assignOemId,
          modelId: assignModelId,
          serialIds: selectedSerialIds,
        });
      } else {
        if (!assignCsv.trim()) {
          alert("Provide CSV serials");
          return;
        }
        res = await assignCsvMutation.mutateAsync({
          dealerId: assignDealerId,
          sldOemId: assignOemId,
          modelId: assignModelId,
          csvText: assignCsv,
        });
      }
      setLastSummary(res);
      setOpenAssign(false);
      setAssignCsv("");
      setSelectedSerialIds([]);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Assignment failed");
    }
  };

  const onForward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forwardOemId || !forwardToDealerId) {
      alert("Select OEM and target dealer");
      return;
    }
    if (forwardMode === "manual" && forwardSerialIds.length === 0) {
      alert("Select at least one assigned serial");
      return;
    }
    if (forwardMode === "csv" && !forwardCsv.trim()) {
      alert("Provide CSV serials (file or paste one per line)");
      return;
    }
    try {
      const res = await forwardMutation.mutateAsync({
        toDealerId: forwardToDealerId,
        sldOemId: forwardOemId,
        ...(forwardMode === "manual"
          ? { serialIds: forwardSerialIds }
          : { csvText: forwardCsv }),
      });
      setLastSummary({
        assigned: res.forwarded,
        notFound: res.notFound,
        notEligible: res.notEligible,
      });
      setOpenForward(false);
      setForwardSerialIds([]);
      setForwardToDealerId("");
      setForwardCsv("");
      setForwardMode("manual");
    } catch (err: any) {
      alert(err?.response?.data?.message || "Forward failed");
    }
  };

  const onBulkDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    const useCsv = bulkCsv.trim().length > 0;
    if (!useCsv && bulkSelectedIds.length === 0) {
      alert("Select rows or paste serial numbers");
      return;
    }
    if (useCsv && !sldOemId) {
      alert("Select SLD OEM filter (or in the form) when deleting by CSV");
      return;
    }
    if (
      !confirm(
        useCsv
          ? "Permanently delete these serials (AVAILABLE/ASSIGNED only, no certificates)?"
          : `Permanently delete ${bulkSelectedIds.length} selected serial(s)? They can be re-uploaded afterwards.`,
      )
    ) {
      return;
    }
    try {
      const res = await bulkDeleteMutation.mutateAsync({
        sldOemId: sldOemId || undefined,
        ...(useCsv ? { csvText: bulkCsv } : { serialIds: bulkSelectedIds }),
      });
      setLastSummary({
        deleted: res.deleted,
        blockedUsed: res.blockedUsed,
        blockedWithCert: res.blockedWithCert,
        notFound: res.notFound,
      });
      setOpenBulkDelete(false);
      setBulkCsv("");
      setBulkSelectedIds([]);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Bulk delete failed");
    }
  };

  const onChangeModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkTargetModelId) {
      alert("Select the target model");
      return;
    }
    const useCsv = bulkCsv.trim().length > 0;
    if (!useCsv && bulkSelectedIds.length === 0) {
      alert("Select rows or paste serial numbers");
      return;
    }
    if (useCsv && !changeModelOemId) {
      alert("Filter by SLD OEM first when changing model by CSV");
      return;
    }
    try {
      const res = await changeModelMutation.mutateAsync({
        targetModelId: bulkTargetModelId,
        sldOemId: changeModelOemId || undefined,
        ...(useCsv ? { csvText: bulkCsv } : { serialIds: bulkSelectedIds }),
      });
      setLastSummary({
        updated: res.updated,
        alreadyOnTarget: res.alreadyOnTarget,
        blockedUsed: res.blockedUsed,
        blockedWithCert: res.blockedWithCert,
        notFound: res.notFound,
      });
      setOpenChangeModel(false);
      setBulkCsv("");
      setBulkTargetModelId("");
      setBulkSelectedIds([]);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Change model failed");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xl font-semibold">SLD Inventory</div>
          <div className="text-sm text-gray-600">
            {isDealer
              ? "Your assigned device serials — forward unused stock to another authorised SLD dealer"
              : "Upload and assign device serial numbers"}
          </div>
          <div className="flex flex-wrap gap-2 mt-2">
            {!isDealer && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                Available: {counts.AVAILABLE}
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-200">
              Assigned: {counts.ASSIGNED}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-200 text-slate-800 border border-slate-300">
              Used: {counts.USED}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <>
              <button
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md text-sm"
                onClick={() => setOpenUpload(true)}
              >
                <Upload size={16} /> Upload CSV
              </button>
              <button
                className="flex items-center gap-2 border px-4 py-2 rounded-md text-sm hover:bg-gray-50"
                onClick={() => {
                  setAssignDealerId("");
                  setAssignOemId("");
                  setAssignModelId("");
                  setSelectedSerialIds([]);
                  setOpenAssign(true);
                }}
              >
                <UserPlus size={16} /> Assign to Dealer
              </button>
            </>
          )}
          {(isDealer || isAdmin) && (
            <button
              className="flex items-center gap-2 border px-4 py-2 rounded-md text-sm hover:bg-gray-50"
              onClick={() => {
                setForwardOemId(sldOemId || oems[0]?.id || "");
                setForwardToDealerId("");
                setForwardSerialIds([]);
                setForwardCsv("");
                setForwardMode("manual");
                setOpenForward(true);
              }}
            >
              <Forward size={16} /> Forward / Reassign
            </button>
          )}
          {isSuperAdmin && (
            <>
              <button
                className="flex items-center gap-2 border border-red-200 text-red-700 px-4 py-2 rounded-md text-sm hover:bg-red-50"
                onClick={() => {
                  setBulkCsv("");
                  setOpenBulkDelete(true);
                }}
              >
                Bulk delete
              </button>
              <button
                className="flex items-center gap-2 border px-4 py-2 rounded-md text-sm hover:bg-gray-50"
                onClick={() => {
                  setBulkCsv("");
                  setBulkTargetModelId("");
                  setOpenChangeModel(true);
                }}
              >
                Change model
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 bg-gray-50 border rounded-lg p-3">
        <select
          className="border rounded px-2 py-2 text-sm bg-white"
          value={sldOemId}
          onChange={(e) => {
            setSldOemId(e.target.value);
            setModelId("");
            setPage(1);
          }}
        >
          <option value="">All SLD OEMs</option>
          {oems.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} ({o.code})
            </option>
          ))}
        </select>
        <select
          className="border rounded px-2 py-2 text-sm bg-white"
          value={modelId}
          onChange={(e) => {
            setModelId(e.target.value);
            setPage(1);
          }}
          disabled={!sldOemId}
        >
          <option value="">All Models</option>
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} ({m.code})
            </option>
          ))}
        </select>
        <select
          className="border rounded px-2 py-2 text-sm bg-white"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All Status</option>
          {!isDealer && <option value="AVAILABLE">Available</option>}
          <option value="ASSIGNED">Assigned</option>
          <option value="USED">Used</option>
        </select>
        {!isDealer && (
          <select
            className="border rounded px-2 py-2 text-sm bg-white"
            value={filterDealerId}
            onChange={(e) => {
              setFilterDealerId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All SLD Dealers</option>
            {sldAuthorizedDealers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        <input
          className="border rounded px-2 py-2 text-sm bg-white"
          placeholder="Search serial..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
      </div>

      {lastSummary ? (
        <div className="border rounded-lg p-3 bg-white space-y-2">
          <div className="font-medium text-sm">Last operation summary</div>
          {lastSummary.created !== undefined ? (
            <div className="text-sm">Created: {lastSummary.created}</div>
          ) : null}
          {summaryBlock("Assigned / Forwarded", lastSummary.assigned || lastSummary.forwarded || [])}
          {summaryBlock("Deleted", lastSummary.deleted || [])}
          {summaryBlock("Model updated", lastSummary.updated || [])}
          {summaryBlock("Already on target model", lastSummary.alreadyOnTarget || [])}
          {summaryBlock("Already exists", lastSummary.alreadyExists || [])}
          {summaryBlock("Already assigned", lastSummary.alreadyAssigned || [])}
          {summaryBlock("Already used", lastSummary.alreadyUsed || [])}
          {summaryBlock("Blocked (USED)", lastSummary.blockedUsed || [])}
          {summaryBlock("Blocked (has certificate)", lastSummary.blockedWithCert || [])}
          {summaryBlock("Not found", lastSummary.notFound || [])}
          {summaryBlock("Not eligible (already target / not assigned)", lastSummary.notEligible || [])}
          {summaryBlock("Wrong OEM/Model", lastSummary.wrongOemOrModel || [])}
          {summaryBlock("Duplicates in file", lastSummary.duplicates || lastSummary.duplicatesInFile || [])}
          <button className="text-xs text-gray-500 underline" onClick={() => setLastSummary(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {isSuperAdmin && bulkSelectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border rounded-lg px-3 py-2 bg-amber-50 border-amber-200 text-sm">
          <span className="font-medium">{bulkSelectedIds.length} selected</span>
          <button
            type="button"
            className="px-3 py-1 border border-red-200 text-red-700 rounded bg-white hover:bg-red-50"
            onClick={() => {
              setBulkCsv("");
              setOpenBulkDelete(true);
            }}
          >
            Delete selected
          </button>
          <button
            type="button"
            className="px-3 py-1 border rounded bg-white hover:bg-gray-50"
            onClick={() => {
              setBulkCsv("");
              setBulkTargetModelId("");
              setOpenChangeModel(true);
            }}
          >
            Change model
          </button>
          <button type="button" className="text-xs text-gray-500 underline ml-auto" onClick={() => setBulkSelectedIds([])}>
            Clear selection
          </button>
        </div>
      ) : null}

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-left text-xs uppercase text-gray-500">
            <tr>
              {isSuperAdmin && (
                <th className="px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setBulkSelectedIds((prev) => [...new Set([...prev, ...pageSelectableIds])]);
                      } else {
                        setBulkSelectedIds((prev) => prev.filter((id) => !pageSelectableIds.includes(id)));
                      }
                    }}
                    title="Select AVAILABLE/ASSIGNED on this page"
                  />
                </th>
              )}
              <th className="px-3 py-2">Serial</th>
              <th className="px-3 py-2">OEM</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">Status</th>
              {!isDealer && <th className="px-3 py-2">Assigned To</th>}
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Used On</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {inventoryQuery.isLoading ? (
              <tr>
                <td colSpan={isDealer ? (isSuperAdmin ? 7 : 6) : isSuperAdmin ? 8 : 7} className="px-3 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={isDealer ? (isSuperAdmin ? 7 : 6) : isSuperAdmin ? 8 : 7} className="px-3 py-6 text-center text-gray-500">
                  No inventory records
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const canSelect = isSuperAdmin && (row.status === "AVAILABLE" || row.status === "ASSIGNED");
                return (
                  <tr key={row.id} className="hover:bg-gray-50">
                    {isSuperAdmin && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={!canSelect}
                          checked={bulkSelectedIds.includes(row.id)}
                          onChange={(e) => {
                            setBulkSelectedIds((prev) =>
                              e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                            );
                          }}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium">{row.serialNumber}</td>
                    <td className="px-3 py-2">{row.sldOem?.code || "—"}</td>
                    <td className="px-3 py-2">{row.model?.code || "—"}</td>
                    <td className="px-3 py-2">
                      <StatusPill status={row.status} />
                    </td>
                    {!isDealer && <td className="px-3 py-2">{row.dealer?.name || "—"}</td>}
                    <td className="px-3 py-2">{row.createdAt ? new Date(row.createdAt).toLocaleString() : "—"}</td>
                    <td className="px-3 py-2">
                      {row.certificate
                        ? `${row.certificate.certificateNumber} (${new Date(row.certificate.generatedAt).toLocaleDateString()})`
                        : row.usedAt
                          ? new Date(row.usedAt).toLocaleString()
                          : "—"}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 text-sm flex-wrap">
        <div className="text-gray-600">
          {total} total · page {page}/{totalPages}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-gray-600">
            Rows
            <select
              className="border rounded px-2 py-1.5 bg-white text-sm"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            className="px-3 py-1.5 border rounded disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <button
            className="px-3 py-1.5 border rounded disabled:opacity-50"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </div>

      {isAdmin && (
        <Modal open={openUpload} onClose={() => setOpenUpload(false)} title="Upload SLD Inventory CSV" maxWidth="max-w-xl">
          <form onSubmit={onUpload} className="space-y-4">
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={sldOemId}
              onChange={(e) => setSldOemId(e.target.value)}
              required
            >
              <option value="">Select SLD OEM</option>
              {oems.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              required
              disabled={!sldOemId}
            >
              <option value="">Select Model</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
            <div>
              <label className="block text-sm font-medium mb-1">Import CSV file</label>
              <input
                ref={uploadFileRef}
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="block w-full text-sm"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) setUploadCsv(await readCsvFile(file));
                }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Or paste serial numbers (one per line)</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm font-mono min-h-[140px]"
                value={uploadCsv}
                onChange={(e) => setUploadCsv(e.target.value)}
                placeholder="SLD001&#10;SLD002"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-4 py-2 border rounded" onClick={() => setOpenUpload(false)}>
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-primary text-white rounded" disabled={uploadMutation.isPending}>
                {uploadMutation.isPending ? "Uploading…" : "Upload"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isAdmin && (
        <Modal open={openAssign} onClose={() => setOpenAssign(false)} title="Assign Serials to Dealer" maxWidth="max-w-2xl">
          <form onSubmit={onAssign} className="space-y-4">
            <div className="text-xs text-gray-500">
              Only authorised SLD dealers are listed. After selecting a dealer, only that dealer&apos;s authorised SLD OEMs appear.
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className={`px-3 py-1.5 rounded text-sm border ${assignMode === "manual" ? "bg-primary text-white" : ""}`}
                onClick={() => setAssignMode("manual")}
              >
                Manual
              </button>
              <button
                type="button"
                className={`px-3 py-1.5 rounded text-sm border ${assignMode === "csv" ? "bg-primary text-white" : ""}`}
                onClick={() => setAssignMode("csv")}
              >
                CSV
              </button>
            </div>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={assignDealerId}
              onChange={(e) => {
                setAssignDealerId(e.target.value);
                setAssignOemId("");
                setAssignModelId("");
                setSelectedSerialIds([]);
              }}
              required
            >
              <option value="">Select Dealer (SLD authorised)</option>
              {sldAuthorizedDealers.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.phone})
                </option>
              ))}
            </select>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={assignOemId}
              onChange={(e) => {
                setAssignOemId(e.target.value);
                setAssignModelId("");
                setSelectedSerialIds([]);
              }}
              required
              disabled={!assignDealerId}
            >
              <option value="">Select SLD OEM</option>
              {assignOemOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} ({o.code})
                </option>
              ))}
            </select>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={assignModelId}
              onChange={(e) => {
                setAssignModelId(e.target.value);
                setSelectedSerialIds([]);
              }}
              required
              disabled={!assignOemId}
            >
              <option value="">Select Model</option>
              {assignModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>

            {assignMode === "manual" ? (
              <div className="max-h-48 overflow-auto border rounded p-2 space-y-1">
                {(availableQuery.data || []).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedSerialIds.includes(s.id)}
                      onChange={(e) => {
                        setSelectedSerialIds((prev) =>
                          e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                        );
                      }}
                    />
                    {s.serialNumber}
                  </label>
                ))}
                {availableQuery.isLoading ? <div className="text-sm text-gray-500">Loading serials…</div> : null}
                {!availableQuery.isLoading && assignOemId && assignModelId && (availableQuery.data || []).length === 0 ? (
                  <div className="text-sm text-gray-500">No available serials for this OEM/model</div>
                ) : null}
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium mb-1">Import CSV file</label>
                  <input
                    ref={assignFileRef}
                    type="file"
                    accept=".csv,.txt,text/csv,text/plain"
                    className="block w-full text-sm"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) setAssignCsv(await readCsvFile(file));
                    }}
                  />
                </div>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm font-mono min-h-[120px]"
                  value={assignCsv}
                  onChange={(e) => setAssignCsv(e.target.value)}
                  placeholder="One serial per line"
                />
              </>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" className="px-4 py-2 border rounded" onClick={() => setOpenAssign(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded"
                disabled={assignMutation.isPending || assignCsvMutation.isPending}
              >
                Assign
              </button>
            </div>
          </form>
        </Modal>
      )}

      <Modal open={openForward} onClose={() => setOpenForward(false)} title="Forward / Reassign Inventory" maxWidth="max-w-2xl">
        <form onSubmit={onForward} className="space-y-4">
          <div className="text-xs text-gray-500">
            Forward unused (ASSIGNED) serials to another dealer who is authorised for the same SLD OEM.
            Use Manual to pick from stock, or CSV / paste one serial per line.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className={`px-3 py-1.5 rounded text-sm border ${forwardMode === "manual" ? "bg-primary text-white" : ""}`}
              onClick={() => setForwardMode("manual")}
            >
              Manual
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded text-sm border ${forwardMode === "csv" ? "bg-primary text-white" : ""}`}
              onClick={() => setForwardMode("csv")}
            >
              CSV
            </button>
          </div>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={forwardOemId}
            onChange={(e) => {
              setForwardOemId(e.target.value);
              setForwardToDealerId("");
              setForwardSerialIds([]);
            }}
            required
          >
            <option value="">Select SLD OEM</option>
            {oems.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.code})
              </option>
            ))}
          </select>
          <select
            className="w-full border rounded px-3 py-2 text-sm"
            value={forwardToDealerId}
            onChange={(e) => setForwardToDealerId(e.target.value)}
            required
            disabled={!forwardOemId}
          >
            <option value="">Select target dealer</option>
            {(forwardTargetsQuery.data || []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.phone})
              </option>
            ))}
          </select>

          {forwardMode === "manual" ? (
            <div className="max-h-48 overflow-auto border rounded p-2 space-y-1">
              {(assignedForForwardQuery.data || []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={forwardSerialIds.includes(s.id)}
                    onChange={(e) => {
                      setForwardSerialIds((prev) =>
                        e.target.checked ? [...prev, s.id] : prev.filter((id) => id !== s.id),
                      );
                    }}
                  />
                  {s.serialNumber} · {s.model?.code || "—"}
                  {!isDealer && s.dealer?.name ? ` · ${s.dealer.name}` : ""}
                </label>
              ))}
              {assignedForForwardQuery.isLoading ? (
                <div className="text-sm text-gray-500">Loading assigned serials…</div>
              ) : null}
              {!assignedForForwardQuery.isLoading &&
              forwardOemId &&
              (assignedForForwardQuery.data || []).length === 0 ? (
                <div className="text-sm text-gray-500">
                  No ASSIGNED (unused) serials for this OEM{isDealer ? " in your stock" : ""}.
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Import CSV file</label>
                <input
                  ref={forwardFileRef}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="block w-full text-sm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) setForwardCsv(await readCsvFile(file));
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Or paste serial numbers (one per line)</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-sm font-mono min-h-[120px]"
                  value={forwardCsv}
                  onChange={(e) => setForwardCsv(e.target.value)}
                  placeholder="One serial per line"
                />
              </div>
            </>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="px-4 py-2 border rounded" onClick={() => setOpenForward(false)}>
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 bg-primary text-white rounded" disabled={forwardMutation.isPending}>
              {forwardMutation.isPending ? "Forwarding…" : "Forward"}
            </button>
          </div>
        </form>
      </Modal>

      {isSuperAdmin && (
        <Modal open={openBulkDelete} onClose={() => setOpenBulkDelete(false)} title="Bulk delete serials" maxWidth="max-w-xl">
          <form onSubmit={onBulkDelete} className="space-y-4">
            <div className="text-xs text-gray-500">
              SUPER_ADMIN only. Deletes AVAILABLE or ASSIGNED serials with no certificates (including dealer-assigned stock).
              USED / certificated rows are skipped. After delete you can upload the same serials under the correct model.
            </div>
            {bulkSelectedIds.length > 0 && !bulkCsv.trim() ? (
              <div className="text-sm border rounded p-2 bg-gray-50">
                Will delete <strong>{bulkSelectedIds.length}</strong> selected row(s). Optionally paste a CSV below to use that list instead.
              </div>
            ) : null}
            <div>
              <label className="block text-sm font-medium mb-1">Or paste serial numbers (one per line)</label>
              <p className="text-xs text-gray-500 mb-1">When pasting, set the page OEM filter first.</p>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm font-mono min-h-[120px]"
                value={bulkCsv}
                onChange={(e) => setBulkCsv(e.target.value)}
                placeholder="One serial per line"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-4 py-2 border rounded" onClick={() => setOpenBulkDelete(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 text-white rounded"
                disabled={bulkDeleteMutation.isPending}
              >
                {bulkDeleteMutation.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {isSuperAdmin && (
        <Modal open={openChangeModel} onClose={() => setOpenChangeModel(false)} title="Change model" maxWidth="max-w-xl">
          <form onSubmit={onChangeModel} className="space-y-4">
            <div className="text-xs text-gray-500">
              SUPER_ADMIN only. Moves AVAILABLE/ASSIGNED serials (no certificates) to another model on the same OEM.
              Dealer assignment is kept. Filter by OEM if using CSV paste.
            </div>
            {bulkSelectedIds.length > 0 && !bulkCsv.trim() ? (
              <div className="text-sm border rounded p-2 bg-gray-50">
                Applying to <strong>{bulkSelectedIds.length}</strong> selected row(s).
              </div>
            ) : null}
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={bulkTargetModelId}
              onChange={(e) => setBulkTargetModelId(e.target.value)}
              required
              disabled={!changeModelOemId}
            >
              <option value="">
                {changeModelOemId ? "Select target model" : "Set OEM filter (or select rows from one OEM)"}
              </option>
              {changeModelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.code})
                </option>
              ))}
            </select>
            <div>
              <label className="block text-sm font-medium mb-1">Or paste serial numbers (one per line)</label>
              <textarea
                className="w-full border rounded px-3 py-2 text-sm font-mono min-h-[120px]"
                value={bulkCsv}
                onChange={(e) => setBulkCsv(e.target.value)}
                placeholder="One serial per line"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-4 py-2 border rounded" onClick={() => setOpenChangeModel(false)}>
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-primary text-white rounded"
                disabled={changeModelMutation.isPending}
              >
                {changeModelMutation.isPending ? "Updating…" : "Change model"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
