import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  useDashboardStats,
  useSldDashboardStats,
  useStates,
  useOEMs,
  useSldOems,
  useSystemSettings,
  type DashboardStats,
  type SldDashboardStats,
} from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  LayoutDashboard,
  Users,
  CheckCircle2,
  QrCode,
  AlertTriangle,
  Gauge,
  Building2,
  FileBadge2,
  Package,
  Clock,
  Layers,
  Filter,
  RotateCcw,
} from "lucide-react";
import { GoogleMap, CircleF, useJsApiLoader } from "@react-google-maps/api";

type DashboardTab = "combined" | "reflective" | "sld";

type DashboardFilterDraft = {
  stateCode: string;
  oemCode: string;
  sldOemCode: string;
  start: string;
  end: string;
};

const EMPTY_FILTERS: DashboardFilterDraft = {
  stateCode: "",
  oemCode: "",
  sldOemCode: "",
  start: "",
  end: "",
};

class DashboardErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 text-red-600 bg-red-50 rounded-xl border border-red-200">
          <h2 className="text-lg font-bold mb-2 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5" />
            Dashboard Error
          </h2>
          <p className="text-sm">{this.state.error?.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function DashboardMap({ apiKey, data }: { apiKey: string; data: any[] }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: apiKey,
    preventGoogleFontsLoading: true,
  });

  const points = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    return data
      .map((d: any) => ({
        lat: typeof d?.lat === "number" ? d.lat : Number(d?.lat),
        lng: typeof d?.lng === "number" ? d.lng : Number(d?.lng),
        weight: typeof d?.weight === "number" ? d.weight : Number(d?.weight ?? 1),
      }))
      .filter((d) => Number.isFinite(d.lat) && Number.isFinite(d.lng))
      .map((d) => ({
        lat: d.lat,
        lng: d.lng,
        weight: Number.isFinite(d.weight) && d.weight > 0 ? d.weight : 1,
      }));
  }, [data]);

  const maxWeight = useMemo(() => {
    if (!points.length) return 1;
    return points.reduce((m, p) => (p.weight > m ? p.weight : m), 1);
  }, [points]);

  const getHeatColor = (t: number) => {
    const x = Math.max(0, Math.min(1, t));
    const r = Math.round(255 * x);
    const g = Math.round(160 * (1 - x));
    const b = Math.round(60 * (1 - x));
    return `rgb(${r},${g},${b})`;
  };

  if (loadError) {
    return (
      <div className="w-full h-full bg-red-50 flex flex-col items-center justify-center text-red-500 p-4 text-center">
        <p>Map Error</p>
        <p className="text-xs mt-1">{loadError.message}</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-500">
        Loading Map...
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={{ width: "100%", height: "100%" }}
      center={{ lat: 20.5937, lng: 78.9629 }}
      zoom={5}
    >
      {points.map((p, idx) => {
        const t = maxWeight <= 0 ? 0 : p.weight / maxWeight;
        const radiusMeters = 6000 + Math.round(24000 * t);
        const fillOpacity = 0.1 + 0.35 * t;
        const strokeOpacity = 0.18 + 0.35 * t;
        const color = getHeatColor(t);
        return (
          <CircleF
            key={`${p.lat},${p.lng},${idx}`}
            center={{ lat: p.lat, lng: p.lng }}
            radius={radiusMeters}
            options={{
              fillColor: color,
              fillOpacity,
              strokeColor: color,
              strokeOpacity,
              strokeWeight: 1,
              clickable: false,
            }}
          />
        );
      })}
    </GoogleMap>
  );
}

