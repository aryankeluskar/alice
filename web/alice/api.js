import { delay, getCachedResponse, setCachedResponse, apiRequestQueue, processQueue } from './cache.js';
import { 
  getSemanticScholarApiKey, 
  buildSemanticScholarHeaders,
  createRateLimitError,
  createServerError,
  getRateLimitUserMessage,
} from './api-keys.js';

// Helper function to make API calls through background script (bypasses CORS in extension context)
async function fetchViaBackgroundScript(url, options = {}) {
  console.log("[DEBUG] Attempting to fetch via background script:", url);
  
  // Check if we're actually in an extension context
  if (!chrome || !chrome.runtime || !chrome.runtime.sendMessage) {
    console.log("[DEBUG] Not in extension context or no runtime available");
    throw new Error("Not in extension context");
  }
  
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        {
          action: "callSemanticScholarAPI",
          data: { url, options }
        },
        response => {
          console.log("[DEBUG] Background script response:", response);
          console.log("[DEBUG] chrome.runtime.lastError:", chrome.runtime.lastError);
          
          if (chrome.runtime.lastError) {
            console.error("[DEBUG] Background script error:", chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }

          if (!response) {
            console.error("[DEBUG] No response from background script");
            reject(new Error("No response from background script"));
            return;
          }

          if (response.success) {
            console.log("[DEBUG] Successfully received data from background script");
            // Create a response-like object to maintain API compatibility
            const dataStr = JSON.stringify(response.data);
            const mockResponse = {
              ok: true,
              status: 200,
              json: async () => response.data,
              text: async () => dataStr,
              clone: () => mockResponse, // Add clone method for caching
              headers: new Headers({ 'content-type': 'application/json' }),
              url: url,
              statusText: 'OK'
            };
            resolve(mockResponse);
          } else {
            console.error("[DEBUG] Background script returned error:", response.error);
            reject(new Error(response.error));
          }
        }
      );
    } catch (error) {
      console.error("[DEBUG] Error sending message to background:", error);
      reject(error);
    }
  });
}

// Retry function with exponential backoff
export async function fetchWithRetry(url, options = {}, maxRetries = 3) {
  let retries = 0;
  let lastError;

  // Add CORS proxy for ArXiv API requests if needed
  if (
    url.startsWith("https://export.arxiv.org") &&
    !url.startsWith("https://")
  ) {
    // Use HTTPS instead of HTTP
    url = url.replace("http://", "https://");
    console.log(`Converted ArXiv API URL to HTTPS: ${url}`);
  }

  // Check if we're in an extension context and calling Semantic Scholar
  const isExtensionContext = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
  const isSemanticScholarAPI = url.includes('semanticscholar.org');

  while (retries < maxRetries) {
    try {
      console.log(`Fetching ${url} (attempt ${retries + 1}/${maxRetries})`);
      
      // Use background script for Semantic Scholar calls in extension context
      // But fall back to direct fetch if background script fails
      let response;
      if (isExtensionContext && isSemanticScholarAPI) {
        try {
          response = await fetchViaBackgroundScript(url, options);
        } catch (bgError) {
          console.warn("[DEBUG] Background script failed, trying direct fetch:", bgError.message);
          response = await fetch(url, options);
        }
      } else {
        response = await fetch(url, options);
      }

      if (response.status === 429) {
        const isSemanticScholar = url.includes('semanticscholar.org');
        const isGemini = url.includes('generativelanguage.googleapis.com') || url.includes('api.aryankeluskar.com/api/gemini');

        if (retries === maxRetries - 1) {
          const service = isSemanticScholar ? 'Semantic Scholar' : isGemini ? 'Gemini' : 'API';
          throw createRateLimitError(service, 429);
        }

        if (retries === 0 && isSemanticScholar) {
          console.warn("Semantic Scholar API rate limit hit. Retrying automatically...");
        }

        let waitTime;
        const retryAfterHeader = response.headers.get("Retry-After");

        if (retryAfterHeader) {
          waitTime = parseInt(retryAfterHeader, 10) * 1000;
        } else {
          const baseWait = isSemanticScholar ? 5000 : 1000;
          waitTime = baseWait * Math.pow(2, retries);
        }

        waitTime = Math.min(waitTime, 60000);

        console.log(`Rate limited (429). Retrying after ${waitTime}ms...`);
        await delay(waitTime);
        retries++;
        continue;
      }

      if (response.status >= 500) {
        const isSemanticScholar = url.includes('semanticscholar.org');
        const isGemini = url.includes('generativelanguage.googleapis.com') || url.includes('api.aryankeluskar.com/api/gemini');
        const service = isSemanticScholar ? 'Semantic Scholar' : isGemini ? 'Gemini' : 'API';
        throw createServerError(service, response.status);
      }

      if (!response.ok) {
        throw new Error(`API responded with status ${response.status}`);
      }

      // Success - clear any rate limit alerts for subsequent requests
      return response;
    } catch (error) {
      lastError = error;

      // Log more details about the error
      console.error(`Fetch error (attempt ${retries + 1}/${maxRetries}):`, {
        url,
        errorMessage: error.message,
        errorType: error.name,
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

export async function queuedFetch(url, options = {}, maxRetries = 3) {
  // Check cache first
  const cachedResponse = getCachedResponse(url, options);
  if (cachedResponse) {
    return cachedResponse;
  }

  const apiType = url.includes('semanticscholar.org') ? 'semanticScholar' :
                  url.includes('arxiv.org') ? 'arxiv' : 'other';

  if (apiType === 'other') {
    // For non-rate-limited APIs, proceed directly
    const response = await fetchWithRetry(url, options, maxRetries);
    setCachedResponse(url, options, response);
    return response;
  }

  return new Promise((resolve, reject) => {
    apiRequestQueue[apiType].push({ url, options, maxRetries, resolve, reject });
    processQueue(apiType);
  });
}

// Helper function to fetch BibTex data from API
export async function fetchBibTexData(arxivId) {
  try {
    const bibtexUrl = `https://api.aryankeluskar.com/api/bibtex?arxiv_id=${arxivId}`;
    const response = await fetchWithRetry(bibtexUrl, {}, 3);
    return await response.text();
  } catch (error) {
    console.error("Error fetching BibTex data:", error);
    throw error;
  }
}

// Function to post content to online clipboard
export async function postToOnlineClipboard(content, title) {
  console.log("Posting paper implementation to online clipboard...");

  try {
    // Format the content with a title and metadata
    const formattedContent = `# Implementation Guide for: ${title}\n\n${content}\n\n---\nGenerated by ArXiv Viewer Extension using Claude AI`;

    // Post to the online clipboard service
    const response = await fetch("https://online-clipboard-two.vercel.app/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: formattedContent }),
    });

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

// Helper functions for code generation
export async function fetchPaperText(arxivLink) {
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
    const apiEndpoint = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
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
