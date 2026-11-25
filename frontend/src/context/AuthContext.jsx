import React, { createContext, useContext, useState, useEffect } from 'react';
import api, { API_ORIGIN } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const loginWithGoogle = () => {
    window.location.href = `${API_ORIGIN}/api/auth/google`;
  };

  const loginAsDemo = async (customEmail, customName) => {
    try {
      const response = await api.post('/auth/dev-login', {
        email: customEmail || 'developer@reachinbox.ai',
        name: customName || 'Alex Chen',
      });
      setUser(response.data.user);
      return response.data;
    } catch (err) {
      console.error('Dev login error:', err);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        loginWithGoogle,
        loginAsDemo,
        logout,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
