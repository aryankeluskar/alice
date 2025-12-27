/**
 * Mouse event handlers for citation hover functionality
 */

import { fail } from './data-models.js';
import { getGeminiFallbackReference } from './reference-fallback.js';
import { fetchDataForPaper } from './paper-data.js';
import { getBibtexReferenceFromInternalLink, parseBibtexReference } from './utils.js';
import { processAndQueryArXiv } from './citation-processor.js';
import { createAndShowPopup } from './popup.js';
import { getCachedReference, createXMLFromCachedRef, calculatePopupDirection } from './cached-ref-handler.js';

export function setupEventHandlers(scaleHandler) {
  let activePopup = null;
  let activeLink = null;
  let popupHoverTimeout = null;

  const currentScaleFactor = scaleHandler.getScaleFactor();

  // Initialize mouse tracking variables
  let isMouseOverLink = false;
  let isMouseOverPopup = false;

  // current implementation calls this upon every viewer render,
  // so turn off callback before adding another one
  $("a").off();

  // Add a click event on the document to close popups when clicking outside
  $(document).on("click", function (e) {
    // If the user is selecting text, don't close the popup
    if (window.getSelection && window.getSelection().toString().length > 0) {
      return;
    }

    // If we have an active popup and the click is outside the popup and its trigger link
    if (
      activePopup &&
      !$(e.target).closest(activePopup).length &&
      (!activeLink || !$(e.target).closest($(activeLink)).length)
    ) {
      // Remove the popup
      activePopup.remove();
      // Reset active variables
      activePopup = null;
      activeLink = null;
    }
  });

  $("a").on({
    mouseenter: async function () {
      console.log("-" * 30);
      console.log("Finding paper data for:", $(this).attr("href"));
      console.log("-" * 30);

      // Create a unique ID for this popup to avoid selector conflicts
      const popupId = `popup-${Math.random().toString(36).substr(2, 9)}`;

      // Extract paper ID from current URL
      const currentUrl = window.location.href;
      let paperId = "";

      // if "cite" not in href, ignore
      const linkHref = $(this).attr("href");
      if (!linkHref.includes("cite")) {
        return;
      }

      // First check if we have this citation in cached_final_refs
      const { cachedRef, citationKey } = getCachedReference(linkHref);

      if (cachedRef) {
        console.log("Found cached final reference for citation:", citationKey);

        // Create XML entry from cached data
        const entry = createXMLFromCachedRef(cachedRef);

        // Calculate popup direction based on element position
        const tipsyDirection = calculatePopupDirection(this, scaleHandler.getScaleFactor());

        console.log(
          "Calculated tipsyDirection for cached popup:",
          tipsyDirection
        );

        // Create and show popup with cached data
        createAndShowPopup({
          element: this,
          popupId,
          tipsyDirection,
          matchingEntry: entry,
          currentScaleFactor: scaleHandler.getScaleFactor(),
          onPopupCreated: $popup => {
            activeLink = this;
            activePopup = $popup;
            scaleHandler.setActivePopup($popup, this);
          },
        });

        return;
      }

      // Extract paper ID based on URL pattern
      if (currentUrl.includes("arxiv.org")) {
        // For arXiv URLs like .../1810.04805
        const match = currentUrl.match(/\/(\d+\.\d+)/);
        if (match) paperId = match[1];
      } else if (currentUrl.includes("biorxiv.org")) {
        // For bioRxiv URLs like .../10.1101/2025.04.16.649082v1
        const match = currentUrl.match(/\/(\d+\.\d+\/[\d.]+v\d)/);
        if (match) paperId = match[1];
      }

      if (!paperId) {
        console.error("Could not extract paper ID from URL:", currentUrl);
        return; // Stop processing if no paper ID
      }

      console.log("Extracted paper ID:", paperId);

      // Check if we already have data for this paper ID in localStorage
      const cachedPaperDataString = localStorage.getItem(
        `paper_data_${paperId}`
      );

      if (cachedPaperDataString) {
        try {
          const cachedPaperData = JSON.parse(cachedPaperDataString);
          console.log(
            "Found cached paper data for",
            paperId,
            ":",
            cachedPaperData
          );
        } catch (e) {
          console.error("Error parsing cached paper data:", e);
          // Clear corrupted data
          localStorage.removeItem(`paper_data_${paperId}`);
          // Proceed to fetch fresh data
          fetchDataForPaper(paperId);
        }
      } else {
        console.log(
          "No cached data found for paper ID:",
          paperId,
          ". Fetching fresh data."
        );

        // Fetch fresh data (extract title, then get Semantic Scholar info)
        // This happens asynchronously, so we don't wait for it here
        fetchDataForPaper(paperId);
      }

      // Check if activePopup exists but is no longer in the DOM
      if (
        activePopup &&
        !$.contains(document.documentElement, activePopup[0])
      ) {
        console.log(
          "Active popup no longer in DOM, resetting active variables"
        );
        activePopup = null;
        activeLink = null;
      }

      // Clear any existing hover timeout
      if (popupHoverTimeout) {
        clearTimeout(popupHoverTimeout);
        popupHoverTimeout = null;
      }

      // If there's already an active popup and we're hovering a different link,
      // ignore this hover event
      if (activePopup && activeLink !== this) {
        return;
      }

      // If we already have an active popup for this link, don't create a new one
      if (activePopup && activeLink === this) {
        return;
      }

      // get location relative to page for nicer display
      const tipsyDirection = calculatePopupDirection(this, scaleHandler.getScaleFactor());

      console.log("tipsyDirection", tipsyDirection);

      const bibtexRef = getBibtexReferenceFromInternalLink(linkHref);
      const surroundingText = $(this).parent().text().trim();

      console.log("surroundingText", surroundingText);

      // Store the current element for context and binding
      const currentElement = this;

      let matchingEntry = null;

      const parsedInfo = parseBibtexReference(bibtexRef);

      // Make this an immediately invoked async function to allow using await
      (async () => {
        if (parsedInfo) {
          // Try ArXiv API first - properly handle the Promise
          try {
            await processAndQueryArXiv(
              parsedInfo,
              "BibTeX parsing",
              currentElement,
              paperId,
              linkHref,
              popupId,
              tipsyDirection,
              scaleHandler.getScaleFactor(),
              $popup => {
                activeLink = currentElement;
                activePopup = $popup;
                scaleHandler.setActivePopup($popup, currentElement);
              }
            );
          } catch (error) {
            console.log(
              "ArXiv API failed or returned empty results, trying Semantic Scholar fallback..."
            );
            // log the error
            console.error("Error in ArXiv API:", error);
            let result = await getGeminiFallbackReference(
              paperId,
              linkHref,
              currentElement
            );
            console.log("Generated XML:", result);
            if (result) {
              matchingEntry = result;
              const { popup, destroy } = await createAndShowPopup({
                element: this,
                popupId,
                tipsyDirection,
                matchingEntry,
                currentScaleFactor: scaleHandler.getScaleFactor(),
                onPopupCreated: $popup => {
                  // Store the current element and popup as active
                  activeLink = this;
                  activePopup = $popup;
                  scaleHandler.setActivePopup($popup, this);
                },
              });
              console.log("Created popup");
            }
          }
        } else {
          // AI-powered fallback path
          try {
            let result = await getGeminiFallbackReference(
              paperId,
              linkHref,
              currentElement
            );
            console.log("Generated XML:", result);
            if (result) {
              matchingEntry = result;
              const { popup, destroy } = await createAndShowPopup({
                element: this,
                popupId,
                tipsyDirection,
                matchingEntry,
                currentScaleFactor: scaleHandler.getScaleFactor(),
                onPopupCreated: $popup => {
                  // Store the current element and popup as active
                  activeLink = this;
                  activePopup = $popup;
                  scaleHandler.setActivePopup($popup, this);
                },
              });
              console.log("Created popup");
            }
          } catch (error) {
            console.error("Error in title extraction fallback:", error);
            fail(currentElement, "Title extraction fallback failed");
          }
        }
      })();
    },
  });
}
