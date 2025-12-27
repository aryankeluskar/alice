/**
 * Tests for markdown rendering functions
 */

import {
  cleanAIIntroText,
  cleanupCodeFromResponse,
  containsPythonCode
} from '../markdown.js';

describe('Markdown', () => {
  describe('cleanAIIntroText', () => {
    test('should remove common AI introduction phrases', () => {
      const text = "Sure, here is a summary of the paper.";
      const result = cleanAIIntroText(text);
      // The function removes "Sure, " and then "here is a summary" pattern
      expect(result.length).toBeLessThan(text.length);
      expect(result).not.toContain("Sure");
    });

    test('should remove multiple types of introductions', () => {
      const text = "Let me provide a breakdown of the main points.";
      const result = cleanAIIntroText(text);
      expect(result).not.toContain("Let me");
    });

    test('should return empty string for null input', () => {
      const result = cleanAIIntroText(null);
      expect(result).toBe("");
    });

    test('should not modify text without introductions', () => {
      const text = "The paper discusses machine learning techniques.";
      const result = cleanAIIntroText(text);
      expect(result).toBe(text);
    });
  });

  describe('containsPythonCode', () => {
    test('should detect Python function definitions', () => {
      const text = "def my_function():\n    return 42";
      expect(containsPythonCode(text)).toBe(true);
    });

    test('should detect print statements', () => {
      const text = "print('Hello, world!')";
      expect(containsPythonCode(text)).toBe(true);
    });

    test('should detect import statements', () => {
      const text = "import numpy as np";
      expect(containsPythonCode(text)).toBe(true);
    });

    test('should return false for regular text', () => {
      const text = "This is just regular text without code.";
      expect(containsPythonCode(text)).toBe(false);
    });
  });

  describe('cleanupCodeFromResponse', () => {
    test('should remove Python function calls', () => {
      let text = "Some text\nprint(results)\nMore text";
      const result = cleanupCodeFromResponse(text);
      expect(result).not.toContain("print(");
    });

    test('should remove import statements', () => {
      let text = "import os\nimport sys\nActual content";
      const result = cleanupCodeFromResponse(text);
      expect(result).not.toContain("import");
    });
  });
});
