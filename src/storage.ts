/**
 * Storage utility for game state persistence
 * Uses browser localStorage with async-like API for consistency
 */

export const gameStorage = {
  /**
   * Store game state in localStorage
   */
  set: async (key: string, value: string): Promise<void> => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.error(`Failed to store ${key}:`, error);
      throw error;
    }
  },

  /**
   * Retrieve game state from localStorage
   */
  get: async (key: string): Promise<{ value: string } | null> => {
    try {
      const value = localStorage.getItem(key);
      return value ? { value } : null;
    } catch (error) {
      console.error(`Failed to retrieve ${key}:`, error);
      throw error;
    }
  },
};

/**
 * Declare window.storage for legacy code compatibility
 * This allows gradual migration from window.storage to gameStorage
 */
declare global {
  interface Window {
    storage: {
      set: (key: string, value: string, useAsync?: boolean) => Promise<void>;
      get: (key: string, useAsync?: boolean) => Promise<{ value: string } | null>;
    };
  }
}

// Initialize window.storage with gameStorage implementation
if (typeof window !== 'undefined') {
  window.storage = {
    set: (key: string, value: string) => gameStorage.set(key, value),
    get: (key: string) => gameStorage.get(key),
  };
}
