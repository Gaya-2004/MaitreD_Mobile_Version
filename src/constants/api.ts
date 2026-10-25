import Constants from 'expo-constants';

const getApiUrl = () => {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  // Auto-detect host IP when running via Metro dev server
  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host) {
      return `http://${host}:8001`;
    }
  }

  return 'https://dev-api.dataudipi.com';
};

export const API_BASE_URL = getApiUrl();
export const IMAGE_BASE_URL = getApiUrl();

// Helper to construct image URLs directly from database
export const getFullImageUrl = (url: string | null | undefined, dishName?: string): string => {
  const trimmed = typeof url === 'string' ? url.trim() : '';

  if (!trimmed || trimmed === '' || trimmed.includes('placeholder')) {
    if (dishName) {
      return `https://image.pollinations.ai/prompt/Delicious%20${encodeURIComponent(dishName)}%20food%20plating?width=800&height=600&nologo=true`;
    }
    return 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80';
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

  // If dummy seeded static path that doesn't exist on disk, generate high-quality dish image
  if (dishName && trimmed.startsWith('/static/images/item_')) {
    return `https://image.pollinations.ai/prompt/Delicious%20${encodeURIComponent(dishName)}%20food%20plating?width=800&height=600&nologo=true`;
  }

  // If stored as a relative path in the database
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return `${IMAGE_BASE_URL}${path}`;
};

