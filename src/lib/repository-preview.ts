import pLimit from 'p-limit';

// Limit to 5 concurrent requests to avoid GitHub secondary rate limits
const limit = pLimit(5);

export async function fetchRepositoryFiles(candidates: string[]) {
  console.log(`Fetching ${candidates.length} files with concurrency limit...`);
  
  const tasks = candidates.map((path) => {
    return limit(async () => {
      // This is where your actual fetch logic lives
      // Wrapping it in 'limit' ensures only 5 run at a time
      const response = await fetch(`https://api.github.com/repos/...${path}`);
      return response.json();
    });
  });

  return Promise.all(tasks);
}
