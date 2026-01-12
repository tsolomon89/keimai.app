import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, RefreshCw, Plus, Lightbulb } from 'lucide-react';

interface AIGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (prompt: string, mode: 'merge' | 'replace') => void;
  isLoading: boolean;
  hasExistingData: boolean;
}

const SUGGESTIONS = [
  "Social Network (Users, Posts, Likes)",
  "E-commerce (Products, Orders, Customers)",
  "Blog CMS (Authors, Posts, Comments, Tags)",
  "Project Management (Tasks, Users, Boards)"
];

const AIGeneratorModal: React.FC<AIGeneratorModalProps> = ({ isOpen, onClose, onGenerate, isLoading, hasExistingData }) => {
  const [prompt, setPrompt] = useState('');
  // Default to merge if data exists, otherwise replace
  const [mode, setMode] = useState<'merge' | 'replace'>('replace');

  useEffect(() => {
    if (isOpen) {
        setMode(hasExistingData ? 'merge' : 'replace');
    }
  }, [isOpen, hasExistingData]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim()) {
      onGenerate(prompt, mode);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 pb-4 border-b border-gray-800 bg-gray-900/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-900/30">
                <Sparkles size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">AI Schema Architect</h2>
                <p className="text-xs text-gray-400 font-medium">Powered by Gemini 3.0</p>
              </div>
            </div>
            <button 
                onClick={onClose} 
                className="text-gray-500 hover:text-white hover:bg-gray-800 p-2 rounded-full transition-all"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Mode Selection */}
            <div className="bg-gray-950 p-1 rounded-lg flex border border-gray-800">
                <button
                    type="button"
                    onClick={() => setMode('merge')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                        mode === 'merge' 
                        ? 'bg-gray-800 text-white shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    <Plus size={16} />
                    Extend Existing
                </button>
                <button
                    type="button"
                    onClick={() => setMode('replace')}
                    className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${
                        mode === 'replace' 
                        ? 'bg-gray-800 text-white shadow-sm' 
                        : 'text-gray-500 hover:text-gray-300'
                    }`}
                >
                    <RefreshCw size={16} />
                    Create New
                </button>
            </div>

            {/* Prompt Input */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-violet-500"></span>
                Describe your requirements
              </label>
              <div className="relative group">
                <textarea
                    className="w-full bg-gray-950 border border-gray-700 rounded-xl p-4 text-gray-200 placeholder-gray-600 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 outline-none resize-none h-36 transition-all"
                    placeholder={mode === 'merge' ? "e.g., Add a 'Reviews' table linked to Products with rating and comment fields..." : "e.g., Design a complete schema for a library management system..."}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    autoFocus
                />
                <div className="absolute bottom-3 right-3 text-[10px] text-gray-600 font-mono">
                    {prompt.length} chars
                </div>
              </div>
            </div>

            {/* Quick Suggestions */}
            <div>
                 <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <Lightbulb size={12} />
                    Quick Starters
                </label>
                <div className="flex flex-wrap gap-2">
                    {SUGGESTIONS.map((suggestion, idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setPrompt(suggestion)}
                            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-full border border-gray-700 hover:border-violet-500/50 transition-all text-left"
                        >
                            {suggestion}
                        </button>
                    ))}
                </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-800 bg-gray-900/50 flex justify-between items-center">
             <div className="text-[10px] text-gray-500 max-w-[200px] leading-tight hidden sm:block">
                {mode === 'merge' 
                    ? "AI will attempt to integrate new nodes into your existing graph structure." 
                    : "Current graph will be cleared and replaced with the new schema."}
            </div>
            <div className="flex gap-3">
                <button 
                    type="button" 
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                >
                    Cancel
                </button>
                <button 
                    onClick={handleSubmit}
                    disabled={isLoading || !prompt.trim()}
                    className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-violet-900/20"
                >
                    {isLoading ? (
                        <>
                            <Loader2 size={16} className="animate-spin" />
                            Thinking...
                        </>
                    ) : (
                        <>
                            <Sparkles size={16} />
                            Generate
                        </>
                    )}
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AIGeneratorModal;