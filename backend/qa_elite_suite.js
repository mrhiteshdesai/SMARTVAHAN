"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Configuration
const BASE_URL = 'http://localhost:3000';
const SUPER_ADMIN_PHONE = '8888320669';
const SUPER_ADMIN_PASS = '123456';
const PREFIX = 'QA_AUTO_';
const prisma = new client_1.PrismaClient();
// Reporting Structures
const report = {
    summary: {
        total: 0,
        passed: 0,
        failed: 0,
        duration: 0
    },
    details: [],
    bugs: []
};
// Logger
const LOG = {
    info: (msg) => console.log(`[INFO] ${msg}`),
    success: (msg) => console.log(`[PASS] ${msg}`),
    fail: (msg) => console.error(`[FAIL] ${msg}`),
    warn: (msg) => console.warn(`[WARN] ${msg}`)
};
// Helpers
async function api(method, endpoint, token, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token)
        headers['Authorization'] = `Bearer ${token}`;
    try {
        const res = await fetch(`${BASE_URL}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        const data = await res.json().catch(() => ({}));
        return { status: res.status, ok: res.ok, data };
    }
    catch (e) {
        return { status: 500, ok: false, data: { message: e.message } };
    }
}
async function runTest(module, name, fn) {
    const start = Date.now();
    report.summary.total++;
    try {
        LOG.info(`Testing: ${name}...`);
        await fn();
        report.summary.passed++;
        report.details.push({ module, name, status: 'PASS', duration: Date.now() - start });
        LOG.success(`${name} Passed`);
    }
    catch (e) {
        report.summary.failed++;
        const bugId = `BUG-${Date.now().toString().slice(-6)}`;
        report.details.push({ module, name, status: 'FAIL', error: e.message, bugId });
        report.bugs.push({
            id: bugId,
            module,
            testCase: name,
            severity: 'HIGH', // Default, logic can refine this
            error: e.message,
            timestamp: new Date().toISOString()
        });
        LOG.fail(`${name} Failed: ${e.message}`);
    }
}
async function cleanup() {
    LOG.info('Cleaning up test data...');
    try {
        // Delete in reverse order of dependencies
        await prisma.certificate.deleteMany({ where: { certificateNumber: { startsWith: PREFIX } } });
        // Find QA OEMs to clean their batches
        const qaOems = await prisma.oEM.findMany({ where: { code: { startsWith: PREFIX } } });
        const qaOemCodes = qaOems.map(o => o.code);
        if (qaOemCodes.length > 0) {
            await prisma.qRCode.deleteMany({ where: { batch: { oemCode: { in: qaOemCodes } } } });
            await prisma.batch.deleteMany({ where: { oemCode: { in: qaOemCodes } } });
        }
        // Dealers
        await prisma.dealer.deleteMany({ where: { name: { startsWith: PREFIX } } });
        // RTOs
        await prisma.rTO.deleteMany({ where: { code: { startsWith: PREFIX } } });
        // Users (OEM/State Admins)
        for (const code of qaOemCodes) {
            await prisma.user.deleteMany({ where: { oemCode: code } });
        }
        await prisma.oEM.deleteMany({ where: { code: { startsWith: PREFIX } } });
        const states = await prisma.state.findMany({ where: { code: { startsWith: PREFIX } } });
        for (const s of states) {
            await prisma.user.deleteMany({ where: { stateCode: s.code } });
        }
        await prisma.state.deleteMany({ where: { code: { startsWith: PREFIX } } });
        LOG.success('Cleanup Complete');
    }
    catch (e) {
        LOG.fail(`Cleanup Failed: ${e.message}`);
    }
}
// Main Test Suite
async function main() {
    const startTime = Date.now();
    // Health Check
    LOG.info('Checking Backend Health...');
    try {
        const health = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '0000000000', password: 'dummy' })
        });
        // We expect 401 or 404 or 200, but NOT connection refused
        if (!health.ok && health.status !== 401) {
            throw new Error(`Backend returned unexpected status: ${health.status}`);
        }
        LOG.success('Backend is UP');
    }
    catch (e) {
        LOG.fail(`Backend is DOWN or Unreachable at ${BASE_URL}. Aborting QA run.`);
        LOG.fail(`Error: ${e.message}`);
        LOG.warn('Please start the backend server (npm run start:dev) before running this suite.');
        process.exit(1);
    }
    // Ensure clean state
    await cleanup();
    let superToken = '';
    let stateAdminToken = '';
    let oemAdminToken = '';
    let dealerToken = '';
    // Data Containers
    const testData = {
        stateCode: `${PREFIX}MH`,
        oemCode: `${PREFIX}TATA`,
        rtoCode: `${PREFIX}RTO01`,
        dealerPhone: '9999999999',
        qrBatchId: `${PREFIX}BATCH01`,
        qrValue: ''
    };
    // 1. Auth Module
    await runTest('Auth', 'Super Admin Login', async () => {
        const res = await api('POST', '/api/auth/login', null, { phone: SUPER_ADMIN_PHONE, password: SUPER_ADMIN_PASS });
        if (!res.ok)
            throw new Error(`Login failed: ${res.status}`);
        superToken = res.data.accessToken;
        if (!superToken)
            throw new Error('No access token returned');
    });
    await runTest('Auth', 'Invalid Login Handling', async () => {
        const res = await api('POST', '/api/auth/login', null, { phone: SUPER_ADMIN_PHONE, password: 'wrongpassword' });
        if (res.status !== 401)
            throw new Error(`Expected 401, got ${res.status}`);
    });
    // 2. User Management (State & OEM)
    await runTest('UserMgmt', 'Create State (and State Admin)', async () => {
        const payload = {
            code: testData.stateCode,
            name: `${PREFIX} Maharashtra`,
            username: testData.stateCode, // Phone number for admin
            password: 'password123'
        };
        const res = await api('POST', '/api/states', superToken, payload);
        if (!res.ok)
            throw new Error(`Create State failed: ${JSON.stringify(res.data)}`);
    });
    await runTest('UserMgmt', 'State Admin Login', async () => {
        const res = await api('POST', '/api/auth/login', null, { phone: testData.stateCode, password: 'password123' });
        if (!res.ok)
            throw new Error(`State Admin Login failed: ${JSON.stringify(res.data)}`);
        stateAdminToken = res.data.accessToken;
    });
    await runTest('UserMgmt', 'Create OEM (and OEM Admin)', async () => {
        const payload = {
            code: testData.oemCode,
            name: `${PREFIX} Tata Motors`,
            username: testData.oemCode,
            password: 'password123',
            authorizedStates: [testData.stateCode]
        };
        const res = await api('POST', '/api/oems', superToken, payload);
        if (!res.ok)
            throw new Error(`Create OEM failed: ${JSON.stringify(res.data)}`);
    });
    await runTest('UserMgmt', 'OEM Admin Login', async () => {
        const res = await api('POST', '/api/auth/login', null, { phone: testData.oemCode, password: 'password123' });
        if (!res.ok)
            throw new Error(`OEM Admin Login failed: ${JSON.stringify(res.data)}`);
        oemAdminToken = res.data.accessToken;
    });
    await runTest('UserMgmt', 'Create RTO', async () => {
        const payload = {
            code: testData.rtoCode,
            name: `${PREFIX} Mumbai Central`,
            stateCode: testData.stateCode
        };
        const res = await api('POST', '/api/rtos', superToken, payload);
        if (!res.ok)
            throw new Error(`Create RTO failed: ${JSON.stringify(res.data)}`);
    });
    // 3. Dealer Management
    await runTest('DealerMgmt', 'Create Dealer', async () => {
        const payload = {
            name: `${PREFIX} Auto Dealership`,
            phone: testData.dealerPhone,
            password: 'password123',
            stateCode: testData.stateCode,
            rtoCode: testData.rtoCode,
            oemCodes: [testData.oemCode], // Authorized for our OEM
            address: '123 Test St',
            city: 'Mumbai',
            pincode: '400001',
            status: 'ACTIVE',
            tradeCertificateNo: 'TC123',
            tradeValidity: new Date().toISOString(),
            gstNo: 'GST123'
        };
        const res = await api('POST', '/api/dealers', stateAdminToken, payload); // Created by State Admin
        if (!res.ok)
            throw new Error(`Create Dealer failed: ${JSON.stringify(res.data)}`);
    });
    await runTest('DealerMgmt', 'Dealer Login', async () => {
        const res = await api('POST', '/api/auth/login', null, { phone: testData.dealerPhone, password: 'password123' });
        if (!res.ok)
            throw new Error(`Dealer Login failed: ${JSON.stringify(res.data)}`);
        dealerToken = res.data.accessToken;
    });
    // 4. QR Code Management
    await runTest('QRMgmt', 'Generate QR Batch', async () => {
        const payload = {
            quantity: 5,
            oemCode: testData.oemCode,
            stateCode: testData.stateCode,
            productCode: 'C3',
            batchId: testData.qrBatchId
        };
        // Usually OEM Admin or Super Admin generates QRs. Let's try OEM Admin.
        const res = await api('POST', '/api/qr/generate', oemAdminToken, payload);
        if (!res.ok)
            throw new Error(`Generate QR failed: ${JSON.stringify(res.data)}`);
        // Wait for batch processing (Polling)
        let retries = 0;
        let qr = null;
        while (retries < 30) {
            qr = await prisma.qRCode.findFirst({ where: { batch: { batchId: testData.qrBatchId } } });
            if (qr)
                break;
            // Check if batch failed
            const batch = await prisma.batch.findUnique({ where: { batchId: testData.qrBatchId } });
            if (batch && batch.status === 'FAILED') {
                throw new Error(`Batch processing FAILED. Check server logs.`);
            }
            await new Promise(r => setTimeout(r, 1000)); // Wait 1s
            retries++;
        }
        // Fetch a QR from DB to use
        // const qr = await prisma.qRCode.findFirst({ where: { batch: { batchId: testData.qrBatchId } } });
        if (!qr)
            throw new Error('QR Codes not found in DB after generation (Timeout)');
        testData.qrValue = qr.value;
    });
    // 5. Certificate Generation
    await runTest('CertMgmt', 'Validate QR (Scan)', async () => {
        // Dealer scans QR
        const res = await api('POST', '/api/certificates/validate-qr', dealerToken, { qrValue: testData.qrValue });
        if (!res.ok)
            throw new Error(`Validate QR failed: ${JSON.stringify(res.data)}`);
        if (res.data.data.value !== testData.qrValue)
            throw new Error('QR Value mismatch');
    });
    await runTest('CertMgmt', 'Generate Certificate (Happy Path)', async () => {
        const payload = {
            qrValue: testData.qrValue,
            vehicleDetails: {
                vehicleMake: 'Tata Motors',
                vehicleCategory: 'HMV/HCV',
                fuelType: 'Diesel',
                registrationRto: testData.rtoCode,
                passingRto: testData.rtoCode,
                chassisNo: `CH${Date.now()}`,
                engineNo: `EN${Date.now()}`,
                manufacturingYear: '2023',
                registrationDate: '2023-01-01',
                model: 'Prima'
            },
            ownerDetails: {
                ownerName: 'Test Owner',
                ownerContact: '9876543210',
                ownerEmail: 'test@example.com',
                address: 'Test Address'
            },
            photos: {
                photoFrontLeft: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', // 1x1 pixel
                photoBackRight: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                photoNumberPlate: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                photoRc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
            },
            dealerDetails: {
                name: 'Override Name',
                tradeCertificateNo: 'OverrideTC',
                gstNo: 'OverrideGST',
                tradeValidity: new Date().toISOString()
            }
        };
        const res = await api('POST', '/api/certificates/create', dealerToken, payload);
        if (!res.ok)
            throw new Error(`Certificate Generation failed: ${JSON.stringify(res.data)}`);
    });
    await runTest('CertMgmt', 'Re-use QR (Duplicate Check)', async () => {
        // Try to generate again with same QR
        const payload = {
            qrValue: testData.qrValue,
            vehicleDetails: { /* ... */}, // simplified
            ownerDetails: { /* ... */},
            photos: { /* ... */}
        };
        // Note: Minimal payload might fail validation, but we expect "QR Already Used" error first ideally, 
        // or validation error. But let's reuse the valid payload structure to be sure.
        const fullPayload = {
            qrValue: testData.qrValue,
            vehicleDetails: {
                vehicleMake: 'Tata Motors',
                vehicleCategory: 'HMV/HCV',
                fuelType: 'Diesel',
                registrationRto: testData.rtoCode,
                passingRto: testData.rtoCode,
                chassisNo: `CH${Date.now()}_2`,
                engineNo: `EN${Date.now()}_2`,
                manufacturingYear: '2023',
                registrationDate: '2023-01-01',
                model: 'Prima'
            },
            ownerDetails: {
                ownerName: 'Test Owner 2',
                ownerContact: '9876543210',
                ownerEmail: 'test@example.com',
                address: 'Test Address'
            },
            photos: {
                photoFrontLeft: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                photoBackRight: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                photoNumberPlate: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
                photoRc: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
            }
        };
        const res = await api('POST', '/api/certificates/create', dealerToken, fullPayload);
        if (res.ok)
            throw new Error('Allowed reusing QR code! (Critical Bug)');
        if (res.status !== 400 && res.status !== 409)
            throw new Error(`Expected 400/409, got ${res.status}`);
    });
    // 6. RBAC Negative Tests
    await runTest('RBAC', 'Dealer cannot create OEM', async () => {
        const res = await api('POST', '/api/oems', dealerToken, { code: 'FAIL', name: 'Fail' });
        if (res.ok)
            throw new Error('Dealer was able to create OEM!');
        if (res.status !== 403)
            throw new Error(`Expected 403, got ${res.status}`);
    });
    // 7. Data Consistency
    await runTest('Consistency', 'Verify Certificate in DB', async () => {
        const cert = await prisma.certificate.findFirst({ where: { certificateNumber: { startsWith: PREFIX } } });
        if (!cert)
            throw new Error('Certificate not found in DB');
        // if (cert.status !== 'GENERATED') throw new Error(`Invalid status: ${cert.status}`);
    });
    // Wrap up
    report.summary.duration = Date.now() - startTime;
    // Output Report
    const reportPath = path.join(__dirname, 'qa_report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    LOG.info(`Report saved to ${reportPath}`);
    // Output Markdown
    const mdReport = `
# QA Test Report
**Date:** ${new Date().toISOString()}
**Total Tests:** ${report.summary.total}
**Passed:** ${report.summary.passed}
**Failed:** ${report.summary.failed}
**Duration:** ${report.summary.duration}ms

## Bug Register
| ID | Module | Severity | Error |
|----|--------|----------|-------|
${report.bugs.map((b) => `| ${b.id} | ${b.module} | ${b.severity} | ${b.error} |`).join('\n')}

## Detailed Log
${report.details.map((d) => `- **[${d.status}]** ${d.module}: ${d.name} (${d.error || 'OK'})`).join('\n')}
    `;
    fs.writeFileSync(path.join(__dirname, 'qa_report.md'), mdReport);
    // Cleanup
    await cleanup();
}
main().catch(e => {
    console.error('Fatal Error:', e);
    process.exit(1);
});
