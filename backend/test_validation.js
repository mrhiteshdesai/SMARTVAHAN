const BASE_URL = 'http://localhost:3000/api/qr/generate';

async function testValidation(name, payload) {
  try {
    const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log(`[${name}] Status: ${res.status}, Response:`, JSON.stringify(data).substring(0, 100));
  } catch (e) {
      console.log(`[${name}] Error:`, e.message);
  }
}

async function runTests() {
  // 1. Negative Quantity
  await testValidation('Negative Qty', {
    stateCode: 'MH', oemCode: 'ORF', productCode: 'C3', quantity: -5
  });

  // 2. Huge Quantity
  await testValidation('Huge Qty', {
    stateCode: 'MH', oemCode: 'ORF', productCode: 'C3', quantity: 1000000
  });

  // 3. Invalid Codes
  await testValidation('Invalid Codes', {
    stateCode: 'XX', oemCode: 'YY', productCode: 'ZZ', quantity: 10
  });

  // 4. Missing Fields
  await testValidation('Missing Fields', {
    stateCode: 'MH'
  });

  // 5. String Quantity
  await testValidation('String Qty', {
    stateCode: 'MH', oemCode: 'ORF', productCode: 'C3', quantity: "TEN"
  });
}

runTests();
