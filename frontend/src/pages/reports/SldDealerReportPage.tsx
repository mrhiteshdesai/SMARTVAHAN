import { useState } from "react";
import { useSldDealerReport, SldReportFilters } from "../../api/reportsHooks";
import { useSldOems, useStates } from "../../api/hooks";
import ReportTable from "./ReportTable";
import ReportCharts from "./ReportCharts";
import * as XLSX from "xlsx";

export default function SldDealerReportPage() {
  const [appliedFilters, setAppliedFilters] = useState<SldReportFilters>({});
  const [hasApplied, setHasApplied] = useState(false);
  const [local, setLocal] = useState<SldReportFilters>({});

  const { data: states = [] } = useStates();
  const { data: sldOems = [] } = useSldOems();
  const { data, isLoading } = useSldDealerReport(appliedFilters, hasApplied);

  const handleApply = () => {
    setAppliedFilters({ ...local });
    setHasApplied(true);
  };

  const handleExport = () => {
    if (!data?.length) return alert("No data to export");
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SLD Dealer");
    XLSX.writeFile(workbook, `SLD_Dealer_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">SLD Dealer Report</h1>
        <p className="text-sm text-gray-500">SLD fitment certificates by dealer.</p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6 flex flex-wrap gap-3">
        <select
          className="border rounded-md p-2 text-sm"
          value={local.stateCode || ""}
          onChange={(e) => setLocal((p) => ({ ...p, stateCode: e.target.value }))}
        >
          <option value="">All States</option>
          {states.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          className="border rounded-md p-2 text-sm"
          value={local.sldOemId || ""}
          onChange={(e) => setLocal((p) => ({ ...p, sldOemId: e.target.value }))}
        >
          <option value="">All SLD OEMs</option>
          {sldOems.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          className="border rounded-md p-2 text-sm"
          value={local.startDate || ""}
          onChange={(e) => setLocal((p) => ({ ...p, startDate: e.target.value }))}
        />
        <input
          type="date"
          className="border rounded-md p-2 text-sm"
          value={local.endDate || ""}
          onChange={(e) => setLocal((p) => ({ ...p, endDate: e.target.value }))}
        />
        <button type="button" onClick={handleApply} className="px-4 py-2 bg-primary text-white rounded-md text-sm">
          Apply Filters
        </button>
        <button type="button" onClick={handleExport} className="px-4 py-2 border rounded-md text-sm">
          Export Excel
        </button>
      </div>

      {hasApplied ? (
        <>
          <ReportCharts data={data || []} labelKey="Dealer Name" />
          <ReportTable
            title="SLD Dealer Report"
            data={data || []}
            isLoading={isLoading}
            columns={["Dealer Name", "City", "Pending", "Completed", "Total"]}
          />
        </>
      ) : (
        <div className="text-center text-gray-500 mt-10 p-8 bg-gray-50 rounded-lg border border-dashed">
          Select filters and click Apply to view the report.
        </div>
      )}
    </div>
  );
}
