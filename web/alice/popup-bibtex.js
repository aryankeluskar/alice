/**
 * BibTeX button handler for popups
 */

import { fetchWithRetry, fetchBibTexData } from './api.js';
import { TEMPLATE_BIBTEX } from '../alice_constants.js';

export function setupBibtexButton($popup, popupId, state) {
  let {
    link,
    abstract,
    fullTitle,
    isProcessing,
    isButtonClicked,
  } = state;

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
          .find(".alice_main_content");
        const abstractDiv = contentDiv.find(".alice_main_abstract");

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
          .find(".alice_main_content");
        const abstractDiv = contentDiv.find(".alice_main_abstract");

        $(`#${popupId}-code-content`).hide();
        $(`#${popupId}-abstract-content`).show();

        isProcessing = true;
        abstractDiv.html("<div>Fetching BibTex...</div>");

        try {
          const arxivId = await extractArxivId(link, fullTitle);

          if (arxivId) {
            const bibtexData = await fetchBibTexData(arxivId);

            abstractDiv.html(TEMPLATE_BIBTEX(popupId, bibtexData));

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

async function extractArxivId(link, fullTitle) {
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
    const searchEndpoint = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(keywords)}&start=0&max_results=1`;
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

  return arxivId;
}
