import { useState, useMemo } from "react";
import { useStates, useOEMs, OEM } from "../api/hooks";
import api from "../api/client";

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

  const [stateCode, setStateCode] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [serial, setSerial] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchQrResponse | null>(null);

  const availableOems = useMemo(() => {
    if (!stateCode) return oems;
    return (oems as OEM[]).filter((o) => !o.authorizedStates || o.authorizedStates.includes(stateCode));
  }, [oems, stateCode]);

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

  return (
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
  );
}
