const BASE_URL = 'http://localhost:3000';

async function testLogin() {
    try {
        console.log('Attempting login with 8888320669 / 123456 ...');
        const res = await fetch(`${BASE_URL}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '8888320669', password: '123456' })
        });
        console.log('Status:', res.status);
        const text = await res.text();
        console.log('Body:', text);
    } catch (e) {
        console.error('Fetch error:', e);
    }
}

testLogin();
