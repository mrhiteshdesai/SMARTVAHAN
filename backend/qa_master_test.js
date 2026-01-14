const BASE_URL = 'http://localhost:3000';
const SUPER_ADMIN = {
    phone: '8888320669',
    password: '123456'
};

const COLORS = {
    RED: '\x1b[31m',
    GREEN: '\x1b[32m',
    YELLOW: '\x1b[33m',
    BLUE: '\x1b[34m',
    RESET: '\x1b[0m'
};

const LOG = {
    info: (msg) => console.log(`${COLORS.BLUE}[INFO]${COLORS.RESET} ${msg}`),
    success: (msg) => console.log(`${COLORS.GREEN}[PASS]${COLORS.RESET} ${msg}`),
    fail: (msg) => console.log(`${COLORS.RED}[FAIL]${COLORS.RESET} ${msg}`),
    warn: (msg) => console.log(`${COLORS.YELLOW}[WARN]${COLORS.RESET} ${msg}`)
};

async function login(phone, password) {
    try {
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Login failed');
        return data.accessToken;
    } catch (e) {
        LOG.fail(`Login failed for ${phone}: ${e.message}`);
        return null;
    }
}

async function runTest(name, fn) {
    LOG.info(`Running Test: ${name}...`);
    try {
        await fn();
    } catch (e) {
        LOG.fail(`Test ${name} crashed: ${e.message}`);
    }
    console.log('-'.repeat(50));
}

async function main() {
    LOG.info('Starting QA Master Test Suite...');
    
    // 1. Auth Test
    let token = null;
    await runTest('Authentication', async () => {
        token = await login(SUPER_ADMIN.phone, SUPER_ADMIN.password);
        if (token) {
            LOG.success('Super Admin Login Successful');
        } else {
            throw new Error('Cannot proceed without token');
        }

        // Test Invalid Login
        const invalidToken = await login('0000000000', 'wrongpass');
        if (!invalidToken) {
            LOG.success('Invalid Login Rejected Correctly');
        } else {
            LOG.fail('Invalid Login Accepted! (Security Risk)');
        }
    });

    if (!token) return;

    const headers = { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
    };

    // 2. State Management Test
    const testStateCode = `QA_MH_${Date.now()}`;
    await runTest('State Management', async () => {
        // Create State
        const createRes = await fetch(`${BASE_URL}/api/states`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                code: testStateCode,
                name: 'QA Test Maharashtra',
                password: 'password123'
            })
        });
        
        if (createRes.ok) {
            LOG.success(`State ${testStateCode} created`);
        } else {
            const err = await createRes.json();
            LOG.fail(`Create State failed: ${JSON.stringify(err)}`);
        }

        // Duplicate State Check
        const dupRes = await fetch(`${BASE_URL}/api/states`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                code: testStateCode,
                name: 'QA Test Maharashtra'
            })
        });
        if (dupRes.status === 409 || !dupRes.ok) {
             LOG.success('Duplicate State creation prevented');
        } else {
             LOG.fail('Duplicate State creation ALLOWED (Data Integrity Risk)');
        }
    });

    // 3. OEM Management Test
    const testOemCode = `QA_OEM_${Date.now()}`;
    let oemId = null;
    await runTest('OEM Management', async () => {
        const createRes = await fetch(`${BASE_URL}/api/oems`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                code: testOemCode,
                name: 'QA Test Motors',
                logo: 'https://example.com/logo.png',
                copDocument: 'doc.pdf',
                copValidity: new Date().toISOString(),
                authorizedStates: [testStateCode]
            })
        });

        if (createRes.ok) {
            const data = await createRes.json();
            oemId = data.id;
            LOG.success(`OEM ${testOemCode} created with ID: ${oemId}`);
        } else {
            const err = await createRes.json();
            LOG.fail(`Create OEM failed: ${JSON.stringify(err)}`);
        }

        // Test Invalid OEM (Missing Name)
        const invalidRes = await fetch(`${BASE_URL}/api/oems`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ code: 'INVALID_OEM' })
        });
        if (!invalidRes.ok) {
            LOG.success('Invalid OEM creation rejected');
        } else {
            LOG.fail('Invalid OEM creation ALLOWED (Validation Missing)');
        }
    });

    // 3.5 RTO Management Test
    const testRtoCode = `QA_MH_${Date.now().toString().slice(-4)}`;
    await runTest('RTO Management', async () => {
        const createRes = await fetch(`${BASE_URL}/api/rtos`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                code: testRtoCode,
                name: 'QA Test RTO',
                stateCode: testStateCode
            })
        });

        if (createRes.ok) {
            LOG.success(`RTO ${testRtoCode} created`);
        } else {
            const err = await createRes.json();
            LOG.fail(`Create RTO failed: ${JSON.stringify(err)}`);
        }
    });

    // 4. Dealer Management Test
    await runTest('Dealer Management', async () => {
        const dealerPhone = `99${Date.now().toString().slice(-8)}`;
        const createRes = await fetch(`${BASE_URL}/api/dealers`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: 'QA Test Dealer',
                phone: dealerPhone,
                password: 'password123',
                stateCode: testStateCode,
                oemIds: [oemId], // Assuming array based on earlier updates, or single ID if not updated
                address: '123 Test St',
                city: 'Test City',
                pincode: '400001',
                rtoCode: testRtoCode // Use created RTO
            })
        });

        if (createRes.ok) {
            LOG.success(`Dealer created with phone: ${dealerPhone}`);
        } else {
            const err = await createRes.json();
            LOG.warn(`Create Dealer response: ${createRes.status} - ${JSON.stringify(err)}`);
        }
    });

    // 5. QR Generation Security Test
    await runTest('QR Generation Security', async () => {
        // Attempt to generate QR with negative quantity
        const payload = {
            stateCode: testStateCode,
            oemCode: testOemCode,
            productCode: 'C3',
            quantity: -5
        };
        const res = await fetch(`${BASE_URL}/api/qr/generate`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });
        
        if (!res.ok) {
            LOG.success('Negative quantity rejected');
        } else {
            LOG.fail('Negative quantity ACCEPTED (Critical Logic Bug)');
        }
    });

    // 6. Concurrency Test (Dealer Creation)
    await runTest('Concurrency Stress Test', async () => {
        const promises = [];
        for (let i = 0; i < 5; i++) {
            const p = `88${Date.now().toString().slice(-6)}${i.toString().padStart(2, '0')}`;
            promises.push(fetch(`${BASE_URL}/api/dealers`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: `Concurrent Dealer ${i}`,
                    phone: p,
                    password: 'pass',
                    stateCode: testStateCode,
                    // Minimal payload to test DB locking
                })
            }));
        }
        
        const results = await Promise.all(promises);
        const successCount = results.filter(r => r.ok).length;
        LOG.info(`Concurrency Results: ${successCount}/5 requests succeeded (Note: might fail due to validation, checking server stability)`);
    });

    LOG.info('QA Suite Completed.');
}

main();
