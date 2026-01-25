import { useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import Modal from "../../ui/Modal";
import { useSystemUsers, useCreateSystemUser, useUpdateSystemUser, useDeleteSystemUser, SystemUser } from "../../api/hooks";

type UserRole = "SUPER_ADMIN" | "STATE_ADMIN" | "OEM_ADMIN" | "ADMIN" | "SUB_ADMIN";
type UserStatus = "ACTIVE" | "INACTIVE";

export default function SystemUsersPage() {
  const [query, setQuery] = useState("");
  
  // Modal state
  const [openAdd, setOpenAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState<{
    name: string;
    email: string;
    phone: string;
    password: string;
    role: UserRole;
    status: UserStatus;
  }>({
    name: "",
    email: "",
    phone: "",
    password: "",
    role: "STATE_ADMIN",
    status: "ACTIVE"
  });

  const { data: users = [], isLoading, error } = useSystemUsers();
  const createUser = useCreateSystemUser();
  const updateUser = useUpdateSystemUser();
  const deleteUser = useDeleteSystemUser();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.phone.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, query]);

  const resetForm = () => {
    setForm({
      name: "",
      email: "",
      phone: "",
      password: "",
      role: "STATE_ADMIN",
      status: "ACTIVE"
    });
    setEditId(null);
  };

  const openNew = () => {
    resetForm();
    setOpenAdd(true);
  };

  const openEdit = (user: SystemUser) => {
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone,
      password: "", // Don't populate password
      role: user.role as UserRole,
      status: user.status as UserStatus
    });
    setEditId(user.id);
    setOpenAdd(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form };
      // Remove empty password if editing
      if (editId && !payload.password) {
        delete (payload as any).password;
      }

      if (editId) {
        await updateUser.mutateAsync({ id: editId, data: payload });
      } else {
        await createUser.mutateAsync(payload);
      }
      setOpenAdd(false);
      resetForm();
    } catch (err: any) {
      console.error("Failed to save user:", err);
      const msg = err.response?.data?.message || "Failed to save user.";
      alert(msg);
    }
  };

  const onDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this user?")) {
      try {
        await deleteUser.mutateAsync(id);
      } catch (err) {
        console.error("Failed to delete user:", err);
        alert("Failed to delete user.");
      }
    }
  };

  const toggleStatus = async (user: SystemUser) => {
    try {
      const newStatus = user.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
      await updateUser.mutateAsync({ id: user.id, data: { status: newStatus } });
    } catch (err) {
      console.error("Failed to update status:", err);
      alert("Failed to update status.");
    }
  };

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading users</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">System Users</h1>
            <p className="text-sm text-gray-500">Manage system administrators</p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 text-sm"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search users..."
              className="rounded-md border pl-7 pr-3 py-2 text-sm w-64 bg-white"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700 font-medium border-b">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Phone / Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  No system users found.
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3">
                    <div className="text-gray-900">{u.phone}</div>
                    <div className="text-xs text-gray-500">{u.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      u.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' : 
                      u.role === 'STATE_ADMIN' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button 
                        onClick={() => toggleStatus(u)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${u.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300'}`}
                        title="Toggle Status"
                    >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${u.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    <span className="ml-2 text-xs text-gray-500">{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2">
                    <button onClick={() => openEdit(u)} className="p-2 hover:bg-gray-100 rounded text-blue-600 transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => onDelete(u.id)} className="p-2 hover:bg-gray-100 rounded text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        title={editId ? "Edit System User" : "Add System User"}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="Full Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="9876543210"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="user@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="SUB_ADMIN">Sub Admin</option>
              <option value="STATE_ADMIN">State Admin</option>
              <option value="OEM_ADMIN">OEM Admin</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password {editId && "(Leave blank to keep current)"}</label>
            <input
              required={!editId}
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border rounded px-3 py-2"
              placeholder="Password"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as UserStatus })}
              className="w-full border rounded px-3 py-2"
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => setOpenAdd(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
            >
              {editId ? "Save Changes" : "Create User"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
