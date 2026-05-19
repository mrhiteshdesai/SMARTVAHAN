import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Autocomplete, useLoadScript } from "@react-google-maps/api";
import { useLocation, useNavigate } from "react-router-dom";
import client from "../api/client";

type HomePageContent = {
  heroTitle?: string;
  heroSubtitle?: string;
  heroPrimaryCtaText?: string;
  heroPrimaryCtaHref?: string;
  heroSecondaryCtaText?: string;
  heroSecondaryCtaHref?: string;
  aboutTitle?: string;
  aboutBody?: string;
  statesTitle?: string;
  oemsTitle?: string;
  statsTitle?: string;
  contactTitle?: string;
  contactSubtitle?: string;
  contactEmail?: string;
  contactPhone?: string;
  contactAddress?: string;
};

type HomeData = {
  success: boolean;
  data: {
    content: HomePageContent | null;
    states: Array<{ code: string; name: string }>;
    oems: Array<{ code: string; name: string; logo?: string | null }>;
    registrationOems?: Array<{ code: string; name: string; authorizedStates?: string[] }>;
    stats: {
      totalQrCodeIssued: number;
      totalCertificateGenerated: number;
      totalVehicleFitments: number;
      totalStatesServed: number;
      totalRtosServed: number;
    };
  };
};

type LandingPageProps = {
  mode?: "landing" | "dealer-registration";
};

const libraries: ("places")[] = ["places"];

const DEFAULT_CONTENT: Required<Pick<
  HomePageContent,
  | "heroTitle"
  | "heroSubtitle"
  | "heroPrimaryCtaText"
  | "heroPrimaryCtaHref"
  | "heroSecondaryCtaText"
  | "heroSecondaryCtaHref"
  | "aboutTitle"
  | "aboutBody"
  | "statesTitle"
  | "oemsTitle"
  | "statsTitle"
  | "contactTitle"
  | "contactSubtitle"
>> = {
  heroTitle: "SMARTVAHAN",
  heroSubtitle: "Centralized MIS for QR-based certification and inventory management.",
  heroPrimaryCtaText: "Open Dashboard",
  heroPrimaryCtaHref: "/control",
  heroSecondaryCtaText: "Public Verification",
  heroSecondaryCtaHref: "/verify",
  aboutTitle: "About SmartVahan",
  aboutBody:
    "SmartVahan provides a centralized platform to manage QR lifecycle, certificate issuance, auditability, and reporting for retro-reflective tape fitment processes.",
  statesTitle: "Authorised States",
  oemsTitle: "OEMs Served",
  statsTitle: "Live Statistics",
  contactTitle: "Contact",
  contactSubtitle: "Send us a message and we’ll get back to you.",
};

const INDIA_STATE_MARKERS: Record<string, { x: number; y: number }> = {
  AN: { x: 82, y: 106 },
  AP: { x: 52, y: 83 },
  AR: { x: 90, y: 32 },
  AS: { x: 83, y: 44 },
  BR: { x: 63, y: 39 },
  CH: { x: 33, y: 26 },
  CT: { x: 52, y: 63 },
  DL: { x: 41, y: 30 },
  DN: { x: 26, y: 63 },
  DD: { x: 24, y: 61 },
  GA: { x: 30, y: 71 },
  GJ: { x: 24, y: 53 },
  HP: { x: 39, y: 21 },
  HR: { x: 38, y: 27 },
  JH: { x: 62, y: 49 },
  JK: { x: 44, y: 15 },
  KA: { x: 36, y: 84 },
  KL: { x: 34, y: 104 },
  LA: { x: 49, y: 12 },
  LD: { x: 20, y: 104 },
  MH: { x: 37, y: 70 },
  ML: { x: 79, y: 52 },
  MN: { x: 90, y: 54 },
  MP: { x: 43, y: 55 },
  MZ: { x: 88, y: 62 },
  NL: { x: 90, y: 46 },
  OD: { x: 60, y: 68 },
  OR: { x: 60, y: 68 },
  PB: { x: 34, y: 23 },
  PY: { x: 45, y: 100 },
  RJ: { x: 30, y: 40 },
  SK: { x: 70, y: 35 },
  TG: { x: 46, y: 74 },
  TN: { x: 42, y: 106 },
  TR: { x: 84, y: 60 },
  UP: { x: 52, y: 34 },
  UT: { x: 47, y: 26 },
  WB: { x: 70, y: 52 },
};

