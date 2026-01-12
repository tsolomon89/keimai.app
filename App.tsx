import React, { useState, useCallback } from 'react';
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
  const [graphData, setGraphData] = useState<GraphData>(INITIAL_DATA);
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(INITIAL_CONFIG);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<GraphLink | null>(null);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isAILoading, setIsAILoading] = useState(false);

  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
    if (node) setSelectedLink(null); // Deselect link if node selected
  }, []);

  const handleLinkSelect = useCallback((link: GraphLink | null) => {
    setSelectedLink(link);
    if (link) setSelectedNode(null); // Deselect node if link selected
  }, []);

  const handleNodesChange = useCallback((newNodes: GraphNode[]) => {
    // Only update if length changed (add/remove) to avoid loop during drag
    // During drag, D3 mutates the existing object ref, which is fine for visual
    // But for adding a node, we need to setState.
    if (newNodes.length !== graphData.nodes.length) {
       setGraphData(prev => ({ ...prev, nodes: newNodes }));
    }
  }, [graphData.nodes.length]);

  const handleUpdateNode = (updatedNode: GraphNode) => {
    setGraphData(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => n.id === updatedNode.id ? updatedNode : n)
    }));
    setSelectedNode(updatedNode);
  };

  const handleDeleteNode = (id: string) => {
    setGraphData(prev => ({
      nodes: prev.nodes.filter(n => n.id !== id),
      links: prev.links.filter(l => l.source !== id && l.target !== id && (typeof l.source !== 'object' || (l.source as GraphNode).id !== id) && (typeof l.target !== 'object' || (l.target as GraphNode).id !== id))
    }));
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
      setGraphData(prev => ({
          ...prev,
          links: prev.links.filter(l => l.id !== id)
      }));
      setSelectedLink(null);
  };

  const handleLinkCreate = (sourceId: string, targetId: string) => {
    const newLink: GraphLink = {
        id: `link-${Date.now()}`,
        source: sourceId,
        target: targetId,
        label: 'RELATED_TO'
    };
    
    setGraphData(prev => ({
        ...prev,
        links: [...prev.links, newLink]
    }));
  };

  const handleGenerateSchema = async (prompt: string, mode: 'merge' | 'replace') => {
    setIsAILoading(true);
    try {
      const newSchema = await geminiService.getSchemaFromAI(prompt, mode === 'merge' ? graphData : undefined, mode);
      
      if (mode === 'replace') {
         // Fresh start, D3 will handle initial positions
         setGraphData(newSchema);
      } else {
         // Merge logic: Preserve positions of existing nodes
         const existingMap = new Map<string, GraphNode>(
            graphData.nodes.map(n => [n.id, n])
         );
         
         const safeNewNodes = newSchema.nodes || [];
         const safeNewLinks = newSchema.links || [];

         const mergedNodes = safeNewNodes.map(n => {
             const ex = existingMap.get(n.id);
             return ex ? { ...n, x: ex.x, y: ex.y } : n;
         });

         setGraphData({
            nodes: mergedNodes,
            links: safeNewLinks
         });
      }
      
      setIsAIModalOpen(false);
    } catch (error) {
      alert("Failed to generate schema. Please check your API Key or try again.");
    } finally {
      setIsAILoading(false);
    }
  };

  const handleExport = () => {
    // Create a clean export without D3 internal props (x, y, vx, vy, etc for strict schema, or keep x/y for layout)
    const exportData = {
        nodes: graphData.nodes.map(({ id, label, type, properties, x, y }) => ({ id, label, type, properties, x, y })),
        links: graphData.links.map(({ id, source, target, label }) => ({ 
            id, 
            source: typeof source === 'object' ? (source as GraphNode).id : source, 
            target: typeof target === 'object' ? (target as GraphNode).id : target, 
            label 
        }))
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "graph_schema.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
        fileReader.readAsText(e.target.files[0], "UTF-8");
        fileReader.onload = (e) => {
            if(e.target?.result) {
                try {
                    const parsed = JSON.parse(e.target.result as string);
                    // Basic validation
                    if(parsed.nodes && parsed.links) {
                        setGraphData(parsed);
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