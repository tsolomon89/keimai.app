import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink, SimulationConfig } from '../types';

interface GraphCanvasProps {
  data: GraphData;
  config: SimulationConfig;
  selectedNodes: GraphNode[];
  selectedLinks: GraphLink[];
  onNodeSelect: (node: GraphNode | null, isMulti: boolean) => void;
  onLinkSelect: (link: GraphLink | null, isMulti: boolean) => void;
  onNodesChange: (nodes: GraphNode[]) => void; // Sync positions back
  onLinkCreate: (sourceId: string, targetId: string) => void;
}

const GraphCanvas: React.FC<GraphCanvasProps> = ({ 
  data, 
  config, 
  selectedNodes,
  selectedLinks,
  onNodeSelect, 
  onLinkSelect,
  onNodesChange,
  onLinkCreate
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  // These refs store the D3 internal state (with x, y, vx, vy)
  const nodesRef = useRef<GraphNode[]>([]); 
  const linksRef = useRef<GraphLink[]>([]); 

  // Refs to hold latest selection state for D3 event handlers to access
  const selectedNodesRef = useRef(selectedNodes);
  const selectedLinksRef = useRef(selectedLinks);

  useEffect(() => {
    selectedNodesRef.current = selectedNodes;
    selectedLinksRef.current = selectedLinks;
  }, [selectedNodes, selectedLinks]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (wrapperRef.current) {
        const { width, height } = wrapperRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- VISUAL & DATA UPDATE EFFECT ---
  useEffect(() => {
    if (!svgRef.current) return;

    // 1. Sync Data properties to D3 state
    const currentNodesMap = new Map(nodesRef.current.map(n => [n.id, n]));
    
    data.nodes.forEach(newDataNode => {
        const existingNode = currentNodesMap.get(newDataNode.id);
        if (existingNode) {
            existingNode.label = newDataNode.label;
            existingNode.type = newDataNode.type;
            existingNode.properties = newDataNode.properties;
            existingNode.color = newDataNode.color;
        }
    });

    // 2. Direct DOM Updates for Performance
    const svg = d3.select(svgRef.current);
    
    // Update Labels
    svg.selectAll(".nodes text")
       .text((d: any) => d.label);

    // Update Link Labels
    svg.selectAll(".link-labels text")
       .text((d: any) => d.label);

    // Update Node Shapes & Colors
    svg.selectAll(".nodes g").each(function(d: any) {
        const group = d3.select(this);
        const shape = group.select(".node-shape");
        const currentType = shape.attr("data-type");
        const currentColor = d.color || (d.type === 'table' ? '#3b82f6' : d.type === 'document' ? '#10b981' : '#8b5cf6');

        if (currentType !== d.type) {
            shape.remove();
            let newShape;
            if (d.type === 'table') {
                newShape = group.insert("rect", ":first-child")
                  .attr("width", 50)
                  .attr("height", 30)
                  .attr("x", -25)
                  .attr("y", -15)
                  .attr("rx", 4);
            } else if (d.type === 'document') {
                newShape = group.insert("path", ":first-child")
                  .attr("d", "M-20,-25 L10,-25 L20,-15 L20,25 L-20,25 Z");
            } else {
                newShape = group.insert("circle", ":first-child")
                  .attr("r", 20);
            }
            
            newShape
                .attr("class", "node-shape")
                .attr("data-type", d.type)
                .attr("stroke", "#fff")
                .attr("stroke-width", 1.5)
                .attr("fill", currentColor);
        } else {
            shape.attr("fill", currentColor);
        }
    });

  }, [data]); 

  // --- MAIN SIMULATION EFFECT ---
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const nodes = data.nodes;
    const links = data.links;

    svg.selectAll("*").remove();

    const container = svg.append("g").attr("class", "zoom-container");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    const previousNodesMap = new Map(nodesRef.current.map(n => [n.id, n]));
    
    nodesRef.current = nodes.map(n => {
      const existing = previousNodesMap.get(n.id);
      if (existing) {
        return { 
            ...n, 
            x: existing.x, 
            y: existing.y, 
            vx: existing.vx, 
            vy: existing.vy,
            fx: existing.fx, 
            fy: existing.fy 
        };
      }
      return { ...n }; 
    });

    linksRef.current = links.map(l => ({ ...l }));

    const simulation = d3.forceSimulation<GraphNode, GraphLink>(nodesRef.current)
      .force("link", d3.forceLink<GraphNode, GraphLink>(linksRef.current).id(d => d.id).distance(config.distance))
      .force("charge", d3.forceManyBody().strength(config.charge))
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2).strength(0.05))
      .force("collide", d3.forceCollide(35).strength(0.5));
      
    simulationRef.current = simulation;

    // --- DRAWING ---

    const linkGroup = container.append("g")
      .attr("class", "links")
      .selectAll("g")
      .data(linksRef.current)
      .enter().append("g")
      .on("click", (event, d) => {
        event.stopPropagation();
        // Ctrl+Click for multi-select (was Shift)
        const isMulti = event.ctrlKey || event.metaKey;
        onLinkSelect(d, isMulti);
      });

    linkGroup.append("line")
      .attr("stroke", "transparent")
      .attr("stroke-width", 15)
      .attr("class", "hit-area");

    linkGroup.append("line")
      .attr("class", "visual-link")
      .attr("stroke", "#4b5563")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2);
    
    const linkLabels = container.append("g")
      .attr("class", "link-labels")
      .selectAll("text")
      .data(linksRef.current)
      .enter().append("text")
      .text(d => d.label)
      .attr("font-size", 10)
      .attr("fill", "#9ca3af")
      .attr("text-anchor", "middle")
      .attr("dy", -5)
      .style("pointer-events", "none"); 

    const nodeGroup = container.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(nodesRef.current)
      .enter().append("g")
      .call(d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
      )
      .on("click", (event, d) => {
        event.stopPropagation();
        
        const selectedNodes = selectedNodesRef.current;
        const isLinkCreate = event.shiftKey;
        const isMulti = event.ctrlKey || event.metaKey;
        
        // Shift+Click creates links between single selected node and clicked node
        if (isLinkCreate && selectedNodes.length === 1 && selectedNodes[0].id !== d.id) {
            onLinkCreate(selectedNodes[0].id, d.id);
            return;
        }
        
        // Ctrl/Cmd+Click does multi selection
        onNodeSelect(d, isMulti);
      });

    nodeGroup.each(function(d) {
      const el = d3.select(this);
      const color = d.color || (d.type === 'table' ? '#3b82f6' : d.type === 'document' ? '#10b981' : '#8b5cf6');
      
      if (d.type === 'table') {
        el.append("rect")
          .attr("class", "node-shape")
          .attr("data-type", "table")
          .attr("width", 50)
          .attr("height", 30)
          .attr("x", -25)
          .attr("y", -15)
          .attr("rx", 4)
          .attr("fill", color)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5);
      } else if (d.type === 'document') {
         el.append("path")
          .attr("class", "node-shape")
          .attr("data-type", "document")
          .attr("d", "M-20,-25 L10,-25 L20,-15 L20,25 L-20,25 Z")
          .attr("fill", color)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5);
      } else {
        el.append("circle")
          .attr("class", "node-shape")
          .attr("data-type", "node")
          .attr("r", 20)
          .attr("fill", color)
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5);
      }
    });

    nodeGroup.append("text")
      .text(d => d.label)
      .attr("dy", 35)
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 4px rgba(0,0,0,0.8)");

    simulation.on("tick", () => {
      if (config.grouping === 'grid') {
        const gridSize = 100;
        nodesRef.current.forEach(d => {
           if (!d.fx && !d.fy && d.x && d.y) {
             d.vx = (d.vx || 0) + (Math.round(d.x / gridSize) * gridSize - d.x) * 0.1 * config.strength;
             d.vy = (d.vy || 0) + (Math.round(d.y / gridSize) * gridSize - d.y) * 0.1 * config.strength;
           }
        });
      }

      linkGroup.selectAll("line")
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      linkLabels
        .attr("x", d => ((d.source as GraphNode).x! + (d.target as GraphNode).x!) / 2)
        .attr("y", d => ((d.source as GraphNode).y! + (d.target as GraphNode).y!) / 2);

      nodeGroup
        .attr("transform", d => `translate(${d.x},${d.y})`);
    });

    function dragstarted(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      
      const isSelected = selectedNodesRef.current.some(n => n.id === d.id);
      
      const isMulti = event.sourceEvent.ctrlKey || event.sourceEvent.metaKey;
      const isLinkMode = event.sourceEvent.shiftKey;
      
      // If NOT selected, and we are NOT in link creation mode (Shift), we handle selection.
      // If we ARE in link creation mode, we skip selecting here so we don't deselect the source node
      // before the click handler fires to create the link.
      if (!isSelected && !isLinkMode) {
          onNodeSelect(d, isMulti);
      }
    }

    function dragged(event: any, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
    }

    return () => {
      simulation.stop();
    };
  }, [data.nodes.length, data.links.length, dimensions, config.grouping]);

  // --- SELECTION VISUALS EFFECT ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    // Create Sets for O(1) lookup
    const selectedNodeIds = new Set(selectedNodes.map(n => n.id));
    const selectedLinkIds = new Set(selectedLinks.map(l => l.id));

    // Node Selection Visuals
    svg.selectAll(".nodes g").each(function(d: any) {
        const group = d3.select(this);
        const isSelected = selectedNodeIds.has(d.id);
        
        // Update shape stroke
        group.select(".node-shape")
             .attr("stroke", isSelected ? "#fff" : "#fff") 
             .attr("stroke-width", isSelected ? 3 : 1.5);

        // Manage Halo
        group.select(".selection-halo").remove(); 
        if (isSelected) {
            group.insert("circle", ":first-child") 
                .attr("class", "selection-halo")
                .attr("r", 35)
                .attr("fill", "none")
                .attr("stroke", "rgba(255, 255, 255, 0.4)")
                .attr("stroke-width", 2)
                .attr("stroke-dasharray", "4,3");
        }
    });

    // Link Selection Visuals
    svg.selectAll(".links .visual-link")
       .attr("stroke", (d: any) => selectedLinkIds.has(d.id) ? "#60a5fa" : "#4b5563")
       .attr("stroke-opacity", (d: any) => selectedLinkIds.has(d.id) ? 1 : 0.6)
       .attr("stroke-width", (d: any) => selectedLinkIds.has(d.id) ? 3 : 2);

    svg.selectAll(".link-labels text")
       .attr("fill", (d: any) => selectedLinkIds.has(d.id) ? "#93c5fd" : "#9ca3af")
       .attr("font-weight", (d: any) => selectedLinkIds.has(d.id) ? "bold" : "normal");

  }, [selectedNodes, selectedLinks, data.nodes.length, data.links.length]); 

  // Dynamic Updates for config
  useEffect(() => {
    if (simulationRef.current) {
      simulationRef.current.force("charge", d3.forceManyBody().strength(config.charge));
      (simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>).distance(config.distance);
      simulationRef.current.alpha(0.3).restart();
    }
  }, [config.charge, config.distance]);


  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("nodeType");
    if (type && wrapperRef.current && svgRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const newNode: GraphNode = {
        id: `node-${Date.now()}`,
        label: "New Node",
        type: type as any,
        x: x, 
        y: y,
        properties: [],
        color: type === 'table' ? '#3b82f6' : type === 'document' ? '#10b981' : '#8b5cf6'
      };
      
      const newNodes = [...data.nodes, newNode];
      onNodesChange(newNodes);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleBgClick = (e: React.MouseEvent) => {
      // Pass isMulti logic even for background clicks to support "Ctrl+Click background to NOT deselect"?
      // Standard behavior is bg click clears. But let's pass it anyway.
      const isMulti = e.ctrlKey || e.metaKey;
      onNodeSelect(null, isMulti);
      onLinkSelect(null, isMulti);
  }

  return (
    <div 
      ref={wrapperRef} 
      className="w-full h-full relative bg-gray-900 overflow-hidden"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleBgClick}
    >
      <div className="absolute inset-0 opacity-10 pointer-events-none" 
        style={{ 
          backgroundImage: 'radial-gradient(#4b5563 1px, transparent 1px)', 
          backgroundSize: '20px 20px' 
        }}>
      </div>
      <svg ref={svgRef} width="100%" height="100%" className="cursor-grab active:cursor-grabbing"></svg>
    </div>
  );
};

export default GraphCanvas;