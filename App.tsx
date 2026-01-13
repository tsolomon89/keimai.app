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
  
  // Selection State (Arrays for Multi-select)
  const [selectedNodes, setSelectedNodes] = useState<GraphNode[]>([]);
  const [selectedLinks, setSelectedLinks] = useState<GraphLink[]>([]);
  
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);
  
  // History
  const [history, setHistory] = useState<GraphData[]>([INITIAL_DATA]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Clipboard (Now stores arrays)
  const [clipboardNodes, setClipboardNodes] = useState<GraphNode[]>([]);

  // --- HELPERS ---
  const getNodeId = (node: string | GraphNode) => typeof node === 'object' ? node.id : node;

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
      setSelectedNodes([]);
      setSelectedLinks([]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setGraphData(history[newIndex]);
      setSelectedNodes([]);
      setSelectedLinks([]);
    }
  };

  // --- SELECTION ACTIONS ---

  const handleNodeSelect = useCallback((node: GraphNode | null, isMulti: boolean) => {
    if (!node) {
      // Background click - clear all unless holding Ctrl (optional, usually bg click clears)
      if (!isMulti) {
          setSelectedNodes([]);
          setSelectedLinks([]);
      }
      return;
    }

    if (isMulti) {
      // Multi-select logic
      setSelectedLinks([]); // Enforce same-type rule: Clear links if selecting a node
      
      setSelectedNodes(prev => {
        const exists = prev.find(n => n.id === node.id);
        if (exists) {
          // Deselect
          return prev.filter(n => n.id !== node.id);
        } else {
          // Add to selection
          return [...prev, node];
        }
      });
    } else {
      // Single select
      setSelectedLinks([]);
      setSelectedNodes([node]);
    }
  }, []);

  const handleLinkSelect = useCallback((link: GraphLink | null, isMulti: boolean) => {
    if (!link) {
        if (!isMulti) {
            setSelectedNodes([]);
            setSelectedLinks([]);
        }
        return;
    }

    if (isMulti) {
        setSelectedNodes([]); // Enforce same-type rule: Clear nodes if selecting a link
        
        setSelectedLinks(prev => {
            const exists = prev.find(l => l.id === link.id);
            if (exists) {
                return prev.filter(l => l.id !== link.id);
            } else {
                return [...prev, link];
            }
        });
    } else {
        setSelectedNodes([]);
        setSelectedLinks([link]);
    }
  }, []);

  const handleNodesChange = useCallback((newNodes: GraphNode[]) => {
    if (newNodes.length !== graphData.nodes.length) {
       const newData = { ...graphData, nodes: newNodes };
       recordHistory(newData);
    }
  }, [graphData, historyIndex, history]);

  // --- UPDATE ACTIONS (Batch) ---

  const handleUpdateNodes = (updatedNodes: GraphNode[]) => {
    const updatedIds = new Set(updatedNodes.map(n => n.id));
    
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => updatedIds.has(n.id) ? updatedNodes.find(un => un.id === n.id)! : n)
    }));
    
    // Update selection state to reflect changes (e.g. if label changed)
    setSelectedNodes(updatedNodes);
  };

  const handleDeleteNodes = (ids: string[]) => {
    const idSet = new Set(ids);
    const newData = {
      nodes: graphData.nodes.filter(n => !idSet.has(n.id)),
      links: graphData.links.filter(l => {
          const sId = getNodeId(l.source);
          const tId = getNodeId(l.target);
          return !idSet.has(sId) && !idSet.has(tId);
      })
    };
    recordHistory(newData);
    setSelectedNodes([]);
  };

  const handleUpdateLinks = (updatedLinks: GraphLink[]) => {
    const updatedIds = new Set(updatedLinks.map(l => l.id));
    setGraphData(prev => ({
        ...prev,
        links: prev.links.map(l => updatedIds.has(l.id) ? updatedLinks.find(ul => ul.id === l.id)! : l)
    }));
    setSelectedLinks(updatedLinks);
  };

  const handleDeleteLinks = (ids: string[]) => {
      const idSet = new Set(ids);
      const newData = {
          ...graphData,
          links: graphData.links.filter(l => !idSet.has(l.id))
      };
      recordHistory(newData);
      setSelectedLinks([]);
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

  // --- COPY / PASTE LOGIC (Batch) ---
  const handleCopy = useCallback(() => {
      if (selectedNodes.length > 0) {
          setClipboardNodes(selectedNodes);
      }
  }, [selectedNodes]);

  const handlePaste = useCallback(() => {
      if (clipboardNodes.length === 0) return;

      const newNodes: GraphNode[] = [];
      const newLinks: GraphLink[] = [];
      const idMapping = new Map<string, string>(); // oldId -> newId

      const offset = 40;

      // 1. Create new nodes
      clipboardNodes.forEach(node => {
          const newId = `node-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          idMapping.set(node.id, newId);

          newNodes.push({
              ...node,
              id: newId,
              x: (node.x || 0) + offset,
              y: (node.y || 0) + offset,
              label: `${node.label} (Copy)`
          });
      });

      // 2. Duplicate internal edges (edges between copied nodes)
      // AND edges connected to original nodes if single copy? 
      // Requirement: "copying copies all the edges of the orginal too"
      // Interpretation: Copying a node brings its edges. If I paste, I expect the edges to come with it.
      // Case A: Internal edge (Source and Target are both in clipboard) -> Connect new source to new target.
      // Case B: External edge (Source in clipboard, Target NOT) -> Connect new source to OLD target.
      
      const clipboardIds = new Set(clipboardNodes.map(n => n.id));

      graphData.links.forEach(link => {
          const sId = getNodeId(link.source);
          const tId = getNodeId(link.target);
          
          const sourceInClipboard = clipboardIds.has(sId);
          const targetInClipboard = clipboardIds.has(tId);

          if (sourceInClipboard || targetInClipboard) {
               // Determine new source and target
               // If it's in the map, use the NEW ID. If not, keep the OLD ID.
               const newSourceId = idMapping.get(sId) || sId;
               const newTargetId = idMapping.get(tId) || tId;

               newLinks.push({
                   ...link,
                   id: `link-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                   source: newSourceId,
                   target: newTargetId
               });
          }
      });

      const newData = {
          nodes: [...graphData.nodes, ...newNodes],
          links: [...graphData.links, ...newLinks]
      };

      recordHistory(newData);
      setSelectedNodes(newNodes); // Select the newly pasted nodes
  }, [clipboardNodes, graphData, history, historyIndex]);

  // --- KEYBOARD HANDLER ---
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          const target = e.target as HTMLElement;
          if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;

          const isCtrl = e.ctrlKey || e.metaKey; 

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
              if (selectedNodes.length > 0) handleDeleteNodes(selectedNodes.map(n => n.id));
              if (selectedLinks.length > 0) handleDeleteLinks(selectedLinks.map(l => l.id));
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodes, selectedLinks, clipboardNodes, graphData, historyIndex, history]);


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
          selectedNodes={selectedNodes}
          selectedLinks={selectedLinks}
          onNodeSelect={handleNodeSelect}
          onLinkSelect={handleLinkSelect}
          onNodesChange={handleNodesChange}
          onLinkCreate={handleLinkCreate}
        />
      </div>

      <Sidebar 
        selectedNodes={selectedNodes}
        selectedLinks={selectedLinks}
        onUpdateNodes={handleUpdateNodes}
        onDeleteNodes={handleDeleteNodes}
        onUpdateLinks={handleUpdateLinks}
        onDeleteLinks={handleDeleteLinks}
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