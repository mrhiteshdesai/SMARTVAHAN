const http = require('http');

const data = JSON.stringify({
    phone: '8888320669',
    password: '123456'
});

const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/login',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
    }
};

console.log('Sending login request to http://localhost:3000/api/auth/login');
console.log('Payload:', data);

const req = http.request(options, (res) => {
    console.log(`StatusCode: ${res.statusCode}`);
    
    let body = '';
    res.on('data', (chunk) => {
        body += chunk;
    });
    
    res.on('end', () => {
        console.log('Response Body:', body);
    });
});

req.on('error', (error) => {
    console.error('Error:', error);
});

req.write(data);
req.end();
