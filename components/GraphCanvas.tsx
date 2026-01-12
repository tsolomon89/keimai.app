import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink, SimulationConfig } from '../types';

interface GraphCanvasProps {
  data: GraphData;
  config: SimulationConfig;
  selectedNode: GraphNode | null;
  selectedLink: GraphLink | null;
  onNodeSelect: (node: GraphNode | null) => void;
  onLinkSelect: (link: GraphLink | null) => void;
  onNodesChange: (nodes: GraphNode[]) => void; // Sync positions back
  onLinkCreate: (sourceId: string, targetId: string) => void;
}

const GraphCanvas: React.FC<GraphCanvasProps> = ({ 
  data, 
  config, 
  selectedNode,
  selectedLink,
  onNodeSelect, 
  onLinkSelect,
  onNodesChange,
  onLinkCreate
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const nodesRef = useRef<GraphNode[]>([]); 
  const linksRef = useRef<GraphLink[]>([]); 

  // Refs to hold latest selection state for D3 event handlers to access
  // This prevents us from needing to re-bind events (and rebuild DOM) when selection changes
  const selectedNodeRef = useRef(selectedNode);
  const selectedLinkRef = useRef(selectedLink);

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
    selectedLinkRef.current = selectedLink;
  }, [selectedNode, selectedLink]);

  // Safe accessors
  const nodes = data?.nodes || [];
  const links = data?.links || [];

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

  // Main D3 Simulation Effect - Only runs on Topology changes (nodes added/removed), not selection
  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    
    // Clear previous
    svg.selectAll("*").remove();

    // Container for zoom
    const container = svg.append("g").attr("class", "zoom-container");

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Initial Data Clone
    const currentNodesMap = new Map<string, GraphNode>(
      nodesRef.current.map(n => [n.id, n])
    );
    
    nodesRef.current = nodes.map(n => {
      const existing = currentNodesMap.get(n.id);
      if (existing) {
        return { ...n, x: existing.x, y: existing.y, fx: existing.fx, fy: existing.fy };
      }
      return { ...n };
    });

    linksRef.current = links.map(l => ({ ...l }));

    // Define Simulation
    const simulation = d3.forceSimulation<GraphNode, GraphLink>(nodesRef.current)
      .force("link", d3.forceLink<GraphNode, GraphLink>(linksRef.current).id(d => d.id).distance(config.distance))
      .force("charge", d3.forceManyBody().strength(config.charge))
      .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2).strength(0.05))
      .force("collide", d3.forceCollide(30).strength(0.5));
      
    // Apply initial config
    simulation.force("charge", d3.forceManyBody().strength(config.charge));
    (simulation.force("link") as d3.ForceLink<GraphNode, GraphLink>).distance(config.distance);

    simulationRef.current = simulation;

    // --- DRAWING ---

    // Link Group
    const linkGroup = container.append("g")
      .attr("class", "links")
      .selectAll("g")
      .data(linksRef.current)
      .enter().append("g")
      .on("click", (event, d) => {
        event.stopPropagation();
        onLinkSelect(d);
      });

    // Invisible thick line for easier clicking
    linkGroup.append("line")
      .attr("stroke", "transparent")
      .attr("stroke-width", 15)
      .attr("class", "hit-area");

    // Visible line
    linkGroup.append("line")
      .attr("class", "visual-link")
      .attr("stroke", "#4b5563")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2);
    
    // Link labels
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

    // Nodes
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
        
        // SHIFT + CLICK Logic for Link Creation
        // We use the Ref to get the CURRENT selected node without stale closures
        const currentSelected = selectedNodeRef.current;
        if (event.shiftKey && currentSelected && currentSelected.id !== d.id) {
            onLinkCreate(currentSelected.id, d.id);
            return;
        }

        onNodeSelect(d);
      });

    // Node shapes
    nodeGroup.each(function(d) {
      const el = d3.select(this);
      
      if (d.type === 'table') {
        el.append("rect")
          .attr("class", "node-shape") // Class for selection targeting
          .attr("width", 50)
          .attr("height", 30)
          .attr("x", -25)
          .attr("y", -15)
          .attr("rx", 4)
          .attr("fill", "#3b82f6")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5);
      } else if (d.type === 'document') {
         el.append("path")
          .attr("class", "node-shape")
          .attr("d", "M-20,-25 L10,-25 L20,-15 L20,25 L-20,25 Z")
          .attr("fill", "#10b981")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5);
      } else {
        el.append("circle")
          .attr("class", "node-shape")
          .attr("r", 20)
          .attr("fill", "#8b5cf6")
          .attr("stroke", "#fff")
          .attr("stroke-width", 1.5);
      }
    });

    nodeGroup.append("text")
      .text(d => d.label)
      .attr("dy", 35) // Below the node
      .attr("text-anchor", "middle")
      .attr("fill", "white")
      .attr("font-size", 12)
      .attr("font-weight", "bold")
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 4px rgba(0,0,0,0.8)");

    // Ticks
    simulation.on("tick", () => {
      // Grid clamping if enabled
      if (config.grouping === 'grid') {
        const gridSize = 100;
        nodesRef.current.forEach(d => {
           if (!d.fx && !d.fy && d.x && d.y) {
             d.vx = (d.vx || 0) + (Math.round(d.x / gridSize) * gridSize - d.x) * 0.1 * config.strength;
             d.vy = (d.vy || 0) + (Math.round(d.y / gridSize) * gridSize - d.y) * 0.1 * config.strength;
           }
        });
      }

      // Update both hit area and visual line
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
      
      // IMPORTANT: Do NOT select if holding shift, as that's reserved for Link Creation in 'click'
      // Also avoids immediately switching selection when trying to link
      if (!event.sourceEvent.shiftKey) {
          onNodeSelect(d);
      }
    }

    function dragged(event: any, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0);
      // We don't nullify fx/fy so the user can place nodes
    }

    // Cleanup
    return () => {
      simulation.stop();
    };
    // Note: selectedNode/Link REMOVED from dependency array to prevent DOM destruction on selection
  }, [nodes.length, links.length, dimensions, config.grouping]); 

  // Secondary Effect: Visual Updates for Selection (Does not rebuild DOM)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const currentNodes = selectedNode ? [selectedNode.id] : [];
    const currentLink = selectedLink ? selectedLink.id : null;

    // Node Selection Visuals
    svg.selectAll(".nodes g").each(function(d: any) {
        const group = d3.select(this);
        const isSelected = currentNodes.includes(d.id);
        
        // Update shape stroke
        group.select(".node-shape")
             .attr("stroke", isSelected ? "#fff" : "#fff") 
             .attr("stroke-width", isSelected ? 3 : 1.5);

        // Manage Halo
        group.select(".selection-halo").remove(); 
        if (isSelected) {
            group.insert("circle", ":first-child") // Insert behind
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
       .attr("stroke", (d: any) => (currentLink === d.id) ? "#60a5fa" : "#4b5563")
       .attr("stroke-opacity", (d: any) => (currentLink === d.id) ? 1 : 0.6)
       .attr("stroke-width", (d: any) => (currentLink === d.id) ? 3 : 2);

    svg.selectAll(".link-labels text")
       .attr("fill", (d: any) => (currentLink === d.id) ? "#93c5fd" : "#9ca3af")
       .attr("font-weight", (d: any) => (currentLink === d.id) ? "bold" : "normal");

  }, [selectedNode, selectedLink, nodes.length, links.length]); 

  // Dynamic Updates without full re-render (Config changes)
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
        properties: []
      };
      
      const newNodes = [...nodes, newNode];
      onNodesChange(newNodes);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleBgClick = () => {
      onNodeSelect(null);
      onLinkSelect(null);
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