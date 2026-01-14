import { useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import Modal from "../../ui/Modal";
import { useOEMs, useCreateOEM, useUpdateOEM, useDeleteOEM, useStates, OEM } from "../../api/hooks";

export default function OEMsPage() {
  const [query, setQuery] = useState("");
  const [openAdd, setOpenAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const [form, setForm] = useState<any>({
    name: "",
    code: "",
    authorizedStates: [],
    username: "",
    password: "",
    logo: "",
    logoFile: null,
    copDocument: "",
    copValidity: ""
  });

  // Queries
  const { data: oems = [], isLoading, error } = useOEMs();
  const { data: states = [] } = useStates();
  
  const createOEM = useCreateOEM();
  const updateOEM = useUpdateOEM();
  const deleteOEM = useDeleteOEM();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return oems;
    return oems.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.code.toLowerCase().includes(q)
    );
  }, [oems, query]);

  const toggleState = (code: string) => {
    setForm((prev: any) => {
      const current = prev.authorizedStates || [];
      if (current.includes(code)) {
        return { ...prev, authorizedStates: current.filter((c: string) => c !== code) };
      } else {
        return { ...prev, authorizedStates: [...current, code] };
      }
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) { // 500KB limit
        alert("File size too large. Please upload an image smaller than 500KB.");
        return;
      }
      setForm((prev: any) => ({ 
          ...prev, 
          logoFile: file, 
          logo: URL.createObjectURL(file) // For preview
      }));
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.code) return;
    
    const formData = new FormData();
    formData.append('name', form.name);
    formData.append('code', form.code);
    formData.append('authorizedStates', JSON.stringify(form.authorizedStates));
    
    if (form.copDocument) formData.append('copDocument', form.copDocument);
    if (form.copValidity) formData.append('copValidity', new Date(form.copValidity).toISOString());
    
    if (form.logoFile) {
        formData.append('logo', form.logoFile);
    }

    // Handle username/password for create
    if (!editId && form.username && form.password) {
        formData.append('username', form.username);
        formData.append('password', form.password);
    }

    try {
      if (editId) {
        await updateOEM.mutateAsync({ id: editId, data: formData });
      } else {
        await createOEM.mutateAsync(formData);
      }
      setOpenAdd(false);
      setForm({ name: "", code: "", authorizedStates: [], logo: "", logoFile: null, copDocument: "", copValidity: "" });
      setEditId(null);
    } catch (err) {
      console.error("Failed to save OEM:", err);
      alert("Failed to save OEM.");
    }
  };

  const onDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this OEM?")) {
      try {
        await deleteOEM.mutateAsync(id);
      } catch (err) {
        console.error("Failed to delete OEM:", err);
        alert("Failed to delete OEM.");
      }
    }
  };

  const onEdit = (oem: OEM) => {
    setEditId(oem.id);
    setForm({
      name: oem.name,
      code: oem.code,
      authorizedStates: oem.authorizedStates,
      logo: oem.logo, // Existing path/url
      logoFile: null,
      copDocument: oem.copDocument || "",
      copValidity: oem.copValidity ? new Date(oem.copValidity).toISOString().split('T')[0] : ""
    });
    setOpenAdd(true);
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading OEMs</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <div>
            <div className="text-xl font-semibold">OEMs</div>
            <div className="text-sm text-gray-600">Manage manufacturers</div>
            </div>
            <div className="flex items-center gap-2">
            <button
                onClick={() => {
                setForm({ name: "", code: "", authorizedStates: [], username: "", password: "", logo: "", copDocument: "", copValidity: "" });
                setEditId(null);
                setOpenAdd(true);
                }}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 text-sm"
            >
                <Plus size={16} />
                <span>Add OEM</span>
            </button>
            </div>
        </div>

        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
            type="text"
            placeholder="Search OEMs..."
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">OEM Name / Logo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code / Admin</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">COP Details</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Auth States</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No OEMs found
                </td>
              </tr>
            ) : (
              filtered.map((oem: any) => (
                <tr key={oem.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {oem.logo ? (
                        <img src={oem.logo} alt={oem.name} className="h-10 w-10 object-contain border rounded bg-white" />
                      ) : (
                        <div className="h-10 w-10 bg-gray-100 rounded flex items-center justify-center text-xs text-gray-400">No Logo</div>
                      )}
                      <div className="font-medium text-gray-900">{oem.name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 font-semibold">{oem.code}</div>
                    {oem.users && oem.users.length > 0 ? (
                      <div className="text-xs text-gray-500 mt-1">
                        Admin: {oem.users[0].phone} <br/>
                        <span className="text-[10px] text-gray-400">({oem.users[0].name})</span>
                      </div>
                    ) : (
                      <span className="text-xs text-red-400">No Admin</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm">
                     <div className="flex flex-col gap-1">
                        {oem.copDocument ? (
                            <a href={oem.copDocument} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs flex items-center gap-1">
                                View COP
                            </a>
                        ) : <span className="text-gray-400 text-xs">No COP</span>}
                        {oem.copValidity ? (
                            <div className="text-xs text-gray-500">
                                Valid till: {new Date(oem.copValidity).toLocaleDateString()}
                            </div>
                        ) : null}
                     </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {oem.authorizedStates.map((s: string) => (
                        <span key={s} className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs border border-blue-100">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEdit(oem)}
                        className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => onDelete(oem.id)}
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
        title={editId ? "Edit OEM" : "Add OEM"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OEM Name</label>
            <input
              required
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="e.g. Tata Motors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">OEM Code</label>
            <input
              required
              type="text"
              value={form.code}
              readOnly={!!editId}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 ${editId ? 'bg-gray-100' : ''}`}
              placeholder="e.g. TATA"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OEM Logo Upload</label>
                <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary/90"
                    />
                    {form.logo && <img src={form.logo} alt="Logo Preview" className="h-10 w-auto object-contain border rounded" />}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">COP</label>
                <input
                  type="text"
                  value={form.copDocument}
                  onChange={(e) => setForm({ ...form, copDocument: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                  placeholder="Enter COP details"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">COP Validity</label>
                <input
                  type="date"
                  value={form.copValidity}
                  onChange={(e) => setForm({ ...form, copValidity: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
          </div>

          {!editId && (
            <div className="p-4 bg-gray-50 rounded-md space-y-3 border">
                <div className="text-sm font-semibold text-gray-700">Create OEM Admin</div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Username (Phone / User ID)</label>
                    <input
                        type="text"
                        value={form.username}
                        onChange={(e) => setForm({ ...form, username: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        placeholder="Mobile Number"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
                    <input
                        type="password"
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
                        placeholder="Password"
                    />
                </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Authorised States</label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto border p-2 rounded-md">
              {states.map((s) => (
                <label key={s.code} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.authorizedStates.includes(s.code)}
                    onChange={() => toggleState(s.code)}
                    className="rounded border-gray-300 text-primary focus:ring-primary/50"
                  />
                  <span>{s.name} ({s.code})</span>
                </label>
              ))}
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
              {editId ? "Save Changes" : "Add OEM"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
