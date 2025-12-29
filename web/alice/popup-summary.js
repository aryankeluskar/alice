/**
 * Summary button handler for popups
 */

import { fetchWithRetry } from './api.js';
import { callGroqAPI, processGroqResponse } from './groq.js';
import { cleanAIIntroText, cleanupCodeFromResponse, containsPythonCode } from './markdown.js';

export function setupSummaryButton($popup, popupId, state) {
  let {
    link,
    abstract,
    fullTitle,
    isProcessing,
    isButtonClicked,
    summaryLoaded,
    llmSummary,
    showingSummary,
  } = state;

  const parser = new DOMParser();

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
        .find(".alice_main_content");
      const abstractDiv = contentDiv.find(".alice_main_abstract");

      $(`#${popupId}-code-content`).hide();
      $(`#${popupId}-abstract-content`).show();

      if (showingSummary && !summaryLoaded) {
        isProcessing = true;
        abstractDiv.html("<div>Fetching AI summary...</div>");

        try {
          const arxivText = await fetchArxivText(link, fullTitle, parser);

          if (!arxivText || arxivText.trim() === "") {
            throw new Error("Failed to extract paper content from ArXiv");
          }

          const llmSummaryContent = await generateSummary(arxivText, abstractDiv);

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
}

async function fetchArxivText(link, fullTitle, parser) {
  let arxivText;
  try {
    const arxivEndpoint = link;
    const arxivIdMatch = arxivEndpoint.match(/abs\/([^\/]+)/);
    let arxivId = null;

    if (arxivIdMatch && arxivIdMatch[1]) {
      arxivId = arxivIdMatch[1];
      console.log("Extracted arXiv ID:", arxivId);

      const apiEndpoint = `https://export.arxiv.org/api/query?id_list=${arxivId}`;
      console.log("Using ArXiv API endpoint:", apiEndpoint);

      const apiResponse = await fetchWithRetry(apiEndpoint, {}, 2);
      const xmlData = await apiResponse.text();
      const xmlDoc = parser.parseFromString(xmlData, "text/xml");

      const summary =
        xmlDoc.querySelector("summary")?.textContent || "";
      const title = xmlDoc.querySelector("title")?.textContent || "";
      const authors = Array.from(xmlDoc.querySelectorAll("author name"))
        .map(el => el.textContent)
        .join(", ");

      arxivText = `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
      console.log(
        "Successfully extracted paper data from ArXiv API:",
        arxivText
      );
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

      const searchResponse = await fetchWithRetry(
        searchEndpoint,
        {},
        2
      );
      const searchData = await searchResponse.text();
      const searchDoc = parser.parseFromString(searchData, "text/xml");

      const firstEntry = searchDoc.querySelector("entry");
      if (!firstEntry) {
        throw new Error("No matching papers found in ArXiv search");
      }

      // Extract all necessary information from the search result
      const title =
        firstEntry.querySelector("title")?.textContent || "";
      const summary =
        firstEntry.querySelector("summary")?.textContent || "";
      const authors = Array.from(
        firstEntry.querySelectorAll("author name")
      )
        .map(el => el.textContent)
        .join(", ");

      // Construct the arxivText in the same format as the direct API response
      arxivText = `Title: ${title}\nAuthors: ${authors}\n\nAbstract: ${summary}`;
      console.log(
        "Successfully extracted paper data from ArXiv search:",
        arxivText
      );
    }
  } catch (error) {
    console.error("Error fetching from ArXiv:", error);
    throw new Error(
      `Failed to fetch article from arXiv: ${error.message}. ArXiv blocks direct content access due to CORS restrictions.`
    );
  }

  return arxivText;
}

async function generateSummary(arxivText, abstractDiv) {
  try {
    let groqResult;
    let retryCount = 0;
    let llmSummaryContent = "";
    let containsCode = false;

    do {
      if (retryCount > 0) {
        abstractDiv.html(
          `<div>Retry ${retryCount}/3: Improving summary format...</div>`
        );
      }

      groqResult = await callGroqAPI(arxivText, retryCount);
      console.log(
        `Groq API response (attempt ${retryCount + 1}):`,
        groqResult
      );

      llmSummaryContent = await processGroqResponse(groqResult);
      console.log("LLM summary content:", llmSummaryContent);

      containsCode = containsPythonCode(llmSummaryContent);

      if (containsCode) {
        console.log(
          `Detected code in response, retry ${retryCount + 1}`
        );
        retryCount++;
      }
    } while (containsCode && retryCount < 3);

    if (containsCode) {
      llmSummaryContent = cleanupCodeFromResponse(llmSummaryContent);
    }

    return llmSummaryContent;
  } catch (error) {
    if (error.message.includes("429")) {
      throw new Error(
        "AI summary service is currently busy. Please try again in a few minutes."
      );
    } else {
      throw error;
    }
  }
}
