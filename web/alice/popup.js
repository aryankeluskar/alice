/**
 * Popup creation and management for citation hover displays
 */

import {
  popup_style,
  TEMPLATE_POPUP,
  TEMPLATE_LOADING_POPUP,
} from "../alice_constants.js";
import { setupButtonEventListeners } from "./popup-buttons.js";

// Function to create and show a loading popup immediately
export function createAndShowLoadingPopup({
  element,
  popupId,
  tipsyDirection,
  currentScaleFactor = 1,
  onPopupCreated = null,
  onPopupClosed = null,
}) {
  // check if user is still hovering before adding to DOM
  if ($(element).parent().find("a:hover").length === 0) {
    return null;
  }

  // Add CSS for loading animation if not already in the document
  if (!$("#arxiv-toggle-style").length) {
    const style = document.createElement("style");
    style.id = "arxiv-toggle-style";
    style.textContent = popup_style;
    document.head.appendChild(style);
  }

  // Add Solway font import if not already in the document
  if (!$('link[href*="Solway"]').length) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Solway:wght@400;500;700&display=swap";
    document.head.appendChild(link);
  }

  // Create the loading popup HTML
  const htmlString = TEMPLATE_LOADING_POPUP({ popupId, tipsyDirection });

  // Add the popup to the page - MUST append to element's parent, not body!
  // This is critical for proper positioning with tipsy CSS
  const $popup = $(htmlString);
  $(element).parent().append($popup);

  // The tipsy CSS handles positioning automatically via direction classes (ne/nw/se/sw)
  // No manual CSS positioning needed - the .tipsy-{direction} classes handle it

  // Add hover tracking to prevent popup from closing while user hovers over it
  let isMouseOverPopup = false;
  let isMouseOverLink = false;

  $popup.on({
    mouseenter: function () {
      isMouseOverPopup = true;
    },
    mouseleave: function () {
      isMouseOverPopup = false;
      checkShouldCloseLoadingPopup();
    },
    click: function (e) {
      // Prevent clicks on the popup from closing it
      e.stopPropagation();
    },
  });

  $(element).on({
    mouseenter: function () {
      isMouseOverLink = true;
    },
    mouseleave: function () {
      isMouseOverLink = false;
      setTimeout(() => {
        checkShouldCloseLoadingPopup();
      }, 100);
    },
  });

  // Function to check if loading popup should close
  function checkShouldCloseLoadingPopup() {
    setTimeout(() => {
      if (!isMouseOverPopup && !isMouseOverLink) {
        $popup.remove();
        // Notify the parent that the popup has closed
        if (onPopupClosed) {
          onPopupClosed();
        }
      }
    }, 100);
  }

  // Call the callback if provided
  if (onPopupCreated) {
    onPopupCreated($popup);
  }

  console.log("Created loading popup with tipsy direction:", tipsyDirection);
  return $popup;
}

