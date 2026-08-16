import pptxgen from "pptxgenjs";

// --- TIER 2: DESIGN TOKENS (The "Brand Guidelines") ---
const THEME = {
  colors: {
    primary: "0F172A",     // Slate 900 (Deep Navy/Black)
    secondary: "334155",   // Slate 700 (Dark Gray)
    accent: "2563EB",      // Blue 600 (Consulting Blue)
    accentLight: "DBEAFE", // Blue 100
    background: "FFFFFF",  // Pure White
    surface: "F8FAFC",     // Slate 50 (Off-white for boxes)
    border: "E2E8F0",      // Slate 200
    textMain: "0F172A",
    textMuted: "64748B",   // Slate 500
    white: "FFFFFF"
  },
  fonts: {
    title: "Arial", // Standard universal font for PPTX
    body: "Arial"
  },
  grid: {
    w: 10,
    h: 5.625,
    marginX: 0.5,
    marginY: 0.5,
    headerH: 0.8,
    footerH: 0.4
  }
};

// Derived usable area for content (excluding headers/footers)
const CONTENT_AREA = {
  x: THEME.grid.marginX,
  y: THEME.grid.marginY + THEME.grid.headerH, // e.g., 0.5 + 0.8 = 1.3
  w: THEME.grid.w - (THEME.grid.marginX * 2), // 10 - 1.0 = 9.0
  h: THEME.grid.h - (THEME.grid.marginY * 2) - THEME.grid.headerH - THEME.grid.footerH // 5.625 - 1.0 - 0.8 - 0.4 = 3.425
};

