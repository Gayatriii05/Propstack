import axios from 'axios';

let token = null;

export function setToken(newToken) {
  token = newToken;
}

export function getToken() {
  return token;
}

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      token = null;
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
