import React, { useState, useRef, useEffect } from "react";
import { Html5Qrcode } from "html5-qrcode";
import api from "../api/client";
import { Upload, CheckCircle, AlertCircle, Loader2, Camera, MapPin, ChevronRight, ChevronLeft, FileText, ExternalLink, Download } from "lucide-react";
import { useRTOs, useVehicleCategories, useDealers } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";

interface QRValidationResult {
  id: string;
  serialNumber: number;
  value: string;
  oem: string;
  state: string;
  stateCode: string;
  product: string;
  batchId: string;
}

interface CertificateForm {
  // Autofills (from qrData)
  qrSerial: string;
  qrValue: string;
  state: string;
  oem: string;
  material: string;

  // Vehicle
  vehicleMake: string;
  vehicleCategory: string;
  fuelType: string;
  passingRto: string;
  registrationRto: string;
  series: string;
  manufacturingYear: string;
  chassisNo: string; // Last 5
  engineNo: string; // Last 5

  // Owner
  ownerName: string;
  ownerContact: string;

  // Photos (Data URLs)
  photoFrontLeft: string | null;
  photoBackRight: string | null;
  photoNumberPlate: string | null;
  photoRc: string | null;
}

// Mock Data
const VEHICLE_MAKES = [
  "Tata Motors", "Ashok Leyland", "Mahindra & Mahindra", "Eicher Motors", 
  "BharatBenz", "Maruti Suzuki", "Hyundai", "Toyota", "Honda", "Kia", 
  "Force Motors", "SML Isuzu"
];
// const VEHICLE_CATEGORIES = ["M1", "M2", "M3", "N1", "N2", "N3", "L1", "L2", "T1", "T2"]; // Replaced by API
const FUEL_TYPES = ["Diesel", "Petrol", "CNG", "LPG", "Electric", "Hybrid"];
const YEARS = Array.from({ length: 15 }, (_, i) => (new Date().getFullYear() - i).toString());

