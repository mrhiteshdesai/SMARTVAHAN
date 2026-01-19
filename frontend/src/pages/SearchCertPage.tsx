import { useState, useMemo } from "react";
import { useStates, useOEMs, OEM, useRTOs } from "../api/hooks";
import api from "../api/client";

type SearchCertResponse = {
  success: boolean;
  data: {
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

  const { data: rtos = [] } = useRTOs(stateCode);

  const availableOems = useMemo(() => {
    if (!stateCode) return oems;
    return (oems as OEM[]).filter((o) => !o.authorizedStates || o.authorizedStates.includes(stateCode));
  }, [oems, stateCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
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
              }
            : searchBy === "VEHICLE"
            ? {
                state: stateCode,
                oem: oemCode,
                by: "VEHICLE",
                registrationRto,
                series: series.trim(),
              }
            : {
                state: stateCode,
                oem: oemCode,
                by: "CERTIFICATE",
                certificateNumber: certificateNumber.trim(),
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

  const handleOpenPdf = () => {
    const pdfUrl = result?.data.pdfUrl;
    if (!pdfUrl) return;
    window.open(pdfUrl, "_blank");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      <div className="bg-white rounded-lg border shadow-sm p-6 flex flex-col">
        <div className="mb-4">
          <h1 className="text-xl font-semibold text-gray-900">Search Certificate</h1>
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

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm text-gray-700">
              <div>
                <div className="text-xs font-medium text-gray-500">Certificate Number</div>
                <div className="font-semibold">{result.data.certificateNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Vehicle Number</div>
                <div>{result.data.vehicleNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Owner Name</div>
                <div>{result.data.ownerName}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Owner Contact</div>
                <div>{result.data.ownerContact}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">State</div>
                <div>{result.data.qr.stateCode}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">OEM</div>
                <div>{result.data.qr.oemCode}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Product</div>
                <div>{result.data.qr.productCode}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">QR Serial</div>
                <div>{result.data.qr.serialNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Vehicle Make</div>
                <div>{result.data.vehicleMake}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Vehicle Category</div>
                <div>{result.data.vehicleCategory}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Fuel Type</div>
                <div>{result.data.fuelType}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Passing RTO</div>
                <div>{result.data.passingRto}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Registration RTO</div>
                <div>{result.data.registrationRto}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Series</div>
                <div>{result.data.series || "-"}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Manufacturing Year</div>
                <div>{result.data.manufacturingYear}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Chassis Number</div>
                <div>{result.data.chassisNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Engine Number</div>
                <div>{result.data.engineNumber}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Generated At</div>
                <div>{new Date(result.data.generatedAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500">Location</div>
                <div>{result.data.locationText || "-"}</div>
              </div>
            </div>

            {result.data.pdfUrl && (
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
