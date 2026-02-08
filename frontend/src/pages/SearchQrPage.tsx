import { useState, useMemo } from "react";
import { useStates, useOEMs, OEM, useBulkReplacement } from "../api/hooks";
import api from "../api/client";
import { Search, FileText, Upload, Download, AlertCircle, CheckCircle, FileSpreadsheet } from "lucide-react";

type SearchQrResponse = {
  success: boolean;
  status: "UNUSED" | "USED";
  data: {
    id: string;
    serialNumber: number;
    value: string;
    stateCode: string;
    oemCode: string;
    productCode: string;
    batchId: string;
    qrImageDataUrl?: string;
    certificate?: {
      certificateNumber: string;
      vehicleNumber: string;
      generatedAt: string;
      pdfUrl: string | null;
    };
  };
};

export default function SearchQrPage() {
  const { data: states = [] } = useStates();
  const { data: oems = [] } = useOEMs();

  // Tabs
  const [activeTab, setActiveTab] = useState<'single' | 'bulk'>('single');

  // Single Search State
  const [stateCode, setStateCode] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [serial, setSerial] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchQrResponse | null>(null);

  // Bulk Search State
  const [bulkInput, setBulkInput] = useState("");
  const [bulkStateCode, setBulkStateCode] = useState("");
  const [bulkOemCode, setBulkOemCode] = useState("");
  const [bulkResult, setBulkResult] = useState<{ count: number, skipped: number } | null>(null);
  const bulkReplacementMutation = useBulkReplacement();

  const availableOems = useMemo(() => {
    if (!stateCode) return oems;
    return (oems as OEM[]).filter((o) => !o.authorizedStates || o.authorizedStates.includes(stateCode));
  }, [oems, stateCode]);

  const availableBulkOems = useMemo(() => {
    if (!bulkStateCode) return oems;
    return (oems as OEM[]).filter((o) => !o.authorizedStates || o.authorizedStates.includes(bulkStateCode));
  }, [oems, bulkStateCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!stateCode || !oemCode || !serial.trim()) {
      setError("Please select State, OEM and enter Serial number.");
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<SearchQrResponse>("/certificates/search-qr", {
        params: {
          state: stateCode,
          oem: oemCode,
          serial: serial.trim()
        }
      });
      setResult(res.data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to search QR Code. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!result?.data.qrImageDataUrl) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Double dimensions
    canvas.width = 500;
    canvas.height = 760;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const header = `${result.data.stateCode}-${result.data.oemCode}-${result.data.productCode}`;

    ctx.fillStyle = "#000000";
    ctx.textAlign = "center";
    // Scale font 2x (18px -> 36px)
    ctx.font = "bold 36px Arial";
    ctx.fillText(header, canvas.width / 2, 120);

    // Badge logic with padding
    const badgeText = "REPLACEMENT";
    ctx.font = "bold 20px Arial"; // Scale font 2x (10px -> 20px)
    const textMetrics = ctx.measureText(badgeText);
    const textWidth = textMetrics.width;
    
    const paddingX = 20; // Padding on left and right
    const badgeWidth = textWidth + (paddingX * 2);
    const badgeHeight = 44; // Scale height 2x (22px -> 44px)
    const badgeX = canvas.width - badgeWidth - 20; // 20px margin from right
    const badgeY = 20; // 20px margin from top

    ctx.fillStyle = "#dc2626";
    ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badgeText, badgeX + badgeWidth / 2, badgeY + (badgeHeight / 2));
    ctx.textBaseline = "alphabetic"; // Reset baseline

    const img = new Image();
    img.src = result.data.qrImageDataUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
    });

    // Scale QR size 2x (150 -> 300)
    const qrSize = 300;
    const qrX = (canvas.width - qrSize) / 2;
    const qrY = 180; // Scaled Y position
    ctx.drawImage(img, qrX, qrY, qrSize, qrSize);

    ctx.fillStyle = "#000000";
    // Scale font 2x (32px -> 64px)
    ctx.font = "bold 64px Arial";
    ctx.textAlign = "center";
    ctx.fillText(String(result.data.serialNumber), canvas.width / 2, qrY + qrSize + 100);

    // Footer
    ctx.font = "22px Arial"; // Scale 2x (11px -> 22px)
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, "0");
    const d = String(today.getDate()).padStart(2, "0");
    const ymd = `${y}${m}${d}`;
    const footerLine1 = `${ymd}-${result.data.batchId}-(1/1)`;
    ctx.fillText(footerLine1, canvas.width / 2, canvas.height - 80);

    ctx.font = "bold 22px Arial";
    ctx.fillText("SADAK SURAKSHA JEEVAN RAKSHA", canvas.width / 2, canvas.height - 40);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `QR-${result.data.stateCode}-${result.data.oemCode}-${result.data.serialNumber}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  const handleOpenCertificate = () => {
    const pdfUrl = result?.data.certificate?.pdfUrl;
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank");
  };

  const handleBulkSubmit = async () => {
    const serials = bulkInput.split(/[\n,]+/).map(s => s.trim()).filter(s => s).map(Number).filter(n => !isNaN(n));
    if (serials.length === 0) {
        alert("Please enter valid serial numbers");
        return;
    }
    if (!bulkStateCode || !bulkOemCode) {
        alert("Please select State and OEM");
        return;
    }
    
    try {
        const result = await bulkReplacementMutation.mutateAsync({
            serials,
            stateCode: bulkStateCode,
            oemCode: bulkOemCode
        });
        setBulkResult({ count: Number(result.count), skipped: Number(result.skipped) });
        
        // Trigger Download
        const url = window.URL.createObjectURL(new Blob([result.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Replacements_Batch_${new Date().toISOString().split('T')[0]}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.parentNode?.removeChild(link);
    } catch (e: any) {
        let message = e.message;
        if (e.response?.data instanceof Blob) {
            try {
                const text = await e.response.data.text();
                const json = JSON.parse(text);
                message = json.message || message;
            } catch (err) {
                // Ignore if not JSON
            }
        } else if (e.response?.data?.message) {
            message = e.response.data.message;
        }
        alert("Failed to generate replacement batch: " + message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setBulkInput(text);
    };
    reader.readAsText(file);
  };

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Tab Navigation */}
      <div className="bg-white rounded-lg border shadow-sm px-6 py-4">
        <div className="flex items-center gap-4 border-b border-gray-200">
            <button
                onClick={() => setActiveTab('single')}
                className={`pb-3 px-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'single' 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                <div className="flex items-center gap-2">
                    <Search size={16} />
                    Single Search
                </div>
            </button>
            <button
                onClick={() => setActiveTab('bulk')}
                className={`pb-3 px-4 text-sm font-medium transition-colors relative ${
                    activeTab === 'bulk' 
                    ? 'text-blue-600 border-b-2 border-blue-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
            >
                <div className="flex items-center gap-2">
                    <FileSpreadsheet size={16} />
                    Bulk / Replacement
                </div>
            </button>
        </div>
      </div>

      {activeTab === 'single' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
          <div className="bg-white rounded-lg border shadow-sm p-6 flex flex-col">
            <div className="mb-4">
              <h1 className="text-xl font-semibold text-gray-900">Search QR Code</h1>
              <p className="text-sm text-gray-500">
                Generate replacement QR image or locate existing certificate.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select State
                </label>
                <select
                  value={stateCode}
                  onChange={(e) => {
                    setStateCode(e.target.value);
                    setOemCode("");
                  }}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Choose State</option>
                  {states.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Select OEM
                </label>
                <select
                  value={oemCode}
                  onChange={(e) => setOemCode(e.target.value)}
                  disabled={!stateCode}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-gray-100 disabled:cursor-not-allowed"
                >
                  <option value="">{stateCode ? "Choose OEM" : "Select State first"}</option>
                  {availableOems.map((o) => (
                    <option key={o.id} value={o.code}>
                      {o.name} ({o.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  QR Serial Number
                </label>
                <input
                  type="number"
                  min={1}
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Enter printed serial number"
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "Searching..." : "Search"}
                </button>
              </div>
            </form>
          </div>

          <div className="bg-white rounded-lg border shadow-sm p-6 flex flex-col">
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Result</h2>
              <p className="text-sm text-gray-500">
                Replacement QR image or certificate details will appear here.
              </p>
            </div>

            {!result && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-400 text-sm">
                  Fill the form and click Search to view QR details.
                </div>
              </div>
            )}

            {result && result.status === "UNUSED" && (
              <div className="space-y-4">
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
                  QR Code is unused. Replacement layout generated below.
                </div>
                <div className="flex flex-col items-center gap-4">
                  <div className="w-full max-w-md border rounded-xl shadow-sm bg-white px-4 py-5 flex flex-col items-center gap-3">
                    <div className="text-lg font-bold tracking-wide">
                      {result.data.stateCode}-{result.data.oemCode}-{result.data.productCode}
                    </div>
                    <div className="w-full flex items-center justify-center">
                      {result.data.qrImageDataUrl ? (
                        <div className="border rounded-lg p-2 bg-white inline-flex">
                          <img
                            src={result.data.qrImageDataUrl}
                            alt="QR Code"
                            className="w-56 h-56 object-contain"
                          />
                        </div>
                      ) : (
                        <div className="w-56 h-56 border border-dashed rounded-lg flex items-center justify-center text-gray-400 text-sm">
                          QR image not available
                        </div>
                      )}
                    </div>
                    <div className="text-3xl font-extrabold tracking-[0.15em]">
                      {result.data.serialNumber}
                    </div>
                    <div className="w-full pt-2 border-t mt-2 text-center text-xs text-gray-600 space-y-1">
                      <div>
                        {new Date().toISOString().split("T")[0].replace(/-/g, "")}-
                        {result.data.batchId}-(1/1)
                      </div>
                      <div className="font-semibold">
                        SADAK SURAKSHA JEEVAN RAKSHA
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleDownloadImage}
                    className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90"
                  >
                    Download QR Image
                  </button>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <div className="font-semibold text-gray-700">Serial</div>
                    <div>{result.data.serialNumber}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-700">State</div>
                    <div>{result.data.stateCode}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-700">OEM</div>
                    <div>{result.data.oemCode}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-700">Product</div>
                    <div>{result.data.productCode}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-gray-700">Batch</div>
                    <div>{result.data.batchId}</div>
                  </div>
                </div>
              </div>
            )}

            {result && result.status === "USED" && (
              <div className="space-y-4">
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  QR Code is already used. Certificate details are shown below.
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
                  <div>
                    <div className="text-xs font-medium text-gray-500">Certificate Number</div>
                    <div className="font-semibold">{result.data.certificate?.certificateNumber}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500">Vehicle Number</div>
                    <div>{result.data.certificate?.vehicleNumber}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500">Generated At</div>
                    <div>
                      {result.data.certificate?.generatedAt
                        ? new Date(result.data.certificate.generatedAt).toLocaleString()
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-gray-500">QR Serial</div>
                    <div>{result.data.serialNumber}</div>
                  </div>
                </div>
                {result.data.certificate?.pdfUrl && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleOpenCertificate}
                      className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90"
                    >
                      Download Certificate PDF
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        // BULK / REPLACEMENT TAB
        <div className="bg-white rounded-lg border shadow-sm p-6">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-gray-900">Bulk QR Replacement</h1>
              <p className="text-sm text-gray-500 mt-1">
                Enter multiple serial numbers to generate a replacement batch PDF. Only active (unused) codes will be included.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select State
                        </label>
                        <select
                          value={bulkStateCode}
                          onChange={(e) => {
                            setBulkStateCode(e.target.value);
                            setBulkOemCode("");
                          }}
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          <option value="">Choose State</option>
                          {states.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.name} ({s.code})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select OEM
                        </label>
                        <select
                          value={bulkOemCode}
                          onChange={(e) => setBulkOemCode(e.target.value)}
                          disabled={!bulkStateCode}
                          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:bg-gray-100 disabled:cursor-not-allowed"
                        >
                          <option value="">{bulkStateCode ? "Choose OEM" : "Select State first"}</option>
                          {availableBulkOems.map((o) => (
                            <option key={o.id} value={o.code}>
                              {o.name} ({o.code})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Enter Serial Numbers (comma or newline separated)
                        </label>
                        <textarea
                            value={bulkInput}
                            onChange={(e) => setBulkInput(e.target.value)}
                            className="w-full h-64 border rounded-md p-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="1001, 1002, 1003..."
                        />
                    </div>
                    
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            <input
                                type="file"
                                accept=".csv,.txt"
                                onChange={handleFileUpload}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />
                            <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-md bg-white text-sm font-medium hover:bg-gray-50 transition-colors">
                                <Upload size={16} />
                                Upload CSV/TXT
                            </button>
                        </div>
                        <span className="text-xs text-gray-500">Supports .csv or .txt files with serials</span>
                    </div>

                    <div className="pt-4">
                        <button
                            onClick={handleBulkSubmit}
                            disabled={bulkReplacementMutation.isPending || !bulkInput.trim()}
                            className="flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {bulkReplacementMutation.isPending ? (
                                <>
                                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Search size={18} />
                                    Search & Generate Replacement PDF
                                </>
                            )}
                        </button>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-6 h-fit border border-gray-200">
                    <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <AlertCircle size={18} className="text-blue-600" />
                        Instructions
                    </h3>
                    <ul className="space-y-3 text-sm text-gray-600 list-disc pl-5">
                        <li>Enter mixed serial numbers (e.g. from different products or batches).</li>
                        <li>System will automatically group them by State/OEM/Product.</li>
                        <li><strong>Only Active (Unused)</strong> codes will be generated.</li>
                        <li>Used or invalid codes will be automatically skipped.</li>
                        <li>A single PDF file will be downloaded containing all valid replacements.</li>
                    </ul>

                    {bulkResult && (
                        <div className="mt-8 pt-6 border-t border-gray-200">
                             <div className="bg-green-50 border border-green-200 rounded-md p-4">
                                <h4 className="font-medium text-green-800 flex items-center gap-2 mb-2">
                                    <CheckCircle size={18} />
                                    Generation Complete
                                </h4>
                                <div className="space-y-1 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Processed & Included:</span>
                                        <span className="font-bold text-gray-900">{bulkResult.count}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Skipped (Used/Invalid):</span>
                                        <span className="font-bold text-red-600">{bulkResult.skipped}</span>
                                    </div>
                                </div>
                                <div className="mt-3 text-xs text-green-700">
                                    PDF download has started automatically.
                                </div>
                             </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
      )}
    </div>
  );
}
