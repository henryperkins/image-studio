import { useEffect, useMemo, useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Skeleton } from './ui/skeleton';
import { Card, CardContent } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { useToast } from '../contexts/ToastContext';
import { deleteSoraJob, getSoraJob, getSoraThumbnail, listSoraJobs, type SoraJob } from '../lib/api';

type Props = {
  onOpenGeneration?: (generationId: string) => Promise<void> | void
}

const getErrorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err.length > 0) return err;
  return fallback;
};

export default function SoraJobsPanel({ onOpenGeneration }: Props) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<SoraJob[]>([]);
  const [expanded, setExpanded] = useState<Record<string, { loading: boolean; gens: string[]; thumbs: Record<string, string> }>>({});
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await listSoraJobs({ limit: 10 });
      const nextJobs = Array.isArray(res.jobs)
        ? res.jobs
        : Array.isArray(res.data)
          ? res.data
        : [];
      setJobs(nextJobs);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load jobs'));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const hasJobs = useMemo(() => (jobs?.length ?? 0) > 0, [jobs]);

  async function toggle(job: SoraJob) {
    const isOpen = !!expanded[job.id];
    if (isOpen) {
      setExpanded(prev => { const n = { ...prev }; delete n[job.id]; return n; });
      return;
    }
    setExpanded(prev => ({ ...prev, [job.id]: { loading: true, gens: [], thumbs: {} } }));
    try {
      const detail = await getSoraJob(job.id);
      const gens = (detail.generations || []).map(g => g.id);
      const thumbs: Record<string, string> = {};
      // Fetch thumbnails sequentially to avoid spiking the server
      for (const gid of gens) {
        try {
          const t = await getSoraThumbnail(gid);
          thumbs[gid] = `data:${t.content_type};base64,${t.image_base64}`;
        } catch { /* ignore per-gen errors */ }
      }
      setExpanded(prev => ({ ...prev, [job.id]: { loading: false, gens, thumbs } }));
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to load job details'), 'error');
      setExpanded(prev => ({ ...prev, [job.id]: { loading: false, gens: [], thumbs: {} } }));
    }
  }

  async function remove(jobId: string) {
    try {
      await deleteSoraJob(jobId);
      setJobs(prev => prev.filter(j => j.id !== jobId));
      setExpanded(prev => { const n = { ...prev }; delete n[jobId]; return n; });
      showToast('Job deleted', 'success');
    } catch (err: unknown) {
      showToast(getErrorMessage(err, 'Failed to delete job'), 'error');
    }
  }

  return (
    <Card>
      <CardContent className="p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Recent Sora Jobs</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading}>Refresh</Button>
          </div>
        </div>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-5/6" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        )}

        {(!loading && !hasJobs) && (
          <div className="text-xs text-neutral-400">No recent jobs.</div>
        )}

        {error && (
          <div className="text-xs text-destructive">{error}</div>
        )}

        {hasJobs && (
          <ScrollArea className="max-h-80 pr-2">
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="border border-neutral-800 rounded-lg p-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs">
                      <div className="font-mono break-all">{job.id}</div>
                      <div className="text-neutral-400">{job.status}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => toggle(job)}>
                        {expanded[job.id] ? 'Hide' : 'Details'}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => remove(job.id)}>Delete</Button>
                    </div>
                  </div>
                  {expanded[job.id] && (
                    <div className="mt-2">
                      {expanded[job.id].loading ? (
                        <Skeleton className="h-20 w-full" />
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {expanded[job.id].gens.length === 0 && (
                            <div className="text-xs text-neutral-400">No generations yet.</div>
                          )}
                          {expanded[job.id].gens.map(gid => (
                            <div key={gid} className="flex flex-col items-center gap-1">
                              {expanded[job.id].thumbs[gid] ? (
                                <div className="w-28 relative rounded border border-neutral-800 overflow-hidden" style={{ aspectRatio: '16 / 9' }}>
                                  <img src={expanded[job.id].thumbs[gid]} alt="thumb" className="absolute inset-0 w-full h-full object-cover" />
                                </div>
                              ) : (
                                <div className="w-28 relative rounded border border-neutral-800 bg-neutral-900" style={{ aspectRatio: '16 / 9' }} />
                              )}
                              <div className="text-[10px] font-mono max-w-28 truncate" title={gid}>{gid}</div>
                              {onOpenGeneration && (
                                <Button size="sm" variant="outline" onClick={() => onOpenGeneration(gid)}>Open</Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
