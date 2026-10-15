# Module Registry

SMARTVAHAN V2 — brownfield + tender FRS.

| Module ID | Name | Status | Apps |
|-----------|------|--------|------|
| M01 | Auth & RBAC (`SLD_ADMIN` + OEM auth) | In Progress | backend, frontend |
| M02 | States & RTOs | Planned | frontend, backend |
| M03 | OEM management | Planned | frontend, backend |
| M04 | Dealers & registration | Planned | frontend, backend, **Flutter dealer** |
| M05 | Vehicle catalog (manufacturer/category/product) | Planned | backend, frontend |
| M06 | Batches & manufacturing year / sequences | Planned | backend, frontend |
| M07 | QR codes & regeneration | Planned | backend, frontend, **Flutter scanner** |
| M08 | Certificates | Planned | backend, frontend |
| M09 | Inventory logs | Planned | backend, frontend |
| M10 | System settings & audit | Planned | backend, frontend |
| M11 | Public landing / contact | Planned | landing HTML, backend |
| M12 | Deploy (EC2/IIS) | Planned | scripts |
| M-SLD-01 | SLD OEM & device models | Local Review | backend, frontend |
| M-SLD-01b | Device model TAC/COP/agency/speed + approved vehicle models | Local Review | backend, frontend |
| M-SLD-02 | SLD inventory upload | Local Review | backend, frontend |
| M-SLD-03 | Dealer SLD auth + registration toggles | Local Review | backend, frontend |
| M-SLD-04 | SLD inventory assignment | Local Review | backend, frontend |
| M-SLD-05 | SLD certificate generation | Local Review | backend, Flutter |
| M-SLD-06 | Pending / Vahan / reinstate (+ bulk) | Local Review | backend, frontend |
| M-SLD-06b | SLD public verify | Local Review | backend, frontend |
| M-SLD-07 | Flutter dealer SLD module (home + form + PDF + history) | Local Review | Flutter dealer |
| M-SLD-08 | SLD reports & polish | Local Review | backend, frontend |

## Status values
`Planned` | `In Progress` | `Local Review` | `Changes Requested` | `Approved` | `Done`

## SLD locked decisions
- Separate tables from Reflective/QR
- Serial uniqueness **per SLD OEM** (always stored UPPERCASE)
- CSV: one column, header optional; serials normalized UPPERCASE
- **NEW fitment:** inventory only (AVAILABLE → ASSIGNED → USED). Dealer uses ASSIGNED; admin test may consume AVAILABLE
- **RENEWAL:** no inventory assign. Only USED (fitted) serials or legacy (not in inventory). AVAILABLE/ASSIGNED cannot be renewed
- Legacy serials: `isLegacy=true`, print-only; reinstate must NOT ASSIGN into stock
- Credits: dealer renewal debits 1; admin renewal no debit; reinstate refunds only if `renewalCreditCharged`
- Cert `dealerId` nullable for admin test certs
- Validity: validFrom = generatedAt, validTo = +1 year; PDF titles New SLD Fitment / SLD Fitment Renewal
- Reinstate NEW inventory: serial → ASSIGNED (dealer) or AVAILABLE (admin/no dealer)
- Public verify: kind badges New Fitment / Renewed + validity dates
- SLD OEMs state-scoped (`authorizedStates`) for NEW OEM auth
- New dealer registration: Reflective/SLD toggles
- Public verify required; WebSocket deferred (polling)
- Prefill renewal from prior SmartVahan cert (editable); empty if none
- **ADMIN** SLD OEMs page is view-only; full SLD OEM CRUD = **SUPER_ADMIN** only
- **SLD_ADMIN** role: SLD dashboard + SLD Certificates (Vahan/reinstate) scoped to assigned SLD OEMs (`User.authorizedSldOems`)
