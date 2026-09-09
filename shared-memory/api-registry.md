# API Registry

| Method | Path | Module | Description | Auth |
|--------|------|--------|-------------|------|
| GET | /api/sld/oems | SLD | List SLD OEMs + models | JWT |
| POST | /api/sld/oems | SLD | Create SLD OEM | SUPER_ADMIN/ADMIN |
| PATCH | /api/sld/oems/:id | SLD | Update SLD OEM | SUPER_ADMIN/ADMIN |
| DELETE | /api/sld/oems/:id | SLD | Delete SLD OEM | SUPER_ADMIN |
| POST | /api/sld/oems/:id/import-variant-list | SLD | Import STANDARD VARIANT LIST rows (models + speed variants) | SUPER_ADMIN/ADMIN |
| GET | /api/sld/models | SLD | List models (?sldOemId) | JWT |
| POST | /api/sld/models | SLD | Create model | SUPER_ADMIN/ADMIN |
| PATCH | /api/sld/models/:id | SLD | Update model | SUPER_ADMIN/ADMIN |
| DELETE | /api/sld/models/:id | SLD | Delete model | SUPER_ADMIN |
| POST | /api/sld/inventory/upload | SLD | CSV inventory upload | SUPER_ADMIN/ADMIN |
| GET | /api/sld/inventory | SLD | Search/filter inventory | SUPER_ADMIN/ADMIN |
| GET | /api/sld/inventory/available | SLD | Available serials for assign | SUPER_ADMIN/ADMIN |
| POST | /api/sld/inventory/assign | SLD | Manual assign to dealer | SUPER_ADMIN/ADMIN |
| POST | /api/sld/inventory/assign-csv | SLD | CSV assign to dealer | SUPER_ADMIN/ADMIN |
| GET | /api/sld/models/:id/vehicle-models | SLD | List approved vehicle models | JWT |
| POST | /api/sld/models/:id/vehicle-models | SLD | Add one approved vehicle model | SUPER_ADMIN/ADMIN |
| POST | /api/sld/models/:id/vehicle-models/upload | SLD | CSV upload approved vehicle models | SUPER_ADMIN/ADMIN |
| DELETE | /api/sld/vehicle-models/:id | SLD | Delete approved vehicle model | SUPER_ADMIN/ADMIN |
| POST | /api/public/dealer-registration | Dealers | Public registration (+ Reflective/SLD toggles) | Public |
| GET | /api/sld/dealer/bootstrap | SLD | Dealer SLD OEMs/models + assigned counts | JWT (dealer) |
| GET | /api/sld/dealer/serials | SLD | Assigned serials for OEM/model | JWT (dealer) |
| GET | /api/sld/dealer/certificates | SLD | Dealer SLD cert history | JWT (dealer) |
| POST | /api/sld/certificates | SLD | Create SLD cert + PDF (PENDING) | JWT (dealer/admin) |

Canonical OpenAPI: `docs/04-api/openapi.yaml`
