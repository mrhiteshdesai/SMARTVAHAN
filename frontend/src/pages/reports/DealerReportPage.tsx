import { useState } from 'react';
import { useDealerReport, ReportFilters } from '../../api/reportsHooks';
import ReportTable from './ReportTable';
import ReportFiltersComponent, { FilterState } from './ReportFilters';
import * as XLSX from 'xlsx';

export default function DealerReportPage() {
  const [appliedFilters, setAppliedFilters] = useState<ReportFilters>({});
  const [hasApplied, setHasApplied] = useState(false);

  const { data, isLoading } = useDealerReport(appliedFilters, hasApplied);

  const handleApply = (filters: FilterState) => {
    setAppliedFilters(filters);
    setHasApplied(true);
  };

  const handleExport = () => {
    if (!data || data.length === 0) {
      alert("No data to export");
      return;
    }
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Dealer Report");
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Dealer_Report_${dateStr}.xlsx`);
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dealer Wise Report</h1>
        <p className="text-sm text-gray-500">Certificate generation summary by Dealer and Product.</p>
      </div>

      <ReportFiltersComponent 
        showState={true}
        showOem={true}
        showDate={true}
        onApply={handleApply}
        onExport={handleExport}
      />

      {hasApplied ? (
        <ReportTable 
          title="Dealer Report"
          data={data || []}
          isLoading={isLoading}
          columns={['Dealer Name', 'City', 'C3', 'C4', 'CT', 'CTAUTO', 'Total']}
        />
      ) : (
        <div className="text-center text-gray-500 mt-10 p-8 bg-gray-50 rounded-lg border border-dashed border-gray-300">
          Select filters and click "Apply Filters" to view the report.
        </div>
      )}
    </div>
  );
}
