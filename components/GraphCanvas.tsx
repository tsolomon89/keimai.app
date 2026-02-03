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
    const currentNodesMap = new Map<string, GraphNode>(
        nodesRef.current.map(n => [n.id, n] as [string, GraphNode])
    );
    
    data.nodes.forEach(newDataNode => {
        const existingNode = currentNodesMap.get(newDataNode.id);
        if (existingNode) {
            existingNode.label = newDataNode.label;
            existingNode.type = newDataNode.type;
            existingNode.properties = newDataNode.properties;
            existingNode.color = newDataNode.color;
        }
    });

    // Sync Link properties
    const currentLinksMap = new Map<string, GraphLink>(
        linksRef.current.map(l => [l.id, l] as [string, GraphLink])
    );
    data.links.forEach(newDataLink => {
        const existingLink = currentLinksMap.get(newDataLink.id);
        if (existingLink) {
            existingLink.label = newDataLink.label;
            existingLink.type = newDataLink.type;
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
    
    // Create link copies to avoid mutating props, but we need to track them
    const linksCopy = data.links.map(l => ({ ...l }));

    svg.selectAll("*").remove();

    // --- MARKERS ---
    const defs = svg.append("defs");
    
    defs.append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 28)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#6b7280"); // gray-500

    defs.append("marker")
        .attr("id", "arrow-selected")
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 28)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", "#60a5fa"); // blue-400

    const container = svg.append("g").attr("class", "zoom-container");

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });

    svg.call(zoom);

    // --- TOPOLOGY CALCULATION ---
    // Identify multi-links to calculate curvature
    const pairCounts = new Map<string, number>();
    
    linksCopy.forEach(link => {
        // Source/Target are strings at this phase
        const sid = link.source as string;
        const tid = link.target as string;
        const key = sid < tid ? `${sid}:${tid}` : `${tid}:${sid}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    });

    const pairIndices = new Map<string, number>();
    linksCopy.forEach((link: any) => {
        const sid = link.source as string;
        const tid = link.target as string;
        const key = sid < tid ? `${sid}:${tid}` : `${tid}:${sid}`;
        const count = pairCounts.get(key)!;
        const index = pairIndices.get(key) || 0;
        
        link.linkNum = index;
        link.totalLinks = count;
        
        pairIndices.set(key, index + 1);
    });

    const previousNodesMap = new Map<string, GraphNode>(
        nodesRef.current.map(n => [n.id, n] as [string, GraphNode])
    );
    
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

    linksRef.current = linksCopy;

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
        const isMulti = event.ctrlKey || event.metaKey;
        onLinkSelect(d, isMulti);
      });

    // Hit Area (Thicker, transparent)
    linkGroup.append("path")
      .attr("class", "hit-area")
      .attr("stroke", "transparent")
      .attr("stroke-width", 15)
      .attr("fill", "none");

    // Visual Line
    linkGroup.append("path")
      .attr("class", "visual-link")
      .attr("stroke", "#4b5563")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 2)
      .attr("fill", "none")
      .attr("marker-end", "url(#arrow)");
    
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
        
        if (isLinkCreate && selectedNodes.length === 1 && selectedNodes[0].id !== d.id) {
            onLinkCreate(selectedNodes[0].id, d.id);
            return;
        }
        
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

      // Update Path D attribute for curves
      linkGroup.selectAll("path")
        .attr("d", (d: any) => {
             const source = d.source as GraphNode;
             const target = d.target as GraphNode;
             
             // Check if nodes have coordinates (initial simulation step might be NaN)
             if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return "";

             // Self Link
             if (source.id === target.id) {
                 const x = source.x;
                 const y = source.y;
                 // Dynamic self-link geometry
                 return `M${x-10},${y-15} C${x-40},${y-50} ${x+40},${y-50} ${x+10},${y-15}`;
             }
             
             // Single Link - Straight
             if (d.totalLinks === 1) {
                 return `M${source.x},${source.y} L${target.x},${target.y}`;
             }

             // Multi Link - Quadratic Bezier
             const dx = target.x - source.x;
             const dy = target.y - source.y;
             const dr = Math.sqrt(dx * dx + dy * dy);
             
             if (dr === 0) return "";
             
             const gap = 30; // Spacing between curves
             // Calculate offset based on index
             let offset = (d.linkNum - (d.totalLinks - 1) / 2) * gap;
             
             // Check direction to maintain consistent bundling
             const isFlipped = source.id > target.id;
             if (isFlipped) {
                 offset = -offset;
             }

             // Control Point Calculation
             const mx = (source.x + target.x) / 2;
             const my = (source.y + target.y) / 2;
             
             // Normal Vector (-dy, dx)
             const nx = -dy / dr;
             const ny = dx / dr;
             
             const cx = mx + nx * offset;
             const cy = my + ny * offset;
             
             return `M${source.x},${source.y} Q${cx},${cy} ${target.x},${target.y}`;
        });

      // Update Label Positions (Midpoint of curve)
      linkLabels
        .attr("x", (d: any) => {
            const source = d.source as GraphNode;
            const target = d.target as GraphNode;
            
            if (source.x === undefined || target.x === undefined) return 0;
            if (source.id === target.id) return source.x!;
            
            if (d.totalLinks === 1) {
                return (source.x! + target.x!) / 2;
            }
            
            // Curve midpoint calculation
            const dx = target.x! - source.x!;
            const dy = target.y! - source.y!;
            const dr = Math.sqrt(dx*dx + dy*dy);
            if (dr === 0) return source.x!;
            
            const gap = 30;
            let offset = (d.linkNum - (d.totalLinks - 1) / 2) * gap;
            if (source.id > target.id) offset = -offset;
            
            const mx = (source.x! + target.x!) / 2;
            const nx = -dy / dr;
            // Midpoint of quadratic bezier is at t=0.5 -> M + 0.5 * offset * Normal
            return mx + nx * offset * 0.5;
        })
        .attr("y", (d: any) => {
            const source = d.source as GraphNode;
            const target = d.target as GraphNode;
            
            if (source.y === undefined || target.y === undefined) return 0;
            if (source.id === target.id) return source.y! - 50;

            if (d.totalLinks === 1) {
                return (source.y! + target.y!) / 2;
            }

            const dx = target.x! - source.x!;
            const dy = target.y! - source.y!;
            const dr = Math.sqrt(dx*dx + dy*dy);
            if (dr === 0) return source.y!;
            
            const gap = 30;
            let offset = (d.linkNum - (d.totalLinks - 1) / 2) * gap;
            if (source.id > target.id) offset = -offset;
            
            const my = (source.y! + target.y!) / 2;
            const ny = dx / dr;
            return my + ny * offset * 0.5;
        });

      nodeGroup
        .attr("transform", d => {
             if (d.x === undefined || d.y === undefined) return "";
             return `translate(${d.x},${d.y})`;
        });
    });

    function dragstarted(event: any, d: GraphNode) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      
      const isSelected = selectedNodesRef.current.some(n => n.id === d.id);
      
      const isMulti = event.sourceEvent.ctrlKey || event.sourceEvent.metaKey;
      const isLinkMode = event.sourceEvent.shiftKey;
      
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
      // Persist the new positions
      onNodesChange(nodesRef.current);
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
       .attr("stroke-width", (d: any) => selectedLinkIds.has(d.id) ? 3 : 2)
       .attr("marker-end", (d: any) => selectedLinkIds.has(d.id) ? "url(#arrow-selected)" : "url(#arrow)");

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