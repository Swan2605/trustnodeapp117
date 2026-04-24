/**
 * Resolves image URLs to ensure they work with the API base URL
 * Handles various URL formats and ensures consistency across the app
 */

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const resolveImageUrl = (url) => {
  if (!url) return '';
  
  // Already a full URL
  if (url.startsWith('http')) return url;
  
  // Convert /public/images/ to /images/
  if (url.startsWith('/public/images/')) {
    return `${API_BASE}${url.replace('/public/images/', '/images/')}`;
  }
  
  // Already has /images/ prefix
  if (url.startsWith('/images/')) {
    return `${API_BASE}${url}`;
  }
  
  // Relative path like 'images/...'
  if (url.startsWith('images/')) {
    return `${API_BASE}/${url}`;
  }
  
  // Other cases - add leading slash and API base
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
};

export default resolveImageUrl;
