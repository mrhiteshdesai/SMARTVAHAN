# SMARTVAHAN V2 — Combined SRS / FRS / NFR

| Field | Value |
|-------|-------|
| **Document** | Software Requirements Specification + Functional Requirements Specification + Non-Functional Requirements |
| **Project** | SMARTVAHAN V2 (SmartVahan) |
| **Type** | Civic / vehicle compliance (GovTech-adjacent) — Reflective Tape (RRT) + Speed Limiting Device (SLD) |
| **Version** | 1.0 (Working — requirements **IN_PROGRESS**, not frozen) |
| **Date** | 2026-10-15 |
| **Working copy** | `C:\Projects\SMARTVAHAN-V2` |
| **Sources** | Tender FRS v1.1 / Explanatory v1.2 (`docs/02-requirements/`), `tech-requirements.pdf`, Prisma schema, Shared Memory, as-built product |

> **Status note:** Tender FRS describes the **authority-compliant target state**. Sections marked **[AS-BUILT]** describe what SMARTVAHAN V2 currently implements. Sections marked **[TENDER / GAP]** are tender-required but not fully delivered yet. Use this document for review; freeze via `/freeze-requirements` when approved.

---

# Part A — Software Requirements Specification (SRS)

## A1. Purpose

Provide a centralized MIS to:

1. Manage **retro-reflective tape (RRT)** inventory, QR lifecycle, dealer fitment, and QR-enabled certificates.
2. Manage **Speed Limiting Device (SLD)** OEM masters, serial inventory, dealer fitment/renewal certificates, Vahan PDF workflow, and public verification.
3. Serve multi-party stakeholders (Authority admins, OEMs, dealers, public) via web admin, Flutter dealer app, and public QR/SLD verify.

## A2. Objectives

- Transparent digital certification and inventory for reflective tape fitment.
- Secure QR-based certificates with public verification.
- Dealer field operations (scan → capture → certificate) on mobile.
- SLD NEW fitment and RECALIBRATION/RENEWAL certificates with OEM-scoped administration.
- Dashboards, reports, audit trail for governance and operational oversight.
- Align toward tender: VAHAN integration, OTP, wallet, complaints, SLA (phased).

## A3. In scope

| Surface | Scope |
|---------|--------|
| **MIS Admin Console (Web)** | React + Vite admin at `/control` — masters, Reflective MIS, SLD MIS, reports, users, settings |
| **Dealer App (Flutter)** | Reflective + SLD certificate flows, inventory awareness, history |
| **Public Scanner (Flutter)** | Public QR verification |
| **Public Web** | Landing, dealer registration, `/verify`, `/verify-sld` |
| **API** | NestJS + Prisma + PostgreSQL; optional S3 for files |

## A4. Out of scope (current / deferred)

- Ghost Mode operational details (special Ghost Admin path exists; excluded from tender target narrative).
- Full **VAHAN live API** inbound/outbound (manual Vahan PDF upload used for SLD completion today).
- **AI photo validation**, **OTP-to-owner**, **digital wallet / settlement**, **helpdesk/complaints SLA**, **remote slot booking** — tender target; not complete in as-built.
- DOOH / surveillance / media modules (not applicable).

## A5. Stakeholders & actors

| Actor | Description |
|-------|-------------|
| Super Admin | Full system configuration, masters, SLD OEM CRUD, system users |
| Admin | Broad Reflective + SLD ops; SLD OEMs **view-only** |
| SLD Admin | SLD dashboard + SLD certificates for **authorized SLD OEMs only** |
| State Admin | State-scoped monitoring / reports |
| OEM Admin | Reflective OEM-scoped stock / reports |
| Sub Admin | Limited Reflective ops |
| Ghost Admin | Ghost dashboard / Ghost QR (isolated mode) |
| Dealer User | Field fitment (Reflective and/or SLD per OEM authorization) |
| Public / Vehicle Owner | Verify certificates; dealer self-registration request |
| Auditor (tender) | Read-only audit — **[TENDER / GAP]** as dedicated role |

