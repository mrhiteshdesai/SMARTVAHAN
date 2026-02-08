import React, { useState, useMemo } from "react";
import { 
  Package, 
  ShoppingCart, 
  Activity, 
  TrendingUp, 
  Filter, 
  Plus, 
  Search,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  Trash2,
  Edit
} from "lucide-react";
import * as XLSX from "xlsx";
import { useStates, useOEMs, useProducts, useDealers } from "../../api/hooks";
import { useInventoryStats, useInventoryLogs, useCreateOutward, useDeleteOutward, useUpdateLog, InventoryLog } from "../../api/inventoryHooks";
import Modal from "../../ui/Modal";
import { useAuth } from "../../auth/AuthContext";

function StatCard({ title, value, subValue, subLabel, icon, colorClass }: { title: string, value: number, subValue?: number, subLabel?: string, icon: React.ReactNode, colorClass: string }) {
    return (
        <div className="bg-white p-4 rounded-xl border shadow-sm flex items-center justify-between">
            <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
                {subValue !== undefined && (
                    <p className="text-xs text-gray-500 mt-1">
                        {subLabel}: <span className="font-medium text-gray-900">{subValue}</span>
                    </p>
                )}
            </div>
            <div className={`p-2 rounded-lg ${colorClass}`}>
                {icon}
            </div>
        </div>
    );
}

