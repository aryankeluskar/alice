/* eslint-disable no-undef */

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

function getBibtexReferenceFromInternalLink(link) {
  const chunks = link.split("#");
  if (chunks.length < 2) {
    return null;
  }
  if (!chunks[1].startsWith("cite.")) {
    return null;
  }
  return chunks[1].substr(5);
}

function parseBibtexReference(bibtexRef) {
  const regex = /^([a-zA-Z]+)(\d{4})([a-zA-Z]+)$/g;
  const match = regex.exec(bibtexRef);
  if (match) {
    return { author: match[1], year: match[2], title: match[3] };
  }
  return null;
}

// Utility function to add delay with exponential backoff
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Retry function with exponential backoff
async function fetchWithRetry(url, options, maxRetries = 3) {
  let retries = 0;
  let lastError;

  // Add CORS proxy for ArXiv API requests if needed
  if (url.startsWith('http://export.arxiv.org') && !url.startsWith('https://')) {
    // Use HTTPS instead of HTTP
    url = url.replace('http://', 'https://');
    console.log(`Converted ArXiv API URL to HTTPS: ${url}`);
  }

  while (retries < maxRetries) {
    try {
      console.log(`Fetching ${url} (attempt ${retries + 1}/${maxRetries})`);
      const response = await fetch(url, options);

      // If it's a rate limit error, retry with exponential backoff
      if (response.status === 429) {
        const retryAfter =
          response.headers.get("Retry-After") || Math.pow(2, retries);
        const waitTime = parseInt(retryAfter, 10) * 1000;

        console.log(`Rate limited. Retrying after ${waitTime}ms...`);
        await delay(waitTime);
        retries++;
        continue;
      }

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      return response;
    } catch (error) {
      lastError = error;
      
      // Log more details about the error
      console.error(`Fetch error (attempt ${retries + 1}/${maxRetries}):`, {
        url,
        errorMessage: error.message,
        errorType: error.name
      });

      if (retries === maxRetries - 1) {
        break;
      }

      // Wait with exponential backoff before retrying for other errors
      const waitTime = Math.pow(2, retries) * 1000;
      console.log(`Error fetching. Retrying after ${waitTime}ms...`, error);
      await delay(waitTime);
      retries++;
    }
  }

  // If we've exhausted all retries, throw the last error
  throw lastError;
}

// Function to extract paper title from link using Perplexity's Sonar-pro API
async function extractPaperTitleFromLink(
  linkHref,
  surroundingText = "",
  element = null
) {
  // Debug mode flag - set to true to see more details in console
  const DEBUG = true;

  linkHref = linkHref.split("#cite.")[1];

  // Use api.aryankeluskar.com as a proxy for Perplexity API
  const apiEndpoint = "https://api.aryankeluskar.com/api/perplexity";

  if (DEBUG)
    console.log(
      "Attempting to extract paper title from link using Perplexity:",
      linkHref
    );

  // Get more context from the document if possible
  let enhancedContext = surroundingText;
  if (element) {
    // Try to get more context from surrounding paragraphs
    const parentParagraph = $(element).closest("p, div");
    if (parentParagraph.length) {
      enhancedContext = parentParagraph.text().trim();
    }

    // Get the link text itself which often contains part of the title
    const linkText = $(element).text().trim();
    if (linkText && linkText.length > 0) {
      enhancedContext = `Link Text: ${linkText}\nSurrounding Text: ${enhancedContext}`;
    }
  }

  try {
    const response = await fetchWithRetry(
      apiEndpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          prompt: `The following is how a research paper was short-hand cited in a document. Your job is to extract the title of the paper from the citation based on the surrounding text and the link text.
If you cannot confidently identify a specific academic paper title, respond with exactly "NULL" (without quotes). Return only the title of the paper and no other text.

Link: ${linkHref}`,
        }),
      },
      3
    );

    const result = await response.json();

    if (DEBUG) {
      console.log("Raw response from API proxy:", result);
    }

    // Check if we received the response in the original Perplexity format
    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
      console.error("Unexpected response structure from API proxy:", result);
      return null;
    }

    const extractedTitle = result.choices[0].message.content.trim();

    // If Perplexity couldn't find a title, it will return NULL
    if (extractedTitle === "NULL") {
      console.log("Perplexity couldn't extract a title from the link");
      return null;
    }

    console.log("Extracted paper title:", extractedTitle);
    return extractedTitle;
  } catch (error) {
    console.error("Error extracting paper title from link:", error);
    return null;
  }
}

// Function to try getting paper info from Perplexity as fallback
async function getPaperInfoFromPerplexity(author, year, title) {
  const DEBUG = true;
  const apiEndpoint = "https://api.aryankeluskar.com/api/perplexity";

  if (DEBUG) {
    console.log("Attempting to get paper info from Perplexity:", {
      author,
      year,
      title,
    });
  }

  try {
    const response = await fetchWithRetry(
      apiEndpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          prompt: `Given this information about an academic paper:
Author: ${author}
Year: ${year}
Title or Keywords: ${title}

Please identify the full title of this academic paper. If you cannot confidently identify a specific academic paper title, respond with exactly "NULL" (without quotes). Return only the title of the paper and no other text.`,
        }),
      },
      3
    );

    const result = await response.json();

    if (DEBUG) {
      console.log("Raw response from Perplexity API:", result);
    }

    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
      console.error(
        "Unexpected response structure from Perplexity API:",
        result
      );
      return null;
    }

    const extractedTitle = result.choices[0].message.content.trim();

    if (extractedTitle === "NULL") {
      console.log("Perplexity couldn't find paper info");
      return null;
    }

    console.log("Extracted paper title from Perplexity:", extractedTitle);
    return extractedTitle;
  } catch (error) {
    console.error("Error getting paper info from Perplexity:", error);
    return null;
  }
}

