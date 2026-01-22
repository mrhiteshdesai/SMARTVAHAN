import React, { useState, useEffect } from 'react';
import { Search, FileSpreadsheet, ShieldCheck, Clock, User, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';
import api from '../api/client';

interface AuditLog {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    details: string | null;
    userId: string | null;
    ipAddress: string | null;
    timestamp: string;
    user?: {
        name: string;
        email: string;
        role: string;
    };
}

const AuditLogPage = () => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setPage(1); // Reset to page 1 on search
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    useEffect(() => {
        fetchLogs();
    }, [page, debouncedSearch]);

    const fetchLogs = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/audit?page=${page}&limit=20&search=${debouncedSearch}`);
            setLogs(res.data.data);
            setTotalPages(res.data.totalPages);
        } catch (error) {
            console.error('Failed to fetch audit logs', error);
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        const exportData = logs.map(log => ({
            "Timestamp": new Date(log.timestamp).toLocaleString(),
            "User": log.user?.name || 'System',
            "Role": log.user?.role || '-',
            "Action": log.action,
            "Entity": log.entity,
            "Details": log.details,
            "IP Address": log.ipAddress || '-'
        }));
        const ws = XLSX.utils.json_to_sheet(exportData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Audit Logs");
        XLSX.writeFile(wb, `Audit_Logs_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="container mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <ShieldCheck className="text-blue-600" />
                        Audit Logs
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Track system activities and user actions</p>
                </div>
                
                <div className="flex items-center gap-2 w-full md:w-auto">
                     <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                        <input 
                            type="text"
                            placeholder="Search logs..."
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium whitespace-nowrap"
                    >
                        <FileSpreadsheet size={16} />
                        Export
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Timestamp</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Entity</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Details</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                                        <div className="flex justify-center items-center gap-2">
                                            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                            Loading logs...
                                        </div>
                                    </td>
                                </tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-10 text-center text-gray-500">No audit logs found matching your criteria.</td>
                                </tr>
                            ) : (
                                logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className="text-gray-400" />
                                                {new Date(log.timestamp).toLocaleString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 mr-3">
                                                    <User size={14} />
                                                </div>
                                                <div>
                                                    <div className="text-sm font-medium text-gray-900">{log.user?.name || 'System'}</div>
                                                    <div className="text-xs text-gray-500">{log.user?.email || '-'}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                                                ${log.action === 'LOGIN' ? 'bg-green-100 text-green-800' : 
                                                  log.action === 'DELETE' ? 'bg-red-100 text-red-800' : 
                                                  log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' : 
                                                  'bg-gray-100 text-gray-800'}`}>
                                                {log.action}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            {log.entity}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate" title={log.details || ''}>
                                            {log.details || '-'}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination */}
                <div className="px-6 py-4 border-t flex items-center justify-between bg-gray-50">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Previous
                    </button>
                    <span className="text-sm text-gray-700">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-4 py-2 border rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AuditLogPage;
