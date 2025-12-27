/**
 * Citation processing logic
 * Handles arXiv API queries and XML processing for citations
 */

import { getGeminiFallbackReference } from "./reference-fallback.js";
import { createAndShowPopup, createAndShowLoadingPopup } from "./popup.js";
import { fail } from "./data-models.js";
import { buildArxivQuery } from "./arxiv-query.js";
import { findMatchingEntry } from "./xml-matcher.js";

const parser = new DOMParser();

// Process title information and query ArXiv
export async function processAndQueryArXiv(
  titleInfo,
  source,
  currentElement,
  paperId,
  linkHref,
  popupId,
  tipsyDirection,
  currentScaleFactor,
  onPopupCreated
) {
  console.log(`Processing paper info from ${source}:`, titleInfo);

  const queryData = buildArxivQuery(titleInfo, source);

  if (!queryData) {
    fail(currentElement, `Failed to extract title information from ${source}`);
    return;
  }

  const { arxivEndpoint, title, author, year } = queryData;

  console.log("title", title);
  console.log("author", author);
  console.log("year", year);

  // Check if we're in a Chrome extension context where CORS will block arXiv API
  const isExtensionContext = window.location.protocol === "chrome-extension:";

  if (isExtensionContext) {
    // Skip arXiv API entirely in extension context due to CORS, go directly to fallback
    console.log(
      "Chrome extension context detected, skipping arXiv API and using Semantic Scholar fallback"
    );

    // Show loading popup immediately for better UX
    const loadingPopup = createAndShowLoadingPopup({
      element: currentElement,
      popupId,
      tipsyDirection,
      currentScaleFactor,
      onPopupCreated,
    });

    if (!loadingPopup) {
      // User stopped hovering
      return;
    }

    try {
      const result = await getGeminiFallbackReference(
        paperId,
        linkHref,
        currentElement
      );

      // Remove loading popup
      if (loadingPopup) {
        loadingPopup.remove();
      }

      if (result) {
        await createAndShowPopup({
          element: currentElement,
          popupId,
          tipsyDirection,
          matchingEntry: result,
          currentScaleFactor,
          onPopupCreated,
        });
      } else {
        fail(
          currentElement,
          "Semantic Scholar fallback failed to find reference"
        );
      }
    } catch (error) {
      console.error("Error in Semantic Scholar fallback:", error);

      // Remove loading popup on error
      if (loadingPopup) {
        loadingPopup.remove();
      }

      fail(currentElement, `Fallback failed: ${error.message}`);
    }
    return;
  }

  // Normal arXiv API flow for non-extension contexts
  const httpRequest = new XMLHttpRequest();
  if (!httpRequest) {
    fail(currentElement, "Failed to create XMLHttpRequest");
    return;
  }

  // Attach all necessary data to the element before binding
  currentElement.httpRequest = httpRequest;
  currentElement.searchTitle = title;
  currentElement.searchAuthor = author;
  currentElement.searchYear = year;
  currentElement.titleSource = source;
  currentElement.isFromTitleExtraction = source === "AI extraction";

  httpRequest.onloadend = async function () {
    await onLoadEnd.call(
      currentElement,
      paperId,
      linkHref,
      popupId,
      tipsyDirection,
      currentScaleFactor,
      onPopupCreated
    );
  };

  // Set timeout for the ArXiv API request
  httpRequest.timeout = 1000;
  httpRequest.ontimeout = async function () {
    console.log(
      "ArXiv API request timed out after 1000ms, falling back to Semantic Scholar"
    );
    try {
      const result = await getGeminiFallbackReference(
        paperId,
        linkHref,
        currentElement
      );
      if (result) {
        await createAndShowPopup({
          element: currentElement,
          popupId,
          tipsyDirection,
          matchingEntry: result,
          currentScaleFactor,
          onPopupCreated,
        });
      }
    } catch (error) {
      console.error("Error in fallback after timeout:", error);
      fail(currentElement, "Request timed out and fallback failed");
    }
  };

  httpRequest.open("GET", arxivEndpoint);
  httpRequest.send();
}

async function onLoadEnd(
  paperId,
  linkHref,
  popupId,
  tipsyDirection,
  currentScaleFactor,
  onPopupCreated
) {
  // Add this check to prevent errors with undefined httpRequest
  if (!this.httpRequest && this !== window) {
    console.log(
      "httpRequest is undefined, creating a new one for the correct context"
    );
    return;
  }

  // Use the stored httpRequest
  const request = this.httpRequest;

  if (
    !request ||
    request.readyState !== XMLHttpRequest.DONE ||
    request.status !== 200
  ) {
    const status = request ? request.status : "undefined request";
    console.log(
      `ArXiv API request failed with status ${status}, falling back to Semantic Scholar`
    );

    // Try Semantic Scholar fallback when ArXiv fails (including CORS errors)
    try {
      const result = await getGeminiFallbackReference(paperId, linkHref, this);
      if (result) {
        await createAndShowPopup({
          element: this,
          popupId,
          tipsyDirection,
          matchingEntry: result,
          currentScaleFactor,
          onPopupCreated,
        });
        return;
      }
    } catch (error) {
      console.error("Error in fallback after request failure:", error);
    }

    fail(this, `HTTP request failed with status ${status}`);
    return;
  }

  const xmlResponse = parser.parseFromString(request.response, "text/xml");
  console.log("xmlResponse", xmlResponse);

  let found = false;
  for (const child of xmlResponse.children[0].children) {
    if (child.nodeName === "entry") {
      found = true;
      break;
    }
  }

  if (!found) {
    const result = await getGeminiFallbackReference(paperId, linkHref, this);
    if (result) {
      await createAndShowPopup({
        element: this,
        popupId,
        tipsyDirection,
        matchingEntry: result,
        currentScaleFactor,
        onPopupCreated,
      });
    }
    return;
  }

  let matchingEntry = await findMatchingEntry(
    xmlResponse,
    this,
    paperId,
    linkHref,
    popupId,
    tipsyDirection,
    currentScaleFactor,
    onPopupCreated
  );

  if (!matchingEntry) {
    const result = await getGeminiFallbackReference(paperId, linkHref, this);
    if (result) {
      await createAndShowPopup({
        element: this,
        popupId,
        tipsyDirection,
        matchingEntry: result,
        currentScaleFactor,
        onPopupCreated,
      });
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

  const link = matchingEntry.getElementsByTagName("id")[0]?.textContent;
  const fullTitle = matchingEntry.getElementsByTagName("title")[0].textContent;
  const abstract = matchingEntry.getElementsByTagName("summary")[0].textContent;
  const date = matchingEntry.getElementsByTagName("published")[0].textContent;
  const rawAuthors = Array.from(
    matchingEntry.getElementsByTagName("author")
  ).map(a => a.children[0].textContent);

  // Store the data in cached_final_refs
  const citationKey = linkHref.split("cite.")[1];
  if (citationKey) {
    const cachedFinalRefs = JSON.parse(
      localStorage.getItem("cached_final_refs") || "{}"
    );
    cachedFinalRefs[citationKey] = {
      title: fullTitle,
      abstract: abstract,
      authors: rawAuthors.join(", "),
      year: new Date(date).getFullYear(),
      link: link,
    };
    localStorage.setItem("cached_final_refs", JSON.stringify(cachedFinalRefs));
    console.log(
      "Stored paper data in cached_final_refs for citation:",
      citationKey
    );
  }

  // Create and show the popup
  await createAndShowPopup({
    element: this,
    popupId,
    tipsyDirection,
    matchingEntry,
    currentScaleFactor,
    onPopupCreated,
  });

  console.log("Created popup");
}
