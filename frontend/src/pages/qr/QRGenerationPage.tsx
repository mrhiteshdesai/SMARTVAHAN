import React, { useState, useMemo } from "react";
import { Plus, Search, Filter, Download, FileDown } from "lucide-react";
import Modal from "../../ui/Modal";
import {
  useStates,
  useOEMs,
  useProducts,
  useBatches,
  useGenerateBatch,
} from "../../api/hooks";
import { useAuth } from "../../auth/AuthContext";
import api from "../../api/client";

// Helper to get or create a persistent Device ID (PC Binding ID)
const getDeviceId = () => {
  let deviceId = localStorage.getItem("sv_device_id");
  if (!deviceId) {
    // Fallback for older browsers if crypto.randomUUID is not available
    if (typeof crypto.randomUUID === 'function') {
        deviceId = crypto.randomUUID();
    } else {
        deviceId = 'device-' + Math.random().toString(36).substring(2, 15);
    }
    localStorage.setItem("sv_device_id", deviceId);
  }
  return deviceId;
};

export const QRGenerationPage = () => {
  // Auth
  const { user } = useAuth();

  // UI State
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterState, setFilterState] = useState("");
  const [filterOem, setFilterOem] = useState("");
  const [filterProduct, setFilterProduct] = useState("");

  // Form State (for Modal)
  const [stateCode, setStateCode] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [productCode, setProductCode] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Data Hooks
  const { data: states = [] } = useStates();
  const { data: oems = [] } = useOEMs();
  const { data: products = [] } = useProducts();
  const { data: batches = [], refetch: refetchBatches } = useBatches();
  
  // Poll for status updates if any batch is PENDING or PROCESSING
  React.useEffect(() => {
    const hasPending = batches.some((b: any) => b.status === 'PENDING' || b.status === 'PROCESSING');
    if (hasPending) {
        const interval = setInterval(() => {
            refetchBatches();
        }, 2000);
        return () => clearInterval(interval);
    }
  }, [batches, refetchBatches]);
  
  const generateBatch = useGenerateBatch();

  // Filter OEMs based on selected state for the dropdown
  const availableOems = useMemo(() => {
    if (!stateCode) return oems;
    return oems.filter(o => o.authorizedStates && o.authorizedStates.includes(stateCode));
  }, [oems, stateCode]);

  // Filter Logic
  const filteredBatches = useMemo(() => {
    return batches.filter((batch: any) => {
      const matchesSearch = batch.batchId.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesState = filterState ? batch.stateCode === filterState : true;
      const matchesOem = filterOem ? batch.oemCode === filterOem : true;
      const matchesProduct = filterProduct ? batch.productCode === filterProduct : true;
      return matchesSearch && matchesState && matchesOem && matchesProduct;
    });
  }, [batches, searchTerm, filterState, filterOem, filterProduct]);

  // Handlers
  const handleGenerate = async () => {
    setErrorMsg("");
    setSuccessMsg("");
    if (!stateCode || !oemCode || !productCode || !quantity) {
      setErrorMsg("Please fill all fields");
      return;
    }

    setIsGenerating(true);
    try {
      await generateBatch.mutateAsync({
        stateCode,
        oemCode,
        productCode,
        quantity: Number(quantity),
        userId: user?.id || "unknown-user", 
        pcBindingId: getDeviceId(),
      });
      setSuccessMsg("Batch generated successfully");
      refetchBatches();
      // Reset form and close modal after short delay or manually
      setTimeout(() => {
          setIsGenerateModalOpen(false);
          setSuccessMsg("");
          // Reset form
          setStateCode("");
          setOemCode("");
          setProductCode("");
          setQuantity(100);
      }, 1500);
    } catch (error: any) {
      setErrorMsg(error.response?.data?.message || "Failed to generate batch");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = async (batchId: string) => {
    try {
      const response = await api.get(`/qr/download/${batchId}`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: response.headers["content-type"] || "application/pdf",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const contentDisposition = response.headers["content-disposition"] as string | undefined;
      let filename = `qr-batch-${batchId}.pdf`;
      if (contentDisposition && contentDisposition.includes("filename=")) {
        const match = contentDisposition.split("filename=")[1];
        if (match) {
          filename = match.replace(/["']/g, "").trim();
        }
      }
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        alert("You are not authorized to download this batch.");
      } else {
        alert("Failed to download batch.");
      }
    }
  };

  return (
    <div className="mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
            <h1 className="text-2xl font-bold text-gray-900">QR Code Generation</h1>
            <p className="text-gray-500 text-sm mt-1">Manage and generate QR code batches</p>
        </div>
        <button
          onClick={() => setIsGenerateModalOpen(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium shadow-sm"
        >
          <Plus size={18} />
          Generate QR Code
        </button>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 space-y-4 md:space-y-0 md:flex md:items-center md:gap-4">
        <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input 
                type="text"
                placeholder="Search by Batch ID..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
            <Filter size={18} className="text-gray-500 mr-1" />
            <select 
                className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
            >
                <option value="">All States</option>
                {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>

            <select 
                className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={filterOem}
                onChange={(e) => setFilterOem(e.target.value)}
            >
                <option value="">All OEMs</option>
                {oems.map((o) => <option key={o.id} value={o.code}>{o.name}</option>)}
            </select>

            <select 
                className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                value={filterProduct}
                onChange={(e) => setFilterProduct(e.target.value)}
            >
                <option value="">All Products</option>
                {products.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Batch ID</th>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Date</th>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">State</th>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">OEM</th>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Product</th>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Quantity</th>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Serial From-To</th>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Status</th>
                <th className="px-6 py-3 font-semibold text-gray-700 whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredBatches.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-8 text-center text-gray-500">
                    No batches found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredBatches.map((batch: any) => (
                  <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 font-medium text-blue-600">{batch.batchId}</td>
                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                        {new Date(batch.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">{batch.state?.name || batch.stateCode}</td>
                    <td className="px-6 py-4">{batch.oem?.name || batch.oemCode}</td>
                    <td className="px-6 py-4">{batch.product?.name || batch.productCode}</td>
                    <td className="px-6 py-4">{batch.quantity}</td>
                    <td className="px-6 py-4 text-gray-600">
                        {batch.startSerial && batch.endSerial ? (
                            <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                                {batch.startSerial} - {batch.endSerial}
                            </span>
                        ) : '-'}
                    </td>
                    <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                            batch.status === 'COMPLETED' ? 'bg-green-100 text-green-700' :
                            batch.status === 'FAILED' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                        }`}>
                            {batch.status || 'COMPLETED'}
                        </span>
                    </td>
                    <td className="px-6 py-4">
                        {batch.status === 'COMPLETED' || !batch.status ? (
                            <button 
                                onClick={() => handleDownload(batch.batchId)}
                                className="text-blue-600 hover:text-blue-800 flex items-center gap-1 text-xs font-medium border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded bg-blue-50 hover:bg-blue-100 transition-all"
                            >
                                <FileDown size={14} /> Download
                            </button>
                        ) : batch.status === 'FAILED' ? (
                            <span className="text-red-500 text-xs">Failed</span>
                        ) : (
                             <div className="flex items-center gap-2 text-gray-500 text-xs">
                                <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                Generating...
                            </div>
                        )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t bg-gray-50 text-xs text-gray-500">
            Showing {filteredBatches.length} batches
        </div>
      </div>

      {/* Generation Modal */}
      <Modal 
        open={isGenerateModalOpen} 
        onClose={() => !isGenerating && setIsGenerateModalOpen(false)}
        title="Generate New QR Batch"
      >
        <div className="space-y-5">
            {errorMsg && (
                <div className="bg-red-50 text-red-600 p-3 rounded text-sm border border-red-200">
                {errorMsg}
                </div>
            )}
            
            {successMsg && (
                <div className="bg-green-50 text-green-600 p-3 rounded text-sm border border-green-200">
                {successMsg}
                </div>
            )}

            <div className="flex flex-col gap-2">
                <label className="font-medium text-sm text-gray-700">Select State</label>
                <select
                    className="border border-gray-300 rounded-md p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none w-full"
                    value={stateCode}
                    onChange={(e) => {
                        setStateCode(e.target.value);
                        setOemCode(""); // Reset OEM when state changes
                    }}
                    disabled={isGenerating}
                >
                    <option value="">-- Choose State --</option>
                    {states.map((s) => (
                        <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-2">
                <label className="font-medium text-sm text-gray-700">Select OEM</label>
                <select
                    className="border border-gray-300 rounded-md p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none w-full"
                    value={oemCode}
                    onChange={(e) => setOemCode(e.target.value)}
                    disabled={isGenerating || !stateCode}
                >
                    <option value="">{stateCode ? "-- Choose OEM --" : "-- Select State First --"}</option>
                    {availableOems.map((o) => (
                        <option key={o.id} value={o.code}>{o.name}</option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-2">
                <label className="font-medium text-sm text-gray-700">Select Product</label>
                <select
                    className="border border-gray-300 rounded-md p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none w-full"
                    value={productCode}
                    onChange={(e) => setProductCode(e.target.value)}
                    disabled={isGenerating}
                >
                    <option value="">-- Choose Product --</option>
                    {products.map((p) => (
                        <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                    ))}
                </select>
            </div>

            <div className="flex flex-col gap-2">
                <label className="font-medium text-sm text-gray-700">Quantity</label>
                <input
                    type="number"
                    min="1"
                    max="1000"
                    className="border border-gray-300 rounded-md p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none w-full"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    disabled={isGenerating}
                />
                <p className="text-xs text-gray-500">Max 1,000 per batch</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                <button 
                    className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                    onClick={() => setIsGenerateModalOpen(false)}
                    disabled={isGenerating}
                >
                    Cancel
                </button>
                <button 
                    className={`px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors flex items-center gap-2 ${isGenerating ? 'opacity-70 cursor-not-allowed' : ''}`}
                    onClick={handleGenerate}
                    disabled={isGenerating}
                >
                    {isGenerating && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>}
                    {isGenerating ? "Generating..." : "Generate Batch"}
                </button>
            </div>
        </div>
      </Modal>
    </div>
  );
};
