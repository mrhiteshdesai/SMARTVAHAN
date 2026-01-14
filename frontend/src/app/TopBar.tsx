import { useAuth } from "../auth/AuthContext";
import { useEffect, useState } from "react";

export default function TopBar() {
  const { user, signOut } = useAuth();
  const [logo, setLogo] = useState("");

  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem("sv_settings") || "{}");
      if (settings.systemLogo) {
        setLogo(settings.systemLogo);
      }
    } catch (e) {
      console.error("Failed to load branding", e);
    }
  }, []);

  return (
    <header className="sticky top-0 z-10 bg-white border-b">
      <div className="mx-auto max-w-full px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {logo ? (
            <img src={logo} alt="Logo" className="h-8 w-auto object-contain" />
          ) : (
            <div className="w-8 h-8 bg-primary rounded-sm"></div>
          )}
          <div className="font-semibold">SMARTVAHAN</div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">{user?.name ?? "User"}</span>
          <button onClick={signOut} className="text-sm px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200">
            Sign Out
          </button>
        </div>
      </div>
    </header>
  );
}

