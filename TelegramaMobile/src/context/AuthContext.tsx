import { jwtDecode } from 'jwt-decode';
import * as SecureStore from 'expo-secure-store';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { hydrateApiUrl, apiRequest, getApiUrl, payloadOf, saveApiUrl } from '../lib/api';

const AUTH_KEY = 'telegrama.auth';

export type SessionUser = {
  email: string;
  name: string;
  userTag: string;
  id?: string;
};

type AuthContextValue = {
  token: string | null;
  user: SessionUser | null;
  isReady: boolean;
  apiUrl: string;
  login: (email: string, password: string) => Promise<void>;
  register: (details: Record<string, string>) => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  updateApiUrl: (url: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [apiUrl, setApiUrl] = useState(getApiUrl());

  useEffect(() => {
    let alive = true;
    Promise.all([hydrateApiUrl(), SecureStore.getItemAsync(AUTH_KEY)])
      .then(([savedUrl, savedAuth]) => {
        if (!alive) return;
        setApiUrl(savedUrl);
        if (savedAuth) {
          try {
            const parsed = JSON.parse(savedAuth) as { token: string; user: SessionUser };
            setToken(parsed.token);
            setUser(parsed.user);
          } catch {
            void SecureStore.deleteItemAsync(AUTH_KEY);
          }
        }
      })
      .finally(() => alive && setIsReady(true));
    return () => { alive = false; };
  }, []);

  const updateApiUrl = useCallback(async (value: string) => {
    setApiUrl(await saveApiUrl(value));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiRequest<string>('/api/users/login', {
      method: 'POST',
      form: { Email: email, Password: password },
    });
    const accessToken = payloadOf(response);
    if (typeof accessToken !== 'string') throw new Error('API не повернув JWT-токен.');

    let claims: Record<string, string> = {};
    try { claims = jwtDecode<Record<string, string>>(accessToken); } catch { /* keep email fallback */ }
    const sessionUser: SessionUser = {
      email,
      name: claims.UserName || email.split('@')[0] || 'Користувач',
      userTag: claims.UserTag || '',
      id: claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'] || claims.sub,
    };
    await SecureStore.setItemAsync(AUTH_KEY, JSON.stringify({ token: accessToken, user: sessionUser }));
    setToken(accessToken);
    setUser(sessionUser);
  }, []);

  const register = useCallback(async (details: Record<string, string>) => {
    await apiRequest<null>('/api/users/register', { method: 'POST', form: details });
  }, []);

  const verifyEmail = useCallback(async (email: string, code: string) => {
    await apiRequest<null>('/api/users/verify-email', {
      method: 'POST',
      form: { Email: email, Code: code },
    });
  }, []);

  const resendVerification = useCallback(async (email: string) => {
    await apiRequest<null>('/api/users/resend-verification', {
      method: 'POST',
      form: { Email: email },
    });
  }, []);

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(AUTH_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    token, user, isReady, apiUrl, login, register, verifyEmail,
    resendVerification, logout, updateApiUrl,
  }), [token, user, isReady, apiUrl, login, register, verifyEmail, resendVerification, logout, updateApiUrl]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be rendered inside AuthProvider.');
  return context;
}
