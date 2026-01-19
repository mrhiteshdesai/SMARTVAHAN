
import { useState } from "react";
import { useStates, useOEMs } from "../api/hooks";
import { RefreshCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import client from "../api/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export default function ActivateQrPage() {
  const [stateCode, setStateCode] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const { data: states } = useStates();
  const { data: oems } = useOEMs();
  const queryClient = useQueryClient();

  const reactivateMutation = useMutation({
    mutationFn: async (data: { stateCode: string; oemCode: string; serialNumber: number }) => {
      const res = await client.post("/qr/reactivate", data);
      return res.data;
    },
    onSuccess: (data) => {
      setSuccess(data.message || "QR Code reactivated successfully");
      setError("");
      setSerialNumber(""); // Clear input on success
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || err.message || "Failed to reactivate QR Code");
      setSuccess("");
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stateCode || !oemCode || !serialNumber) {
      setError("Please fill in all fields");
      return;
    }
    reactivateMutation.mutate({ 
      stateCode, 
      oemCode, 
      serialNumber: parseInt(serialNumber, 10) 
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Reactivate QR Code</h1>
        <p className="text-sm text-gray-500">
          Reactivate a used QR Code and delete its associated certificate. 
          Use this when data needs correction.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-md text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              {error}
            </div>
          )}

          {success && (
            <div className="p-4 bg-green-50 text-green-600 rounded-md text-sm flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {success}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Select State</label>
              <select
                className="w-full rounded-md border px-3 py-2 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                required
              >
                <option value="">-- Select State --</option>
                {states?.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700">Select OEM</label>
              <select
                className="w-full rounded-md border px-3 py-2 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                value={oemCode}
                onChange={(e) => setOemCode(e.target.value)}
                required
              >
                <option value="">-- Select OEM --</option>
                {oems?.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">QR Serial Number</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-md border px-3 py-2 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              placeholder="Enter QR Serial Number (e.g. 1000)"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the numeric Serial Number of the QR Code printed on the sticker.
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={reactivateMutation.isPending}
              className="w-full md:w-auto flex items-center justify-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {reactivateMutation.isPending ? (
                <>Processing...</>
              ) : (
                <>
                  <RefreshCcw className="w-4 h-4" />
                  Reactivate QR Code
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
