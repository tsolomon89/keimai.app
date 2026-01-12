import React, { useState, useCallback, useEffect } from 'react';
import GraphCanvas from './components/GraphCanvas';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import AIGeneratorModal from './components/AIGeneratorModal';
import { GraphData, GraphNode, GraphLink, SimulationConfig } from './types';
import { geminiService } from './services/geminiService';

const INITIAL_DATA: GraphData = {
  nodes: [
    { id: '1', label: 'User', type: 'node', properties: [{id: 'p1', key: 'username', value: '', type: 'string'}] },
    { id: '2', label: 'Post', type: 'document', properties: [{id: 'p2', key: 'content', value: '', type: 'text'}] },
    { id: '3', label: 'Comment', type: 'document', properties: [] },
  ],
  links: [
    { id: 'l1', source: '1', target: '2', label: 'AUTHORED' },
    { id: 'l2', source: '1', target: '3', label: 'WROTE' },
    { id: 'l3', source: '3', target: '2', label: 'ON' },
  ]
};

const INITIAL_CONFIG: SimulationConfig = {
  strength: 1,
  distance: 150,
  gravity: 0.1,
  charge: -400,
  grouping: 'force'
};

const App: React.FC = () => {
  // --- STATE ---
  const [graphData, setGraphData] = useState<GraphData>(INITIAL_DATA);
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(INITIAL_CONFIG);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  
  // History
  const [history, setHistory] = useState<GraphData[]>([INITIAL_DATA]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Clipboard
  const [clipboard, setClipboard] = useState<GraphNode | null>(null);

  // --- HELPERS ---
  const getNodeId = (node: string | GraphNode) => typeof node === 'object' ? node.id : node;

  // Refined History Adder
  const recordHistory = (newData: GraphData) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newData);
    if (newHistory.length > 50) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setGraphData(newData);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setGraphData(history[newIndex]);
      setSelectedNode(null);
      setSelectedLink(null);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGraphData(history[newIndex]);
      setSelectedNode(null);
      setSelectedLink(null);
    }
  };

  // --- ACTIONS ---

  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
    if (node) setSelectedLink(null);
  }, []);

  const handleLinkSelect = useCallback((link: GraphLink | null) => {
    setSelectedLink(link);
    if (link) setSelectedNode(null);
  }, []);

  const handleNodesChange = useCallback((newNodes: GraphNode[]) => {
    if (newNodes.length !== graphData.nodes.length) {
       const newData = { ...graphData, nodes: newNodes };
       recordHistory(newData);
    }
  }, [graphData, historyIndex, history]);

  // Property updates don't trigger history to avoid spam, unless we implement debounce
  const handleUpdateNode = (updatedNode: GraphNode) => {
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
    }));
    setSelectedNode(updatedNode);
  };

  const handleDeleteNode = (id: string) => {
    const newData = {
      nodes: graphData.nodes.filter(n => n.id !== id),
      links: graphData.links.filter(l => {
          const sId = getNodeId(l.source);
          const tId = getNodeId(l.target);
          return sId !== id && tId !== id;
      })
    };
    recordHistory(newData);
    setSelectedNode(null);
  };

  const handleUpdateLink = (updatedLink: GraphLink) => {
    setGraphData(prev => ({
        ...prev,
        links: prev.links.map(l => l.id === updatedLink.id ? updatedLink : l)
    }));
    setSelectedLink(updatedLink);
  };

  const handleDeleteLink = (id: string) => {
      const newData = {
          ...graphData,
          links: graphData.links.filter(l => l.id !== id)
      };
      recordHistory(newData);
      setSelectedLink(null);
  };

  const handleLinkCreate = (sourceId: string, targetId: string) => {
    const newLink: GraphLink = {
        id: `link-${Date.now()}`,
        source: sourceId,
        target: targetId,
        label: 'RELATED_TO'
    };
    const newData = {
        ...graphData,
        links: [...graphData.links, newLink]
    };
    recordHistory(newData);
  };

  const handleGenerateSchema = async (prompt: string, mode: 'merge' | 'replace') => {
    setIsAILoading(true);
    try {
      const newSchema = await geminiService.getSchemaFromAI(prompt, mode === 'merge' ? graphData : undefined, mode);
      
      let finalData: GraphData;

      if (mode === 'replace') {
         finalData = newSchema;
      } else {
         const existingMap = new Map<string, GraphNode>(
            graphData.nodes.map(n => [n.id, n])
         );
         const safeNewNodes = newSchema.nodes || [];
         const safeNewLinks = newSchema.links || [];

         const mergedNodes = safeNewNodes.map(n => {
             const ex = existingMap.get(n.id);
             return ex ? { ...n, x: ex.x, y: ex.y } : n;
         });

         finalData = {
            nodes: mergedNodes,
            links: safeNewLinks
         };
      }
      recordHistory(finalData);
      setIsAIModalOpen(false);
    } catch (error) {
      alert("Failed to generate schema. Please check your API Key or try again.");
    } finally {
      setIsAILoading(false);
    }
  };

  // --- COPY / PASTE LOGIC ---
  const handleCopy = useCallback(() => {
      if (selectedNode) {
          setClipboard(selectedNode);
      }
  }, [selectedNode]);

  const handlePaste = useCallback(() => {
      if (!clipboard) return;

      const newId = `node-${Date.now()}`;
      const offset = 40; // Pixel offset for the pasted node
      
      const newNode: GraphNode = {
          ...clipboard,
          id: newId,
          x: (clipboard.x || 0) + offset,
          y: (clipboard.y || 0) + offset,
          label: `${clipboard.label} (Copy)`
      };

      // Duplicate edges connected to the original clipboard node
      const newLinks: GraphLink[] = [];
      
      graphData.links.forEach(link => {
          const sId = getNodeId(link.source);
          const tId = getNodeId(link.target);
          
          if (sId === clipboard.id) {
              // Outgoing edge from clipboard node -> create outgoing from new node
              newLinks.push({
                  ...link,
                  id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  source: newId,
                  target: tId === clipboard.id ? newId : tId // Handle self-loop
              });
          } else if (tId === clipboard.id) {
              // Incoming edge to clipboard node -> create incoming to new node
              newLinks.push({
                  ...link,
                  id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  source: sId === clipboard.id ? newId : sId, // Handle self-loop
                  target: newId
              });
          }
      });

      const newData = {
          nodes: [...graphData.nodes, newNode],
          links: [...graphData.links, ...newLinks]
      };

      recordHistory(newData);
      setSelectedNode(newNode); // Select the newly pasted node
  }, [clipboard, graphData, history, historyIndex]);

  // --- KEYBOARD HANDLER ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement;
          // Skip if user is typing in an input
          if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;

          const isCtrl = e.ctrlKey || e.metaKey; // metaKey for Mac Cmd

          if (isCtrl && e.key.toLowerCase() === 'z') {
              e.preventDefault();
              handleUndo();
          } else if (isCtrl && e.key.toLowerCase() === 'r') {
              e.preventDefault();
              handleRedo();
          } else if (isCtrl && e.key.toLowerCase() === 'c') {
              e.preventDefault();
              handleCopy();
          } else if (isCtrl && e.key.toLowerCase() === 'v') {
              e.preventDefault();
              handlePaste();
          } else if (e.key === 'Delete' || e.key === 'Backspace') {
              if (selectedNode) handleDeleteNode(selectedNode.id);
              if (selectedLink) handleDeleteLink(selectedLink.id);
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNode, selectedLink, clipboard, graphData, historyIndex, history]);


  const handleExport = () => {
    const exportData = {
        nodes: graphData.nodes.map(({ id, label, type, properties, x, y }) => ({ id, label, type, properties, x, y })),
        links: graphData.links.map(({ id, source, target, label }) => ({ 
            id, 
            source: getNodeId(source), 
            target: getNodeId(target), 
            label 
        }))
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = "keimai_schema.json";
    a.click();
    a.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
        fileReader.readAsText(e.target.files[0], "UTF-8");
        fileReader.onload = (e) => {
            if(e.target?.result) {
                try {
                    const parsed = JSON.parse(e.target.result as string);
                    if(parsed.nodes && parsed.links) {
                        recordHistory(parsed);
                    } else {
                        alert("Invalid JSON format");
                    }
                } catch (err) {
                    alert("Error parsing JSON");
                }
            }
        };
    }
  };

  return (
    <div className="flex h-screen w-screen bg-gray-950 text-white font-sans selection:bg-blue-500/30">
      
      <Toolbar 
        config={simulationConfig} 
        onConfigChange={setSimulationConfig}
        onOpenAI={() => setIsAIModalOpen(true)}
        onExport={handleExport}
        onImport={handleImport}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
      />
      
      <div className="flex-1 relative">
        <GraphCanvas 
          data={graphData} 
          config={simulationConfig}
          selectedNode={selectedNode}
          selectedLink={selectedLink}
          onNodeSelect={handleNodeSelect}
          onLinkSelect={handleLinkSelect}
          onNodesChange={handleNodesChange}
          onLinkCreate={handleLinkCreate}
        />
      </div>

      <Sidebar 
        selectedNode={selectedNode}
        selectedLink={selectedLink}
        onUpdateNode={handleUpdateNode}
        onDeleteNode={handleDeleteNode}
        onUpdateLink={handleUpdateLink}
        onDeleteLink={handleDeleteLink}
      />

      <AIGeneratorModal 
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onGenerate={handleGenerateSchema}
        isLoading={isAILoading}
        hasExistingData={graphData.nodes.length > 0}
      />
    </div>
  );
};

export default App;