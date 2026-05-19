import { useState, useMemo, useEffect } from "react";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { GoogleMap, useLoadScript, MarkerF, CircleF, Autocomplete } from "@react-google-maps/api";
import Modal from "../../ui/Modal";
import { 
  useDealers, useCreateDealer, useUpdateDealer, useDeleteDealer,
  useDealerRegistrationRequests, useApproveDealerRegistrationRequest, useRejectDealerRegistrationRequest,
  useStates, useRTOs, useOEMs,
  Dealer, DealerRegistrationRequest
} from "../../api/hooks";

const libraries: ("places")[] = ["places"];

export default function DealersPage() {
  const [query, setQuery] = useState("");
  
  // Filters
  const [filterState, setFilterState] = useState("");
  const [filterOEM, setFilterOEM] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | "ACTIVE" | "INACTIVE">("");

  // Modal State
  const [openAdd, setOpenAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [approvalRequestId, setApprovalRequestId] = useState<string | null>(null);

  // Form State
  const [form, setForm] = useState({
    name: "",
    contactPersonName: "",
    email: "",
    phone: "",
    stateCode: "",
    passingRtosAll: true,
    passingRtoCodes: [] as string[],
    oemCodes: [] as string[], 
    password: "",
    status: "ACTIVE" as "ACTIVE" | "INACTIVE",
    locationAddress: "",
    city: "",
    state: "",
    zip: "",
    latitude: 20.5937,
    longitude: 78.9629,
    radius: 15,
    tradeCertificateNo: "",
    tradeValidity: "",
    gstNo: "",
    tradeCertificateUrl: "",
    gstCertificateUrl: "",
    aadharNumber: "",
    aadharCardUrl: ""
  });

  const [searchAddress, setSearchAddress] = useState("");

  // Data Hooks
  const { data: dealers = [], isLoading, error } = useDealers();
  const { data: states = [] } = useStates();
  const { data: allOEMs = [] } = useOEMs();
  const {
    data: registrationRequests = [],
    isLoading: isRequestsLoading,
    isError: isRequestsError,
    error: requestsError,
    refetch: refetchRegistrationRequests
  } = useDealerRegistrationRequests("PENDING");
  
  // RTOs depend on selected state in form
  const { data: formRTOs = [] } = useRTOs(form.stateCode);
  const sortedFormRTOs = useMemo(() => {
    return [...formRTOs].sort((a, b) => a.code.localeCompare(b.code));
  }, [formRTOs]);

  // Mutations
  const createDealer = useCreateDealer();
  const updateDealer = useUpdateDealer();
  const deleteDealer = useDeleteDealer();
  const approveRegistrationRequest = useApproveDealerRegistrationRequest();
  const rejectRegistrationRequest = useRejectDealerRegistrationRequest();

  // Derived Data
  const formOEMs = useMemo(() => {
    if (!form.stateCode) return [];
    return allOEMs.filter(o => o.authorizedStates?.includes(form.stateCode));
  }, [allOEMs, form.stateCode]);

  // Google Maps
  const [googleMapsApiKey] = useState(() => {
    // Try env var first
    if (import.meta.env.VITE_GOOGLE_MAPS_KEY) return import.meta.env.VITE_GOOGLE_MAPS_KEY;
    
    // Fallback to local storage settings
    try {
        const settings = localStorage.getItem("sv_settings");
        if (settings) {
            const parsed = JSON.parse(settings);
            return parsed.googlePlacesKey || "";
        }
    } catch (e) {
        console.error("Failed to read settings", e);
    }
    return "";
  });

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey, // Ensure this env var is set
    libraries,
  });

  const [mapRef, setMapRef] = useState<google.maps.Map | null>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const onMapLoad = (map: google.maps.Map) => {
    setMapRef(map);
    setTimeout(() => {
        google.maps.event.trigger(map, "resize");
        const lat = Number(form.latitude);
        const lng = Number(form.longitude);
        if (!isNaN(lat) && !isNaN(lng)) {
            map.setCenter({ lat, lng });
            map.panTo({ lat, lng });
        }
    }, 200);
  };

  // Update Map Center when Lat/Lng changes manually
  useEffect(() => {
    if (mapRef && typeof form.latitude === 'number' && typeof form.longitude === 'number' && !isNaN(form.latitude) && !isNaN(form.longitude)) {
       mapRef.panTo({ lat: form.latitude, lng: form.longitude });
    }
  }, [form.latitude, form.longitude, mapRef]);

  // --- Handlers ---
  const handleFileChange = (field: 'tradeCertificateUrl' | 'gstCertificateUrl' | 'aadharCardUrl', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setForm((prev) => ({ ...prev, [field]: "" }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({ ...prev, [field]: String(reader.result || "") }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Remove 'state' string field as it conflicts with Prisma relation field
      const { state, ...payload } = form; 
      
      // If editing and password is empty, remove it to avoid overwriting with empty string
      if (editId && !(payload as any).password) {
        delete (payload as any).password;
      }
      
      // Handle Date field
      const finalPayload = {
        ...payload,
        tradeValidity: payload.tradeValidity ? new Date(payload.tradeValidity).toISOString() : null
      };

      if (editId) {
        await updateDealer.mutateAsync({ id: editId, data: finalPayload });
      } else if (approvalRequestId) {
        await approveRegistrationRequest.mutateAsync({ id: approvalRequestId, data: finalPayload });
      } else {
        await createDealer.mutateAsync(finalPayload);
      }
      setOpenAdd(false);
      setApprovalRequestId(null);
      resetForm();
    } catch (err) {
      console.error("Failed to save dealer:", err);
      alert("Failed to save dealer.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Are you sure you want to delete this dealer?")) {
      try {
        await deleteDealer.mutateAsync(id);
      } catch (err) {
        console.error("Failed to delete dealer:", err);
        alert("Failed to delete dealer.");
      }
    }
  };

  const openNew = () => {
    setEditId(null);
    setApprovalRequestId(null);
    resetForm();
    setOpenAdd(true);
  };

  const openEdit = (dealer: Dealer) => {
    setEditId(dealer.id);
    setApprovalRequestId(null);
    const dealerAny: any = dealer as any;
    const dealerPassingRtoCodes: string[] = Array.isArray(dealerAny.passingRtoCodes) ? dealerAny.passingRtoCodes : [];
    const hasPassingConfig = dealerAny.passingRtosAll === true || dealerAny.passingRtosAll === false || dealerPassingRtoCodes.length > 0;
    const mappedPassingRtosAll = hasPassingConfig
      ? (dealerAny.passingRtosAll ?? true)
      : (dealerAny.allRTOs ? true : false);
    const mappedPassingRtoCodes = hasPassingConfig
      ? dealerPassingRtoCodes
      : (dealerAny.allRTOs ? [] : (dealerAny.rtoCode ? [String(dealerAny.rtoCode)] : []));

    setForm({
        name: dealer.name,
        contactPersonName: dealerAny.contactPersonName || "",
        email: dealerAny.email || "",
        phone: dealer.phone,
        stateCode: dealer.stateCode,
        passingRtosAll: mappedPassingRtosAll,
        passingRtoCodes: mappedPassingRtoCodes,
        oemCodes: dealer.oems?.map(o => o.code) || [], 
        password: "", // Don't fill password
        status: dealer.status,
        locationAddress: dealer.locationAddress || "",
        city: dealer.city || "",
        zip: dealer.zip || "",
        state: states.find(s => s.code === dealer.stateCode)?.name || "", // Derive state name
        latitude: dealer.latitude || 20.5937,
        longitude: dealer.longitude || 78.9629,
        radius: dealer.radius || 15,
        tradeCertificateNo: dealer.tradeCertificateNo || "",
        tradeValidity: dealer.tradeValidity ? new Date(dealer.tradeValidity).toISOString().split('T')[0] : "",
        gstNo: dealer.gstNo || "",
        tradeCertificateUrl: (dealer as any).tradeCertificateUrl || "",
        gstCertificateUrl: (dealer as any).gstCertificateUrl || "",
        aadharNumber: (dealer as any).aadharNumber || "",
        aadharCardUrl: (dealer as any).aadharCardUrl || ""
    });
    setSearchAddress(dealer.locationAddress || "");
    setOpenAdd(true);
  };

  const openApprove = (req: DealerRegistrationRequest) => {
    setEditId(null);
    setApprovalRequestId(req.id);
    resetForm();
    setForm((prev) => ({
      ...prev,
      name: (req as any).dealerName || req.name || "",
      contactPersonName: [req.firstName, req.lastName].filter(Boolean).join(" ").trim() || req.name || "",
      email: (req as any).email || "",
      phone: req.phone || "",
      stateCode: (req.stateCode as any) || "",
      locationAddress: (req.locationAddress as any) || "",
      city: (req.city as any) || "",
      zip: (req.zip as any) || "",
      latitude: (req.latitude as any) ?? prev.latitude,
      longitude: (req.longitude as any) ?? prev.longitude,
      radius: (req.radius as any) ?? prev.radius,
      passingRtosAll: Array.isArray((req as any).passingRtoCodes) ? ((req as any).passingRtoCodes.length === 0) : true,
      passingRtoCodes: Array.isArray((req as any).passingRtoCodes) ? ((req as any).passingRtoCodes as any) : [],
      oemCodes: Array.isArray((req as any).oemCodes) ? ((req as any).oemCodes as any) : [],
      gstNo: (req.gstNo as any) || "",
      tradeCertificateNo: (req.tradeCertificateNo as any) || "",
      tradeValidity: req.tradeValidity ? String(req.tradeValidity).split("T")[0] : "",
      aadharNumber: (req.aadharNumber as any) || "",
      tradeCertificateUrl: (req.tradeCertificateUrl as any) || "",
      gstCertificateUrl: (req.gstCertificateUrl as any) || "",
      aadharCardUrl: (req.aadharCardUrl as any) || "",
      status: "ACTIVE",
      password: ""
    }));
    setSearchAddress((req.locationAddress as any) || "");
    setOpenAdd(true);
  };

  const resetForm = () => {
    setForm({
      name: "",
      contactPersonName: "",
      email: "",
      phone: "",
      stateCode: "",
      oemCodes: [],
      password: "",
      passingRtosAll: true,
      passingRtoCodes: [],
      status: "ACTIVE",
      latitude: 20.5937, longitude: 78.9629,
      radius: 15,
      tradeCertificateNo: "",
      tradeValidity: "",
      gstNo: "",
      tradeCertificateUrl: "",
      gstCertificateUrl: "",
      aadharNumber: "",
      aadharCardUrl: ""
    });
    setSearchAddress("");
  };

  const toggleStatus = async (dealer: Dealer) => {
      try {
        const newStatus = dealer.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
        await updateDealer.mutateAsync({ id: dealer.id, data: { status: newStatus } });
      } catch (err) {
        console.error("Failed to toggle status:", err);
      }
  };

  // --- Google Maps Handlers ---

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();
      if (place.geometry && place.geometry.location) {
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        
        let city = "";
        let state = "";
        let zip = "";
        
        // Extract address components
        place.address_components?.forEach(comp => {
          if (comp.types.includes("locality")) city = comp.long_name;
          if (comp.types.includes("administrative_area_level_1")) state = comp.long_name;
          if (comp.types.includes("postal_code")) zip = comp.long_name;
        });

        setForm(prev => ({
          ...prev,
          locationAddress: place.formatted_address || "",
          latitude: lat,
          longitude: lng,
          city,
          state,
          zip
        }));
        setSearchAddress(place.formatted_address || "");

        if (mapRef) {
          mapRef.panTo({ lat, lng });
          mapRef.setZoom(12);
        }
      }
    }
  };

  const filteredDealers = useMemo(() => {
    return dealers.filter(d => {
        const dName = d.name?.toLowerCase() || "";
        const dCity = d.city?.toLowerCase() || "";
        const dPhone = d.phone || "";
        const q = query.toLowerCase();

        const matchesQuery = !query || 
            dName.includes(q) || 
            dPhone.includes(query) || 
            dCity.includes(q);
        
        const matchesState = !filterState || d.stateCode === filterState;
        // Check if ANY of the dealer's OEMs match the filter
        const matchesOEM = !filterOEM || (d.oems && d.oems.some(o => o.code === filterOEM));
        const matchesStatus = !filterStatus || d.status === filterStatus;

        return matchesQuery && matchesState && matchesOEM && matchesStatus;
    });
  }, [dealers, query, filterState, filterOEM, filterStatus]);

  if (loadError) return <div>Error loading maps. Please check API Key.</div>;
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error loading dealers</div>;

  return (
    <div className="space-y-4 h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
            <div>
            <h1 className="text-xl font-semibold">Dealers</h1>
            <p className="text-sm text-gray-500">Manage dealers and geofencing</p>
            </div>
            <div className="flex items-center gap-2">
            <button
                onClick={openNew}
                className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-md hover:bg-primary/90 text-sm"
            >
                <Plus className="w-4 h-4" />
                Add Dealer
            </button>
            </div>
        </div>

        <div className="border rounded-lg bg-amber-50/40 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-800">Pending Dealer Registration Requests</div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-amber-700 bg-amber-100 border border-amber-200 px-2 py-1 rounded">
                {registrationRequests.length} pending
              </div>
              <button
                type="button"
                onClick={() => refetchRegistrationRequests()}
                className="text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50"
                disabled={isRequestsLoading}
              >
                Refresh
              </button>
            </div>
          </div>

          {isRequestsLoading ? (
            <div className="text-sm text-gray-500 mt-3">Loading dealer registration requests...</div>
          ) : isRequestsError ? (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3 mt-3">
              Failed to load pending requests. Login as SUPER_ADMIN or ADMIN and try again.
              <div className="text-xs text-red-600 mt-1">
                {String((requestsError as any)?.message || "Request failed")}
              </div>
            </div>
          ) : registrationRequests.length === 0 ? (
            <div className="text-sm text-gray-600 mt-3">
              No pending dealer registration requests yet.
            </div>
          ) : (
            <div className="overflow-x-auto mt-3 bg-white rounded border">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 font-medium border-b">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">State</th>
                    <th className="px-4 py-3">City</th>
                    <th className="px-4 py-3">Requested Brand</th>
                    <th className="px-4 py-3">Passing RTO Request</th>
                    <th className="px-4 py-3">Location</th>
                    <th className="px-4 py-3">Submitted</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {registrationRequests.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3">{r.phone}</td>
                      <td className="px-4 py-3">{r.stateCode || "-"}</td>
                      <td className="px-4 py-3">{r.city || "-"}</td>
                      <td className="px-4 py-3">
                        {(r.oemCodes || []).length
                          ? (r.oemCodes || [])
                              .map((c) => {
                                const o = allOEMs.find((x) => x.code === c);
                                return o ? o.name : c;
                              })
                              .join(", ")
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {Array.isArray((r as any).passingRtoCodes) && (r as any).passingRtoCodes.length
                          ? (r as any).passingRtoCodes.join(", ")
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        {r.locationAddress || "-"}
                      </td>
                      <td className="px-4 py-3">
                        {r.createdAt ? new Date(r.createdAt).toLocaleString() : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openApprove(r)}
                            className="px-3 py-1.5 rounded border bg-white hover:bg-gray-50 text-sm"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm("Reject this dealer registration request?")) return;
                              const note = prompt("Rejection note (optional):") || undefined;
                              try {
                                await rejectRegistrationRequest.mutateAsync({ id: r.id, note });
                              } catch (e) {
                                console.error(e);
                                alert("Failed to reject request.");
                              }
                            }}
                            className="px-3 py-1.5 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-sm"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {/* Filters & Search Row */}
        <div className="flex items-center gap-3 bg-gray-50 p-3 rounded-lg border">
            <div className="relative">
                <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search dealers..."
                    className="rounded-md border pl-7 pr-3 py-2 text-sm w-64 bg-white"
                />
            </div>
            <div className="h-6 w-px bg-gray-300 mx-1"></div>
            <select 
                value={filterState} 
                onChange={(e) => setFilterState(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm bg-white min-w-[150px]"
            >
                <option value="">All States</option>
                {states.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
            </select>
            <select 
                value={filterOEM} 
                onChange={(e) => setFilterOEM(e.target.value)}
                className="rounded-md border px-3 py-2 text-sm bg-white min-w-[150px]"
            >
                <option value="">All OEMs</option>
                {allOEMs.map(o => <option key={o.code} value={o.code}>{o.name}</option>)}
            </select>
            <select 
                value={filterStatus} 
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="rounded-md border px-3 py-2 text-sm bg-white min-w-[150px]"
            >
                <option value="">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
            </select>
            
            {/* Clear Filters Button */}
            {(filterState || filterOEM || filterStatus || query) && (
                <button 
                    onClick={() => {
                        setQuery("");
                        setFilterState("");
                        setFilterOEM("");
                        setFilterStatus("");
                    }}
                    className="text-sm text-red-600 hover:text-red-700 ml-auto"
                >
                    Clear Filters
                </button>
            )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 border rounded-lg bg-white overflow-hidden shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 text-gray-700 font-medium border-b">
            <tr>
              <th className="px-4 py-3">Dealer Name</th>
              <th className="px-4 py-3">Phone (User ID)</th>
              <th className="px-4 py-3">State</th>
              <th className="px-4 py-3">City</th>
              <th className="px-4 py-3">Passing RTO</th>
              <th className="px-4 py-3">OEMs</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredDealers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                  No dealers found matching your criteria.
                </td>
              </tr>
            ) : (
              filteredDealers.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3">{d.phone}</td>
                  <td className="px-4 py-3">{d.stateCode}</td>
                  <td className="px-4 py-3">{d.city}</td>
                  <td className="px-4 py-3">
                    {(d as any).passingRtosAll
                      ? "All RTOs"
                      : Array.isArray((d as any).passingRtoCodes) && (d as any).passingRtoCodes.length
                        ? (d as any).passingRtoCodes.join(", ")
                        : d.allRTOs
                          ? "All RTOs"
                          : d.rtoCode || "-"}
                  </td>
                  <td className="px-4 py-3 max-w-[200px] truncate" title={d.oems?.map(o => o.name).join(", ")}>
                    {d.oems?.map(o => o.code).join(", ") || "-"}
                  </td>
                  <td className="px-4 py-3">
                      <button 
                        onClick={() => toggleStatus(d)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${d.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                          <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${d.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                      <span className="ml-2 text-xs text-gray-500">{d.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2">
                    <button onClick={() => openEdit(d)} className="p-2 hover:bg-gray-100 rounded text-blue-600 transition-colors">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(d.id)} className="p-2 hover:bg-gray-100 rounded text-red-600 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal
        open={openAdd}
        onClose={() => {
          setOpenAdd(false);
          setApprovalRequestId(null);
        }}
        title={editId ? "Edit Dealer" : approvalRequestId ? "Approve Dealer Registration" : "Add New Dealer"}
        maxWidth="max-w-6xl"
      >
        <form onSubmit={handleSave} className="flex flex-col h-[80vh]">
          <div className="flex flex-col md:flex-row gap-6 flex-1 overflow-hidden">
          {/* Left: Dealer Details */}
          <div className="flex-1 space-y-4 overflow-y-auto pr-2">
            <div className="flex items-center justify-between border-b pb-2">
                <h3 className="font-semibold text-gray-700">Dealer Details</h3>
                
                {/* Status Toggle in Modal */}
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-700">Status:</span>
                    <button 
                        type="button"
                        onClick={() => setForm(f => ({ ...f, status: f.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }))}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${form.status === 'ACTIVE' ? 'bg-green-500' : 'bg-gray-300'}`}
                    >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${form.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-xs text-gray-500 w-12">{form.status}</span>
                </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">Dealer Name</label>
              <input
                required
                value={form.name}
                onChange={e => setForm({...form, name: e.target.value})}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter dealer name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Dealer Phone (User ID)</label>
              <input
                required
                value={form.phone}
                onChange={e => setForm({...form, phone: e.target.value})}
                className="w-full border rounded px-3 py-2"
                placeholder="Mobile number"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Contact Person Name</label>
                <input
                  value={(form as any).contactPersonName}
                  onChange={e => setForm({...form, contactPersonName: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  placeholder="First + Last name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Email ID</label>
                <input
                  type="email"
                  value={(form as any).email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  className="w-full border rounded px-3 py-2"
                  placeholder="name@email.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Authorised State</label>
              <select
                required
                value={form.stateCode}
                onChange={e => setForm({...form, stateCode: e.target.value, oemCodes: [], passingRtosAll: true, passingRtoCodes: []})}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select State</option>
                {states.map(s => (
                  <option key={s.code} value={s.code}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Passing RTO</label>
              <div className={`border rounded p-3 ${!form.stateCode ? "bg-gray-50" : "bg-white"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-gray-500">Select allowed Passing RTOs for this dealer.</div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.passingRtosAll}
                      onChange={(e) => {
                        const nextAll = e.target.checked;
                        setForm((prev) => ({
                          ...prev,
                          passingRtosAll: nextAll,
                          passingRtoCodes: nextAll ? [] : prev.passingRtoCodes
                        }));
                      }}
                      className="rounded border-gray-300"
                      disabled={!form.stateCode}
                    />
                    All Passing RTOs
                  </label>
                </div>

                {!form.stateCode ? (
                  <div className="text-sm text-gray-400 mt-2">Select a state to choose Passing RTOs.</div>
                ) : form.passingRtosAll ? (
                  <div className="text-sm text-gray-600 mt-2">All RTOs under this state are allowed.</div>
                ) : (
                  <div className="mt-3">
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-gray-500">{form.passingRtoCodes.length} selected</div>
                      <button
                        type="button"
                        className="text-xs text-blue-600 hover:text-blue-700"
                        onClick={() => {
                          const allCodes = sortedFormRTOs.map((r) => r.code);
                          setForm((prev) => ({ ...prev, passingRtoCodes: allCodes }));
                        }}
                        disabled={sortedFormRTOs.length === 0}
                      >
                        Select all
                      </button>
                    </div>
                    <div className="border rounded p-2 h-40 overflow-y-auto bg-white mt-2">
                      {sortedFormRTOs.length === 0 ? (
                        <div className="text-sm text-gray-400 p-1">No RTOs found for selected state.</div>
                      ) : (
                        sortedFormRTOs.map((r) => (
                          <label key={r.code} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.passingRtoCodes.includes(r.code)}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setForm((prev) => ({
                                  ...prev,
                                  passingRtoCodes: checked
                                    ? Array.from(new Set([...prev.passingRtoCodes, r.code]))
                                    : prev.passingRtoCodes.filter((c) => c !== r.code)
                                }));
                              }}
                              className="rounded border-gray-300"
                            />
                            <span className="text-sm">{r.code} - {r.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Authorised OEMs (Multi-select)</label>
              <div className="border rounded p-2 h-32 overflow-y-auto bg-white">
                {formOEMs.length === 0 ? (
                   <p className="text-sm text-gray-400 p-1">Select a state first</p>
                ) : (
                   formOEMs.map(o => (
                     <label key={o.code} className="flex items-center gap-2 p-1 hover:bg-gray-50 cursor-pointer">
                       <input
                         type="checkbox"
                         checked={form.oemCodes.includes(o.code)}
                         onChange={(e) => {
                           if (e.target.checked) {
                             setForm(f => ({ ...f, oemCodes: [...f.oemCodes, o.code] }));
                           } else {
                             setForm(f => ({ ...f, oemCodes: f.oemCodes.filter(c => c !== o.code) }));
                           }
                         }}
                         className="rounded border-gray-300"
                       />
                       <span className="text-sm">{o.name}</span>
                     </label>
                   ))
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {form.oemCodes.length} selected
              </p>
            </div>

            {/* Verifications Section */}
            <div className="border-t pt-4 mt-2">
                <h4 className="font-semibold text-gray-700 mb-3">Verifications</h4>
                
                {/* Trade Certificate */}
                <div className="bg-gray-50 p-3 rounded mb-3">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700">Trade Certificate</label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-2">
                        <input
                            value={form.tradeCertificateNo}
                            onChange={e => setForm({...form, tradeCertificateNo: e.target.value})}
                            className="w-full border rounded px-3 py-2 text-sm"
                            placeholder="Certificate Number"
                        />
                        <input
                            type="date"
                            value={form.tradeValidity}
                            onChange={e => setForm({...form, tradeValidity: e.target.value})}
                            className="w-full border rounded px-3 py-2 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Upload Certificate</label>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileChange('tradeCertificateUrl', e)}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {form.tradeCertificateUrl ? (
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-green-600 block">File Selected</span>
                            <a
                              href={form.tradeCertificateUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-700 underline"
                            >
                              View
                            </a>
                          </div>
                        ) : null}
                    </div>
                </div>

                {/* GST Certificate */}
                <div className="bg-gray-50 p-3 rounded mb-3">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700">GST Details</label>
                    </div>
                    <div className="mb-2">
                        <input
                            value={form.gstNo}
                            onChange={e => setForm({...form, gstNo: e.target.value})}
                            className="w-full border rounded px-3 py-2 text-sm"
                            placeholder="GST Number"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Upload GST Certificate</label>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileChange('gstCertificateUrl', e)}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {form.gstCertificateUrl ? (
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-green-600 block">File Selected</span>
                            <a
                              href={form.gstCertificateUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-700 underline"
                            >
                              View
                            </a>
                          </div>
                        ) : null}
                    </div>
                </div>

                {/* Aadhar Card */}
                <div className="bg-gray-50 p-3 rounded mb-3">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-sm font-medium text-gray-700">Aadhar Details</label>
                    </div>
                    <div className="mb-2">
                        <input
                            value={form.aadharNumber}
                            onChange={e => setForm({...form, aadharNumber: e.target.value})}
                            className="w-full border rounded px-3 py-2 text-sm"
                            placeholder="Aadhar Number"
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500 mb-1">Upload Aadhar Card</label>
                        <input
                            type="file"
                            accept="image/*,application/pdf"
                            onChange={(e) => handleFileChange('aadharCardUrl', e)}
                            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {form.aadharCardUrl ? (
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-green-600 block">File Selected</span>
                            <a
                              href={form.aadharCardUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-700 underline"
                            >
                              View
                            </a>
                          </div>
                        ) : null}
                    </div>
                </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Password {editId && "(Leave blank to keep current)"}</label>
              <input
                type="password"
                required={!editId}
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                className="w-full border rounded px-3 py-2"
                placeholder="Enter password"
              />
            </div>
            
            {/* Auto-filled Geolocation Data (Read Only) */}
            <div className="pt-4 border-t space-y-3 bg-gray-50 p-3 rounded">
                <div className="text-xs font-semibold text-gray-500 uppercase">Geolocation Data (Auto-filled)</div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-gray-500">City</label>
                        <input value={form.city} readOnly className="w-full border rounded px-2 py-1 bg-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500">State</label>
                        <input value={form.state} readOnly className="w-full border rounded px-2 py-1 bg-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500">Zip</label>
                        <input value={form.zip} readOnly className="w-full border rounded px-2 py-1 bg-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500">Radius (KM)</label>
                        <input 
                            type="number" 
                            value={form.radius} 
                            onChange={e => setForm({...form, radius: parseFloat(e.target.value) || 0})}
                            className="w-full border rounded px-2 py-1 bg-white text-sm" 
                        />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500">Latitude</label>
                        <input value={form.latitude} readOnly className="w-full border rounded px-2 py-1 bg-white text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs text-gray-500">Longitude</label>
                        <input value={form.longitude} readOnly className="w-full border rounded px-2 py-1 bg-white text-sm" />
                    </div>
                </div>
            </div>
          </div>

          {/* Right: Geofencing Map */}
          <div className="flex-1 flex flex-col gap-4 border-l pl-2">
            <h3 className="font-semibold text-gray-700 border-b pb-2">Geofencing</h3>
            
            {isLoaded ? (
                <>
                <div className="relative">
                    <Autocomplete onLoad={setAutocomplete} onPlaceChanged={onPlaceChanged}>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search location..."
                                className="w-full border rounded pl-9 pr-3 py-2 text-sm"
                                value={searchAddress}
                                onChange={(e) => setSearchAddress(e.target.value)}
                            />
                        </div>
                    </Autocomplete>
                </div>
                
                <div className="flex-1 rounded border overflow-hidden relative min-h-[400px]">
                    <GoogleMap
                        mapContainerStyle={{ width: "100%", height: "100%" }}
                        center={{ lat: form.latitude, lng: form.longitude }}
                        zoom={12}
                        onLoad={onMapLoad}
                        onClick={(e) => {
                            if (e.latLng) {
                                setForm({
                                    ...form,
                                    latitude: e.latLng.lat(),
                                    longitude: e.latLng.lng()
                                });
                            }
                        }}
                    >
                        <MarkerF position={{ lat: form.latitude, lng: form.longitude }} />
                        <CircleF
                            center={{ lat: form.latitude, lng: form.longitude }}
                            radius={form.radius * 1000} // km to meters
                            options={{
                                fillColor: "#2563EB",
                                fillOpacity: 0.1,
                                strokeColor: "#2563EB",
                                strokeOpacity: 0.8,
                                strokeWeight: 2,
                            }}
                        />
                    </GoogleMap>
                </div>
                </>
            ) : (
                <div className="flex-1 bg-gray-100 flex items-center justify-center text-gray-500">
                    Loading Maps...
                </div>
            )}
          </div>
          </div>
          
          <div className="flex justify-end gap-3 mt-4 pt-3 border-t bg-white">
            <button
              type="button"
              onClick={() => setOpenAdd(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-md border"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary hover:bg-primary/90 rounded-md"
            >
              {editId ? "Save Changes" : "Add Dealer"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
