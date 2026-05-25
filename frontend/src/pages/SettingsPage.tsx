import { useState, useEffect } from "react";
import { Save, Upload, Plus, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import client from "../api/client";

type MobileAppVersionStatus = "ACTIVE" | "DEPRECATED" | "BLOCKED";

type MobileAppVersionEntry = {
  platform: string;
  versionName: string;
  buildNumber: number;
  status: MobileAppVersionStatus;
  message?: string;
  storeUrl?: string;
};

type MobileAppConfig = {
  enabled: boolean;
  allowIfNoVersion: boolean;
  requireVersionHeaders: boolean;
  defaultMessage: string;
  defaultStoreUrl: string;
  versions: MobileAppVersionEntry[];
};

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

  mobileAppConfig?: MobileAppConfig;

  homePageContent?: {
    heroTitle?: string;
    heroSubtitle?: string;
    heroPrimaryCtaText?: string;
    heroPrimaryCtaHref?: string;
    heroSecondaryCtaText?: string;
    heroSecondaryCtaHref?: string;
    aboutTitle?: string;
    aboutBody?: string;
    statesTitle?: string;
    oemsTitle?: string;
    statsTitle?: string;
    contactTitle?: string;
    contactSubtitle?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactAddress?: string;
  };
};

const DEFAULT_MOBILE_APP_CONFIG: MobileAppConfig = {
  enabled: false,
  allowIfNoVersion: true,
  requireVersionHeaders: false,
  defaultMessage: "Update required. Please update the SMARTVAHAN app to continue.",
  defaultStoreUrl: "",
  versions: [],
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
  mobileAppConfig: DEFAULT_MOBILE_APP_CONFIG,
  homePageContent: {
    heroTitle: "SMARTVAHAN",
    heroSubtitle: "Centralized MIS for QR-based certification and inventory management.",
    heroPrimaryCtaText: "Open Dashboard",
    heroPrimaryCtaHref: "/control",
    heroSecondaryCtaText: "Public Verification",
    heroSecondaryCtaHref: "/verify",
    aboutTitle: "About SmartVahan",
    aboutBody: "",
    statesTitle: "Authorised States",
    oemsTitle: "OEMs Served",
    statsTitle: "Live Statistics",
    contactTitle: "Contact",
    contactSubtitle: "Send us a message and we’ll get back to you.",
    contactEmail: "",
    contactPhone: "",
    contactAddress: ""
  }
};

