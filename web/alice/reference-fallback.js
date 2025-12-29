/**
 * Fallback reference resolution using Groq and Semantic Scholar
 */

import { queuedFetch } from "./api.js";
import { ArxivInfo, fail } from "./data-models.js";
import { buildFallbackReferencePrompt } from "../alice_constants.js";

// Get Groq fallback reference when arXiv API fails
export async function getGroqFallbackReference(
  paperId,
  linkHref,
  currentElement
) {
  // check if user is still hovering before adding to DOM
  if ($(currentElement).parent().find("a:hover").length === 0) {
    return null;
  }

  // Check if we have cached paper data
  const cachedPaperDataString = localStorage.getItem(`paper_data_${paperId}`);
  if (!cachedPaperDataString) {
    console.log(`No cached paper data found for paper ID: ${paperId}`);
    fail(
      currentElement,
      "Paper data not indexed yet. Please wait for indexing to complete."
    );
    return null;
  }

  let cachedPaperData;
  try {
    cachedPaperData = JSON.parse(cachedPaperDataString);
  } catch (error) {
    console.error("Error parsing cached paper data:", error);
    fail(currentElement, "Invalid cached paper data");
    return null;
  }

  const cachedReference = cachedPaperData["references"];
  if (
    !cachedReference ||
    !Array.isArray(cachedReference) ||
    cachedReference.length === 0
  ) {
    console.log(`No references found in cached data for paper ID: ${paperId}`);
    fail(currentElement, "No references available for this paper");
    return null;
  }

  const fallback_prompt = buildFallbackReferencePrompt(
    linkHref,
    cachedReference
  );

  // Call Groq API
  let finalResponse;
  try {
    const response = await fetch("https://api.aryankeluskar.com/api/groq", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: fallback_prompt,
          },
        ],
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API returned status ${response.status}`);
    }

    finalResponse = await response.json();
    console.log("finalResponse", finalResponse);
  } catch (error) {
    console.error("Error calling Groq API:", error);
    fail(currentElement, `Groq API error: ${error.message}`);
    return null;
  }

  // Extract title from Groq response
  let title;
  try {
    title = finalResponse.choices[0].message.content.trim();
    console.log("Groq extracted title:", title);
  } catch (error) {
    console.error("Error extracting title from Groq response:", error);
    fail(currentElement, "Invalid Groq response format");
    return null;
  }

  // Find matching reference
  let matchingReference = null;
  for (const reference of cachedReference) {
    if (
      reference.citedPaper &&
      reference.citedPaper.title &&
      reference.citedPaper.title.trim().toLowerCase() ===
        title.trim().toLowerCase()
    ) {
      console.log("found reference", reference);
      matchingReference = reference;
      break;
    }
  }

  if (
    matchingReference &&
    matchingReference.citedPaper &&
    matchingReference.citedPaper.paperId
  ) {
    return await fetchSemanticScholarData(
      matchingReference,
      linkHref,
      currentElement
    );
  } else {
    console.log("No matching reference found or missing paper ID");
    fail(currentElement, "No matching reference found in cached data");
    return null;
  }
}

async function fetchSemanticScholarData(
  matchingReference,
  linkHref,
  currentElement
) {
  const semanticScholarId = matchingReference.citedPaper.paperId;
  try {
    // Fetch data from Semantic Scholar API with retry logic and proper headers
    const apiUrl = `https://api.semanticscholar.org/graph/v1/paper/${semanticScholarId}?fields=title,abstract,year,openAccessPdf,authors`;

    // Add headers to make the request look more like a browser request
    const requestOptions = {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
    };

    const response = await queuedFetch(apiUrl, requestOptions, 5); // Use queued fetch to prevent concurrent requests

    if (!response.ok) {
      throw new Error(
        `Semantic Scholar API request failed: ${response.status}`
      );
    }

    const paperData = await response.json();
    console.log("Semantic Scholar data", paperData);

    // Create ArxivInfo object with the data
    const paperUrl =
      paperData.openAccessPdf?.url || matchingReference.citedPaper.url || "";
    const authorsString =
      paperData.authors?.map(author => author.name).join(", ") || "";

    const arxivInfo = new ArxivInfo(
      paperData.title,
      authorsString,
      paperData.year?.toString() || "",
      paperData.abstract || "",
      paperUrl
    );

    // Cache the final reference data
    const citationKey = linkHref.split("cite.")[1];
    if (citationKey) {
      const cachedFinalRefs = JSON.parse(
        localStorage.getItem("cached_final_refs") || "{}"
      );
      cachedFinalRefs[citationKey] = {
        title: paperData.title,
        abstract: paperData.abstract || "",
        authors: authorsString,
        year: paperData.year,
        link: paperUrl,
      };
      localStorage.setItem(
        "cached_final_refs",
        JSON.stringify(cachedFinalRefs)
      );
      console.log(
        "Stored paper data in cached_final_refs for citation:",
        citationKey
      );
    }

    // Success message
    console.log(
      "Successfully retrieved paper data from Semantic Scholar",
      arxivInfo
    );

    return createXMLEntryFromArxivInfo(arxivInfo);
  } catch (error) {
    console.error("Error fetching Semantic Scholar data:", error);

    if (error.message.includes("rate limit") || error.message.includes("429")) {
      alert(
        "Semantic Scholar API is currently rate-limited. Alice will try to use cached data or alternative sources. This is temporary - please try again in a few minutes."
      );

      return await getCachedReferenceXML(linkHref, currentElement);
    } else {
      alert(
        "Unable to fetch paper details. This may be due to network issues or the paper not being indexed."
      );
      fail(currentElement, `Failed to fetch paper details: ${error.message}`);
    }
  }
}

