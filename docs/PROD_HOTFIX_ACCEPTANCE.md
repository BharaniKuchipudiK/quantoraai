# Hotfix acceptance checklist

Before merge:

1. Quantora CI passes in full.
2. Vercel preview deployment succeeds.
3. PowerPoint integration test compiles a deck with a real embedded image.
4. Word image-resize tests pass.
5. Travel safety tests prove no mock/fake booking, alert, hotel, attraction, or fare success.
6. Non-travel Gemini turns do not receive travel function declarations or travel persona instructions.
7. Human smoke test: generate/download an Office artifact with an image and run one travel query in the preview environment.
