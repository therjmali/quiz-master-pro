import ReportPreviewPage from './ReportPreviewPage';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  iframeHtml: string;
  loading?: boolean;
  [k: string]: unknown;
}

/** Kept for screens that still hand over HTML: shown in the same full-page, offline report viewer. */
export default function SmartPreviewModal({ open, onClose, title, iframeHtml }: Props) {
  if (!open) return null;
  return <ReportPreviewPage data={{ title, html: iframeHtml }} onBack={onClose} />;
}
