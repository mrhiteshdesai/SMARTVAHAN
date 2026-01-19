import axios from 'axios';

const isDev = import.meta.env.DEV;
const api = axios.create({
  baseURL: isDev ? 'http://localhost:3000/api' : '/api',
});

api.interceptors.request.use(
  (config) => {
    const stored = localStorage.getItem('sv_auth');
    if (stored) {
      try {
        const { token } = JSON.parse(stored);
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (e) {
        // invalid token format
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Auto logout if needed
      // localStorage.removeItem('sv_auth');
      // window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
