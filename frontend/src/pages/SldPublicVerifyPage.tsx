import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/client";

type SldVerifyResponse =
  | {
      success: true;
      status: "PENDING" | "COMPLETED";
      data: {
        certificateNumber: string;
        kind?: "NEW" | "RENEWAL";
        validFrom?: string | null;
        validTo?: string | null;
        vehicleNumber: string;
        vehicleMake?: string;
        vehicleCategory?: string;
        ownerName?: string;
        ownerContact?: string;
        sealNumber?: string;
        setSpeedKmph?: number | null;
        testReportNo?: string | null;
        generatedAt: string;
        smartvahanPdfUrl?: string | null;
        vahanPdfUrl?: string | null;
        sldOem?: { code: string; name: string };
        deviceModel?: { code: string; name: string };
        deviceSerialNumber?: string;
        dealerName?: string | null;
        dealerPhone?: string | null;
        dealerVerification?: string | null;
      };
    }
  | { success: true; status: "NOT_FOUND"; message: string };

function formatDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB");
  } catch {
    return "—";
  }
}

export default function SldPublicVerifyPage() {
  const location = useLocation();
  const [certInput, setCertInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SldVerifyResponse | null>(null);

  const runVerify = async (certificateNumber: string) => {
    const cert = certificateNumber.trim().toUpperCase();
    if (!cert) {
      setError("Enter a certificate number");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.get<SldVerifyResponse>("/sld/public-verify", {
        params: { certificateNumber: cert },
      });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const cert = search.get("cert") || search.get("certificateNumber") || "";
    if (cert) {
      setCertInput(cert);
      runVerify(cert);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  const data = result && "data" in result ? result.data : null;
  const isRenewal = data?.kind === "RENEWAL";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">SLD Certificate Verification</h1>
        <p className="text-sm text-slate-600 mb-6">
          Enter the SLD certificate number printed on the SmartVahan certificate.
        </p>

        <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-col sm:flex-row gap-3 mb-6">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="e.g. SLDABCMH12AB1234 or …-R… for renewal"
            value={certInput}
            onChange={(e) => setCertInput(e.target.value.toUpperCase())}
          />
          <button
            type="button"
            disabled={loading}
            onClick={() => runVerify(certInput)}
            className="px-5 py-2 rounded-lg bg-[#12314D] text-white text-sm font-semibold disabled:opacity-60"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {result?.status === "NOT_FOUND" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm">
            {result.message || "Certificate not found."}
          </div>
        )}

        {data && (
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-500">Certificate</div>
                <div className="font-bold text-lg text-slate-900">{data.certificateNumber}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    isRenewal ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"
                  }`}
                >
                  {isRenewal ? "Renewed" : "New Fitment"}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    result?.status === "COMPLETED"
                      ? "bg-green-100 text-green-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {result?.status}
                </span>
              </div>
            </div>
            <div className="p-5 grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-slate-500">Valid from</div>
                <div className="font-semibold">{formatDate(data.validFrom || data.generatedAt)}</div>
              </div>
              <div>
                <div className="text-slate-500">Valid to</div>
                <div className="font-semibold">{formatDate(data.validTo)}</div>
              </div>
              <div>
                <div className="text-slate-500">Vehicle</div>
                <div className="font-semibold">{data.vehicleNumber}</div>
              </div>
              <div>
                <div className="text-slate-500">Make / Model</div>
                <div className="font-semibold">
                  {[data.vehicleMake, data.vehicleCategory].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">SLD OEM</div>
                <div className="font-semibold">{data.sldOem?.name || "—"}</div>
              </div>
              <div>
                <div className="text-slate-500">Device</div>
                <div className="font-semibold">
                  {[data.deviceModel?.name, data.deviceSerialNumber].filter(Boolean).join(" · ") ||
                    "—"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Seal / Set speed</div>
                <div className="font-semibold">
                  {[
                    data.sealNumber ? `Seal ${data.sealNumber}` : null,
                    data.setSpeedKmph != null ? `${data.setSpeedKmph} km/h` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Owner</div>
                <div className="font-semibold">{data.ownerName || "—"}</div>
              </div>
              <div>
                <div className="text-slate-500">Generated</div>
                <div className="font-semibold">
                  {data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "—"}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Dealer</div>
                <div className="font-semibold">{data.dealerName || "Admin (test)"}</div>
                {data.dealerPhone && <div className="text-slate-600">{data.dealerPhone}</div>}
              </div>
              {data.dealerVerification && (
                <div>
                  <div className="text-slate-500">Dealer verification</div>
                  <div className="font-semibold">{data.dealerVerification}</div>
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex flex-wrap gap-3">
              {data.smartvahanPdfUrl && (
                <a
                  href={data.smartvahanPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-slate-50"
                >
                  View SmartVahan Certificate
                </a>
              )}
              {data.vahanPdfUrl && (
                <a
                  href={data.vahanPdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-lg border text-sm font-semibold hover:bg-slate-50"
                >
                  View Vahan Certificate
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
