import React from 'react';
import { GraphNode, GraphLink, NodeProperty } from '../types';
import { Plus, Trash2, Database, FileText, Circle, Link2, Palette } from 'lucide-react';

interface SidebarProps {
  selectedNode: GraphNode | null;
  selectedLink: GraphLink | null;
  onUpdateNode: (node: GraphNode) => void;
  onDeleteNode: (id: string) => void;
  onUpdateLink: (link: GraphLink) => void;
  onDeleteLink: (id: string) => void;
}

const COLORS = [
  { name: 'Slate', value: '#64748b' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Amber', value: '#f59e0b' },
  { name: 'Green', value: '#22c55e' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Teal', value: '#14b8a6' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Fuchsia', value: '#d946ef' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Rose', value: '#f43f5e' },
];

const Sidebar: React.FC<SidebarProps> = ({ 
    selectedNode, 
    selectedLink,
    onUpdateNode, 
    onDeleteNode,
    onUpdateLink,
    onDeleteLink
}) => {

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData("nodeType", type);
  };

  // --- Node Handlers ---
  const addProperty = () => {
    if (!selectedNode) return;
    const currentProps = selectedNode.properties || [];
    const newProp: NodeProperty = {
      id: Date.now().toString(),
      key: 'new_prop',
      value: '',
      type: 'string'
    };
    onUpdateNode({
      ...selectedNode,
      properties: [...currentProps, newProp]
    });
  };

  const updateProperty = (id: string, field: keyof NodeProperty, value: string) => {
    if (!selectedNode) return;
    const currentProps = selectedNode.properties || [];
    const updatedProps = currentProps.map(p => 
      p.id === id ? { ...p, [field]: value } : p
    );
    onUpdateNode({ ...selectedNode, properties: updatedProps });
  };

  const deleteProperty = (id: string) => {
    if (!selectedNode) return;
    const currentProps = selectedNode.properties || [];
    const updatedProps = currentProps.filter(p => p.id !== id);
    onUpdateNode({ ...selectedNode, properties: updatedProps });
  };

  const properties = selectedNode?.properties || [];

  return (
    <div className="w-80 h-full bg-gray-900 border-l border-gray-800 flex flex-col shadow-2xl z-10 pt-24">
      
      {/* Node Palette - Always visible at top */}
      <div className="p-4 border-b border-gray-800">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Library</h3>
        <div className="grid grid-cols-3 gap-2">
          <div 
            draggable 
            onDragStart={(e) => handleDragStart(e, 'table')}
            className="flex flex-col items-center justify-center p-3 bg-gray-800 rounded hover:bg-gray-700 cursor-grab transition-colors border border-transparent hover:border-blue-500/50 group"
          >
            <Database size={20} className="text-blue-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] text-gray-300">Table</span>
          </div>
          <div 
            draggable 
            onDragStart={(e) => handleDragStart(e, 'document')}
            className="flex flex-col items-center justify-center p-3 bg-gray-800 rounded hover:bg-gray-700 cursor-grab transition-colors border border-transparent hover:border-emerald-500/50 group"
          >
            <FileText size={20} className="text-emerald-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] text-gray-300">Doc</span>
          </div>
          <div 
            draggable 
            onDragStart={(e) => handleDragStart(e, 'node')}
            className="flex flex-col items-center justify-center p-3 bg-gray-800 rounded hover:bg-gray-700 cursor-grab transition-colors border border-transparent hover:border-violet-500/50 group"
          >
            <Circle size={20} className="text-violet-400 mb-1 group-hover:scale-110 transition-transform" />
            <span className="text-[10px] text-gray-300">Node</span>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-2 text-center">Drag items to canvas</p>
      </div>

      {/* Editor Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {selectedNode ? (
          // --- NODE EDITOR ---
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Circle size={16} className="text-violet-400"/>
                    <h3 className="text-sm font-semibold text-gray-200">Node Properties</h3>
                </div>
                <button 
                  onClick={() => onDeleteNode(selectedNode.id)}
                  className="p-1 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                  title="Delete Node"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              
              <div className="space-y-3 mt-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Label</label>
                  <input 
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none text-white transition-colors"
                    value={selectedNode.label}
                    onChange={(e) => onUpdateNode({...selectedNode, label: e.target.value})}
                  />
                </div>
                 <div>
                  <label className="text-xs text-gray-500 block mb-1">Type</label>
                  <select 
                    className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none text-white transition-colors"
                    value={selectedNode.type}
                    onChange={(e) => onUpdateNode({...selectedNode, type: e.target.value as any})}
                  >
                    <option value="node">Generic Node</option>
                    <option value="table">SQL Table</option>
                    <option value="document">NoSQL Document</option>
                  </select>
                </div>
                
                {/* Color Picker */}
                <div>
                    <label className="text-xs text-gray-500 block mb-2 flex items-center gap-2">
                        <Palette size={12} />
                        Color
                    </label>
                    <div className="grid grid-cols-5 gap-1.5">
                        {COLORS.map((c) => (
                            <button
                                key={c.value}
                                onClick={() => onUpdateNode({...selectedNode, color: c.value})}
                                className={`w-full aspect-square rounded-full border border-gray-700 hover:scale-110 transition-transform ${selectedNode.color === c.value ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : ''}`}
                                style={{ backgroundColor: c.value }}
                                title={c.name}
                            />
                        ))}
                         <div className="relative w-full aspect-square rounded-full overflow-hidden border border-gray-700 hover:scale-110 transition-transform">
                             <input 
                                type="color" 
                                className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 cursor-pointer"
                                value={selectedNode.color || '#8b5cf6'}
                                onChange={(e) => onUpdateNode({...selectedNode, color: e.target.value})}
                             />
                         </div>
                    </div>
                </div>
              </div>
            </div>

            <div className="border-t border-gray-800 pt-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-400">Schema Fields</span>
                <button onClick={addProperty} className="p-1 hover:bg-gray-700 rounded text-blue-400 transition-colors">
                  <Plus size={14} />
                </button>
              </div>
              
              <div className="space-y-2">
                {properties.map(prop => (
                  <div key={prop.id} className="flex gap-1 items-start bg-gray-800/50 p-2 rounded group border border-transparent hover:border-gray-700 transition-colors">
                    <div className="flex-1 space-y-1">
                      <input 
                        className="w-full bg-transparent border-none p-0 text-xs font-medium text-blue-300 placeholder-blue-300/30 focus:outline-none" 
                        placeholder="Key"
                        value={prop.key}
                        onChange={(e) => updateProperty(prop.id, 'key', e.target.value)}
                      />
                      <div className="flex gap-1">
                        <input 
                          className="flex-1 bg-transparent border-none p-0 text-[10px] text-gray-400 placeholder-gray-600 focus:outline-none" 
                          placeholder="Type (e.g. string)"
                          value={prop.type}
                          onChange={(e) => updateProperty(prop.id, 'type', e.target.value)}
                        />
                      </div>
                    </div>
                    <button 
                      onClick={() => deleteProperty(prop.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                {properties.length === 0 && (
                   <div className="text-center py-4 text-xs text-gray-600 italic border border-dashed border-gray-800 rounded">
                      No properties defined
                   </div>
                )}
              </div>
            </div>
          </div>
        ) : selectedLink ? (
            // --- LINK EDITOR ---
            <div className="space-y-6">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <Link2 size={16} className="text-blue-400"/>
                        <h3 className="text-sm font-semibold text-gray-200">Link Properties</h3>
                    </div>
                    <button 
                    onClick={() => onDeleteLink(selectedLink.id)}
                    className="p-1 hover:bg-red-900/30 text-red-400 rounded transition-colors"
                    title="Delete Link"
                    >
                    <Trash2 size={14} />
                    </button>
                </div>

                <div className="space-y-4 mt-4">
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Label (Relationship)</label>
                        <input 
                            className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none text-white transition-colors"
                            value={selectedLink.label}
                            onChange={(e) => onUpdateLink({...selectedLink, label: e.target.value})}
                            placeholder="e.g. AUTHORED"
                        />
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 block mb-1">Type (Optional)</label>
                        <input 
                            className="w-full bg-gray-950 border border-gray-700 rounded px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none text-white transition-colors"
                            value={selectedLink.type || ''}
                            onChange={(e) => onUpdateLink({...selectedLink, type: e.target.value})}
                            placeholder="e.g. one-to-many"
                        />
                    </div>
                </div>

                <div className="mt-8 p-3 bg-gray-800/30 rounded text-xs text-gray-500 leading-relaxed border border-gray-800">
                    <p>Relationships define how entities interact in the graph. Standard practice uses capitalized verbs like <strong>OWNS</strong>, <strong>CONTAINS</strong>, or <strong>WORKS_FOR</strong>.</p>
                </div>
            </div>
        ) : (
          // --- EMPTY STATE ---
          <div className="flex flex-col items-center justify-center h-full text-gray-600 space-y-2">
            <div className="w-16 h-16 rounded-2xl bg-gray-800/50 flex items-center justify-center mb-2">
              <Circle size={32} className="opacity-20" />
            </div>
            <p className="text-sm font-medium text-gray-500">No Element Selected</p>
            <p className="text-xs text-gray-600 text-center max-w-[200px]">Select a node or link to edit properties, or drag new nodes from the library.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;