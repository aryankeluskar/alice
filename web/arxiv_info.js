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

  while (retries < maxRetries) {
    try {
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
  // current implementation calls this upon every viewer render,
  // so turn off callback before adding another one
  $("a").off();

  // Keep track of the current active popup
  let activePopup = null;
  let activeLink = null;

  $("a").on({
    mouseenter() {
      console.log($(this).attr("href"));

      // if "cite" not in href, ignore
      if (!$(this).attr("href").includes("cite")) {
        return;
      }

      // If there's already an active popup and we're hovering a different link,
      // ignore this hover event
      if (activePopup && activeLink !== this) {
        return;
      }

      // Create a unique ID for this popup to avoid selector conflicts
      const popupId = `popup-${Math.random().toString(36).substr(2, 9)}`;

      // get location relative to page for nicer display
      let tipsyDirection;
      try {
        const zoomMultiplier = parseFloat(
          $(this).parent().css("transform").substr(7)
        );
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
      function processAndQueryArXiv(titleInfo, source) {
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

      if (parsedInfo) {
        // Try ArXiv API first
        processAndQueryArXiv(parsedInfo, "BibTeX parsing").catch(
          async error => {
            console.log(
              "ArXiv API failed or returned empty results, trying Perplexity fallback..."
            );
          }
        );
      } else {
        // AI-powered fallback path
        fail(this, "Failed to parse BibTeX reference");

        // Extract title using AI
        extractPaperTitleFromLink(linkHref, surroundingText, currentElement)
          .then(extractedTitle => {
            if (!extractedTitle) {
              console.log("No title could be extracted, skipping popup");
              return;
            }

            // Process the extracted title
            processAndQueryArXiv(extractedTitle, "AI extraction");
          })
          .catch(error => {
            console.error("Error in title extraction fallback:", error);
            fail(currentElement, "Title extraction fallback failed");
          });
      }

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
          script.src = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";
          script.async = true;
          document.head.appendChild(script);
        }

        // Add CSS for toggle switch
        if (!$("#arxiv-toggle-style").length) {
          // Create style element properly to comply with CSP
          const style = document.createElement("style");
          style.id = "arxiv-toggle-style";
          style.textContent = `
            .toggle-button {
              display: inline-block;
              padding: 4px 8px;
              margin: 0 0 5px 0;
              background-color: #C0A9FF;
              color: #555;
              border: 1px solid #ddd;
              border-radius: 4px;
              font-size: 10px;
              cursor: pointer;
              transition: all 0.2s ease;
              font-weight: 500;
              text-align: center;
              min-width: 70px;
              width: 100%;
            }
            .toggle-button:hover {
              background-color: #e0e0e0;
              box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }
            .toggle-button.active {
              background-color: #2196F3;
              color: white;
              border-color: #1976D2;
            }
            .toggle-button.active:hover {
              background-color: #1976D2;
              box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            }
            .markdown-content h1, .markdown-content h2, .markdown-content h3 {
              margin-top: 0.5em;
              margin-bottom: 0.5em;
            }
            .markdown-content p {
              margin-top: 0.3em;
              margin-bottom: 0.3em;
            }
            .markdown-content ul, .markdown-content ol {
              padding-left: 1.5em;
              margin-top: 0.3em;
              margin-bottom: 0.3em;
            }
            .markdown-content blockquote {
              margin-left: 0;
              padding-left: 1em;
              border-left: 3px solid #ccc;
              color: #555;
            }
            .markdown-content code {
              padding: 2px 4px;
              border-radius: 3px;
              font-family: monospace;
            }
            .markdown-content pre code {
              display: block;
              padding: 0.5em;
              overflow-x: auto;
            }
            .concise-summary {
              padding-top: 0.5em;
            }
            .main-points {
              margin-bottom: 0.5em;
            }
            .tipsy-inner {
              padding: 8px 8px;
            }
            .arxiv-header {
              margin-bottom: 10px;
              border-bottom: 1px solid #000;
              padding-bottom: 10px;
              position: relative;
            }
            .arxiv-main-content {
              flex: 1;
              padding-right: 15px;
            }
            .arxiv-title-row {
              display: flex;
              flex-direction: row;
              justify-content: space-between;
            }
            .arxiv-title {
              flex: 1;
              margin-right: 15px;
            }
            .arxiv-controls {
              display: flex;
              flex-direction: column;
              align-items: flex-end;
              white-space: nowrap;
              width: 80px;
            }
            .arxiv-link {
              display: inline-flex;
              align-items: center;
              vertical-align: middle;
              margin-left: 8px;
              margin-bottom: 0;
              position: relative;
              top: -1px;
            }
            .arxiv-link img {
              width: 14px;
              height: 14px;
              transition: transform 0.2s ease;
            }
            .arxiv-link:hover img {
              transform: scale(1.2);
            }
            .arxiv-link:focus {
              outline: 2px solid #2196F3;
              border-radius: 4px;
            }
            .arxiv-info-row {
              display: flex;
              flex-direction: column;
            }
            .arxiv-info-left {
              flex: 1;
            }
            .code-implementation {
              max-height: 400px;
              overflow-y: auto;
              padding-right: 10px;
            }
            .code-content {
              margin-bottom: 15px;
            }
            .copy-button {
              background-color: #C0A9FF;
              color: #555;
              border: 1px solid #ddd;
              border-radius: 4px;
              padding: 6px 12px;
              cursor: pointer;
              transition: all 0.2s ease;
              font-weight: 500;
              margin-top: 12px;
              display: block;
              text-align: center;
              width: 100%;
              font-family: 'Solway', serif;
              font-size: 11px;
            }
            .copy-button:hover {
              background-color: #e0e0e0;
              box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }
            .section-nav {
              display: flex;
              overflow-x: auto;
              margin-bottom: 10px;
              white-space: nowrap;
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
            .section-nav::-webkit-scrollbar {
              display: none;
            }
            .section-button {
              padding: 3px 8px;
              background-color: #f0f0f0;
              color: #333;
              border: 1px solid #ddd;
              border-radius: 12px;
              margin-right: 5px;
              font-size: 10px;
              cursor: pointer;
              transition: all 0.2s ease;
            }
            .section-button:hover {
              background-color: #e0e0e0;
            }
            .loading-container {
              text-align: center;
              padding: 20px;
            }
            .loading-animation {
              display: inline-block;
              width: 40px;
              height: 40px;
              margin: 0 auto;
              border: 3px solid rgba(192, 169, 255, 0.3);
              border-radius: 50%;
              border-top-color: #C0A9FF;
              animation: spin 1s ease-in-out infinite;
            }
            .clipboard-notice {
              margin-top: 15px;
              padding: 10px;
              background-color: #EFF8FF;
              border: 1px solid #BDE3FF;
              border-radius: 5px;
              font-size: 11px;
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
              padding: 2px 5px;
              border-radius: 3px;
              color: #333;
              font-weight: 500;
            }
            .open-clipboard-button {
              display: block;
              margin: 10px auto 0;
              padding: 6px 12px;
              background-color: #1E88E5;
              color: white;
              border: none;
              border-radius: 4px;
              font-size: 11px;
              cursor: pointer;
              transition: all 0.2s ease;
              font-family: 'Solway', serif;
              font-weight: 500;
            }
            .open-clipboard-button:hover {
              background-color: #1565C0;
              box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            }
            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }
            .loading-text {
              margin-top: 10px;
              font-family: 'Solway', serif;
              color: #555;
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
          <div class="tipsy-inner" style="font-family: 'Solway', serif;">
          ${
            tipsyDirection.startsWith("n")
              ? `
            <!-- Header at top for north orientations -->
            <div class="arxiv-header">
              <div class="arxiv-title-row">
                <div class="arxiv-main-content"> 
                  <div style="display: flex; align-items: center;">
                    <span class="arxiv-title" style="font-family: 'Solway', serif;font-size: 12px;">${fullTitle}</span>
                    <a href="${link}" title="View paper on arXiv" target="_blank" class="arxiv-link" aria-label="View paper on arXiv"><img src="images/link-icon.svg" alt="External link to arXiv paper" width="14" height="14"/></a>
                  </div>
                  <div class="arxiv-info-row">
                    <div class="arxiv_info_author" style="font-family: 'Solway', serif;">${authorText}</div>
                    <div class="arxiv_info_date" style="font-family: 'Solway', serif;">Published on ${dateString}.</div>
                  </div>
                </div>
                <div class="arxiv-controls">
                  <button class="toggle-button" data-view="abstract">Summary</button>
                  <button class="toggle-button" data-view="code">Code</button>
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
            
            <div class="arxiv-header" style="margin-top: 10px; margin-bottom: 0; border-top: 1px solid #000; border-bottom: none; padding-top: 10px; padding-bottom: 0;">
              <div class="arxiv-title-row">
                <div class="arxiv-main-content">
                  <div style="display: flex; align-items: center;">
                    <span class="arxiv-title" style="font-family: 'Solway', serif;font-size: 12px;">${fullTitle}</span>
                    <a href="${link}" title="View paper on arXiv" target="_blank" class="arxiv-link" aria-label="View paper on arXiv"><img src="images/link-icon.svg" alt="External link to arXiv paper" width="14" height="14"/></a>
                  </div>
                  <div class="arxiv-info-row">
                    <div class="arxiv_info_author" style="font-family: 'Solway', serif;">${authorText}</div>
                  <div class="arxiv_info_date" style="font-family: 'Solway', serif;">Published on ${dateString}.</div>
                </div>
                </div>
                <div class="arxiv-controls">
                  <button class="toggle-button" data-view="abstract">Summary</button>
                  <button class="toggle-button" data-view="code">Code</button>
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
        let showingSummary = false;
        let isFetching = false;
        let isButtonClicked = false; // Track if button is clicked to prevent mouseleave

        // Function to render markdown content
        function renderMarkdown(content) {
          // Check if marked library is available
          if (window.marked) {
            // First process with marked for markdown
            const htmlContent = window.marked.parse(content);

            // Then ensure MathJax is loaded and processes the math
            ensureMathJaxLoaded();

            return htmlContent;
          } else {
            // Fallback to basic formatting if marked isn't loaded yet
            return content
              .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
              .replace(/\*(.*?)\*/g, "<em>$1</em>")
              .replace(/\n\n/g, "<br><br>")
              .replace(/\n/g, "<br>");
          }
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
            script.src =
              "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";
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
        $(`#${popupId} .toggle-button[data-view="abstract"]`).on(
          "click",
          async function (e) {
            e.stopPropagation();

            // Mark that the button was clicked to prevent popup from closing
            isButtonClicked = true;
            setTimeout(() => {
              isButtonClicked = false;
            }, 100);

            // Prevent multiple simultaneous requests
            if (isFetching) {
              return;
            }

            const contentDiv = $(this)
              .closest(".tipsy-inner")
              .find(".arxiv_info_content");
            const abstractDiv = contentDiv.find(".arxiv_info_abstract");
            const currentView = $(this).attr("data-view");

            // Set all buttons to inactive
            $(this)
              .closest(".arxiv-controls")
              .find(".toggle-button")
              .removeClass("active");

            // Reset the Code button if it was active
            const codeButton = $(this)
              .closest(".arxiv-controls")
              .find(".toggle-button[data-view='code']");
            codeButton.removeClass("active");

            if (currentView === "abstract") {
              // Switch to AI summary
              $(this).attr("data-view", "summary");
              $(this).text("‎Abstract‎");
              $(this).addClass("active");

              if (!summaryLoaded) {
                // Show loading indicator immediately
                isFetching = true;
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

                    // render markdown
                    llmSummary = renderMarkdown(llmSummary);

                    console.log("llmSummary after processing", llmSummary);

                    summaryLoaded = true;

                    // Update content with summary
                    abstractDiv.html(llmSummary);
                    showingSummary = true;
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
                  isFetching = false;
                }
              } else {
                // Summary already loaded, just show it
                abstractDiv.html(llmSummary);
                showingSummary = true;
              }
            } else {
              // Switch back to original abstract
              $(this).attr("data-view", "abstract");
              $(this).text("Summary");
              $(this).removeClass("active");
              abstractDiv.html(abstract);
              showingSummary = false;
            }
          }
        );

        // Add click event listener for the Code button
        $(`#${popupId} .toggle-button[data-view="code"]`).on(
          "click",
          async function (e) {
            e.stopPropagation();

            // Mark that the button was clicked to prevent popup from closing
            isButtonClicked = true;
            setTimeout(() => {
              isButtonClicked = false;
            }, 100);

            // Prevent multiple simultaneous requests
            if (isFetching) {
              return;
            }

            const contentDiv = $(this)
              .closest(".tipsy-inner")
              .find(".arxiv_info_content");
            const abstractDiv = contentDiv.find(".arxiv_info_abstract");

            // Store original content if not already saved
            if (!$(this).data("original-content")) {
              $(this).data("original-content", abstractDiv.html());
            }

            // Set all buttons to inactive
            $(this)
              .closest(".arxiv-controls")
              .find(".toggle-button")
              .removeClass("active");

            // Set this button to active
            $(this).addClass("active");

            // Reset Summary/Abstract button
            $(this)
              .closest(".arxiv-controls")
              .find(".toggle-button[data-view='abstract']")
              .text("Summary");
            $(this)
              .closest(".arxiv-controls")
              .find(".toggle-button[data-view='abstract']")
              .attr("data-view", "abstract");
            $(this)
              .closest(".arxiv-controls")
              .find(".toggle-button[data-view='abstract']")
              .removeClass("active");

            // Show loading message
            abstractDiv.html(`
            <div class="loading-container">
              <div class="loading-animation"></div>
              <div class="loading-text">Generating code implementation details with Claude. This will take a few minutes. The implementation will be available on this page and also saved to an online clipboard for easy access.</div>
            </div>
          `);
            isFetching = true;

            try {
              // Get paper details for the Claude prompt
              let paperDetails;
              try {
                // Extract the arXiv ID from the link
                const arxivIdMatch = link.match(/abs\/([^\/]+)/);
                let arxivId = null;

                if (arxivIdMatch && arxivIdMatch[1]) {
                  arxivId = arxivIdMatch[1];
                  console.log(
                    "Extracted arXiv ID for code implementation:",
                    arxivId
                  );

                  // Use ArXiv API to get paper details
                  const apiEndpoint = `http://export.arxiv.org/api/query?id_list=${arxivId}`;
                  const apiResponse = await fetchWithRetry(apiEndpoint, {}, 2);

                  const xmlData = await apiResponse.text();
                  const parser = new DOMParser();
                  const xmlDoc = parser.parseFromString(xmlData, "text/xml");

                  // Extract details from the XML
                  const summary =
                    xmlDoc.querySelector("summary")?.textContent || "";
                  const title =
                    xmlDoc.querySelector("title")?.textContent || "";
                  const authors = Array.from(
                    xmlDoc.querySelectorAll("author name")
                  )
                    .map(el => el.textContent)
                    .join(", ");

                  // Try to get the full text version or PDF link
                  let fullTextUrl = "";
                  const links = Array.from(xmlDoc.querySelectorAll("link"));
                  for (const linkEl of links) {
                    const rel = linkEl.getAttribute("rel") || "";
                    const href = linkEl.getAttribute("href") || "";
                    const title = linkEl.getAttribute("title") || "";

                    if (title.includes("pdf") || href.includes("pdf")) {
                      fullTextUrl = href;
                      break;
                    } else if (rel === "alternate" || title.includes("html")) {
                      fullTextUrl = href;
                    }
                  }

                  paperDetails = {
                    id: arxivId,
                    title: title,
                    authors: authors,
                    abstract: summary,
                    link: link,
                    fullTextUrl: fullTextUrl,
                  };

                  console.log(
                    "Successfully extracted paper data for code implementation"
                  );
                } else {
                  // If we couldn't extract the arXiv ID, throw an error
                  console.log(
                    "Could not extract arXiv ID for code implementation"
                  );
                  throw new Error("Could not extract arXiv ID from link");
                }
              } catch (error) {
                console.error(
                  "Error fetching from ArXiv for code implementation:",
                  error
                );
                throw new Error(
                  `Failed to fetch article from arXiv: ${error.message}`
                );
              }

              // Call Claude API
              const codeImplementation = await callClaudeAPI(paperDetails);
              console.log("Received code implementation from Claude");

              // Add copy button to content
              const codeContent = `
              <div class="code-implementation">
                <div class="section-nav">
                  <button class="section-button" data-section="math">Math</button>
                  <button class="section-button" data-section="pseudocode">Pseudocode</button>
                  <button class="section-button" data-section="implementation">Implementation</button>
                  <button class="section-button" data-section="code">Code Sample</button>
                  <button class="section-button" data-section="resources">Resources</button>
                </div>
                <div class="code-content markdown-content">${renderMarkdown(
                  codeImplementation
                )}</div>
                <div class="clipboard-notice">
                  This implementation is also available at <a href="https://online-clipboard-two.vercel.app" target="_blank">online-clipboard-two.vercel.app</a><br>
                  Access it in your IDE using <span class="clipboard-code">@https://online-clipboard-two.vercel.app</span>
                  <button class="open-clipboard-button" onclick="window.open('https://online-clipboard-two.vercel.app', '_blank')">Open Online Clipboard</button>
                </div>
                <button class="copy-button">Copy to Clipboard</button>
              </div>
            `;

              // Update the content
              abstractDiv.html(codeContent);

              // Trigger MathJax rendering after content is inserted
              if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([abstractDiv[0]]).catch(err => {
                  console.error("Error typesetting math:", err);
                });
              }

              // Add click handler for section buttons
              abstractDiv.find(".section-button").on("click", function () {
                const section = $(this).data("section");
                const contentDiv = abstractDiv.find(".code-content");

                // Find the section header in the content and scroll to it
                const content = contentDiv[0];
                let sectionMap = {
                  math: "MATHEMATICAL FORMULATION",
                  pseudocode: "PSEUDOCODE",
                  implementation: "IMPLEMENTATION DETAILS",
                  code: "CODE SAMPLE",
                  resources: "RESOURCES",
                };

                // Find all h1, h2 elements
                const headers = content.querySelectorAll("h1, h2, h3");

                for (const header of headers) {
                  const text = header.textContent.toUpperCase();
                  if (text.includes(sectionMap[section])) {
                    header.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                    break;
                  }
                }

                // Retypeset the math after scrolling, in case any formulas were not processed
                if (
                  section === "math" &&
                  window.MathJax &&
                  window.MathJax.typesetPromise
                ) {
                  setTimeout(() => {
                    window.MathJax.typesetPromise([content]).catch(err => {
                      console.error(
                        "Error typesetting math after scroll:",
                        err
                      );
                    });
                  }, 100);
                }
              });

              // Add click handler for copy button
              abstractDiv.find(".copy-button").on("click", function () {
                const textToCopy = codeImplementation;
                const copyButton = $(this); // Store reference to the button

                navigator.clipboard.writeText(textToCopy).then(
                  function () {
                    copyButton.text("Copied!");
                    setTimeout(() => {
                      copyButton.text("Copy to Clipboard");
                    }, 2000);
                  },
                  function (err) {
                    console.error("Could not copy text: ", err);
                    copyButton.text("Failed to copy");
                    setTimeout(() => {
                      copyButton.text("Copy to Clipboard");
                    }, 2000);
                  }
                );
              });
            } catch (error) {
              console.error("Error fetching code implementation:", error);
              abstractDiv.html($(this).data("original-content") || abstract);

              // Format a user-friendly error message
              let errorMessage =
                "Failed to generate code implementation. Please try again later.";
              if (error.message.includes("arXiv")) {
                errorMessage =
                  "Unable to fetch the paper details from arXiv. Please try again later.";
              } else if (error.message.includes("Claude API")) {
                errorMessage =
                  "The code implementation service is currently unavailable. Please try again later.";
              } else if (error.message.includes("API key")) {
                errorMessage =
                  "Missing or invalid API key for code implementation service.";
              }

              abstractDiv.html(`
              <div style="text-align: center; padding: 20px;">
                <div style="color: #e74c3c; margin-bottom: 15px;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <p style="font-family: 'Solway', serif; margin-bottom: 10px;">${errorMessage}</p>
                <p style="font-family: 'Solway', serif; font-size: 10px; color: #777; margin-top: 5px;">
                  Technical details: ${error.message}
                </p>
                <button class="toggle-button" style="width: auto; margin-top: 15px; padding: 5px 10px;" id="back-to-abstract">
                  Back to Abstract
                </button>
              </div>
            `);

              // Add event listener to go back to abstract
              abstractDiv.find("#back-to-abstract").on("click", function () {
                abstractDiv.html(abstract);
                // Reset button states
                $(`#${popupId} .toggle-button`).removeClass("active");
              });
            } finally {
              isFetching = false;
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

        // Update mouseleave handler to check both link and popup
        const handleMouseLeave = e => {
          // Get the current mouse position
          const mouseX = e.clientX;
          const mouseY = e.clientY;

          // Get the bounding rectangles for both the link and popup
          const linkRect = activeLink.getBoundingClientRect();
          const popupRect = activePopup[0].getBoundingClientRect();

          // Check if mouse is outside both the link and popup
          const outsideLink =
            mouseX < linkRect.left ||
            mouseX > linkRect.right ||
            mouseY < linkRect.top ||
            mouseY > linkRect.bottom;
          const outsidePopup =
            mouseX < popupRect.left ||
            mouseX > popupRect.right ||
            mouseY < popupRect.top ||
            mouseY > popupRect.bottom;

          if (outsideLink && outsidePopup && !isButtonClicked) {
            activePopup.remove();
            activePopup = null;
            activeLink = null;
            // Remove the event listener after cleanup
            document.removeEventListener("mousemove", handleMouseLeave);
          }
        };

        // Add mousemove listener to track mouse position
        document.addEventListener("mousemove", handleMouseLeave);

        // Remove the old mouseleave handler
        $(`#${popupId}.tipsy`).off("mouseleave");
      }
    },
  });
}

export { initializeArxivInfo };
