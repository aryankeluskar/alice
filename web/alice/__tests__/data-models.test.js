/**
 * Tests for data models
 */

import { ArxivInfo } from '../data-models.js';

describe('ArxivInfo', () => {
  test('should create ArxivInfo instance with all properties', () => {
    const info = new ArxivInfo(
      "Test Title",
      "John Doe, Jane Smith",
      "2023",
      "This is a test abstract",
      "https://arxiv.org/abs/2301.00000"
    );

    expect(info.title).toBe("Test Title");
    expect(info.authors).toBe("John Doe, Jane Smith");
    expect(info.year).toBe("2023");
    expect(info.abstract).toBe("This is a test abstract");
    expect(info.link).toBe("https://arxiv.org/abs/2301.00000");
  });

  test('should handle empty values', () => {
    const info = new ArxivInfo("", "", "", "", "");

    expect(info.title).toBe("");
    expect(info.authors).toBe("");
    expect(info.year).toBe("");
    expect(info.abstract).toBe("");
    expect(info.link).toBe("");
  });
});