function createXMLEntryFromArxivInfo(arxivInfo) {
  const currentDate = new Date().toISOString();
  const xmlDoc = document.implementation.createDocument(
    "http://www.w3.org/2005/Atom",
    "entry",
    null
  );
  const entry = xmlDoc.documentElement;

  // Add namespace
  entry.setAttribute("xmlns", "http://www.w3.org/2005/Atom");

  // Create and append id element
  const idElement = xmlDoc.createElement("id");
  idElement.textContent = arxivInfo.link;
  entry.appendChild(idElement);

  // Create and append updated element
  const updatedElement = xmlDoc.createElement("updated");
  updatedElement.textContent = currentDate;
  entry.appendChild(updatedElement);

  // Create and append published element
  const publishedElement = xmlDoc.createElement("published");
  publishedElement.textContent = `${arxivInfo.year}-01-01T00:00:00Z`; // Default to start of year since we only have year
  entry.appendChild(publishedElement);

  // Create and append title element
  const titleElement = xmlDoc.createElement("title");
  titleElement.textContent = arxivInfo.title;
  entry.appendChild(titleElement);

  // Create and append summary element
  const summaryElement = xmlDoc.createElement("summary");
  summaryElement.textContent = arxivInfo.abstract;
  entry.appendChild(summaryElement);

  // Create and append author elements
  const authors = arxivInfo.authors.split(", ");
  authors.forEach(authorName => {
    const authorElement = xmlDoc.createElement("author");
    const nameElement = xmlDoc.createElement("name");
    nameElement.textContent = authorName;
    authorElement.appendChild(nameElement);
    entry.appendChild(authorElement);
  });

  // Create and append link elements
  const htmlLink = xmlDoc.createElement("link");
  htmlLink.setAttribute("href", arxivInfo.link);
  htmlLink.setAttribute("rel", "alternate");
  htmlLink.setAttribute("type", "text/html");
  entry.appendChild(htmlLink);

  // Create PDF link (assuming PDF URL is same as HTML but with /pdf/ instead of /abs/)
  const pdfLink = xmlDoc.createElement("link");
  pdfLink.setAttribute("title", "pdf");
  pdfLink.setAttribute("href", arxivInfo.link.replace("/abs/", "/pdf/"));
  pdfLink.setAttribute("rel", "related");
  pdfLink.setAttribute("type", "application/pdf");
  entry.appendChild(pdfLink);

  return entry;
}

async function getCachedReferenceXML(linkHref, currentElement) {
  // Try to use cached reference data as fallback
  const citationKey = linkHref.split("cite.")[1];
  if (citationKey) {
    const cachedFinalRefs = JSON.parse(
      localStorage.getItem("cached_final_refs") || "{}"
    );
    const cachedRef = cachedFinalRefs[citationKey];

    if (cachedRef) {
      console.log("Using cached reference data as fallback:", cachedRef);

      // Create a minimal XML entry from cached data
      const xmlDoc = document.implementation.createDocument(
        "http://www.w3.org/2005/Atom",
        "entry",
        null
      );
      const entry = xmlDoc.documentElement;
      entry.setAttribute("xmlns", "http://www.w3.org/2005/Atom");

      // Add cached data to XML
      const titleElement = xmlDoc.createElement("title");
      titleElement.textContent = cachedRef.title || "Title not available";
      entry.appendChild(titleElement);

      const summaryElement = xmlDoc.createElement("summary");
      summaryElement.textContent =
        cachedRef.abstract || "Abstract not available";
      entry.appendChild(summaryElement);

      const idElement = xmlDoc.createElement("id");
      idElement.textContent = cachedRef.link || "#";
      entry.appendChild(idElement);

      const publishedElement = xmlDoc.createElement("published");
      publishedElement.textContent = `${cachedRef.year || "2023"}-01-01T00:00:00Z`;
      entry.appendChild(publishedElement);

      // Add authors
      if (cachedRef.authors) {
        const authors = cachedRef.authors.split(", ");
        authors.forEach(authorName => {
          const authorElement = xmlDoc.createElement("author");
          const nameElement = xmlDoc.createElement("name");
          nameElement.textContent = authorName;
          authorElement.appendChild(nameElement);
          entry.appendChild(authorElement);
        });
      }

      return entry;
    }
  }

  fail(
    currentElement,
    "Semantic Scholar temporarily unavailable - please try again in a few minutes"
  );
}