export default function InventoryPage() {
  const { user } = useAuth();
  const isGhostMode = localStorage.getItem('isGhostMode') === 'true';
  
  // Filters
  const [stateCode, setStateCode] = useState("");
  const [oemCode, setOemCode] = useState("");
  // Default to current month or empty? Usually dashboards default to "All Time" or "This Month".
  // Let's keep it empty for "All Time" unless user selects.
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Data Hooks
  const { data: states = [] } = useStates();
  const { data: oems = [] } = useOEMs();
  const { data: products = [] } = useProducts();
  const { data: dealers = [] } = useDealers();
  
  const filters = {
    stateCode: stateCode || undefined,
    oemCode: oemCode || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined
  };

  const { data: stats, isLoading: statsLoading } = useInventoryStats(filters);
  const { data: logs = [], isLoading: logsLoading } = useInventoryLogs(filters);
  const createOutward = useCreateOutward();
  const deleteOutward = useDeleteOutward();
  const updateLog = useUpdateLog();

  const handleExport = () => {
    if (logs.length === 0) return;
    
    const data = logs.map(log => ({
      Date: new Date(log.createdAt).toLocaleString(),
      Type: log.type,
      State: log.stateCode,
      OEM: log.oemName || log.oemCode,
      Product: log.productCode,
      'Serial Range': log.serialStart && log.serialEnd ? `${log.serialStart} - ${log.serialEnd}` : '-',
      Quantity: log.quantity,
      Dealer: log.dealer ? log.dealer.name : '',
      Remark: log.remark || ''
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventory Activity");
    XLSX.writeFile(wb, "Inventory_Activity.xlsx");
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this entry?")) {
      try {
        await deleteOutward.mutateAsync(id);
      } catch (err: any) {
        alert(err.response?.data?.message || "Failed to delete entry");
      }
    }
  };

  // Outward Modal State
  const [isOutwardModalOpen, setIsOutwardModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<InventoryLog | null>(null);
  const [outwardForm, setOutwardForm] = useState({
    stateCode: "",
    oemCode: "",
    productCode: "",
    dealerId: "",
    quantity: 1,
    serialStart: "",
    serialEnd: "",
    remark: "",
    saleDate: ""
  });
  const [errorMsg, setErrorMsg] = useState("");

  const handleEdit = (log: InventoryLog) => {
      setEditingLog(log);
      setOutwardForm({
          stateCode: log.stateCode,
          oemCode: log.oemCode,
          productCode: log.productCode,
          dealerId: log.dealerId || "",
          quantity: log.quantity,
          serialStart: log.serialStart || "",
          serialEnd: log.serialEnd || "",
          remark: log.remark || "",
          saleDate: log.createdAt ? new Date(log.createdAt).toISOString().split('T')[0] : ""
      });
      setIsOutwardModalOpen(true);
  };

  // Stats for Modal Validation
  const { data: modalStats } = useInventoryStats({
      stateCode: outwardForm.stateCode || undefined,
      oemCode: outwardForm.oemCode || undefined,
      // No date filter for modal check as we need current absolute stock
  });

  const availableStock = useMemo(() => {
      if (!outwardForm.productCode || !modalStats?.instock) return 0;
      return modalStats.instock[outwardForm.productCode] || 0;
  }, [modalStats, outwardForm.productCode]);

  // Derived State for OEM dropdown in Modal
  const availableOemsForModal = useMemo(() => {
    if (!outwardForm.stateCode) return oems;
    return oems.filter(o => !o.authorizedStates || o.authorizedStates.includes(outwardForm.stateCode));
  }, [oems, outwardForm.stateCode]);
  
  // Derived State for Dealers in Modal
  const availableDealersForModal = useMemo(() => {
      if (!outwardForm.stateCode) return [];
      return dealers.filter(d => d.stateCode === outwardForm.stateCode && d.status === 'ACTIVE');
  }, [dealers, outwardForm.stateCode]);

   // Derived State for OEM dropdown in Filter
   const availableOemsForFilter = useMemo(() => {
    if (!stateCode) return oems;
    return oems.filter(o => !o.authorizedStates || o.authorizedStates.includes(stateCode));
  }, [oems, stateCode]);

  const handleOutwardSubmit = async () => {
    setErrorMsg("");
    if (!outwardForm.stateCode || !outwardForm.oemCode || !outwardForm.productCode || !outwardForm.quantity || !outwardForm.serialStart || !outwardForm.serialEnd) {
      setErrorMsg("Please fill all required fields (State, OEM, Product, Qty, Serials).");
      return;
    }

    if (!editingLog) {
        if (outwardForm.quantity > availableStock) {
            setErrorMsg(`Insufficient stock. Available: ${availableStock}`);
            return;
        }
    }

    try {
      if (editingLog) {
          await updateLog.mutateAsync({ id: editingLog.id, payload: outwardForm });
      } else {
          await createOutward.mutateAsync(outwardForm);
      }
      setIsOutwardModalOpen(false);
      setEditingLog(null);
      setOutwardForm({
        stateCode: "",
        oemCode: "",
        productCode: "",
        dealerId: "",
        quantity: 1,
        serialStart: "",
        serialEnd: "",
        remark: "",
        saleDate: ""
      });
    } catch (err: any) {
      setErrorMsg(err.response?.data?.message || "Failed to save entry.");
    }
  };

  const productList = ['C3', 'C4', 'CT', 'CTAUTO'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory Management</h1>
          <p className="text-gray-500 text-sm">Track Inward, Outward and Stock Levels</p>
        </div>
        {!isGhostMode && (
        <button
          onClick={() => setIsOutwardModalOpen(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
        >
          <ShoppingCart size={18} />
          Sell / Outward
        </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col md:flex-row gap-4 items-center flex-wrap">
        <div className="flex items-center gap-2 text-gray-500 text-sm font-medium">
          <Filter size={16} />
          Filters:
        </div>
        
        <select
          value={stateCode}
          onChange={(e) => { setStateCode(e.target.value); setOemCode(""); }}
          className="border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none flex-1 md:w-auto min-w-[150px]"
        >
          <option value="">All States</option>
          {states.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </select>

        <select
          value={oemCode}
          onChange={(e) => setOemCode(e.target.value)}
          className="border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none flex-1 md:w-auto min-w-[150px]"
        >
          <option value="">All OEMs</option>
          {availableOemsForFilter.map(o => <option key={o.id} value={o.code}>{o.name}</option>)}
        </select>

        {/* Date Range Filter */}
        <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">From:</span>
            <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
        </div>
        <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">To:</span>
            <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
        </div>
      </div>

      {/* Stats Cards - Row 1: Inward */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase">Inward / Production</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {productList.map(p => (
                <StatCard 
                    key={p} 
                    title={`${p} Inward`} 
                    value={stats?.inward?.[p] || 0} 
                    icon={<Package className="w-5 h-5 text-blue-600" />}
                    colorClass="bg-blue-50"
                />
            ))}
        </div>
      </div>

      {/* Stats Cards - Row 2: Sold / Outward + Used */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase">Sold / Outward (Used Insight)</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {productList.map(p => (
                <StatCard 
                    key={p} 
                    title={`${p} Sold`} 
                    value={stats?.outward?.[p] || 0} 
                    subValue={stats?.used?.[p] || 0}
                    subLabel="Used"
                    icon={<ShoppingCart className="w-5 h-5 text-green-600" />}
                    colorClass="bg-green-50"
                />
            ))}
        </div>
      </div>

      {/* Stats Cards - Row 3: Total Instock */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 mb-2 uppercase">Total Instock</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {productList.map(p => (
                <StatCard 
                    key={p} 
                    title={`${p} Available`} 
                    value={stats?.instock?.[p] || 0} 
                    icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
                    colorClass="bg-green-50"
                />
            ))}
        </div>
      </div>

      {/* Activity Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <TrendingUp size={18} className="text-gray-500" />
            Inventory Activity
          </h3>
          <button
              onClick={handleExport}
              disabled={logs.length === 0}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400"
          >
              Export Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 font-semibold text-gray-700">Type</th>
                <th className="px-6 py-3 font-semibold text-gray-700">State</th>
                <th className="px-6 py-3 font-semibold text-gray-700">OEM Name</th>
                <th className="px-6 py-3 font-semibold text-gray-700">Product</th>
                <th className="px-6 py-3 font-semibold text-gray-700">Serial Range</th>
                <th className="px-6 py-3 font-semibold text-gray-700">Qty</th>
                <th className="px-6 py-3 font-semibold text-gray-700">Dealer / Remark</th>
                {user?.role === 'SUPER_ADMIN' && (
                    <th className="px-6 py-3 font-semibold text-gray-700">Action</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={user?.role === 'SUPER_ADMIN' ? 9 : 8} className="px-6 py-8 text-center text-gray-500">
                    No activity found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 text-gray-600">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        log.type === 'INWARD' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {log.type}
                      </span>
                    </td>
                    <td className="px-6 py-3">{log.stateCode}</td>
                    <td className="px-6 py-3">{log.oemName || log.oemCode}</td>
                    <td className="px-6 py-3">{log.productCode}</td>
                    <td className="px-6 py-3 text-xs font-mono">
                        {log.serialStart && log.serialEnd ? `${log.serialStart} - ${log.serialEnd}` : '-'}
                    </td>
                    <td className="px-6 py-3 font-medium">{log.quantity}</td>
                    <td className="px-6 py-3 text-gray-600">
                        {log.dealer ? (
                            <div className="flex flex-col">
                                <span className="font-medium text-gray-900">{log.dealer.name}</span>
                                <span className="text-xs text-gray-500">{log.remark}</span>
                            </div>
                        ) : (
                            <span className="text-gray-500 text-xs">{log.remark || '-'}</span>
                        )}
                    </td>
                    {user?.role === 'SUPER_ADMIN' && (
                        <td className="px-6 py-3 flex items-center gap-2">
                            {log.source === 'LOG' && (
                                <>
                                    <button 
                                        onClick={() => handleEdit(log)}
                                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                        title="Edit Entry"
                                    >
                                        <Edit size={16} />
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(log.id)}
                                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                                        title="Delete Entry"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            )}
                        </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Outward Modal */}
      <Modal
        open={isOutwardModalOpen}
        onClose={() => setIsOutwardModalOpen(false)}
        title={editingLog ? "Edit Inventory Entry" : "Sell / Outward Inventory"}
      >
        <div className="space-y-4">
          {errorMsg && (
            <div className="bg-red-50 text-red-600 p-3 rounded text-sm border border-red-200">
              {errorMsg}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                <select
                  value={outwardForm.stateCode}
                  onChange={(e) => setOutwardForm({ ...outwardForm, stateCode: e.target.value, oemCode: "", dealerId: "" })}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select State</option>
                  {states.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
             </div>
             <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">OEM *</label>
                <select
                  value={outwardForm.oemCode}
                  onChange={(e) => setOutwardForm({ ...outwardForm, oemCode: e.target.value })}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={!outwardForm.stateCode}
                >
                  <option value="">Select OEM</option>
                  {availableOemsForModal.map(o => <option key={o.id} value={o.code}>{o.name}</option>)}
                </select>
             </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Sale Date (Optional)</label>
             <input
               type="date"
               value={outwardForm.saleDate}
               onChange={(e) => setOutwardForm({ ...outwardForm, saleDate: e.target.value })}
               className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
             />
             <p className="text-xs text-gray-500 mt-1">Leave empty for today. Use past date for backdated entry.</p>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Select Dealer</label>
             <select
                value={outwardForm.dealerId}
                onChange={(e) => setOutwardForm({ ...outwardForm, dealerId: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!outwardForm.stateCode}
             >
                <option value="">Select Dealer (Optional)</option>
                {availableDealersForModal.map(d => <option key={d.id} value={d.id}>{d.name} ({d.phone})</option>)}
             </select>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Product *</label>
             <select
                value={outwardForm.productCode}
                onChange={(e) => setOutwardForm({ ...outwardForm, productCode: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
             >
                <option value="">Select Product</option>
                {products.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
             </select>
             {outwardForm.productCode && (
                 <p className="text-xs text-green-600 mt-1">Available Stock: {availableStock}</p>
             )}
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Quantity *</label>
             <input
                type="number"
                min="1"
                value={outwardForm.quantity}
                onChange={(e) => setOutwardForm({ ...outwardForm, quantity: Number(e.target.value) })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
             />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial Start *</label>
              <input
                type="text"
                value={outwardForm.serialStart}
                onChange={(e) => setOutwardForm({ ...outwardForm, serialStart: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Required"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Serial End *</label>
              <input
                type="text"
                value={outwardForm.serialEnd}
                onChange={(e) => setOutwardForm({ ...outwardForm, serialEnd: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Required"
              />
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
             <textarea
                value={outwardForm.remark}
                onChange={(e) => setOutwardForm({ ...outwardForm, remark: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={2}
                placeholder="Optional remarks"
              />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t mt-4">
            <button
              onClick={() => setIsOutwardModalOpen(false)}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleOutwardSubmit}
              disabled={createOutward.isPending || updateLog.isPending}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center gap-2"
            >
              {(createOutward.isPending || updateLog.isPending) ? "Submitting..." : (editingLog ? "Update Entry" : "Submit Sell/Outward")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
