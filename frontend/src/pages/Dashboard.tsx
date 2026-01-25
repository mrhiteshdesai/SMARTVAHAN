import React, { useState, useMemo } from "react";
import { useDashboardStats, useStates, useOEMs, useSystemSettings } from "../api/hooks";
import { useAuth } from "../auth/AuthContext";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { LayoutDashboard, Users, CheckCircle2, QrCode, AlertTriangle } from "lucide-react";
import { GoogleMap, HeatmapLayerF, useJsApiLoader } from '@react-google-maps/api';

class DashboardErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
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

const libraries: ("visualization" | "places" | "drawing" | "geometry" | "localContext")[] = ["visualization"];

function DashboardMap({ apiKey, data }: { apiKey: string, data: any[] }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries,
    preventGoogleFontsLoading: true
  });

  const heatmapData = useMemo(() => {
    try {
        if (!isLoaded || !window.google || !data) return [];
        return data
            .filter((d: any) => d.lat && d.lng) // Filter invalid coordinates
            .map((d: any) => ({
                location: new google.maps.LatLng(d.lat, d.lng),
                weight: d.weight
            }));
    } catch (e) {
        console.error("Failed to generate heatmap data", e);
        return [];
    }
  }, [isLoaded, data]);

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
          mapContainerStyle={{ width: '100%', height: '100%' }}
          center={{ lat: 20.5937, lng: 78.9629 }}
          zoom={5}
      >
          {heatmapData.length > 0 && (
              <HeatmapLayerF
                  data={heatmapData}
                  options={{
                      radius: 30,
                      opacity: 0.6
                  }}
              />
          )}
      </GoogleMap>
  );
}

