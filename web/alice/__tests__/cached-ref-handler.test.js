/**
 * Tests for cached reference handling
 */

import { getCachedReference, createXMLFromCachedRef } from '../cached-ref-handler.js';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    clear: () => { store = {}; },
    removeItem: (key) => { delete store[key]; }
  };
})();

global.localStorage = localStorageMock;

describe('CachedRefHandler', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getCachedReference', () => {
    test('should return null when no cache exists', () => {
      const result = getCachedReference("#cite.smith2020deep");
      expect(result.cachedRef).toBeNull();
      expect(result.citationKey).toBe("smith2020deep");
    });

    test('should return cached reference when it exists', () => {
      const mockCache = {
        "smith2020deep": {
          title: "Deep Learning",
          abstract: "Abstract text",
          authors: "John Smith",
          year: 2020,
          link: "https://arxiv.org/abs/2001.00000"
        }
      };
      localStorage.setItem("cached_final_refs", JSON.stringify(mockCache));

      const result = getCachedReference("#cite.smith2020deep");
      expect(result.cachedRef).toBeDefined();
      expect(result.cachedRef.title).toBe("Deep Learning");
      expect(result.citationKey).toBe("smith2020deep");
    });
  });

  describe('createXMLFromCachedRef', () => {
    test('should create valid XML from cached reference', () => {
      const cachedRef = {
        title: "Test Paper",
        abstract: "Test abstract",
        authors: "Author One, Author Two",
        year: 2023,
        link: "https://arxiv.org/abs/2301.00000"
      };

      const xml = createXMLFromCachedRef(cachedRef);

      expect(xml.nodeName).toBe("entry");
      expect(xml.getElementsByTagName("title")[0].textContent).toBe("Test Paper");
      expect(xml.getElementsByTagName("summary")[0].textContent).toBe("Test abstract");
      expect(xml.getElementsByTagName("id")[0].textContent).toBe("https://arxiv.org/abs/2301.00000");

      const authors = xml.getElementsByTagName("author");
      expect(authors.length).toBe(2);
      expect(authors[0].getElementsByTagName("name")[0].textContent).toBe("Author One");
    });
  });
});
