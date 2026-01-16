import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export default function MobileHome() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <header className="px-4 pt-10 pb-4 bg-gradient-to-b from-indigo-600 to-indigo-500 rounded-b-3xl shadow-lg flex items-center justify-between">
        <button
          onClick={() => setDrawerOpen(true)}
          className="text-sm font-medium px-3 py-1.5 rounded-full bg-white/10 border border-white/20"
        >
          Menu
        </button>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-xs tracking-[0.25em] text-indigo-100">SMARTVAHAN</span>
          <span className="text-sm font-semibold">Dealer App</span>
        </div>
        <div className="text-[11px] text-indigo-100 max-w-[90px] text-right truncate">
          {user?.name}
        </div>
      </header>
      <main className="flex-1 px-5 pt-5 pb-6">
        <div className="bg-slate-900/60 border border-white/5 rounded-3xl p-5 shadow-inner">
          <div className="space-y-2">
            <div className="text-sm text-slate-300">Welcome back,</div>
            <div className="text-xl font-semibold">{user?.name}</div>
            <div className="text-[11px] text-slate-400">
              Scan the QR code on the reflective tape to start certificate generation.
            </div>
          </div>
          <button
            onClick={() => navigate("/app/scan")}
            className="mt-6 w-full bg-indigo-500 text-white rounded-2xl py-3.5 text-sm font-semibold shadow-lg active:scale-[0.98]"
          >
            Scan QR Code
          </button>
        </div>
      </main>
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDrawerOpen(false)}>
          <div
            className="absolute top-0 left-0 h-full w-72 bg-slate-900 text-white shadow-xl p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold mb-1">Dealer Profile</div>
            <div className="text-xs text-slate-400 mb-4">Signed in to SMARTVAHAN</div>
            <div className="space-y-1 text-sm">
              <div className="text-slate-100">Name: {user?.name}</div>
              <div className="text-slate-100">Phone: {user?.phone}</div>
            </div>
            <div className="mt-6">
              <button
                onClick={() => {
                  signOut();
                  navigate("/app/login");
                }}
                className="w-full border border-red-500 text-red-500 rounded-xl py-2 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
