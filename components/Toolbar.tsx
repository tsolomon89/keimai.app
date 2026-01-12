import React from 'react';
import { SimulationConfig } from '../types';
import { Sparkles, Download, Upload, Share2, Grid, Activity, PlayCircle } from 'lucide-react';

interface ToolbarProps {
  config: SimulationConfig;
  onConfigChange: (config: SimulationConfig) => void;
  onOpenAI: () => void;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const Toolbar: React.FC<ToolbarProps> = ({ config, onConfigChange, onOpenAI, onExport, onImport }) => {
  return (
    <div className="absolute top-4 left-4 right-4 h-14 glass-panel rounded-xl flex items-center px-4 justify-between z-20 shadow-lg">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 mr-4">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
            <Share2 size={18} className="text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">Graph<span className="text-blue-400">Plan</span></span>
        </div>

        <div className="h-6 w-px bg-gray-700 mx-2" />

        <div className="flex items-center gap-2">
          <button 
            onClick={() => onConfigChange({...config, grouping: 'force'})}
            className={`p-2 rounded-lg transition-all ${config.grouping === 'force' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-800 text-gray-400'}`}
            title="Force Layout"
          >
            <Activity size={18} />
          </button>
          <button 
            onClick={() => onConfigChange({...config, grouping: 'grid'})}
            className={`p-2 rounded-lg transition-all ${config.grouping === 'grid' ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-gray-800 text-gray-400'}`}
             title="Grid Layout"
          >
            <Grid size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 ml-2">
            <span className="text-[10px] text-gray-500 font-mono uppercase">Gravity</span>
            <input 
                type="range" 
                min="-1000" 
                max="-50" 
                value={config.charge} 
                onChange={(e) => onConfigChange({...config, charge: parseInt(e.target.value)})}
                className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
        </div>
         <div className="flex items-center gap-2 ml-2">
            <span className="text-[10px] text-gray-500 font-mono uppercase">Link Dist</span>
            <input 
                type="range" 
                min="50" 
                max="300" 
                value={config.distance} 
                onChange={(e) => onConfigChange({...config, distance: parseInt(e.target.value)})}
                className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button 
          onClick={onOpenAI}
          className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-lg shadow-purple-900/30 border border-white/10"
        >
          <Sparkles size={16} />
          AI Generator
        </button>

        <div className="h-6 w-px bg-gray-700 mx-2" />

        <button onClick={onExport} className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors" title="Export JSON">
          <Download size={18} />
        </button>
        <label className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors cursor-pointer" title="Import JSON">
          <Upload size={18} />
          <input type="file" className="hidden" accept=".json" onChange={onImport} />
        </label>
      </div>
    </div>
  );
};

export default Toolbar;
