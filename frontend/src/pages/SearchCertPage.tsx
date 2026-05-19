import { useState, useMemo } from "react";
import { useStates, useOEMs, OEM, useRTOs } from "../api/hooks";
import api from "../api/client";

type CertificateView = {
  certificateNumber: string;
  vehicleMake: string;
  vehicleCategory: string;
  fuelType: string;
  passingRto: string;
  registrationRto: string;
  series?: string | null;
  manufacturingYear: string;
  chassisNumber: string;
  engineNumber: string;
  ownerName: string;
  ownerContact: string;
  vehicleNumber: string;
  generatedAt: string;
  locationText?: string | null;
  pdfUrl: string | null;
  qr: {
    serialNumber: number;
    value: string;
    stateCode: string;
    oemCode: string;
    productCode: string;
    batchId: string;
  };
};

type SearchCertResponse = {
  success: boolean;
  data:
    | CertificateView
    | {
        serialNumber: number;
        certificates: CertificateView[];
      };
};

export default function SearchCertPage() {
  const { data: states = [] } = useStates();
  const { data: oems = [] } = useOEMs();

  const [stateCode, setStateCode] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [searchBy, setSearchBy] = useState<"QR_SERIAL" | "VEHICLE" | "CERTIFICATE">("QR_SERIAL");
  const [serial, setSerial] = useState("");
  const [registrationRto, setRegistrationRto] = useState("");
  const [series, setSeries] = useState("");
  const [certificateNumber, setCertificateNumber] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SearchCertResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isGhostMode = localStorage.getItem('isGhostMode') === 'true';

  const { data: rtos = [] } = useRTOs(stateCode);

  const availableOems = useMemo(() => {
    if (!stateCode) return oems;
    return (oems as OEM[]).filter((o) => !o.authorizedStates || o.authorizedStates.includes(stateCode));
  }, [oems, stateCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSelectedIndex(0);
    if (!stateCode || !oemCode) {
      setError("Please select State and OEM.");
      return;
    }

    if (searchBy === "QR_SERIAL") {
      if (!serial.trim()) {
        setError("Please enter QR Serial.");
        return;
      }
    } else if (searchBy === "VEHICLE") {
      if (!registrationRto || !series.trim()) {
        setError("Please select Registration RTO and enter Series.");
        return;
      }
    } else if (searchBy === "CERTIFICATE") {
      if (!certificateNumber.trim()) {
        setError("Please enter Certificate Number.");
        return;
      }
    }
    setLoading(true);
    try {
      const res = await api.get<SearchCertResponse>("/certificates/search-cert", {
        params:
          searchBy === "QR_SERIAL"
            ? {
                state: stateCode,
                oem: oemCode,
                by: "QR_SERIAL",
                serial: serial.trim(),
                isGhost: isGhostMode
              }
            : searchBy === "VEHICLE"
            ? {
                state: stateCode,
                oem: oemCode,
                by: "VEHICLE",
                registrationRto,
                series: series.trim(),
                isGhost: isGhostMode
              }
            : {
                state: stateCode,
                oem: oemCode,
                by: "CERTIFICATE",
                certificateNumber: certificateNumber.trim(),
                isGhost: isGhostMode
              }
      });
      setResult(res.data);
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to search certificate. Please try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const isMultiResult = (
    data: SearchCertResponse["data"]
  ): data is { serialNumber: number; certificates: CertificateView[] } => {
    return Array.isArray((data as any)?.certificates);
  };

  const handleOpenPdf = () => {
    if (!result?.data) return;
    const certificates = isMultiResult(result.data) ? result.data.certificates : [result.data];
    const pdfUrl = certificates[selectedIndex]?.pdfUrl;
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank");
  };

  const certificates = result?.data ? (isMultiResult(result.data) ? result.data.certificates : [result.data]) : [];
  const selectedCertificate = certificates[selectedIndex] || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <div className="bg-white rounded-lg border shadow-sm p-6 flex flex-col">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">
            Search Certificate
            {isGhostMode && <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-200">Ghost Mode</span>}
          </h1>
          <p className="text-sm text-gray-500">
            Find certificate using State, OEM and QR Serial, Vehicle Number or Certificate Number.
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
                setRegistrationRto("");
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
              Search By
            </label>
            <select
              value={searchBy}
              onChange={(e) => {
                const value = e.target.value as "QR_SERIAL" | "VEHICLE" | "CERTIFICATE";
                setSearchBy(value);
                setSerial("");
                setRegistrationRto("");
                setSeries("");
                setCertificateNumber("");
              }}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <option value="QR_SERIAL">QR Serial</option>
              <option value="VEHICLE">Vehicle Number</option>
              <option value="CERTIFICATE">Certificate Number</option>
            </select>
          </div>

          {searchBy === "QR_SERIAL" && (
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
          )}

          {searchBy === "VEHICLE" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Registration RTO
                </label>
                <select
                  value={registrationRto}
                  onChange={(e) => setRegistrationRto(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">Choose Registration RTO</option>
                  {rtos.map((rto) => (
                    <option key={rto.code} value={rto.code}>
                      {rto.name} ({rto.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Series
                </label>
                <input
                  type="text"
                  value={series}
                  onChange={(e) => setSeries(e.target.value.toUpperCase())}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="Enter series (e.g. AB1234)"
                />
              </div>
            </>
          )}

          {searchBy === "CERTIFICATE" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Certificate Number
              </label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value.toUpperCase())}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                placeholder="Enter certificate number"
              />
            </div>
          )}

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
              {loading ? "Searching..." : "Search Certificate"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-6 flex flex-col">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Result</h2>
          <p className="text-sm text-gray-500">
            Certificate details and download link will appear here.
          </p>
        </div>

        {!result && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-400 text-sm">
              Fill the form and click Search to view certificate details.
            </div>
          </div>
        )}

        {result && certificates.length > 0 && (
          <div className="space-y-4">
            {isGhostMode && certificates.length > 1 && (
              <div className="rounded-md border bg-gray-50 p-3">
                <div className="text-sm font-medium text-gray-800 mb-2">
                  Certificates for Serial {"certificates" in result.data ? result.data.serialNumber : selectedCertificate?.qr.serialNumber}
                </div>
                <div className="flex flex-col gap-2">
                  {certificates.map((c, idx) => (
                    <button
                      key={`${c.certificateNumber}-${idx}`}
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      className={`text-left rounded-md border px-3 py-2 text-sm ${idx === selectedIndex ? "bg-white border-primary" : "bg-white hover:bg-gray-50"}`}
                    >
                      <div className="font-semibold text-gray-900">{c.certificateNumber}</div>
                      <div className="text-xs text-gray-600">
                        QR: {c.qr.value} • Generated: {new Date(c.generatedAt).toLocaleString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
              <div>
                <div className="text-xs font-medium text-gray-500">Certificate Number</div>
                <div className="font-semibold">{selectedCertificate?.certificateNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Vehicle Number</div>
                <div>{selectedCertificate?.vehicleNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Owner Name</div>
                <div>{selectedCertificate?.ownerName}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Owner Contact</div>
                <div>{selectedCertificate?.ownerContact}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">State</div>
                <div>{selectedCertificate?.qr.stateCode}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">OEM</div>
                <div>{selectedCertificate?.qr.oemCode}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Product</div>
                <div>{selectedCertificate?.qr.productCode}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">QR Serial</div>
                <div>{selectedCertificate?.qr.serialNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Vehicle Make</div>
                <div>{selectedCertificate?.vehicleMake}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Vehicle Category</div>
                <div>{selectedCertificate?.vehicleCategory}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Fuel Type</div>
                <div>{selectedCertificate?.fuelType}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Passing RTO</div>
                <div>{selectedCertificate?.passingRto}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Registration RTO</div>
                <div>{selectedCertificate?.registrationRto}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Series</div>
                <div>{selectedCertificate?.series || "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Manufacturing Year</div>
                <div>{selectedCertificate?.manufacturingYear}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Chassis Number</div>
                <div>{selectedCertificate?.chassisNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Engine Number</div>
                <div>{selectedCertificate?.engineNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Generated At</div>
                <div>{selectedCertificate?.generatedAt ? new Date(selectedCertificate.generatedAt).toLocaleString() : "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Location</div>
                <div>{selectedCertificate?.locationText || "-"}</div>
              </div>
            </div>

            {selectedCertificate?.pdfUrl && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleOpenPdf}
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
