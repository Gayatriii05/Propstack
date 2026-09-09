import { createContext, useContext, useState, useCallback } from 'react';
import { setToken, getToken } from '../api';
import { jwtDecode } from 'jwt-decode';
import api from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setTokenState] = useState(null);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.token);
    setTokenState(data.token);
    setUser(jwtDecode(data.token));
    return data;
  }, []);

  const register = useCallback(async (name, email, password, role) => {
    const { data } = await api.post('/auth/register', { name, email, password, role });
    setToken(data.token);
    setTokenState(data.token);
    setUser(jwtDecode(data.token));
    return data;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setUser(null);
  }, []);

  const value = { user, token, login, register, logout, isLoggedIn: !!token };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
