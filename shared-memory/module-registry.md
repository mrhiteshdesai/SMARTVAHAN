# Module Registry

SMARTVAHAN V2 — brownfield + tender FRS.

| Module ID | Name | Status | Apps |
|-----------|------|--------|------|
| M01 | Auth & RBAC | Planned | backend, frontend |
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
- Serial uniqueness per SLD OEM
- CSV: one column, header optional
- Reinstate: delete cert + files; serial → ASSIGNED same dealer
- SLD OEMs state-scoped (`authorizedStates`)
- New dealer registration: Reflective/SLD toggles
- Public verify required; WebSocket deferred (polling)