## A6. System context (as-built)

```
[Admin Web] ──┐
[Dealer App] ─┼──► [NestJS API] ──► [PostgreSQL]
[Scanner App]─┤         │
[Public Web] ─┘         ├──► [Local uploads / S3]
                        └──► [Future: VAHAN / SMS / Wallet]
```

## A7. Technology stack

| Layer | Stack |
|-------|--------|
| Admin web | React, Vite, TypeScript, Tailwind |
| Backend | NestJS, Prisma, PostgreSQL |
| Mobile | Flutter (`smartvahan_dealer_app`, `smartscanner_app`) |
| Deploy | EC2 / IIS (`web.config`), deploy scripts |
| Auth | JWT + role guards |

## A8. Domain modules (logical)

| ID | Module |
|----|--------|
| M01 | Auth & RBAC (incl. `SLD_ADMIN` + OEM auth) |
| M02 | States & RTOs |
| M03 | Reflective OEM management |
| M04 | Dealers & registration |
| M05 | Vehicle catalog |
| M06 | Batches / sequences / manufacturing year |
| M07 | QR codes & regeneration |
| M08 | Reflective certificates |
| M09 | Reflective inventory logs |
| M10 | Settings & audit |
| M11 | Public landing / contact |
| M12 | Deploy |
| M-SLD-01…08 | SLD OEMs, models, inventory, certificates, verify, reports, Flutter |

## A9. Key data entities (summary)

User, State, RTO, OEM, Dealer, DealerRegistrationRequest, Product/Batch/QRCode/Certificate, InventoryLog, AuditLog, SystemSettings;  
SldOem, SldDeviceModel, SldApprovedVehicleModel, SldDeviceSerial, SldCertificate, SldRenewalCreditLog.

---

# Part B — Functional Requirements Specification (FRS)

## B1. Authentication & session **[AS-BUILT + TENDER]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-AUTH-01 | Secure login (phone + password) for system users and dealers | As-built |
| FR-AUTH-02 | JWT session; role returned in token/profile | As-built |
| FR-AUTH-03 | Account ACTIVE/INACTIVE gate on login | As-built |
| FR-AUTH-04 | CAPTCHA on public forms | Tender / partial |
| FR-AUTH-05 | MFA for privileged roles | Tender / gap |
| FR-AUTH-06 | Lockout on repeated failures | Tender / gap |

## B2. RBAC **[AS-BUILT]**

| Role | Primary access (as-built) |
|------|---------------------------|
| **SUPER_ADMIN** | Full Reflective + full SLD (OEM CRUD) + System Users + Settings |
| **ADMIN** | Reflective ops (QR Generator view-only; Inventory, Cert Generator, Search, Download); SLD Inventory + Certificates full; SLD OEMs **view-only**; Dealers; Reports |
| **SLD_ADMIN** | SLD Dashboard + SLD Certificates (view/download + Vahan upload + reinstate/bulk) **only for assigned SLD OEMs**; no Reflective |
| **STATE_ADMIN** | State-scoped reports / monitoring |
| **OEM_ADMIN** | Reflective OEM-scoped inventory / reports |
| **SUB_ADMIN** | Limited Reflective admin |
| **GHOST_ADMIN** | Ghost mode QR / dashboard only |
| **DEALER_USER** | Reflective and/or SLD per `oems` / `sldOems`; Reflective Cert Generator **not** available; SLD certs view/download only (no Vahan/reinstate) |

| ID | Requirement | Status |
|----|-------------|--------|
| FR-RBAC-01 | Enforce roles on UI sidebar and API `@Roles` | As-built |
| FR-RBAC-02 | Dealer Reflective vs SLD gated by OEM authorization | As-built |
| FR-RBAC-03 | SLD Admin OEM authorization via `User.authorizedSldOems` | As-built |
| FR-RBAC-04 | Granular permission matrix + multi-role per user | Tender / gap |
| FR-RBAC-05 | Real-time permission change without user recreate | Partial (JWT refresh / re-login) |

