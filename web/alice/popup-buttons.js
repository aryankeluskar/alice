/**
 * Button event handlers for popup interactions
 * Coordinates between summary and bibtex button handlers
 */

import { setupSummaryButton } from './popup-summary.js';
import { setupBibtexButton } from './popup-bibtex.js';

// Helper function to set up button event listeners
export function setupButtonEventListeners($popup, popupId, state) {
  // Set up the summary/abstract toggle button
  setupSummaryButton($popup, popupId, state);

  // Set up the bibtex button
  setupBibtexButton($popup, popupId, state);
}
