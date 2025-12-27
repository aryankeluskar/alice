/**
 * Cache and request queue management for API calls
 */

// Utility function to add delay with exponential backoff
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Request queue to prevent concurrent API requests that trigger rate limits
export const apiRequestQueue = {
  semanticScholar: [],
  arxiv: [],
  processing: {
    semanticScholar: false,
    arxiv: false
  }
};

// Simple cache for API responses to reduce redundant requests
const apiCache = new Map();
const CACHE_EXPIRY = 5 * 60 * 1000; // 5 minutes

function getCacheKey(url, options) {
  return `${url}_${JSON.stringify(options || {})}`;
}

export function getCachedResponse(url, options) {
  const key = getCacheKey(url, options);
  const cached = apiCache.get(key);

  if (cached && Date.now() - cached.timestamp < CACHE_EXPIRY) {
    console.log(`Using cached response for ${url}`);
    return Promise.resolve(cached.response.clone());
  }

  return null;
}

export function setCachedResponse(url, options, response) {
  const key = getCacheKey(url, options);
  apiCache.set(key, {
    response: response.clone(),
    timestamp: Date.now()
  });
}

export async function processQueue(apiType) {
  if (apiRequestQueue.processing[apiType] || apiRequestQueue[apiType].length === 0) {
    return;
  }

  apiRequestQueue.processing[apiType] = true;

  while (apiRequestQueue[apiType].length > 0) {
    const { url, options, maxRetries, resolve, reject } = apiRequestQueue[apiType].shift();

    try {
      const { fetchWithRetry } = await import('./api.js');
      const response = await fetchWithRetry(url, options, maxRetries);
      setCachedResponse(url, options, response);
      resolve(response);
    } catch (error) {
      reject(error);
    }

    // Add a small delay between requests to the same API
    if (apiRequestQueue[apiType].length > 0) {
      await delay(apiType === 'semanticScholar' ? 1000 : 500);
    }
  }

  apiRequestQueue.processing[apiType] = false;
}
