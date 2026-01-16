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
          <div className="text-sm font-semibold text-white">Scan QR</div>
        </div>
        <div className="w-[90px]" />
      </header>
      <main className="flex-1 px-4 pb-5">
        <div className="bg-white rounded-2xl shadow-lg p-4">
          <div className="text-sm font-semibold text-gray-900 mb-3">Align QR inside the frame</div>
          <div
            id="mobile-qr-reader"
            className="w-full h-[320px] bg-slate-900/95 rounded-2xl overflow-hidden"
          />
          {error && <div className="mt-3 text-red-600 text-xs">{error}</div>}
        </div>
      </main>
    </div>
  );
}
