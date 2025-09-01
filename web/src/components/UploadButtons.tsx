import { useRef, useState } from 'react';
import { uploadLibraryImages, type LibraryItem } from '@/lib/api';
import { Button } from './ui/button';
import { useToast } from '@/contexts/ToastContext';

type Props = {
  onUploaded: (items: LibraryItem[]) => void
  onOpenEditor: (id: string) => void
}

export default function UploadButtons({ onUploaded, onOpenEditor }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<'library' | 'edit'>('library');
  const { showToast } = useToast();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const items = await uploadLibraryImages(Array.from(files));
      onUploaded(items);
      showToast(`Uploaded ${items.length} image${items.length>1?'s':''}`, 'success');
      if (mode === 'edit' && items[0]) onOpenEditor(items[0].id);
    } catch (e: any) {
      showToast(e.message || 'Upload failed', 'error');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex gap-2 items-center">
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e)=>handleFiles(e.target.files)} />
      <Button variant="outline" onClick={() => { setMode('library'); fileRef.current?.click(); }}>Upload Images</Button>
      <Button variant="outline" onClick={() => { setMode('edit'); fileRef.current?.click(); }}>Upload & Edit</Button>
    </div>
  );
}

