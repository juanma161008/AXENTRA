import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, normalizeApiError, STORAGE_KEYS } from '../api/api';

const AuthContext = createContext(null);

const readStoredUser = () => {
  try {
    const value = localStorage.getItem(STORAGE_KEYS.user);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => readStoredUser());
  const [loading, setLoading] = useState(true);

  const clearSession = () => {
    localStorage.removeItem(STORAGE_KEYS.token);
    localStorage.removeItem(STORAGE_KEYS.user);
    localStorage.removeItem(STORAGE_KEYS.companyId);
    localStorage.removeItem(STORAGE_KEYS.licitacionId);
    localStorage.removeItem(STORAGE_KEYS.module);
    setUser(null);
  };

  useEffect(() => {
    const syncSession = async () => {
      const token = localStorage.getItem(STORAGE_KEYS.token);
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await authApi.me();
        const currentUser = response.data;
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(currentUser));
        setUser(currentUser);
      } catch {
        clearSession();
      } finally {
        setLoading(false);
      }
    };

    syncSession();
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      clearSession();
    };

    window.addEventListener('axentra:session-expired', handleExpiredSession);
    return () => window.removeEventListener('axentra:session-expired', handleExpiredSession);
  }, []);

  const login = async (credentials) => {
    try {
      const response = await authApi.login(credentials);
      const { access_token, user: loggedUser } = response.data;

      localStorage.setItem(STORAGE_KEYS.token, access_token);
      localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(loggedUser));
      setUser(loggedUser);

      return { success: true, user: loggedUser };
    } catch (error) {
      return {
        success: false,
        error: normalizeApiError(error, 'No fue posible iniciar sesión'),
      };
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Logout local aunque el backend no responda.
    } finally {
      clearSession();
    }
  };

  const register = async (payload) => {
    try {
      const response = await authApi.register(payload);
      return { success: true, data: response.data };
    } catch (error) {
      return {
        success: false,
        error: normalizeApiError(error, 'No fue posible registrar el usuario'),
      };
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      logout,
      register,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }

  return context;
};