function DashboardContent() {
  const { user } = useAuth();
  const isRestricted = user?.role === 'OEM_ADMIN' || user?.role === 'DEALER_USER' || user?.role === 'DEALER';

  const [stateCode, setStateCode] = useState("");
  const [oemCode, setOemCode] = useState("");
  const [dateRange, setDateRange] = useState({ start: "", end: "" });

  const { data: stats, isLoading, error: apiError } = useDashboardStats({
    stateCode: stateCode || undefined,
    oemCode: oemCode || undefined,
    startDate: dateRange.start || undefined,
    endDate: dateRange.end || undefined,
  });

  const { data: states } = useStates();
  const { data: oems } = useOEMs();
  const { data: settings } = useSystemSettings();

  if (isLoading) return <div className="p-6">Loading dashboard data...</div>;
  if (apiError) return <div className="p-6 text-red-500">Failed to load dashboard data: {(apiError as any).message}</div>;
  if (!stats) return <div className="p-6">No dashboard data available</div>;

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500">System overview and statistics</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {user?.role !== 'STATE_ADMIN' && user?.role !== 'DEALER_USER' && user?.role !== 'DEALER' && (
            <select 
              className="rounded-md border px-3 py-2 text-sm bg-white"
              value={stateCode}
              onChange={(e) => setStateCode(e.target.value)}
            >
              <option value="">All States</option>
              {states?.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
          )}
          {user?.role !== 'OEM_ADMIN' && user?.role !== 'DEALER_USER' && user?.role !== 'DEALER' && (
            <select 
              className="rounded-md border px-3 py-2 text-sm bg-white"
              value={oemCode}
              onChange={(e) => setOemCode(e.target.value)}
            >
              <option value="">All OEMs</option>
              {oems?.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
            </select>
          )}
          <input 
            type="date" 
            className="rounded-md border px-2 py-2 text-sm bg-white"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
          />
          <input 
            type="date" 
            className="rounded-md border px-2 py-2 text-sm bg-white"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
          />
        </div>
      </div>

      {/* Row 1: Today's Certs by Product */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['C3', 'C4', 'CT', 'CTAUTO'].map(p => (
            <StatCard 
                key={p}
                title={`${p} Generated Today`}
                value={stats.row1[p] || 0}
                icon={<CheckCircle2 className="w-5 h-5 text-blue-500" />}
            />
        ))}
      </div>

      {/* Row 2: Certs Counts */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Certificates Today" value={stats.row2.today} icon={<LayoutDashboard className="w-5 h-5 text-green-500" />} />
        <StatCard title="Certificates Yesterday" value={stats.row2.yesterday} icon={<LayoutDashboard className="w-5 h-5 text-gray-500" />} />
        {/* Placeholder for future stat */}
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-6 flex items-center justify-center text-gray-400">
            <span className="text-sm font-medium">Space Available</span>
        </div>
        <div className="bg-gray-50 rounded-xl border border-dashed border-gray-300 p-6 flex items-center justify-center text-gray-400">
            <span className="text-sm font-medium">Space Available</span>
        </div>
      </div>

      {/* Row 3: Totals */}
      <div className={`grid grid-cols-1 md:grid-cols-2 ${isRestricted ? 'lg:grid-cols-2' : 'lg:grid-cols-4'} gap-4`}>
        {!isRestricted && <StatCard title="Total QR Issued" value={stats.row3.totalQrIssued} icon={<QrCode className="w-5 h-5 text-indigo-500" />} />}
        <StatCard title="Total QR Used" value={stats.row3.totalQrUsed} icon={<QrCode className="w-5 h-5 text-emerald-500" />} />
        <StatCard title="Total Certs Generated" value={stats.row3.totalCerts} icon={<CheckCircle2 className="w-5 h-5 text-orange-500" />} />
        {!isRestricted && <StatCard title="Total Active Dealers" value={stats.row3.totalActiveDealers} icon={<Users className="w-5 h-5 text-blue-500" />} />}
      </div>

      {/* Row 4: QR Metrics by Product */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {['C3', 'C4', 'CT', 'CTAUTO'].map(p => (
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

      {/* Row 5: Charts (Product Trends & OEM Trends) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Product Bar Chart */}
        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
            <h3 className="text-lg font-semibold mb-6">Certificate Trends (Product)</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.barData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short' })} />
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
        
        {/* Right: OEM Bar Chart */}
        <div className="bg-white p-6 rounded-xl border shadow-sm flex flex-col h-[400px]">
            <h3 className="text-lg font-semibold mb-6">Certificate Trends (OEM)</h3>
            <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats.oemBarData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="date" tickFormatter={(val) => new Date(val).toLocaleDateString(undefined, { weekday: 'short' })} />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        {(() => {
                            const keys = new Set<string>();
                            stats.oemBarData?.forEach(d => Object.keys(d).forEach(k => k !== 'date' && keys.add(k)));
                            const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff7300', '#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
                            return Array.from(keys).map((key, index) => (
                                <Bar key={key} dataKey={key} stackId="a" fill={colors[index % colors.length]} />
                            ));
                        })()}
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
        )}
      </div>

      {/* Row 6: Tables (Top OEMs & Top RTOs) */}
      <div className={`grid grid-cols-1 ${isRestricted ? '' : 'lg:grid-cols-2'} gap-6`}>
         {/* Left: Top Performing OEMs */}
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
                                <td className="px-4 py-3 font-medium">{r.name || r.code || 'N/A'}</td>
                                <td className="px-4 py-3 text-right">{r.count}</td>
                            </tr>
                        ))}
                        {(!stats.oemPerformance || stats.oemPerformance.length === 0) && (
                            <tr>
                                <td colSpan={2} className="px-4 py-3 text-center text-gray-500">No data available</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
        )}

        {/* Right: Top 10 RTOs Table */}
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
                                <td className="px-4 py-3 font-medium">{r.rto || 'N/A'}</td>
                                <td className="px-4 py-3 text-right">{r.count}</td>
                            </tr>
                        ))}
                        {(!stats.rtoDensity || stats.rtoDensity.length === 0) && (
                            <tr>
                                <td colSpan={2} className="px-4 py-3 text-center text-gray-500">No data available</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      </div>

      {/* Row 7: Heatmap (Full Width) */}
      <div className="h-[500px] bg-white p-6 rounded-xl border shadow-sm flex flex-col">
          <h3 className="text-lg font-semibold mb-4">Certificate Generation Heatmap</h3>
          <div className="flex-1 rounded-lg overflow-hidden relative">
            {settings?.googlePlacesKey ? (
                <DashboardMap 
                    apiKey={settings.googlePlacesKey} 
                    data={stats?.heatmapData || []} 
                />
            ) : (
                <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-500">
                    {settings ? "Map Unavailable: Google Maps API Key not configured" : "Loading Map Configuration..."}
                </div>
            )}
          </div>
      </div>

    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div className="bg-white p-6 rounded-xl border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-gray-500 text-sm font-medium">{title}</h3>
        <div className="p-2 bg-gray-50 rounded-lg">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-gray-900">
        {value.toLocaleString()}
      </div>
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
