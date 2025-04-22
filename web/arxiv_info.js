/* eslint-disable no-undef */

import {
  fail,
  getGeminiFallbackReference,
  postToOnlineClipboard,
  processGeminiResponse,
  cleanupCodeFromResponse,
  cleanAIIntroText,
  fetchDataForPaper,
  extractTitleWithGemini,
  fetchAndStoreSemanticScholarData,
  fetchPaperText,
  renderMarkdown,
  getStyle,
  callClaudeAPI,
  generateCodeImplementation,
  ensureMathJaxLoaded,
  containsPythonCode,
  callGeminiAPI,
  fetchWithRetry,
  getBibtexReferenceFromInternalLink,
  parseBibtexReference,
  delay,
} from "./alice_helper.js";

// Ensure DOMParser is available globally
const parser = new DOMParser();

/**
 * Class representing ArXiv paper information
 * @typedef {Object} ArxivInfo
 * @property {string} title - The title of the paper
 * @property {string} authors - The authors of the paper
 * @property {string} year - The publication year
 * @property {string} abstract - The paper abstract
 * @property {string} link - The link to the paper
 */
class ArxivInfo {
  constructor(title, authors, year, abstract, link) {
    this.title = title;
    this.authors = authors;
    this.year = year;
    this.abstract = abstract;
    this.link = link;
  }
}

