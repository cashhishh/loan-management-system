import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setSessionExpiredHandler } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous
  const queryClient = useQueryClient();

  const applySession = useCallback((data) => {
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  // Restore the session from the refresh cookie on page load.
  useEffect(() => {
    setSessionExpiredHandler(clear);
    refreshSession().then(applySession).catch(clear);
  }, [applySession, clear]);

  const value = useMemo(
    () => ({
      user,
      status,
      async login(credentials) {
        const { data } = await api.post('/auth/login', credentials, { _skipAuthRetry: true });
        applySession(data);
        return data.user;
      },
      async register(payload) {
        const { data } = await api.post('/auth/register', payload, { _skipAuthRetry: true });
        applySession(data);
        return data.user;
      },
      async logout() {
        try {
          await api.post('/auth/logout', null, { _skipAuthRetry: true });
        } finally {
          clear();
        }
      },
    }),
    [user, status, applySession, clear],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

export const homeFor = (role) => ({ APPLICANT: '/dashboard', OFFICER: '/review', ADMIN: '/admin' })[role] ?? '/';
