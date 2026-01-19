import { useState, useMemo } from "react";
import { useStates, useOEMs, OEM } from "../api/hooks";
import api from "../api/client";
import * as XLSX from "xlsx";

type DownloadRow = {
  id: string;
  generationDate: string;
  oem: string | null;
  product: string | null;
  qrSerial: number;
  certificateNumber: string;
  vehicleNumber: string;
  dealerName: string | null;
  dealerUserId: string | null;
  pdfUrl: string | null;
};

type DownloadResponse = {
  success: boolean;
  data: DownloadRow[];
};

export default function DownloadPage() {
  const { data: states = [] } = useStates();
  const { data: oems = [] } = useOEMs();

  const [stateCode, setStateCode] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<DownloadRow[]>([]);

  const availableOems = useMemo(() => {
    if (!stateCode) return oems;
    return (oems as OEM[]).filter((o) => !o.authorizedStates || o.authorizedStates.includes(stateCode));
  }, [oems, stateCode]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.get<DownloadResponse>("/certificates/download-list", {
        params: {
          state: stateCode || undefined,
          oem: oemCode || undefined,
          from: fromDate || undefined,
          to: toDate || undefined
        }
      });
      setRows(res.data.data || []);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to load certificates. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!rows.length) return;
    const data = rows.map((r) => ({
      "Generation Date": new Date(r.generationDate).toLocaleString(),
      OEM: r.oem || "",
      Product: r.product || "",
      "QR Serial": r.qrSerial,
      "Certificate Number": r.certificateNumber,
      "Vehicle Number": r.vehicleNumber,
      "Dealer Name": r.dealerName || "",
      "Dealer User ID": r.dealerUserId || ""
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Certificates");
    XLSX.writeFile(wb, "smartvahan-certificates.xlsx");
  };

  const handleOpenPdf = (row: DownloadRow) => {
    if (!row.pdfUrl) return;
    window.open(row.pdfUrl, "_blank");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Download Certificates</h1>
        <p className="text-sm text-gray-500">
          Filter certificates by State, OEM and date range, then export to Excel.
        </p>
      </div>

      <form
        onSubmit={handleSearch}
        className="bg-white rounded-lg border shadow-sm p-4 flex flex-col md:flex-row md:items-end gap-4"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">State</label>
          <select
            value={stateCode}
            onChange={(e) => {
              setStateCode(e.target.value);
              setOemCode("");
            }}
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s.code} value={s.code}>
                {s.name} ({s.code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">OEM</label>
          <select
            value={oemCode}
            onChange={(e) => setOemCode(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">All OEMs</option>
            {availableOems.map((o) => (
              <option key={o.id} value={o.code}>
                {o.name} ({o.code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-700">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex gap-2 md:ml-auto">
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-md bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Loading..." : "Apply Filters"}
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!rows.length}
            className="px-4 py-2 rounded-md border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export Excel
          </button>
        </div>
      </form>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr className="text-left text-gray-600">
                <th className="px-4 py-2">Generation Date</th>
                <th className="px-4 py-2">OEM</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2">QR Serial</th>
                <th className="px-4 py-2">Certificate Number</th>
                <th className="px-4 py-2">Vehicle Number</th>
                <th className="px-4 py-2">Dealer Name</th>
                <th className="px-4 py-2">Dealer User ID</th>
                <th className="px-4 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-6 text-center text-gray-500"
                  >
                    No certificates found for selected filters.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2">
                    {new Date(row.generationDate).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">{row.oem || "-"}</td>
                  <td className="px-4 py-2">{row.product || "-"}</td>
                  <td className="px-4 py-2">{row.qrSerial}</td>
                  <td className="px-4 py-2">{row.certificateNumber}</td>
                  <td className="px-4 py-2">{row.vehicleNumber}</td>
                  <td className="px-4 py-2">{row.dealerName || "-"}</td>
                  <td className="px-4 py-2">{row.dealerUserId || "-"}</td>
                  <td className="px-4 py-2">
                    {row.pdfUrl ? (
                      <button
                        type="button"
                        onClick={() => handleOpenPdf(row)}
                        className="px-3 py-1 rounded-md bg-primary text-white text-xs font-medium hover:bg-primary/90"
                      >
                        Download
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">No PDF</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

