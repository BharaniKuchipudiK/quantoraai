import pptxgen from "pptxgenjs";

export async function generatePPTXFromJson(deckSpec) {
  const PptxGenJS = pptxgen.default || pptxgen;
  const pptx = new PptxGenJS();
  pptx.author = 'Quantora AI';
  pptx.company = 'Quantora';
  pptx.subject = deckSpec.title || 'Consulting Deck';
  pptx.title = deckSpec.title || 'Consulting Deck';

  // Define Master Slide
  pptx.defineSlideMaster({
    title: "MASTER_SLIDE",
    bkgd: "FFFFFF",
    objects: [
      { rect: { x: 0, y: 0, w: "100%", h: 0.5, fill: "2563EB" } }, // Blue top border
      { text: { text: "QUANTORA AI", options: { x: 0.5, y: "92%", w: 2, h: 0.5, fontSize: 10, color: "64748B", bold: true } } },
      { text: { text: deckSpec.title, options: { x: 3, y: "92%", w: 4, h: 0.5, fontSize: 10, color: "94A3B8", align: "center" } } },
      { text: { text: "CONFIDENTIAL", options: { x: 8, y: "92%", w: 1.5, h: 0.5, fontSize: 10, color: "EF4444", bold: true, align: "right" } } }
    ],
    slideNumber: { x: 9.5, y: "92%", color: "64748B" }
  });

  const slides = deckSpec.slides || [];

  slides.forEach((s) => {
    const slide = pptx.addSlide({ masterName: "MASTER_SLIDE" });
    if (s.speakerNotes) {
      slide.addNotes(s.speakerNotes);
    }

    switch (s.type) {
      case 'cover':
        slide.bkgd = "0F172A"; // Dark background
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.3, fill: "2563EB" });
        slide.addText(s.title || "Title", { x: 1, y: 2.5, w: 8, h: 1.5, fontSize: 44, color: "FFFFFF", bold: true, align: "center" });
        if (s.subtitle) {
          slide.addText(s.subtitle, { x: 1, y: 4.2, w: 8, h: 1, fontSize: 24, color: "94A3B8", align: "center" });
        }
        break;

      case 'section':
        slide.bkgd = "2563EB"; // Blue background
        slide.addText("SECTION", { x: 1, y: 2, w: 8, h: 0.5, fontSize: 16, color: "BFDBFE", bold: true, letterSpacing: 2 });
        slide.addText(s.title || "Section", { x: 1, y: 2.5, w: 8, h: 1.5, fontSize: 40, color: "FFFFFF", bold: true });
        if (s.subtitle) {
          slide.addText(s.subtitle, { x: 1, y: 4, w: 8, h: 1, fontSize: 20, color: "DBEAFE" });
        }
        break;

      case 'data_viz':
        slide.addText(s.title || "Data", { x: 0.5, y: 0.5, w: 9, h: 0.8, fontSize: 28, color: "0F172A", bold: true });
        if (s.subtitle) {
          slide.addText(s.subtitle, { x: 0.5, y: 1.2, w: 9, h: 0.5, fontSize: 16, color: "64748B" });
        }

        // Left column bullets
        if (s.bullets && s.bullets.length > 0) {
          slide.addText(s.bullets.map(b => ({ text: b, options: { bullet: true, color: "334155" } })), {
            x: 0.5, y: 2, w: 4, h: 3, fontSize: 16, valign: 'top'
          });
        }

        // Right column chart
        if (s.data && s.data.length > 0) {
          const chartLabels = s.data.map(d => d.label);
          const chartValues = s.data.map(d => d.value);
          slide.addChart(pptx.charts.BAR, [
            {
              name: 'Series 1',
              labels: chartLabels,
              values: chartValues
            }
          ], { x: 5, y: 2, w: 4.5, h: 3, chartColors: ["2563EB"] });
        }
        break;

      case 'quote':
        slide.addText('"', { x: 1, y: 1, w: 8, h: 1, fontSize: 60, color: "2563EB", align: "center" });
        slide.addText(s.quote || s.title, { x: 1, y: 2.5, w: 8, h: 2, fontSize: 28, color: "0F172A", italic: true, align: "center" });
        if (s.author) {
          slide.addText(`— ${s.author}`, { x: 1, y: 4.5, w: 8, h: 0.8, fontSize: 18, color: "2563EB", bold: true, align: "center" });
        }
        break;

      case 'matrix':
      case 'bullets':
      default:
        slide.addText(s.title || "Slide", { x: 0.5, y: 0.5, w: 9, h: 0.8, fontSize: 28, color: "0F172A", bold: true });
        if (s.subtitle) {
          slide.addText(s.subtitle, { x: 0.5, y: 1.2, w: 9, h: 0.5, fontSize: 16, color: "64748B" });
        }
        
        if (s.bullets && s.bullets.length > 0) {
          if (s.type === 'matrix') {
            // Render as grid (2x2)
            const gridX = [0.5, 5.25];
            const gridY = [2, 3.5];
            s.bullets.forEach((b, i) => {
              if (i < 4) {
                slide.addShape(pptx.ShapeType.rect, { x: gridX[i % 2], y: gridY[Math.floor(i / 2)], w: 4.5, h: 1.2, fill: "F8FAFC", line: "CBD5E1" });
                slide.addText(b, { x: gridX[i % 2] + 0.2, y: gridY[Math.floor(i / 2)] + 0.1, w: 4.1, h: 1, fontSize: 14, color: "0F172A", valign: 'middle' });
              }
            });
          } else {
            // Render as bullets
            slide.addText(s.bullets.map(b => ({ text: b, options: { bullet: true, color: "334155" } })), {
              x: 0.5, y: 2, w: 9, h: 3, fontSize: 18, valign: 'top'
            });
          }
        }
        break;
    }
  });

  const safeTitle = (deckSpec.title || 'presentation').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
}