export async function generatePPTXFromJson(deckSpec) {
  const PptxGenJS = pptxgen.default || pptxgen;
  const pptx = new PptxGenJS();
  
  // Base configuration
  pptx.layout = 'LAYOUT_16x9'; // 10 x 5.625
  pptx.author = 'Quantora Strategy Engine';
  pptx.company = 'Quantora';
  pptx.subject = deckSpec.title || 'Consulting Deck';
  pptx.title = deckSpec.title || 'Consulting Deck';

  // --- TIER 2: MASTER SLIDE (The "Stitching Template") ---
  pptx.defineSlideMaster({
    title: "CONSULTING_MASTER",
    bkgd: THEME.colors.background,
    objects: [
      // Top Accent Line
      { rect: { x: 0, y: 0, w: "100%", h: 0.05, fill: THEME.colors.accent } },
      
      // Footer Divider
      { line: { x: THEME.grid.marginX, y: THEME.grid.h - THEME.grid.footerH, w: CONTENT_AREA.w, h: 0, line: THEME.colors.border, lineSize: 1 } },
      
      // Footer Branding
      { text: { text: "QUANTORA STRATEGY", options: { x: THEME.grid.marginX, y: THEME.grid.h - THEME.grid.footerH + 0.1, w: 3, h: 0.2, fontSize: 8, fontFace: THEME.fonts.title, color: THEME.colors.textMuted, bold: true } } },
      
      // Footer Confidentiality
      { text: { text: "STRICTLY CONFIDENTIAL", options: { x: THEME.grid.w / 2 - 1.5, y: THEME.grid.h - THEME.grid.footerH + 0.1, w: 3, h: 0.2, fontSize: 8, fontFace: THEME.fonts.title, color: THEME.colors.accent, bold: true, align: "center" } } }
    ],
    slideNumber: { x: THEME.grid.w - THEME.grid.marginX - 0.5, y: THEME.grid.h - THEME.grid.footerH + 0.1, color: THEME.colors.textMuted, fontSize: 8, fontFace: THEME.fonts.body }
  });

  const slides = deckSpec.slides || [];

  slides.forEach((s) => {
    const slide = pptx.addSlide({ masterName: "CONSULTING_MASTER" });
    if (s.speakerNotes) {
      slide.addNotes(s.speakerNotes);
    }

    // --- COMMON HEADER INJECTION (Unless Cover/Section) ---
    if (s.type !== 'cover' && s.type !== 'section') {
      // Action Title (Consulting standard: definitive statement)
      slide.addText(s.title || "Action Title Required", { 
        x: THEME.grid.marginX, 
        y: THEME.grid.marginY, 
        w: CONTENT_AREA.w, 
        h: 0.5, 
        fontSize: 22, 
        fontFace: THEME.fonts.title, 
        color: THEME.colors.primary, 
        bold: true,
        valign: "top"
      });
      // Subtitle (Optional narrative flow)
      if (s.subtitle) {
        slide.addText(s.subtitle, { 
          x: THEME.grid.marginX, 
          y: THEME.grid.marginY + 0.45, 
          w: CONTENT_AREA.w, 
          h: 0.3, 
          fontSize: 14, 
          fontFace: THEME.fonts.body, 
          color: THEME.colors.textMuted,
          valign: "top"
        });
      }
    }

    // --- TIER 2: CONSTRAINT SOLVERS (The Layout Engine) ---
    switch (s.type) {
      case 'cover':
        // Full bleed background override for master
        slide.bkgd = THEME.colors.primary;
        
        // Abstract geometric elements
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: THEME.colors.primary });
        slide.addShape(pptx.ShapeType.rtTriangle, { x: 4, y: 0, w: 6, h: THEME.grid.h, fill: THEME.colors.secondary });
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: 0.1, fill: THEME.colors.accent });

        // Content
        slide.addText(s.title || "Presentation Title", { 
          x: 1, y: 2, w: 8, h: 1.5, 
          fontSize: 44, fontFace: THEME.fonts.title, color: THEME.colors.white, bold: true 
        });
        if (s.subtitle) {
          slide.addText(s.subtitle, { 
            x: 1, y: 3.5, w: 8, h: 1, 
            fontSize: 20, fontFace: THEME.fonts.body, color: THEME.colors.accentLight 
          });
        }
        break;

      case 'section':
        slide.bkgd = THEME.colors.accent;
        slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: "100%", h: "100%", fill: THEME.colors.accent });
        
        // Large bold number/label
        slide.addText("SECTION", { 
          x: 1, y: 2, w: 8, h: 0.5, 
          fontSize: 14, fontFace: THEME.fonts.title, color: THEME.colors.accentLight, bold: true, letterSpacing: 2 
        });
        slide.addText(s.title || "Section Header", { 
          x: 1, y: 2.5, w: 8, h: 1.5, 
          fontSize: 36, fontFace: THEME.fonts.title, color: THEME.colors.white, bold: true 
        });
        if (s.subtitle) {
          slide.addText(s.subtitle, { 
            x: 1, y: 4, w: 8, h: 1, 
            fontSize: 18, fontFace: THEME.fonts.body, color: THEME.colors.accentLight 
          });
        }
        break;

      case 'matrix':
        // Solver: Dynamic N-Item Grid
        if (s.bullets && s.bullets.length > 0) {
          const itemCount = s.bullets.length;
          // Strategy: if 1, 2, or 3 items, make it a single row. If 4, make it 2x2. If 5+, cap/wrap.
          const cols = itemCount === 4 ? 2 : Math.min(itemCount, 3);
          const rows = Math.ceil(itemCount / cols);
          
          const gapX = 0.2;
          const gapY = 0.2;
          
          // Calculate strict bounds
          const boxW = (CONTENT_AREA.w - (gapX * (cols - 1))) / cols;
          const boxH = (CONTENT_AREA.h - (gapY * (rows - 1))) / rows;

          s.bullets.forEach((bulletText, i) => {
            if (i >= 6) return; // Hard cap for visual sanity
            const col = i % cols;
            const row = Math.floor(i / cols);
            const startX = CONTENT_AREA.x + (col * (boxW + gapX));
            const startY = CONTENT_AREA.y + (row * (boxH + gapY));

            // Card background
            slide.addShape(pptx.ShapeType.roundRect, { 
              x: startX, y: startY, w: boxW, h: boxH, 
              fill: THEME.colors.surface, line: THEME.colors.border, rectRadius: 0.1 
            });
            // Card accent pill
            slide.addShape(pptx.ShapeType.rect, { 
              x: startX + 0.15, y: startY + 0.15, w: 0.05, h: 0.3, fill: THEME.colors.accent 
            });
            // Card text
            slide.addText(bulletText, { 
              x: startX + 0.25, y: startY + 0.1, w: boxW - 0.4, h: boxH - 0.2, 
              fontSize: 14, fontFace: THEME.fonts.body, color: THEME.colors.textMain, 
              valign: 'top', autoFit: true 
            });
          });
        }
        break;

      case 'data_viz':
        // Solver: 1/3 Insights, 2/3 Chart
        const splitX = CONTENT_AREA.w * 0.35;
        
        // Insights column
        if (s.bullets && s.bullets.length > 0) {
          // Highlight first bullet as Key Insight
          slide.addText(s.bullets[0], { 
            x: CONTENT_AREA.x, y: CONTENT_AREA.y, w: splitX - 0.2, h: 0.8, 
            fontSize: 16, fontFace: THEME.fonts.title, color: THEME.colors.primary, bold: true, valign: 'top' 
          });
          
          if (s.bullets.length > 1) {
            slide.addText(s.bullets.slice(1).map(b => ({ text: b, options: { bullet: { type: 'number' }, color: THEME.colors.textMuted } })), {
              x: CONTENT_AREA.x, y: CONTENT_AREA.y + 0.9, w: splitX - 0.2, h: CONTENT_AREA.h - 0.9, 
              fontSize: 14, fontFace: THEME.fonts.body, valign: 'top'
            });
          }
        }

        // Chart Column
        if (s.data && s.data.length > 0) {
          const chartLabels = s.data.map(d => d.label);
          const chartValues = s.data.map(d => d.value);
          slide.addChart(pptx.charts.BAR, [
            { name: 'Primary Metrics', labels: chartLabels, values: chartValues }
          ], { 
            x: CONTENT_AREA.x + splitX + 0.2, 
            y: CONTENT_AREA.y, 
            w: CONTENT_AREA.w - splitX - 0.2, 
            h: CONTENT_AREA.h, 
            chartColors: [THEME.colors.accent, THEME.colors.primary, THEME.colors.accentLight],
            showLegend: false,
            showTitle: false,
            barDir: 'col',
            dataBorder: { pt: 0 },
            valAxisLineShow: false,
            valGridLine: { style: 'solid', color: THEME.colors.border }
          });
        }
        break;

      case 'quote':
        // Big majestic quote layout
        slide.addText('“', { 
          x: CONTENT_AREA.x, y: CONTENT_AREA.y, w: 1, h: 1, 
          fontSize: 80, fontFace: "Georgia", color: THEME.colors.accentLight, align: "left" 
        });
        slide.addText(s.quote || s.title, { 
          x: CONTENT_AREA.x + 0.5, y: CONTENT_AREA.y + 0.5, w: CONTENT_AREA.w - 1, h: CONTENT_AREA.h - 1.5, 
          fontSize: 24, fontFace: THEME.fonts.title, color: THEME.colors.primary, italic: true, valign: 'middle' 
        });
        if (s.author) {
          slide.addText(`— ${s.author}`, { 
            x: CONTENT_AREA.x + 0.5, y: CONTENT_AREA.y + CONTENT_AREA.h - 1, w: CONTENT_AREA.w - 1, h: 0.5, 
            fontSize: 14, fontFace: THEME.fonts.body, color: THEME.colors.textMuted, bold: true 
          });
        }
        break;

      case 'bullets':
      default:
        // Solver: High-end bullet layout (no ugly default dots, structured spacing)
        if (s.bullets && s.bullets.length > 0) {
          const itemHeight = CONTENT_AREA.h / s.bullets.length;
          
          s.bullets.forEach((b, i) => {
            const startY = CONTENT_AREA.y + (i * itemHeight);
            
            // Custom bullet icon (subtle square)
            slide.addShape(pptx.ShapeType.rect, { 
              x: CONTENT_AREA.x + 0.1, y: startY + 0.15, w: 0.08, h: 0.08, fill: THEME.colors.accent 
            });
            
            // Text
            slide.addText(b, { 
              x: CONTENT_AREA.x + 0.4, y: startY, w: CONTENT_AREA.w - 0.4, h: itemHeight - 0.1, 
              fontSize: 16, fontFace: THEME.fonts.body, color: THEME.colors.textMain, valign: 'top', autoFit: true 
            });
          });
        }
        break;
    }
  });

  const safeTitle = (deckSpec.title || 'presentation').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  await pptx.writeFile({ fileName: `${safeTitle}.pptx` });
}
