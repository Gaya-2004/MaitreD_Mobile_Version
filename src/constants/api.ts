import Constants from 'expo-constants';
import { Platform } from 'react-native';

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim();

  // If a deployed / remote URL is provided (e.g. https://... or custom domain), always respect it
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
    return envUrl.replace(/\/+$/, '');
  }

  // If running on web in a browser, use current host
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
      return `http://${hostname}:8001`;
    }
  }

  // Auto-detect host IP when running via Metro dev server (Expo Go / Dev Client on physical device)
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      return `http://${host}:8001`;
    }
  }

  // If running in Android emulator without hostUri
  if (Platform.OS === 'android' && !Constants.isDevice) {
    return 'http://10.0.2.2:8001';
  }

  // Fallback to local / dev API
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  return 'http://192.168.1.6:8001';
};

export const API_BASE_URL = getApiUrl();
export const IMAGE_BASE_URL = getApiUrl();

// Helper to construct image URLs directly from database
export const getFullImageUrl = (url: string | null | undefined, dishName?: string): string => {
  const trimmed = typeof url === 'string' ? url.trim() : '';

  if (!trimmed || trimmed === '' || trimmed.includes('placeholder')) {
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80';
  }

  // If already a complete cloud/CDN URL (e.g. Unsplash, S3, Cloudinary, HTTPS)
  if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) {
    // If it points to local localhost from backend seeds, map it to IMAGE_BASE_URL
    if (trimmed.includes('localhost') || trimmed.includes('127.0.0.1') || trimmed.includes('10.0.2.2')) {
      try {
        const urlObj = new URL(trimmed);
        return `${IMAGE_BASE_URL}${urlObj.pathname}${urlObj.search}`;
      } catch {
        return trimmed;
      }
    }
    return trimmed;
  }

  // If dummy seeded static path that doesn't exist on disk, fallback to high-quality dish image
  if (trimmed.startsWith('/static/images/item_')) {
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80';
  }

  // If stored as a relative path in the database
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${IMAGE_BASE_URL}${path}`;
};

