import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import api from "../api/client";
import { useNavigate } from "react-router-dom";

type ZoomState = {
  min: number;
  max: number;
  step: number;
  value: number;
};

export default function MobileScan() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [zoomSupported, setZoomSupported] = useState(false);
  const [zoom, setZoom] = useState<ZoomState | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);

  const applyZoom = async (value: number) => {
    const track = trackRef.current;
    if (!track || typeof (track as any).applyConstraints !== "function") {
      return;
    }
    try {
      await track.applyConstraints({ advanced: [{ zoom: value }] } as any);
      setZoom((prev) => (prev ? { ...prev, value } : prev));
    } catch {
    }
  };

  useEffect(() => {
    const startScanner = async (useHd: boolean) => {
      const id = "mobile-qr-reader";
      const config: any = useHd
        ? {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        : {
            facingMode: "environment"
          };

      scannerRef.current = new Html5Qrcode(id, true);
      await scannerRef.current.start(
        config,
        { fps: 15, qrbox: 260 },
        async (decodedText) => {
          if (scannerRef.current) {
            await scannerRef.current.stop();
            scannerRef.current.clear();
            scannerRef.current = null;
          }
          trackRef.current = null;
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

      if (!useHd) {
        setZoomSupported(false);
        setZoom(null);
        trackRef.current = null;
        return;
      }

      try {
        const container = document.getElementById(id);
        const video = container?.getElementsByTagName("video")[0] as HTMLVideoElement | undefined;
        const stream = (video?.srcObject as MediaStream) || null;
        const track = stream?.getVideoTracks()[0] || null;
        if (track && typeof track.getCapabilities === "function") {
          const capabilities = track.getCapabilities() as any;
          const zoomCaps = capabilities.zoom;
          if (zoomCaps && typeof zoomCaps.min === "number" && typeof zoomCaps.max === "number") {
            trackRef.current = track;
            const min = zoomCaps.min;
            const max = zoomCaps.max;
            const step = zoomCaps.step || 0.1;
            const value = zoomCaps.default ?? min;
            setZoom({ min, max, step, value });
            setZoomSupported(true);
            if (typeof value === "number") {
              await applyZoom(value);
            }
          }
        }
      } catch {
        setZoomSupported(false);
        setZoom(null);
        trackRef.current = null;
      }
    };

    const start = async () => {
      try {
        setError(null);
        setScanning(true);
        try {
          await startScanner(true);
        } catch (e) {
          try {
            await startScanner(false);
          } catch (fallbackError: any) {
            setError(fallbackError?.message || "Scanner error");
          }
        }
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
      trackRef.current = null;
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
          {zoomSupported && zoom && (
            <div className="mt-3">
              <input
                type="range"
                min={zoom.min}
                max={zoom.max}
                step={zoom.step}
                value={zoom.value}
                onChange={(e) => applyZoom(Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-1 text-[10px] text-gray-500 text-right">
                {zoom.value.toFixed(1)}x
              </div>
            </div>
          )}
          {error && <div className="mt-3 text-red-600 text-xs">{error}</div>}
        </div>
      </main>
    </div>
  );
}
