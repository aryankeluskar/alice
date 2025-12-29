#!/bin/bash

# Build script for Alice Firefox Extension
# This creates a distributable zip file ready for Firefox Add-ons submission

set -e  # Exit on error

echo "🦊 Building Alice Extension for Firefox..."
echo ""

# Get version from manifest
VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": "\(.*\)".*/\1/')
echo "📦 Version: $VERSION"

# Output filename
OUTPUT="alice-firefox-v${VERSION}.zip"

# Remove old build if exists
if [ -f "$OUTPUT" ]; then
    echo "🗑️  Removing old build: $OUTPUT"
    rm "$OUTPUT"
fi

echo "📝 Creating package..."

# Create zip with only necessary files
zip -r "$OUTPUT" \
    manifest.json \
    icon16.png \
    icon48.png \
    icon128.png \
    background.js \
    contentscript.js \
    contentstyle.css \
    extension-router.js \
    pdfHandler.js \
    semantic-scholar-handler.js \
    claude-api-handler.js \
    telemetry.js \
    suppress-update.js \
    preserve-referer.js \
    preferences_schema.json \
    options/ \
    -x "*.DS_Store" \
    -x "__MACOSX" \
    -x "*.md" \
    -x "*.sh" \
    > /dev/null 2>&1

# Check if zip was created successfully
if [ ! -f "$OUTPUT" ]; then
    echo "❌ Failed to create package"
    exit 1
fi

# Get file size
SIZE=$(du -h "$OUTPUT" | cut -f1)

echo ""
echo "✅ Package created successfully!"
echo "📁 File: $OUTPUT"
echo "📊 Size: $SIZE"
echo ""

# Verify contents
echo "📋 Package contents:"
unzip -l "$OUTPUT" | grep -E "manifest|\.js$|\.css$|\.png$|\.json$" | head -20

echo ""
echo "🎯 Next steps:"
echo "   1. Test in Firefox: about:debugging → Load Temporary Add-on"
echo "   2. Submit at: https://addons.mozilla.org/developers/addon/submit/upload-listed"
echo ""
echo "📚 See FIREFOX_SUBMISSION_GUIDE.md for detailed instructions"
echo ""