// Function to create and show the popup with paper data
export async function createAndShowPopup({
  element,
  popupId,
  tipsyDirection,
  matchingEntry,
  currentScaleFactor = 1,
  onPopupCreated = null,
  onPopupClosed = null,
}) {
  // check if user is still hovering before adding to DOM
  if ($(element).parent().find("a:hover").length === 0) {
    return;
  }

  const paperData = {
    title: matchingEntry.getElementsByTagName("title")[0]?.textContent || "",
    authors: Array.from(matchingEntry.getElementsByTagName("author") || [])
      .map(a => a.children[0]?.textContent || "")
      .filter(Boolean),
    abstract:
      matchingEntry.getElementsByTagName("summary")[0]?.textContent || "",
    date: matchingEntry.getElementsByTagName("published")[0]?.textContent || "",
    link: matchingEntry.getElementsByTagName("id")[0]?.textContent || "",
  };

  // Check if abstract contains English alphabets
  const hasEnglishAlphabets = /[a-zA-Z]/.test(paperData.abstract);
  if (!hasEnglishAlphabets) {
    paperData.abstract =
      "This paper's abstract has been elided by the publisher. Paper or abstract should be available on the publisher's website, which is subject to the license by the author or copyright owner provided with this content.";
  }

  // Destructure paper data with defaults
  const {
    title: fullTitle = "",
    authors: rawAuthors = [],
    abstract = "",
    date = "",
    link = "",
  } = paperData;

  // Check if we have a valid ArXiv link
  let finalLink = link;
  if (!finalLink || !finalLink.includes("arxiv.org")) {
    // Create Google Scholar search URL
    const authorString = rawAuthors.join(", ");
    const searchQuery = encodeURIComponent(`${fullTitle} by ${authorString}`);
    finalLink = `https://scholar.google.com/scholar?hl=en&as_sdt=0%2C3&q=${searchQuery}&btnG=`;
    console.log(
      "No ArXiv link found, using Google Scholar fallback:",
      finalLink
    );
  }

  // Limit authors to 16 words
  let authorText = rawAuthors.join(", ");
  const authorWords = authorText.split(/\s+/);
  if (authorWords.length > 16) {
    // Find the last complete author name that fits within 16 words
    let wordCount = 0;
    let lastCompleteAuthorIndex = -1;

    for (let i = 0; i < rawAuthors.length; i++) {
      const authorWordCount = rawAuthors[i].split(/\s+/).length;

      if (wordCount + authorWordCount > 16) {
        break;
      }

      wordCount += authorWordCount;
      if (i < rawAuthors.length - 1) {
        wordCount += 2; // Count ", " as a word
      }

      lastCompleteAuthorIndex = i;
    }

    if (lastCompleteAuthorIndex >= 0) {
      const excessAuthorsCount =
        rawAuthors.length - (lastCompleteAuthorIndex + 1);
      authorText =
        rawAuthors.slice(0, lastCompleteAuthorIndex + 1).join(", ") +
        ` and ${excessAuthorsCount} others`;
    } else {
      // If even the first author has more than 16 words, truncate it
      const excessWordsCount = authorWords.length - 16;
      authorText =
        authorWords.slice(0, 16).join(" ") + ` and ${excessWordsCount} others`;
    }
  }

  let dateString = "Publication date not available";

  try {
    const dateStringOptions = {
      year: "numeric",
      month: "short",
      day: "numeric",
    };
    dateString = new Intl.DateTimeFormat("en-US", dateStringOptions).format(
      new Date(date)
    );
  } catch (error) {
    console.error("Error parsing date:", error);
    dateString = "Publication date not available";
  }

  // Load required libraries if not already loaded
  if (!window.marked && !$('script[src*="marked"]').length) {
    const script = document.createElement("script");
    script.src = "marked.min.js";
    script.async = true;
    document.head.appendChild(script);
  }

  // Add CSS for toggle switch
  if (!$("#arxiv-toggle-style").length) {
    const style = document.createElement("style");
    style.id = "arxiv-toggle-style";
    style.textContent = popup_style;
    document.head.appendChild(style);
  }

  // Add Solway font import if not already in the document
  if (!$('link[href*="Solway"]').length) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Solway:wght@400;500;700&display=swap";
    document.head.appendChild(link);
  }

  // Create the popup HTML
  const htmlString = TEMPLATE_POPUP({
    popupId,
    tipsyDirection,
    hasEnglishAlphabets,
    fullTitle,
    finalLink,
    dateString,
    authorText,
    abstract,
  });

  const $popup = $(htmlString);
  $(element).parent().append($popup);

  let summaryLoaded = false;
  let llmSummary = "";
  let codeLoaded = false;
  let codeContent = "";
  let isProcessing = false;
  let isButtonClicked = false;
  let showingSummary = false;
  let isMouseOverPopup = false;
  let isMouseOverLink = false;
  let activePopup = $popup;
  let activeLink = element;

  // Add hover state tracking for the popup
  $popup.on({
    mouseenter: function () {
      isMouseOverPopup = true;
    },
    mouseleave: function () {
      isMouseOverPopup = false;
      checkShouldClosePopup();
    },
    click: function (e) {
      // Prevent clicks on the popup from closing it
      e.stopPropagation();
    },
    mousedown: function (e) {
      // Allow text selection to work properly
      if (e.target.closest(".tipsy-inner")) {
        return true;
      }
      e.stopPropagation();
    },
  });

  // Add hover state tracking for the link
  $(element).on({
    mouseenter: function () {
      isMouseOverLink = true;
    },
    mouseleave: function () {
      isMouseOverLink = false;
      setTimeout(() => {
        checkShouldClosePopup();
      }, 100);
    },
  });

  // Function to check if popup should close
  function checkShouldClosePopup() {
    setTimeout(() => {
      if (!isMouseOverPopup && !isMouseOverLink && !isButtonClicked) {
        $popup.remove();
        activePopup = null;
        activeLink = null;
        // Notify the parent that the popup has closed
        if (onPopupClosed) {
          onPopupClosed();
        }
      }
    }, 100);
  }

  // Add click event listeners for buttons
  setupButtonEventListeners($popup, popupId, {
    link,
    abstract,
    fullTitle,
    isProcessing,
    isButtonClicked,
    summaryLoaded,
    llmSummary,
    showingSummary,
    codeLoaded,
    codeContent,
  });

  // Call the callback if provided
  if (onPopupCreated) {
    onPopupCreated($popup);
  }

  return {
    popup: $popup,
    destroy: () => {
      $popup.remove();
      activePopup = null;
      activeLink = null;
      // Notify the parent that the popup has closed
      if (onPopupClosed) {
        onPopupClosed();
      }
    },
  };
}
