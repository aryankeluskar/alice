/**
 * Cross-browser API compatibility layer for Alice extension
 * 
 * This provides a unified API that works across Chrome, Firefox, and other browsers
 * supporting the WebExtensions standard.
 * 
 * Usage: Import this file before any other extension scripts
 */

(function() {
  'use strict';

  // Check if we're in a browser extension context
  if (typeof window === 'undefined' && typeof self !== 'undefined') {
    // Service worker context (Chrome MV3)
    window = self;
  }

  // Firefox and modern browsers use 'browser' namespace
  // Chrome uses 'chrome' namespace but also supports 'browser' in newer versions
  const browserAPI = (function() {
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.id) {
      // Firefox or browser namespace is available
      return browser;
    } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      // Chrome - wrap chrome API to return Promises like Firefox does
      return chrome;
    } else {
      console.error('Browser extension API not found');
      return {};
    }
  })();

  // Expose unified API
  if (typeof browser === 'undefined') {
    window.browser = browserAPI;
  }
  
  // Also ensure chrome namespace exists for backward compatibility
  if (typeof chrome === 'undefined' && typeof browser !== 'undefined') {
    window.chrome = browser;
  }

  console.log('Alice: Browser API initialized', {
    hasChrome: typeof chrome !== 'undefined',
    hasBrowser: typeof browser !== 'undefined',
    manifestVersion: browserAPI.runtime?.getManifest()?.manifest_version
  });
})();