function StatCard({
  title,
  value,
  icon,
  className = "",
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white p-6 rounded-xl border shadow-sm ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
        <div className="p-2 bg-gray-50 rounded-lg">{icon}</div>
      </div>
      <div className="text-2xl font-bold text-gray-900">{Number(value).toLocaleString()}</div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
        active
          ? "bg-[#12314D] text-white"
          : "bg-white text-gray-600 border hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function CombinedOverview({
  reflective,
  sld,
}: {
  reflective: DashboardStats;
  sld: SldDashboardStats;
}) {
  const reflectiveToday = reflective.row2.today;
  const qrUsed = reflective.row3.totalQrUsed;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Ref. Certs Today"
          value={reflectiveToday}
          icon={<CheckCircle2 className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          title="SLD Pending Vahan"
          value={sld.row2.pending}
          icon={<Clock className="w-5 h-5 text-amber-500" />}
        />
        <StatCard
          title="Total QR Used (Filtered)"
          value={qrUsed}
          icon={<QrCode className="w-5 h-5 text-indigo-500" />}
        />
        <StatCard
          title="SLD Completed Today"
          value={sld.row2.completedToday}
          icon={<Gauge className="w-5 h-5 text-emerald-500" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Layers className="w-5 h-5 text-[#12314D]" />
            <h2 className="text-lg font-semibold text-gray-800">Reflective MIS</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-500">Certs Yesterday</p>
              <p className="text-xl font-bold">{reflective.row2.yesterday}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-500">Active Dealers</p>
              <p className="text-xl font-bold">{reflective.row3.totalActiveDealers}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/control/inventory" className="text-sm text-primary hover:underline">
              QR Inventory →
            </Link>
            <Link to="/control/reports/state" className="text-sm text-primary hover:underline">
              Ref. Reports →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <Gauge className="w-5 h-5 text-[#12314D]" />
            <h2 className="text-lg font-semibold text-gray-800">SLD MIS</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-500">SLD Certs Today</p>
              <p className="text-xl font-bold">{sld.row2.today}</p>
            </div>
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-gray-500">Serial Available</p>
              <p className="text-xl font-bold">{sld.row3.inventoryAvailable}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              to="/control/sld/certificates?status=PENDING"
              className="text-sm text-primary hover:underline"
            >
              Pending Queue →
            </Link>
            <Link to="/control/reports/sld/oem" className="text-sm text-primary hover:underline">
              SLD Reports →
            </Link>
          </div>
        </div>
      </div>

      {sld.pendingQueue.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm p-5">
          <h3 className="text-lg font-semibold mb-4">SLD Pending Vahan — Oldest First</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                <tr>
                  <th className="px-4 py-3">Certificate</th>
                  <th className="px-4 py-3">Vehicle</th>
                  <th className="px-4 py-3">Dealer</th>
                  <th className="px-4 py-3">SLD OEM</th>
                  <th className="px-4 py-3">Since</th>
                </tr>
              </thead>
              <tbody>
                {sld.pendingQueue.map((row) => (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{row.certificateNumber}</td>
                    <td className="px-4 py-3">{row.vehicleNumber || "—"}</td>
                    <td className="px-4 py-3">{row.dealer.name}</td>
                    <td className="px-4 py-3">{row.sldOem.name}</td>
                    <td className="px-4 py-3">
                      {new Date(row.generatedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ReflectiveOverview({
  stats,
  isRestricted,
  googlePlacesKey,
}: {
  stats: DashboardStats;
  isRestricted: boolean;
  googlePlacesKey?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {["C3", "C4", "CT", "CTAUTO"].map((p) => (
          <StatCard
            key={p}
            title={`${p} Generated Today`}
            value={stats.row1[p] || 0}
            icon={<CheckCircle2 className="w-5 h-5 text-blue-500" />}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Certificates Today"
          value={stats.row2.today}
          icon={<LayoutDashboard className="w-5 h-5 text-green-500" />}
        />
        <StatCard
          title="Certificates Yesterday"
          value={stats.row2.yesterday}
          icon={<LayoutDashboard className="w-5 h-5 text-gray-500" />}
        />
        <StatCard
          title="This Week"
          value={stats.row2.thisWeek}
          icon={<LayoutDashboard className="w-5 h-5 text-purple-500" />}
        />
        <StatCard
          title="Total Certs (Filtered)"
          value={stats.row3.totalCerts}
          icon={<CheckCircle2 className="w-5 h-5 text-orange-500" />}
        />
      </div>

      <div
        className={`grid grid-cols-1 md:grid-cols-2 ${isRestricted ? "lg:grid-cols-2" : "lg:grid-cols-4"} gap-4`}
      >
        {!isRestricted && (
          <StatCard
            title="Total QR Issued"
            value={stats.row3.totalQrIssued}
            icon={<QrCode className="w-5 h-5 text-indigo-500" />}
          />
        )}
        <StatCard
          title="Total QR Used"
          value={stats.row3.totalQrUsed}
          icon={<QrCode className="w-5 h-5 text-emerald-500" />}
        />
        {!isRestricted && (
          <StatCard
            title="Total Active Dealers"
            value={stats.row3.totalActiveDealers}
            icon={<Users className="w-5 h-5 text-blue-500" />}
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {["C3", "C4", "CT", "CTAUTO"].map((p) => (
          <div key={p} className="bg-white p-6 rounded-xl border shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-gray-500 text-sm font-medium">{p} Overview</h3>
              <div className="p-2 bg-gray-50 rounded-lg">
                <QrCode className="w-4 h-4 text-gray-600" />
              </div>
            </div>
            <div className="space-y-2">
              {!isRestricted && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Issued</span>
                  <span className="font-semibold">{stats.row4[p]?.issued || 0}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Used</span>
                <span className="font-semibold">{stats.row4[p]?.used || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <h3 className="text-lg font-semibold mb-6">Certificate Trends (Product)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) =>
                    new Date(val).toLocaleDateString(undefined, { weekday: "short" })
                  }
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="C3" stackId="a" fill="#3B82F6" />
                <Bar dataKey="C4" stackId="a" fill="#10B981" />
                <Bar dataKey="CT" stackId="a" fill="#F59E0B" />
                <Bar dataKey="CTAUTO" stackId="a" fill="#EF4444" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <h3 className="text-lg font-semibold mb-6">Certificate Trends (OEM)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.oemBarData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) =>
                    new Date(val).toLocaleDateString(undefined, { weekday: "short" })
                  }
                />
                <YAxis />
                <Tooltip />
                <Legend />
                {(() => {
                  const keys = new Set<string>();
                  stats.oemBarData?.forEach((d) =>
                    Object.keys(d).forEach((k) => k !== "date" && keys.add(k)),
                  );
                  const colors = [
                    "#8884d8",
                    "#82ca9d",
                    "#ffc658",
                    "#ff7300",
                    "#0088FE",
                    "#00C49F",
                    "#FFBB28",
                    "#FF8042",
                  ];
                  return Array.from(keys).map((key, index) => (
                    <Bar key={key} dataKey={key} stackId="a" fill={colors[index % colors.length]} />
                  ));
                })()}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${isRestricted ? "" : "lg:grid-cols-2"} gap-6`}>
        {!isRestricted && (
          <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
            <h3 className="text-lg font-semibold mb-4">Top Performing OEMs</h3>
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3">OEM</th>
                    <th className="px-4 py-3 text-right">Certs</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.oemPerformance?.slice(0, 10).map((r: any, i: number) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{r.name || r.code || "N/A"}</td>
                      <td className="px-4 py-3 text-right">{r.count}</td>
                    </tr>
                  ))}
                  {(!stats.oemPerformance || stats.oemPerformance.length === 0) && (
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-center text-gray-500">
                        No data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <h3 className="text-lg font-semibold mb-4">Top 10 RTOs</h3>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3">RTO</th>
                  <th className="px-4 py-3 text-right">Certs</th>
                </tr>
              </thead>
              <tbody>
                {stats.rtoDensity?.slice(0, 10).map((r: any, i: number) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.rto || "N/A"}</td>
                    <td className="px-4 py-3 text-right">{r.count}</td>
                  </tr>
                ))}
                {(!stats.rtoDensity || stats.rtoDensity.length === 0) && (
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-center text-gray-500">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="h-[500px] bg-white p-6 rounded-xl border shadow-sm flex flex-col">
        <h3 className="text-lg font-semibold mb-4">Certificate Generation Heatmap</h3>
        <div className="flex-1 rounded-lg overflow-hidden relative">
          {googlePlacesKey ? (
            <DashboardMap apiKey={googlePlacesKey} data={stats?.heatmapData || []} />
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-500">
              Map Unavailable: Google Maps API Key not configured
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SldOverview({ stats, googlePlacesKey }: { stats: SldDashboardStats; googlePlacesKey?: string }) {
  const oemCodes = Object.keys(stats.row1);
  const sldColors = ["#12314D", "#2563EB", "#059669", "#D97706", "#7C3AED", "#DC2626"];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {oemCodes.length > 0
          ? oemCodes.slice(0, 4).map((code, i) => (
              <StatCard
                key={code}
                title={`${stats.oemLabels[code] || code} Today`}
                value={stats.row1[code] || 0}
                icon={
                  <Building2
                    className="w-5 h-5"
                    style={{ color: sldColors[i % sldColors.length] }}
                  />
                }
              />
            ))
          : [
              <StatCard
                key="today"
                title="SLD Certs Today"
                value={stats.row2.today}
                icon={<Gauge className="w-5 h-5 text-blue-500" />}
              />,
              <StatCard
                key="pending"
                title="Pending Vahan"
                value={stats.row2.pending}
                icon={<Clock className="w-5 h-5 text-amber-500" />}
              />,
              <StatCard
                key="completed"
                title="Completed Today"
                value={stats.row2.completedToday}
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-500" />}
              />,
              <StatCard
                key="yesterday"
                title="SLD Certs Yesterday"
                value={stats.row2.yesterday}
                icon={<Gauge className="w-5 h-5 text-gray-500" />}
              />,
            ]}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="SLD Certs Today"
          value={stats.row2.today}
          icon={<Gauge className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          title="SLD Certs Yesterday"
          value={stats.row2.yesterday}
          icon={<Gauge className="w-5 h-5 text-gray-500" />}
        />
        <Link
          to="/control/sld/certificates?status=PENDING"
          className="bg-amber-50 rounded-xl border border-amber-200 p-6 hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-amber-900 text-sm font-medium">Pending Vahan</h3>
            <Clock className="w-5 h-5 text-amber-700" />
          </div>
          <div className="text-2xl font-bold text-amber-950">{stats.row2.pending}</div>
          <p className="text-xs text-amber-800 mt-1">Awaiting Vahan PDF upload</p>
        </Link>
        <Link
          to="/control/sld/certificates?status=COMPLETED"
          className="bg-emerald-50 rounded-xl border border-emerald-200 p-6 hover:bg-emerald-100 transition-colors"
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-emerald-900 text-sm font-medium">Completed Today</h3>
            <CheckCircle2 className="w-5 h-5 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-emerald-950">{stats.row2.completedToday}</div>
          <p className="text-xs text-emerald-800 mt-1">Vahan uploaded today</p>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total SLD Certs"
          value={stats.row3.totalCerts}
          icon={<FileBadge2 className="w-5 h-5 text-orange-500" />}
        />
        <StatCard
          title="Serial Available"
          value={stats.row3.inventoryAvailable}
          icon={<Package className="w-5 h-5 text-green-500" />}
        />
        <StatCard
          title="Serial Assigned"
          value={stats.row3.inventoryAssigned}
          icon={<Package className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          title="Serial Used"
          value={stats.row3.inventoryUsed}
          icon={<Package className="w-5 h-5 text-gray-500" />}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title="Active SLD Dealers"
          value={stats.row3.activeSldDealers}
          icon={<Users className="w-5 h-5 text-indigo-500" />}
        />
        <StatCard
          title="SLD OEMs"
          value={stats.row3.sldOemCount}
          icon={<Building2 className="w-5 h-5 text-purple-500" />}
        />
        <div className="bg-white p-6 rounded-xl border shadow-sm">
          <h3 className="text-gray-500 text-sm font-medium mb-4">Pending Queue Aging</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">0–3 days</span>
              <span className="font-semibold">{stats.pendingAging.days0to3}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">4–7 days</span>
              <span className="font-semibold text-amber-600">{stats.pendingAging.days4to7}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">7+ days</span>
              <span className="font-semibold text-red-600">{stats.pendingAging.days7plus}</span>
            </div>
          </div>
        </div>
      </div>

      {oemCodes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {oemCodes.map((code) => (
            <div key={code} className="bg-white p-6 rounded-xl border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-700 text-sm font-medium">{stats.oemLabels[code] || code}</h3>
                <Building2 className="w-4 h-4 text-gray-600" />
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Certs</span>
                  <span className="font-semibold">{stats.row4[code]?.certs || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Pending</span>
                  <span className="font-semibold text-amber-600">{stats.row4[code]?.pending || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Completed</span>
                  <span className="font-semibold text-emerald-600">{stats.row4[code]?.completed || 0}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <h3 className="text-lg font-semibold mb-6">SLD Certificate Trends (Status)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.barData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) =>
                    new Date(val).toLocaleDateString(undefined, { weekday: "short" })
                  }
                />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="COMPLETED" stackId="a" fill="#10B981" />
                <Bar dataKey="PENDING" stackId="a" fill="#F59E0B" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <h3 className="text-lg font-semibold mb-6">SLD Certificate Trends (OEM)</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.oemBarData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) =>
                    new Date(val).toLocaleDateString(undefined, { weekday: "short" })
                  }
                />
                <YAxis />
                <Tooltip />
                <Legend />
                {oemCodes.map((code, index) => (
                  <Bar
                    key={code}
                    dataKey={code}
                    stackId="a"
                    fill={sldColors[index % sldColors.length]}
                    name={stats.oemLabels[code] || code}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <h3 className="text-lg font-semibold mb-4">Top SLD OEMs</h3>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3">SLD OEM</th>
                  <th className="px-4 py-3 text-right">Certs</th>
                </tr>
              </thead>
              <tbody>
                {stats.oemPerformance.slice(0, 10).map((r) => (
                  <tr key={r.code} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-right">{r.count}</td>
                  </tr>
                ))}
                {stats.oemPerformance.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-center text-gray-500">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
          <h3 className="text-lg font-semibold mb-4">Top SLD Dealers</h3>
          <div className="overflow-y-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-4 py-3">Dealer</th>
                  <th className="px-4 py-3 text-right">Fitments</th>
                </tr>
              </thead>
              <tbody>
                {stats.dealerPerformance.map((r) => (
                  <tr key={r.dealerId} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-right">{r.count}</td>
                  </tr>
                ))}
                {stats.dealerPerformance.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-3 text-center text-gray-500">
                      No data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Pending Vahan Queue</h3>
          <Link to="/control/sld/certificates?status=PENDING" className="text-sm text-primary hover:underline">
            View all →
          </Link>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0">
              <tr>
                <th className="px-4 py-3">Certificate</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Dealer</th>
                <th className="px-4 py-3">SLD OEM</th>
                <th className="px-4 py-3">Since</th>
              </tr>
            </thead>
            <tbody>
              {stats.pendingQueue.map((row) => (
                <tr key={row.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{row.certificateNumber}</td>
                  <td className="px-4 py-3">{row.vehicleNumber || "—"}</td>
                  <td className="px-4 py-3">{row.dealer.name}</td>
                  <td className="px-4 py-3">{row.sldOem.name}</td>
                  <td className="px-4 py-3">{new Date(row.generatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {stats.pendingQueue.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-center text-gray-500">
                    No pending certificates
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="h-[500px] bg-white p-6 rounded-xl border shadow-sm flex flex-col">
        <h3 className="text-lg font-semibold mb-4">SLD Fitment Heatmap</h3>
        <div className="flex-1 rounded-lg overflow-hidden relative">
          {googlePlacesKey ? (
            <DashboardMap apiKey={googlePlacesKey} data={stats.heatmapData || []} />
          ) : (
            <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-500">
              Map Unavailable: Google Maps API Key not configured
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const roleValue = user?.role ? String(user.role) : "";
  const isRestricted =
    roleValue === "OEM_ADMIN" || roleValue === "DEALER_USER" || roleValue === "DEALER";
  const isGhostMode = localStorage.getItem("isGhostMode") === "true";
  const showSldModule =
    !isGhostMode && (roleValue === "SUPER_ADMIN" || roleValue === "ADMIN");

  const [draftFilters, setDraftFilters] = useState<DashboardFilterDraft>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<DashboardFilterDraft>(EMPTY_FILTERS);
  const [tab, setTab] = useState<DashboardTab>(showSldModule ? "combined" : "reflective");

  const reflectiveFilters = {
    stateCode: appliedFilters.stateCode || undefined,
    oemCode: appliedFilters.oemCode || undefined,
    startDate: appliedFilters.start || undefined,
    endDate: appliedFilters.end || undefined,
  };

  const sldFilters = {
    stateCode: appliedFilters.stateCode || undefined,
    sldOemCode: appliedFilters.sldOemCode || undefined,
    startDate: appliedFilters.start || undefined,
    endDate: appliedFilters.end || undefined,
  };

  const {
    data: stats,
    isLoading,
    isFetching,
    error: apiError,
  } = useDashboardStats(reflectiveFilters);

  const {
    data: sldStats,
    isLoading: sldLoading,
    isFetching: sldFetching,
    error: sldError,
  } = useSldDashboardStats(sldFilters, showSldModule);

  const { data: states } = useStates();
  const { data: oems } = useOEMs();
  const { data: sldOems } = useSldOems();
  const { data: settings } = useSystemSettings();

  const applyFilters = () => setAppliedFilters({ ...draftFilters });
  const resetFilters = () => {
    setDraftFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const initialLoading =
    isLoading || (showSldModule && (tab === "combined" || tab === "sld") && sldLoading && !sldStats);
  const refreshing =
    (isFetching && !isLoading) ||
    (showSldModule && (tab === "combined" || tab === "sld") && sldFetching && !sldLoading);

  if (initialLoading) return <div className="p-6">Loading dashboard data...</div>;
  if (apiError)
    return (
      <div className="p-6 text-red-500">
        Failed to load dashboard data: {(apiError as Error).message}
      </div>
    );
  if (!stats) return <div className="p-6">No dashboard data available</div>;
  if (showSldModule && sldError && (tab === "combined" || tab === "sld") && !sldStats)
    return (
      <div className="p-6 text-red-500">
        Failed to load SLD dashboard data: {(sldError as Error).message}
      </div>
    );
  if (showSldModule && !sldStats && (tab === "combined" || tab === "sld") && sldLoading)
    return <div className="p-6">Loading SLD dashboard data...</div>;

  const showReflectiveOemFilter =
    roleValue !== "OEM_ADMIN" && roleValue !== "DEALER_USER" && roleValue !== "DEALER";
  const showStateFilter =
    roleValue !== "STATE_ADMIN" && roleValue !== "DEALER_USER" && roleValue !== "DEALER";
  const showSldOemFilter = showSldModule && (tab === "sld" || tab === "combined");

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            Dashboard
            {isGhostMode && (
              <span className="ml-2 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-200">
                Ghost Mode
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500">System overview and statistics</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {showStateFilter && (
            <select
              className="rounded-md border px-3 py-2 text-sm bg-white"
              value={draftFilters.stateCode}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, stateCode: e.target.value }))
              }
            >
              <option value="">All States</option>
              {states?.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {showReflectiveOemFilter && tab !== "sld" && (
            <select
              className="rounded-md border px-3 py-2 text-sm bg-white"
              value={draftFilters.oemCode}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, oemCode: e.target.value }))
              }
            >
              <option value="">All Ref. OEMs</option>
              {oems?.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          {showSldOemFilter && (
            <select
              className="rounded-md border px-3 py-2 text-sm bg-white"
              value={draftFilters.sldOemCode}
              onChange={(e) =>
                setDraftFilters((prev) => ({ ...prev, sldOemCode: e.target.value }))
              }
            >
              <option value="">All SLD OEMs</option>
              {sldOems?.map((o) => (
                <option key={o.code} value={o.code}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            className="rounded-md border px-2 py-2 text-sm bg-white"
            value={draftFilters.start}
            onChange={(e) =>
              setDraftFilters((prev) => ({ ...prev, start: e.target.value }))
            }
          />
          <input
            type="date"
            className="rounded-md border px-2 py-2 text-sm bg-white"
            value={draftFilters.end}
            onChange={(e) =>
              setDraftFilters((prev) => ({ ...prev, end: e.target.value }))
            }
          />
          <button
            type="button"
            onClick={applyFilters}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#12314D] text-white px-3 py-2 text-sm font-medium hover:bg-[#0e2740] disabled:opacity-60"
          >
            <Filter className="w-4 h-4" />
            Filter
          </button>
          <button
            type="button"
            onClick={resetFilters}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </div>

      {refreshing && (
        <div className="text-sm text-gray-500 bg-gray-50 border rounded-md px-3 py-2">
          Updating dashboard…
        </div>
      )}

      {showSldModule && (
        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "combined"} onClick={() => setTab("combined")}>
            Combined Overview
          </TabButton>
          <TabButton active={tab === "reflective"} onClick={() => setTab("reflective")}>
            Reflective Overview
          </TabButton>
          <TabButton active={tab === "sld"} onClick={() => setTab("sld")}>
            SLD Overview
          </TabButton>
        </div>
      )}

      {tab === "combined" && showSldModule && sldStats && (
        <CombinedOverview reflective={stats} sld={sldStats} />
      )}
      {(tab === "reflective" || !showSldModule) && (
        <ReflectiveOverview
          stats={stats}
          isRestricted={isRestricted}
          googlePlacesKey={settings?.googlePlacesKey}
        />
      )}
      {tab === "sld" && showSldModule && sldStats && (
        <SldOverview stats={sldStats} googlePlacesKey={settings?.googlePlacesKey} />
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <DashboardErrorBoundary>
      <DashboardContent />
    </DashboardErrorBoundary>
  );
}
