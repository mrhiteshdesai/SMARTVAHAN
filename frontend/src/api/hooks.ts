import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./client";

// --- STATES ---
export type State = {
  code: string;
  name: string;
  showOnHomepage?: boolean;
};

export function useStates() {
  return useQuery({
    queryKey: ["states"],
    queryFn: async () => {
      const res = await api.get<State[]>("/states");
      return res.data;
    },
  });
}

export function useCreateState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: State) => {
      const res = await api.post("/states", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["states"] });
    },
  });
}

export function useUpdateState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, data }: { code: string; data: Partial<State> }) => {
      const res = await api.patch(`/states/${code}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["states"] });
    },
  });
}

export function useDeleteState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await api.delete(`/states/${code}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["states"] });
    },
  });
}

// --- RTOs ---
export type RTO = {
  code: string;
  name: string;
  stateCode: string;
  isPassingEnabled?: boolean;
};

export function useRTOs(stateCode?: string, options?: { passingOnly?: boolean }) {
  return useQuery({
    queryKey: ["rtos", stateCode, options?.passingOnly === true],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (stateCode) params.stateCode = stateCode;
      if (options?.passingOnly) params.passingOnly = "true";
      const res = await api.get<RTO[]>("/rtos", { params });
      return res.data;
    },
    enabled: true, 
  });
}

export function usePassingRTOs(stateCode?: string) {
  return useRTOs(stateCode, { passingOnly: true });
}

export function useAuthorizedPassingRTOs(stateCode?: string) {
  return useQuery({
    queryKey: ["rtos-authorized", stateCode],
    queryFn: async () => {
      const params = stateCode ? { stateCode } : {};
      const res = await api.get<RTO[]>("/rtos/authorized", { params });
      return res.data;
    },
    enabled: true,
  });
}

export function useCreateRTO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: RTO) => {
      const res = await api.post("/rtos", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtos"] });
      queryClient.invalidateQueries({ queryKey: ["rtos-authorized"] });
    },
  });
}

export function useUpdateRTO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, data }: { code: string; data: Partial<RTO> }) => {
      const res = await api.patch(`/rtos/${code}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtos"] });
      queryClient.invalidateQueries({ queryKey: ["rtos-authorized"] });
    },
  });
}

export function useDeleteRTO() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await api.delete(`/rtos/${code}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rtos"] });
      queryClient.invalidateQueries({ queryKey: ["rtos-authorized"] });
    },
  });
}

// --- OEMs ---
export type OEM = {
  id: string;
  name: string;
  code: string;
  logo?: string;
  copDocument?: string;
  copValidity?: string;
  authorizedStates?: string[];
  showOnHomepage?: boolean;
};

export function useOEMs() {
  return useQuery({
    queryKey: ["oems"],
    queryFn: async () => {
      const res = await api.get<OEM[]>("/oems");
      return res.data;
    },
  });
}

export function useCreateOEM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: FormData) => {
      const res = await api.post("/oems", data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems"] });
    },
  });
}

export function useUpdateOEM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FormData }) => {
      const res = await api.patch(`/oems/${id}`, data, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems"] });
    },
  });
}

export function useDeleteOEM() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/oems/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["oems"] });
    },
  });
}

// --- SLD types (shared with dealers) ---
export type SldApprovedVehicleModel = {
  id: string;
  sldDeviceModelId: string;
  make?: string | null;
  modelName: string;
  setSpeedKmph: number;
  testReportNo?: string;
};

export type SldDeviceModel = {
  id: string;
  sldOemId: string;
  name: string;
  code: string;
  sldType?: string | null;
  tacNumber?: string | null;
  copNumber?: string | null;
  copDocument?: string | null;
  copValidity?: string | null;
  testingAgency?: string | null;
  speedLimit?: string | null;
  sldOem?: SldOem;
  vehicleModels?: SldApprovedVehicleModel[];
  _count?: { vehicleModels?: number };
};

export type SldOem = {
  id: string;
  name: string;
  code: string;
  authorizedStates?: string[];
  logo?: string | null;
  models?: SldDeviceModel[];
};

export type SldDeviceSerial = {
  id: string;
  serialNumber: string;
  status: "AVAILABLE" | "ASSIGNED" | "USED";
  createdAt: string;
  assignedAt?: string | null;
  usedAt?: string | null;
  sldOem?: { id: string; code: string; name: string };
  model?: { id: string; code: string; name: string };
  dealer?: { id: string; name: string; phone: string } | null;
  certificate?: { id: string; certificateNumber: string; generatedAt: string; status: string } | null;
};

