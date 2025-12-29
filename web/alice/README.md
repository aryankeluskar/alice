# Alice - Intelligent Citation Reference System

Alice is a modular citation reference system for PDF.js that provides intelligent hover popups for academic paper citations.

## Project Structure

The codebase has been refactored into logical modules, each under 300 lines:

### Core Modules
- `api.js` - API calls (Groq, ArXiv, Semantic Scholar, BibTeX)
- `cache.js` - Caching and request queue management
- `data-models.js` - Data classes and utilities
- `utils.js` - General utility functions

### AI & Processing
- `groq.js` - Groq API processing
- `markdown.js` - Markdown rendering and text cleaning

### Data Fetching
- `paper-data.js` - Paper data fetching and storage
- `reference-fallback.js` - Fallback reference resolution
- `arxiv-query.js` - ArXiv query construction

### UI Components
- `popup.js` - Popup creation and management
- `popup-buttons.js` - Button event coordination
- `popup-summary.js` - Summary button handler
- `popup-bibtex.js` - BibTeX button handler

### Event Handling
- `event-handlers.js` - Mouse event handlers
- `citation-processor.js` - Citation processing logic
- `xml-matcher.js` - XML entry matching
- `cached-ref-handler.js` - Cached reference handling

### Initialization
- `fetch-citation-info.js` - Main entry point
- `jquery-loader.js` - jQuery loading logic
- `scale-handler.js` - Scale factor management
- `index.js` - Public API exports

## Testing

Run tests with:
```bash
cd /Users/aryank/Developer/pdf.js/web/alice
npm install
npm test
```

## Features

- **Intelligent Citation Detection**: Automatically detects and processes citation links
- **Multi-Source Data**: Fetches from ArXiv, Semantic Scholar, and BibTeX APIs
- **AI-Powered Fallback**: Uses Groq AI for title extraction and matching
- **Caching**: Reduces API calls with intelligent caching
- **Responsive Popups**: Scale-aware popups that adapt to PDF zoom levels
- **Markdown Support**: Rich text rendering for summaries

## Phase Completion

✅ **Phase 1: Refactoring Complete**
- Original 2897 lines split into 21 modular files
- All files under 300 lines
- Clear separation of concerns

✅ **Phase 2: Tests Written**
- Comprehensive test coverage for utilities
- Data model tests
- Markdown processing tests
- Cache and query building tests

⏳ **Phase 3: Test Execution** (In Progress)
