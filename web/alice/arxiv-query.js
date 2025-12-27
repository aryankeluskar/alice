/**
 * ArXiv API query construction and execution
 */

import { fail } from './data-models.js';

export function buildArxivQuery(titleInfo, source) {
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
  }

  // search strategy: pull lots of results since the
  // title/author combination might be ambiguous
  let arxivEndpoint;
  if (title && author) {
    arxivEndpoint = `https://export.arxiv.org/api/query?search_query=ti:${title}+AND+au:${author}&start=0&max_results=50`;
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
      arxivEndpoint = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
        keywords
      )}&start=0&max_results=50`;
    } else {
      // For BibTeX parsed titles, use the original strategy
      arxivEndpoint = `https://export.arxiv.org/api/query?search_query=ti:${encodeURIComponent(
        title
      )}&start=0&max_results=50`;
    }
  } else {
    return null;
  }

  return { arxivEndpoint, title, author, year };
}
