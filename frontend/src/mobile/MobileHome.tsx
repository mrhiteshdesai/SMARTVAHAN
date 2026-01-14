import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate } from "react-router-dom";

export default function MobileHome() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <header className="flex items-center justify-between p-4 border-b">
        <button onClick={() => setDrawerOpen(true)} className="text-blue-600 font-medium">Menu</button>
        <div className="font-bold">SMARTVAHAN</div>
        <div />
      </header>
      <main className="p-6">
        <div className="text-center space-y-3">
          <div className="text-xl font-semibold">Welcome</div>
          <div className="text-sm text-gray-600">{user?.name}</div>
          <button
            onClick={() => navigate("/app/scan")}
            className="mt-6 w-full bg-blue-600 text-white rounded-md py-3 font-medium"
          >
            Scan QR Code
          </button>
        </div>
      </main>
      {drawerOpen && (
        <div className="fixed inset-0 bg-black/30" onClick={() => setDrawerOpen(false)}>
          <div
            className="absolute top-0 left-0 h-full w-72 bg-white shadow-md p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-bold mb-2">Dealer</div>
            <div className="text-sm text-gray-700">Name: {user?.name}</div>
            <div className="text-sm text-gray-700">Phone: {user?.phone}</div>
            <div className="mt-6">
              <button
                onClick={() => {
                  signOut();
                  navigate("/app/login");
                }}
                className="w-full border border-red-600 text-red-600 rounded-md py-2 font-medium"
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
