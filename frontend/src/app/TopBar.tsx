import { useAuth } from "../auth/AuthContext";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import client from "../api/client";

export default function TopBar() {
  const { user, signOut } = useAuth();
  const [logo, setLogo] = useState("");

  const { data: remoteSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await client.get("/settings");
      return res.data;
    },
  });

  const updateFavicon = (src: string) => {
    const existing = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    const link = existing || (document.createElement("link") as HTMLLinkElement);
    link.type = "image/x-icon";
    link.rel = "shortcut icon";
    link.href = src;
    document.getElementsByTagName("head")[0].appendChild(link);
  };

  useEffect(() => {
    try {
      const settings = JSON.parse(localStorage.getItem("sv_settings") || "{}");
      if (settings.systemLogo) {
        setLogo(settings.systemLogo);
        updateFavicon(settings.systemLogo);
      }
    } catch (e) {
      console.error("Failed to load branding", e);
    }
  }, []);

  useEffect(() => {
    if (!remoteSettings) return;
    try {
      const existing = JSON.parse(localStorage.getItem("sv_settings") || "{}");
      const merged = { ...existing, ...remoteSettings };
      localStorage.setItem("sv_settings", JSON.stringify(merged));
      if (merged.systemLogo) {
        setLogo(merged.systemLogo);
        updateFavicon(merged.systemLogo);
      }
    } catch (e) {
      console.error("Failed to merge remote settings", e);
      const anySettings: any = remoteSettings as any;
      if (anySettings?.systemLogo) {
        setLogo(anySettings.systemLogo);
        updateFavicon(anySettings.systemLogo);
      }
    }
  }, [remoteSettings]);

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
