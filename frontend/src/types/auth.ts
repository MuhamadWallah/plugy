export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phone_verified?: boolean;
  avatar_url: string | null;
  rating_avg: string | number;
  rating_count: number;
  created_at: string;
  updated_at?: string;
}

export interface RegisterData {
  name: string;
  email: string;
  password: string;
  phone?: string;
  otp?: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (data: LoginData) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  refreshUser: () => Promise<void>;
}
