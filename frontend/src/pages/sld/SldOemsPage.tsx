import { useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2, Upload, Car } from "lucide-react";
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
  useCreateSldVehicleModel,
  useDeleteSldVehicleModel,
  useStates,
  SldOem,
  SldDeviceModel,
} from "../../api/hooks";

const emptyModelForm = {
  name: "",
  code: "",
  tacNumber: "",
  copNumber: "",
  copDocument: "",
  copValidity: "",
  testingAgency: "",
  speedLimit: "",
};

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
  const [uploadSummary, setUploadSummary] = useState<any>(null);

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
      ...modelForm,
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
    setUploadSummary(null);
    setOpenVehicles(true);
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading SLD OEMs</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">SLD OEMs</div>
          <div className="text-sm text-gray-600">
            OEM → Device Model (TAC/COP/Agency/Class/Speed) → Approved Vehicle Models
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
                  <div className="text-sm text-gray-400 px-1">No models yet</div>
                ) : (
                  <table className="w-full text-sm min-w-[900px]">
                    <thead>
                      <tr className="text-left text-gray-500">
                        <th className="py-1 px-2">Model</th>
                        <th className="py-1 px-2">TAC</th>
                        <th className="py-1 px-2">COP / Validity</th>
                        <th className="py-1 px-2">Agency</th>
                        <th className="py-1 px-2">Speed</th>
                        <th className="py-1 px-2">Vehicles</th>
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
                          <td className="py-2 px-2">{m.tacNumber || "—"}</td>
                          <td className="py-2 px-2">
                            <div>{m.copNumber || "—"}</div>
                            <div className="text-xs text-gray-500">
                              {m.copValidity ? new Date(m.copValidity).toLocaleDateString() : "—"}
                            </div>
                          </td>
                          <td className="py-2 px-2">{m.testingAgency || "—"}</td>
                          <td className="py-2 px-2">{m.speedLimit || "—"}</td>
                          <td className="py-2 px-2">{m._count?.vehicleModels ?? 0}</td>
                          <td className="py-2 px-2 text-right whitespace-nowrap">
                            <button
                              className="p-1.5 border rounded mr-1 hover:bg-gray-50"
                              title="Approved vehicle models"
                              onClick={() => openVehicleManager(m)}
                            >
                              <Car size={12} />
                            </button>
                            <button
                              className="p-1.5 border rounded mr-1 hover:bg-gray-50"
                              onClick={() => {
                                setModelOemId(oem.id);
                                setEditModel(m);
                                setModelForm({
                                  name: m.name,
                                  code: m.code,
                                  tacNumber: m.tacNumber || "",
                                  copNumber: m.copNumber || "",
                                  copDocument: m.copDocument || "",
                                  copValidity: m.copValidity
                                    ? new Date(m.copValidity).toISOString().slice(0, 10)
                                    : "",
                                  testingAgency: m.testingAgency || "",
                                  speedLimit: m.speedLimit || "",
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
              <label className="block text-sm font-medium mb-1">TAC Number</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.tacNumber}
                onChange={(e) => setModelForm({ ...modelForm, tacNumber: e.target.value })}
                placeholder="No validity"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Testing Agency</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.testingAgency}
                onChange={(e) => setModelForm({ ...modelForm, testingAgency: e.target.value })}
                placeholder="e.g. ICAT"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">COP Number</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.copNumber}
                onChange={(e) => setModelForm({ ...modelForm, copNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">COP Validity</label>
              <input
                type="date"
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.copValidity}
                onChange={(e) => setModelForm({ ...modelForm, copValidity: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Speed Limit (km/h)</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={modelForm.speedLimit}
                onChange={(e) => setModelForm({ ...modelForm, speedLimit: e.target.value })}
                placeholder="e.g. 80"
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
        title={`Approved Vehicle Models — ${vehicleModelLabel}`}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="text-xs text-gray-500">
            CSV: optional header. Columns <code>make,model</code> or single column model name.
          </div>
          <textarea
            className="w-full border rounded px-3 py-2 text-sm h-28 font-mono"
            placeholder={"FORCE,FORCE TRAVELLER(26+D)BSIII\nTATA,ACE"}
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
            <div className="text-sm font-medium mb-2">Add one</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
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
              <button
                type="button"
                className="px-3 py-2 border rounded text-sm hover:bg-gray-50"
                onClick={async () => {
                  if (!manualModelName.trim()) return;
                  try {
                    await createVehicle.mutateAsync({
                      modelId: vehicleModelId,
                      data: { make: manualMake.trim() || undefined, modelName: manualModelName.trim() },
                    });
                    setManualMake("");
                    setManualModelName("");
                  } catch (err: any) {
                    alert(err?.response?.data?.message || "Failed to add");
                  }
                }}
              >
                Add
              </button>
            </div>
          </div>

          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Make</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {vehiclesLoading ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                      Loading...
                    </td>
                  </tr>
                ) : vehicleModels.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                      No approved vehicle models yet
                    </td>
                  </tr>
                ) : (
                  vehicleModels.map((v) => (
                    <tr key={v.id}>
                      <td className="px-3 py-2">{v.make || "—"}</td>
                      <td className="px-3 py-2">{v.modelName}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="p-1.5 border rounded hover:bg-red-50 text-red-600"
                          onClick={async () => {
                            if (!confirm("Delete this vehicle model?")) return;
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
