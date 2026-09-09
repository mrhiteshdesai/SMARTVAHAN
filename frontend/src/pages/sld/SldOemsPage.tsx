import { useMemo, useRef, useState } from "react";
import { Plus, Search, Edit, Trash2, Upload, Car, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import Modal from "../../ui/Modal";
import {
  useSldOems,
  useCreateSldOem,
  useUpdateSldOem,
  useDeleteSldOem,
  useCreateSldModel,
  useUpdateSldModel,
  useDeleteSldModel,
  useSldVehicleModels,
  useUploadSldVehicleModels,
  useImportSldVariantList,
  useCreateSldVehicleModel,
  useDeleteSldVehicleModel,
  useStates,
  SldOem,
  SldDeviceModel,
} from "../../api/hooks";

const emptyModelForm = {
  name: "",
  code: "",
  sldType: "",
  tacOrCop: "",
  copDocument: "",
  copValidity: "",
  testingAgency: "",
};

function approvalLabel(agency?: string | null) {
  const a = (agency || "").toUpperCase();
  if (a.includes("ARAI")) return "COP Number (ARAI)";
  if (a.includes("ICAT")) return "TAC Number (ICAT)";
  return "TAC / COP Number";
}

function displayApproval(m: SldDeviceModel) {
  const a = (m.testingAgency || "").toUpperCase();
  if (a.includes("ARAI")) return m.copNumber || m.tacNumber || "—";
  if (a.includes("ICAT")) return m.tacNumber || m.copNumber || "—";
  return m.tacNumber || m.copNumber || "—";
}

function normalizeHeader(h: string) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function parseVariantWorkbook(file: ArrayBuffer) {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as Record<string, unknown>[];
  if (!raw.length) return [];

  const rows = raw.map((row: Record<string, unknown>) => {
    const map: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      map[normalizeHeader(k)] = v;
    }
    const get = (...keys: string[]) => {
      for (const k of keys) {
        if (map[k] !== undefined && map[k] !== null && String(map[k]).trim() !== "") return map[k];
      }
      return "";
    };
    return {
      vehicleMake: String(get("vehiclemake", "make") || "").trim(),
      vehicleModel: String(get("vehiclemodel", "model", "vehiclemodelname") || "").trim(),
      sldModelName: String(get("sldmodelnamenumber", "sldmodelname", "sldmodel", "modelnamenumber") || "").trim(),
      sldType: String(get("sldtype", "type") || "").trim(),
      tacOrCop: String(get("taccopnumber", "tacorcop", "tacnumber", "copnumber", "taccop") || "").trim(),
      testingAgency: String(get("testingagency", "agency") || "").trim(),
      testReportNo: String(get("testreportnumber", "testreportno", "testreport") || "").trim(),
      setSpeed: get("setspeedkmph", "setspeed", "speedkmph", "speed"),
    };
  });

  return rows.filter(
    (r: { sldModelName: string; vehicleModel: string }) => r.sldModelName || r.vehicleModel,
  );
}