// --- Dealers ---
export type Dealer = {
  id: string;
  name: string;
  contactPersonName?: string;
  email?: string;
  phone: string;
  stateCode: string;
  rtoCode?: string;
  allRTOs?: boolean;
  passingRtosAll?: boolean;
  passingRtoCodes?: string[];
  status: "ACTIVE" | "INACTIVE";
  oems: OEM[];
  sldOems?: SldOem[];
  locationAddress?: string;
  city?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  radius?: number;
  tradeCertificateNo?: string;
  tradeValidity?: string; // ISO Date string
  gstNo?: string;
};

export type DealerRegistrationRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  dealerName?: string | null;
  phone: string;
  stateCode?: string | null;
  locationAddress?: string | null;
  city?: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius?: number | null;
  wantsReflective?: boolean;
  wantsSld?: boolean;
  oemCodes?: string[];
  sldOemCodes?: string[];
  passingRtoCodes?: string[];
  gstNo?: string | null;
  tradeCertificateNo?: string | null;
  tradeValidity?: string | null;
  aadharNumber?: string | null;
  tradeCertificateUrl?: string | null;
  gstCertificateUrl?: string | null;
  aadharCardUrl?: string | null;
  note?: string | null;
  createdAt?: string;
};

export function useDealers() {
  return useQuery({
    queryKey: ["dealers"],
    queryFn: async () => {
      const res = await api.get<Dealer[]>("/dealers");
      return res.data;
    },
  });
}

export function useCreateDealer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/dealers", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealers"] });
    },
  });
}

export function useUpdateDealer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/dealers/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealers"] });
    },
  });
}

export function useDealerRegistrationRequests(status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  return useQuery({
    queryKey: ["dealer-registration-requests", status],
    queryFn: async () => {
      const res = await api.get<DealerRegistrationRequest[]>("/dealers/registration-requests", {
        params: { status }
      });
      return res.data;
    }
  });
}

export function useApproveDealerRegistrationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.post(`/dealers/registration-requests/${id}/approve`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealer-registration-requests"] });
      queryClient.invalidateQueries({ queryKey: ["dealers"] });
    }
  });
}

export function useRejectDealerRegistrationRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: string; note?: string }) => {
      const res = await api.post(`/dealers/registration-requests/${id}/reject`, { note });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealer-registration-requests"] });
    }
  });
}

export function useDeleteDealer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/dealers/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dealers"] });
    },
  });
}

// --- System Users ---
export type SystemUser = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
};

export function useSystemUsers() {
  return useQuery({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await api.get<SystemUser[]>("/users");
      return res.data;
    },
  });
}

export function useCreateSystemUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/users", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useUpdateSystemUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/users/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteSystemUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/users/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

// --- Products ---
export type Product = {
  code: string;
  name: string;
};

export function useProducts() {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const res = await api.get<Product[]>("/products");
      return res.data;
    },
  });
}

export function useCreateProduct() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: Product) => {
            const res = await api.post("/products", data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["products"] });
        }
    });
}

// --- QR Batches ---
export type Batch = {
    id: string;
    batchId: string;
    stateCode: string;
    oemCode: string;
    productCode: string;
    quantity: number;
    filePath: string;
    createdAt: string;
    state?: State;
    oem?: OEM;
    product?: Product;
};

export function useBatches() {
    return useQuery({
        queryKey: ["batches"],
        queryFn: async () => {
            const res = await api.get<Batch[]>("/qr/batches");
            return res.data;
        }
    });
}

export function useGenerateBatch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => {
            const res = await api.post("/qr/generate", data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["batches"] });
        }
    });
}

export function useRegenerateBatch() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: any) => {
            const res = await api.post("/qr/regenerate-v2", data);
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["batches"] });
        }
    });
}

export function useBulkReplacement() {
    return useMutation({
        mutationFn: async (data: { serials: number[], stateCode: string, oemCode: string }) => {
            const res = await api.post("/qr/bulk-replacement", data, {
                responseType: 'blob'
            });
            // Return blob and custom headers
            return {
                data: res.data,
                count: res.headers['x-processed-count'],
                skipped: res.headers['x-skipped-count']
            };
        }
    });
}

