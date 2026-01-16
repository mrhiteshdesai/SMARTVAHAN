import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import api from "../api/client";

type CertResponse =
  | {
      success: true;
      status: "VALID";
      data: {
        certificateNumber: string;
        vehicleMake: string;
        vehicleCategory: string;
        fuelType: string;
        passingRto: string;
        registrationRto: string;
        series: string | null;
        manufacturingYear: string;
        chassisNumber: string;
        engineNumber: string;
        ownerName: string;
        ownerContact: string;
        photoFrontLeft: string;
        photoBackRight: string;
        photoNumberPlate: string;
        photoRc: string;
        pdfUrl: string | null;
        vehicleNumber: string;
        generatedAt: string;
        locationText: string | null;
        qr: {
          serialNumber: number;
          value: string;
          stateCode: string;
          oemCode: string;
          productCode: string;
          batchId: string;
        };
      };
    }
  | {
      success: true;
      status: "UNUSED";
      data: {
        id: string;
        serialNumber: number;
        value: string;
        stateCode: string;
        oemCode: string;
        productCode: string;
        batchId: string;
      };
    };

export default function PublicVerifyPage() {
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CertResponse | null>(null);

  useEffect(() => {
    async function run() {
      setLoading(true);
      setError(null);
      setResult(null);
      try {
        const search = new URLSearchParams(location.search);
        const url = search.get("url");
        if (!url) {
          setError("Missing url parameter");
          setLoading(false);
          return;
        }
        const res = await api.get<CertResponse>("/certificates/public-verify", { params: { url } });
        setResult(res.data);
      } catch (e: any) {
        const msg =
          e?.response?.data?.message ||
          e?.message ||
          "Verification failed";
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
    run();
  }, [location.search]);

  if (loading) return <div className="p-6">Verifying...</div>;
  if (error) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-white border rounded-lg p-6">
            <div className="text-xl font-semibold mb-2">Verification Result</div>
            <div className="text-red-600">{error}</div>
          </div>
        </div>
      </div>
    );
  }
  if (!result) return null;

  if (result.status === "UNUSED") {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <div className="max-w-3xl mx-auto p-6">
          <div className="bg-white border rounded-lg p-6">
            <div className="text-xl font-semibold mb-4">Verification Result</div>
            <div className="text-yellow-600 font-medium mb-2">Certificate not generated</div>
            <div className="text-sm text-gray-700">QR Serial: {result.data.serialNumber}</div>
            <div className="text-sm text-gray-700">Value: {result.data.value}</div>
            <div className="text-sm text-gray-700">State: {result.data.stateCode}</div>
            <div className="text-sm text-gray-700">Brand: {result.data.oemCode}</div>
            <div className="text-sm text-gray-700">Product: {result.data.productCode}</div>
            <div className="text-sm text-gray-700">Batch: {result.data.batchId}</div>
          </div>
        </div>
      </div>
    );
  }

  const d = result.data;
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="max-w-5xl mx-auto p-6">
        <div className="bg-white border rounded-lg p-6 space-y-6">
          <div>
            <div className="text-2xl font-semibold">Installation Certificate</div>
            <div className="text-sm text-gray-600">Certificate Number: {d.certificateNumber}</div>
            <div className="text-sm text-gray-600">Generated At: {new Date(d.generatedAt).toLocaleString()}</div>
            {d.pdfUrl && (
              <a href={d.pdfUrl} target="_blank" rel="noreferrer" className="inline-block mt-2 text-primary">
                Download PDF
              </a>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="text-lg font-medium">Vehicle Details</div>
              <Field label="Make" value={d.vehicleMake} />
              <Field label="Category" value={d.vehicleCategory} />
              <Field label="Fuel" value={d.fuelType} />
              <Field label="Passing RTO" value={d.passingRto} />
              <Field label="Registration RTO" value={d.registrationRto} />
              <Field label="Series" value={d.series || "-"} />
              <Field label="Manufacturing Year" value={d.manufacturingYear} />
              <Field label="Chassis Number" value={d.chassisNumber} />
              <Field label="Engine Number" value={d.engineNumber} />
            </div>
            <div className="space-y-2">
              <div className="text-lg font-medium">Owner Details</div>
              <Field label="Name" value={d.ownerName} />
              <Field label="Contact" value={d.ownerContact} />
              <Field label="Vehicle Number" value={d.vehicleNumber} />
              <Field label="Location" value={d.locationText || "-"} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-lg font-medium">QR Details</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <Field label="Serial" value={String(d.qr.serialNumber)} />
              <Field label="Value" value={d.qr.value} />
              <Field label="State" value={d.qr.stateCode} />
              <Field label="Brand" value={d.qr.oemCode} />
              <Field label="Product" value={d.qr.productCode} />
              <Field label="Batch" value={d.qr.batchId} />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-lg font-medium">Fitment Photos</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Photo src={d.photoFrontLeft} caption="Front Left" />
              <Photo src={d.photoBackRight} caption="Back Right" />
              <Photo src={d.photoNumberPlate} caption="Number Plate" />
              <Photo src={d.photoRc} caption="Document" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border rounded px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}

function Photo({ src, caption }: { src: string; caption: string }) {
  if (!src) {
    return (
      <div className="border rounded p-3 text-center text-sm text-gray-500">No Image</div>
    );
  }
  let href = src;
  if (src.startsWith("uploads") || src.startsWith("/uploads")) {
    href = src.startsWith("/") ? src : `/${src}`;
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="block">
      <img src={href} className="w-full h-32 object-cover rounded border" />
      <div className="mt-1 text-center text-xs text-gray-600">{caption}</div>
    </a>
  );
}

