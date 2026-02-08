import { useQuery } from "@tanstack/react-query";
import api from "./client";

export type ReportRow = {
  [key: string]: any; // Dynamic keys based on report type (e.g., "State Name", "C3", "Total")
};

export type ReportFilters = {
  stateCode?: string;
  oemCode?: string;
  startDate?: string;
  endDate?: string;
  isGhost?: boolean;
};

export function useStateReport(filters: ReportFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: ["report-state", filters],
    queryFn: async () => {
      const res = await api.get<ReportRow[]>("/reports/state", { params: filters });
      return res.data;
    },
    enabled,
  });
}

export function useRtoReport(filters: ReportFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: ["report-rto", filters],
    queryFn: async () => {
      const res = await api.get<ReportRow[]>("/reports/rto", { params: filters });
      return res.data;
    },
    enabled,
  });
}

export function useOemReport(filters: ReportFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: ["report-oem", filters],
    queryFn: async () => {
      const res = await api.get<ReportRow[]>("/reports/oem", { params: filters });
      return res.data;
    },
    enabled,
  });
}

export function useDealerReport(filters: ReportFilters, enabled: boolean = true) {
  return useQuery({
    queryKey: ["report-dealer", filters],
    queryFn: async () => {
      const res = await api.get<ReportRow[]>("/reports/dealer", { params: filters });
      return res.data;
    },
    enabled,
  });
}
