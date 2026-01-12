import React, { useState } from 'react';
import { X, Sparkles, Loader2 } from 'lucide-react';

interface AIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (prompt: string) => void;
  isLoading: boolean;
}

const AIGeneratorModal: React.FC<AIGeneratorModalProps> = ({ isOpen, onClose, onGenerate, isLoading }) => {
  const [prompt, setPrompt] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Schema Assistant</h2>
                <p className="text-xs text-gray-400">Powered by Gemini 3.0 Flash</p>
              </div>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Describe your database needs
              </label>
              <textarea
                className="w-full bg-gray-950 border border-gray-700 rounded-xl p-4 text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none h-32"
                placeholder="e.g., Create a graph schema for a music streaming service with Users, Playlists, Songs, and Artists."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-3">
              <button 
                type="button" 
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                type="submit" 
                disabled={isLoading || !prompt.trim()}
                className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-900/20"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                Generate Schema
              </button>
            </div>
          </form>
        </div>
        <div className="bg-gray-800/50 p-4 border-t border-gray-800">
            <p className="text-[10px] text-gray-500 text-center">
                The AI will generate nodes and relationships based on your description. This will replace or merge with your current graph.
            </p>
        </div>
      </div>
    </div>
  );
};

export default AIGeneratorModal;
