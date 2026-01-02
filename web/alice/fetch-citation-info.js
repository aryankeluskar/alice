/**
 * Main entry point for Alice citation fetching functionality
 */

import { loadJQuery } from './jquery-loader.js';
import { ScaleHandler } from './scale-handler.js';
import { setupEventHandlers } from './event-handlers.js';
import { fetchDataForPaper } from './paper-data.js';

// Track initialization to prevent duplicate setup
let isInitialized = false;
let initializationPromise = null;

/**
 * Extract paper ID from current URL
 */
function extractPaperId() {
  const currentUrl = window.location.href;
  let paperId = "";

  // Extract paper ID based on URL pattern
  if (currentUrl.includes("arxiv.org")) {
    // For arXiv URLs like .../1810.04805
    const match = currentUrl.match(/\/(\d+\.\d+)/);
    if (match) paperId = match[1];
  } else if (currentUrl.includes("biorxiv.org")) {
    // For bioRxiv URLs like .../10.1101/2025.04.16.649082v1
    const match = currentUrl.match(/\/(\d+\.\d+\/[\d.]+v\d)/);
    if (match) paperId = match[1];
  } else if (currentUrl.includes("openreview.net")) {
    // For OpenReview URLs like https://openreview.net/pdf?id=XXXXX
    const match = currentUrl.match(/[?&]id=([^&]+)/);
    if (match) paperId = match[1];
  }

  return paperId;
}

export async function fetchCitationInfo(pdfDocument) {
  // Prevent duplicate initialization - return existing promise if already initializing
  if (initializationPromise) {
    return initializationPromise;
  }

  // Already initialized, just return
  if (isInitialized) {
    return null;
  }

  // Create and store initialization promise
  initializationPromise = (async () => {
  // Check if jQuery is loaded, if not, load it dynamically
  const jqueryLoaded = await loadJQuery(pdfDocument);

  if (!jqueryLoaded) {
    console.error("Failed to load jQuery, cannot initialize Alice");
    return null;
  }

  // jQuery is available, proceed with initialization
  console.log("Initializing ArXiv info with jQuery available");

  // Create scale handler
  const scaleHandler = new ScaleHandler();

  // Set up scale factor listener
  scaleHandler.setupScaleListener();

  // Set up event handlers for citation links
  setupEventHandlers(scaleHandler);

  // Automatically index the paper on load for instant hover experience
  const paperId = extractPaperId();
  if (paperId) {
    console.log("Automatically indexing paper:", paperId);

    // Check if we already have cached data
    const cachedPaperDataString = localStorage.getItem(`paper_data_${paperId}`);

    if (!cachedPaperDataString) {
      console.log("No cached data found, fetching paper data in background...");
      // Fetch data in background without blocking
      fetchDataForPaper(paperId).catch(error => {
        console.error("Error auto-indexing paper:", error);
      });
    } else {
      console.log("Paper already indexed, using cached data");
    }
  } else {
    console.log("Could not extract paper ID from URL, skipping auto-indexing");
  }

    // Mark as initialized
    isInitialized = true;
    return null;
  })();

  return initializationPromise;
}
