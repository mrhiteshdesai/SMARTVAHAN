import { X } from "lucide-react";

export default function Modal({
  open,
  title,
  children,
  onClose,
  maxWidth = "max-w-lg"
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} bg-white rounded-lg shadow-xl border max-h-[90vh] flex flex-col`}>
        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0 bg-white rounded-t-lg">
          <div className="font-semibold text-lg">{title}</div>
          <button 
            className="rounded-full p-1 hover:bg-gray-100 transition-colors" 
            onClick={onClose} 
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
