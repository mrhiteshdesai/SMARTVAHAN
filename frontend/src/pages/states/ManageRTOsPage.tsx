import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Search, Upload, Edit, Trash2 } from "lucide-react";
import Modal from "../../ui/Modal";
import { useRTOs, useCreateRTO, useUpdateRTO, useDeleteRTO, RTO } from "../../api/hooks";

export default function ManageRTOsPage() {
  const { code: stateCode = "" } = useParams();
  const [query, setQuery] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState<RTO>({ name: "", code: "", stateCode });
  const [openImport, setOpenImport] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const { data: rtos = [], isLoading, error } = useRTOs(stateCode);
  const createRTO = useCreateRTO();
  const updateRTO = useUpdateRTO();
  const deleteRTO = useDeleteRTO();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let res = rtos;
    if (q) {
      res = rtos.filter((r) => r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
    }
    return res.sort((a, b) => a.code.localeCompare(b.code));
  }, [rtos, query]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code) return;
    try {
      if (isEdit) {
        await updateRTO.mutateAsync({ code: form.code, data: form });
      } else {
        await createRTO.mutateAsync({ ...form, stateCode });
      }
      setOpenAdd(false);
      setForm({ name: "", code: "", stateCode });
      setIsEdit(false);
    } catch (err) {
      console.error("Failed to save RTO:", err);
      alert("Failed to save RTO. Code might be duplicate.");
    }
  };

  const onDelete = async (code: string) => {
    if (confirm("Are you sure you want to delete this RTO?")) {
      try {
        await deleteRTO.mutateAsync(code);
      } catch (err) {
        console.error("Failed to delete RTO:", err);
        alert("Failed to delete RTO.");
      }
    }
  };

  const onEdit = (rto: RTO) => {
    setIsEdit(true);
    setForm(rto);
    setOpenAdd(true);
  };

  // CSV Import Logic (simplified client-side parsing then batch create)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const csv = evt.target?.result as string;
      const lines = csv.trim().split(/\r?\n/);
      const header = lines.shift()?.split(",") ?? [];
      const idxName = header.findIndex((h) => h.trim().toLowerCase() === "name");
      const idxCode = header.findIndex((h) => h.trim().toLowerCase() === "code");

      if (idxName === -1 || idxCode === -1) {
        setUploadError("Invalid CSV format. Header must contain 'name' and 'code'.");
        return;
      }

      const promises = [];
      for (const line of lines) {
        const cols = line.split(",");
        const name = cols[idxName]?.trim();
        const code = cols[idxCode]?.trim();
        if (name && code) {
           promises.push(createRTO.mutateAsync({ name, code, stateCode }));
        }
      }

      try {
        await Promise.allSettled(promises);
        setOpenImport(false);
        setUploadError("");
        alert("Import completed (check console for any duplicates/errors)");
      } catch (err) {
        setUploadError("Import failed");
      }
    };
    reader.readAsText(file);
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading RTOs</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <div>
            <div className="text-xl font-semibold">Manage RTOs</div>
            <div className="text-sm text-gray-600">State: {stateCode}</div>
            </div>
            <div className="flex items-center gap-2">
            <button
                onClick={() => {
                  setForm({ name: "", code: "", stateCode });
                  setIsEdit(false);
                  setOpenAdd(true);
                }}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 text-sm"
            >
                <Plus size={16} />
                <span>Add RTO</span>
            </button>
            <button
                onClick={() => setOpenImport(true)}
                className="flex items-center gap-2 border border-gray-300 bg-white text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 text-sm"
            >
                <Upload size={16} />
                <span>Import CSV</span>
            </button>
            </div>
        </div>

        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
            type="text"
            placeholder="Search RTOs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RTO Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                  No RTOs found
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.code} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{r.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{r.code}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEdit(r)}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => onDelete(r.code)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        title={isEdit ? "Edit RTO" : "Add RTO"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RTO Name</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Pune RTO"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RTO Code</label>
            <input
              required
              type="text"
              value={form.code}
              readOnly={isEdit}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${isEdit ? 'bg-gray-100' : ''}`}
              placeholder="e.g. MH12"
            />
          </div>
          
          <div className="flex justify-end gap-3 mt-6">
            <button
              type="button"
              onClick={() => setOpenAdd(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-md"
            >
              {isEdit ? "Save Changes" : "Add RTO"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={openImport}
        onClose={() => setOpenImport(false)}
        title="Import RTOs from CSV"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload a CSV file with headers: <code>name, code</code>
          </p>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
          />
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
        </div>
      </Modal>
    </div>
  );
}