// --- Vehicle Categories ---
export type VehicleCategory = {
  id: string;
  name: string;
};

export function useVehicleCategories() {
  return useQuery({
    queryKey: ["vehicleCategories"],
    queryFn: async () => {
      const res = await api.get<VehicleCategory[]>("/vehicle-categories");
      return res.data;
    },
  });
}

// --- Dashboard Stats ---
export type DashboardStats = {
    row1: Record<string, number>;
    row2: {
        today: number;
        yesterday: number;
        thisWeek: number;
    };
    row3: {
        totalQrIssued: number;
        totalQrUsed: number;
        totalCerts: number;
        totalActiveDealers: number;
    };
    row4: Record<string, { issued: number; used: number }>;
    barData: Array<{ date: string; [key: string]: any }>;
    oemBarData: Array<{ date: string; [key: string]: any }>;
    oemPerformance: Array<{ oem: string; count: number }>;
    rtoDensity: Array<{ rto: string; count: number }>;
    heatmapData: Array<{ lat: number; lng: number; weight: number }>;
};

export function useDashboardStats(filters: { stateCode?: string; oemCode?: string; startDate?: string; endDate?: string }) {
    return useQuery({
        queryKey: ["dashboardStats", filters],
        queryFn: async () => {
            const res = await api.get<DashboardStats>("/stats/dashboard", { params: filters });
            return res.data;
        }
    });
}

export type SldDashboardStats = {
    row1: Record<string, number>;
    row2: {
        today: number;
        yesterday: number;
        pending: number;
        completedToday: number;
    };
    row3: {
        totalCerts: number;
        inventoryAvailable: number;
        inventoryAssigned: number;
        inventoryUsed: number;
        activeSldDealers: number;
        sldOemCount: number;
    };
    row4: Record<string, { certs: number; pending: number; completed: number }>;
    barData: Array<{ date: string; PENDING: number; COMPLETED: number; total: number }>;
    oemBarData: Array<{ date: string; [key: string]: number | string }>;
    oemPerformance: Array<{ code: string; name: string; count: number }>;
    dealerPerformance: Array<{ dealerId: string; name: string; count: number }>;
    pendingAging: { days0to3: number; days4to7: number; days7plus: number };
    pendingQueue: Array<{
        id: string;
        certificateNumber: string;
        vehicleNumber: string | null;
        generatedAt: string;
        dealer: { name: string };
        sldOem: { name: string; code: string };
    }>;
    heatmapData: Array<{ lat: number; lng: number; weight: number }>;
    oemLabels: Record<string, string>;
};

export function useSldDashboardStats(
    filters: { stateCode?: string; sldOemCode?: string; startDate?: string; endDate?: string },
    enabled = true,
) {
    return useQuery({
        queryKey: ["sldDashboardStats", filters],
        queryFn: async () => {
            const res = await api.get<SldDashboardStats>("/stats/dashboard/sld", { params: filters });
            return res.data;
        },
        enabled,
    });
}

export function useSystemSettings() {
    return useQuery({
        queryKey: ["systemSettings"],
        queryFn: async () => {
            const res = await api.get("/settings");
            return res.data;
        }
    });
}

// --- SLD hooks ---
export function useSldOems() {
  return useQuery({
    queryKey: ["sld-oems"],
    queryFn: async () => {
      const res = await api.get<SldOem[]>("/sld/oems");
      return res.data;
    },
  });
}

export function useCreateSldOem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/sld/oems", data);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sld-oems"] }),
  });
}

export function useUpdateSldOem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/sld/oems/${id}`, data);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sld-oems"] }),
  });
}

export function useDeleteSldOem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/sld/oems/${id}`);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sld-oems"] }),
  });
}

export function useCreateSldModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/sld/models", data);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sld-oems"] }),
  });
}

export function useUpdateSldModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/sld/models/${id}`, data);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sld-oems"] }),
  });
}

export function useDeleteSldModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/sld/models/${id}`);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sld-oems"] }),
  });
}

export function useSldVehicleModels(modelId: string) {
  return useQuery({
    queryKey: ["sld-vehicle-models", modelId],
    enabled: Boolean(modelId),
    queryFn: async () => {
      const res = await api.get<SldApprovedVehicleModel[]>(`/sld/models/${modelId}/vehicle-models`);
      return res.data;
    },
  });
}

