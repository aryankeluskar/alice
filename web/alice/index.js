/**
 * Main entry point for Alice helper functions
 * Re-exports all public functions for backward compatibility
 */

export { ArxivInfo, fail } from './data-models.js';
export {
  fetchWithRetry,
  queuedFetch,
  fetchBibTexData,
  postToOnlineClipboard,
  fetchPaperText
} from './api.js';
export { delay } from './cache.js';
export {
  cleanAIIntroText,
  cleanupCodeFromResponse,
  containsPythonCode,
  renderMarkdown,
  ensureMathJaxLoaded
} from './markdown.js';
export {
  extractTitleWithGroq,
  callGroqAPI,
  processGroqResponse
} from './groq.js';
export {
  fetchDataForPaper,
  fetchAndStoreSemanticScholarData
} from './paper-data.js';
export { getGroqFallbackReference } from './reference-fallback.js';
export { createAndShowPopup } from './popup.js';
export { setupButtonEventListeners } from './popup-buttons.js';
export { getBibtexReferenceFromInternalLink, parseBibtexReference } from './utils.js';
