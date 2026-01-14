import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import api from "../api/client";
import { useNavigate } from "react-router-dom";

export default function MobileScan() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  useEffect(() => {
    const start = async () => {
      try {
        setScanning(true);
        const id = "mobile-qr-reader";
        scannerRef.current = new Html5Qrcode(id, true);
        await scannerRef.current.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          async (decodedText) => {
            if (scannerRef.current) {
              await scannerRef.current.stop();
              scannerRef.current.clear();
              scannerRef.current = null;
            }
            try {
              const res = await api.post("/certificates/validate-qr", { qrContent: decodedText });
              if (res.data?.success) {
                navigate("/app/form", { state: { qr: res.data.data } });
              } else {
                setError("Invalid QR");
              }
            } catch (err: any) {
              setError(err?.response?.data?.message || "Validation failed");
            }
          },
          () => {}
        );
      } catch (e: any) {
        setError(e?.message || "Scanner error");
      } finally {
        setScanning(false);
      }
    };
    start();
    return () => {
      const s = scannerRef.current;
      if (s) {
        s.stop().finally(() => s.clear());
      }
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="text-lg font-bold mb-2">Scan QR</div>
      <div id="mobile-qr-reader" className="w-full h-[320px] bg-gray-100 rounded-md" />
      {error && <div className="mt-3 text-red-600 text-sm">{error}</div>}
      <button onClick={() => navigate("/app/home")} className="mt-6 w-full border rounded-md py-2">
        Back
      </button>
    </div>
  );
}