export function CertificateGeneratorPage() {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrData, setQrData] = useState<QRValidationResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: rtos = [] } = useRTOs(qrData?.stateCode);
  const { data: vehicleCategories = [] } = useVehicleCategories();

  // Success State
  const [successData, setSuccessData] = useState<{ pdfUrl: string, certificateId: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationText, setLocationText] = useState<string>("");
  const [qrCodeImage, setQrCodeImage] = useState<string | null>(null);
  const [systemSettings, setSystemSettings] = useState<{ systemName: string; systemLogo: string } | null>(null);
  const { data: dealers = [] } = useDealers();
  const [selectedDealerId, setSelectedDealerId] = useState<string | null>(null);

  const filteredDealers = React.useMemo(() => {
    if (!qrData?.stateCode) return [];
    return dealers.filter((d: any) => d.stateCode === qrData.stateCode);
  }, [dealers, qrData?.stateCode]);

  useEffect(() => {
    const saved = localStorage.getItem("sv_settings");
    if (saved) {
      try {
        setSystemSettings(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse settings", e);
      }
    }
  }, []);

  useEffect(() => {
    if (user?.role === "DEALER_USER") {
      const dealer = dealers.find(d => d.phone === user.phone);
      if (dealer) {
        setSelectedDealerId(dealer.id);
      }
    }
  }, [user, dealers]);

  // Form State
  const [formData, setFormData] = useState<CertificateForm>({
    qrSerial: "",
    qrValue: "",
    state: "",
    oem: "",
    material: "",
    vehicleMake: "",
    vehicleCategory: "",
    fuelType: "",
    passingRto: "",
    registrationRto: "",
    series: "",
    manufacturingYear: "",
    chassisNo: "",
    engineNo: "",
    ownerName: "",
    ownerContact: "",
    photoFrontLeft: null,
    photoBackRight: null,
    photoNumberPlate: null,
    photoRc: null
  });

  // Fetch RTOs based on state code
  // const { data: rtos = [] } = useRTOs(qrData?.stateCode || ""); // Moved up

  // Update form data when QR Data changes
  useEffect(() => {
    if (qrData) {
      setFormData(prev => ({
        ...prev,
        qrSerial: qrData.serialNumber.toString(),
        qrValue: qrData.value,
        state: qrData.state,
        oem: qrData.oem,
        material: qrData.product
      }));
    }
  }, [qrData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setQrData(null);
    setValidating(true);

    const html5QrCode = new Html5Qrcode("reader");

    try {
      // Convert file to base64 for submission later
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setQrCodeImage(reader.result);
        }
      };
      reader.readAsDataURL(file);

      // Helper to scan with resize fallback
      const scanWithFallback = async (f: File): Promise<string> => {
          try {
             return await html5QrCode.scanFile(f, false);
          } catch (err) {
             console.warn("Direct scan failed, attempting resize fallback...");
             return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    const MAX_DIM = 1000; // Resize to manageable size
                    let w = img.width;
                    let h = img.height;
                    
                    if (w > h && w > MAX_DIM) {
                        h = (h * MAX_DIM) / w;
                        w = MAX_DIM;
                    } else if (h > w && h > MAX_DIM) {
                        w = (w * MAX_DIM) / h;
                        h = MAX_DIM;
                    }

                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) { reject("Canvas context failed"); return; }
                    
                    // Draw white background first (transparency fix)
                    ctx.fillStyle = "white";
                    ctx.fillRect(0,0,w,h);
                    ctx.drawImage(img, 0, 0, w, h);
                    
                    canvas.toBlob(async (blob) => {
                        if (blob) {
                            try {
                                const resizedFile = new File([blob], "resized-qr.jpg", { type: "image/jpeg" });
                                const res = await html5QrCode.scanFile(resizedFile, false);
                                resolve(res);
                            } catch (e) { reject(e); }
                        } else { reject("Blob creation failed"); }
                    }, 'image/jpeg', 0.9);
                };
                img.onerror = () => reject("Image load failed");
                img.src = URL.createObjectURL(f);
             });
          }
      };

      // 1. Scan the image
      const decodedText = await scanWithFallback(file);
      console.log("Decoded QR:", decodedText);

      // 2. Validate with Backend
      const response = await api.post(
        "/certificates/validate-qr",
        { qrContent: decodedText }
      );

      if (response.data && response.data.success) {
        setQrData(response.data.data);
      }
    } catch (err: any) {
      console.error("Validation failed:", err);
      if (typeof err === "string") {
         setError(err); // Show the specific error string
      } else {
         // Check for common html5-qrcode errors
         const msg = err?.message || "";
         if (msg.includes("NotFoundException")) {
             setError("Could not detect QR code. Please ensure the image is clear and contains a valid QR code.");
         } else {
             setError(err.response?.data?.message || "Invalid QR Code or System Error.");
         }
      }
    } finally {
      setValidating(false);
      html5QrCode.clear();
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const processImageWithWatermark = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      // Get Location
      if (!navigator.geolocation) {
        reject("Geolocation not supported");
        return;
      }

      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const dateStr = new Date().toLocaleString();

        // Reverse Geocoding (Nominatim)
        let locText = `Lat: ${latitude.toFixed(4)}, Long: ${longitude.toFixed(4)}`;
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=10`);
            const data = await res.json();
            if (data && data.address) {
                const city = data.address.city || data.address.town || data.address.village || "";
                const state = data.address.state || "";
                locText = `${city}, ${state} | ${locText}`;
            }
        } catch (e) {
            console.error("Geocoding failed", e);
        }
        
        // Update global location text if not set or just update it
        setLocationText(locText);

        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject("Canvas context failed");
            return;
          }

          // Set dimensions (Max 1280px width for compression)
          const MAX_WIDTH = 1280;
          const scale = MAX_WIDTH / img.width;
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scale;

          // Draw Image
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Overlay Styles
          ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
          ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
          
          ctx.fillStyle = "white";
          ctx.font = "24px Arial"; // Increased size
          ctx.textAlign = "right";
          
          // Draw Text
          ctx.fillText(locText, canvas.width - 20, canvas.height - 45);
          ctx.fillText(dateStr, canvas.width - 20, canvas.height - 15);

          // Compress
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
          resolve(dataUrl);
        };
        img.onerror = reject;
      }, (err) => {
        reject("Location access denied or failed: " + err.message);
      });
    });
  };

  const handlePhotoUpload = async (key: keyof CertificateForm, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await processImageWithWatermark(file);
      setFormData(prev => ({ ...prev, [key]: dataUrl }));
    } catch (err) {
      alert("Failed to process image: " + err);
    }
  };

  const handleDealerSelect = (dealerId: string) => {
    setSelectedDealerId(dealerId || null);
  };

  const handleNextStep = () => {
      // Basic validation
      if (!formData.vehicleMake || !formData.vehicleCategory || !formData.fuelType || 
          !formData.passingRto || !formData.registrationRto || !formData.chassisNo || 
          !formData.engineNo || !formData.ownerName || !formData.ownerContact) {
          alert("Please fill all mandatory fields.");
          return;
      }
      if (!formData.photoFrontLeft || !formData.photoBackRight || !formData.photoNumberPlate || !formData.photoRc) {
          alert("Please upload all required photographs.");
          return;
      }
      setStep(3);
  };

  const handleFinalSubmit = async () => {
      if (!confirm("Are you sure you want to generate the certificate? This action cannot be undone.")) return;
      
      setIsSubmitting(true);
      try {
        const payload = {
            ...formData,
            systemName: systemSettings?.systemName,
            systemLogo: systemSettings?.systemLogo,
            locationText: locationText,
            qrCodeImage: qrCodeImage, // Optional, backend generates it now
            dealerId: selectedDealerId
        };

        const response = await api.post(
          "/certificates/create",
          payload
        );

        if (response.data && response.data.success) {
           setSuccessData(response.data);
        }
      } catch (err: any) {
         console.error(err);
         alert("Error generating certificate: " + (err.response?.data?.message || err.message));
      } finally {
         setIsSubmitting(false);
      }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-gray-900">Certificate Generator</h1>
        <p className="text-gray-500 text-sm">
          Follow the steps below to generate a new certificate.
        </p>
      </div>

      {/* Success View */}
      {successData ? (
        <div className="bg-white border rounded-lg p-8 shadow-sm text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mx-auto mb-6">
                <CheckCircle size={40} />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Certificate Generated Successfully!</h2>
            <p className="text-gray-500 mb-8">
                The installation certificate has been created and saved.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <a 
                    href={successData.pdfUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 shadow-sm font-medium w-full sm:w-auto justify-center"
                >
                    <ExternalLink size={20} />
                    Open PDF
                </a>
                <a 
                    href={successData.pdfUrl} 
                    download
                    className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-50 shadow-sm font-medium w-full sm:w-auto justify-center"
                >
                    <Download size={20} />
                    Download PDF
                </a>
            </div>

            <div className="mt-12 pt-8 border-t">
                <button 
                    onClick={() => window.location.reload()} 
                    className="text-blue-600 hover:text-blue-800 font-medium underline"
                >
                    Generate Another Certificate
                </button>
            </div>
        </div>
      ) : (
        <>
      {/* Steps Indicator */}
      <div className="flex items-center gap-4 text-sm font-medium text-gray-500 border-b pb-4">
        <div className={`flex items-center gap-2 ${step >= 1 ? "text-blue-600" : ""}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 1 ? "bg-blue-100 text-blue-600" : "bg-gray-100"}`}>1</div>
          Upload QR
        </div>
        <div className={`h-px w-12 ${step >= 2 ? "bg-blue-600" : "bg-gray-200"}`}></div>
        <div className={`flex items-center gap-2 ${step >= 2 ? "text-blue-600" : ""}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 2 ? "bg-blue-100 text-blue-600" : "bg-gray-100"}`}>2</div>
          Details
        </div>
        <div className={`h-px w-12 ${step >= 3 ? "bg-blue-600" : "bg-gray-200"}`}></div>
        <div className={`flex items-center gap-2 ${step >= 3 ? "text-blue-600" : ""}`}>
          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${step >= 3 ? "bg-blue-100 text-blue-600" : "bg-gray-100"}`}>3</div>
          Preview & Print
        </div>
      </div>

      {step === 1 && (
        <div className="bg-white border rounded-lg p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Upload QR Code</h2>
          
          <div className="flex flex-col items-center justify-center gap-6">
            <div id="reader" className="hidden"></div>

            {!qrData ? (
              <div 
                className="w-full max-w-md border-2 border-dashed border-gray-300 rounded-lg p-10 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/*" 
                  onChange={handleFileUpload}
                />
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-500">
                  <Upload size={32} />
                </div>
                <div className="text-center">
                  <p className="font-medium text-gray-900">Click to upload QR Code image</p>
                  <p className="text-sm text-gray-500 mt-1">SVG, PNG, JPG or WEBP</p>
                </div>
                {validating && (
                  <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-full mt-2">
                    <Loader2 className="animate-spin" size={16} />
                    <span className="text-sm font-medium">Scanning & Validating...</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full max-w-md bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 flex-shrink-0">
                    <CheckCircle size={20} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-green-800 font-medium">QR Code Validated Successfully</h3>
                    <div className="mt-2 space-y-1 text-sm text-green-700">
                      <p><span className="font-semibold">Serial:</span> {qrData.serialNumber}</p>
                      <p><span className="font-semibold">OEM:</span> {qrData.oem}</p>
                      <p><span className="font-semibold">State:</span> {qrData.state}</p>
                      <p><span className="font-semibold">Batch:</span> {qrData.batchId}</p>
                      <p className="truncate" title={qrData.value}><span className="font-semibold">Value:</span> {qrData.value}</p>
                    </div>
                    
                    <div className="mt-4 flex gap-3">
                       <button 
                        onClick={() => {
                          setQrData(null);
                          setError(null);
                        }}
                        className="text-sm text-gray-600 hover:text-gray-900 underline"
                      >
                        Scan Another
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="w-full max-w-md bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="w-full flex justify-end mt-4 pt-4 border-t">
              <button
                disabled={!qrData}
                onClick={() => setStep(2)}
                className={`px-6 py-2 rounded-md font-medium transition-colors ${
                  qrData 
                    ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm" 
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                Next Step
              </button>
            </div>
          </div>
        </div>
      )}
      
      {step === 2 && (
        <div className="bg-white border rounded-lg shadow-sm divide-y">
            {/* Section 1: Autofills */}
            <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Section 01: QR Code Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">QR Code Serial</label>
                        <input readOnly value={formData.qrSerial} className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-gray-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">QR Code Value</label>
                        <input readOnly value={formData.qrValue} className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-gray-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                        <input readOnly value={formData.state} className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-gray-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand/OEM</label>
                        <input readOnly value={formData.oem} className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-gray-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                        <input readOnly value={formData.material} className="w-full bg-gray-50 border border-gray-300 rounded px-3 py-2 text-gray-500" />
                    </div>
                </div>
            </div>

            {/* Section 2: Vehicle Details */}
            <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Section 02: Vehicle Details</h3>
                <p className="text-sm text-yellow-600 bg-yellow-50 p-2 rounded mb-4 inline-block">
                    Note: Kindly Fill Below Details As Per RC/Form 28-29/Form 20
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Make</label>
                        <select 
                            value={formData.vehicleMake} 
                            onChange={e => setFormData({...formData, vehicleMake: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="">Select Make</option>
                            {VEHICLE_MAKES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Vehicle Category</label>
                        <select 
                            value={formData.vehicleCategory} 
                            onChange={e => setFormData({...formData, vehicleCategory: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="">Select Category</option>
                            {vehicleCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type</label>
                        <select 
                            value={formData.fuelType} 
                            onChange={e => setFormData({...formData, fuelType: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="">Select Fuel</option>
                            {FUEL_TYPES.map(f => <option key={f} value={f}>{f}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Passing RTO</label>
                        <select 
                            value={formData.passingRto} 
                            onChange={e => setFormData({...formData, passingRto: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="">Select RTO</option>
                            {[...rtos].sort((a, b) => a.code.localeCompare(b.code)).map(r => <option key={r.code} value={r.code}>{r.code} - {r.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Registration RTO</label>
                        <select 
                            value={formData.registrationRto} 
                            onChange={e => setFormData({...formData, registrationRto: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="">Select RTO</option>
                            {[...rtos].sort((a, b) => a.code.localeCompare(b.code)).map(r => <option key={r.code} value={r.code}>{r.code} - {r.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Series</label>
                        <input 
                            value={formData.series} 
                            onChange={e => setFormData({...formData, series: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="e.g. MH01"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturing Year</label>
                        <select 
                            value={formData.manufacturingYear} 
                            onChange={e => setFormData({...formData, manufacturingYear: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            <option value="">Select Year</option>
                            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Chassis No. (Last 5)</label>
                        <input 
                            value={formData.chassisNo} 
                            onChange={e => setFormData({...formData, chassisNo: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            maxLength={5}
                            placeholder="XXXXX"
                        />
                        <p className="text-xs text-gray-500 mt-1">Enter Last 5 Digits</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Engine No. (Last 5)</label>
                        <input 
                            value={formData.engineNo} 
                            onChange={e => setFormData({...formData, engineNo: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            maxLength={5}
                            placeholder="XXXXX"
                        />
                        <p className="text-xs text-gray-500 mt-1">Enter Last 5 Digits</p>
                    </div>
                </div>
            </div>

            {/* Section 3: Owner Details */}
            <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Section 03: Owner Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Owner Name</label>
                        <input 
                            value={formData.ownerName} 
                            onChange={e => setFormData({...formData, ownerName: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="Full Name"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Owner's Contact No.</label>
                        <input 
                            value={formData.ownerContact} 
                            onChange={e => setFormData({...formData, ownerContact: e.target.value})}
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="10 Digit Mobile Number"
                            maxLength={10}
                        />
                    </div>
                </div>
            </div>

            {/* Section 4: Dealer Details */}
            <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Section 04: Dealer Details</h3>
                
                {user?.role === 'SUPER_ADMIN' && (
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Select Dealer</label>
                        <select 
                            className="w-full border border-gray-300 rounded px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            onChange={(e) => handleDealerSelect(e.target.value)}
                            value={selectedDealerId || ""}
                        >
                            <option value="" disabled>Choose a Dealer...</option>
                            {filteredDealers.map(d => (
                                <option key={d.id} value={d.id}>{d.name} ({d.stateCode})</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-1">
                          Leave as NA to keep dealer details not applicable.
                        </p>
                    </div>
                )}

                {user?.role !== 'SUPER_ADMIN' && (
                    <p className="text-sm text-gray-600">
                      Dealer details will be fetched from your dealer profile.
                    </p>
                )}
            </div>

            {/* Section 5: Photographs */}
            <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Section 05: Reflective Fitment Photographs</h3>
                <p className="text-sm text-gray-500 mb-4">
                    Capture or upload photographs. Location details (City, State, Lat/Long, Date) will be automatically overlaid.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {[
                        { key: 'photoFrontLeft', label: '1. Front Left' },
                        { key: 'photoBackRight', label: '2. Back Right' },
                        { key: 'photoNumberPlate', label: '3. Number Plate' },
                        { key: 'photoRc', label: '4. RC/Form 28/29/20' }
                    ].map((item) => (
                        <div key={item.key} className="border rounded-lg p-4 flex flex-col items-center gap-4">
                            <span className="font-medium text-sm text-gray-700">{item.label}</span>
                            
                            {formData[item.key as keyof CertificateForm] ? (
                                <div className="relative w-full aspect-video bg-gray-100 rounded overflow-hidden">
                                    <img 
                                        src={formData[item.key as keyof CertificateForm] as string} 
                                        className="w-full h-full object-cover" 
                                        alt={item.label} 
                                    />
                                    <button 
                                        onClick={() => setFormData({...formData, [item.key]: null})}
                                        className="absolute top-1 right-1 bg-white p-1 rounded-full shadow hover:bg-red-50 text-red-600"
                                        title="Remove"
                                    >
                                        <AlertCircle size={16} />
                                    </button>
                                </div>
                            ) : (
                                <label className="w-full aspect-video bg-gray-50 border-2 border-dashed border-gray-300 rounded flex flex-col items-center justify-center cursor-pointer hover:bg-blue-50 hover:border-blue-300 transition-colors">
                                    <Camera className="text-gray-400 mb-2" size={24} />
                                    <span className="text-xs text-gray-500">Click to Capture/Upload</span>
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        capture="environment"
                                        className="hidden" 
                                        onChange={(e) => handlePhotoUpload(item.key as keyof CertificateForm, e)} 
                                    />
                                </label>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 flex justify-between items-center bg-gray-50 rounded-b-lg">
                <button 
                    onClick={() => setStep(1)}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
                >
                    <ChevronLeft size={18} />
                    Back to QR Scan
                </button>
                <button 
                    onClick={handleNextStep}
                    className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 shadow-sm font-medium"
                >
                    Submit & Verify
                    <ChevronRight size={18} />
                </button>
            </div>
        </div>
      )}

      {step === 3 && (
        <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
            <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Verify Details</h2>
                    <p className="text-sm text-gray-500">Please review all information before final submission.</p>
                </div>
                <div className="flex gap-3">
                     <button 
                        onClick={() => setStep(2)}
                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 text-sm font-medium"
                    >
                        Edit Details
                    </button>
                </div>
            </div>

            <div className="divide-y">
                {/* Section 1: QR Details */}
                <div className="p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">QR Code Information</h3>
                    <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-2">
                        <div><dt className="text-sm font-medium text-gray-500">Serial Number</dt><dd className="mt-1 text-sm text-gray-900 font-medium">{formData.qrSerial}</dd></div>
                        <div><dt className="text-sm font-medium text-gray-500">Value</dt><dd className="mt-1 text-sm text-gray-900 break-all">{formData.qrValue}</dd></div>
                        <div><dt className="text-sm font-medium text-gray-500">State</dt><dd className="mt-1 text-sm text-gray-900">{formData.state}</dd></div>
                        <div><dt className="text-sm font-medium text-gray-500">OEM</dt><dd className="mt-1 text-sm text-gray-900">{formData.oem}</dd></div>
                        <div><dt className="text-sm font-medium text-gray-500">Material</dt><dd className="mt-1 text-sm text-gray-900">{formData.material}</dd></div>
                    </dl>
                </div>

                {/* Section 2: Vehicle Details */}
                <div className="p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Vehicle Details</h3>
                    <dl className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-2">
                         <div><dt className="text-sm font-medium text-gray-500">Make</dt><dd className="mt-1 text-sm text-gray-900">{formData.vehicleMake}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Category</dt><dd className="mt-1 text-sm text-gray-900">{formData.vehicleCategory}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Fuel Type</dt><dd className="mt-1 text-sm text-gray-900">{formData.fuelType}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Passing RTO</dt><dd className="mt-1 text-sm text-gray-900">{formData.passingRto}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Registration RTO</dt><dd className="mt-1 text-sm text-gray-900">{formData.registrationRto}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Series</dt><dd className="mt-1 text-sm text-gray-900">{formData.series || "-"}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Year</dt><dd className="mt-1 text-sm text-gray-900">{formData.manufacturingYear}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Chassis No.</dt><dd className="mt-1 text-sm text-gray-900">...{formData.chassisNo}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Engine No.</dt><dd className="mt-1 text-sm text-gray-900">...{formData.engineNo}</dd></div>
                    </dl>
                </div>

                {/* Section 3: Owner Details */}
                <div className="p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Owner Details</h3>
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-6">
                         <div><dt className="text-sm font-medium text-gray-500">Owner Name</dt><dd className="mt-1 text-sm text-gray-900">{formData.ownerName}</dd></div>
                         <div><dt className="text-sm font-medium text-gray-500">Contact Number</dt><dd className="mt-1 text-sm text-gray-900">{formData.ownerContact}</dd></div>
                    </dl>
                </div>

                {/* Section 4: Photos */}
                <div className="p-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Photographs</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { key: 'photoFrontLeft', label: 'Front Left' },
                            { key: 'photoBackRight', label: 'Back Right' },
                            { key: 'photoNumberPlate', label: 'Number Plate' },
                            { key: 'photoRc', label: 'RC/Form' }
                        ].map((item) => (
                            <div key={item.key} className="space-y-2">
                                 <div className="aspect-video bg-gray-100 rounded overflow-hidden border flex items-center justify-center">
                                    <img src={formData[item.key as keyof CertificateForm] as string} alt={item.label} className="w-full h-full object-contain" />
                                 </div>
                                 <p className="text-xs text-center font-medium text-gray-500">{item.label}</p>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 bg-gray-50 flex justify-end">
                    <button 
                        onClick={handleFinalSubmit}
                        className="flex items-center gap-2 bg-green-600 text-white px-8 py-3 rounded-md hover:bg-green-700 shadow-md font-medium text-lg transition-transform transform active:scale-95"
                    >
                        <CheckCircle size={20} />
                        Generate Certificate
                    </button>
                </div>
            </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
