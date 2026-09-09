# Entity Dictionary

Source: `backend/prisma/schema.prisma` (SMARTVAHAN V2)

| Entity | Description | Module | PII |
|--------|-------------|--------|-----|
| User | System users | Auth | Yes |
| State | States | Master data | No |
| RTO | RTO offices | Master data | No |
| OEM | Reflective tape OEMs | OEM | Partial |
| Dealer | Dealers (reflective + SLD OEM auth) | Dealers | Yes |
| DealerRegistrationRequest | Dealer onboarding (+ Reflective/SLD toggles) | Dealers | Yes |
| VehicleManufacturer | Manufacturers | Catalog | No |
| VehicleCategory | Categories | Catalog | No |
| Product | Products | Catalog | No |
| Batch | Production batches | Manufacturing | No |
| QRCode | QR codes | QR | No |
| Certificate | Reflective certificates | Certificates | Yes |
| QRRegenerationRun / QRRegeneration | QR regen | QR | No |
| Sequence | Sequences | Manufacturing | No |
| ManufacturingYear | Years | Catalog | No |
| SystemSettings | Settings | Settings | No |
| ContactSubmission | Contact form | Public | Yes |
| AuditLog | Audit | Security | Partial |
| InventoryLog | Reflective inventory movements | Inventory | No |
| SldOem | SLD OEMs (state-authorized) | SLD | Partial |
| SldDeviceModel | SLD device models (type FUEL/CABLE, TAC or COP by agency) | SLD | No |
| SldApprovedVehicleModel | Vehicle variants per device model (make, model, **setSpeedKmph**, testReportNo) | SLD | No |
| SldDeviceSerial | Per-device serial inventory | SLD | No |
| SldCertificate | SLD fitment cert; snapshots setSpeedKmph + testReportNo | SLD | No |
| SldCertificate | SLD installation certificates (cert no: SLD+OEMCODE+VEHICLENO) | SLD | Yes |
