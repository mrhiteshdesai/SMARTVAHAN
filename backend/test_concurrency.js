const BASE_URL = 'http://localhost:3000/api/qr/generate';
const TOTAL_REQUESTS = 5;

async function runTest() {
  console.log(`Starting concurrency test with ${TOTAL_REQUESTS} requests...`);
  
  const payload = {
    stateCode: 'MH',
    oemCode: 'ORF',
    productCode: 'C3',
    quantity: 10,
    userId: 'test-qa-bot',
    pcBindingId: 'qa-device-123'
  };

  const promises = [];
  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    promises.push(
      fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw data;
        return { status: 'fulfilled', data };
      })
      .catch(err => ({ status: 'rejected', error: err }))
    );
  }

  const results = await Promise.all(promises);
  
  let successCount = 0;
  let failCount = 0;

  results.forEach((res, index) => {
    if (res.status === 'fulfilled') {
      console.log(`Request ${index + 1}: SUCCESS - BatchID: ${res.data.batchId}`);
      successCount++;
    } else {
      console.log(`Request ${index + 1}: FAILED - ${JSON.stringify(res.error)}`);
      failCount++;
    }
  });

  console.log(`\nTest Complete. Success: ${successCount}, Failed: ${failCount}`);
}

runTest();
