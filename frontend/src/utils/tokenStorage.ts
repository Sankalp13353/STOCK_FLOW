import { User } from '../types/auth';

/**
 * ==============================================================================
 * BROWSER TOKEN STORAGE & SECURITY TRADE-OFF DOCUMENTATION
 * ==============================================================================
 * 
 * StockFlow's backend currently implements stateless JWT authentication where
 * tokens are transmitted via the HTTP `Authorization: Bearer <token>` header.
 * 
 * In this architecture, the token is stored on the client side using localStorage.
 * 
 * SECURITY TRADEOFF ANALYSIS:
 * ------------------------------------------------------------------------------
 * 1. Cross-Site Scripting (XSS) Vulnerability:
 *    - localStorage is accessible to any JavaScript running on the same origin.
 *    - If an attacker succeeds in injecting malicious JavaScript (XSS), they can
 *      read the stored JWT and exfiltrate it.
 *    - In contrast, HttpOnly SameSite cookies cannot be read by JavaScript,
 *      providing complete protection against script-based token exfiltration.
 * 
 * 2. Cross-Site Request Forgery (CSRF) Profile:
 *    - Storing tokens in localStorage and attaching them manually via the
 *      `Authorization` header provides natural immunity to CSRF attacks, because
 *      browsers do not automatically attach localStorage values on cross-origin
 *      HTTP requests.
 * 
 * 3. Mitigation Strategies Implemented:
 *    - Tokens have a defined expiration time (`JWT_EXPIRES_IN=24h`).
 *    - On HTTP 401 Unauthorized responses, tokens are immediately cleared from
 *      storage and the application state resets.
 *    - In a future phase, transitioning to backend-set HttpOnly, SameSite cookies
 *      with CSRF tokens is the recommended defense-in-depth evolution.
 * ==============================================================================
 */

const TOKEN_KEY = 'stockflow_auth_token';
const USER_KEY = 'stockflow_auth_user';

export const tokenStorage = {
  getToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setToken(token: string): void {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch (err) {
      console.error('Failed to save auth token to localStorage:', err);
    }
  },

  getUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setUser(user: User): void {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (err) {
      console.error('Failed to save user profile to localStorage:', err);
    }
  },

  clear(): void {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } catch (err) {
      console.error('Failed to clear auth from localStorage:', err);
    }
  },
};

