import React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

type ReportChartsProps = {
  data: any[];
  labelKey: string;
  productKeys?: string[];
};

function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function ReportCharts({ data, labelKey, productKeys = ["C3", "C4", "CT", "CTAUTO"] }: ReportChartsProps) {
  const productTotals = React.useMemo(() => {
    const totals: Record<string, number> = {};
    for (const k of productKeys) totals[k] = 0;

    for (const row of data || []) {
      for (const k of productKeys) {
        const n = toNumber(row?.[k]);
        if (n !== null) totals[k] += n;
      }
    }

    return productKeys.map((k) => ({ name: k, value: totals[k] || 0 }));
  }, [data, productKeys]);

  const topEntities = React.useMemo(() => {
    const rows = (data || [])
      .map((row: any) => {
        const name = row?.[labelKey] ?? "-";
        const total = toNumber(row?.["Total"]) ?? 0;
        return { name, total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    return rows;
  }, [data, labelKey]);

  if (!data || data.length === 0) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 my-4">
      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-700 mb-3">Product Totals</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={productTotals}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" name="Certificates" fill="#4F46E5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-lg border shadow-sm p-4">
        <div className="text-sm font-semibold text-gray-700 mb-3">Top 10 by Total</div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topEntities} layout="vertical" margin={{ left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} />
              <YAxis type="category" dataKey="name" width={160} />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" name="Total" fill="#0EA5E9" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
