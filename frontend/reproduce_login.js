import axios from 'axios';

async function testLogin() {
    try {
        console.log("Sending login request...");
        const response = await axios.post('http://127.0.0.1:3000/api/auth/login', {
            phone: '8888320669',
            password: '123456'
        });
        console.log('Login successful:', response.data);
    } catch (error) {
        if (error.response) {
            console.log('Error Status:', error.response.status);
            console.log('Error Data:', error.response.data);
        } else {
            console.log('Error Message:', error.message);
        }
    }
}

testLogin();
