/* eslint-disable no-undef */

import {
  fail,
  getGeminiFallbackReference,
  fetchDataForPaper,
  getStyle,
  getBibtexReferenceFromInternalLink,
  parseBibtexReference,
  createAndShowPopup,
} from "./alice_helper.js";

const parser = new DOMParser();
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

      // if "cite" not in href, ignore
      const linkHref = $(this).attr("href");
      if (!linkHref.includes("cite")) {
        return;
      }

      // First check if we have this citation in cached_final_refs
      const cachedFinalRefs = JSON.parse(localStorage.getItem("cached_final_refs") || "{}");
      const citationKey = linkHref.split("cite.")[1]; // e.g. "keluskar2024ambiguity"
      
      if (cachedFinalRefs[citationKey]) {
        console.log("Found cached final reference for citation:", citationKey);
        const cachedRef = cachedFinalRefs[citationKey];
        
        // Create XML entry from cached data
        const xmlDoc = document.implementation.createDocument("http://www.w3.org/2005/Atom", "entry", null);
        const entry = xmlDoc.documentElement;
        entry.setAttribute("xmlns", "http://www.w3.org/2005/Atom");

        // Add id element (link)
        const idElement = xmlDoc.createElement("id");
        idElement.textContent = cachedRef.link || "";
        entry.appendChild(idElement);

        // Add title element
        const titleElement = xmlDoc.createElement("title");
        titleElement.textContent = cachedRef.title;
        entry.appendChild(titleElement);

        // Add summary element
        const summaryElement = xmlDoc.createElement("summary");
        summaryElement.textContent = cachedRef.abstract;
        entry.appendChild(summaryElement);

        // Add published element
        const publishedElement = xmlDoc.createElement("published");
        publishedElement.textContent = `${cachedRef.year}-01-01T00:00:00Z`;
        entry.appendChild(publishedElement);

        // Add author elements
        const authors = cachedRef.authors.split(", ");
        authors.forEach(authorName => {
          const authorElement = xmlDoc.createElement("author");
          const nameElement = xmlDoc.createElement("name");
          nameElement.textContent = authorName;
          authorElement.appendChild(nameElement);
          entry.appendChild(authorElement);
        });

        // Calculate popup direction based on element position
        let tipsyDirection;
        try {
          const zoomMultiplier = currentScaleFactor || 1;
          const leftPixels = parseFloat($(this).parent().css("left")) * zoomMultiplier;
          const topPixels = parseFloat($(this).parent().css("top")) * zoomMultiplier;
          const width = parseInt($(this).parent().parent().parent().css("width"));
          const height = parseInt($(this).parent().parent().parent().css("height"));
          const northSouth = topPixels > height / 2 ? "s" : "n";
          const eastWest = leftPixels > width / 2 ? "e" : "w";
          tipsyDirection = `${northSouth}${eastWest}`;
        } catch (err) {
          console.log("Error calculating popup direction:", err);
          tipsyDirection = "ne"; // Fallback direction
        }

        console.log("Calculated tipsyDirection for cached popup:", tipsyDirection);

        // Create and show popup with cached data
        createAndShowPopup({
          element: this,
          popupId,
          tipsyDirection,
          matchingEntry: entry,
          currentScaleFactor,
          onPopupCreated: $popup => {
            activeLink = this;
            activePopup = $popup;
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

        // alert user that we are currently indexing this paper, will take a few seconds
        alert(
          "We are currently indexing this paper, please wait for 5-6 seconds. We will alert you when it's ready."
        );

        // Fetch fresh data (extract title, then get Semantic Scholar info)
        fetchDataForPaper(paperId);

        // if references are empty, then return
        if (!cachedPaperData || cachedPaperData.references.length === 0) {
          fail(this, "Paper not indexed by Alice");
          return;
        }
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
        tipsyDirection = "ne";
      }

      console.log("tipsyDirection", tipsyDirection);

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
        // Set timeout for the ArXiv API request
        httpRequest.timeout = 1000;
        httpRequest.ontimeout = function () {
          console.log(
            "ArXiv API request timed out after 1000ms, falling back to Semantic Scholar"
          );
          getGeminiFallbackReference(paperId, linkHref, currentElement)
            .then(result => {
              if (result) {
                matchingEntry = result;
                createAndShowPopup({
                  element: currentElement,
                  popupId,
                  tipsyDirection,
                  matchingEntry,
                  currentScaleFactor,
                  onPopupCreated: $popup => {
                    // Store the current element and popup as active
                    activeLink = currentElement;
                    activePopup = $popup;
                  },
                });
              }
            })
            .catch(error => {
              console.error("Error in fallback after timeout:", error);
              fail(currentElement, "Request timed out and fallback failed");
            });
        };
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
        const link = matchingEntry.getElementsByTagName("id")[0]?.textContent,
          fullTitle =
            matchingEntry.getElementsByTagName("title")[0].textContent,
          abstract =
            matchingEntry.getElementsByTagName("summary")[0].textContent,
          date = matchingEntry.getElementsByTagName("published")[0].textContent,
          rawAuthors = Array.from(
            matchingEntry.getElementsByTagName("author")
          ).map(a => a.children[0].textContent);

        // Store the data in cached_final_refs
        const citationKey = linkHref.split("cite.")[1];
        if (citationKey) {
          const cachedFinalRefs = JSON.parse(localStorage.getItem("cached_final_refs") || "{}");
          cachedFinalRefs[citationKey] = {
            title: fullTitle,
            abstract: abstract,
            authors: rawAuthors.join(", "),
            year: new Date(date).getFullYear(),
            link: link
          };
          localStorage.setItem("cached_final_refs", JSON.stringify(cachedFinalRefs));
          console.log("Stored paper data in cached_final_refs for citation:", citationKey);
        }

        // Check if we have a valid ArXiv link
        let finalLink = link;
        if (!finalLink || !finalLink.includes("arxiv.org")) {
          // Create Google Scholar search URL
          const authorString = rawAuthors.join(", ");
          const searchQuery = encodeURIComponent(
            `${fullTitle} by ${authorString}`
          );
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

export { fetchCitationInfo };
