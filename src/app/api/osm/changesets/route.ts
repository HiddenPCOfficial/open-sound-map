export async function GET() {
  try {
    const load = async (query = '') => {
      const response = await fetch(`https://api.openstreetmap.org/api/0.6/changesets.json${query}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'ListenToOpenStreetMap/1.0' },
        next: { revalidate: 15 }, signal: AbortSignal.timeout(12000),
      });
      if (!response.ok) throw new Error('OSM unavailable');
      const data = await response.json();
      const changesets = Array.isArray(data.changesets) ? data.changesets : data.elements;
      if (!Array.isArray(changesets)) throw new Error('Invalid response');
      return changesets as { id: number; changes_count: number }[];
    };
    // The global endpoint only returns 100 changesets. Reserve a separate
    // recent window for Italy, including Sicily and Sardinia.
    const since = new Date(Math.floor(Date.now() / 15000) * 15000 - 10 * 60000).toISOString();
    const results = await Promise.allSettled([
      load(),
      load(`?bbox=6.6,35.4,18.6,47.2&time=${encodeURIComponent(since)}`),
    ]);
    const merged = new Map<number, { id: number; changes_count: number }>();
    if (results.every(result => result.status === 'rejected')) throw new Error('OSM unavailable');
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      for (const changeset of result.value) {
        const previous = merged.get(changeset.id);
        if (!previous || changeset.changes_count > previous.changes_count) merged.set(changeset.id, changeset);
      }
    }
    return Response.json({ changesets: [...merged.values()].sort((a, b) => b.id - a.id) });
  } catch { return Response.json({ error: 'OpenStreetMap temporaneamente non disponibile' }, { status: 502 }); }
}
