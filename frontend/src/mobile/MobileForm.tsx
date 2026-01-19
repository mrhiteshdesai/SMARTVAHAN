import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import api from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useRTOs, useVehicleCategories } from "../api/hooks";

type VehicleDetails = {
  vehicleMake: string;
  vehicleCategory: string;
  fuelType: string;
  passingRto: string;
  registrationRto: string;
  series: string;
  manufacturingYear: string;
  chassisNo: string;
  engineNo: string;
};

type OwnerDetails = {
  ownerName: string;
  ownerContact: string;
};

type PhotoKeys = "photoFrontLeft" | "photoBackRight" | "photoNumberPlate" | "photoRc";

const VEHICLE_MAKES = [
  "Tata Motors",
  "Ashok Leyland",
  "Mahindra & Mahindra",
  "Eicher Motors",
  "BharatBenz",
  "Maruti Suzuki",
  "Hyundai",
  "Toyota",
  "Honda",
  "Kia",
  "Force Motors",
  "SML Isuzu",
];

const FUEL_TYPES = ["Diesel", "Petrol", "CNG", "LPG", "Electric", "Hybrid"];

const YEARS = Array.from({ length: 15 }, (_, i) => (new Date().getFullYear() - i).toString());

export default function MobileForm() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { user } = useAuth();
  const qrData = state?.qr;

  const { data: rtos = [] } = useRTOs(qrData?.stateCode);
  const { data: vehicleCategories = [] } = useVehicleCategories();

  const [step, setStep] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationText, setLocationText] = useState<string>("");

  const [vehicleDetails, setVehicleDetails] = useState<VehicleDetails>({
    vehicleMake: "",
    vehicleCategory: "",
    fuelType: "",
    passingRto: "",
    registrationRto: "",
    series: "",
    manufacturingYear: "",
    chassisNo: "",
    engineNo: "",
  });

  const [ownerDetails, setOwnerDetails] = useState<OwnerDetails>({
    ownerName: "",
    ownerContact: "",
  });

  const [photos, setPhotos] = useState<Record<PhotoKeys, string | null>>({
    photoFrontLeft: null,
    photoBackRight: null,
    photoNumberPlate: null,
    photoRc: null,
  });

  const captureOrder: PhotoKeys[] = useMemo(
    () => ["photoFrontLeft", "photoBackRight", "photoNumberPlate", "photoRc"],
    []
  );
  const [currentPhotoKeyIndex, setCurrentPhotoKeyIndex] = useState<number>(0);
  const currentPhotoKey = captureOrder[currentPhotoKeyIndex];

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    if (!qrData?.value) {
      navigate("/app/scan", { replace: true });
    }
  }, [qrData, navigate]);

  useEffect(() => {
    const geo = navigator.geolocation;
    if (geo) {
      geo.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          setLocationText(`Lat:${latitude}, Long:${longitude}`);
        },
        () => {}
      );
    }
  }, []);

  useEffect(() => {
    if (step === 2) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [step, currentPhotoKeyIndex]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e: any) {
      setCameraError(e?.message || "Unable to access camera");
    }
  };

  const stopCamera = () => {
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setPreviewDataUrl(null);
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    setPreviewDataUrl(dataUrl);
  };

  const confirmPhoto = () => {
    if (!previewDataUrl) return;
    setPhotos((p) => ({ ...p, [currentPhotoKey]: previewDataUrl }));
    setPreviewDataUrl(null);
    if (currentPhotoKeyIndex < captureOrder.length - 1) {
      setCurrentPhotoKeyIndex((i) => i + 1);
    } else {
      setStep(3);
    }
  };

  const resetCurrentPhoto = () => {
    setPreviewDataUrl(null);
    setPhotos((p) => ({ ...p, [currentPhotoKey]: null }));
  };

  const submitForm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        qrValue: qrData.value,
        vehicleDetails,
        ownerDetails,
        photos,
        locationText,
      };
      const res = await api.post("/certificates/create", payload);
      const data = res.data;
      if (data?.success && data?.pdfUrl) {
        sessionStorage.removeItem("mobile_form_qr");
        const url = data.pdfUrl.startsWith("http") ? data.pdfUrl : data.pdfUrl;
        window.open(url, "_blank");
        navigate("/app/home", { replace: true });
      } else {
        setError(data?.message || "Failed to generate certificate");
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  const canProceedDetails =
    Object.values(vehicleDetails).every((v) => String(v || "").trim().length > 0) &&
    Object.values(ownerDetails).every((v) => String(v || "").trim().length > 0);
  const allPhotosDone = captureOrder.every((k) => !!photos[k]);

  const photoLabel = (key: PhotoKeys) => {
    if (key === "photoFrontLeft") return "Front Left Image";
    if (key === "photoBackRight") return "Back Right Image";
    if (key === "photoNumberPlate") return "Number Plate Image";
    return "Document Image";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-600 to-slate-900 flex flex-col">
      <header className="flex items-center justify-between px-4 pt-10 pb-4">
        <button
          onClick={() => navigate("/app/home")}
          className="text-xs font-medium px-3 py-1.5 rounded-full bg-white/10 text-white border border-white/20 active:scale-[0.97]"
        >
          Back
        </button>
        <div className="flex flex-col items-center">
          <div className="text-xs tracking-[0.25em] text-indigo-100">SMARTVAHAN</div>
          <div className="text-sm font-semibold text-white">Generate Certificate</div>
        </div>
        <div className="text-[11px] text-indigo-100 max-w-[90px] text-right truncate">
          {user?.name}
        </div>
      </header>

      <main className="flex-1 px-4 pb-5">
        <div className="bg-white rounded-2xl shadow-lg p-4 space-y-4">
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase">QR Code</div>
            <div className="text-sm font-medium text-gray-900">
              {qrData?.serialNumber || qrData?.value}
            </div>
            {qrData && (
              <div className="mt-2 border rounded-xl p-3 bg-gray-50 text-[11px] text-gray-700 space-y-1">
                <div className="font-semibold text-xs mb-1">Details</div>
                <div>Serial: {qrData.serialNumber}</div>
                <div className="break-all">Value: {qrData.value}</div>
                <div>State: {qrData.state}</div>
                <div>Brand/OEM: {qrData.oem}</div>
                <div>Material: {qrData.product}</div>
              </div>
            )}
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Vehicle & Owner Details</div>
                <p className="mt-1 text-[11px] text-yellow-800 bg-yellow-50 border border-yellow-100 px-3 py-2 rounded-xl">
                  Kindly fill the details as per RC / Form 28-29 / Form 20.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <select
                  className="border rounded-xl px-3 py-2 text-sm bg-white"
                  value={vehicleDetails.vehicleMake}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, vehicleMake: e.target.value })}
                >
                  <option value="">Vehicle Make</option>
                  {VEHICLE_MAKES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  className="border rounded-xl px-3 py-2 text-sm bg-white"
                  value={vehicleDetails.vehicleCategory}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, vehicleCategory: e.target.value })}
                >
                  <option value="">Vehicle Category</option>
                  {vehicleCategories.map((c: any) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <select
                  className="border rounded-xl px-3 py-2 text-sm bg-white"
                  value={vehicleDetails.fuelType}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, fuelType: e.target.value })}
                >
                  <option value="">Fuel Type</option>
                  {FUEL_TYPES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <select
                  className="border rounded-xl px-3 py-2 text-sm bg-white"
                  value={vehicleDetails.passingRto}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, passingRto: e.target.value })}
                >
                  <option value="">Passing RTO</option>
                  {[...rtos]
                    .sort((a: any, b: any) => a.code.localeCompare(b.code))
                    .map((r: any) => (
                      <option key={r.code} value={r.code}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                </select>
                <select
                  className="border rounded-xl px-3 py-2 text-sm bg-white"
                  value={vehicleDetails.registrationRto}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, registrationRto: e.target.value })}
                >
                  <option value="">Registration RTO</option>
                  {[...rtos]
                    .sort((a: any, b: any) => a.code.localeCompare(b.code))
                    .map((r: any) => (
                      <option key={r.code} value={r.code}>
                        {r.code} - {r.name}
                      </option>
                    ))}
                </select>
                <input
                  className="border rounded-xl px-3 py-2 text-sm"
                  placeholder="Series"
                  value={vehicleDetails.series}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, series: e.target.value })}
                />
                <select
                  className="border rounded-xl px-3 py-2 text-sm bg-white"
                  value={vehicleDetails.manufacturingYear}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, manufacturingYear: e.target.value })}
                >
                  <option value="">Manufacturing Year</option>
                  {YEARS.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <input
                  className="border rounded-xl px-3 py-2 text-sm"
                  placeholder="Chassis No (Last 5)"
                  maxLength={5}
                  value={vehicleDetails.chassisNo}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, chassisNo: e.target.value })}
                />
                <input
                  className="border rounded-xl px-3 py-2 text-sm"
                  placeholder="Engine No (Last 5)"
                  maxLength={5}
                  value={vehicleDetails.engineNo}
                  onChange={(e) => setVehicleDetails({ ...vehicleDetails, engineNo: e.target.value })}
                />
              </div>

              <div className="mt-2 space-y-2">
                <div className="text-sm font-semibold text-gray-900">Owner Details</div>
                <div className="grid grid-cols-1 gap-3">
                  <input
                    className="border rounded-xl px-3 py-2 text-sm"
                    placeholder="Owner Name"
                    value={ownerDetails.ownerName}
                    onChange={(e) => setOwnerDetails({ ...ownerDetails, ownerName: e.target.value })}
                  />
                  <input
                    className="border rounded-xl px-3 py-2 text-sm"
                    placeholder="Owner Phone"
                    value={ownerDetails.ownerContact}
                    onChange={(e) => setOwnerDetails({ ...ownerDetails, ownerContact: e.target.value })}
                  />
                </div>
              </div>

              <button
                disabled={!canProceedDetails}
                onClick={() => setStep(2)}
                className="mt-2 w-full bg-indigo-600 text-white rounded-2xl py-2.5 text-sm font-semibold shadow-md active:scale-[0.98] disabled:opacity-60"
              >
                Capture Photos
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-gray-900">
                  Capture {photoLabel(currentPhotoKey)}
                </div>
                <div className="text-[11px] text-gray-500">
                  {currentPhotoKeyIndex + 1} / {captureOrder.length}
                </div>
              </div>
              <div className="rounded-2xl overflow-hidden bg-black">
                <video ref={videoRef} className="w-full h-[320px] object-contain" playsInline />
              </div>
              {cameraError && <div className="text-red-600 text-xs">{cameraError}</div>}
              {!previewDataUrl && (
                <button
                  onClick={capturePhoto}
                  className="w-full bg-indigo-600 text-white rounded-2xl py-2.5 text-sm font-semibold shadow-md active:scale-[0.98]"
                >
                  Capture
                </button>
              )}
              {previewDataUrl && (
                <div className="space-y-3">
                  <img src={previewDataUrl} alt="Preview" className="w-full rounded-2xl" />
                  <div className="flex gap-3">
                    <button
                      onClick={resetCurrentPhoto}
                      className="flex-1 border rounded-2xl py-2 text-sm font-medium text-gray-700"
                    >
                      Retake
                    </button>
                    <button
                      onClick={confirmPhoto}
                      className="flex-1 bg-indigo-600 text-white rounded-2xl py-2 text-sm font-semibold shadow-md active:scale-[0.98]"
                    >
                      Confirm
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-gray-900">Review & Submit</div>
              {qrData && (
                <div className="border rounded-xl p-3 bg-gray-50 text-[11px] text-gray-700 space-y-1">
                  <div className="font-semibold text-xs mb-1">QR Code</div>
                  <div>Serial: {qrData.serialNumber}</div>
                  <div className="break-all">Value: {qrData.value}</div>
                  <div>State: {qrData.state}</div>
                  <div>Brand/OEM: {qrData.oem}</div>
                  <div>Material: {qrData.product}</div>
                </div>
              )}
              <div className="border rounded-xl p-3 text-[11px] text-gray-700 space-y-1">
                <div className="font-semibold text-xs mb-1">Vehicle Details</div>
                <div>Make: {vehicleDetails.vehicleMake}</div>
                <div>Category: {vehicleDetails.vehicleCategory}</div>
                <div>Fuel: {vehicleDetails.fuelType}</div>
                <div>Passing RTO: {vehicleDetails.passingRto}</div>
                <div>Registration RTO: {vehicleDetails.registrationRto}</div>
                <div>Series: {vehicleDetails.series}</div>
                <div>Year: {vehicleDetails.manufacturingYear}</div>
                <div>Chassis (Last 5): {vehicleDetails.chassisNo}</div>
                <div>Engine (Last 5): {vehicleDetails.engineNo}</div>
              </div>
              <div className="border rounded-xl p-3 text-[11px] text-gray-700 space-y-1">
                <div className="font-semibold text-xs mb-1">Owner Details</div>
                <div>Name: {ownerDetails.ownerName}</div>
                <div>Phone: {ownerDetails.ownerContact}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {captureOrder.map((k) => (
                  <div key={k} className="border rounded-xl p-1">
                    {photos[k] ? (
                      <img src={photos[k]!} className="w-full h-28 object-cover rounded-lg" />
                    ) : (
                      <div className="w-full h-28 bg-gray-100 rounded-lg" />
                    )}
                    <div className="text-[11px] text-gray-700 mt-1">{photoLabel(k)}</div>
                  </div>
                ))}
              </div>
              <input
                className="border rounded-xl px-3 py-2 w-full text-sm"
                placeholder="Location (optional)"
                value={locationText}
                onChange={(e) => setLocationText(e.target.value)}
              />
              {error && <div className="text-red-600 text-xs">{error}</div>}
              <button
                disabled={!allPhotosDone || submitting}
                onClick={submitForm}
                className="w-full bg-emerald-600 text-white rounded-2xl py-2.5 text-sm font-semibold shadow-md active:scale-[0.98] disabled:opacity-60"
              >
                {submitting ? "Generating..." : "Generate Certificate"}
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
