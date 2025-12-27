/**
 * Tests for arXiv query building
 */

import { buildArxivQuery } from '../arxiv-query.js';

describe('ArxivQuery', () => {
  describe('buildArxivQuery', () => {
    test('should build query from string title (AI extraction)', () => {
      const titleInfo = "Deep Learning for Natural Language Processing";
      const source = "AI extraction";
      const result = buildArxivQuery(titleInfo, source);

      expect(result).toBeDefined();
      expect(result.title).toBe(titleInfo);
      expect(result.arxivEndpoint).toContain("search_query=all:");
    });

    test('should build query from object with title and author', () => {
      const titleInfo = {
        title: "deep",
        author: "smith",
        year: "2020"
      };
      const source = "BibTeX parsing";
      const result = buildArxivQuery(titleInfo, source);

      expect(result).toBeDefined();
      expect(result.title).toBe("deep");
      expect(result.author).toBe("smith");
      expect(result.year).toBe("2020");
      expect(result.arxivEndpoint).toContain("ti:deep");
      expect(result.arxivEndpoint).toContain("au:smith");
    });

    test('should handle title-only queries for BibTeX', () => {
      const titleInfo = {
        title: "learning",
        author: null,
        year: null
      };
      const source = "BibTeX parsing";
      const result = buildArxivQuery(titleInfo, source);

      expect(result).toBeDefined();
      expect(result.arxivEndpoint).toContain("ti:");
      expect(result.arxivEndpoint).not.toContain("au:");
    });

    test('should extract keywords from long titles', () => {
      const titleInfo = "A Deep Neural Network Approach to Understanding Complex Systems";
      const source = "AI extraction";
      const result = buildArxivQuery(titleInfo, source);

      expect(result.arxivEndpoint).toContain("Deep");
      expect(result.arxivEndpoint).toContain("Neural");
      // Should limit to 5 keywords
      const keywords = result.arxivEndpoint.match(/all:([^&]+)/)[1];
      const keywordCount = decodeURIComponent(keywords).split(' ').length;
      expect(keywordCount).toBeLessThanOrEqual(5);
    });

    test('should return null for invalid input', () => {
      const result = buildArxivQuery(null, "BibTeX parsing");
      expect(result).toBeNull();
    });
  });
});