// Helper to convert Hex to RGB space-separated
function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`
    : "79 70 229";
}

function normalizeMobileAppConfig(raw: any): MobileAppConfig {
  const cfg = raw && typeof raw === "object" ? raw : {};
  const versionsRaw = Array.isArray(cfg.versions) ? cfg.versions : [];
  const versions: MobileAppVersionEntry[] = versionsRaw
    .map((v: any) => ({
      platform: (v?.platform ?? "").toString().trim().toLowerCase(),
      versionName: (v?.versionName ?? "").toString().trim(),
      buildNumber: Number(v?.buildNumber ?? NaN),
      status: ((v?.status ?? "ACTIVE").toString().trim().toUpperCase() as MobileAppVersionStatus) || "ACTIVE",
      message: v?.message != null ? v.message.toString() : undefined,
      storeUrl: v?.storeUrl != null ? v.storeUrl.toString() : undefined,
    }))
    .filter((v) => v.platform && v.versionName && Number.isFinite(v.buildNumber))
    .map((v) => ({
      ...v,
      status: v.status === "ACTIVE" || v.status === "DEPRECATED" || v.status === "BLOCKED" ? v.status : "ACTIVE",
    }));

  return {
    enabled: Boolean(cfg.enabled ?? DEFAULT_MOBILE_APP_CONFIG.enabled),
    allowIfNoVersion: Boolean(cfg.allowIfNoVersion ?? DEFAULT_MOBILE_APP_CONFIG.allowIfNoVersion),
    requireVersionHeaders: Boolean(cfg.requireVersionHeaders ?? DEFAULT_MOBILE_APP_CONFIG.requireVersionHeaders),
    defaultMessage: (cfg.defaultMessage ?? DEFAULT_MOBILE_APP_CONFIG.defaultMessage).toString(),
    defaultStoreUrl: (cfg.defaultStoreUrl ?? DEFAULT_MOBILE_APP_CONFIG.defaultStoreUrl).toString(),
    versions,
  };
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"branding" | "integrations" | "cloud" | "mobile" | "home">("branding");
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
      const normalizedMobile = normalizeMobileAppConfig((remoteSettings as any).mobileAppConfig);
      const merged = {
        ...DEFAULT_SETTINGS,
        ...remoteSettings,
        mobileAppConfig: normalizedMobile,
      } as SettingsState;
      setSettings(merged);
      applyVisuals(merged);
      localStorage.setItem("sv_settings", JSON.stringify(remoteSettings));
    } else {
        // Fallback to local storage if API fails or first load
        const saved = localStorage.getItem("sv_settings");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const normalizedMobile = normalizeMobileAppConfig(parsed.mobileAppConfig);
                const merged = { ...DEFAULT_SETTINGS, ...parsed, mobileAppConfig: normalizedMobile } as SettingsState;
                setSettings(merged);
                applyVisuals(merged);
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

  const mobile = settings.mobileAppConfig ?? DEFAULT_MOBILE_APP_CONFIG;

  const updateMobile = (patch: Partial<MobileAppConfig>) => {
    setSettings((prev) => ({
      ...prev,
      mobileAppConfig: {
        ...(prev.mobileAppConfig ?? DEFAULT_MOBILE_APP_CONFIG),
        ...patch,
      },
    }));
  };

  const updateMobileVersion = (index: number, patch: Partial<MobileAppVersionEntry>) => {
    const next = mobile.versions.map((v, i) => (i === index ? { ...v, ...patch } : v));
    updateMobile({ versions: next });
  };

  const addMobileVersion = () => {
    const next: MobileAppVersionEntry = {
      platform: "android",
      versionName: "1.0",
      buildNumber: 100,
      status: "ACTIVE",
      message: "",
      storeUrl: "",
    };
    updateMobile({ versions: [...mobile.versions, next] });
  };

  const removeMobileVersion = (index: number) => {
    updateMobile({ versions: mobile.versions.filter((_, i) => i !== index) });
  };

  const tabs = [
    { id: "branding", label: "Branding & Defaults" },
    { id: "integrations", label: "Integrations" },
    { id: "cloud", label: "Cloud Settings" },
    { id: "mobile", label: "Mobile App Config" },
    { id: "home", label: "Home Page" }
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

          {activeTab === "home" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-1">Home Page</h3>
                <p className="text-sm text-gray-500">Controls the public landing page content.</p>
              </div>

              <div className="grid gap-4">
                <div className="rounded-lg border p-4 bg-white space-y-3">
                  <div className="text-sm font-semibold text-gray-700">Hero</div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      value={settings.homePageContent?.heroTitle || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          homePageContent: { ...(prev.homePageContent || {}), heroTitle: e.target.value }
                        }))
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Subtitle</label>
                    <textarea
                      value={settings.homePageContent?.heroSubtitle || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          homePageContent: { ...(prev.homePageContent || {}), heroSubtitle: e.target.value }
                        }))
                      }
                      className="w-full border rounded px-3 py-2 min-h-[90px]"
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Primary CTA Text</label>
                      <input
                        value={settings.homePageContent?.heroPrimaryCtaText || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), heroPrimaryCtaText: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Primary CTA Link</label>
                      <input
                        value={settings.homePageContent?.heroPrimaryCtaHref || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), heroPrimaryCtaHref: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Secondary CTA Text</label>
                      <input
                        value={settings.homePageContent?.heroSecondaryCtaText || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), heroSecondaryCtaText: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Secondary CTA Link</label>
                      <input
                        value={settings.homePageContent?.heroSecondaryCtaHref || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), heroSecondaryCtaHref: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 bg-white space-y-3">
                  <div className="text-sm font-semibold text-gray-700">About</div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      value={settings.homePageContent?.aboutTitle || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          homePageContent: { ...(prev.homePageContent || {}), aboutTitle: e.target.value }
                        }))
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Body</label>
                    <textarea
                      value={settings.homePageContent?.aboutBody || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          homePageContent: { ...(prev.homePageContent || {}), aboutBody: e.target.value }
                        }))
                      }
                      className="w-full border rounded px-3 py-2 min-h-[140px]"
                    />
                  </div>
                </div>

                <div className="rounded-lg border p-4 bg-white space-y-3">
                  <div className="text-sm font-semibold text-gray-700">Section Titles</div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">States Section</label>
                      <input
                        value={settings.homePageContent?.statesTitle || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), statesTitle: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">OEMs Section</label>
                      <input
                        value={settings.homePageContent?.oemsTitle || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), oemsTitle: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Stats Section</label>
                      <input
                        value={settings.homePageContent?.statsTitle || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), statsTitle: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border p-4 bg-white space-y-3">
                  <div className="text-sm font-semibold text-gray-700">Contact</div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Title</label>
                    <input
                      value={settings.homePageContent?.contactTitle || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          homePageContent: { ...(prev.homePageContent || {}), contactTitle: e.target.value }
                        }))
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Subtitle</label>
                    <input
                      value={settings.homePageContent?.contactSubtitle || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          homePageContent: { ...(prev.homePageContent || {}), contactSubtitle: e.target.value }
                        }))
                      }
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Email</label>
                      <input
                        value={settings.homePageContent?.contactEmail || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), contactEmail: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Phone</label>
                      <input
                        value={settings.homePageContent?.contactPhone || ""}
                        onChange={(e) =>
                          setSettings((prev) => ({
                            ...prev,
                            homePageContent: { ...(prev.homePageContent || {}), contactPhone: e.target.value }
                          }))
                        }
                        className="w-full border rounded px-3 py-2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Address</label>
                    <textarea
                      value={settings.homePageContent?.contactAddress || ""}
                      onChange={(e) =>
                        setSettings((prev) => ({
                          ...prev,
                          homePageContent: { ...(prev.homePageContent || {}), contactAddress: e.target.value }
                        }))
                      }
                      className="w-full border rounded px-3 py-2 min-h-[90px]"
                    />
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
            <div className="max-w-3xl space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-1">Mobile App Configuration</h3>
                <p className="text-sm text-gray-500">
                  Controls which mobile app versions are allowed to login and generate certificates.
                </p>
              </div>

              <div className="rounded-lg border p-4 bg-white space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">Enforcement</div>
                    <div className="text-xs text-gray-500">
                      Applies only to requests that look like mobile clients (Flutter/Dart user-agent or app headers).
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={mobile.enabled}
                      onChange={(e) => updateMobile({ enabled: e.target.checked })}
                    />
                    Enabled
                  </label>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={mobile.allowIfNoVersion}
                      onChange={(e) => updateMobile({ allowIfNoVersion: e.target.checked })}
                    />
                    <span>
                      <div className="font-medium">Allow if no version</div>
                      <div className="text-xs text-gray-500">
                        Keeps older apps working until you decide to enforce version headers.
                      </div>
                    </span>
                  </label>

                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={mobile.requireVersionHeaders}
                      onChange={(e) => updateMobile({ requireVersionHeaders: e.target.checked })}
                    />
                    <span>
                      <div className="font-medium">Require version headers</div>
                      <div className="text-xs text-gray-500">
                        Blocks mobile requests that do not send platform/build headers.
                      </div>
                    </span>
                  </label>
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Default update message</label>
                    <input
                      value={mobile.defaultMessage}
                      onChange={(e) => updateMobile({ defaultMessage: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Default store URL</label>
                    <input
                      value={mobile.defaultStoreUrl}
                      onChange={(e) => updateMobile({ defaultStoreUrl: e.target.value })}
                      className="w-full border rounded px-3 py-2"
                      placeholder="https://play.google.com/store/apps/details?id=..."
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-lg border bg-white overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">Allowed Versions</div>
                    <div className="text-xs text-gray-500">
                      Only versions with status ACTIVE are allowed.
                    </div>
                  </div>
                  <button
                    onClick={addMobileVersion}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded border bg-white hover:bg-gray-50"
                    type="button"
                  >
                    <Plus className="w-4 h-4" />
                    Add Version
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-gray-700 bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-4 py-2">Platform</th>
                        <th className="text-left px-4 py-2">Version</th>
                        <th className="text-left px-4 py-2">Build</th>
                        <th className="text-left px-4 py-2">Status</th>
                        <th className="text-left px-4 py-2">Store URL</th>
                        <th className="text-right px-4 py-2">Remove</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mobile.versions.length === 0 ? (
                        <tr>
                          <td className="px-4 py-4 text-gray-500" colSpan={6}>
                            No versions configured. If enabled, enforcement will not block unless “Require version headers” is ON.
                          </td>
                        </tr>
                      ) : (
                        mobile.versions.map((v, idx) => (
                          <tr key={`${v.platform}-${v.versionName}-${v.buildNumber}-${idx}`} className="border-b">
                            <td className="px-4 py-2">
                              <select
                                value={v.platform}
                                onChange={(e) => updateMobileVersion(idx, { platform: e.target.value })}
                                className="border rounded px-2 py-1 w-36"
                              >
                                <option value="android">android</option>
                                <option value="ios">ios</option>
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <input
                                value={v.versionName}
                                onChange={(e) => updateMobileVersion(idx, { versionName: e.target.value })}
                                className="border rounded px-2 py-1 w-28"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <input
                                type="number"
                                value={v.buildNumber}
                                onChange={(e) =>
                                  updateMobileVersion(idx, { buildNumber: Number(e.target.value || 0) })
                                }
                                className="border rounded px-2 py-1 w-24"
                              />
                            </td>
                            <td className="px-4 py-2">
                              <select
                                value={v.status}
                                onChange={(e) =>
                                  updateMobileVersion(idx, { status: e.target.value as MobileAppVersionStatus })
                                }
                                className="border rounded px-2 py-1 w-36"
                              >
                                <option value="ACTIVE">ACTIVE</option>
                                <option value="DEPRECATED">DEPRECATED</option>
                                <option value="BLOCKED">BLOCKED</option>
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <input
                                value={v.storeUrl || ""}
                                onChange={(e) => updateMobileVersion(idx, { storeUrl: e.target.value })}
                                className="border rounded px-2 py-1 w-[360px]"
                                placeholder={mobile.defaultStoreUrl || "https://..."}
                              />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeMobileVersion(idx)}
                                className="inline-flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
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