export function useUploadSldVehicleModels() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ modelId, csvText }: { modelId: string; csvText: string }) => {
      const res = await api.post(`/sld/models/${modelId}/vehicle-models/upload`, { csvText });
      return res.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["sld-oems"] });
      queryClient.invalidateQueries({ queryKey: ["sld-vehicle-models", vars.modelId] });
    },
  });
}

export function useImportSldVariantList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ oemId, rows }: { oemId: string; rows: any[] }) => {
      const res = await api.post(`/sld/oems/${oemId}/import-variant-list`, { rows });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sld-oems"] });
      queryClient.invalidateQueries({ queryKey: ["sld-vehicle-models"] });
    },
  });
}

export function useCreateSldVehicleModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      modelId,
      data,
    }: {
      modelId: string;
      data: { make?: string; modelName: string; setSpeedKmph: number; testReportNo?: string };
    }) => {
      const res = await api.post(`/sld/models/${modelId}/vehicle-models`, data);
      return res.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["sld-oems"] });
      queryClient.invalidateQueries({ queryKey: ["sld-vehicle-models", vars.modelId] });
    },
  });
}

export function useDeleteSldVehicleModel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/sld/vehicle-models/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sld-oems"] });
      queryClient.invalidateQueries({ queryKey: ["sld-vehicle-models"] });
    },
  });
}

export function useSldInventory(params: Record<string, any>) {
  return useQuery({
    queryKey: ["sld-inventory", params],
    queryFn: async () => {
      const res = await api.get<{
        total: number;
        page: number;
        limit: number;
        items: SldDeviceSerial[];
        counts?: { AVAILABLE: number; ASSIGNED: number; USED: number };
      }>("/sld/inventory", { params });
      return res.data;
    },
  });
}

export function useSldAvailableSerials(sldOemId: string, modelId: string) {
  return useQuery({
    queryKey: ["sld-available", sldOemId, modelId],
    enabled: Boolean(sldOemId && modelId),
    queryFn: async () => {
      const res = await api.get<SldDeviceSerial[]>("/sld/inventory/available", {
        params: { sldOemId, modelId },
      });
      return res.data;
    },
  });
}

export function useUploadSldInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { sldOemId: string; modelId: string; csvText: string }) => {
      const res = await api.post("/sld/inventory/upload", data);
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sld-inventory"] }),
  });
}

export function useAssignSldInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/sld/inventory/assign", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sld-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["sld-available"] });
    },
  });
}

export function useAssignSldInventoryCsv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post("/sld/inventory/assign-csv", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sld-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["sld-available"] });
    },
  });
}

export type SldCertificateRow = {
  id: string;
  certificateNumber: string;
  vehicleNumber: string;
  status: "PENDING" | "COMPLETED";
  generatedAt: string;
  sealNumber?: string;
  ownerName?: string;
  oem?: { id?: string; code: string; name: string };
  model?: { code: string; name: string };
  dealer?: { id: string; name: string; phone?: string; stateCode?: string };
  serialNumber?: string;
  pdfUrl?: string | null;
  smartvahanPdfPath?: string | null;
  vahanPdfPath?: string | null;
  vahanUploadedAt?: string | null;
};

export function useSldCertificates(params: Record<string, any>, enabled: boolean = true) {
  return useQuery({
    queryKey: ["sld-certificates", params],
    enabled,
    queryFn: async () => {
      const res = await api.get<{
        total: number;
        page: number;
        limit: number;
        items: SldCertificateRow[];
      }>("/sld/certificates", { params });
      return res.data;
    },
  });
}

export function useUploadSldVahan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pdfBase64 }: { id: string; pdfBase64: string }) => {
      const res = await api.post(`/sld/certificates/${id}/vahan`, { pdfBase64 });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sld-certificates"] });
    },
  });
}

export function useReinstateSldCert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/sld/certificates/${id}/reinstate`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sld-certificates"] });
      queryClient.invalidateQueries({ queryKey: ["sld-inventory"] });
    },
  });
}

export function useReinstateSldCertBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (csvText: string) => {
      const res = await api.post("/sld/certificates/reinstate-bulk", { csvText });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sld-certificates"] });
      queryClient.invalidateQueries({ queryKey: ["sld-inventory"] });
    },
  });
}