export default function LandingPage({ mode = "landing" }: LandingPageProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["public-home"],
    queryFn: async () => {
      const res = await client.get<HomeData>("/public/home");
      return res.data;
    },
    retry: 1,
  });

  const content = useMemo(() => {
    const c = data?.data?.content || {};
    return { ...DEFAULT_CONTENT, ...c };
  }, [data]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [organisation, setOrganisation] = useState("");
  const [stateOrUt, setStateOrUt] = useState("");
  const [role, setRole] = useState("");
  const [message, setMessage] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submittedKind, setSubmittedKind] = useState<"contact" | "dealer" | null>(null);
  const [submittedDealerStatus, setSubmittedDealerStatus] = useState<string | null>(null);
  const [submittedDealerRequestId, setSubmittedDealerRequestId] = useState<string | null>(null);

  const [dealerStateCode, setDealerStateCode] = useState("");
  const [dealerCity, setDealerCity] = useState("");
  const [dealerAddress, setDealerAddress] = useState("");
  const [dealerZip, setDealerZip] = useState("");
  const [dealerGstNo, setDealerGstNo] = useState("");
  const [dealerTradeCertificateNo, setDealerTradeCertificateNo] = useState("");
  const [dealerTradeValidity, setDealerTradeValidity] = useState("");
  const [dealerAadharNumber, setDealerAadharNumber] = useState("");
  const [dealerTradeCertificateUrl, setDealerTradeCertificateUrl] = useState("");
  const [dealerGstCertificateUrl, setDealerGstCertificateUrl] = useState("");
  const [dealerAadharCardUrl, setDealerAadharCardUrl] = useState("");
  const [dealerOemCodes, setDealerOemCodes] = useState<string[]>([]);
  const [dealerLatitude, setDealerLatitude] = useState<number | null>(null);
  const [dealerLongitude, setDealerLongitude] = useState<number | null>(null);
  const [dealerGeoStateName, setDealerGeoStateName] = useState("");
  const [dealerPassingRtoCodes, setDealerPassingRtoCodes] = useState<string[]>([]);
  const [locationError, setLocationError] = useState<string>("");
  const [docsError, setDocsError] = useState<string>("");
  const [phoneError, setPhoneError] = useState<string>("");
  const [passingRtoError, setPassingRtoError] = useState<string>("");
  const [oemError, setOemError] = useState<string>("");
  const [successPopupOpen, setSuccessPopupOpen] = useState(false);
  const [successPopupMessage, setSuccessPopupMessage] = useState("");

  const isDealerRegistration = mode === "dealer-registration";

  const [googleMapsApiKey] = useState(() => {
    if (import.meta.env.VITE_GOOGLE_MAPS_KEY) return String(import.meta.env.VITE_GOOGLE_MAPS_KEY);
    try {
      const settings = localStorage.getItem("sv_settings");
      if (settings) {
        const parsed = JSON.parse(settings);
        if (parsed?.googlePlacesKey) return String(parsed.googlePlacesKey);
        if (parsed?.googleMapsKey) return String(parsed.googleMapsKey);
      }
    } catch {
      // ignore
    }
    return "";
  });
  const { isLoaded: isPlacesLoaded } = useLoadScript({
    googleMapsApiKey,
    libraries,
  });
  const [autocomplete, setAutocomplete] = useState<any>(null);
  const autocompleteRef = useRef<any>(null);
  const [locationSearch, setLocationSearch] = useState("");
  useEffect(() => {
    if (mode !== "landing") return;
    const st: any = (location as any)?.state;
    if (st?.scrollTo !== "home") return;
    const t = window.setTimeout(() => {
      const el = document.getElementById("home");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      else window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }, 0);
    return () => window.clearTimeout(t);
  }, [location, mode]);

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });

  const submit = useMutation({
    mutationFn: async () => {
      const name = [firstName, lastName].filter(Boolean).join(" ").trim();
      if (isDealerRegistration) {
        const res = await client.post("/public/dealer-registration", {
          name: name || "Anonymous",
          firstName,
          lastName,
          email,
          dealerName: organisation,
          phone,
          stateCode: dealerStateCode || null,
          passingRtoCodes: dealerPassingRtoCodes,
          locationAddress: dealerAddress || null,
          city: dealerCity || null,
          zip: dealerZip || null,
          latitude: dealerLatitude,
          longitude: dealerLongitude,
          oemCodes: dealerOemCodes,
          gstNo: dealerGstNo || null,
          tradeCertificateNo: dealerTradeCertificateNo || null,
          tradeValidity: dealerTradeValidity ? new Date(dealerTradeValidity).toISOString() : null,
          aadharNumber: dealerAadharNumber || null,
          tradeCertificateUrl: dealerTradeCertificateUrl || null,
          gstCertificateUrl: dealerGstCertificateUrl || null,
          aadharCardUrl: dealerAadharCardUrl || null,
          note: message ? String(message) : null
        });
        return { kind: "dealer" as const, data: res.data };
      }

      const fullMessageParts = [
        role ? `Role: ${role}` : null,
        organisation ? `Organisation: ${organisation}` : null,
        stateOrUt ? `State/UT: ${stateOrUt}` : null,
        "",
        message,
      ].filter((x) => x !== null);

      const res = await client.post("/public/contact", {
        name: name || "Anonymous",
        email,
        phone,
        message: fullMessageParts.join("\n"),
      });
      return { kind: "contact" as const, data: res.data };
    },
    onSuccess: (res: any) => {
      setSubmittedKind(res?.kind || null);
      if (res?.kind === "dealer") {
        const status = res?.data?.data?.status || null;
        const id = res?.data?.data?.id || null;
        setSubmittedDealerStatus(status ? String(status) : null);
        setSubmittedDealerRequestId(id ? String(id) : null);
        setSubmittedId(id ? String(id) : status ? String(status) : "OK");
      } else {
        setSubmittedDealerStatus(null);
        setSubmittedDealerRequestId(null);
        setSubmittedId(res?.data?.data?.id || res?.data?.id || "OK");
      }
      setFirstName("");
      setLastName("");
      setEmail("");
      setPhone("");
      setOrganisation("");
      setStateOrUt("");
      setRole("");
      setMessage("");
      setDealerStateCode("");
      setDealerCity("");
      setDealerAddress("");
      setDealerZip("");
      setDealerGstNo("");
      setDealerTradeCertificateNo("");
      setDealerTradeValidity("");
      setDealerAadharNumber("");
      setDealerTradeCertificateUrl("");
      setDealerGstCertificateUrl("");
      setDealerAadharCardUrl("");
      setDealerOemCodes([]);
      setDealerLatitude(null);
      setDealerLongitude(null);
      setDealerGeoStateName("");
      setDealerPassingRtoCodes([]);
      setLocationSearch("");
      setLocationError("");
      setDocsError("");
      setPhoneError("");
      setPassingRtoError("");
      setOemError("");

      if (res?.kind === "dealer") {
        const status = String(res?.data?.data?.status || "");
        if (status === "CREATED") {
          setSuccessPopupMessage("Application submitted successfully. Your application is submitted for approval.");
          setSuccessPopupOpen(true);
        } else if (status === "PENDING") {
          setSuccessPopupMessage("Your application is already submitted and is pending approval.");
          setSuccessPopupOpen(true);
        }
      }
    },
  });

  const stats = data?.data?.stats;
  const states = data?.data?.states || [];
  const oems = data?.data?.oems || [];
  const registrationOems = data?.data?.registrationOems || [];
  const dealerOemOptions = useMemo(() => {
    const base = registrationOems.length ? registrationOems : oems;
    if (!dealerStateCode) return base;
    return base.filter((o: any) => {
      if (!("authorizedStates" in o)) return true;
      return Array.isArray(o.authorizedStates) && o.authorizedStates.includes(dealerStateCode);
    });
  }, [dealerStateCode, oems, registrationOems]);

  const { data: passingRtos = [] } = useQuery({
    queryKey: ["public-passing-rtos", dealerStateCode],
    queryFn: async () => {
      const res = await client.get<Array<{ code: string; name: string }>>("/rtos", {
        params: { stateCode: dealerStateCode }
      });
      return res.data;
    },
    enabled: isDealerRegistration && Boolean(dealerStateCode)
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("vis");
            obs.unobserve(e.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -32px 0px" },
    );

    root.querySelectorAll("[data-a]").forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const statsEl = root.querySelector("#stats");
    if (!statsEl) return;

    const animCounter = (el: Element) => {
      const target = Number.parseInt(el.getAttribute("data-target") || "0", 10);
      const suffix = el.getAttribute("data-suffix") || "";
      const durationMs = 2000;
      const start = performance.now();

      const easeOut = (t: number) => 1 - Math.pow(2, -10 * t);

      const frame = (now: number) => {
        const p = Math.min((now - start) / durationMs, 1);
        const val = Math.round(easeOut(p) * target);
        (el as HTMLElement).textContent = val.toLocaleString("en-IN") + suffix;
        if (p < 1) requestAnimationFrame(frame);
      };

      requestAnimationFrame(frame);
    };

    let done = false;
    const sObs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !done) {
            done = true;
            root.querySelectorAll(".s-num[data-target]").forEach((el, i) => {
              window.setTimeout(() => animCounter(el), i * 120);
            });
            root.querySelectorAll(".s-bar-fill").forEach((bar, i) => {
              const w = bar.getAttribute("data-w") || "0";
              window.setTimeout(() => {
                (bar as HTMLElement).style.transition = "width 1.8s cubic-bezier(.22,1,.36,1)";
                (bar as HTMLElement).style.width = `${w}%`;
              }, i * 200 + 300);
            });
            sObs.disconnect();
          }
        });
      },
      { threshold: 0.2 },
    );

    sObs.observe(statsEl);
    return () => sObs.disconnect();
  }, [
    stats?.totalQrCodeIssued,
    stats?.totalCertificateGenerated,
    stats?.totalVehicleFitments,
    stats?.totalStatesServed,
    stats?.totalRtosServed
  ]);

  const onAnchorClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    const href = e.currentTarget.getAttribute("href") || "";
    if (!href.startsWith("#")) return;
    if (href === "#") return;
    const target = rootRef.current?.querySelector(href);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth" });
  };

  const landingCss = useMemo(
    () => `
@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600&family=DM+Mono:wght@400;500&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
:root{
  --red:#E8253A;
  --red-d:#c91e2f;
  --red-l:rgba(232,37,58,.08);
  --gold:#D4992A;
  --navy:#0D1B2A;
  --indigo:#1E2D6B;
  --indigo-m:#2D3E9E;
  --white:#FFFFFF;
  --bg:#F4F6FB;
  --border:#E2E8F0;
  --text:#0D1B2A;
  --text-m:#334155;
  --text-l:#64748B;
  --text-xl:#94A3B8;
  --green:#10B981;
  --sh-sm:0 2px 12px rgba(13,27,42,.07);
  --sh-md:0 8px 32px rgba(13,27,42,.12);
  --sh-lg:0 24px 64px rgba(13,27,42,.18);
  --radius:16px;
  --tr:.3s cubic-bezier(.4,0,.2,1);
  --max-w:1200px;
  --pad:clamp(20px,4vw,48px);
  --sec:clamp(72px,9vw,110px);
}
html{scroll-behavior:smooth;}
body{font-family:'DM Sans',sans-serif;background:var(--bg);color:var(--text);overflow-x:hidden;line-height:1.6;}
h1,h2,h3,h4{font-family:'Poppins',sans-serif;line-height:1.1;}
a{text-decoration:none;color:inherit;}
.container{max-width:var(--max-w);margin:0 auto;padding:0 var(--pad);}
.btn{display:inline-flex;align-items:center;gap:8px;font-family:'Poppins',sans-serif;font-weight:600;font-size:14px;padding:13px 24px;border-radius:10px;text-decoration:none;cursor:pointer;border:none;transition:var(--tr);}
.btn-red{background:var(--red);color:#fff;box-shadow:0 6px 20px rgba(232,37,58,.3);}
.btn-red:hover{background:var(--red-d);transform:translateY(-2px);box-shadow:0 10px 28px rgba(232,37,58,.4);}
.btn-outline{background:transparent;color:#fff;border:1.5px solid rgba(255,255,255,.28);}
.btn-outline:hover{border-color:#fff;background:rgba(255,255,255,.07);transform:translateY(-2px);}
.btn-navy{background:var(--indigo);color:#fff;}
.btn-navy:hover{background:var(--navy);transform:translateY(-2px);box-shadow:var(--sh-md);}
.sec-label{font-family:'DM Mono',monospace;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--red);font-weight:500;display:flex;align-items:center;gap:10px;margin-bottom:14px;}
.sec-label::after{content:'';flex:1;height:1px;background:linear-gradient(to right,rgba(232,37,58,.3),transparent);}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
[data-a]{opacity:0;transform:translateY(22px);transition:opacity .65s ease,transform .65s ease;}
[data-a].vis{opacity:1;transform:none;}
[data-a][data-d="1"]{transition-delay:.1s;}[data-a][data-d="2"]{transition-delay:.2s;}
[data-a][data-d="3"]{transition-delay:.3s;}[data-a][data-d="4"]{transition-delay:.4s;}
[data-a][data-d="5"]{transition-delay:.5s;}[data-a][data-d="6"]{transition-delay:.6s;}
.nav{position:fixed;top:0;left:0;right:0;z-index:200;transition:var(--tr);}
.nav.sc{background:rgba(13,27,42,.96);backdrop-filter:blur(20px);box-shadow:0 1px 0 rgba(255,255,255,.06);}
.nav-inner{max-width:var(--max-w);margin:0 auto;padding:0 var(--pad);height:68px;display:flex;align-items:center;justify-content:space-between;gap:16px;}
.nav-logo{display:flex;align-items:center;gap:10px;color:#fff;font-family:'Poppins',sans-serif;font-weight:800;letter-spacing:.02em;}
.nav-mark{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,var(--red),var(--gold));box-shadow:0 10px 20px rgba(232,37,58,.25);}
.nav-links{display:flex;align-items:center;gap:1px;}
.nav-link{font-family:'Poppins',sans-serif;font-size:12.5px;font-weight:500;color:rgba(255,255,255,.65);text-decoration:none;padding:7px 11px;border-radius:8px;transition:var(--tr);white-space:nowrap;}
.nav-link:hover{color:#fff;background:rgba(255,255,255,.08);}
.nav-right{display:flex;align-items:center;gap:10px;flex-shrink:0;}
.nav-gov{font-family:'Poppins',sans-serif;font-size:10.5px;font-weight:600;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.14);color:rgba(255,255,255,.65);padding:5px 11px;border-radius:6px;letter-spacing:.04em;}
.hero{min-height:100vh;background:linear-gradient(135deg,var(--navy) 0%,var(--indigo) 55%,#1a2b5e 100%);position:relative;overflow:hidden;display:flex;align-items:center;padding-top:68px;}
.hero::before{content:'';position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse 55% 70% at 70% 40%,rgba(232,37,58,.13) 0%,transparent 65%),radial-gradient(ellipse 40% 50% at 10% 80%,rgba(212,153,42,.07) 0%,transparent 55%);}
.hero-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px);background-size:52px 52px;mask-image:radial-gradient(ellipse at 50% 50%,black 20%,transparent 75%);pointer-events:none;}
.hero-road{position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,transparent,var(--gold) 30%,var(--gold) 70%,transparent);opacity:.45;}
.hero-stripe{position:absolute;bottom:0;left:0;right:0;height:4px;background:repeating-linear-gradient(90deg,transparent 0,transparent 70px,var(--red) 70px,var(--red) 130px);animation:stripe 3.5s linear infinite;opacity:.3;}
@keyframes stripe{from{transform:translateX(0)}to{transform:translateX(130px)}}
.hero-inner{position:relative;z-index:2;display:grid;grid-template-columns:1fr 400px;gap:56px;align-items:center;padding:clamp(56px,8vw,96px) 0;width:100%;}
@media(max-width:1024px){.hero-inner{grid-template-columns:1fr;}}
@keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.hero-eyebrow{display:flex;align-items:center;gap:10px;margin-bottom:22px;opacity:0;animation:fadeUp .7s .15s ease forwards;}
.hero-eyebrow-line{width:32px;height:2px;background:var(--red);border-radius:2px;flex-shrink:0;}
.hero-eyebrow-txt{font-family:'DM Mono',monospace;font-size:10.5px;letter-spacing:.14em;color:rgba(255,255,255,.55);text-transform:uppercase;}
.hero-h1{font-size:clamp(38px,5.5vw,70px);font-weight:800;letter-spacing:-.035em;color:#fff;line-height:1.04;margin-bottom:20px;opacity:0;animation:fadeUp .7s .3s ease forwards;}
.hero-h1 .red{color:var(--red);}
.hero-h1 .gold{color:var(--gold);position:relative;}
.hero-h1 .gold::after{content:'';position:absolute;left:0;bottom:-3px;width:100%;height:3px;background:linear-gradient(90deg,var(--gold),var(--red));border-radius:2px;}
.hero-desc{font-size:clamp(14.5px,1.5vw,16.5px);color:rgba(255,255,255,.58);line-height:1.8;max-width:510px;margin-bottom:32px;font-weight:300;opacity:0;animation:fadeUp .7s .45s ease forwards;}
.hero-desc strong{color:rgba(255,255,255,.82);font-weight:500;}
.hero-btns{display:flex;flex-wrap:wrap;gap:11px;opacity:0;animation:fadeUp .7s .6s ease forwards;}
.hero-badges{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px;opacity:0;animation:fadeUp .7s .75s ease forwards;}
.hb{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.11);border-radius:7px;padding:6px 12px;font-family:'DM Mono',monospace;font-size:10px;color:rgba(255,255,255,.5);letter-spacing:.04em;}
.hb svg{width:12px;height:12px;fill:var(--gold);flex-shrink:0;}
.hero-card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.11);border-radius:20px;padding:26px;backdrop-filter:blur(10px);opacity:0;animation:fadeUp .8s .5s ease forwards;}
@media(max-width:1024px){.hero-card{display:none;}}
.hc-badge{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.1em;background:rgba(232,37,58,.14);border:1px solid rgba(232,37,58,.24);color:var(--red);border-radius:100px;padding:5px 13px;text-align:center;margin-bottom:18px;display:flex;align-items:center;justify-content:center;gap:6px;}
.hc-dot{width:6px;height:6px;border-radius:50%;background:var(--red);animation:blink 1.5s infinite;}
.hc-qr{width:130px;height:130px;background:#fff;border-radius:12px;padding:10px;margin:0 auto 16px;overflow:hidden;position:relative;}
.hc-qr svg{width:100%;height:100%;display:block;}
.hc-layers{display:flex;flex-direction:column;gap:7px;}
.hc-layer{display:flex;align-items:center;gap:9px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:9px 12px;}
.hc-dot2{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.hc-lbl{font-size:12px;color:rgba(255,255,255,.72);font-weight:500;}
.hc-val{font-family:'DM Mono',monospace;font-size:9.5px;color:rgba(255,255,255,.32);margin-left:auto;}
.ticker{background:#fff;border-top:3px solid var(--red);border-bottom:1px solid var(--border);overflow:hidden;}
.ticker-track{display:flex;width:max-content;animation:tick 32s linear infinite;}
@keyframes tick{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.tick-item{display:flex;align-items:center;gap:8px;padding:12px 34px;border-right:1px solid var(--border);white-space:nowrap;font-size:12.5px;font-weight:500;color:var(--text-l);}
.tick-dot{width:5px;height:5px;border-radius:50%;background:var(--red);}
.about{padding:var(--sec) 0;background:#fff;position:relative;overflow:hidden;}
.about::after{content:'';position:absolute;right:-150px;top:-100px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,rgba(30,45,107,.05),transparent 70%);pointer-events:none;}
.about-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(36px,6vw,80px);align-items:center;}
@media(max-width:768px){.about-grid{grid-template-columns:1fr;}}
.about-frame{border-radius:20px;overflow:hidden;box-shadow:var(--sh-lg);position:relative;background:var(--navy);aspect-ratio:4/3;}
.about-frame svg{width:100%;height:100%;display:block;}
.about-badge{position:absolute;bottom:18px;left:18px;display:flex;align-items:center;gap:9px;background:rgba(13,27,42,.9);backdrop-filter:blur(14px);border:1px solid rgba(212,153,42,.35);border-radius:10px;padding:9px 15px;}
.ab-dot{width:9px;height:9px;border-radius:50%;background:var(--green);animation:blink 2s infinite;flex-shrink:0;}
.ab-t{font-family:'Poppins',sans-serif;font-size:11px;font-weight:700;color:#fff;}
.ab-s{font-size:9.5px;color:rgba(255,255,255,.42);letter-spacing:.04em;margin-top:1px;}
.about-title em{font-style:normal;color:var(--red);}
.about-desc{color:var(--text-l);font-size:15px;line-height:1.8;margin-bottom:20px;}
.feat-list{display:flex;flex-direction:column;gap:11px;margin-bottom:28px;}
.feat{display:flex;align-items:flex-start;gap:13px;padding:13px 17px;background:var(--bg);border-radius:12px;border-left:3px solid var(--red);transition:var(--tr);}
.feat:hover{background:rgba(232,37,58,.04);}
.feat-icon{width:33px;height:33px;border-radius:8px;flex-shrink:0;background:linear-gradient(135deg,var(--red),var(--red-d));display:flex;align-items:center;justify-content:center;}
.feat-icon svg{width:16px;height:16px;fill:#fff;}
.feat h4{font-size:13px;font-weight:700;color:var(--text);margin-bottom:2px;}
.feat p{font-size:12px;color:var(--text-l);line-height:1.55;}
.how{padding:var(--sec) 0;background:var(--bg);}
.how-hd{text-align:center;margin-bottom:clamp(44px,6vw,64px);}
.how-hd p{color:var(--text-l);font-size:15.5px;max-width:500px;margin:13px auto 0;}
.how-hd em{font-style:normal;color:var(--red);}
.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}
@media(max-width:900px){.steps{grid-template-columns:repeat(2,1fr);}}
@media(max-width:540px){.steps{grid-template-columns:1fr;}}
.step{background:#fff;border-radius:var(--radius);border:1px solid var(--border);padding:26px;position:relative;overflow:hidden;transition:var(--tr);}
.step::before{content:'';position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--red),var(--gold));transform:scaleX(0);transform-origin:left;transition:transform .35s ease;}
.step:hover{transform:translateY(-4px);box-shadow:var(--sh-md);border-color:transparent;}
.step:hover::before{transform:scaleX(1);}
.step-n{font-family:'Poppins',sans-serif;font-size:42px;font-weight:900;color:rgba(232,37,58,.08);position:absolute;top:14px;right:16px;line-height:1;letter-spacing:-.04em;}
.step-ico{width:48px;height:48px;border-radius:11px;margin-bottom:17px;background:linear-gradient(135deg,var(--red),var(--red-d));display:flex;align-items:center;justify-content:center;box-shadow:0 6px 16px rgba(232,37,58,.28);}
.step-ico svg{width:23px;height:23px;fill:#fff;}
.step h3{font-size:15.5px;font-weight:700;margin-bottom:8px;color:var(--text);}
.step p{font-size:13px;color:var(--text-l);line-height:1.65;}
.states{padding:var(--sec) 0;background:var(--indigo);position:relative;overflow:hidden;}
.states::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.024) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.024) 1px,transparent 1px);background-size:44px 44px;pointer-events:none;}
.states::after{content:'';position:absolute;bottom:-80px;right:-80px;width:400px;height:400px;border-radius:50%;background:radial-gradient(circle,rgba(232,37,58,.11),transparent 65%);pointer-events:none;}
.states-hd{text-align:center;margin-bottom:clamp(38px,5vw,58px);position:relative;z-index:1;}
.states-hd h2{color:#fff;}
.states-hd p{color:rgba(255,255,255,.48);font-size:15px;margin-top:12px;max-width:600px;margin-left:auto;margin-right:auto;}
.states-layout{display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,5vw,60px);align-items:center;position:relative;z-index:1;}
@media(max-width:768px){.states-layout{grid-template-columns:1fr;}}
.states-map{border-radius:16px;overflow:hidden;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);padding:18px;min-height:280px;display:flex;align-items:stretch;justify-content:stretch;}
.india-map-wrap{width:100%;display:flex;flex-direction:column;gap:10px;}
.india-map-svg{width:100%;height:auto;max-height:360px;display:block;}
.india-outline{fill:rgba(255,255,255,.04);stroke:rgba(255,255,255,.22);stroke-width:1.2;}
.india-marker{fill:rgba(255,255,255,.18);stroke:rgba(255,255,255,.34);stroke-width:.7;}
.india-marker.active{fill:var(--red);stroke:rgba(255,255,255,.92);stroke-width:.9;filter:drop-shadow(0 6px 14px rgba(232,37,58,.35));}
.india-pulse{fill:rgba(232,37,58,.22);transform-origin:center;transform-box:fill-box;animation:pulse 1.9s cubic-bezier(.22,1,.36,1) infinite;}
.india-map-meta{display:flex;flex-direction:column;gap:4px;font-size:11px;color:rgba(255,255,255,.55);font-family:'DM Mono',monospace;letter-spacing:.04em;text-transform:none;}
.india-map-count-n{color:#fff;font-weight:700;}
.india-map-unmapped{color:rgba(255,255,255,.42);}
@keyframes pulse{0%{opacity:.7;transform:scale(1);}100%{opacity:0;transform:scale(2.6);}}
.state-cards{display:flex;flex-direction:column;gap:11px;}
.sc-divider{font-family:'DM Mono',monospace;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;padding:0 4px;margin-bottom:2px;}
.sc-div-live{color:rgba(16,185,129,.7);}
.state-card{display:flex;align-items:center;gap:14px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:13px;padding:15px 17px;transition:var(--tr);}
.state-card:hover{background:rgba(255,255,255,.09);transform:translateX(4px);}
.state-card.live{border-color:rgba(16,185,129,.35);background:rgba(16,185,129,.07);}
.state-card.live:hover{border-color:rgba(16,185,129,.55);}
.sc-flag{font-size:24px;line-height:1;flex-shrink:0;width:36px;text-align:center;}
.sc-info{flex:1;}
.sc-name{font-family:'Poppins',sans-serif;font-size:14px;font-weight:700;color:#fff;margin-bottom:2px;}
.sc-detail{font-size:11px;color:rgba(255,255,255,.4);font-family:'DM Mono',monospace;}
.sc-badge{font-family:'DM Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.09em;padding:3px 9px;border-radius:100px;white-space:nowrap;flex-shrink:0;}
.sc-live{background:rgba(16,185,129,.18);border:1px solid rgba(16,185,129,.32);color:var(--green);}
.states-cta{text-align:center;margin-top:clamp(28px,4vw,44px);position:relative;z-index:1;}
.states-cta p{color:rgba(255,255,255,.5);font-size:14px;margin-bottom:14px;}
.brands{padding:var(--sec) 0;background:#fff;}
.brands-hd{text-align:center;margin-bottom:clamp(38px,5vw,58px);}
.brands-hd em{font-style:normal;color:var(--red);}
.brands-hd p{color:var(--text-l);font-size:15px;margin-top:12px;max-width:550px;margin-left:auto;margin-right:auto;}
.brands-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(168px,1fr));gap:16px;margin-bottom:32px;}
.brand-card{background:var(--bg);border:1.5px solid var(--border);border-radius:13px;padding:24px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;transition:var(--tr);}
.brand-card:hover{border-color:var(--red);background:var(--red-l);transform:translateY(-4px);box-shadow:var(--sh-md);}
.brand-logo{width:64px;height:64px;border-radius:13px;display:flex;align-items:center;justify-content:center;font-family:'Poppins',sans-serif;font-weight:800;font-size:15px;letter-spacing:-.04em;color:#fff;position:relative;overflow:hidden;}
.brand-logo::after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.18),transparent);}
.brand-name{font-weight:700;font-size:13px;color:var(--text);}
.brand-type{font-size:10.5px;color:var(--text-l);font-family:'DM Mono',monospace;letter-spacing:.04em;}
.brand-ver{display:flex;align-items:center;gap:3px;font-size:9.5px;color:var(--green);font-weight:600;background:rgba(16,185,129,.09);padding:3px 7px;border-radius:5px;letter-spacing:.04em;}
.brands-enroll{background:var(--bg);border:1px solid var(--border);border-radius:14px;padding:24px 28px;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:18px;}
.be-left{display:flex;align-items:center;gap:13px;}
.be-icon{width:44px;height:44px;background:rgba(232,37,58,.09);border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.be-icon svg{width:21px;height:21px;fill:var(--red);}
.be-t{font-weight:700;font-size:14.5px;color:var(--text);margin-bottom:2px;}
.be-s{font-size:13px;color:var(--text-l);}
.lstats{padding:var(--sec) 0;background:linear-gradient(135deg,var(--navy) 0%,var(--indigo) 100%);position:relative;overflow:hidden;}
.lstats::before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.024) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.024) 1px,transparent 1px);background-size:50px 50px;pointer-events:none;}
.lstats-g1{position:absolute;top:-100px;left:-100px;width:380px;height:380px;border-radius:50%;background:radial-gradient(circle,rgba(232,37,58,.1),transparent 65%);pointer-events:none;}
.lstats-g2{position:absolute;bottom:-100px;right:-100px;width:460px;height:460px;border-radius:50%;background:radial-gradient(circle,rgba(212,153,42,.09),transparent 65%);pointer-events:none;}
.lstats-hd{text-align:center;margin-bottom:clamp(44px,6vw,64px);position:relative;z-index:1;}
.lstats-live{display:inline-flex;align-items:center;gap:8px;background:rgba(232,37,58,.11);border:1px solid rgba(232,37,58,.24);border-radius:100px;padding:7px 17px;font-family:'DM Mono',monospace;font-size:10px;letter-spacing:.13em;font-weight:600;color:var(--red);margin-bottom:16px;}
.ls-pulse{width:7px;height:7px;border-radius:50%;background:var(--red);animation:blink 1.5s infinite;}
.lstats-hd h2{color:#fff;}
.lstats-hd h2 span{color:var(--red);}
.lstats-hd p{color:rgba(255,255,255,.42);font-size:14.5px;margin-top:11px;}
.stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;position:relative;z-index:1;margin-bottom:16px;}
@media(max-width:900px){.stats-grid{grid-template-columns:repeat(2,1fr);}}
@media(max-width:540px){.stats-grid{grid-template-columns:1fr;}}
@media(min-width:901px){.stats-grid .wide{grid-column:1/span 2;}}
.scard{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.09);border-radius:17px;padding:26px;position:relative;overflow:hidden;transition:var(--tr);backdrop-filter:blur(4px);}
.scard:hover{transform:translateY(-5px);border-color:rgba(232,37,58,.32);box-shadow:0 20px 48px rgba(0,0,0,.28);}
.sg{position:absolute;top:-60px;right:-60px;width:180px;height:180px;border-radius:50%;filter:blur(44px);pointer-events:none;transition:transform .4s;}
.scard:hover .sg{transform:scale(1.4);}
.s-ico{width:50px;height:50px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:17px;position:relative;z-index:1;border:1px solid;}
.s-ico svg{width:23px;height:23px;}
.s-num{font-family:'Poppins',sans-serif;font-size:clamp(34px,4.5vw,54px);font-weight:800;letter-spacing:-.04em;color:#fff;line-height:1;margin-bottom:7px;position:relative;z-index:1;}
.s-lbl{font-size:13.5px;font-weight:600;color:rgba(255,255,255,.85);margin-bottom:4px;position:relative;z-index:1;}
.s-sub{font-size:11.5px;color:rgba(255,255,255,.36);line-height:1.5;margin-bottom:16px;position:relative;z-index:1;}
.s-bar{height:4px;border-radius:2px;background:rgba(255,255,255,.07);overflow:hidden;position:relative;z-index:1;}
.s-bar-fill{height:100%;border-radius:2px;width:0;transition:width 1.8s cubic-bezier(.22,1,.36,1);}
.s-tags{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;position:relative;z-index:1;}
.s-tag{font-family:'DM Mono',monospace;font-size:9.5px;font-weight:600;padding:3px 8px;border-radius:5px;cursor:default;transition:var(--tr);}
.s-tag:hover{transform:translateY(-1px);}
.contact{padding:var(--sec) 0;background:var(--bg);position:relative;overflow:hidden;}
.contact::before{content:'';position:absolute;left:-120px;bottom:-80px;width:320px;height:320px;border-radius:50%;background:radial-gradient(circle,rgba(232,37,58,.07),transparent 70%);pointer-events:none;}
.contact-hd{text-align:center;margin-bottom:clamp(38px,5vw,56px);}
.contact-hd em{font-style:normal;color:var(--red);}
.contact-hd p{color:var(--text-l);font-size:15px;max-width:550px;margin:11px auto 0;line-height:1.7;}
.form-wrap{max-width:700px;margin:0 auto;background:#fff;border:1px solid var(--border);border-radius:20px;padding:clamp(26px,4vw,46px);box-shadow:var(--sh-md);}
.form-wrap h3{font-size:19px;margin-bottom:4px;color:var(--text);}
.form-sub{font-size:13px;color:var(--text-l);margin-bottom:24px;}
.f-row{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media(max-width:540px){.f-row{grid-template-columns:1fr;}}
.f-row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;}
@media(max-width:900px){.f-row-3{grid-template-columns:1fr 1fr;}}
@media(max-width:540px){.f-row-3{grid-template-columns:1fr;}}
.f-grp{display:flex;flex-direction:column;gap:5px;margin-bottom:13px;}
.f-grp label{font-size:11px;font-weight:700;color:var(--text);text-transform:uppercase;letter-spacing:.06em;font-family:'Poppins',sans-serif;}
.f-grp input,.f-grp select,.f-grp textarea{padding:11px 14px;border:1.5px solid var(--border);border-radius:9px;font-family:'DM Sans',sans-serif;font-size:13.5px;color:var(--text);background:var(--bg);outline:none;width:100%;transition:var(--tr);}
.f-grp input:focus,.f-grp select:focus,.f-grp textarea:focus{border-color:var(--red);background:#fff;box-shadow:0 0 0 3px rgba(232,37,58,.09);}
.f-grp textarea{resize:vertical;min-height:96px;}
.f-grp select{appearance:none;cursor:pointer;}
.chk-wrap{background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px;}
.chk-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;}
@media(max-width:540px){.chk-grid{grid-template-columns:1fr;}}
.chk-item{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text);padding:8px 10px;border-radius:9px;border:1px solid rgba(0,0,0,.04);background:#fff;}
.chk-item input{width:16px;height:16px;}
.geo-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px;}
.geo-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px 12px;border-radius:10px;border:1px solid var(--border);background:#fff;color:var(--text);font-weight:700;font-size:12px;cursor:pointer;transition:var(--tr);}
.geo-btn:hover{border-color:rgba(232,37,58,.35);box-shadow:0 8px 20px rgba(13,27,42,.06);}
.geo-pill{font-family:'DM Mono',monospace;font-size:11px;color:rgba(13,27,42,.7);background:rgba(13,27,42,.04);border:1px solid rgba(13,27,42,.08);padding:6px 10px;border-radius:999px;}
.geo-err{font-size:12px;color:var(--red);margin-top:6px;}
.sub-btn{width:100%;padding:14px;border:none;border-radius:10px;cursor:pointer;font-family:'Poppins',sans-serif;font-size:15px;font-weight:700;background:linear-gradient(135deg,var(--red),var(--red-d));color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 7px 20px rgba(232,37,58,.3);transition:var(--tr);}
.sub-btn:hover{transform:translateY(-2px);box-shadow:0 11px 28px rgba(232,37,58,.4);}
.sub-btn svg{width:16px;height:16px;fill:#fff;}
.f-note{font-size:10.5px;color:var(--text-xl);text-align:center;margin-top:11px;}
.footer{background:var(--navy);padding:52px 0 0;position:relative;}
.footer::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--red),var(--gold),var(--red));}
.footer-grid{display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:40px;margin-bottom:40px;}
@media(max-width:768px){.footer-grid{grid-template-columns:1fr 1fr;}}
@media(max-width:460px){.footer-grid{grid-template-columns:1fr;}}
.footer-logo{display:flex;flex-direction:column;gap:12px;}
.footer-logo .title{display:flex;align-items:center;gap:10px;color:#fff;font-family:'Poppins',sans-serif;font-weight:800;letter-spacing:.02em;}
.footer-logo p{font-size:13px;color:rgba(255,255,255,.36);line-height:1.7;max-width:320px;}
.footer-comp{display:flex;flex-direction:column;gap:6px;margin-top:6px;}
.fcb{display:inline-flex;align-items:center;gap:5px;width:fit-content;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:5px;padding:4px 10px;font-size:10px;color:rgba(255,255,255,.4);font-weight:500;}
.fcb span{color:var(--gold);}
.footer-col h4{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:rgba(255,255,255,.32);margin-bottom:13px;}
.footer-links{display:flex;flex-direction:column;gap:8px;}
.footer-links a{font-size:13px;color:rgba(255,255,255,.55);text-decoration:none;transition:var(--tr);}
.footer-links a:hover{color:var(--red);}
.footer-bot{border-top:1px solid rgba(255,255,255,.07);padding:16px 0;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;}
.footer-bot p{font-size:11.5px;color:rgba(255,255,255,.26);}
.footer-bot-links{display:flex;gap:16px;}
.footer-bot-links a{font-size:11.5px;color:rgba(255,255,255,.26);text-decoration:none;}
.footer-bot-links a:hover{color:var(--red);}
@media(max-width:900px){.nav-links{display:none;}}
`,
    [],
  );

  const totalQr = stats?.totalQrCodeIssued ?? 0;
  const totalCert = stats?.totalCertificateGenerated ?? 0;
  const totalFitments = stats?.totalVehicleFitments ?? 0;
  const totalStates = stats?.totalStatesServed ?? 0;
  const totalRtos = stats?.totalRtosServed ?? 0;
  const activeStateCodes = useMemo(
    () => new Set((states || []).map((s) => String(s.code || "").toUpperCase().trim()).filter(Boolean)),
    [states]
  );
  const stateNameByCode = useMemo(() => {
    const out: Record<string, string> = {};
    (states || []).forEach((s) => {
      const key = String(s.code || "").toUpperCase().trim();
      if (key) out[key] = s.name;
    });
    return out;
  }, [states]);
  const unmappedActiveCodes = useMemo(() => {
    const missing: string[] = [];
    activeStateCodes.forEach((code) => {
      if (!INDIA_STATE_MARKERS[code]) missing.push(code);
    });
    missing.sort();
    return missing;
  }, [activeStateCodes]);

  const IndiaActiveStatesMap = () => {
    const allKnownCodes = Object.keys(INDIA_STATE_MARKERS);
    return (
      <div className="india-map-wrap">
        <svg
          className="india-map-svg"
          viewBox="0 0 100 120"
          role="img"
          aria-label="India map showing active states"
        >
          <path
            className="india-outline"
            d="M44 6 L53 10 L60 18 L66 28 L69 41 L74 52 L78 67 L74 79 L66 90 L61 103 L54 114 L46 118 L40 110 L33 98 L29 85 L24 70 L22 56 L25 42 L31 31 L36 22 L40 14 Z"
          />

          {allKnownCodes.map((code) => {
            const pt = INDIA_STATE_MARKERS[code];
            const isActive = activeStateCodes.has(code);
            return (
              <circle
                key={code}
                className={isActive ? "india-marker active" : "india-marker"}
                cx={pt.x}
                cy={pt.y}
                r={isActive ? 2.3 : 1.6}
              >
                <title>{stateNameByCode[code] ? `${stateNameByCode[code]} (${code})` : code}</title>
              </circle>
            );
          })}

          {Array.from(activeStateCodes)
            .filter((code) => INDIA_STATE_MARKERS[code])
            .map((code) => {
              const pt = INDIA_STATE_MARKERS[code];
              return <circle key={`${code}-pulse`} className="india-pulse" cx={pt.x} cy={pt.y} r={2.3} />;
            })}
        </svg>

        <div className="india-map-meta">
          <div className="india-map-count">
            Active states on map: <span className="india-map-count-n">{activeStateCodes.size}</span>
          </div>
          {unmappedActiveCodes.length ? (
            <div className="india-map-unmapped">Not mapped yet: {unmappedActiveCodes.join(", ")}</div>
          ) : null}
        </div>
      </div>
    );
  };

  return (
    <div ref={rootRef} id="top">
      <style>{landingCss}</style>
      {successPopupOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 1000,
          }}
          role="dialog"
          aria-modal="true"
        >
          <div
            style={{
              width: "min(520px, 100%)",
              background: "#fff",
              borderRadius: 16,
              padding: 18,
              boxShadow: "0 18px 60px rgba(0,0,0,.25)",
              border: "1px solid rgba(13,27,42,.12)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "center", marginTop: 6 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 999,
                  background: "rgba(16,185,129,.12)",
                  border: "1px solid rgba(16,185,129,.25)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <svg viewBox="0 0 24 24" width="28" height="28" style={{ fill: "none", stroke: "rgb(16,185,129)", strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }}>
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            </div>
            <div style={{ marginTop: 12, textAlign: "center", fontWeight: 800, fontSize: 18 }}>
              Submitted
            </div>
            <div style={{ marginTop: 8, textAlign: "center", fontSize: 14, color: "rgba(13,27,42,.75)" }}>
              {successPopupMessage}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <button
                type="button"
                className="sub-btn"
                style={{ width: "auto", padding: "10px 22px", fontSize: 14 }}
                onClick={() => {
                  setSuccessPopupOpen(false);
                  navigate("/", { replace: true, state: { scrollTo: "home" } });
                  window.setTimeout(() => {
                    const el = document.getElementById("home");
                    if (el) el.scrollIntoView({ behavior: "auto", block: "start" });
                    else window.scrollTo({ top: 0, left: 0, behavior: "auto" });
                  }, 0);
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <nav className={`nav ${scrolled ? "sc" : ""}`} id="nav">
        <div className="nav-inner">
          <a href={mode === "landing" ? "#top" : "/"} onClick={mode === "landing" ? onAnchorClick : undefined} style={{ textDecoration: "none" }}>
            <div className="nav-logo">
              <div className="nav-mark" aria-hidden="true" />
              <div>SMARTVAHAN</div>
            </div>
          </a>
          <div className="nav-links">
            {mode === "landing" ? (
              <>
                <a href="#about" className="nav-link" onClick={onAnchorClick}>
                  About
                </a>
                <a href="#how" className="nav-link" onClick={onAnchorClick}>
                  How It Works
                </a>
                <a href="#states" className="nav-link" onClick={onAnchorClick}>
                  Onboard States
                </a>
                <a href="#brands" className="nav-link" onClick={onAnchorClick}>
                  Empanelled OEMs
                </a>
                <a href="#stats" className="nav-link" onClick={onAnchorClick}>
                  Live Stats
                </a>
                <a href="#contact" className="nav-link" onClick={onAnchorClick}>
                  State Inquiry
                </a>
              </>
            ) : (
              <>
                <a href="/" className="nav-link">
                  Home
                </a>
                <a href="/#contact" className="nav-link">
                  State Inquiry
                </a>
              </>
            )}
          </div>
          <div className="nav-right">
            <a href="/dealer-registration" className="btn btn-red" style={{ padding: "9px 18px", fontSize: 13 }}>
              Dealer Registration
            </a>
          </div>
        </div>
      </nav>

      {mode === "landing" ? (
        <>
      <section className="hero" id="home">
        <div className="hero-grid" />
        <div className="hero-stripe" />
        <div className="hero-road" />
        <div className="container">
          <div className="hero-inner">
            <div>
              <div className="hero-eyebrow">
                <div className="hero-eyebrow-line" />
                <span className="hero-eyebrow-txt">CMVR 1989 · Rule 104-A · BIS AIS:090:2005</span>
              </div>
              <h1 className="hero-h1">
                India’s <span className="red">Reflective</span> <span className="gold">Compliance</span> Platform
              </h1>
              <p className="hero-desc">{content.heroSubtitle}</p>
              <div className="hero-btns">
                <a href="#contact" className="btn btn-red" onClick={onAnchorClick}>
                  <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: "#fff" }}>
                    <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
                  </svg>
                  Request a Demo
                </a>
                <a href="#how" className="btn btn-outline" onClick={onAnchorClick}>
                  <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, fill: "currentColor" }}>
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                  How It Works
                </a>
              </div>
              <div className="hero-badges">
                <div className="hb">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                  CMVR 1989 Compliant
                </div>
                <div className="hb">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                  BIS AIS:090:2005
                </div>
                <div className="hb">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                  </svg>
                  Vahan Portal Integrated
                </div>
              </div>
            </div>

            <div className="hero-card">
              <div className="hc-badge">
                <div className="hc-dot" />
                SMARTVAHAN CERTIFIED QR
              </div>
              <div className="hc-qr">
                <svg viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">
                  <rect x="3" y="3" width="32" height="32" rx="3" fill="#E8253A" />
                  <rect x="7" y="7" width="24" height="24" rx="1" fill="white" />
                  <rect x="10" y="10" width="18" height="18" rx="1" fill="#E8253A" />
                  <rect x="75" y="3" width="32" height="32" rx="3" fill="#1E2D6B" />
                  <rect x="79" y="7" width="24" height="24" rx="1" fill="white" />
                  <rect x="82" y="10" width="18" height="18" rx="1" fill="#1E2D6B" />
                  <rect x="3" y="75" width="32" height="32" rx="3" fill="#1E2D6B" />
                  <rect x="7" y="79" width="24" height="24" rx="1" fill="white" />
                  <rect x="10" y="82" width="18" height="18" rx="1" fill="#1E2D6B" />
                  <rect x="44" y="4" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="54" y="4" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="64" y="4" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="44" y="14" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="54" y="14" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="64" y="14" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="44" y="24" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="54" y="24" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="44" y="44" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="54" y="44" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="64" y="44" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="74" y="44" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="84" y="44" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="94" y="44" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="44" y="54" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="54" y="54" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="64" y="54" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="74" y="54" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="84" y="54" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="94" y="54" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="4" y="44" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="14" y="44" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="24" y="44" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="4" y="54" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="14" y="54" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="24" y="54" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="4" y="64" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="14" y="64" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="24" y="64" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="44" y="64" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="44" y="74" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="54" y="74" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="44" y="84" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="54" y="84" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="44" y="94" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="54" y="94" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="64" y="74" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="74" y="64" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="84" y="64" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="94" y="64" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="74" y="74" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="84" y="74" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="74" y="84" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="84" y="84" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="74" y="94" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="84" y="94" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="94" y="74" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="94" y="84" width="6" height="6" rx="1" fill="#E8253A" />
                  <rect x="94" y="94" width="6" height="6" rx="1" fill="#0D1B2A" />
                  <rect x="3" y="52" width="104" height="2" fill="#E8253A" opacity="0.8">
                    <animate attributeName="y" values="3;105;3" dur="2.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0;0.9;0" dur="2.5s" repeatCount="indefinite" />
                  </rect>
                </svg>
              </div>
              <div className="hc-layers">
                <div className="hc-layer">
                  <div className="hc-dot2" style={{ background: "#E8253A" }} />
                  <div className="hc-lbl">State Code</div>
                  <div className="hc-val">{states.slice(0, 2).map((s) => s.code).join(" · ") || "—"}</div>
                </div>
                <div className="hc-layer">
                  <div className="hc-dot2" style={{ background: "#D4992A" }} />
                  <div className="hc-lbl">OEM</div>
                  <div className="hc-val">{oems.length ? "OEM-LINKED" : "—"}</div>
                </div>
                <div className="hc-layer">
                  <div className="hc-dot2" style={{ background: "#10B981" }} />
                  <div className="hc-lbl">Serial No.</div>
                  <div className="hc-val">ONE-USE</div>
                </div>
                <div className="hc-layer">
                  <div className="hc-dot2" style={{ background: "#1E2D6B" }} />
                  <div className="hc-lbl">Seal</div>
                  <div className="hc-val">TAMPER-PROOF</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="ticker">
        <div className="ticker-track">
          {[
            "CMVR 1989 Compliant",
            "BIS AIS:090:2005",
            "Vahan Portal Integration",
            "Real-Time RTO Verification",
            "Geo-Tagged Fitment Records",
            "Anti-Counterfeit QR System",
            "SmartScanner Enforcement",
            "MoRTH Road Safety Initiative",
          ]
            .concat([
              "CMVR 1989 Compliant",
              "BIS AIS:090:2005",
              "Vahan Portal Integration",
              "Real-Time RTO Verification",
              "Geo-Tagged Fitment Records",
              "Anti-Counterfeit QR System",
              "SmartScanner Enforcement",
              "MoRTH Road Safety Initiative",
            ])
            .map((t, idx) => (
              <div key={`${t}-${idx}`} className="tick-item">
                <div className="tick-dot" />
                {t}
              </div>
            ))}
        </div>
      </div>

      <section className="about" id="about">
        <div className="container">
          <div className="about-grid">
            <div className="about-frame" data-a>
              <svg viewBox="0 0 520 390" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="asky" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0D1B2A" />
                    <stop offset="100%" stopColor="#1E2D6B" />
                  </linearGradient>
                  <linearGradient id="arefl" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#D4992A" />
                    <stop offset="50%" stopColor="#FFFFFF" />
                    <stop offset="100%" stopColor="#D4992A" />
                  </linearGradient>
                  <radialGradient id="abeam" cx="0%" cy="50%" r="100%">
                    <stop offset="0%" stopColor="#D4992A" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#D4992A" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="520" height="390" fill="url(#asky)" />
                <ellipse cx="120" cy="235" rx="150" ry="55" fill="#091420" opacity=".7" />
                <ellipse cx="400" cy="242" rx="170" ry="52" fill="#0a1520" opacity=".6" />
                <rect x="0" y="248" width="520" height="142" fill="#111" />
                <rect x="0" y="248" width="520" height="3" fill="#E8253A" opacity=".65" />
                <rect x="0" y="318" width="55" height="5" rx="2" fill="#D4992A" opacity=".55" />
                <rect x="75" y="318" width="55" height="5" rx="2" fill="#D4992A" opacity=".55" />
                <rect x="150" y="318" width="55" height="5" rx="2" fill="#D4992A" opacity=".55" />
                <rect x="225" y="318" width="55" height="5" rx="2" fill="#D4992A" opacity=".55" />
                <rect x="300" y="318" width="55" height="5" rx="2" fill="#D4992A" opacity=".55" />
                <rect x="375" y="318" width="55" height="5" rx="2" fill="#D4992A" opacity=".55" />
                <rect x="450" y="318" width="55" height="5" rx="2" fill="#D4992A" opacity=".55" />
                <rect x="55" y="158" width="298" height="100" rx="5" fill="#1E293B" />
                <rect x="62" y="164" width="135" height="88" rx="3" fill="#0D1B2A" />
                <rect x="205" y="164" width="140" height="88" rx="3" fill="#0D1B2A" />
                <line x1="200" y1="164" x2="200" y2="252" stroke="#334155" strokeWidth="4" />
                <rect x="191" y="199" width="18" height="8" rx="3" fill="#475569" />
                <rect x="55" y="238" width="298" height="14" fill="url(#arefl)" />
                <rect x="353" y="188" width="108" height="68" rx="7" fill="#1E293B" />
                <rect x="362" y="196" width="86" height="38" rx="5" fill="#38BDF8" opacity=".18" />
                <rect x="362" y="196" width="86" height="38" rx="5" fill="none" stroke="#38BDF8" strokeWidth="1.5" opacity=".4" />
                <rect x="454" y="202" width="22" height="54" rx="3" fill="#334155" />
                <circle cx="465" cy="218" r="7" fill="#D4992A" opacity=".88" />
                <circle cx="465" cy="218" r="4" fill="white" opacity=".95" />
                <polygon points="472,214 520,192 520,222 472,222" fill="url(#abeam)" />
                <rect x="353" y="250" width="108" height="6" fill="url(#arefl)" />
              </svg>
              <div className="about-badge">
                <div className="ab-dot" />
                <div>
                  <div className="ab-t">CMVR 1989 Compliant</div>
                  <div className="ab-s">Rule 104-A · BIS AIS:090:2005</div>
                </div>
              </div>
            </div>

            <div data-a data-d="2">
              <div className="sec-label">{content.aboutTitle}</div>
              <h2
                style={{
                  fontSize: "clamp(28px,3.8vw,44px)",
                  fontWeight: 800,
                  letterSpacing: "-.03em",
                  marginBottom: 16,
                }}
                className="about-title"
              >
                {content.aboutTitle}
              </h2>
              <p className="about-desc" style={{ whiteSpace: "pre-line" }}>
                {content.aboutBody}
              </p>
              <div className="feat-list">
                <div className="feat">
                  <div className="feat-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M3 9h3v10H3V9zm4-6h3v16H7V3zm4 5h3v11h-3V8zm4 3h3v8h-3v-8z" />
                    </svg>
                  </div>
                  <div>
                    <h4>QR-Based Traceability</h4>
                    <p>Every tape roll gets a unique, state-locked, OEM-bound QR — impossible to duplicate or reuse.</p>
                  </div>
                </div>
                <div className="feat">
                  <div className="feat-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
                    </svg>
                  </div>
                  <div>
                    <h4>Digital Certificates</h4>
                    <p>Auto-generated certificates with audit trail and reporting.</p>
                  </div>
                </div>
                <div className="feat">
                  <div className="feat-icon">
                    <svg viewBox="0 0 24 24">
                      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
                    </svg>
                  </div>
                  <div>
                    <h4>Anti-Counterfeit Enforcement</h4>
                    <p>Authorities can verify authenticity in seconds via QR scan workflows.</p>
                  </div>
                </div>
              </div>
              <a href="#contact" className="btn btn-red" onClick={onAnchorClick}>
                Schedule a Demo →
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="how" id="how">
        <div className="container">
          <div className="how-hd" data-a>
            <div className="sec-label" style={{ justifyContent: "center" }}>
              How It Works
            </div>
            <h2 style={{ fontSize: "clamp(28px,4vw,46px)", fontWeight: 800, letterSpacing: "-.03em" }}>
              From QR Generation to <em>RTO Verified</em>
            </h2>
            <p>A fully digital, tamper-proof compliance chain — from OEM to field verification.</p>
          </div>
          <div className="steps">
            {[
              {
                n: "01",
                title: "QR Code Generated",
                desc: "SmartVahan issues unique codes per authorised configuration and tracks their lifecycle.",
                icon: (
                  <svg viewBox="0 0 24 24">
                    <path d="M3 9h3v10H3V9zm4-6h3v16H7V3zm4 5h3v11h-3V8zm4 3h3v8h-3v-8z" />
                  </svg>
                ),
              },
              {
                n: "02",
                title: "OEM Allocation",
                desc: "Stock is allocated and monitored with audit-ready movement logs.",
                icon: (
                  <svg viewBox="0 0 24 24">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                  </svg>
                ),
              },
              {
                n: "03",
                title: "Dealer Fitment",
                desc: "Dealer records fitment and evidence; certificate generation follows the configured rules.",
                icon: (
                  <svg viewBox="0 0 24 24">
                    <path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4z" />
                  </svg>
                ),
              },
              {
                n: "04",
                title: "Certificate Issuance",
                desc: "Certificates are generated and accessible for verification.",
                icon: (
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z" />
                  </svg>
                ),
              },
              {
                n: "05",
                title: "Reporting & Monitoring",
                desc: "Dashboards and reports provide state/RTO/OEM visibility with exports.",
                icon: (
                  <svg viewBox="0 0 24 24">
                    <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                  </svg>
                ),
              },
              {
                n: "06",
                title: "Field Verification",
                desc: "Authorities verify certificate details using QR-based lookups and audit trail.",
                icon: (
                  <svg viewBox="0 0 24 24">
                    <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z" />
                  </svg>
                ),
              },
            ].map((s, idx) => (
              <div key={s.n} className="step" data-a data-d={String(Math.min(idx + 1, 6))}>
                <div className="step-n">{s.n}</div>
                <div className="step-ico">{s.icon}</div>
                <h3>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="states" id="states">
        <div className="container">
          <div className="states-hd" data-a>
            <div className="sec-label" style={{ justifyContent: "center", color: "rgba(232,37,58,.8)" }}>
              {content.statesTitle}
            </div>
            <h2 style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 800, letterSpacing: "-.03em" }}>
              Operational States &amp; Expansion Roadmap
            </h2>
            <p>{states.length ? "States shown here are controlled by the “Show on Home Page” toggle in Dashboard." : isLoading ? "Loading…" : "No states configured for home page."}</p>
          </div>
          <div className="states-layout">
            <div className="states-map" data-a>
              <IndiaActiveStatesMap />
            </div>
            <div className="state-cards" data-a data-d="2">
              <div className="sc-divider sc-div-live">● Authorised States</div>
              {states.map((s) => (
                <div key={s.code} className="state-card live">
                  <div className="sc-flag">🏛️</div>
                  <div className="sc-info">
                    <div className="sc-name">{s.name}</div>
                    <div className="sc-detail">{s.code}</div>
                  </div>
                  <div className="sc-badge sc-live">● LIVE</div>
                </div>
              ))}
            </div>
          </div>
          <div className="states-cta">
            <p>Your state not listed? Onboarding can be configured with minimal IT changes.</p>
            <a href="#contact" className="btn btn-red" onClick={onAnchorClick}>
              Enquire for Your State →
            </a>
          </div>
        </div>
      </section>

      <section className="brands" id="brands">
        <div className="container">
          <div className="brands-hd" data-a>
            <div className="sec-label" style={{ justifyContent: "center" }}>
              {content.oemsTitle}
            </div>
            <h2 style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 800, letterSpacing: "-.03em" }}>
              Certified <em>OEM Partners</em>
            </h2>
            <p>OEMs shown here are controlled by the “Show on Home Page” toggle in Dashboard.</p>
          </div>
          <div className="brands-grid" data-a data-d="2">
            {oems.length ? (
              oems.map((o, idx) => {
                const initials = (o.code || o.name || "OEM").slice(0, 3).toUpperCase();
                const palettes = [
                  "linear-gradient(135deg,#1E2D6B,#2D3E9E)",
                  "linear-gradient(135deg,#92400E,#D97706)",
                  "linear-gradient(135deg,#7F1D1D,#DC2626)",
                  "linear-gradient(135deg,#064E3B,#059669)",
                  "linear-gradient(135deg,#4C1D95,#7C3AED)",
                ];
                return (
                  <div key={o.code} className="brand-card">
                    <div className="brand-logo" style={{ background: palettes[idx % palettes.length] }}>
                      {initials}
                    </div>
                    <div className="brand-name">{o.name}</div>
                    <div className="brand-type">OEM Code: {o.code}</div>
                    <div className="brand-ver">✓ Listed</div>
                  </div>
                );
              })
            ) : (
              <div style={{ gridColumn: "1/-1", textAlign: "center", color: "var(--text-l)", fontSize: 14 }}>
                {isLoading ? "Loading…" : "No OEMs configured for home page."}
              </div>
            )}
          </div>
          <div className="brands-enroll" data-a>
            <div className="be-left">
              <div className="be-icon">
                <svg viewBox="0 0 24 24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10h-4v4h-2v-4H7v-2h4V7h2v4h4v2z" />
                </svg>
              </div>
              <div>
                <div className="be-t">Are you an OEM?</div>
                <div className="be-s">Contact us to get listed and onboarded.</div>
              </div>
            </div>
            <a href="#contact" className="btn btn-navy" onClick={onAnchorClick}>
              Apply for Empanelment →
            </a>
          </div>
        </div>
      </section>

      <section className="lstats" id="stats">
        <div className="lstats-g1" />
        <div className="lstats-g2" />
        <div className="container">
          <div className="lstats-hd" data-a>
            <div className="lstats-live">
              <div className="ls-pulse" />
              LIVE PLATFORM DATA
            </div>
            <h2 style={{ fontSize: "clamp(26px,4vw,48px)", fontWeight: 800, letterSpacing: "-.035em" }}>
              SmartVahan by the <span>Numbers</span>
            </h2>
            <p>
              Real metrics from <strong style={{ color: "rgba(255,255,255,.62)" }}>smartvahan.net</strong>
            </p>
          </div>
          <div className="stats-grid" data-a data-d="2">
            <div className="scard">
              <div className="sg" style={{ background: "rgba(232,37,58,.22)" }} />
              <div className="s-ico" style={{ background: "rgba(232,37,58,.12)", borderColor: "rgba(232,37,58,.22)" }}>
                <svg viewBox="0 0 24 24" style={{ fill: "#E8253A" }}>
                  <path d="M3 9h3v10H3V9zm4-6h3v16H7V3zm4 5h3v11h-3V8zm4 3h3v8h-3v-8z" />
                </svg>
              </div>
              <div className="s-num" data-target={isLoading ? 0 : totalQr} data-suffix="">
                0
              </div>
              <div className="s-lbl">Total QR Codes Issued</div>
              <div className="s-sub">Unique tamper-proof codes generated</div>
              <div className="s-bar">
                <div className="s-bar-fill" style={{ background: "#E8253A" }} data-w="92" />
              </div>
            </div>
            <div className="scard">
              <div className="sg" style={{ background: "rgba(212,153,42,.2)" }} />
              <div className="s-ico" style={{ background: "rgba(212,153,42,.12)", borderColor: "rgba(212,153,42,.22)" }}>
                <svg viewBox="0 0 24 24" style={{ fill: "#D4992A" }}>
                  <path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zM9 13h2v5H9zm4-3h2v8h-2zm-8 5h2v3H5z" />
                </svg>
              </div>
              <div className="s-num" data-target={isLoading ? 0 : totalCert} data-suffix="">
                0
              </div>
              <div className="s-lbl">Certificates Generated</div>
              <div className="s-sub">Generated certificates tracked by the system</div>
              <div className="s-bar">
                <div className="s-bar-fill" style={{ background: "#D4992A" }} data-w="75" />
              </div>
            </div>
            <div className="scard">
              <div className="sg" style={{ background: "rgba(16,185,129,.18)" }} />
              <div className="s-ico" style={{ background: "rgba(16,185,129,.12)", borderColor: "rgba(16,185,129,.22)" }}>
                <svg viewBox="0 0 24 24" style={{ fill: "#10B981" }}>
                  <path d="M12 2a7 7 0 0 0-7 7v3a5 5 0 0 0 5 5h4a5 5 0 0 0 5-5V9a7 7 0 0 0-7-7zm-5 10V9a5 5 0 0 1 10 0v3a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3zm3 8h4v2h-4v-2z" />
                </svg>
              </div>
              <div className="s-num" data-target={isLoading ? 0 : totalFitments} data-suffix="">
                0
              </div>
              <div className="s-lbl">Vehicle Fitments</div>
              <div className="s-sub">Unique registration numbers recorded</div>
              <div className="s-bar">
                <div className="s-bar-fill" style={{ background: "#10B981" }} data-w="68" />
              </div>
            </div>
            <div className="scard wide">
              <div className="sg" style={{ background: "rgba(56,189,248,.15)" }} />
              <div className="s-ico" style={{ background: "rgba(56,189,248,.1)", borderColor: "rgba(56,189,248,.18)" }}>
                <svg viewBox="0 0 24 24" style={{ fill: "#38BDF8" }}>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5S10.62 6.5 12 6.5s2.5 1.12 2.5 2.5S13.38 11.5 12 11.5z" />
                </svg>
              </div>
              <div className="s-num" data-target={isLoading ? 0 : totalStates} data-suffix=" States">
                0
              </div>
              <div className="s-lbl">States Served</div>
              <div className="s-sub">Across authorised states configured for home page</div>
              <div className="s-tags">
                {states.slice(0, 8).map((s) => (
                  <span
                    key={s.code}
                    className="s-tag"
                    style={{ background: "rgba(16,185,129,.18)", border: "1px solid rgba(16,185,129,.3)", color: "#10B981" }}
                  >
                    {s.code} ● Live
                  </span>
                ))}
              </div>
            </div>
            <div className="scard">
              <div className="sg" style={{ background: "rgba(232,37,58,.15)" }} />
              <div className="s-ico" style={{ background: "rgba(232,37,58,.1)", borderColor: "rgba(232,37,58,.18)" }}>
                <svg viewBox="0 0 24 24" style={{ fill: "#E8253A" }}>
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div className="s-num" data-target={isLoading ? 0 : totalRtos} data-suffix=" RTOs">
                0
              </div>
              <div className="s-lbl">RTOs Served</div>
              <div className="s-sub">Total RTOs across configured states</div>
              <div className="s-tags">
                <span className="s-tag" style={{ background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", color: "rgba(255,255,255,.55)" }}>
                  Aggregated
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
        </>
      ) : null}

      <section className="contact" id={isDealerRegistration ? "dealer-registration" : "contact"}>
        <div className="container">
          <div className="contact-hd" data-a>
            <div className="sec-label" style={{ justifyContent: "center" }}>
              {isDealerRegistration ? "Dealer Registration" : "State Inquiry"}
            </div>
            <h2 style={{ fontSize: "clamp(26px,4vw,44px)", fontWeight: 800, letterSpacing: "-.03em" }}>
              {isDealerRegistration ? (
                <>
                  Register as a <em>Dealer</em>
                </>
              ) : (
                <>
                  Get Started with <em>SmartVahan</em>
                </>
              )}
            </h2>
            <p>{content.contactSubtitle}</p>
          </div>

          <div className="form-wrap" data-a data-d="2">
            <h3>{isDealerRegistration ? "Submit Dealer Registration" : "Submit Your Enquiry"}</h3>
            <p className="form-sub">
              {isDealerRegistration
                ? "Fill the details below to submit your dealer registration request."
                : "Select your role so we can route your enquiry to the right team."}
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSubmittedId(null);
                setSubmittedKind(null);
                setSuccessPopupOpen(false);
                if (isDealerRegistration) {
                  setLocationError("");
                  setDocsError("");
                  setPhoneError("");
                  setPassingRtoError("");
                  setOemError("");
                  const hasDoc =
                    (dealerGstNo.trim() && dealerGstCertificateUrl) ||
                    (dealerAadharNumber.trim() && dealerAadharCardUrl) ||
                    (dealerTradeCertificateNo.trim() && dealerTradeCertificateUrl);
                  const phoneDigits = String(phone || "").replace(/\D/g, "");
                  const nextPassingRtoError = dealerPassingRtoCodes.length === 0 ? "Select at least one Passing RTO." : "";
                  const nextOemError = dealerOemCodes.length === 0 ? "Select at least one OEM." : "";
                  const nextPhoneError = phoneDigits.length !== 10 ? "Phone number must be exactly 10 digits." : "";
                  const nextDocsError = !hasDoc ? "Upload at least one verification document (GST, Aadhar, or Trade Certificate)." : "";

                  setPassingRtoError(nextPassingRtoError);
                  setOemError(nextOemError);
                  setPhoneError(nextPhoneError);
                  setDocsError(nextDocsError);

                  if (nextPassingRtoError || nextOemError || nextPhoneError || nextDocsError) return;
                }
                submit.mutate();
              }}
            >
              <div className="f-row">
                <div className="f-grp">
                  <label>First Name</label>
                  <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Rahul" required />
                </div>
                <div className="f-grp">
                  <label>Last Name</label>
                  <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Sharma" required />
                </div>
              </div>

              <div className="f-row">
                <div className="f-grp">
                  <label>{isDealerRegistration ? "Email ID" : "Email"}</label>
                  <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="name@email.com" required />
                </div>
                <div className="f-grp">
                  <label>{isDealerRegistration ? "Phone Number (10 Digit Mobile Number)" : "Phone"}</label>
                  {isDealerRegistration ? (
                    <input
                      value={phone}
                      onChange={(e) => {
                        const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                        setPhone(digits);
                        setPhoneError("");
                      }}
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="9999900000"
                      required
                    />
                  ) : (
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" placeholder="+91 99999 00000" required />
                  )}
                  {phoneError ? <div className="geo-err">{phoneError}</div> : null}
                </div>
              </div>

              <div className="f-row">
                <div className="f-grp">
                  <label>{isDealerRegistration ? "Firm / Organization Name" : "Organisation"}</label>
                  <input
                    value={organisation}
                    onChange={(e) => setOrganisation(e.target.value)}
                    placeholder={isDealerRegistration ? "Firm / Organization name" : "Company / Organisation"}
                    required={isDealerRegistration}
                  />
                </div>

                <div className="f-grp">
                  <label>{isDealerRegistration ? "State" : "State / UT"}</label>
                  {isDealerRegistration ? (
                    <select value={dealerStateCode} onChange={(e) => setDealerStateCode(e.target.value)} required>
                      <option value="" disabled>
                        Select state
                      </option>
                      {states.map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select value={stateOrUt} onChange={(e) => setStateOrUt(e.target.value)}>
                      <option value="" disabled>
                        Select your state
                      </option>
                      {states.map((s) => (
                        <option key={s.code} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  )}
                </div>
              </div>

              {isDealerRegistration ? (
                <>
                  <div className="f-grp">
                    <label>Passing RTO You Work In</label>
                    <div className="chk-wrap">
                      <div className="chk-grid">
                        {passingRtos.map((r) => {
                          const checked = dealerPassingRtoCodes.includes(r.code);
                          return (
                            <label key={r.code} className="chk-item">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? Array.from(new Set([...dealerPassingRtoCodes, r.code]))
                                    : dealerPassingRtoCodes.filter((c) => c !== r.code);
                                  setDealerPassingRtoCodes(next);
                                  setPassingRtoError("");
                                }}
                              />
                              <span>
                                {r.code} - {r.name}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="geo-row">
                        <span className="geo-pill">{dealerPassingRtoCodes.length} selected</span>
                      </div>
                      {passingRtoError ? <div className="geo-err">{passingRtoError}</div> : null}
                    </div>
                  </div>

                  <div className="f-grp">
                    <label>OEMs You Work With</label>
                    <div className="chk-wrap">
                      <div className="chk-grid">
                        {dealerOemOptions.map((o) => {
                          const checked = dealerOemCodes.includes(o.code);
                          return (
                            <label key={o.code} className="chk-item">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? Array.from(new Set([...dealerOemCodes, o.code]))
                                    : dealerOemCodes.filter((c) => c !== o.code);
                                  setDealerOemCodes(next);
                                  setOemError("");
                                }}
                              />
                              <span>
                                {o.name} ({o.code})
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="geo-row">
                        <span className="geo-pill">{dealerOemCodes.length} selected</span>
                      </div>
                    </div>
                    {oemError ? <div className="geo-err">{oemError}</div> : null}
                  </div>

                  <div className="f-grp">
                    <label>Your Location</label>
                    {isPlacesLoaded && googleMapsApiKey ? (
                      <Autocomplete
                        onLoad={(a) => {
                          autocompleteRef.current = a;
                          setAutocomplete(a);
                        }}
                        onPlaceChanged={() => {
                          setLocationError("");
                          const ac = autocompleteRef.current || autocomplete;
                          if (!ac) return;
                          const place = ac.getPlace();
                          const lat = place?.geometry?.location?.lat?.();
                          const lng = place?.geometry?.location?.lng?.();
                          if (typeof lat === "number" && typeof lng === "number") {
                            setDealerLatitude(lat);
                            setDealerLongitude(lng);
                          }
                          let city = "";
                          let stateName = "";
                          let zip = "";
                          place?.address_components?.forEach((comp: any) => {
                            if (comp.types?.includes("locality")) city = comp.long_name;
                            if (comp.types?.includes("administrative_area_level_1")) stateName = comp.long_name;
                            if (comp.types?.includes("postal_code")) zip = comp.long_name;
                          });
                          const addr = place?.formatted_address || locationSearch;
                          setLocationSearch(addr);
                          setDealerAddress(addr);
                          setDealerCity(city);
                          setDealerGeoStateName(stateName);
                          setDealerZip(zip);
                        }}
                      >
                        <input
                          value={locationSearch}
                          onChange={(e) => {
                            setLocationSearch(e.target.value);
                            setLocationError("");
                          }}
                          placeholder="Search like: Area / Landmark / City"
                          required
                        />
                      </Autocomplete>
                    ) : (
                      <input
                        value={locationSearch}
                        onChange={(e) => {
                          setLocationSearch(e.target.value);
                          setLocationError("");
                        }}
                        placeholder="Search like: Area / Landmark / City"
                        required
                      />
                    )}
                    {locationError ? <div className="geo-err">{locationError}</div> : null}
                  </div>

                  <div className="f-grp">
                    <label>Address</label>
                    <input value={dealerAddress} onChange={(e) => setDealerAddress(e.target.value)} placeholder="Full address" required />
                  </div>

                  <div className="f-grp">
                    <label>Geolocation Data (Auto-filled)</label>
                    <div className="f-row-3">
                      <div className="f-grp">
                        <label>City</label>
                        <input value={dealerCity} readOnly placeholder="Auto-filled" />
                      </div>
                      <div className="f-grp">
                        <label>State</label>
                        <input value={dealerGeoStateName} readOnly placeholder="Auto-filled" />
                      </div>
                      <div className="f-grp">
                        <label>Zip</label>
                        <input value={dealerZip} readOnly placeholder="Auto-filled" />
                      </div>
                    </div>
                    <div className="f-row">
                      <div className="f-grp">
                        <label>Latitude</label>
                        <input value={dealerLatitude !== null ? String(dealerLatitude) : ""} readOnly placeholder="Auto-filled" />
                      </div>
                      <div className="f-grp">
                        <label>Longitude</label>
                        <input value={dealerLongitude !== null ? String(dealerLongitude) : ""} readOnly placeholder="Auto-filled" />
                      </div>
                    </div>
                  </div>

                  <div style={{ height: 1, background: "rgba(13,27,42,.12)", margin: "14px 0" }} />
                  <div style={{ fontWeight: 800, marginBottom: 6, textAlign: "center" }}>*Verification Documents*</div>
                  <div style={{ fontSize: 12, color: "rgba(13,27,42,.7)", marginBottom: 10, textAlign: "center" }}>
                    At least one of the following is required.
                  </div>

                  <div className="f-row">
                    <div className="f-grp">
                      <label>GST No</label>
                      <input
                        value={dealerGstNo}
                        onChange={(e) => {
                          setDealerGstNo(e.target.value);
                          setDocsError("");
                        }}
                        placeholder="GST Number"
                      />
                    </div>
                    <div className="f-grp">
                      <label>GST Certificate Upload</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={async (e) => {
                          setDocsError("");
                          const f = e.target.files?.[0];
                          if (!f) {
                            setDealerGstCertificateUrl("");
                            return;
                          }
                          try {
                            setDealerGstCertificateUrl(await readFileAsDataUrl(f));
                          } catch {
                            setDealerGstCertificateUrl("");
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="f-row">
                    <div className="f-grp">
                      <label>Aadhar No</label>
                      <input
                        value={dealerAadharNumber}
                        onChange={(e) => {
                          setDealerAadharNumber(e.target.value);
                          setDocsError("");
                        }}
                        placeholder="Aadhar Number"
                      />
                    </div>
                    <div className="f-grp">
                      <label>Aadhar Upload</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={async (e) => {
                          setDocsError("");
                          const f = e.target.files?.[0];
                          if (!f) {
                            setDealerAadharCardUrl("");
                            return;
                          }
                          try {
                            setDealerAadharCardUrl(await readFileAsDataUrl(f));
                          } catch {
                            setDealerAadharCardUrl("");
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="f-row-3">
                    <div className="f-grp">
                      <label>Trade Certificate No</label>
                      <input
                        value={dealerTradeCertificateNo}
                        onChange={(e) => {
                          setDealerTradeCertificateNo(e.target.value);
                          setDocsError("");
                        }}
                        placeholder="Trade Certificate Number"
                      />
                    </div>
                    <div className="f-grp">
                      <label>Trade Validity</label>
                      <input
                        value={dealerTradeValidity}
                        onChange={(e) => {
                          setDealerTradeValidity(e.target.value);
                          setDocsError("");
                        }}
                        type="date"
                      />
                    </div>
                    <div className="f-grp">
                      <label>Trade Certificate Upload</label>
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={async (e) => {
                          setDocsError("");
                          const f = e.target.files?.[0];
                          if (!f) {
                            setDealerTradeCertificateUrl("");
                            return;
                          }
                          try {
                            setDealerTradeCertificateUrl(await readFileAsDataUrl(f));
                          } catch {
                            setDealerTradeCertificateUrl("");
                          }
                        }}
                      />
                    </div>
                  </div>
                  {docsError ? <div className="geo-err">{docsError}</div> : null}
                </>
              ) : (
                <div className="f-grp">
                  <label>I am enquiring as a</label>
                  <select value={role} onChange={(e) => setRole(e.target.value)} required>
                    <option value="" disabled>
                      Select your role
                    </option>
                    <option value="State Transport Department — State Inquiry">State Transport Department — State Inquiry</option>
                    <option value="RTO Officer / Authority">RTO Officer / Authority</option>
                    <option value="Reflective Tape Manufacturer — Empanelment">Reflective Tape Manufacturer — Empanelment</option>
                    <option value="Fleet Operator">Fleet Operator</option>
                    <option value="Other Government Body">Other Government Body</option>
                  </select>
                </div>
              )}

              <div className="f-grp">
                <label>{isDealerRegistration ? "Notes / Message" : "Message"}</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us about your requirements..." required />
              </div>

              {submit.isError ? <div style={{ color: "var(--red)", marginBottom: 10, fontSize: 13 }}>Failed to submit. Try again.</div> : null}
              {submittedId ? (
                <div style={{ color: "var(--green)", marginBottom: 10, fontSize: 13 }}>
                  {submittedKind === "dealer" ? (
                    submittedDealerStatus === "EXISTS" ? (
                      "Dealer already exists with this phone. Please login or contact admin."
                    ) : submittedDealerStatus === "PENDING" ? (
                      "Registration request already pending for this phone."
                    ) : submittedDealerStatus === "CREATED" ? (
                      "Registration request submitted successfully."
                    ) : (
                      "Registration request submitted."
                    )
                  ) : (
                    "Enquiry sent successfully."
                  )}
                  {submittedKind === "dealer" && submittedDealerRequestId ? (
                    <div style={{ marginTop: 4, fontSize: 12, color: "rgba(13,27,42,.7)" }}>
                      Request ID: {submittedDealerRequestId}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button type="submit" className="sub-btn" disabled={submit.isPending}>
                <svg viewBox="0 0 24 24">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                </svg>
                {submit.isPending ? "Submitting..." : isDealerRegistration ? "Submit Registration Request" : "Submit Enquiry"}
              </button>
              <p className="f-note">🔒 Confidential — your data is used only to respond to your enquiry.</p>
            </form>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-logo">
              <div className="title">
                <div className="nav-mark" aria-hidden="true" />
                <div>SMARTVAHAN</div>
              </div>
              <p>India’s intelligent QR-based compliance platform — ensuring traceability and enforcement.</p>
              <div className="footer-comp">
                <div className="fcb">
                  <span>✓</span> CMVR 1989 · Rule 104-A to 104-D
                </div>
                <div className="fcb">
                  <span>✓</span> BIS AIS:090:2005 Standard
                </div>
                <div className="fcb">
                  <span>✓</span> Portal Integration Ready
                </div>
              </div>
            </div>
            <div className="footer-col">
              <h4>Platform</h4>
              <div className="footer-links">
                <a href="#about" onClick={onAnchorClick}>
                  About SmartVahan
                </a>
                <a href="#how" onClick={onAnchorClick}>
                  How It Works
                </a>
                <a href="#states" onClick={onAnchorClick}>
                  Onboard States
                </a>
                <a href="#brands" onClick={onAnchorClick}>
                  Empanelled OEMs
                </a>
                <a href="#stats" onClick={onAnchorClick}>
                  Live Stats
                </a>
              </div>
            </div>
            <div className="footer-col">
              <h4>Get Involved</h4>
              <div className="footer-links">
                <a href="#contact" onClick={onAnchorClick}>
                  State Inquiry
                </a>
                <a href="#contact" onClick={onAnchorClick}>
                  Manufacturer Empanelment
                </a>
              </div>
            </div>
            <div className="footer-col">
              <h4>Contact</h4>
              <div className="footer-links">
                {content.contactPhone ? <a href={`tel:${content.contactPhone}`}>{content.contactPhone}</a> : null}
                {content.contactEmail ? <a href={`mailto:${content.contactEmail}`}>{content.contactEmail}</a> : null}
                <a href={content.heroPrimaryCtaHref}>Dashboard</a>
              </div>
            </div>
          </div>
          <div className="footer-bot">
            <p>© {new Date().getFullYear()} SmartVahan. All rights reserved.</p>
            <div className="footer-bot-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Use</a>
              <a href="#">Compliance Notice</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
