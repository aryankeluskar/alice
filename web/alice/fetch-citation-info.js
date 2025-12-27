/**
 * Main entry point for Alice citation fetching functionality
 */

import { loadJQuery } from './jquery-loader.js';
import { ScaleHandler } from './scale-handler.js';
import { setupEventHandlers } from './event-handlers.js';

export async function fetchCitationInfo(pdfDocument) {
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
}