## B3. Master data **[AS-BUILT]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-MSTR-01 | State master (code, name, homepage flag) | As-built |
| FR-MSTR-02 | RTO master (incl. passing RTO flags) | As-built |
| FR-MSTR-03 | Reflective OEM master (authorized states, COP, logo) | As-built |
| FR-MSTR-04 | Dealer master (state, RTO, geo radius, Reflective + SLD OEM maps, renewal credits) | As-built |
| FR-MSTR-05 | Vehicle category / manufacturer / product masters | As-built |
| FR-MSTR-06 | System settings (branding, mobile APK/store URL, etc.) | As-built |
| FR-MSTR-07 | Public dealer registration request → approve/reject | As-built |

## B4. Reflective QR management **[AS-BUILT + TENDER]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-QR-01 | Controlled batch QR generation (state, OEM, product, year) | As-built (Super Admin / Ghost; Admin cannot generate) |
| FR-QR-02 | QR search by serial / value / batch | As-built |
| FR-QR-03 | Inventory lifecycle and assignment to dealers | As-built |
| FR-QR-04 | Public / app QR verification | As-built |
| FR-QR-05 | Cryptographic authenticity token in QR payload (tender fields) | Tender / evolve |
| FR-QR-06 | OEM API feed ingest of QR inventory | Tender / gap |
| FR-QR-07 | Ghost QR regenerate / management | As-built (Ghost Admin) |

## B5. Reflective inventory & allocation **[AS-BUILT]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-INV-01 | QR inventory listing, filters, download | As-built |
| FR-INV-02 | Assign / transfer stock to dealers | As-built |
| FR-INV-03 | Inventory logs / movement history | As-built |
| FR-INV-04 | Real-time stock ledger + OEM feed reconcile | Tender / partial |
| FR-INV-05 | Damaged / write-off / replacement workflows | Tender / gap |

## B6. Reflective fitment & certificates **[AS-BUILT + TENDER]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-FIT-01 | Scan/validate QR; confirm available for dealer | As-built (admin web + Flutter) |
| FR-FIT-02 | Capture vehicle / RTO / photos / location | As-built |
| FR-FIT-03 | Generate certificate PDF with QR + verify link | As-built |
| FR-FIT-04 | Debit inventory on successful issuance | As-built |
| FR-FIT-05 | Search certificates; download data | As-built |
| FR-FIT-06 | Fetch vehicle details from VAHAN | Tender / gap |
| FR-FIT-07 | OTP to owner mobile before issuance | Tender / gap |
| FR-FIT-08 | AI photo validation | Tender / gap |
| FR-FIT-09 | Push fitment status to VAHAN | Tender / gap |
| FR-FIT-10 | Remote application + slot booking | Tender / gap |
| FR-FIT-11 | Dealers do **not** use Reflective Certificate Generator in admin web | As-built (product rule) |

## B7. SLD module **[AS-BUILT — product extension beyond tender RRT FRS]**

### B7.1 SLD OEMs & models

| ID | Requirement | Status |
|----|-------------|--------|
| FR-SLD-OEM-01 | CRUD SLD OEMs (code, name, authorized states) — **SUPER_ADMIN only** | As-built |
| FR-SLD-OEM-02 | ADMIN may **view** SLD OEMs/models/variants only | As-built |
| FR-SLD-OEM-03 | Device models: type FUEL / CABLE / FLY_BY_WIRE; TAC or COP by agency | As-built |
| FR-SLD-OEM-04 | Approved vehicle variants (make, model, setSpeedKmph, testReportNo); Excel import | As-built |

### B7.2 SLD inventory

| ID | Requirement | Status |
|----|-------------|--------|
| FR-SLD-INV-01 | Serial uniqueness **per SLD OEM**; stored UPPERCASE | As-built |
| FR-SLD-INV-02 | CSV upload → AVAILABLE | As-built |
| FR-SLD-INV-03 | Assign to dealer (manual + CSV) → ASSIGNED | As-built |
| FR-SLD-INV-04 | Statuses: AVAILABLE → ASSIGNED → USED; dealer forward between dealers | As-built |
| FR-SLD-INV-05 | Legacy serials (`isLegacy`) for renewal only — not stocked as AVAILABLE | As-built |

