let cachedKeys = null;
let keysFetchPromise = null;

export async function getApiKeys() {
  if (cachedKeys !== null) {
    return cachedKeys;
  }

  if (keysFetchPromise) {
    return keysFetchPromise;
  }

  keysFetchPromise = new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      cachedKeys = { geminiApiKey: null, semanticScholarApiKey: null };
      resolve(cachedKeys);
      return;
    }

    chrome.storage.local.get(['geminiApiKey', 'semanticScholarApiKey'], (items) => {
      cachedKeys = {
        geminiApiKey: items.geminiApiKey && items.geminiApiKey.trim() ? items.geminiApiKey.trim() : null,
        semanticScholarApiKey: items.semanticScholarApiKey && items.semanticScholarApiKey.trim() ? items.semanticScholarApiKey.trim() : null
      };
      resolve(cachedKeys);
    });
  });

  return keysFetchPromise;
}

export async function getGeminiApiKey() {
  const keys = await getApiKeys();
  return keys.geminiApiKey;
}

export async function getSemanticScholarApiKey() {
  const keys = await getApiKeys();
  return keys.semanticScholarApiKey;
}

export function clearKeyCache() {
  cachedKeys = null;
  keysFetchPromise = null;
}

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local') {
      if (changes.geminiApiKey || changes.semanticScholarApiKey) {
        clearKeyCache();
      }
    }
  });
}

export const GEMINI_DIRECT_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
export const GEMINI_PROXY_ENDPOINT = 'https://api.aryankeluskar.com/api/gemini';

export function buildGeminiDirectUrl(apiKey) {
  return `${GEMINI_DIRECT_ENDPOINT}?key=${apiKey}`;
}

export function buildSemanticScholarHeaders(apiKey) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  
  return headers;
}

export function createRateLimitError(service, statusCode) {
  const error = new Error(
    `${service} rate limit exceeded (${statusCode}). ` +
    `To continue using Alice without interruptions, please configure your own API key in the extension settings.`
  );
  error.isRateLimitError = true;
  error.service = service;
  error.statusCode = statusCode;
  error.userFriendlyMessage = getRateLimitUserMessage(service);
  return error;
}

export function createServerError(service, statusCode) {
  const error = new Error(
    `${service} server error (${statusCode}). The service is temporarily unavailable.`
  );
  error.isServerError = true;
  error.service = service;
  error.statusCode = statusCode;
  error.userFriendlyMessage = getServerErrorUserMessage(service);
  return error;
}

export function getRateLimitUserMessage(service) {
  const settingsLink = getSettingsLink();
  
  if (service === 'Gemini') {
    return `We've reached our usage limit for AI summaries. To continue using Alice without interruptions, you can add your own free Gemini API key.\n\n` +
      `Get your key at: https://aistudio.google.com/apikey\n\n` +
      settingsLink;
  }
  
  if (service === 'Semantic Scholar') {
    return `We've reached our usage limit for paper lookups. To continue using Alice without interruptions, you can add your own free Semantic Scholar API key.\n\n` +
      `Get your key at: https://www.semanticscholar.org/product/api#api-key\n\n` +
      settingsLink;
  }
  
  return `We've reached our usage limit. Please try again later or configure your own API key in settings.`;
}

export function getServerErrorUserMessage(service) {
  return `${service} is temporarily unavailable. Please try again in a few moments. ` +
    `If this persists, you can configure your own API key in the extension settings for a more reliable experience.`;
}

function getSettingsLink() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return `Open Alice settings to configure: ${chrome.runtime.getURL('options/options.html')}`;
  }
  return 'Open the extension settings to configure your API key.';
}

export function openSettingsPage() {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
  }
}
