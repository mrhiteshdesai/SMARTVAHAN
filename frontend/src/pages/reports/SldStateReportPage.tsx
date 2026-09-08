import { useState } from "react";
import { useSldStateReport, SldReportFilters } from "../../api/reportsHooks";
import ReportTable from "./ReportTable";
import ReportCharts from "./ReportCharts";
import * as XLSX from "xlsx";

export default function SldStateReportPage() {
  const [appliedFilters, setAppliedFilters] = useState<SldReportFilters>({});
  const [hasApplied, setHasApplied] = useState(false);
  const [local, setLocal] = useState<SldReportFilters>({});

  const { data, isLoading } = useSldStateReport(appliedFilters, hasApplied);

  const handleApply = () => {
    setAppliedFilters({ ...local });
    setHasApplied(true);
  };

  const handleExport = () => {
    if (!data?.length) return alert("No data to export");
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "SLD State");
    XLSX.writeFile(workbook, `SLD_State_Report_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">SLD State Report</h1>
        <p className="text-sm text-gray-500">SLD fitment certificates grouped by state.</p>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border mb-6 flex flex-wrap gap-3">
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
          <ReportCharts data={data || []} labelKey="State Name" />
          <ReportTable
            title="SLD State Report"
            data={data || []}
            isLoading={isLoading}
            columns={["State Name", "Pending", "Completed", "Total"]}
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
