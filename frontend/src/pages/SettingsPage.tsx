import { useState, useEffect } from "react";
import { Save, Upload } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../api/client";

type SettingsState = {
  // Branding
  systemName: string;
  systemLogo: string; // base64
  primaryColor: string; // hex
  dateFormat: string;
  
  // Integrations
  googlePlacesKey: string;

  // Cloud
  awsAccessKey: string;
  awsSecretKey: string;
  awsRegion: string;
  awsBucket: string;
};

const DEFAULT_SETTINGS: SettingsState = {
  systemName: "SMARTVAHAN",
  systemLogo: "",
  primaryColor: "#4F46E5",
  dateFormat: "DD/MM/YYYY",
  googlePlacesKey: "",
  awsAccessKey: "",
  awsSecretKey: "",
  awsRegion: "ap-south-1",
  awsBucket: "",
};

// Helper to convert Hex to RGB space-separated
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
    : "79 70 229";
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"branding" | "integrations" | "cloud" | "mobile">("branding");
  const [settings, setSettings] = useState<SettingsState>(DEFAULT_SETTINGS);

  // Fetch settings from API
  const { data: remoteSettings } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await client.get("/settings");
      return res.data;
    }
  });

  // Apply visual updates
  const applyVisuals = (data: SettingsState) => {
    if (data.primaryColor) {
        document.documentElement.style.setProperty("--primary", hexToRgb(data.primaryColor));
    }
    if (data.systemLogo) {
        updateFavicon(data.systemLogo);
    }
  };

  // Sync state when data loads
  useEffect(() => {
    if (remoteSettings) {
      setSettings(prev => ({ ...prev, ...remoteSettings }));
      applyVisuals(remoteSettings);
      localStorage.setItem("sv_settings", JSON.stringify(remoteSettings));
    } else {
        // Fallback to local storage if API fails or first load
        const saved = localStorage.getItem("sv_settings");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
                applyVisuals(parsed);
            } catch (e) { console.error(e); }
        }
    }
  }, [remoteSettings]);

  const updateFavicon = (src: string) => {
    const link = document.querySelector("link[rel*='icon']") || document.createElement('link');
    (link as HTMLLinkElement).type = 'image/x-icon';
    (link as HTMLLinkElement).rel = 'shortcut icon';
    (link as HTMLLinkElement).href = src;
    document.getElementsByTagName('head')[0].appendChild(link);
  };

  // Mutation to save
  const updateSettings = useMutation({
    mutationFn: async (data: SettingsState) => {
      await client.post("/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      localStorage.setItem("sv_settings", JSON.stringify(settings));
      alert("Settings saved successfully to database!");
    },
    onError: (err) => {
      console.error("Failed to save settings", err);
      alert("Failed to save settings to database");
    }
  });

  const handleChange = (field: keyof SettingsState, value: string) => {
    setSettings((prev) => {
      const next = { ...prev, [field]: value };
      
      // Real-time preview for color
      if (field === "primaryColor") {
        document.documentElement.style.setProperty("--primary", hexToRgb(value));
      }

      return next;
    });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append("logo", file);

      try {
        const res = await client.post("/settings/logo", formData);
        const updated = res.data;
        const newLogo = updated.systemLogo;
        const next = { ...settings, ...updated };
        setSettings(next);
        localStorage.setItem("sv_settings", JSON.stringify(next));
        if (newLogo) {
          updateFavicon(newLogo);
        }
      } catch (err) {
        console.error("Failed to upload logo", err);
        alert("Failed to upload logo");
      }
    }
  };

  const saveSettings = () => {
    updateSettings.mutate(settings);
  };

  const tabs = [
    { id: "branding", label: "Branding & Defaults" },
    { id: "integrations", label: "Integrations" },
    { id: "cloud", label: "Cloud Settings" },
    { id: "mobile", label: "Mobile App Config" },
  ] as const;

  return (
    <div className="flex flex-col h-full gap-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="text-sm text-gray-500">Manage system configurations and preferences</p>
      </div>

      <div className="flex flex-1 gap-6 bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Vertical Tabs */}
        <div className="w-64 bg-gray-50 border-r flex flex-col p-2 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`text-left px-4 py-3 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-primary shadow-sm border"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === "branding" && (
            <div className="max-w-xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Branding & Defaults</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">System Name</label>
                    <input
                      value={settings.systemName}
                      onChange={(e) => handleChange("systemName", e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g. SMARTVAHAN"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">System Logo</label>
                    <div className="flex items-center gap-4">
                      {settings.systemLogo ? (
                        <img src={settings.systemLogo} alt="Logo" className="h-16 w-16 object-contain border rounded bg-gray-50" />
                      ) : (
                        <div className="h-16 w-16 bg-gray-100 border rounded flex items-center justify-center text-xs text-gray-400">
                          No Logo
                        </div>
                      )}
                      <label className="cursor-pointer flex items-center gap-2 px-4 py-2 border rounded hover:bg-gray-50 text-sm font-medium">
                        <Upload className="w-4 h-4" />
                        Upload Logo
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Will be automatically converted to favicon</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">System Color Scheme</label>
                    <div className="flex items-center gap-4">
                      <input
                        type="color"
                        value={settings.primaryColor}
                        onChange={(e) => handleChange("primaryColor", e.target.value)}
                        className="h-10 w-20 p-1 border rounded cursor-pointer"
                      />
                      <span className="text-sm font-mono text-gray-600">{settings.primaryColor}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Applies as primary color globally</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">System Date & Time Format</label>
                    <select
                      value={settings.dateFormat}
                      onChange={(e) => handleChange("dateFormat", e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY (e.g. 31/01/2024)</option>
                      <option value="MM/DD/YYYY">MM/DD/YYYY (e.g. 01/31/2024)</option>
                      <option value="YYYY-MM-DD">YYYY-MM-DD (e.g. 2024-01-31)</option>
                      <option value="DD-MMM-YYYY">DD-MMM-YYYY (e.g. 31-Jan-2024)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "integrations" && (
            <div className="max-w-xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Integrations</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Google Places API Key</label>
                    <input
                      type="password"
                      value={settings.googlePlacesKey}
                      onChange={(e) => handleChange("googlePlacesKey", e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="Enter API Key"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "cloud" && (
            <div className="max-w-xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Cloud Settings (AWS S3)</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">AWS Access Key ID</label>
                    <input
                      type="password"
                      value={settings.awsAccessKey}
                      onChange={(e) => handleChange("awsAccessKey", e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">AWS Secret Access Key</label>
                    <input
                      type="password"
                      value={settings.awsSecretKey}
                      onChange={(e) => handleChange("awsSecretKey", e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">AWS Region</label>
                    <input
                      value={settings.awsRegion}
                      onChange={(e) => handleChange("awsRegion", e.target.value)}
                      className="w-full border rounded px-3 py-2"
                      placeholder="e.g. ap-south-1"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">S3 Bucket Name</label>
                    <input
                      value={settings.awsBucket}
                      onChange={(e) => handleChange("awsBucket", e.target.value)}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "mobile" && (
            <div className="max-w-xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Mobile App Configuration</h3>
                <div className="p-8 border-2 border-dashed rounded-lg text-center text-gray-500">
                  <p>Mobile App Configuration settings will be available in a future update.</p>
                </div>
              </div>
            </div>
          )}

          <div className="mt-8 pt-4 border-t flex justify-end">
            <button
              onClick={saveSettings}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2 rounded-md hover:bg-primary/90 transition-colors"
            >
              <Save className="w-4 h-4" />
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
