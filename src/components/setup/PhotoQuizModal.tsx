import { useState, useRef } from 'react';
import { Camera, Upload, X, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { QuizQuestion } from '../../types/quiz';
import { ocrExtractQuestions } from 'zitejs/api';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (questions: QuizQuestion[]) => void;
}

export default function PhotoQuizModal({ open, onClose, onImport }: Props) {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [imageData, setImageData] = useState<{ base64: string; mimeType: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleFile = (file: File) => {
    if (file.size > 10 * 1024 * 1024) { toast.error('Image too large (max 10MB)'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      const base64 = dataUrl.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      setImageData({ base64, mimeType });
    };
    reader.readAsDataURL(file);
  };

  const handleExtract = async () => {
    if (!imageData) { toast.error('Select an image first'); return; }
    setLoading(true);
    try {
      const result = await ocrExtractQuestions({
        imageBase64: imageData.base64,
        mimeType: imageData.mimeType,
      });
      if (result.questions.length === 0) {
        toast.error('No questions found in the image. Try a clearer photo.');
        return;
      }
      const questions = result.questions.map(q => ({
        ...q,
        difficulty: q.difficulty as 'easy' | 'medium' | 'hard',
        options: q.options.length >= 2 ? q.options : [...q.options, 'Option B', 'Option C', 'Option D'].slice(0, 4),
      }));
      toast.success(`📸 Extracted ${questions.length} questions!`);
      onImport(questions);
      onClose();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to extract questions');
    } finally { setLoading(false); }
  };

  const handleClear = () => { setPreview(null); setImageData(null); };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-12 sm:pt-16 p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-card rounded-3xl p-6 max-w-md w-full animate-fade-in">
        <button onClick={onClose} className="absolute top-4 right-4 text-foreground/30 hover:text-foreground/70 transition-colors">
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Camera className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-base font-black text-foreground">Quick Quiz from Photo</h3>
            <p className="text-[11px] text-foreground/40">AI extracts MCQs from your photo</p>
          </div>
        </div>

        {!preview ? (
          <div className="space-y-3">
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

            <button onClick={() => cameraRef.current?.click()}
              className="w-full flex items-center gap-3 bg-primary/10 border border-primary/25 rounded-2xl p-4 text-left transition-all active:scale-[0.98] hover:bg-primary/15">
              <div className="w-12 h-12 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center flex-shrink-0">
                <Camera className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">📸 Take Photo</p>
                <p className="text-[11px] text-foreground/40">Snap a textbook page or question paper</p>
              </div>
            </button>

            <button onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-3 bg-foreground/[0.03] border border-border rounded-2xl p-4 text-left transition-all active:scale-[0.98] hover:bg-foreground/[0.05]">
              <div className="w-12 h-12 rounded-xl bg-foreground/5 border border-border flex items-center justify-center flex-shrink-0">
                <Upload className="w-6 h-6 text-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">🖼️ Upload Image</p>
                <p className="text-[11px] text-foreground/40">Select from your gallery</p>
              </div>
            </button>

            <p className="text-[10px] text-foreground/25 text-center">
              Works with printed MCQs, handwritten papers, and textbook screenshots
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden border border-border">
              <img src={preview} alt="Preview" className="w-full max-h-[300px] object-contain bg-black/20" />
              <button onClick={handleClear}
                className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-lg hover:bg-black/80 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <button onClick={handleExtract} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-black text-sm py-3.5 rounded-xl shadow-lg shadow-primary/25 transition-all active:scale-[0.98] disabled:opacity-50">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Extracting Questions…</> : <><Sparkles className="w-4 h-4" /> Extract Questions</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
