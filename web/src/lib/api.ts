export type LibraryItem = {
  id: string;
  url: string;
  filename: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  format: "png" | "jpeg";
  createdAt: string;
};

export async function listLibrary(): Promise<LibraryItem[]> {
  const r = await fetch("http://localhost:8787/api/library/images");
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();
  return j.items as LibraryItem[];
}

export async function deleteLibraryItem(id: string) {
  const r = await fetch(`http://localhost:8787/api/library/images/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return true;
}

export async function describeImagesByIds(ids: string[], detail: "auto"|"low"|"high" = "high") {
  const r = await fetch("http://localhost:8787/api/vision/describe", {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ library_ids: ids, detail })
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as { description: string };
}