function initializeArxivInfo(pdfDocument) {
  // Check if jQuery is loaded, if not, load it dynamically
  if (typeof jQuery === 'undefined' || typeof $ === 'undefined') {
    console.log("jQuery not loaded, loading it now...");
    return new Promise((resolve) => {
      // Array of paths to try for loading jQuery
      const jqueryPaths = [];
      
      // Try to detect if we're in a Chrome extension context
      const isExtension = typeof chrome !== 'undefined' && chrome.runtime;
      
      if (isExtension) {
        // Chrome extension paths
        try {
          // This is where jQuery should be in the extension
          jqueryPaths.push(chrome.runtime.getURL('content/web/jquery-3.6.0.min.js'));
        } catch (e) {
          console.error("Failed to get Chrome extension URL:", e);
        }
      }
      
      // Add additional potential paths
      jqueryPaths.push('jquery-3.6.0.min.js'); // Relative to current page
      jqueryPaths.push('/web/jquery-3.6.0.min.js'); // From root
      jqueryPaths.push('../web/jquery-3.6.0.min.js'); // Up one directory
      jqueryPaths.push('./jquery-3.6.0.min.js'); // Explicit current directory
      
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
        console.log(`Trying to load jQuery from path (${index + 1}/${jqueryPaths.length}):`, path);
        
        const script = document.createElement('script');
        script.src = path;
        
        script.onload = function() {
          console.log(`jQuery loaded successfully from path: ${path}`);
          // Now that jQuery is loaded, call initializeArxivInfo again
          setTimeout(() => resolve(initializeArxivInfo(pdfDocument)), 0);
        };
        
        script.onerror = function() {
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
        const scaleFactor = computedStyle.getPropertyValue('--total-scale-factor') || "1";
        currentScaleFactor = parseFloat(scaleFactor);
        
        // Calculate a more conservative scale factor for spacing
        // This formula ensures that spacing scales more gradually than elements
        // At scale 1, space-scale-factor = 1
        // At larger/smaller scales, space-scale-factor changes more conservatively
        const spaceScaleFactor = currentScaleFactor * 0.7 + 0.3;
        
        // Apply the space scale factor as a CSS variable
        document.documentElement.style.setProperty('--space-scale-factor', spaceScaleFactor);
        
        // We don't need to set the total-scale-factor as PDF.js already sets it on the page
        // We just need to make sure our popup is aware of it
        console.log("Current scale factor:", currentScaleFactor, "Space scale factor:", spaceScaleFactor);
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
          $(currentLink).trigger('mouseenter');
        }
      }, 100); // Small delay to ensure CSS has updated
    });
  }

  // Add a click event on the document to close popups when clicking outside
  $(document).on('click', function(e) {
    // If the user is selecting text, don't close the popup
    if (window.getSelection && window.getSelection().toString().length > 0) {
      return;
    }
    
    // If we have an active popup and the click is outside the popup and its trigger link
    if (activePopup && 
        !$(e.target).closest(activePopup).length && 
        (!activeLink || !$(e.target).closest($(activeLink)).length)) {
      // Remove the popup
      activePopup.remove();
      // Reset active variables
      activePopup = null;
      activeLink = null;
    }
  });

  $("a").on({
    mouseenter: function() {
      console.log($(this).attr("href"));

      // if "cite" not in href, ignore
      if (!$(this).attr("href").includes("cite")) {
        return;
      }

      // Check if activePopup exists but is no longer in the DOM
      if (activePopup && !$.contains(document.documentElement, activePopup[0])) {
        console.log("Active popup no longer in DOM, resetting active variables");
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

      // Create a unique ID for this popup to avoid selector conflicts
      const popupId = `popup-${Math.random().toString(36).substr(2, 9)}`;

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

      function fail(el, reason) {
        // Log the failure reason to help with debugging
        console.log(`Citation popup failed: ${reason}`, $(el).attr("href"));
        // Store the reason on the element for reference
        $(el).data("failReason", reason);
      }

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

      // Make this an immediately invoked async function to allow using await
      (async () => {
        if (parsedInfo) {
          // Try ArXiv API first - properly handle the Promise
          try {
            await processAndQueryArXiv(parsedInfo, "BibTeX parsing");
          } catch (error) {
            console.log(
              "ArXiv API failed or returned empty results, trying Perplexity fallback..."
            );
            
            try {
              // Try to get paper info from Perplexity as a fallback
              const perplexityTitle = await getPaperInfoFromPerplexity(
                parsedInfo.author,
                parsedInfo.year, 
                parsedInfo.title
              );
              
              if (perplexityTitle) {
                await processAndQueryArXiv(perplexityTitle, "Perplexity fallback");
              } else {
                fail(currentElement, "Failed to get paper info from both ArXiv and Perplexity");
              }
            } catch (perplexityError) {
              console.error("Perplexity fallback failed:", perplexityError);
              fail(currentElement, "Both ArXiv and Perplexity lookups failed");
            }
          }
        } else {
          // AI-powered fallback path
          fail(currentElement, "Failed to parse BibTeX reference");

          // Extract title using AI - properly handle the Promise
          try {
            const extractedTitle = await extractPaperTitleFromLink(linkHref, surroundingText, currentElement);
            if (!extractedTitle) {
              console.log("No title could be extracted, skipping popup");
              return;
            }

            // Process the extracted title
            await processAndQueryArXiv(extractedTitle, "AI extraction");
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

        const parser = new DOMParser();
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
          // Try Perplexity as fallback only if we have parsed info
          if (this.titleSource === "BibTeX parsing" && parsedInfo) {
            try {
              const perplexityTitle = await getPaperInfoFromPerplexity(
                parsedInfo.author,
                parsedInfo.year,
                parsedInfo.title
              );

              if (perplexityTitle) {
                console.log(
                  "Successfully got paper info from Perplexity fallback"
                );
                processAndQueryArXiv(perplexityTitle, "Perplexity fallback");
              } else {
                fail(
                  this,
                  "Failed to get paper info from both ArXiv and Perplexity"
                );
              }
            } catch (perplexityError) {
              console.error(
                "Perplexity fallback also failed:",
                perplexityError
              );
              fail(this, "Both ArXiv and Perplexity lookups failed");
            }
          } else {
            // For AI extraction path, just fail since we already tried our best match
            fail(this, "No matching entries found for this reference");
          }
        }

        let matchingEntry = null;
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
          fail(this, "No matching entries found for this reference");
          return;
        }

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

        // Update the LLM Prompt for better differentiation between main points and concise summary
        const llmPrompt =
          "Analyze this academic paper. First identify the key contributions and why they matter (main points), then provide a concise factual summary. DO NOT include any introductory text like 'Here's the summary' or 'I've analyzed'. Start directly with the content.";

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
          style.textContent = `
            .alice-toggle {
              display: inline-block;
              padding: calc(4px * var(--space-scale-factor)) calc(8px * var(--space-scale-factor));
              margin-bottom: calc(5px * var(--space-scale-factor));
              background-color: #C0A9FF;
              color: #333;
              border: calc(1px * var(--total-scale-factor, 1)) solid #ddd;
              border-radius: calc(4px * var(--total-scale-factor, 1));
              font-size: calc(10px * var(--total-scale-factor, 1));
              cursor: pointer;
              transition: all 0.2s ease;
              font-weight: 500;
              text-align: center;
              min-width: calc(70px * var(--total-scale-factor, 1));
              line-height: calc(20px * var(--total-scale-factor, 1));
              height: auto;
            }
            .alice-toggle:hover {
              background-color: #e0e0e0;
              box-shadow: 0 calc(1px * var(--total-scale-factor, 1)) calc(2px * var(--total-scale-factor, 1)) rgba(0,0,0,0.1);
            }
            .alice-toggle.active {
              background-color: #2196F3;
              color: white;
              border-color: #1976D2;
            }
            .alice-toggle.active:hover {
              background-color: #1976D2;
              box-shadow: 0 calc(1px * var(--total-scale-factor, 1)) calc(3px * var(--total-scale-factor, 1)) rgba(0,0,0,0.2);
            }
            .markdown-content h1, .markdown-content h2, .markdown-content h3 {
              margin-top: calc(0.5em * var(--space-scale-factor));
              margin-bottom: calc(0.5em * var(--space-scale-factor));
            }
            .markdown-content p {
              margin-top: calc(0.3em * var(--space-scale-factor));
              margin-bottom: calc(0.3em * var(--space-scale-factor));
            }
            .markdown-content ul, .markdown-content ol {
              padding-left: calc(1.5em * var(--space-scale-factor));
              margin-top: calc(0.3em * var(--space-scale-factor));
              margin-bottom: calc(0.3em * var(--space-scale-factor));
            }
            .markdown-content blockquote {
              margin-left: 0;
              padding-left: calc(1em * var(--space-scale-factor));
              border-left: calc(3px * var(--total-scale-factor, 1)) solid #ccc;
              color: #555;
            }
            .markdown-content code {
              padding: calc(2px * var(--space-scale-factor)) calc(4px * var(--space-scale-factor));
              border-radius: calc(3px * var(--total-scale-factor, 1));
              font-family: monospace;
            }
            .markdown-content pre code {
              display: block;
              padding: calc(0.5em * var(--space-scale-factor));
              overflow-x: auto;
            }
            .concise-summary {
              padding-top: calc(0.5em * var(--space-scale-factor));
            }
            .main-points {
              margin-bottom: calc(0.5em * var(--space-scale-factor));
            }
            .tipsy-inner {
              user-select: text;
            }
            .arxiv-header {
              position: relative;
            }
            .arxiv-main-content {
              flex: 1;
              padding-right: calc(15px * var(--space-scale-factor));
              user-select: text;
            }
            .arxiv-title-row {
              display: flex;
              flex-direction: row;
              justify-content: space-between;
              gap: calc(8px * var(--space-scale-factor));
            }
            .arxiv-title {
              flex: 1;
              margin-right: calc(5px * var(--space-scale-factor));
            }
            .arxiv-controls {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              white-space: nowrap;
              width: calc(80px * var(--total-scale-factor, 1));
              gap: calc(5px * var(--space-scale-factor));
            }
            .arxiv-link {
              display: inline-flex;
              align-items: center;
              justify-content: center;
              padding: calc(4px * var(--space-scale-factor));
              vertical-align: middle;
              margin-bottom: 0;
              position: relative;
              height: calc(14px * var(--total-scale-factor, 1));
            }
            .arxiv-link img {
              width: calc(14px * var(--total-scale-factor, 1));
              height: calc(14px * var(--total-scale-factor, 1));
              transition: transform 0.2s ease;
            }
            .arxiv-link:hover img {
              transform: scale(1.2);
            }
            .arxiv-link:focus {
              outline: calc(2px * var(--total-scale-factor, 1)) solid #2196F3;
              border-radius: calc(4px * var(--total-scale-factor, 1));
            }
            .arxiv-info-row {
              display: flex;
              flex-direction: column;
              gap: calc(4px * var(--space-scale-factor));
            }
            .arxiv-info-left {
              flex: 1;
            }
            .code-implementation {
              max-height: calc(400px * var(--total-scale-factor, 1));
              overflow-y: auto;
              padding-right: calc(10px * var(--space-scale-factor));
            }
            .code-content {
              margin-bottom: calc(15px * var(--space-scale-factor));
            }
            .copy-button {
              background-color: #C0A9FF;
              color: #555;
              border: calc(1px * var(--total-scale-factor, 1)) solid #ddd;
              border-radius: calc(4px * var(--total-scale-factor, 1));
              padding: calc(6px * var(--space-scale-factor)) calc(12px * var(--space-scale-factor));
              cursor: pointer;
              transition: all 0.2s ease;
              font-weight: 500;
              margin-top: calc(12px * var(--space-scale-factor));
              display: block;
              text-align: center;
              width: 100%;
              font-family: 'Solway', serif;
              font-size: calc(11px * var(--total-scale-factor, 1));
            }
            .copy-button:hover {
              background-color: #e0e0e0;
              box-shadow: 0 calc(1px * var(--total-scale-factor, 1)) calc(2px * var(--total-scale-factor, 1)) rgba(0,0,0,0.1);
            }
            .section-nav {
              display: flex;
              overflow-x: auto;
              margin-bottom: calc(10px * var(--space-scale-factor));
              white-space: nowrap;
              -ms-overflow-style: none;
              scrollbar-width: none;
              gap: calc(5px * var(--space-scale-factor));
            }
            .section-nav::-webkit-scrollbar {
              display: none;
            }
            .section-button {
              padding: calc(3px * var(--space-scale-factor)) calc(8px * var(--space-scale-factor));
              background-color: #f0f0f0;
              color: #333;
              border: calc(1px * var(--total-scale-factor, 1)) solid #ddd;
              border-radius: calc(12px * var(--total-scale-factor, 1));
              margin-right: calc(5px * var(--space-scale-factor));
              font-size: calc(10px * var(--total-scale-factor, 1));
              cursor: pointer;
              transition: all 0.2s ease;
            }
            .section-button:hover {
              background-color: #e0e0e0;
            }
            .loading-container {
              text-align: center;
              padding: calc(20px * var(--space-scale-factor));
            }
            .loading-animation {
              display: inline-block;
              width: calc(40px * var(--total-scale-factor, 1));
              height: calc(40px * var(--total-scale-factor, 1));
              margin: 0 auto;
              border: calc(3px * var(--total-scale-factor, 1)) solid rgba(192, 169, 255, 0.3);
              border-radius: 50%;
              border-top-color: #C0A9FF;
              animation: spin 1s ease-in-out infinite;
            }
            .clipboard-notice {
              margin-top: calc(15px * var(--space-scale-factor));
              padding: calc(10px * var(--space-scale-factor));
              background-color: #EFF8FF;
              border: calc(1px * var(--total-scale-factor, 1)) solid #BDE3FF;
              border-radius: calc(5px * var(--total-scale-factor, 1));
              font-size: calc(11px * var(--total-scale-factor, 1));
              text-align: center;
              color: #0A558C;
              font-family: 'Solway', serif;
            }
            .clipboard-notice a {
              color: #1E88E5;
              text-decoration: underline;
            }
            .clipboard-notice .clipboard-code {
              font-family: monospace;
              background: #e0e0e0;
              padding: calc(2px * var(--space-scale-factor)) calc(5px * var(--space-scale-factor));
              border-radius: calc(3px * var(--total-scale-factor, 1));
              color: #333;
              font-weight: 500;
            }
            .open-clipboard-button {
              display: block;
              margin: calc(10px * var(--space-scale-factor)) auto 0;
              padding: calc(6px * var(--space-scale-factor)) calc(12px * var(--space-scale-factor));
              background-color: #1E88E5;
              color: white;
              border: none;
              border-radius: calc(4px * var(--total-scale-factor, 1));
              font-size: calc(11px * var(--total-scale-factor, 1));
              cursor: pointer;
              transition: all 0.2s ease;
              font-family: 'Solway', serif;
              font-weight: 500;
            }
            .open-clipboard-button:hover {
              background-color: #1565C0;
              box-shadow: 0 calc(1px * var(--total-scale-factor, 1)) calc(3px * var(--total-scale-factor, 1)) rgba(0,0,0,0.2);
            }
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
            .loading-text {
              margin-top: calc(10px * var(--space-scale-factor));
              font-family: 'Solway', serif;
              color: #555;
            }
            .arxiv_info_content, .arxiv_info_abstract, .markdown-content, .code-implementation pre {
              user-select: text;
            }
            .main-points, .concise-summary, .arxiv-title, .arxiv_info_author, .arxiv_info_date {
              user-select: text;
            }
            .section-nav {
              display: flex;
              overflow-x: auto;
              margin-bottom: calc(10px * var(--space-scale-factor));
              white-space: nowrap;
              -ms-overflow-style: none;
              scrollbar-width: none;
              gap: calc(5px * var(--space-scale-factor));
            }
            .section-nav::-webkit-scrollbar {
              display: none;
            }
            .section-button {
              padding: calc(3px * var(--space-scale-factor)) calc(8px * var(--space-scale-factor));
              background-color: #f0f0f0;
              color: #333;
              border: calc(1px * var(--total-scale-factor, 1)) solid #ddd;
              border-radius: calc(12px * var(--total-scale-factor, 1));
              margin-right: calc(5px * var(--space-scale-factor));
              font-size: calc(10px * var(--total-scale-factor, 1));
              cursor: pointer;
              transition: all 0.2s ease;
            }
            .section-button:hover {
              background-color: #e0e0e0;
            }
          `;
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

        // eslint-disable-next-line no-unsanitized/method
        const htmlString = `
          <div id="${popupId}" class="tipsy tipsy-${tipsyDirection}" style="font-family: 'Solway', serif;">
          <div class="tipsy-arrow"></div>
          <div class="tipsy-inner" style="font-family: 'Solway', serif; padding: calc(10px * var(--total-scale-factor, 1));">
          ${
            tipsyDirection.startsWith("n")
              ? `
            <!-- Header at top for north orientations -->
            <div class="arxiv-header" style="margin-bottom: 10px; ">
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
                  <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle;" data-view="code">Code</button>
                </div>
              </div>
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
            
            <div class="arxiv-header" style="margin-top: 10px;">
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
                  <button class="alice-toggle" style="margin-bottom: 10px; vertical-align: middle;" data-view="code">Code</button>
                </div>
              </div>
            </div>
          `
          }
          </div>
          </div>`;

        const $popup = $(htmlString);
        $(this).parent().append($popup);

        let summaryLoaded = false;
        let llmSummary = "";
        let codeLoaded = false;
        let codeContent = "";
        let isProcessing = false;
        let isButtonClicked = false;
        let showingSummary = false;

        // Add hover state tracking for the popup
        $popup.on({
          mouseenter: function() {
            isMouseOverPopup = true;
          },
          mouseleave: function() {
            isMouseOverPopup = false;
            checkShouldClosePopup();
          },
          click: function(e) {
            // Prevent clicks on the popup from closing it
            e.stopPropagation();
          },
          mousedown: function(e) {
            // Allow text selection to work properly
            // Don't stop propagation for mousedown events that might start text selection
            if (e.target.closest('.tipsy-inner')) {
              // Don't do anything special, allow default behavior for text selection
              return true;
            }
            e.stopPropagation();
          }
        });
        
        // Add hover state tracking for the link
        $(this).on({
          mouseenter: function() {
            isMouseOverLink = true;
          },
          mouseleave: function() {
            isMouseOverLink = false;
            // Give a small delay before checking to avoid flickering
            setTimeout(() => {
              checkShouldClosePopup();
            }, 100);
          }
        });
        
        // Function to check if popup should close
        function checkShouldClosePopup() {
          setTimeout(() => {
            if (!isMouseOverPopup && !isMouseOverLink && !isButtonClicked) {
              $popup.remove();
              // Reset activePopup and activeLink when removing the popup
              activePopup = null;
              activeLink = null;
            }
          }, 100);
        }

        // Function to render markdown content
        function renderMarkdown(text) {
          if (!text) return '';
          
          // Custom markdown to HTML converter
          function markdownToHtml(markdown) {
            // Escape HTML
            function escapeHtml(unsafe) {
              return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
            }
            
            let html = markdown;
            
            // Process code blocks first (```)
            html = html.replace(/```([^`]+)```/g, (match, p1) => {
              return `<pre><code>${escapeHtml(p1.trim())}</code></pre>`;
            });
            
            // Process inline code (`)
            html = html.replace(/`([^`]+)`/g, (match, p1) => {
              return `<code>${escapeHtml(p1)}</code>`;
            });
            
            // Headers (# Heading)
            html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
            html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
            html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');
            
            // Bold (**text**)
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            
            // Italic (*text*)
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            // Line breaks
            html = html.replace(/\n$/gm, '<br />');
            
            // Unordered lists
            html = html.replace(/^\s*[\-\*]\s+(.*$)/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');
            
            // Ordered lists
            html = html.replace(/^\s*\d+\.\s+(.*$)/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>)/s, '<ol style="list-style-position: inside; padding-left: 0;">$1</ol>');
            
            // Blockquotes
            html = html.replace(/^\>\s(.*$)/gm, '<blockquote>$1</blockquote>');
            
            // Links [text](url)
            html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
            
            // Paragraphs - wrap any remaining newline-separated content 
            html = html.replace(/^([^<].*[^>])$/gm, '<p>$1</p>');
            
            // Clean up any remaining newlines and extra paragraph tags
            html = html.replace(/<\/p>\s*<p>/g, '</p><p>');
            
            return html;
          }
          
          // Function to format the main points as bulleted list
          function formatMainPoints(mainPoints) {
            // Convert markdown to HTML first
            const htmlContent = markdownToHtml(mainPoints);
            
            // If it already has list items, just return it
            if (htmlContent.includes('<li>')) {
              return htmlContent;
            }
            
            // Otherwise, split the content and create list items
            const points = mainPoints.split(/\n\s*[\*\-•]\s+|\n\s*\d+\.\s+/).filter(point => point.trim());
            
            if (points.length === 0) {
              // If no bullet points detected, try splitting by newlines
              const lines = mainPoints.split('\n').filter(line => line.trim());
              const listItems = lines.map(line => `<li style="margin-bottom: 10px; list-style-type: disc; margin-left: 20px;">${markdownToHtml(line.trim())}</li>`).join('');
              return `<ul style="padding-left: 0; margin-top: 0;">${listItems}</ul>`;
            }
            
            const listItems = points.map(point => `<li style="margin-bottom: 10px; list-style-type: disc; margin-left: 20px;">${markdownToHtml(point.trim())}</li>`).join('');
            return `<ul style="padding-left: 0; margin-top: 0;">${listItems}</ul>`;
          }
          
          // Check if the content is JSON format (from AI responses)
          try {
            const jsonContent = JSON.parse(text);
            
            if (jsonContent.mainPoints && jsonContent.conciseSummary) {
              // Format JSON content to match the screenshot style
              return `
                <div style="background-color: #C0A9FF; border-radius: 8px;">
                  <h2 style="font-size: 1.2em; font-weight: bold; margin-top: 0; margin-bottom: 15px;">Main Points</h2>
                  ${formatMainPoints(jsonContent.mainPoints)}
                  <div style="margin-top: 15px; font-size: 0.9em;">
                    ${markdownToHtml(jsonContent.conciseSummary)}
                  </div>
                </div>
              `;
            }
          } catch (e) {
            // Not JSON, continue with normal markdown processing
          }
          
          return markdownToHtml(text);
        }

        // Function to ensure MathJax is loaded
        function ensureMathJaxLoaded() {
          if (window.MathJax) {
            // MathJax is already loaded
            return;
          }

          // Load MathJax if not already loaded
          if (!$('script[src*="mathjax"]').length) {
            const script = document.createElement("script");
            script.src = "mathjax-tex-mml-chtml.js";
            script.async = true;

            // Configure MathJax
            window.MathJax = {
              tex: {
                inlineMath: [
                  ["$", "$"],
                  ["\\(", "\\)"],
                ],
                displayMath: [
                  ["$$", "$$"],
                  ["\\[", "\\]"],
                ],
                processEscapes: true,
              },
              svg: {
                fontCache: "global",
              },
              startup: {
                typeset: false, // Don't process the whole page on load
              },
            };

            document.head.appendChild(script);

            // Add a load handler to process math in the popup
            script.onload = function () {
              setTimeout(() => {
                if (window.MathJax && window.MathJax.typesetPromise) {
                  window.MathJax.typesetPromise();
                }
              }, 500);
            };
          }
        }

        // Function to detect Python code
        function containsPythonCode(text) {
          // Check for common Python patterns
          const pythonPatterns = [
            /\bdef\s+\w+\s*\(/i, // function definitions
            /\bprint\s*\(/i, // print statements
            /\bimport\s+\w+/i, // import statements
            /\bclass\s+\w+/i, // class definitions
            /\bif\s+__name__\s*==\s*('|")__main__\1/i, // main block
            /\breturn\s+\w+/i, // return statements
            /\s{2,}[\w.]+\s*=/, // indented variable assignments
            /\s{2,}for\s+\w+\s+in\s+/i, // indented for loops
            /\s{2,}if\s+.*:/i, // indented if statements
            /summarizePaper\s*\(/i, // detect function calls like summarizePaper(
          ];

          return pythonPatterns.some(pattern => pattern.test(text));
        }

        // Function to make the Gemini API call
        async function callGeminiAPI(arxivText, retryCount = 0) {
          if (retryCount > 2) {
            throw new Error(
              "Failed to generate a proper summary after multiple attempts"
            );
          }

          // Use our proxy API endpoint instead of calling Gemini directly
          const geminiProxyEndpoint = "https://api.aryankeluskar.com/api/gemini";

          // Improved system prompt with clearer differentiation between main points and summary
          let systemPrompt =
            "You are a research assistant providing concise paper summaries. Format your response in Markdown, but ensure it will render properly. For main points, focus ONLY on key contributions and why they matter. For the concise summary, provide a factual overview. Start directly with the content - no introductions like 'Here's a summary'.";

          if (retryCount > 0) {
            systemPrompt +=
              " IMPORTANT: DO NOT return Python code or function calls in your response. DO NOT use print() or code syntax. Respond ONLY with natural language markdown content.";
          }

          // After 2 retries, fall back to a direct prompt instead of function calling
          if (retryCount >= 2) {
            console.log("Falling back to direct prompt after multiple retries");

            const directPromptResponse = await fetchWithRetry(
              geminiProxyEndpoint,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        {
                          text: `${llmPrompt} ${arxivText}
                        
                  Format your response in two distinct sections:
                        
                  MAIN POINTS (focus only on key contributions and why they matter):
                        
                  CONCISE SUMMARY (provide a factual overview in under 50 words):
                        
                        IMPORTANT: Start each section directly with content. No introductions, no Python code, no markdown artifacts.`,
                        },
                      ],
                    },
                  ],
                }),
              },
              3
            );

            return await directPromptResponse.json();
          }

          const geminiResponse = await fetchWithRetry(
            geminiProxyEndpoint,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [{ text: llmPrompt + arxivText }],
                  },
                ],
                // Add generation parameters for better control
                generationConfig: {
                  temperature: 0.2 + retryCount * 0.1, // Increase temperature slightly on retries
                  topP: 0.8,
                  topK: 40,
                  maxOutputTokens: 300,
                },
                systemInstruction: {
                  role: "system",
                  parts: [
                    {
                      text: systemPrompt,
                    },
                  ],
                },
                tools: [
                  {
                    functionDeclarations: [
                      {
                        name: "summarizePaper",
                        description:
                          "Summarize an academic paper in a structured format with analysis of key contributions and a factual summary",
                        parameters: {
                          type: "OBJECT",
                          properties: {
                            mainPoints: {
                              type: "STRING",
                              description:
                                "Focus ONLY on the key contributions of the paper and why they matter. What does this paper contribute to the field? Formatted in Markdown.",
                            },
                            conciseSummary: {
                              type: "STRING",
                              description:
                                "A factual summary of the paper in 50 words or less, with no overlap with the main points section. Formatted in Markdown.",
                            },
                          },
                          required: ["mainPoints", "conciseSummary"],
                        },
                      },
                    ],
                  },
                ],
                toolConfig: {
                  functionCallingConfig: {
                    mode: "AUTO",
                  },
                },
              }),
            },
            3
          );

          return await geminiResponse.json();
        }

        // Add click event listener to the toggle button
        $(`#${popupId} .alice-toggle[data-view="abstract"]`).on(
          "click",
          async function (e) {
            e.stopPropagation();
            e.preventDefault(); // Prevent default behavior
            
            console.log("Summary/Abstract button clicked");

            // Mark that the button was clicked to prevent popup from closing
            isButtonClicked = true;
            setTimeout(() => {
              isButtonClicked = false;
            }, 500); // Increase timeout to prevent accidental closing

            // Prevent multiple simultaneous requests
            if (isProcessing) {
              return;
            }

            // Toggle active state based on current view
            const currentView = $(this).attr("data-view");
            if (currentView === "abstract") {
              // Switch to AI summary
              $(this).attr("data-view", "summary");
              $(this).text("‎Abstract‎");
              $(this).addClass("active");
              showingSummary = true;
            } else {
              // Switch back to original abstract
              $(this).attr("data-view", "abstract");
              $(this).text("Summary");
              $(this).removeClass("active");
              showingSummary = false;
            }

            // Set all other buttons to inactive
            $(this)
              .closest(".arxiv-controls")
              .find(".alice-toggle")
              .not(this)
              .removeClass("active");

            const contentDiv = $(this)
              .closest(".tipsy-inner")
              .find(".arxiv_info_content");
            const abstractDiv = contentDiv.find(".arxiv_info_abstract");

            // Hide code content if visible
            $(`#${popupId}-code-content`).hide();
            $(`#${popupId}-abstract-content`).show();

            if (showingSummary && !summaryLoaded) {
              // Show loading indicator immediately
              isProcessing = true;
              abstractDiv.html("<div>Fetching AI summary...</div>");

              try {
                // Only fetch the summary when the button is clicked
                let arxivText;
                try {
                  // Define arxivEndpoint using the arXiv link from the paper
                  const arxivEndpoint = link;

                  // Extract the arXiv ID from the link
                  const arxivIdMatch = arxivEndpoint.match(/abs\/([^\/]+)/);
                  let arxivId = null;

                  if (arxivIdMatch && arxivIdMatch[1]) {
                    arxivId = arxivIdMatch[1];
                    console.log("Extracted arXiv ID:", arxivId);

                    // Use ArXiv API instead of direct fetch to avoid CORS issues
                    const apiEndpoint = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
                    console.log("Using ArXiv API endpoint:", apiEndpoint);

                    const apiResponse = await fetchWithRetry(
                      apiEndpoint,
                      {},
                      2
                    );

                    const xmlData = await apiResponse.text();
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(
                      xmlData,
                      "text/xml"
                    );

                    // Extract summary and other info from the XML
                    const summary =
                      xmlDoc.querySelector("summary")?.textContent || "";
                    const title =
                      xmlDoc.querySelector("title")?.textContent || "";
                    const authors = Array.from(
                      xmlDoc.querySelectorAll("author name")
                    )
                      .map(el => el.textContent)
                      .join(", ");

                    // Combine metadata and abstract for the AI to summarize
                    arxivText = `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
                    console.log(
                      "Successfully extracted paper data from ArXiv API"
                    );
                  } else {
                    // If we can't extract the ID, try using a CORS proxy as fallback
                    console.log(
                      "Could not extract arXiv ID, using fallback method"
                    );
                    throw new Error("Could not extract arXiv ID from link");
                  }
                } catch (error) {
                  console.error("Error fetching from ArXiv:", error);
                  throw new Error(
                    `Failed to fetch article from arXiv: ${error.message}. ArXiv blocks direct content access due to CORS restrictions.`
                  );
                }

                // Call Gemini API instead of OpenAI
                try {
                  let geminiResult;
                  let retryCount = 0;
                  let llmSummaryContent = "";
                  let containsCode = false;

                  do {
                    // If this is a retry, show that we're retrying
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

                    // Process response
                    llmSummaryContent = await processGeminiResponse(
                      geminiResult
                    );

                    // Check if we still have Python code
                    containsCode = containsPythonCode(llmSummaryContent);

                    if (containsCode) {
                      console.log(
                        `Detected code in response, retry ${retryCount + 1}`
                      );
                      retryCount++;
                    }
                  } while (containsCode && retryCount < 3);

                  // If we still have code after retries, do our best to clean it
                  if (containsCode) {
                    llmSummaryContent =
                      cleanupCodeFromResponse(llmSummaryContent);
                  }

                  llmSummary = llmSummaryContent;

                  // Ensure the summary doesn't have AI introduction text
                  if (
                    typeof llmSummary === "string" &&
                    !llmSummary.startsWith('<div class="main-points">')
                  ) {
                    llmSummary = cleanAIIntroText(llmSummary);
                  }

                  summaryLoaded = true;

                  // Update content with summary
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
              // Summary already loaded, just show it
              abstractDiv.html(llmSummary);
            } else {
              // Show original abstract when toggling back
              abstractDiv.html(abstract);
            }
          }
        );

        // Add click event listener for the Code button
        $(`#${popupId} .alice-toggle[data-view="code"]`).on(
          "click",
          async function (e) {
            e.stopPropagation();
            e.preventDefault(); // Prevent default behavior
            
            console.log("Code button clicked");

            // Visual feedback - add active state to this button, remove from others
            $(this).addClass("active").siblings(".alice-toggle").removeClass("active");

            // Mark that the button was clicked to prevent popup from closing
            isButtonClicked = true;
            setTimeout(() => {
              isButtonClicked = false;
            }, 500); // Increase timeout to prevent accidental closing

            // Prevent multiple simultaneous requests
            if (isProcessing) {
              return;
            }

            // Toggle code view - hide abstract, show code
            $(`#${popupId}-abstract-content`).hide();
            $(`#${popupId}-code-content`).show();

            // If code content is not already loaded, fetch it
            if (!codeLoaded) {
              isProcessing = true;
              const codeContentDiv = $(`#${popupId}-code-content .tipsy-code`);
              
              // Show loading state
              codeContentDiv.html("<div class='code-loading'>Loading code examples...</div>");
              
              try {
                // Get paper text for generating code implementation
                const paperText = await fetchPaperText(link);
                
                if (!paperText) {
                  throw new Error("Could not fetch paper text");
                }
                
                // Generate code implementation
                const codeImplementation = await generateCodeImplementation(paperText, fullTitle);
                
                // Store code locally to avoid refetching
                codeContent = codeImplementation;
                
                // Update display with code content
                codeContentDiv.html(`
                  <div class="code-implementation">
                    <pre style="background-color: rgba(0,0,0,0.1); padding: calc(10px * var(--total-scale-factor, 1)); border-radius: calc(4px * var(--total-scale-factor, 1)); white-space: pre-wrap; word-break: break-word; color: white;">${codeImplementation}</pre>
                    <button class="copy-button">Copy to Clipboard</button>
                  </div>
                `);
                
                // Add click handler for copy button
                codeContentDiv.find(".copy-button").on("click", function() {
                  navigator.clipboard.writeText(codeImplementation)
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

        // Function to call Claude API
        async function callClaudeAPI(paperDetails) {
          console.log(
            "Calling Claude API with paper details:",
            paperDetails.title
          );

          // Construct a detailed prompt for Claude
          const prompt = `
You are analyzing a scientific paper from arXiv to extract all implementation details, code, and mathematical formulations.

Paper Title: ${paperDetails.title}
Paper Authors: ${paperDetails.authors}
Paper Abstract: ${paperDetails.abstract}
arXiv Link: ${paperDetails.link}
${paperDetails.fullTextUrl ? `Full Text URL: ${paperDetails.fullTextUrl}` : ""}

Please provide a comprehensive implementation guide for this paper with the following sections:

1. MATHEMATICAL FORMULATION:
   - Explain all key equations, theorems, and mathematical concepts in the paper
   - Rewrite any complex math in a clear, step-by-step format using markdown math notation
   - Include all variables, symbols, and their meanings
   - If there are multiple equations, number them for easy reference

2. PSEUDOCODE:
   - Convert the core algorithms into clear pseudocode
   - Include inputs, outputs, and key steps
   - Break down complex procedures into simpler components
   - Ensure the pseudocode is detailed enough to be implemented by a programmer

3. IMPLEMENTATION DETAILS:
   - Suggest programming languages and libraries best suited for implementation
   - Outline data structures needed
   - Discuss potential computational bottlenecks and solutions
   - Provide time and space complexity analysis where relevant

4. CODE SAMPLE:
   - Provide clean, well-commented sample code for the most important algorithm or technique
   - Include imports and necessary setup
   - Focus on clarity and correctness over optimization
   - Use best practices for the chosen programming language

5. RESOURCES:
   - Mention relevant GitHub repositories with links if they exist
   - Identify any available implementations or similar projects
   - Suggest additional papers or resources for implementation
   - Note any available pre-trained models or datasets that could be leveraged

Format your response with clear section headers and use markdown for code blocks and equations. When writing math equations, use proper Markdown math syntax with $...$ for inline equations and $$...$$$ for block equations.

Your response should be comprehensive yet concise, focusing on practical implementation rather than theory.
`;

          try {
            // Check if we're in a Chrome extension context
            const isExtension =
              window.chrome && chrome.runtime && chrome.runtime.id;
            let responseText = "";

            if (isExtension) {
              console.log(
                "Running in Chrome extension context - using background script for API calls"
              );

              console.log("Prompt:", prompt);

              try {
                // Call the background script to handle the API request
                const response = await new Promise((resolve, reject) => {
                  chrome.runtime.sendMessage(
                    {
                      action: "callClaudeAPI",
                      data: {
                        prompt: prompt,
                        model: "claude-3-7-sonnet-20250219",
                      },
                    },
                    response => {
                      if (chrome.runtime.lastError) {
                        reject(
                          new Error(
                            `Chrome runtime error: ${chrome.runtime.lastError.message}`
                          )
                        );
                      } else if (!response || response.error) {
                        reject(
                          new Error(
                            response?.error ||
                              "No response from background script"
                          )
                        );
                      } else {
                        resolve(response);
                      }
                    }
                  );
                });

                if (response.success && response.data) {
                  console.log(
                    "Successfully received Claude API response from background script"
                  );

                  // Extract text from the response
                  if (
                    response.data.content &&
                    Array.isArray(response.data.content)
                  ) {
                    for (const item of response.data.content) {
                      if (item.type === "text") {
                        responseText += item.text;
                      }
                    }
                  }

                  if (!responseText) {
                    throw new Error(
                      "No text content found in Claude API response"
                    );
                  }

                  // Post the Claude response to the online clipboard
                  try {
                    await postToOnlineClipboard(
                      responseText,
                      paperDetails.title
                    );
                    // Show an alert to notify the user
                    alert(
                      "Implementation guide for '" +
                        paperDetails.title +
                        "' has been saved to the online clipboard!\n\nAccess it anytime using @https://online-clipboard-two.vercel.app in your IDE."
                    );
                  } catch (clipboardError) {
                    console.error(
                      "Error posting to online clipboard:",
                      clipboardError
                    );
                    // Still continue even if clipboard posting fails
                  }
                } else {
                  throw new Error("Invalid response from background script");
                }
              } catch (extensionError) {
                console.error(
                  "Error using background script for Claude API:",
                  extensionError
                );
                throw new Error(`Claude API error: ${extensionError.message}`);
              }
            } else {
              // If not in extension context, notify the user this feature requires the extension
              console.log(
                "Not running in Chrome extension context - can't call Claude API directly"
              );
              throw new Error(
                "This feature requires using the Chrome extension due to API security requirements"
              );
            }

            // If we reached this point and still don't have a response, something went wrong
            if (!responseText) {
              throw new Error("Unable to get a valid response from Claude API");
            }

            return responseText;
          } catch (error) {
            console.error("Error calling Claude API:", error);
            throw new Error(
              `Failed to generate code implementation: ${error.message}`
            );
          }
        }

        // Function to post content to online clipboard
        async function postToOnlineClipboard(content, title) {
          console.log("Posting paper implementation to online clipboard...");

          try {
            // Format the content with a title and metadata
            const formattedContent = `# Implementation Guide for: ${title}\n\n${content}\n\n---\nGenerated by ArXiv Viewer Extension using Claude AI`;

            // Post to the online clipboard service
            const response = await fetch(
              "https://online-clipboard-two.vercel.app/",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ content: formattedContent }),
              }
            );

            if (!response.ok) {
              throw new Error(
                `Failed to post to clipboard: ${response.status} ${response.statusText}`
              );
            }

            const result = await response.json();
            console.log("Successfully posted to online clipboard:", result);
            return result;
          } catch (error) {
            console.error("Error posting to online clipboard:", error);
            throw error;
          }
        }

        // Process Gemini API response
        async function processGeminiResponse(geminiResult) {
          if (
            !geminiResult.candidates ||
            !geminiResult.candidates[0] ||
            !geminiResult.candidates[0].content ||
            !geminiResult.candidates[0].content.parts
          ) {
            throw new Error("Unexpected response structure from Gemini API");
          }

          console.log(
            "Received response parts:",
            JSON.stringify(geminiResult.candidates[0].content.parts)
          );

          // Check if we got a function call response
          const functionCall = geminiResult.candidates[0].content.parts.find(
            part =>
              part.functionCall && part.functionCall.name === "summarizePaper"
          );

          if (
            functionCall &&
            functionCall.functionCall &&
            functionCall.functionCall.args
          ) {
            const args = functionCall.functionCall.args;
            // Format the content with main points and concise summary, ensure all markdown is rendered
            return `<div class="main-points">${cleanAIIntroText(
              renderMarkdown(args.mainPoints)
            )}</div>
              <div class="concise-summary">${cleanAIIntroText(
                renderMarkdown(args.conciseSummary)
              )}</div>`;
          } else {
            // Check for text response
            const textParts = geminiResult.candidates[0].content.parts.filter(
              part => part.text
            );

            if (!textParts || textParts.length === 0) {
              throw new Error("No text content found in Gemini response");
            }

            const textContent = textParts[0].text || "";
            const cleanedContent = cleanAIIntroText(textContent);

            // Handle a non-function call response (particularly for direct prompts after retries)
            if (
              cleanedContent.includes("MAIN POINTS") &&
              cleanedContent.includes("CONCISE SUMMARY")
            ) {
              // Extract the two sections
              const mainPointsMatch = cleanedContent.match(
                /MAIN POINTS[:\s]+([\s\S]+?)(?=CONCISE SUMMARY|$)/i
              );
              const conciseSummaryMatch = cleanedContent.match(
                /CONCISE SUMMARY[:\s]+([\s\S]+?)(?=$)/i
              );

              if (mainPointsMatch && conciseSummaryMatch) {
                const mainPoints = cleanAIIntroText(mainPointsMatch[1].trim());
                const conciseSummary = cleanAIIntroText(
                  conciseSummaryMatch[1].trim()
                );

                return `<div class="main-points">${renderMarkdown(
                  mainPoints
                )}</div>
                  <div class="concise-summary">${renderMarkdown(
                    conciseSummary
                  )}</div>`;
              }
            }

            // Check if the text appears to be a function call
            if (
              cleanedContent.includes("summarizePaper(") ||
              cleanedContent.includes("summarizePaper ")
            ) {
              console.log(
                "Detected function-like response in text:",
                cleanedContent
              );

              // Try to extract mainPoints and conciseSummary using regex
              const mainPointsMatch = cleanedContent.match(
                /mainPoints\s*=\s*["'](.+?)["']/s
              );
              const conciseSummaryMatch = cleanedContent.match(
                /conciseSummary\s*=\s*["'](.+?)["']/s
              );

              if (mainPointsMatch && conciseSummaryMatch) {
                const mainPoints = mainPointsMatch[1];
                const conciseSummary = conciseSummaryMatch[1];

                console.log("Main points:", mainPoints);
                console.log("Concise summary:", conciseSummary);

                return `<div class="main-points">${renderMarkdown(
                  mainPoints
                )}</div>
                  <div class="concise-summary">${renderMarkdown(
                    conciseSummary
                  )}</div>`;
              } else {
                // If we can't extract the parts properly, render the whole text as Markdown
                return renderMarkdown(
                  cleanedContent
                    .replace(/^.*?summarizePaper\(/, "")
                    .replace(/\).*?$/, "")
                );
              }
            } else {
              // Regular text response, just render as markdown
              // Try to split it into two sections if we can identify them
              const lines = cleanedContent.split("\n");
              let mainPoints = "";
              let conciseSummary = "";
              let inMainPoints = true; // Assume we start with main points

              for (const line of lines) {
                if (
                  line.match(/concise\s+summary|summary|conclusion/i) &&
                  line.length < 50
                ) {
                  inMainPoints = false;
                  continue;
                }

                if (inMainPoints) {
                  mainPoints += line + "\n";
                } else {
                  conciseSummary += line + "\n";
                }
              }

              // If we were able to split it
              if (mainPoints && conciseSummary) {
                return `<div class="main-points">${renderMarkdown(
                  mainPoints.trim()
                )}</div>
                  <div class="concise-summary">${renderMarkdown(
                    conciseSummary.trim()
                  )}</div>`;
              }

              // Otherwise just render the whole thing
              return renderMarkdown(cleanedContent);
            }
          }
        }

        // Function to clean up code remnants from response
        function cleanupCodeFromResponse(text) {
          // Remove Python function calls
          text = text.replace(/print\s*\([^)]*\)/g, "");
          text = text.replace(/\bdef\s+\w+\s*\([^)]*\):/g, "");
          text = text.replace(/\bimport\s+\w+/g, "");
          text = text.replace(/summarizePaper\s*\(.*?\)/gs, "");

          // Remove indented code blocks
          text = text.replace(/\n\s{2,}[\w.]+.*?\n/g, "\n");

          // Replace any code-like patterns with readable text
          text = text.replace(/(\w+)\s*=\s*(['"])(.+?)\2/g, "$3");

          return text;
        }

        // Enhanced function to clean up AI introduction text
        function cleanAIIntroText(text) {
          if (!text) return "";

          // More aggressive removal of introductory phrases
          const cleanedText = text
            // Remove common AI introductions
            .replace(
              /^(Sure|Okay|I'd be happy to|I will|Here's|Let me|I'll|Certainly|Alright|I've analyzed|I can|Here is|Based on the article|After analyzing)[,.:]?\s+/i,
              ""
            )
            .replace(
              /^(I'll|I will) (provide|give|create|generate|summarize|break down)[^.]*[,.]\s*/i,
              ""
            )
            .replace(
              /^(Here's|Here is|Below is|Following is) (a|an|the|my) (summary|analysis|breakdown)[^.]*[,.]\s*/i,
              ""
            )
            .replace(/^Let's (break|dive|look)[^.]*[,.]\s*/i, "")
            // Remove phrases like "The main points are:"
            // Remove phrases like "In summary:"
            .replace(
              /^(In summary|To summarize|Summarizing|In conclusion|To conclude)[^.]*[:]?\s*/i,
              ""
            )
            // Remove markdown artifacts that might appear
            .replace(/```[a-z]*\s*/, "")
            .replace(/```\s*$/, "");

          return cleanedText;
        }

        // Store the current element and popup as active
        activeLink = this;
        activePopup = $popup;
      }
    },
  });
}

export { initializeArxivInfo };

// Helper functions for code generation
async function fetchPaperText(arxivLink) {
  console.log("Fetching paper text from arXiv link:", arxivLink);
  
  try {
    // Extract the arXiv ID from the link
    const arxivIdMatch = arxivLink.match(/abs\/([^\/]+)/);
    if (!arxivIdMatch || !arxivIdMatch[1]) {
      throw new Error("Could not extract arXiv ID from link");
    }
    
    const arxivId = arxivIdMatch[1];
    console.log("Extracted arXiv ID:", arxivId);
    
    // Use ArXiv API to get paper details
    const apiEndpoint = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
    const apiResponse = await fetchWithRetry(apiEndpoint, {}, 2);
    
    const xmlData = await apiResponse.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlData, "text/xml");
    
    // Extract summary and other details
    const summary = xmlDoc.querySelector("summary")?.textContent || "";
    const title = xmlDoc.querySelector("title")?.textContent || "";
    const authors = Array.from(xmlDoc.querySelectorAll("author name"))
      .map(el => el.textContent)
      .join(", ");
    
    // Combine the data
    return `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
  } catch (error) {
    console.error("Error fetching paper text:", error);
    throw new Error(`Failed to fetch paper text: ${error.message}`);
  }
}

async function generateCodeImplementation(paperText, title) {
  console.log("Generating code implementation for:", title);
  
  // This is a simplified implementation
  // In a real-world scenario, you would call an AI service here
  
  // For now, return a placeholder implementation
  return `# Implementation for ${title}

\`\`\`python
import numpy as np
import matplotlib.pyplot as plt

def main():
    # This is a placeholder implementation
    # In a real scenario, this would be generated by AI based on the paper
    print("Implementing paper:", "${title}")
    
    # Sample code that would be relevant to the paper
    x = np.linspace(0, 10, 100)
    y = np.sin(x)
    
    plt.figure(figsize=(10, 6))
    plt.plot(x, y)
    plt.title("Sample Implementation")
    plt.xlabel("x")
    plt.ylabel("y")
    plt.grid(True)
    plt.show()

if __name__ == "__main__":
    main()
\`\`\`

Note: This is a simplified implementation. In a real scenario, the code would be 
specifically generated based on the paper's algorithms and methodologies.
`;
}

