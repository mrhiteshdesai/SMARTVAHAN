import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Edit, Trash2, Users } from "lucide-react";
import Modal from "../../ui/Modal";
import { useStates, useCreateState, useUpdateState, useDeleteState, State } from "../../api/hooks";

export default function StatesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState<State & { username?: string; password?: string }>({ name: "", code: "", username: "", password: "" });
  const [isEdit, setIsEdit] = useState(false);

  // Queries
  const { data: states = [], isLoading, error } = useStates();
  const createState = useCreateState();
  const updateState = useUpdateState();
  const deleteState = useDeleteState();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return states;
    return states.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q)
    );
  }, [states, query]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code) return;
    
    try {
      if (isEdit) {
        await updateState.mutateAsync({ code: form.code, data: form });
      } else {
        await createState.mutateAsync(form);
      }
      setOpenAdd(false);
      setForm({ name: "", code: "" });
      setIsEdit(false);
    } catch (err) {
      const message =
        (err as any)?.response?.data?.message ||
        (err as any)?.message ||
        "Failed to save state";
      alert(message);
    }
  };

  const onDelete = async (code: string) => {
    if (confirm("Are you sure you want to delete this state?")) {
      try {
        await deleteState.mutateAsync(code);
      } catch (err) {
        console.error("Failed to delete state:", err);
        alert("Failed to delete state.");
      }
    }
  };

  const onEdit = (state: State) => {
    setIsEdit(true);
    setForm(state);
    setOpenAdd(true);
  };

  const onManageRTOs = (stateCode: string) => {
    navigate(`/users/states/${encodeURIComponent(stateCode)}/rto`);
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading states</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <div>
            <div className="text-xl font-semibold">States</div>
            <div className="text-sm text-gray-600">Manage states</div>
            </div>
            <div className="flex items-center gap-2">
            <button
                onClick={() => {
                setForm({ name: "", code: "", username: "", password: "" });
                setIsEdit(false);
                setOpenAdd(true);
                }}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 text-sm"
            >
                <Plus size={16} />
                <span>Add State</span>
            </button>
            </div>
        </div>

        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
            type="text"
            placeholder="Search states..."
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">State Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Authorized Brands</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">RTO Count</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No states found
                </td>
              </tr>
            ) : (
              filtered.map((s: any) => (
                <tr key={s.code} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{s.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.code}</td>
                  <td className="px-6 py-4">
                     <div className="flex flex-wrap gap-1">
                        {s.authorizedBrands && s.authorizedBrands.length > 0 ? (
                            s.authorizedBrands.map((b: string) => (
                                <span key={b} className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs border border-green-100">
                                    {b}
                                </span>
                            ))
                        ) : (
                            <span className="text-xs text-gray-400">None</span>
                        )}
                     </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-semibold">
                    {s.rtosCount || 0}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                        <button
                            onClick={() => onManageRTOs(s.code)}
                            title="Manage RTOs"
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        >
                            <Users size={16} />
                        </button>
                      <button
                        onClick={() => onEdit(s)}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => onDelete(s.code)}
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
        title={isEdit ? "Edit State" : "Add State"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State Name</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Maharashtra"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State Code</label>
            <input
              required
              type="text"
              value={form.code}
              readOnly={isEdit}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${isEdit ? 'bg-gray-100' : ''}`}
              placeholder="e.g. MH"
            />
          </div>

          <div className="p-4 bg-gray-50 rounded-md space-y-3 border">
            <div className="text-sm font-semibold text-gray-700">State Admin Credentials</div>
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Username (Phone / User ID)</label>
                <input
                    type="text"
                    value={form.username}
                    readOnly={isEdit}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm ${isEdit ? 'bg-gray-200' : ''}`}
                    placeholder="Mobile Number"
                />
            </div>
            <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                    {isEdit ? "New Password (leave blank to keep current)" : "Password"}
                </label>
                <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                    placeholder={isEdit ? "Enter new password" : "Password"}
                />
            </div>
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
              {isEdit ? "Save Changes" : "Add State"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