### B7.3 SLD certificates

| ID | Requirement | Status |
|----|-------------|--------|
| FR-SLD-CERT-01 | **NEW** fitment: consume ASSIGNED (dealer) or AVAILABLE (admin test); PDF “New SLD Fitment” | As-built |
| FR-SLD-CERT-02 | **RENEWAL / RECALIBRATION**: USED or legacy serial; renewal credit debit for dealers | As-built |
| FR-SLD-CERT-03 | Validity: validFrom = generatedAt; validTo = +1 year | As-built |
| FR-SLD-CERT-04 | Status PENDING until Vahan PDF uploaded → COMPLETED | As-built |
| FR-SLD-CERT-05 | Reinstate (single + bulk CSV): delete cert, refund credit if charged, restore serial policy | As-built |
| FR-SLD-CERT-06 | Public verify `/verify-sld` | As-built |
| FR-SLD-CERT-07 | Dealer: generate via Flutter; admin web SLD Certificates = view/download only | As-built |
| FR-SLD-CERT-08 | SUPER_ADMIN / ADMIN / SLD_ADMIN: Vahan upload + reinstate (SLD_ADMIN OEM-scoped) | As-built |

### B7.4 SLD Admin OEM scope

| ID | Requirement | Status |
|----|-------------|--------|
| FR-SLD-ADM-01 | Create System User role `SLD_ADMIN` with one or more SLD OEMs | As-built |
| FR-SLD-ADM-02 | If OEMs A,B assigned → cert ops only for A,B; select all → all OEMs | As-built |
| FR-SLD-ADM-03 | SLD dashboard stats filtered to authorized OEMs | As-built |

## B8. Payments & wallet **[TENDER / GAP]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-WAL-01…04 | OEM wallet recharge, per-cert deduction, settlement, statements | Gap |

## B9. Complaints & helpdesk **[TENDER / GAP]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-CMP-01…04 | Ticket lifecycle, SLA, escalation, OEM sync | Gap |

## B10. Dashboards & reports **[AS-BUILT + TENDER]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-RPT-01 | Reflective dashboard (filters, trends, heatmap) | As-built |
| FR-RPT-02 | SLD dashboard (pending Vahan queue, OEM/dealer performance) | As-built |
| FR-RPT-03 | Ref. reports: State, OEM, Reg RTO, Passing RTO, Dealer | As-built |
| FR-RPT-04 | SLD reports: State, OEM, Dealer | As-built |
| FR-RPT-05 | Export Excel/PDF/Word authority formats; wallet & complaint reports | Partial / tender gap |

## B11. Audit & evidence **[AS-BUILT + TENDER]**

| ID | Requirement | Status |
|----|-------------|--------|
| FR-AUD-01 | Audit log for privileged actions (create user, SLD OEM, Vahan upload, reinstate, etc.) | As-built |
| FR-AUD-02 | Searchable audit UI for authorized roles | As-built (Super/Admin) |
| FR-AUD-03 | Configurable retention / archival | Tender / gap |
| FR-DOC-01 | Store photos & PDFs with access control | As-built (uploads/S3) |

## B12. Integrations **[MIXED]**

| ID | Integration | Status |
|----|-------------|--------|
| FR-INT-01 | VAHAN inbound vehicle fetch | Gap |
| FR-INT-02 | VAHAN outbound fitment publish | Gap (SLD uses manual Vahan PDF) |
| FR-INT-03 | OEM QR feed API | Gap |
| FR-INT-04 | OEM complaint API | Gap |
| FR-INT-05 | SMS gateway (OTP / download link) | Gap / partial |
| FR-INT-06 | Payment/wallet provider | Gap |
| FR-INT-07 | Mobile APK rollout URL in settings | As-built |

