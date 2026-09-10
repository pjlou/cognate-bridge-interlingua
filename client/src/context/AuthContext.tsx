import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  getCurrentUser,
  login as apiLogin,
  register as apiRegister,
  resetUserData as apiResetUserData,
  updatePriorityGermanicTargetLanguage as apiUpdatePriorityGermanic,
  updatePriorityRomanceTargetLanguage as apiUpdatePriorityRomance,
  type LanguageFamily,
  type User,
} from '../services/api';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  resetUserData: () => Promise<void>;
  setPriorityTargetLanguage: (
    family: Extract<LanguageFamily, 'Germanic' | 'Romance'>,
    value: number | null,
  ) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(() => Boolean(localStorage.getItem('token')));

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    getCurrentUser()
      .then(setUser)
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    localStorage.setItem('token', response.token);
    setUser(response.user);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const response = await apiRegister(email, password);
    localStorage.setItem('token', response.token);
    setUser(response.user);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  const resetUserData = useCallback(async () => {
    const updated = await apiResetUserData();
    setUser(updated);
  }, []);

  const setPriorityTargetLanguage = useCallback(
    async (family: Extract<LanguageFamily, 'Germanic' | 'Romance'>, value: number | null) => {
      const updated =
        family === 'Germanic'
          ? await apiUpdatePriorityGermanic(value)
          : await apiUpdatePriorityRomance(value);
      setUser(updated);
    },
    [],
  );

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      register,
      logout,
      resetUserData,
      setPriorityTargetLanguage,
    }),
    [user, isLoading, login, register, logout, resetUserData, setPriorityTargetLanguage],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
