export function parseDeckSpec(text) {
  if (!text) return null;

  try {
    // Attempt 1: Look for ```json block
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1].trim());
      return normalizeDeckSpec(parsed);
    }

    // Attempt 2: Balanced brace scan (if model forgot backticks)
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const jsonStr = text.substring(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonStr);
      return normalizeDeckSpec(parsed);
    }
  } catch (err) {
    console.error("Failed to parse deck spec:", err);
    // If it fails to parse, return a fallback instead of crashing
    return {
      title: "Generated Presentation",
      slides: [
        {
          type: "cover",
          title: "Presentation Error",
          subtitle: "The AI failed to generate a valid presentation spec.",
          speakerNotes: err.message
        }
      ]
    };
  }

  // If we reach here, no JSON was found at all.
  return {
    title: "Generated Presentation",
    slides: [
      {
        type: "cover",
        title: "Presentation Error",
        subtitle: "The AI did not output a valid JSON presentation.",
        speakerNotes: "The AI responded with text but failed to provide the necessary JSON data structure."
      }
    ]
  };
}

export function normalizeDeckSpec(spec) {
  if (!spec || typeof spec !== 'object') {
    throw new Error("Deck spec must be an object");
  }

  const normalized = {
    title: spec.title || "Consulting Presentation",
    slides: []
  };

  if (Array.isArray(spec.slides)) {
    normalized.slides = spec.slides.map((slide, index) => {
      if (!slide || typeof slide !== 'object') return { type: 'bullets', title: `Slide ${index + 1}` };
      
      const type = slide.type || 'bullets';
      return {
        id: `slide-${index}-${Date.now()}`,
        type: ['cover', 'section', 'bullets', 'data_viz', 'matrix', 'quote'].includes(type) ? type : 'bullets',
        title: slide.title || '',
        subtitle: slide.subtitle || '',
        bullets: Array.isArray(slide.bullets) ? slide.bullets : (typeof slide.bullets === 'string' ? [slide.bullets] : []),
        data: Array.isArray(slide.data) ? slide.data : (typeof slide.data === 'object' && slide.data !== null ? [slide.data] : []),
        speakerNotes: slide.speakerNotes || '',
        quote: slide.quote || '',
        author: slide.author || ''
      };
    });
  }

  // Ensure at least one slide
  if (normalized.slides.length === 0) {
    normalized.slides.push({
      id: `slide-0-${Date.now()}`,
      type: 'cover',
      title: normalized.title,
      subtitle: 'Generated automatically',
      bullets: [],
      data: []
    });
  }

  return normalized;
}
