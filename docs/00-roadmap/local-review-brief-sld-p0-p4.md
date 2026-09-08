# Local Review Brief — SLD P0–P4

## Scope delivered
- **P0** Shared memory + SLD sidebar section
- **P1** SLD OEM + Device Models (state-authorized)
- **P2** Inventory CSV upload + searchable table
- **P3** Dealer Reflective/SLD OEM auth + new registration toggles
- **P4** Manual + CSV assignment to dealers

## How to test (local)

1. Login as Super Admin (`8888320669` / `123456`) at `/control/login`
2. Sidebar → **SLD → SLD OEMs**
   - Create an SLD OEM with authorized states
   - Add one or more device models under it
3. **SLD → SLD Inventory**
   - Upload CSV (one serial per line) for OEM + Model
   - Confirm rows appear as `AVAILABLE`
4. **User Management → Dealers**
   - Confirm labels: Authorised Reflective OEMs / Authorised SLD OEMs
   - Assign SLD OEM(s) to a dealer in a matching state
5. Inventory → **Assign to Dealer**
   - Manual select serials OR CSV assign
   - Confirm status becomes `ASSIGNED` and dealer is set
6. Public `/dealer-registration`
   - Toggle Reflective / SLD
   - OEM lists filter by state and toggle
   - Submit and approve from Dealers pending table (both OEM lists)

## Not in this release
- P5 certificate generation
- P6 pending/Vahan/reinstate
- P6b public verify
- P7 Flutter SLD
- P8 reports

## G-LOCAL
Please review locally and reply with approvals or:
`Module M-SLD-0x — changes requested: ...`