---

# Part C — Non-Functional Requirements (NFR)

## C1. Security

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-SEC-01 | HTTPS / TLS in production; secure headers | Target / deploy |
| NFR-SEC-02 | No hardcoded secrets; env-based JWT/DB/S3 keys | As-built pattern |
| NFR-SEC-03 | RBAC on API and UI | As-built |
| NFR-SEC-04 | Password hashing (bcrypt) | As-built |
| NFR-SEC-05 | OWASP input validation, rate limit OTP | Partial / tender |
| NFR-SEC-06 | Ghost mode isolation (Ghost Admin only) | As-built |

## C2. Compliance (GovTech)

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-CMP-01 | DPDP — dealer/user PII handling | Planned |
| NFR-CMP-02 | CERT-In / STQC audit readiness | Planned |
| NFR-CMP-03 | GIGW 3.0 / WCAG for public verify UX | Planned |
| NFR-CMP-04 | Tender compliance matrix review | Planned |

## C3. Performance & scalability

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-PERF-01 | Responsive admin UI (desktop + tablet) | As-built |
| NFR-PERF-02 | Indexed DB queries; pagination on large lists | As-built (partial) |
| NFR-PERF-03 | Caching for hot reads | Target |
| NFR-PERF-04 | Concurrent certificate generation under dealer load | Target |

## C4. Availability, backup & DR

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-DR-01 | Automated DB + file backups; restore drills | Target / ops |
| NFR-DR-02 | Defined RPO/RTO for production | Target |
| NFR-OPS-01 | Monitoring, centralized logs, alerting | Target |

## C5. Environments & quality

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-ENV-01 | Separate Dev / Test / Staging / Prod | Target |
| NFR-ENV-02 | No testing on prod; mask PII in lower envs | Target |
| NFR-ENV-03 | Module-wise local review (G-LOCAL) delivery | As-built process |
| NFR-MOB-01 | Enforce mobile app version for certificate APIs when configured | As-built |

## C6. Usability

| ID | Requirement | Status |
|----|-------------|--------|
| NFR-UX-01 | Role-appropriate menus (hide unauthorized modules) | As-built |
| NFR-UX-02 | Dealer Flutter flows for Reflective + SLD | As-built |
| NFR-UX-03 | Clear pending vs completed SLD cert queue for admins | As-built |

---

# Part D — Traceability (Tender ↔ Product)

| Tender theme | FRS / product coverage |
|--------------|------------------------|
| Users / Auth / RBAC | Part B1–B2; roles extended with SLD_ADMIN |
| QR + verification | Part B4; Reflective verify + SLD verify |
| Inventory + fitment | Part B5–B6; SLD B7 |
| VAHAN + OTP | Mostly gap; SLD Vahan PDF workflow as interim |
| Wallet / settlement | Gap |
| SMS / owner self-service | Gap / partial |
| Helpdesk / SLA | Gap |
| Dashboards / reports | Part B10 |
| Security / DR / envs | Part C |

---

# Part E — Acceptance highlights (as-built product rules)

1. **ADMIN** cannot create/edit SLD OEMs — Super Admin only.  
2. **Dealers** have no Reflective Certificate Generator; SLD Certificates = view/download only.  
3. **SLD_ADMIN** = SLD dashboard + full cert ops on assigned OEMs only.  
4. SLD serials UPPERCASE; unique per OEM; NEW vs RENEWAL rules as in Shared Memory.  
5. Requirements remain **IN_PROGRESS** until formal freeze after stakeholder sign-off.

---

# Document control

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2026-10-15 | SMARTVAHAN V2 team (working extract) | Combined SRS+FRS+NFR from tender FRS + as-built codebase |

**Next step:** Stakeholder review → revise gaps → `/freeze-requirements` → update `AGENTS.md` Requirements status to **FROZEN**.

---

*Also saved under project: `docs/02-requirements/SMARTVAHAN-V2_Combined_SRS_FRS_NFR.md` (if copied).*
