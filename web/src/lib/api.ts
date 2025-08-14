// Centralized API configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

export type LibraryItem = {
  id: string;
  url: string;
  filename: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  format: "png" | "jpeg";
  createdAt: string;
};

// Helper function for API requests
async function apiRequest(endpoint: string, options?: RequestInit) {
  const url = `${API_BASE_URL}${endpoint}`;
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response;
}

export async function listLibrary(): Promise<LibraryItem[]> {
  const response = await apiRequest("/api/library/images");
  const data = await response.json();
  return data.items as LibraryItem[];
}

export async function deleteLibraryItem(id: string) {
  await apiRequest(`/api/library/images/${id}`, { method: "DELETE" });
  return true;
}

export async function describeImagesByIds(ids: string[], detail: "auto"|"low"|"high" = "high") {
  const response = await apiRequest("/api/vision/describe", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ library_ids: ids, detail })
  });
  return (await response.json()) as { description: string };
}

export async function generateImage(prompt: string, size: string, quality: string, format: "png" | "jpeg") {
  const response = await apiRequest("/api/images/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, size, quality, output_format: format, n: 1 })
  });
  return response.json();
}

export async function generateVideo(prompt: string, width: number, height: number, seconds: number, referenceUrls: string[]) {
  const response = await apiRequest("/api/videos/sora/generate", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      prompt,
      width,
      height,
      n_seconds: seconds,
      reference_image_urls: referenceUrls
    })
  });
  return response.json();
}

// Export the base URL for constructing image URLs
export { API_BASE_URL };
