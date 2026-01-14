const BASE_URL = 'http://localhost:3000/api/qr/generate';

async function testValidation(name, payload, expectedStatus) {
  try {
    const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    const statusMatch = res.status === expectedStatus;
    const result = statusMatch ? 'PASS' : 'FAIL';
    console.log(`[${name}] ${result} - Status: ${res.status} (Expected: ${expectedStatus})`);
    if (!statusMatch) console.log('Response:', JSON.stringify(data).substring(0, 100));
  } catch (e) {
      console.log(`[${name}] Error:`, e.message);
  }
}

async function runTests() {
  console.log('--- Verifying Bug Fixes ---');

  // 1. Negative Quantity (Should be 400)
  await testValidation('Negative Qty', {
    stateCode: 'MH', oemCode: 'ORF', productCode: 'C3', quantity: -5
  }, 400);

  // 2. Huge Quantity (Should be 400 now)
  await testValidation('Huge Qty (1M)', {
    stateCode: 'MH', oemCode: 'ORF', productCode: 'C3', quantity: 1000000
  }, 400);

  // 3. Max Limit + 1 (Should be 400)
  await testValidation('Over Limit (1001)', {
    stateCode: 'MH', oemCode: 'ORF', productCode: 'C3', quantity: 1001
  }, 400);

  // 4. Valid Max Limit (Should be 201)
  await testValidation('Valid Max (1000)', {
    stateCode: 'MH', oemCode: 'ORF', productCode: 'C3', quantity: 1000,
    userId: 'qa-test', pcBindingId: 'qa-device'
  }, 201);

  // 5. Missing Fields (Should be 400 now)
  await testValidation('Missing Fields', {
    stateCode: 'MH'
  }, 400);

  // 6. String Quantity (Should be 400 now)
  await testValidation('String Qty', {
    stateCode: 'MH', oemCode: 'ORF', productCode: 'C3', quantity: "TEN"
  }, 400);
}

runTests();