export default function SldOemsPage() {
  const [query, setQuery] = useState("");
  const [openOem, setOpenOem] = useState(false);
  const [editOemId, setEditOemId] = useState<string | null>(null);
  const [openModel, setOpenModel] = useState(false);
  const [editModel, setEditModel] = useState<SldDeviceModel | null>(null);
  const [modelOemId, setModelOemId] = useState<string>("");
  const [vehicleModelId, setVehicleModelId] = useState<string>("");
  const [vehicleModelLabel, setVehicleModelLabel] = useState("");
  const [openVehicles, setOpenVehicles] = useState(false);
  const [vehicleCsv, setVehicleCsv] = useState("");
  const [manualMake, setManualMake] = useState("");
  const [manualModelName, setManualModelName] = useState("");
  const [manualSpeed, setManualSpeed] = useState("");
  const [manualTestReport, setManualTestReport] = useState("");
  const [uploadSummary, setUploadSummary] = useState<any>(null);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [importingOemId, setImportingOemId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [oemForm, setOemForm] = useState({
    name: "",
    code: "",
    authorizedStates: [] as string[],
  });
  const [modelForm, setModelForm] = useState(emptyModelForm);

  const { data: oems = [], isLoading, error } = useSldOems();
  const { data: states = [] } = useStates();
  const { data: vehicleModels = [], isLoading: vehiclesLoading } = useSldVehicleModels(vehicleModelId);
  const createOem = useCreateSldOem();
  const updateOem = useUpdateSldOem();
  const deleteOem = useDeleteSldOem();
  const createModel = useCreateSldModel();
  const updateModel = useUpdateSldModel();
  const deleteModel = useDeleteSldModel();
  const uploadVehicles = useUploadSldVehicleModels();
  const importVariantList = useImportSldVariantList();
  const createVehicle = useCreateSldVehicleModel();
  const deleteVehicle = useDeleteSldVehicleModel();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return oems;
    return oems.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q) ||
        (o.models || []).some(
          (m) => m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q),
        ),
    );
  }, [oems, query]);

  const toggleState = (code: string) => {
    setOemForm((prev) => {
      const current = prev.authorizedStates || [];
      if (current.includes(code)) {
        return { ...prev, authorizedStates: current.filter((c) => c !== code) };
      }
      return { ...prev, authorizedStates: [...current, code] };
    });
  };

  const submitOem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oemForm.name || !oemForm.code) return;
    try {
      if (editOemId) {
        await updateOem.mutateAsync({ id: editOemId, data: oemForm });
      } else {
        await createOem.mutateAsync(oemForm);
      }
      setOpenOem(false);
      setEditOemId(null);
      setOemForm({ name: "", code: "", authorizedStates: [] });
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to save SLD OEM");
    }
  };

  const submitModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelForm.name || !modelForm.code || !modelOemId) return;
    const payload = {
      name: modelForm.name,
      code: modelForm.code,
      sldType: modelForm.sldType || null,
      testingAgency: modelForm.testingAgency || null,
      tacOrCop: modelForm.tacOrCop || null,
      copDocument: modelForm.copDocument || null,
      copValidity: modelForm.copValidity || null,
    };
    try {
      if (editModel) {
        await updateModel.mutateAsync({ id: editModel.id, data: payload });
      } else {
        await createModel.mutateAsync({ ...payload, sldOemId: modelOemId });
      }
      setOpenModel(false);
      setEditModel(null);
      setModelForm(emptyModelForm);
    } catch (err: any) {
      alert(err?.response?.data?.message || "Failed to save model");
    }
  };

  const openVehicleManager = (m: SldDeviceModel) => {
    setVehicleModelId(m.id);
    setVehicleModelLabel(`${m.name} (${m.code})`);
    setVehicleCsv("");
    setManualMake("");
    setManualModelName("");
    setManualSpeed("");
    setManualTestReport("");
    setUploadSummary(null);
    setOpenVehicles(true);
  };

  const startImport = (oemId: string) => {
    setImportingOemId(oemId);
    setImportSummary(null);
    fileInputRef.current?.click();
  };

  const onImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !importingOemId) return;
    try {
      const buf = await file.arrayBuffer();
      const rows = parseVariantWorkbook(buf);
      if (!rows.length) {
        alert("No data rows found in Excel");
        return;
      }
      const res = await importVariantList.mutateAsync({ oemId: importingOemId, rows });
      setImportSummary(res);
      alert(
        `Import done.\nModels created: ${res.modelsCreated}, updated: ${res.modelsUpdated}\nVariants created: ${res.variantsCreated}, skipped: ${res.variantsSkipped}\nInvalid rows: ${res.rowsInvalid}`,
      );
    } catch (err: any) {
      alert(err?.response?.data?.message || "Import failed");
    } finally {
      setImportingOemId(null);
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading SLD OEMs</div>;

  return (
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={onImportFile}
      />

      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">SLD OEMs</div>
          <div className="text-sm text-gray-600">
            OEM → Device Model (type, TAC/COP by agency) → Vehicle variants (make, model, set speed, test report)
          </div>
        </div>
        <button
          onClick={() => {
            setOemForm({ name: "", code: "", authorizedStates: [] });
            setEditOemId(null);
            setOpenOem(true);
          }}
          className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 text-sm"
        >
          <Plus size={16} />
          Add SLD OEM
        </button>
      </div>

      {importSummary ? (
        <div className="text-sm border rounded p-2 bg-gray-50">
          Last import — models +{importSummary.modelsCreated} / ~{importSummary.modelsUpdated}, variants +
          {importSummary.variantsCreated}, skipped {importSummary.variantsSkipped}, invalid{" "}
          {importSummary.rowsInvalid}
        </div>
      ) : null}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
        <input
          type="text"
          placeholder="Search SLD OEMs or models..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white border rounded-lg p-8 text-center text-gray-500">No SLD OEMs yet</div>
        ) : (
          filtered.map((oem: SldOem) => (
            <div key={oem.id} className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between bg-gray-50">
                <div>
                  <div className="font-semibold">{oem.name}</div>
                  <div className="text-xs text-gray-500">
                    Code: {oem.code} · States: {(oem.authorizedStates || []).join(", ") || "—"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    className="px-3 py-1.5 text-sm border rounded hover:bg-white inline-flex items-center gap-1"
                    title="Import SLD STANDARD VARIANT LIST Excel"
                    onClick={() => startImport(oem.id)}
                    disabled={importVariantList.isPending}
                  >
                    <FileSpreadsheet size={14} /> Import Excel
                  </button>
                  <button
                    className="px-3 py-1.5 text-sm border rounded hover:bg-white"
                    onClick={() => {
                      setModelOemId(oem.id);
                      setEditModel(null);
                      setModelForm(emptyModelForm);
                      setOpenModel(true);
                    }}
                  >
                    <span className="inline-flex items-center gap-1">
                      <Plus size={14} /> Model
                    </span>
                  </button>
                  <button
                    className="p-2 border rounded hover:bg-white"
                    onClick={() => {
                      setEditOemId(oem.id);
                      setOemForm({
                        name: oem.name,
                        code: oem.code,
                        authorizedStates: oem.authorizedStates || [],
                      });
                      setOpenOem(true);
                    }}
                  >
                    <Edit size={14} />
                  </button>
                  <button
                    className="p-2 border rounded hover:bg-red-50 text-red-600"
                    onClick={async () => {
                      if (!confirm(`Delete SLD OEM ${oem.name}?`)) return;
                      try {
                        await deleteOem.mutateAsync(oem.id);
                      } catch (err: any) {
                        alert(err?.response?.data?.message || "Failed to delete");
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="p-3 overflow-x-auto">
                {(oem.models || []).length === 0 ? (
                  <div className="text-sm text-gray-400 px-1">No models yet — add manually or Import Excel</div>
                ) : (
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1 px-2">Model</th>
                        <th className="py-1 px-2">Type</th>
                        <th className="py-1 px-2">TAC / COP</th>
                        <th className="py-1 px-2">Agency</th>
                        <th className="py-1 px-2">Variants</th>
                        <th className="py-1 px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(oem.models || []).map((m) => (
                        <tr key={m.id} className="border-t">
                          <td className="py-2 px-2">
                            <div className="font-medium">{m.name}</div>
                            <div className="text-xs text-gray-500">{m.code}</div>
                          </td>
                          <td className="py-2 px-2">{m.sldType || "—"}</td>
                          <td className="py-2 px-2">
                            <div>{displayApproval(m)}</div>
                            <div className="text-xs text-gray-500">
                              {m.copValidity ? `Valid: ${new Date(m.copValidity).toLocaleDateString()}` : ""}
                            </div>
                          </td>
                          <td className="py-2 px-2">{m.testingAgency || "—"}</td>
                          <td className="py-2 px-2">{m._count?.vehicleModels ?? 0}</td>
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <button
                              className="p-1.5 border rounded mr-1 hover:bg-gray-50"
                              title="Approved vehicle variants"
                              onClick={() => openVehicleManager(m)}
                            >
                              <Car size={12} />
                            </button>
                            <button
                              className="p-1.5 border rounded mr-1 hover:bg-gray-50"
                              onClick={() => {
                                setModelOemId(oem.id);
                                setEditModel(m);
                                const agency = m.testingAgency || "";
                                const a = agency.toUpperCase();
                                const tacOrCop = a.includes("ARAI")
                                  ? m.copNumber || m.tacNumber || ""
                                  : m.tacNumber || m.copNumber || "";
                                setModelForm({
                                  name: m.name,
                                  code: m.code,
                                  sldType: m.sldType || "",
                                  tacOrCop,
                                  copDocument: m.copDocument || "",
                                  copValidity: m.copValidity
                                    ? new Date(m.copValidity).toISOString().slice(0, 10)
                                    : "",
                                  testingAgency: agency,
                                });
                                setOpenModel(true);
                              }}
                            >
                              <Edit size={12} />
                            </button>
                            <button
                              className="p-1.5 border rounded hover:bg-red-50 text-red-600"
                              onClick={async () => {
                                if (!confirm(`Delete model ${m.name}?`)) return;
                                try {
                                  await deleteModel.mutateAsync(m.id);
                                } catch (err: any) {
                                  alert(err?.response?.data?.message || "Failed to delete model");
                                }
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <Modal open={openOem} onClose={() => setOpenOem(false)} title={editOemId ? "Edit SLD OEM" : "Add SLD OEM"}>
        <form onSubmit={submitOem} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={oemForm.name}
              onChange={(e) => setOemForm({ ...oemForm, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Code</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={oemForm.code}
              onChange={(e) => setOemForm({ ...oemForm, code: e.target.value.toUpperCase() })}
              required
              disabled={!!editOemId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Authorized States</label>
            <div className="border rounded p-2 h-40 overflow-y-auto bg-white">
              {states.map((s) => (
                <label key={s.code} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={oemForm.authorizedStates.includes(s.code)}
                    onChange={() => toggleState(s.code)}
                  />
                  <span className="text-sm">
                    {s.name} ({s.code})
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-3 py-2 border rounded text-sm" onClick={() => setOpenOem(false)}>
              Cancel
            </button>
            <button type="submit" className="px-3 py-2 bg-primary text-white rounded text-sm">
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openModel}
        onClose={() => setOpenModel(false)}
        title={editModel ? "Edit Device Model" : "Add Device Model"}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={submitModel} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Model Name</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.name}
                onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Model Code</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.code}
                onChange={(e) => setModelForm({ ...modelForm, code: e.target.value.toUpperCase() })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">SLD Type</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.sldType}
                onChange={(e) => setModelForm({ ...modelForm, sldType: e.target.value })}
              >
                <option value="">—</option>
                <option value="FUEL">FUEL</option>
                <option value="CABLE">CABLE</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Testing Agency</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.testingAgency}
                onChange={(e) => setModelForm({ ...modelForm, testingAgency: e.target.value })}
                placeholder="ARAI or ICAT"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">{approvalLabel(modelForm.testingAgency)}</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.tacOrCop}
                onChange={(e) => setModelForm({ ...modelForm, tacOrCop: e.target.value })}
                placeholder="One column — ARAI→COP, ICAT→TAC"
              />
              <div className="text-xs text-gray-500 mt-1">
                Single approval number from the Excel column. Mapped by agency (ARAI = COP, ICAT = TAC).
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">COP Validity (optional)</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.copValidity}
                onChange={(e) => setModelForm({ ...modelForm, copValidity: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">COP Document (URL / path, optional)</label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              value={modelForm.copDocument}
              onChange={(e) => setModelForm({ ...modelForm, copDocument: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="px-3 py-2 border rounded text-sm" onClick={() => setOpenModel(false)}>
              Cancel
            </button>
            <button type="submit" className="px-3 py-2 bg-primary text-white rounded text-sm">
              Save
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openVehicles}
        onClose={() => setOpenVehicles(false)}
        title={`Vehicle variants — ${vehicleModelLabel}`}
        maxWidth="max-w-4xl"
      >
        <div className="space-y-4">
          <div className="text-xs text-gray-500">
            CSV: <code>make,model,setSpeed,testReport</code> — set speed required. Prefer OEM-level Excel import for full lists.
          </div>
          <textarea
            className="w-full border rounded px-3 py-2 text-sm h-28 font-mono"
            placeholder={"TATA,ACE,80,CT0VM1340\nFORCE,TRAVELLER,60,"}
            value={vehicleCsv}
            onChange={(e) => setVehicleCsv(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 px-3 py-2 bg-primary text-white rounded text-sm"
              onClick={async () => {
                if (!vehicleModelId || !vehicleCsv.trim()) return;
                try {
                  const res = await uploadVehicles.mutateAsync({ modelId: vehicleModelId, csvText: vehicleCsv });
                  setUploadSummary(res);
                  setVehicleCsv("");
                } catch (err: any) {
                  alert(err?.response?.data?.message || "Upload failed");
                }
              }}
            >
              <Upload size={14} /> Upload CSV
            </button>
          </div>

          {uploadSummary ? (
            <div className="text-sm border rounded p-2 bg-gray-50">
              Created: {uploadSummary.created} · Already existed: {(uploadSummary.alreadyExists || []).length}
            </div>
          ) : null}

          <div className="border-t pt-3">
            <div className="text-sm font-medium mb-2">Add one variant</div>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Make"
                value={manualMake}
                onChange={(e) => setManualMake(e.target.value)}
              />
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Model name"
                value={manualModelName}
                onChange={(e) => setManualModelName(e.target.value)}
              />
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Set speed *"
                value={manualSpeed}
                onChange={(e) => setManualSpeed(e.target.value)}
              />
              <input
                className="border rounded px-3 py-2 text-sm"
                placeholder="Test report"
                value={manualTestReport}
                onChange={(e) => setManualTestReport(e.target.value)}
              />
              <button
                type="button"
                className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
                onClick={async () => {
                  if (!manualModelName.trim() || !manualSpeed.trim()) {
                    alert("Model name and set speed are required");
                    return;
                  }
                  const speed = parseInt(manualSpeed, 10);
                  if (!Number.isFinite(speed) || speed <= 0) {
                    alert("Set speed must be a positive number");
                    return;
                  }
                  try {
                    await createVehicle.mutateAsync({
                      modelId: vehicleModelId,
                      data: {
                        make: manualMake.trim() || undefined,
                        modelName: manualModelName.trim(),
                        setSpeedKmph: speed,
                        testReportNo: manualTestReport.trim() || undefined,
                      },
                    });
                    setManualMake("");
                    setManualModelName("");
                    setManualSpeed("");
                    setManualTestReport("");
                  } catch (err: any) {
                    alert(err?.response?.data?.message || "Failed to add");
                  }
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div className="border rounded overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 sticky top-0">
                <tr>
                  <th className="px-3 py-2">Make</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Set speed</th>
                  <th className="px-3 py-2">Test report</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vehiclesLoading ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : vehicleModels.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                      No variants yet
                    </td>
                  </tr>
                ) : (
                  vehicleModels.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2">{v.make || "—"}</td>
                      <td className="px-3 py-2">{v.modelName}</td>
                      <td className="px-3 py-2">{v.setSpeedKmph} km/h</td>
                      <td className="px-3 py-2 text-xs">{v.testReportNo || "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="p-1.5 border rounded hover:bg-red-50 text-red-600"
                          onClick={async () => {
                            if (!confirm("Delete this variant?")) return;
                            try {
                              await deleteVehicle.mutateAsync(v.id);
                            } catch (err: any) {
                              alert(err?.response?.data?.message || "Delete failed");
                            }
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
