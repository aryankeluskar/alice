/**
 * Class representing ArXiv paper information
 * @typedef {Object} ArxivInfo
 * @property {string} title - The title of the paper
 * @property {string} authors - The authors of the paper
 * @property {string} year - The publication year
 * @property {string} abstract - The paper abstract
 * @property {string} link - The link to the paper
 */
export class ArxivInfo {
  constructor(title, authors, year, abstract, link) {
    this.title = title;
    this.authors = authors;
    this.year = year;
    this.abstract = abstract;
    this.link = link;
  }
}

/**
 * Helper function to fail a citation popup
 * @param {HTMLElement} el - The element to mark as failed
 * @param {string} reason - The reason for failure
 */
export function fail(el, reason) {
  // Log the failure reason to help with debugging
  console.log(`Citation popup failed: ${reason}`, $(el).attr("href"));
  // Store the reason on the element for reference
  $(el).data("failReason", reason);
}
