import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Download, Search } from 'lucide-react';

interface ReportTableProps {
  title: string;
  data: any[];
  isLoading: boolean;
  columns: string[]; // Keys to display
}

export default function ReportTable({ title, data, isLoading, columns }: ReportTableProps) {
  const [search, setSearch] = useState("");
  
  const handleExport = () => {
    if (!data || data.length === 0) return;

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    
    // Generate filename based on title and date
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `${title.replace(/\s+/g, '_')}_${dateStr}.xlsx`);
  };

  const filteredData = React.useMemo(() => {
    if (!data) return [];
    if (!search) return data;
    const lowerSearch = search.toLowerCase();
    return data.filter(row => {
      return columns.some(col => {
        const val = row[col];
        return val && String(val).toLowerCase().includes(lowerSearch);
      });
    });
  }, [data, search, columns]);

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading report data...</div>;
  }

  if (!data || data.length === 0) {
    return <div className="p-8 text-center text-gray-500">No data found for the selected criteria.</div>;
  }

  // Helper to format header text (camelCase/snake_case to Title Case)
  const formatHeader = (key: string) => {
    return key; 
    // The backend returns pre-formatted keys like "State Name", "C3", etc. 
    // If needed, we can add logic here.
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
        <h3 className="font-semibold text-gray-700">{title}</h3>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input 
            type="text" 
            placeholder="Search..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-4 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-100 text-gray-600 font-medium border-b">
            <tr>
              <th className="px-4 py-3 w-12 text-center">#</th>
              {columns.map((col) => (
                <th key={col} className="px-4 py-3 whitespace-nowrap">
                  {formatHeader(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500">
                  No matching records found.
                </td>
              </tr>
            ) : (
              filteredData.map((row, idx) => (
                <tr key={idx} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-center text-gray-400">{idx + 1}</td>
                  {columns.map((col) => (
                    <td key={col} className="px-4 py-3">
                      {row[col] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