function fetchCitationInfo(pdfDocument) {
  // Check if jQuery is loaded, if not, load it dynamically
  if (typeof jQuery === "undefined" || typeof $ === "undefined") {
    console.log("jQuery not loaded, loading it now...");
    return new Promise(resolve => {
      // Array of paths to try for loading jQuery
      const jqueryPaths = [];

      // Try to detect if we're in a Chrome extension context
      const isExtension = typeof chrome !== "undefined" && chrome.runtime;

      if (isExtension) {
        // Chrome extension paths
        try {
          // This is where jQuery should be in the extension
          jqueryPaths.push(
            chrome.runtime.getURL("content/web/jquery-3.6.0.min.js")
          );
        } catch (e) {
          console.error("Failed to get Chrome extension URL:", e);
        }
      }

      // Add additional potential paths
      jqueryPaths.push("jquery-3.6.0.min.js"); // Relative to current page
      jqueryPaths.push("/web/jquery-3.6.0.min.js"); // From root
      jqueryPaths.push("../web/jquery-3.6.0.min.js"); // Up one directory
      jqueryPaths.push("./jquery-3.6.0.min.js"); // Explicit current directory

      // Log all paths we're going to try
      console.log("Will try loading jQuery from paths:", jqueryPaths);

      // Function to try loading from the next path in the array
      function tryNextPath(index) {
        if (index >= jqueryPaths.length) {
          console.error("Failed to load jQuery from all paths");
          resolve(null);
          return;
        }

        const path = jqueryPaths[index];
        console.log(
          `Trying to load jQuery from path (${index + 1}/${jqueryPaths.length}):`,
          path
        );

        const script = document.createElement("script");
        script.src = path;

        script.onload = function () {
          console.log(`jQuery loaded successfully from path: ${path}`);
          // Now that jQuery is loaded, call fetchCitationInfo again
          setTimeout(() => resolve(fetchCitationInfo(pdfDocument)), 0);
        };

        script.onerror = function () {
          console.error(`Failed to load jQuery from path: ${path}`);
          // Try the next path
          tryNextPath(index + 1);
        };

        document.head.appendChild(script);
      }

      // Start trying from the first path
      tryNextPath(0);
    });
  }

  // jQuery is available, proceed with initialization
  console.log("Initializing ArXiv info with jQuery available");

  // Initialize mouse tracking variables
  let isMouseOverLink = false;
  let isMouseOverPopup = false;

  // current implementation calls this upon every viewer render,
  // so turn off callback before adding another one
  $("a").off();

  // Keep track of the current active popup
  let activePopup = null;
  let activeLink = null;
  let popupHoverTimeout = null;

  let currentScaleFactor = 1;

  // Add a CSS variable to the document with the scale factor
  const updateScaleFactor = () => {
    try {
      // Get the current scale factor from the document
      const container = document.querySelector(".pdfViewer .page");
      if (container) {
        const computedStyle = window.getComputedStyle(container);
        const scaleFactor =
          computedStyle.getPropertyValue("--total-scale-factor") || "1";
        currentScaleFactor = parseFloat(scaleFactor);

        // Calculate a more conservative scale factor for spacing
        // This formula ensures that spacing scales more gradually than elements
        // At scale 1, space-scale-factor = 1
        // At larger/smaller scales, space-scale-factor changes more conservatively
        const spaceScaleFactor = currentScaleFactor * 0.7 + 0.3;

        // Apply the space scale factor as a CSS variable
        document.documentElement.style.setProperty(
          "--space-scale-factor",
          spaceScaleFactor
        );

        // console.log(
        //   "Current scale factor:",
        //   currentScaleFactor,
        //   "Space scale factor:",
        //   spaceScaleFactor
        // );
      }
    } catch (err) {
      console.error("Error updating scale factor:", err);
    }
  };

  // Initial scale factor setup
  updateScaleFactor();

  // Listen for scale changes in the PDF viewer
  const eventBus = PDFViewerApplication.eventBus;
  if (eventBus) {
    eventBus._on("scalechanging", () => {
      // Update scale factor when zoom changes
      setTimeout(() => {
        updateScaleFactor();

        // If we have an active popup, close and reopen it to ensure proper scaling
        if (activePopup && activeLink) {
          const currentLink = activeLink;
          // Close current popup
          activePopup.remove();
          activePopup = null;
          activeLink = null;

          // Trigger mouseenter on the link to recreate the popup with updated scale
          $(currentLink).trigger("mouseenter");
        }
      }, 100); // Small delay to ensure CSS has updated
    });
  }

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
    mouseenter: function () {
      console.log("-" * 30);
      console.log("Finding paper data for:", $(this).attr("href"));
      console.log("-" * 30);

      // Create a unique ID for this popup to avoid selector conflicts
      const popupId = `popup-${Math.random().toString(36).substr(2, 9)}`;

      // Extract paper ID from current URL
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
      }

      if (!paperId) {
        console.error("Could not extract paper ID from URL:", currentUrl);
        // Optionally, you might want to call fail() here or return
        // fail(this, "Could not extract paper ID");
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
          // **TODO:** Use cachedPaperData to populate the popup later
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
        fetchDataForPaper(paperId);
      }

      // if "cite" not in href, ignore
      if (!$(this).attr("href").includes("cite")) {
        return;
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
      let tipsyDirection;
      try {
        // Get the current scale factor directly rather than parsing the transform
        const zoomMultiplier = currentScaleFactor || 1;

        const leftPixels =
          parseFloat($(this).parent().css("left")) * zoomMultiplier;
        const topPixels =
          parseFloat($(this).parent().css("top")) * zoomMultiplier;
        const width = parseInt($(this).parent().parent().parent().css("width"));
        const height = parseInt(
          $(this).parent().parent().parent().css("height")
        );
        const northSouth = topPixels > height / 2 ? "s" : "n";
        const eastWest = leftPixels > width / 2 ? "e" : "w";
        tipsyDirection = `${northSouth}${eastWest}`;
      } catch (err) {
        console.log(err);
        tipsyDirection = "sw";
      }

      console.log("tipsyDirection", tipsyDirection);

      const linkHref = $(this).attr("href");
      const bibtexRef = getBibtexReferenceFromInternalLink(linkHref);
      const surroundingText = $(this).parent().text().trim();

      console.log("surroundingText", surroundingText);

      // Store the current element for context and binding
      const currentElement = this;

      // Function to process title information and query ArXiv
      // This unifies both paths after obtaining title/author info
      async function processAndQueryArXiv(titleInfo, source) {
        console.log(`Processing paper info from ${source}:`, titleInfo);

        let title = null;
        let author = null;
        let year = null;

        if (typeof titleInfo === "string") {
          // If titleInfo is just a string, it's the paper title from AI extraction
          title = titleInfo;
        } else if (titleInfo && typeof titleInfo === "object") {
          // If titleInfo is an object, it's from BibTeX parsing
          year = titleInfo.year;
          author = titleInfo.author;
          title = titleInfo.title;
        } else {
          fail(
            currentElement,
            `Failed to extract title information from ${source}`
          );
          return;
        }

        console.log("title", title);
        console.log("author", author);
        console.log("year", year);

        const httpRequest = new XMLHttpRequest();
        if (!httpRequest) {
          fail(currentElement, "Failed to create XMLHttpRequest");
          return;
        }

        // search strategy: pull lots of results since the
        // title/author combination might be ambiguous
        let arxivEndpoint;
        if (title && author) {
          arxivEndpoint = `http://export.arxiv.org/api/query?search_query=ti:${title}+AND+au:${author}&start=0&max_results=50`;
        } else if (title) {
          // For AI-extracted titles, we need to handle the search differently
          if (source === "AI extraction") {
            // Extract keywords from the title by removing common stop words
            // and using only the most significant words for the search
            const titleWords = title.split(/\s+/);
            // Filter to words that are likely significant (longer than 3 chars or containing numbers)
            const keywords = titleWords
              .filter(word => word.length > 3 || /\d/.test(word))
              // Remove punctuation
              .map(word => word.replace(/[^\w\d]/g, ""))
              // Limit to 5 most relevant keywords to avoid over-constraining
              .slice(0, 5)
              .join(" ");

            console.log("Using keywords for search:", keywords);

            // Use all_fields search instead of just title for better matching
            // and properly encode the URL components
            arxivEndpoint = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
              keywords
            )}&start=0&max_results=50`;
          } else {
            // For BibTeX parsed titles, use the original strategy
            arxivEndpoint = `http://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(
              title
            )}&start=0&max_results=50`;
          }
        } else {
          fail(currentElement, "Failed to extract title from link");
          return;
        }

        // Attach all necessary data to the element before binding
        currentElement.httpRequest = httpRequest;
        currentElement.searchTitle = title;
        currentElement.searchAuthor = author;
        currentElement.searchYear = year;
        currentElement.titleSource = source;
        currentElement.isFromTitleExtraction = source === "AI extraction";

        httpRequest.onloadend = onLoadEnd.bind(currentElement);
        httpRequest.open("GET", arxivEndpoint);
        httpRequest.send();
      }

      const parsedInfo = parseBibtexReference(bibtexRef);

      let matchingEntry = null;

      // Make this an immediately invoked async function to allow using await
      (async () => {
        if (parsedInfo) {
          // Try ArXiv API first - properly handle the Promise
          try {
            await processAndQueryArXiv(parsedInfo, "BibTeX parsing");
          } catch (error) {
            console.log(
              "ArXiv API failed or returned empty results, trying Semantic Scholar fallback..."
            );
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
                currentScaleFactor,
                onPopupCreated: $popup => {
                  // Store the current element and popup as active
                  activeLink = this;
                  activePopup = $popup;
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
                currentScaleFactor,
                onPopupCreated: $popup => {
                  // Store the current element and popup as active
                  activeLink = this;
                  activePopup = $popup;
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

      async function onLoadEnd() {
        // Add this check to prevent errors with undefined httpRequest
        if (!this.httpRequest && this !== window) {
          console.log(
            "httpRequest is undefined, creating a new one for the correct context"
          );
          // This shouldn't happen anymore with our fixes but keep as safety
          this.httpRequest = httpRequest;
        }

        // Use the stored httpRequest
        const request = this.httpRequest;

        if (
          !request ||
          request.readyState !== XMLHttpRequest.DONE ||
          request.status !== 200
        ) {
          const status = request ? request.status : "undefined request";
          fail(this, `HTTP request failed with status ${status}`);
          return;
        }

        const xmlResponse = parser.parseFromString(
          request.response,
          "text/xml"
        );
        console.log("xmlResponse", xmlResponse);

        let found = false;
        for (const child of xmlResponse.children[0].children) {
          if (child.nodeName === "entry") {
            found = true;
            break;
          }
        }

        if (!found) {
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
              currentScaleFactor,
              onPopupCreated: $popup => {
                // Store the current element and popup as active
                activeLink = this;
                activePopup = $popup;
              },
            });
            console.log("Created popup");
          }
        }

        for (const entry of xmlResponse.children[0].children) {
          if (entry.nodeName !== "entry") {
            continue;
          }

          // Use the properties attached to the element
          const isFromTitleExtraction = this.isFromTitleExtraction;
          const title = this.searchTitle;
          const author = this.searchAuthor;
          const year = this.searchYear;
          const source = this.titleSource;

          // If we came from the Gemini title extraction path, be more flexible with matching
          // since we might not have author information
          if (isFromTitleExtraction) {
            // For the title extraction path, we need to manually check if the title is a good match
            console.log("Using AI-extracted title, checking for best match");

            // Get all possible entries and score them
            const possibleEntries = [];

            for (const entry of xmlResponse.getElementsByTagName("entry")) {
              if (entry.getElementsByTagName("title").length > 0) {
                const entryTitle =
                  entry.getElementsByTagName("title")[0].textContent;

                // Calculate a simple similarity score
                const entryTitleLower = entryTitle.toLowerCase();
                const searchTitleLower = title.toLowerCase();

                // Count how many words from our search title appear in the entry title
                const searchWords = searchTitleLower.split(/\s+/);
                let matchedWords = 0;

                for (const word of searchWords) {
                  if (
                    word.length > 3 &&
                    entryTitleLower.includes(word.toLowerCase())
                  ) {
                    matchedWords++;
                  }
                }

                const score = matchedWords / searchWords.length;
                console.log(`Entry: "${entryTitle}" - Score: ${score}`);

                // Add to possible entries if score is decent
                if (score > 0.3) {
                  possibleEntries.push({ entry, score });
                }
              }
            }

            // Sort by score descending
            possibleEntries.sort((a, b) => b.score - a.score);

            // Take the best match if available
            if (possibleEntries.length > 0) {
              console.log(
                `Found best match with score ${possibleEntries[0].score}`
              );
              matchingEntry = possibleEntries[0].entry;
              break;
            } else {
              // Try a more lenient approach - take first entry if any exist
              const entries = xmlResponse.getElementsByTagName("entry");
              if (entries.length > 0) {
                console.log(
                  "No good matches found, taking first available entry"
                );
                matchingEntry = entries[0];
                break;
              }
            }
          } else if (title && !author) {
            // For the title extraction path, just take the first entry
            // as we've already filtered by title in the API query
            console.log("Using title only (no author), taking first entry");
            matchingEntry = entry;
            break;
          } else {
            // Original matching logic for BibTeX references
            if (
              entry.getElementsByTagName("published").length > 0 &&
              entry
                .getElementsByTagName("published")[0]
                .textContent.includes(year) &&
              entry.getElementsByTagName("author").length > 0 &&
              entry
                .getElementsByTagName("author")[0]
                .children[0].textContent.toLocaleLowerCase()
                .endsWith(author) &&
              entry.getElementsByTagName("title").length > 0 &&
              entry
                .getElementsByTagName("title")[0]
                .textContent.toLocaleLowerCase()
                .startsWith(title)
            ) {
              if (matchingEntry) {
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
                    currentScaleFactor,
                    onPopupCreated: $popup => {
                      // Store the current element and popup as active
                      activeLink = this;
                      activePopup = $popup;
                    },
                  });
                  console.log("Created popup");
                }
                // multiple matches, bibtex is ambiguous
                fail(
                  this,
                  "Multiple matching entries found for this reference"
                );
                return;
              }
              matchingEntry = entry;
            }
          }
        }

        if (!matchingEntry) {
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
              currentScaleFactor,
              onPopupCreated: $popup => {
                // Store the current element and popup as active
                activeLink = this;
                activePopup = $popup;
              },
            });
            console.log("Created popup");
          }
          fail(this, "No matching entries found for this reference");
          return;
        }

        console.log("matchingEntry", matchingEntry);

        // check if user is still hovering before adding to DOM
        if ($(this).parent().find("a:hover").length === 0) {
          return;
        }
        if (
          matchingEntry.getElementsByTagName("id").length === 0 ||
          matchingEntry.getElementsByTagName("title").length === 0 ||
          matchingEntry.getElementsByTagName("author").length === 0 ||
          matchingEntry.getElementsByTagName("summary").length === 0 ||
          matchingEntry.getElementsByTagName("published").length === 0
        ) {
          fail(this, "Missing required fields in the matching entry");
          return;
        }
        const link = matchingEntry.getElementsByTagName("id")[0].textContent,
          fullTitle =
            matchingEntry.getElementsByTagName("title")[0].textContent,
          abstract =
            matchingEntry.getElementsByTagName("summary")[0].textContent,
          date = matchingEntry.getElementsByTagName("published")[0].textContent,
          rawAuthors = Array.from(
            matchingEntry.getElementsByTagName("author")
          ).map(a => a.children[0].textContent);

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
              authorWords.slice(0, 16).join(" ") +
              ` and ${excessWordsCount} others`;
          }
        }

        const dateStringOptions = {
          year: "numeric",
          month: "short",
          day: "numeric",
        };
        const dateString = new Intl.DateTimeFormat(
          "en-US",
          dateStringOptions
        ).format(new Date(date));

        // Restrict author text to 16 words, otherwise add count of excess authors
        const authors = authorText.split(/\s+/);
        if (authors.length > 16) {
          const excessAuthorsCount = authors.length - 16;
          authorText =
            authors.slice(0, 16).join(" ") +
            ` and ${excessAuthorsCount} others`;
        }

        // Load required libraries if not already loaded
        if (!window.marked && !$('script[src*="marked"]').length) {
          // Use createElement and setAttribute instead of direct HTML injection to comply with CSP
          const script = document.createElement("script");
          script.src = "marked.min.js";
          script.async = true;
          document.head.appendChild(script);
        }

        // Add CSS for toggle switch
        if (!$("#arxiv-toggle-style").length) {
          // Create style element properly to comply with CSP
          const style = document.createElement("style");
          style.id = "arxiv-toggle-style";
          style.textContent = getStyle();
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

        // Create and show the popup
        const { popup, destroy } = await createAndShowPopup({
          element: this,
          popupId,
          tipsyDirection,
          matchingEntry,
          currentScaleFactor,
          onPopupCreated: $popup => {
            // Store the current element and popup as active
            activeLink = this;
            activePopup = $popup;
          },
        });

        console.log("Created popup");
      }
    },
  });
}

// Function to create and show the popup with paper data
async function createAndShowPopup({
  element, // The element that triggered the popup
  popupId, // Unique ID for the popup
  tipsyDirection, // Direction for the popup (n/s + e/w)
  matchingEntry, // XML entry containing paper data (title, authors, abstract, etc.)
  currentScaleFactor = 1, // Current scale factor for the UI
  onPopupCreated = null, // Optional callback when popup is created
}) {
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

  // Destructure paper data with defaults
  const {
    title: fullTitle = "",
    authors: rawAuthors = [],
    abstract = "",
    date = "",
    link = "",
  } = paperData;

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

  const dateStringOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
  };
  const dateString = new Intl.DateTimeFormat("en-US", dateStringOptions).format(
    new Date(date)
  );

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
    style.textContent = getStyle();
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
  const htmlString = `
    <div id="${popupId}" class="tipsy tipsy-${tipsyDirection}" style="font-family: 'Solway', serif;">
    <div class="tipsy-arrow"></div>
    <div class="tipsy-inner" style="font-family: 'Solway', serif; padding: calc(10px * var(--total-scale-factor, 1));">
    ${
      tipsyDirection.startsWith("n")
        ? `
      <!-- Header at top for north orientations -->
      <div class="arxiv-header" style="margin-bottom: 10px; border-bottom: 2px solid #000; border-spacing: 5px;">  
        <div class="arxiv-title-row">
          <div class="arxiv-main-content"> 
            <div style="display: flex; align-items: center; gap: calc(10px * var(--space-scale-factor));">
              <span class="arxiv-title" style="font-family: 'Solway', serif;font-size: calc(12px * var(--total-scale-factor, 1));">${fullTitle}</span>
              <a href="${link}" title="View paper on arXiv" target="_blank" class="arxiv-link" aria-label="View paper on arXiv" style="display: inline-flex; align-items: center;"><img src="images/link-icon.svg" alt="External link to arXiv paper" width="calc(14px * var(--total-scale-factor, 1))" height="calc(14px * var(--total-scale-factor, 1))" style="margin-left: calc(5px * var(--space-scale-factor));"/></a>
            </div>
            <div class="arxiv-info-row">
              <div class="arxiv_info_author" style="font-family: 'Solway', serif;">${authorText}</div>
              <div class="arxiv_info_date" style="font-family: 'Solway', serif;">Published on ${dateString}.</div>
            </div>
          </div>
          <div class="arxiv-controls">
            <button class="alice-toggle" style="margin-bottom: 5px; vertical-align: middle;" data-view="abstract">Summary</button>
            <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle; display: none;" data-view="code">Code</button>
            <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle;" data-view="bibtex">BibTex</button>
          </div>
        </div>
          ‎  
      </div>

      <div class="arxiv_info_content" style="font-family: 'Solway', serif;">
        <div class="arxiv_info_abstract markdown-content" style="font-family: 'Solway', serif;">${abstract}</div>
      </div>
    `
        : `
      <!-- Content first for south orientations -->
      <div class="arxiv_info_content" style="font-family: 'Solway', serif;">
        <div class="arxiv_info_abstract markdown-content" style="font-family: 'Solway', serif;">${abstract}</div>
      </div>
      
      <div class="arxiv-header" style="margin-top: 10px; border-top: 2px solid #000; border-spacing: 5px;">
      
      ‎  
      
      <div class="arxiv-title-row">
          <div class="arxiv-main-content">
            <div style="display: flex; align-items: center; gap: calc(10px * var(--space-scale-factor));">
              <span class="arxiv-title" style="font-family: 'Solway', serif;font-size: calc(12px * var(--total-scale-factor, 1));">${fullTitle}</span>
              <a href="${link}" title="View paper on arXiv" target="_blank" class="arxiv-link" aria-label="View paper on arXiv"><img src="images/link-icon.svg" alt="External link to arXiv paper" width="calc(14px * var(--total-scale-factor, 1))" height="calc(14px * var(--total-scale-factor, 1))"/></a>
            </div>
            <div class="arxiv-info-row">
              <div class="arxiv_info_author" style="font-family: 'Solway', serif;">${authorText}</div>
              <div class="arxiv_info_date" style="font-family: 'Solway', serif;">Published on ${dateString}.</div>
            </div>
          </div>
          <div class="arxiv-controls">
            <button class="alice-toggle" style="margin-bottom: 5px; vertical-align: middle;" data-view="abstract">Summary</button>
            <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle; display: none;" data-view="code">Code</button>
            <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle;" data-view="bibtex">BibTex</button>
          </div>
        </div>
      </div>
    `
    }
    </div>
    </div>`;

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
    },
  };
}

// Helper function to set up button event listeners
function setupButtonEventListeners($popup, popupId, state) {
  let {
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
  } = state;

  // Add click event listener to the toggle button
  $(`#${popupId} .alice-toggle[data-view="abstract"]`).on(
    "click",
    async function (e) {
      e.stopPropagation();
      e.preventDefault();

      console.log("Summary/Abstract button clicked");

      // Mark that the button was clicked to prevent popup from closing
      isButtonClicked = true;
      setTimeout(() => {
        isButtonClicked = false;
      }, 500);

      if (isProcessing) return;

      // Toggle active state based on current view
      const currentView = $(this).attr("data-view");
      if (currentView === "abstract") {
        $(this).attr("data-view", "summary");
        $(this).text("‎Abstract‎");
        $(this).addClass("active");
        showingSummary = true;
      } else {
        $(this).attr("data-view", "abstract");
        $(this).text("Summary");
        $(this).removeClass("active");
        showingSummary = false;
      }

      $(this)
        .closest(".arxiv-controls")
        .find(".alice-toggle")
        .not(this)
        .removeClass("active");

      const contentDiv = $(this)
        .closest(".tipsy-inner")
        .find(".arxiv_info_content");
      const abstractDiv = contentDiv.find(".arxiv_info_abstract");

      $(`#${popupId}-code-content`).hide();
      $(`#${popupId}-abstract-content`).show();

      if (showingSummary && !summaryLoaded) {
        isProcessing = true;
        abstractDiv.html("<div>Fetching AI summary...</div>");

        try {
          let arxivText;
          try {
            const arxivEndpoint = link;
            const arxivIdMatch = arxivEndpoint.match(/abs\/([^\/]+)/);
            let arxivId = null;

            if (arxivIdMatch && arxivIdMatch[1]) {
              arxivId = arxivIdMatch[1];
              console.log("Extracted arXiv ID:", arxivId);

              const apiEndpoint = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
              console.log("Using ArXiv API endpoint:", apiEndpoint);

              const apiResponse = await fetchWithRetry(apiEndpoint, {}, 2);
              const xmlData = await apiResponse.text();
              const xmlDoc = parser.parseFromString(xmlData, "text/xml");

              const summary = xmlDoc.querySelector("summary")?.textContent || "";
              const title = xmlDoc.querySelector("title")?.textContent || "";
              const authors = Array.from(xmlDoc.querySelectorAll("author name"))
                .map(el => el.textContent)
                .join(", ");

              arxivText = `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
              console.log("Successfully extracted paper data from ArXiv API:", arxivText);
            } else {
              // If we can't extract the ID, try searching by title
              console.log("Could not extract arXiv ID, searching by title");
              const titleWords = fullTitle.split(/\s+/);
              // Filter to words that are likely significant (longer than 3 chars or containing numbers)
              const keywords = titleWords
                .filter(word => word.length > 3 || /\d/.test(word))
                // Remove punctuation
                .map(word => word.replace(/[^\w\d]/g, ""))
                // Limit to 5 most relevant keywords to avoid over-constraining
                .slice(0, 5)
                .join(" ");

              console.log("Using keywords for search:", keywords);

              // Use all_fields search instead of just title for better matching
              const searchEndpoint = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keywords)}&start=0&max_results=1`;
              console.log("Using ArXiv search endpoint:", searchEndpoint);

              const searchResponse = await fetchWithRetry(searchEndpoint, {}, 2);
              const searchData = await searchResponse.text();
              const searchDoc = parser.parseFromString(searchData, "text/xml");

              const firstEntry = searchDoc.querySelector("entry");
              if (!firstEntry) {
                throw new Error("No matching papers found in ArXiv search");
              }

              // Extract all necessary information from the search result
              const title = firstEntry.querySelector("title")?.textContent || "";
              const summary = firstEntry.querySelector("summary")?.textContent || "";
              const authors = Array.from(firstEntry.querySelectorAll("author name"))
                .map(el => el.textContent)
                .join(", ");

              // Construct the arxivText in the same format as the direct API response
              arxivText = `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
              console.log("Successfully extracted paper data from ArXiv search:", arxivText);
            }
          } catch (error) {
            console.error("Error fetching from ArXiv:", error);
            throw new Error(
              `Failed to fetch article from arXiv: ${error.message}. ArXiv blocks direct content access due to CORS restrictions.`
            );
          }

          if (!arxivText || arxivText.trim() === "") {
            throw new Error("Failed to extract paper content from ArXiv");
          }

          try {
            let geminiResult;
            let retryCount = 0;
            let llmSummaryContent = "";
            let containsCode = false;

            do {
              if (retryCount > 0) {
                abstractDiv.html(
                  `<div>Retry ${retryCount}/3: Improving summary format...</div>`
                );
              }

              geminiResult = await callGeminiAPI(arxivText, retryCount);
              console.log(
                `Gemini API response (attempt ${retryCount + 1}):`,
                geminiResult
              );

              llmSummaryContent = await processGeminiResponse(geminiResult);
              console.log("LLM summary content:", llmSummaryContent);

              containsCode = containsPythonCode(llmSummaryContent);

              if (containsCode) {
                console.log(`Detected code in response, retry ${retryCount + 1}`);
                retryCount++;
              }
            } while (containsCode && retryCount < 3);

            if (containsCode) {
              llmSummaryContent = cleanupCodeFromResponse(llmSummaryContent);
            }

            llmSummary = llmSummaryContent;

            if (
              typeof llmSummary === "string" &&
              !llmSummary.startsWith('<div class="main-points">')
            ) {
              llmSummary = cleanAIIntroText(llmSummary);
            }

            summaryLoaded = true;
            abstractDiv.html(llmSummary);
          } catch (error) {
            if (error.message.includes("429")) {
              throw new Error(
                "AI summary service is currently busy. Please try again in a few minutes."
              );
            } else {
              throw error;
            }
          }
        } catch (error) {
          console.error("Error generating summary:", error);
          abstractDiv.html(
            `<div style="color: red;">Error: ${error.message}</div>`
          );
        } finally {
          isProcessing = false;
        }
      } else if (showingSummary && summaryLoaded) {
        abstractDiv.html(llmSummary);
      } else {
        abstractDiv.html(abstract);
      }
    }
  );

  // Add click event listener for the Code button
  $(`#${popupId} .alice-toggle[data-view="code"]`).on(
    "click",
    async function (e) {
      e.stopPropagation();
      e.preventDefault();

      console.log("Code button clicked");

      $(this)
        .addClass("active")
        .siblings(".alice-toggle")
        .removeClass("active");

      isButtonClicked = true;
      setTimeout(() => {
        isButtonClicked = false;
      }, 500);

      if (isProcessing) return;

      $(`#${popupId}-abstract-content`).hide();
      $(`#${popupId}-code-content`).show();

      if (!codeLoaded) {
        isProcessing = true;
        const codeContentDiv = $(`#${popupId}-code-content .tipsy-code`);

        codeContentDiv.html(
          "<div class='code-loading'>Loading code examples...</div>"
        );

        try {
          const paperText = await fetchPaperText(link);

          if (!paperText) {
            throw new Error("Could not fetch paper text");
          }

          const codeImplementation = await generateCodeImplementation(
            paperText,
            fullTitle
          );

          codeContent = codeImplementation;

          codeContentDiv.html(`
            <div class="code-implementation">
              <pre style="background-color: rgba(0,0,0,0.1); padding: calc(10px * var(--total-scale-factor, 1)); border-radius: calc(4px * var(--total-scale-factor, 1)); white-space: pre-wrap; word-break: break-word; color: white;">${codeImplementation}</pre>
              <button class="copy-button">Copy to Clipboard</button>
            </div>
          `);

          codeContentDiv.find(".copy-button").on("click", function () {
            navigator.clipboard
              .writeText(codeImplementation)
              .then(() => {
                $(this).text("Copied!");
                setTimeout(() => {
                  $(this).text("Copy to Clipboard");
                }, 2000);
              })
              .catch(err => {
                console.error("Could not copy text: ", err);
                $(this).text("Failed to copy");
                setTimeout(() => {
                  $(this).text("Copy to Clipboard");
                }, 2000);
              });
          });

          codeLoaded = true;
        } catch (error) {
          console.error("Error loading code implementation:", error);
          codeContentDiv.html(`
            <div style="text-align: center; padding: calc(20px * var(--total-scale-factor, 1)); background: rgba(0,0,0,0.1); border: calc(1px * var(--total-scale-factor, 1)) solid rgba(255,255,255,0.2); border-radius: calc(5px * var(--total-scale-factor, 1)); color: white;">
              <div style="margin-bottom: calc(15px * var(--total-scale-factor, 1));">
                <svg xmlns="http://www.w3.org/2000/svg" width="calc(24px * var(--total-scale-factor, 1))" height="calc(24px * var(--total-scale-factor, 1))" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              </div>
              <div style="font-weight: 500;">${error.message || "Failed to generate code implementation. Please try again later."}</div>
            </div>
          `);
        } finally {
          isProcessing = false;
        }
      }
    }
  );

  // Add click event listener for BibTex button
  $(`#${popupId} .alice-toggle[data-view="bibtex"]`).on(
    "click",
    async function (e) {
      e.stopPropagation();
      e.preventDefault();

      console.log("BibTex button clicked");

      isButtonClicked = true;
      setTimeout(() => {
        isButtonClicked = false;
      }, 500);

      if (isProcessing) return;

      const isCurrentlyActive = $(this).hasClass("active");

      if (isCurrentlyActive) {
        $(this).removeClass("active");

        const contentDiv = $(this)
          .closest(".tipsy-inner")
          .find(".arxiv_info_content");
        const abstractDiv = contentDiv.find(".arxiv_info_abstract");

        abstractDiv.html(abstract);
      } else {
        $(this).addClass("active");

        $(this)
          .closest(".arxiv-controls")
          .find(".alice-toggle")
          .not(this)
          .removeClass("active");

        const contentDiv = $(this)
          .closest(".tipsy-inner")
          .find(".arxiv_info_content");
        const abstractDiv = contentDiv.find(".arxiv_info_abstract");

        $(`#${popupId}-code-content`).hide();
        $(`#${popupId}-abstract-content`).show();

        isProcessing = true;
        abstractDiv.html("<div>Fetching BibTex...</div>");

        try {
          const arxivEndpoint = link;
          const arxivIdMatch = arxivEndpoint.match(/abs\/([^\/]+)/);
          let arxivId = null;

          if (arxivIdMatch && arxivIdMatch[1]) {
            arxivId = arxivIdMatch[1];
            console.log("Extracted arXiv ID for BibTex:", arxivId);
          } else {
            // If we can't extract the ID, try searching by title
            console.log("Could not extract arXiv ID, searching by title");
            const titleWords = fullTitle.split(/\s+/);
            // Filter to words that are likely significant (longer than 3 chars or containing numbers)
            const keywords = titleWords
              .filter(word => word.length > 3 || /\d/.test(word))
              // Remove punctuation
              .map(word => word.replace(/[^\w\d]/g, ""))
              // Limit to 5 most relevant keywords to avoid over-constraining
              .slice(0, 5)
              .join(" ");

            console.log("Using keywords for search:", keywords);

            // Use all_fields search instead of just title for better matching
            const searchEndpoint = `http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keywords)}&start=0&max_results=1`;
            console.log("Using ArXiv search endpoint:", searchEndpoint);

            const searchResponse = await fetchWithRetry(searchEndpoint, {}, 2);
            const searchData = await searchResponse.text();
            const parser = new DOMParser();
            const searchDoc = parser.parseFromString(searchData, "text/xml");

            const firstEntry = searchDoc.querySelector("entry");
            if (!firstEntry) {
              throw new Error("No matching papers found in ArXiv search");
            }

            // Extract the ID from the first entry's ID field
            const idUrl = firstEntry.querySelector("id")?.textContent;
            const searchIdMatch = idUrl?.match(/abs\/([^\/]+)/);
            if (!searchIdMatch || !searchIdMatch[1]) {
              throw new Error("Could not extract arXiv ID from search result");
            }
            arxivId = searchIdMatch[1];
            console.log("Found arXiv ID from search:", arxivId);
          }

          if (arxivId) {
            const bibtexData = await fetchBibTexData(arxivId);

            const bibtexHtml = `
              <div style="position: relative;">
                <pre style="white-space: pre-wrap; word-wrap: break-word; margin-bottom: 30px; font-family: 'Solway', serif; font-size: calc(10px * var(--total-scale-factor, 1));">${bibtexData}</pre>
                <button id="${popupId}-copy-bibtex" class="alice-toggle" style="position: absolute; bottom: 0; right: 0; padding-left: 10px; padding-right: 10px;">Copy to clipboard</button>
              </div>
            `;

            abstractDiv.html(bibtexHtml);

            $(`#${popupId}-copy-bibtex`).on("click", function (e) {
              e.stopPropagation();
              navigator.clipboard
                .writeText(bibtexData)
                .then(() => {
                  const originalText = $(this).text();
                  $(this).text("Copied!");
                  setTimeout(() => {
                    $(this).text(originalText);
                  }, 2000);
                })
                .catch(err => {
                  console.error("Failed to copy text: ", err);
                });
            });
          } else {
            abstractDiv.html(
              "<div>Could not find arXiv ID for this paper.</div>"
            );
          }
        } catch (error) {
          console.error("Error fetching BibTex:", error);
          abstractDiv.html("<div>Error fetching BibTex information.</div>");
        } finally {
          isProcessing = false;
        }
      }
    }
  );
}

// Helper function to fetch BibTex data from API
async function fetchBibTexData(arxivId) {
  try {
    const bibtexUrl = `https://api.aryankeluskar.com/api/bibtex?arxiv_id=${arxivId}`;
    const response = await fetchWithRetry(bibtexUrl, {}, 3);
    return await response.text();
  } catch (error) {
    console.error("Error fetching BibTex data:", error);
    throw error;
  }
}

export { fetchCitationInfo };
