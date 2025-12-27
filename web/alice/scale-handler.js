/**
 * Scale factor management for Alice popups
 * Handles zoom changes in the PDF viewer
 */

export class ScaleHandler {
  constructor() {
    this.currentScaleFactor = 1;
    this.activePopup = null;
    this.activeLink = null;
  }

  // Add a CSS variable to the document with the scale factor
  updateScaleFactor() {
    try {
      // Get the current scale factor from the document
      const container = document.querySelector(".pdfViewer .page");
      if (container) {
        const computedStyle = window.getComputedStyle(container);
        const scaleFactor =
          computedStyle.getPropertyValue("--total-scale-factor") || "1";
        this.currentScaleFactor = parseFloat(scaleFactor);

        // Calculate a more conservative scale factor for spacing
        // This formula ensures that spacing scales more gradually than elements
        // At scale 1, space-scale-factor = 1
        // At larger/smaller scales, space-scale-factor changes more conservatively
        const spaceScaleFactor = this.currentScaleFactor * 0.7 + 0.3;

        // Apply the space scale factor as a CSS variable
        document.documentElement.style.setProperty(
          "--space-scale-factor",
          spaceScaleFactor
        );
      }
    } catch (err) {
      console.error("Error updating scale factor:", err);
    }
  }

  setupScaleListener() {
    // Initial scale factor setup
    this.updateScaleFactor();

    // Listen for scale changes in the PDF viewer
    const eventBus = PDFViewerApplication.eventBus;
    if (eventBus) {
      eventBus._on("scalechanging", () => {
        // Update scale factor when zoom changes
        setTimeout(() => {
          this.updateScaleFactor();

          // If we have an active popup, close and reopen it to ensure proper scaling
          if (this.activePopup && this.activeLink) {
            const currentLink = this.activeLink;
            // Close current popup
            this.activePopup.remove();
            this.activePopup = null;
            this.activeLink = null;

            // Trigger mouseenter on the link to recreate the popup with updated scale
            $(currentLink).trigger("mouseenter");
          }
        }, 100); // Small delay to ensure CSS has updated
      });
    }
  }

  setActivePopup(popup, link) {
    this.activePopup = popup;
    this.activeLink = link;
  }

  clearActivePopup() {
    this.activePopup = null;
    this.activeLink = null;
  }

  getScaleFactor() {
    return this.currentScaleFactor;
  }
}
