/**
 * Paper data fetching and storage
 */

import { queuedFetch } from './api.js';
import { fail } from './data-models.js';
import { extractTitleWithGroq } from './groq.js';

// Function to fetch all data for a paper (extract title -> get S2 -> store)
export async function fetchDataForPaper(id) {
  console.log("Attempting to extract title from PDF for paper ID:", id);
  const pdfDocument = PDFViewerApplication.pdfDocument;

  if (pdfDocument) {
    try {
      const page = await pdfDocument.getPage(1);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(" ");
      console.log(
        "Extracted text from first page for",
        id,
        ":",
        pageText.substring(0, 200) + "..."
      );

      // Call Groq API to extract title from the first page text
      const extractedTitle = await extractTitleWithGroq(pageText);

      if (extractedTitle) {
        console.log("Extracted title from PDF for", id, ":", extractedTitle);
        // Now fetch Semantic Scholar data using the extracted title
        await fetchAndStoreSemanticScholarData(extractedTitle, id);
      } else {
        console.error("Could not extract title using Groq for paper ID:", id);
      }
    } catch (error) {
      console.error(
        "Error getting page text content or extracting title for",
        id,
        ":",
        error
      );
    }
  } else {
    console.log("PDF document not loaded yet for paper ID:", id);
  }
}

// Function to fetch data from Semantic Scholar and store it
export async function fetchAndStoreSemanticScholarData(title, paperId) {
  console.log(
    `Fetching Semantic Scholar data for title: "${title}", paper ID: ${paperId}`
  );
  try {
    // First get Semantic Scholar paper ID using title match
    const requestOptions = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
      }
    };

    const matchResponse = await queuedFetch(
      `https://api.semanticscholar.org/graph/v1/paper/search/match?query=${encodeURIComponent(title)}`,
      requestOptions,
      5
    );

    if (!matchResponse.ok) {
      if (matchResponse.status === 404) {
        console.log("Semantic Scholar: Title match not found for", title);
        // Store minimal data indicating title but no S2 match
        const minimalData = {
          title: title,
          semantic_paper_id: null,
          references: [],
        };
        localStorage.setItem(
          `paper_data_${paperId}`,
          JSON.stringify(minimalData)
        );
        return; // Stop if no match
      } else {
        throw new Error(`Title match failed: ${matchResponse.status}`);
      }
    }

    const matchData = await matchResponse.json();
    const semanticPaperId = matchData.data[0].paperId;
    console.log(`Semantic Scholar ID found for "${title}": ${semanticPaperId}`);

    // Then get references using the Semantic Scholar paper ID
    const referencesResponse = await queuedFetch(
      `https://api.semanticscholar.org/graph/v1/paper/${semanticPaperId}/references?fields=abstract&offset=0&limit=999`,
      requestOptions,
      5
    );

    const referencesData = await referencesResponse.json();
    console.log(
      `Fetched ${referencesData.data ? referencesData.data.length : 0} references for ${semanticPaperId}`
    );

    // Store title, Semantic Scholar ID, and references together in localStorage
    const fullPaperData = {
      title: title,
      semantic_paper_id: semanticPaperId,
      references: referencesData.data || [], // Ensure references is always an array
    };

    localStorage.setItem(
      `paper_data_${paperId}`,
      JSON.stringify(fullPaperData)
    );
    console.log("Stored full paper data for", paperId, ":", fullPaperData);

    if (!referencesData.data || referencesData.data.length === 0) {
      alert("This paper cannot be indexed by Alice. Please try again later.");
      fail(currentElement, "Paper not indexed by Alice");
      return;
    }

    alert("Alice has completed indexing this paper.");

    // If there's an active link being hovered that is waiting for this data, trigger a hover event
    if (typeof $ !== "undefined") {
      const $activeHoveredLinks = $("a:hover");
      if ($activeHoveredLinks.length > 0) {
        console.log(
          "Found active hovered link, triggering hover event to show popup"
        );
        // Briefly unhover and then rehover to trigger the popup creation
        const $link = $activeHoveredLinks.first();
        $link.trigger("mouseleave");
        setTimeout(() => {
          $link.trigger("mouseenter");
        }, 100);
      }
    }
  } catch (error) {
    console.error(
      "Error fetching or storing Semantic Scholar data for",
      paperId,
      ":",
      error
    );
  }
}
