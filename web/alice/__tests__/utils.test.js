/**
 * Tests for utility functions
 */

import { getBibtexReferenceFromInternalLink, parseBibtexReference } from '../utils.js';

describe('Utils', () => {
  describe('getBibtexReferenceFromInternalLink', () => {
    test('should extract bibtex reference from valid link', () => {
      const link = "http://example.com#cite.smith2020deep";
      const result = getBibtexReferenceFromInternalLink(link);
      expect(result).toBe("smith2020deep");
    });

    test('should return null if link has no hash', () => {
      const link = "http://example.com";
      const result = getBibtexReferenceFromInternalLink(link);
      expect(result).toBeNull();
    });

    test('should return null if hash does not start with cite.', () => {
      const link = "http://example.com#section1";
      const result = getBibtexReferenceFromInternalLink(link);
      expect(result).toBeNull();
    });
  });

  describe('parseBibtexReference', () => {
    test('should parse valid bibtex reference', () => {
      const ref = "smith2020deep";
      const result = parseBibtexReference(ref);
      expect(result).toEqual({
        author: "smith",
        year: "2020",
        title: "deep"
      });
    });

    test('should return null for invalid reference format', () => {
      const ref = "invalidreference";
      const result = parseBibtexReference(ref);
      expect(result).toBeNull();
    });

    test('should handle multi-letter author names', () => {
      const ref = "johnson2021machine";
      const result = parseBibtexReference(ref);
      expect(result).toEqual({
        author: "johnson",
        year: "2021",
        title: "machine"
      });
    });
  });
});
