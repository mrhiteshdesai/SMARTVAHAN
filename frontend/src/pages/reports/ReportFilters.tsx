import React, { useState } from 'react';
import { useStates, useOEMs } from '../../api/hooks';
import { FileSpreadsheet, Filter } from 'lucide-react';

export interface FilterState {
  stateCode?: string;
  oemCode?: string;
  startDate?: string;
  endDate?: string;
}

interface ReportFiltersProps {
  showState?: boolean;
  showOem?: boolean;
  showDate?: boolean;
  onApply: (filters: FilterState) => void;
  onExport: () => void;
}

export default function ReportFilters({ 
  showState = false, 
  showOem = false, 
  showDate = true, 
  onApply,
  onExport
}: ReportFiltersProps) {
  
  const { data: states = [] } = useStates();
  const { data: oems = [] } = useOEMs();

  const [localFilters, setLocalFilters] = useState<FilterState>({});

  const handleChange = (key: keyof FilterState, value: string) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleApply = () => {
    onApply(localFilters);
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap items-center gap-4">
      
      {showState && (
        <select
          className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-w-[150px]"
          value={localFilters.stateCode || ''}
          onChange={(e) => handleChange('stateCode', e.target.value)}
        >
          <option value="">All States</option>
          {states.map(s => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
      )}

      {showOem && (
        <select
          className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none min-w-[150px]"
          value={localFilters.oemCode || ''}
          onChange={(e) => handleChange('oemCode', e.target.value)}
        >
          <option value="">All OEMs</option>
          {oems.map(o => (
            <option key={o.code} value={o.code}>{o.name}</option>
          ))}
        </select>
      )}

      {showDate && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={localFilters.startDate || ''}
            onChange={(e) => handleChange('startDate', e.target.value)}
            placeholder="Start Date"
          />
          <span className="text-gray-500">-</span>
          <input
            type="date"
            className="border border-gray-300 rounded-md p-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={localFilters.endDate || ''}
            onChange={(e) => handleChange('endDate', e.target.value)}
            placeholder="End Date"
          />
        </div>
      )}

      <button
        onClick={handleApply}
        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium whitespace-nowrap"
      >
        <Filter size={16} />
        Apply Filters
      </button>

      <button
        onClick={onExport}
        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium whitespace-nowrap ml-auto"
        title="Export to Excel"
      >
        <FileSpreadsheet size={16} />
        Export Excel
      </button>
    </div>
  );
}
