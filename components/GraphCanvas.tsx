import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  
  // We keep the simulation instance stable across renders
  const simulationRef = useRef<d3.Simulation<GraphNode, GraphLink> | null>(null);
  
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  
  // These refs store the D3 internal state (with x, y, vx, vy)
  const nodesRef = useRef<GraphNode[]>([]); 
  const linksRef = useRef<GraphLink[]>([]); 
  const configRef = useRef<SimulationConfig>(config);
  
  // Track topology to avoid unnecessary simulation restarts
  const prevTopologyFingerprint = useRef<string>("");

  // Refs for callbacks to avoid stale closures in D3 event listeners
  const onNodesChangeRef = useRef(onNodesChange);
  const onNodeSelectRef = useRef(onNodeSelect);
  const onLinkSelectRef = useRef(onLinkSelect);
  const onLinkCreateRef = useRef(onLinkCreate);
  const selectedNodesRef = useRef(selectedNodes);
  const selectedLinksRef = useRef(selectedLinks);

  useEffect(() => {
    onNodesChangeRef.current = onNodesChange;
    onNodeSelectRef.current = onNodeSelect;
    onLinkSelectRef.current = onLinkSelect;
    onLinkCreateRef.current = onLinkCreate;
    selectedNodesRef.current = selectedNodes;
    selectedLinksRef.current = selectedLinks;
    configRef.current = config;
  }, [onNodesChange, onNodeSelect, onLinkSelect, onLinkCreate, selectedNodes, selectedLinks, config]);

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

  // --- INITIAL SETUP EFFECT (One time) ---
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    
    // Clear any existing content (e.g. from hot reload)
    svg.selectAll("*").remove();

    // 1. Defs
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
        .attr("fill", "#6b7280");

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
        .attr("fill", "#60a5fa");

    // 2. Container Group for Zoom
    const container = svg.append("g").attr("class", "zoom-container");
    
    // 3. Zoom Behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });
    svg.call(zoom);

    // 4. Create Layer Groups (Links, Labels, Nodes) - Order matters for z-index
    container.append("g").attr("class", "links-layer");
    container.append("g").attr("class", "labels-layer");
    container.append("g").attr("class", "nodes-layer");

    // 5. Initialize Simulation
    simulationRef.current = d3.forceSimulation<GraphNode, GraphLink>()
      .force("charge", d3.forceManyBody())
      .force("center", d3.forceCenter())
      .force("collide", d3.forceCollide())
      .force("link", d3.forceLink().id((d: any) => d.id));

    return () => {
        if (simulationRef.current) simulationRef.current.stop();
    };
  }, []); // Run once on mount

  // --- MAIN RENDER EFFECT ---
  useEffect(() => {
    if (!svgRef.current || !simulationRef.current) return;

    const svg = d3.select(svgRef.current);
    const container = svg.select(".zoom-container");
    const linkLayer = container.select(".links-layer");
    const labelLayer = container.select(".labels-layer");
    const nodeLayer = container.select(".nodes-layer");

    // 1. Prepare Data
    // CRITICAL FIX: Normalize links to always use string IDs for source/target
    // This ensures D3 always re-binds to the fresh node objects in nodesRef.current
    // instead of holding onto stale node object references from previous renders.
    const linksCopy = data.links.map(l => ({ 
        ...l,
        source: typeof l.source === 'object' ? (l.source as GraphNode).id : l.source,
        target: typeof l.target === 'object' ? (l.target as GraphNode).id : l.target
    }));

    // Merge new node data into existing nodesRef to preserve physics state (x,y,vx,vy)
    const currentNodesMap = new Map(nodesRef.current.map(n => [n.id, n]));
    const newNodes = data.nodes.map(n => {
        const existing = currentNodesMap.get(n.id);
        if (existing) {
             // Preserve physics props, update data props (label, color, type)
             return { ...existing, ...n, x: existing.x, y: existing.y, fx: n.fx ?? existing.fx, fy: n.fy ?? existing.fy };
        }
        return { ...n };
    });
    nodesRef.current = newNodes;
    linksRef.current = linksCopy;

    // 2. Topology Calculation (Link grouping)
    // We do this BEFORE passing to forceLink so we have linkNum calculated on fresh links
    const pairCounts = new Map<string, number>();
    linksRef.current.forEach(link => {
        const sid = link.source as string; // We normalized to string above
        const tid = link.target as string;
        const key = sid < tid ? `${sid}:${tid}` : `${tid}:${sid}`;
        pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
    });
    const pairIndices = new Map<string, number>();
    linksRef.current.forEach((link: any) => {
        const sid = link.source as string;
        const tid = link.target as string;
        const key = sid < tid ? `${sid}:${tid}` : `${tid}:${sid}`;
        const count = pairCounts.get(key)!;
        const index = pairIndices.get(key) || 0;
        link.linkNum = index;
        link.totalLinks = count;
        pairIndices.set(key, index + 1);
    });

    // 3. Update Simulation
    simulationRef.current.nodes(nodesRef.current);
    const linkForce = simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>;
    
    // IMPORTANT: This call mutates linksRef.current[i].source from String to Object
    // D3 will find the object in nodesRef.current based on the string ID
    linkForce.links(linksRef.current).distance(config.distance);
    
    simulationRef.current
        .force("charge", d3.forceManyBody().strength(config.charge))
        .force("center", d3.forceCenter(dimensions.width / 2, dimensions.height / 2).strength(0.05))
        .force("collide", d3.forceCollide(35).strength(0.5));
    
    // Smart Restart: Only if topology or config changes significantly
    const currentTopology = data.nodes.map(n => n.id).join(',') + '|' + data.links.map(l => l.id).join(',');
    if (currentTopology !== prevTopologyFingerprint.current) {
        simulationRef.current.alpha(0.3).restart();
        prevTopologyFingerprint.current = currentTopology;
    }
    
    // 4. Render Links (Join Pattern)
    const linkGroups = linkLayer.selectAll<SVGGElement, GraphLink>(".link-group")
        .data(linksRef.current, (d: GraphLink) => d.id)
        .join(
            enter => {
                const g = enter.append("g").attr("class", "link-group");
                g.append("path").attr("class", "hit-area").attr("stroke", "transparent").attr("stroke-width", 15).attr("fill", "none");
                g.append("path").attr("class", "visual-link").attr("fill", "none");
                return g;
            },
            update => update,
            exit => exit.remove()
        );
    
    linkGroups.on("click", (event, d) => {
        event.stopPropagation();
        const isMulti = event.ctrlKey || event.metaKey;
        onLinkSelectRef.current(d, isMulti);
    });

    // 5. Render Labels (Join Pattern)
    const labels = labelLayer.selectAll<SVGTextElement, GraphLink>(".link-label")
        .data(linksRef.current, (d: GraphLink) => d.id)
        .join(
            enter => enter.append("text").attr("class", "link-label").attr("text-anchor", "middle").attr("dy", -5).style("pointer-events", "none"),
            update => update,
            exit => exit.remove()
        )
        .text(d => d.label)
        .attr("font-size", 10);

    // 6. Render Nodes (Join Pattern)
    const nodeGroups = nodeLayer.selectAll<SVGGElement, GraphNode>(".node-group")
        .data(nodesRef.current, (d: GraphNode) => d.id)
        .join(
            enter => {
                const g = enter.append("g").attr("class", "node-group").style("cursor", "grab");
                g.append("text")
                    .attr("dy", 35).attr("text-anchor", "middle").attr("fill", "white")
                    .attr("font-size", 12).attr("font-weight", "bold").style("pointer-events", "none")
                    .style("text-shadow", "0 1px 4px rgba(0,0,0,0.8)");
                return g;
            },
            update => update,
            exit => exit.remove()
        );

    // Update Node Content (Shapes & Colors)
    nodeGroups.each(function(d) {
        // Safety: Ensure 'this' is a valid element
        if (!this) return;
        const group = d3.select(this);
        const color = d.color || (d.type === 'table' ? '#3b82f6' : d.type === 'document' ? '#10b981' : '#8b5cf6');
        
        const existingShape = group.select(".node-shape");
        const shapeNode = existingShape.node();
        
        // Robust TagName check using Element interface
        const currentTagName = (shapeNode && 'tagName' in shapeNode) 
            ? (shapeNode as Element).tagName.toLowerCase() 
            : null;
        
        let shapeMatchesType = false;
        if (currentTagName) {
             if (d.type === 'table' && currentTagName === 'rect') shapeMatchesType = true;
             else if (d.type === 'document' && currentTagName === 'path') shapeMatchesType = true;
             else if ((d.type === 'node' || !d.type) && currentTagName === 'circle') shapeMatchesType = true;
        }

        if (shapeMatchesType) {
            existingShape.attr("fill", color); 
        } else {
            existingShape.remove();
            let newShape;
            if (d.type === 'table') {
                newShape = group.insert("rect", "text").attr("width", 50).attr("height", 30).attr("x", -25).attr("y", -15).attr("rx", 4);
            } else if (d.type === 'document') {
                newShape = group.insert("path", "text").attr("d", "M-20,-25 L10,-25 L20,-15 L20,25 L-20,25 Z");
            } else {
                newShape = group.insert("circle", "text").attr("r", 20);
            }
            newShape.attr("class", "node-shape")
                    .attr("fill", color).attr("stroke", "#fff").attr("stroke-width", 1.5);
        }
        
        group.select("text").text(d.label);
    });

    // Attach Drag & Click
    const dragBehavior = d3.drag<SVGGElement, GraphNode>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended);

    nodeGroups.call(dragBehavior)
        .on("click", (event, d) => {
            event.stopPropagation();
            const selectedNodes = selectedNodesRef.current;
            const isLinkCreate = event.shiftKey;
            const isMulti = event.ctrlKey || event.metaKey;
            if (isLinkCreate && selectedNodes.length === 1 && selectedNodes[0].id !== d.id) {
                onLinkCreateRef.current(selectedNodes[0].id, d.id);
                return;
            }
            onNodeSelectRef.current(d, isMulti);
        });

    // 7. Tick Function
    simulationRef.current.on("tick", () => {
        const currentConfig = configRef.current;
        const selectedN = new Set(selectedNodesRef.current.map(n => n.id));
        const selectedL = new Set(selectedLinksRef.current.map(l => l.id));

        // Grid force
        if (currentConfig.grouping === 'grid') {
            const gridSize = 100;
            nodesRef.current.forEach(d => {
                if (!d.fx && !d.fy && !isNaN(d.x!) && !isNaN(d.y!)) {
                    d.vx = (d.vx || 0) + (Math.round(d.x! / gridSize) * gridSize - d.x!) * 0.1 * currentConfig.strength;
                    d.vy = (d.vy || 0) + (Math.round(d.y! / gridSize) * gridSize - d.y!) * 0.1 * currentConfig.strength;
                }
            });
        }

        // Update Links
        linkGroups.attr("display", d => {
            const s = d.source as GraphNode;
            const t = d.target as GraphNode;
            // Strict safety check for simulation stability
            if (!s || !t || typeof s !== 'object' || typeof t !== 'object') return "none";
            if (isNaN(s.x!) || isNaN(s.y!) || isNaN(t.x!) || isNaN(t.y!)) return "none";
            return null;
        });

        linkGroups.selectAll("path").attr("d", (d: any) => {
            const source = d.source as GraphNode;
            const target = d.target as GraphNode;
            
            // CRITICAL: During updates, source/target might briefly be string IDs before simulation processes them
            // We must return a valid path or empty string to avoid D3 errors
            if (typeof source !== 'object' || typeof target !== 'object' || !source.x || !target.x) return "M0,0L0,0";

            if (source.id === target.id) {
                const loopRadius = 40 + (d.linkNum * 10);
                const x = source.x!;
                const y = source.y!;
                const spread = 0.5; 
                const startAngle = -Math.PI / 2 - spread;
                const endAngle = -Math.PI / 2 + spread;
                
                const sx = x + 20 * Math.cos(startAngle);
                const sy = y + 20 * Math.sin(startAngle);
                const ex = x + 20 * Math.cos(endAngle);
                const ey = y + 20 * Math.sin(endAngle);
                
                const cp1x = x + loopRadius * Math.cos(startAngle - 0.2);
                const cp1y = y + loopRadius * Math.sin(startAngle - 0.2);
                const cp2x = x + loopRadius * Math.cos(endAngle + 0.2);
                const cp2y = y + loopRadius * Math.sin(endAngle + 0.2);
                
                return `M${sx},${sy} C${cp1x},${cp1y} ${cp2x},${cp2y} ${ex},${ey}`;
            }

            const dx = target.x! - source.x!;
            const dy = target.y! - source.y!;
            const dr = Math.sqrt(dx * dx + dy * dy);

            if (d.totalLinks === 1 || dr < 0.1) {
                return `M${source.x},${source.y} L${target.x},${target.y}`;
            }

            const scale = Math.min(1, dr / 150);
            const gap = 30;
            let offset = (d.linkNum - (d.totalLinks - 1) / 2) * gap * scale;
            if (source.id > target.id) offset = -offset;

            const mx = (source.x! + target.x!) / 2;
            const my = (source.y! + target.y!) / 2;
            const nx = -dy / dr;
            const ny = dx / dr;
            
            const cx = mx + nx * offset;
            const cy = my + ny * offset;
            
            return `M${source.x},${source.y} Q${cx},${cy} ${target.x},${target.y}`;
        });

        linkGroups.select(".visual-link")
            .attr("stroke", (d: any) => selectedL.has(d.id) ? "#60a5fa" : "#4b5563")
            .attr("stroke-width", (d: any) => selectedL.has(d.id) ? 3 : 2)
            .attr("stroke-opacity", (d: any) => selectedL.has(d.id) ? 1 : 0.6)
            .attr("marker-end", (d: any) => {
                const s = d.source as GraphNode;
                const t = d.target as GraphNode;
                // Safety check inside marker logic
                if (typeof s !== 'object' || typeof t !== 'object' || !s.x || !t.x) return null;

                if (s.id !== t.id) {
                     const dx = t.x! - s.x!;
                     const dy = t.y! - s.y!;
                     if (Math.sqrt(dx*dx + dy*dy) < 45) return null; 
                }
                return selectedL.has(d.id) ? "url(#arrow-selected)" : "url(#arrow)";
            });

        labels
            .attr("fill", (d: any) => selectedL.has(d.id) ? "#93c5fd" : "#9ca3af")
            .attr("font-weight", (d: any) => selectedL.has(d.id) ? "bold" : "normal")
            .attr("x", (d: any) => {
                const s = d.source as GraphNode;
                const t = d.target as GraphNode;
                if (typeof s !== 'object' || typeof t !== 'object' || !s.x || !t.x) return 0;
                
                if (s.id === t.id) return s.x;

                const dx = t.x - s.x;
                const dy = t.y! - s.y!;
                const dr = Math.sqrt(dx*dx + dy*dy);

                if (d.totalLinks === 1 || dr < 0.1) return (s.x + t.x) / 2;

                const scale = Math.min(1, dr / 150);
                const gap = 30;
                let offset = (d.linkNum - (d.totalLinks - 1) / 2) * gap * scale;
                if (s.id > t.id) offset = -offset;

                const mx = (s.x + t.x) / 2;
                const nx = -dy / dr;
                return mx + nx * offset * 0.5;
            })
            .attr("y", (d: any) => {
                const s = d.source as GraphNode;
                const t = d.target as GraphNode;
                if (typeof s !== 'object' || typeof t !== 'object' || !s.y || !t.y) return 0;

                if (s.id === t.id) {
                    const loopRadius = 40 + (d.linkNum * 10);
                    return s.y - loopRadius - 5;
                }

                const dx = t.x! - s.x!;
                const dy = t.y - s.y;
                const dr = Math.sqrt(dx*dx + dy*dy);

                if (d.totalLinks === 1 || dr < 0.1) return (s.y + t.y) / 2;

                const scale = Math.min(1, dr / 150);
                const gap = 30;
                let offset = (d.linkNum - (d.totalLinks - 1) / 2) * gap * scale;
                if (s.id > t.id) offset = -offset;

                const my = (s.y + t.y) / 2;
                const ny = dx / dr;
                return my + ny * offset * 0.5;
            });

        nodeGroups.attr("transform", d => {
             if (isNaN(d.x!) || isNaN(d.y!)) return "";
             return `translate(${d.x},${d.y})`;
        });
        
        nodeGroups.each(function(d) {
             if (!this) return; // Safety check
             const g = d3.select(this);
             const isSelected = selectedN.has(d.id);
             const shape = g.select(".node-shape");
             if (!shape.empty()) {
                shape.attr("stroke-width", isSelected ? 3 : 1.5);
             }
             
             const halo = g.select(".selection-halo");
             if (isSelected) {
                 if (halo.empty()) {
                     g.insert("circle", ":first-child")
                        .attr("class", "selection-halo").attr("r", 35).attr("fill", "none")
                        .attr("stroke", "rgba(255, 255, 255, 0.4)").attr("stroke-width", 2).attr("stroke-dasharray", "4,3");
                 }
             } else {
                 halo.remove();
             }
        });
    });

    // 8. Drag Handlers
    function dragstarted(event: any, d: GraphNode) {
      if (!event.active) simulationRef.current?.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      
      const isSelected = selectedNodesRef.current.some(n => n.id === d.id);
      const isLinkMode = event.sourceEvent.shiftKey;
      const isMulti = event.sourceEvent.ctrlKey || event.sourceEvent.metaKey;

      if (!isSelected && !isLinkMode) {
          onNodeSelectRef.current(d, isMulti);
      }
    }

    function dragged(event: any, d: GraphNode) {
      d.fx = event.x;
      d.fy = event.y;
      if (!isNaN(event.x)) d.x = event.x;
      if (!isNaN(event.y)) d.y = event.y;
    }

    function dragended(event: any, d: GraphNode) {
      if (!event.active) simulationRef.current?.alphaTarget(0);
      onNodesChangeRef.current(nodesRef.current);
    }

  }, [data, config, dimensions]); // Run on any data change for live updates

  // --- CONFIG UPDATE EFFECT ---
  useEffect(() => {
     if (!simulationRef.current) return;
     simulationRef.current.force("charge", d3.forceManyBody().strength(config.charge));
     (simulationRef.current.force("link") as d3.ForceLink<GraphNode, GraphLink>).distance(config.distance);
     simulationRef.current.alpha(0.3).restart();
  }, [config.charge, config.distance]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("nodeType");
    if (type && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const newNode: GraphNode = {
        id: `node-${Date.now()}`,
        label: "New Node",
        type: type as any,
        x: x, y: y,
        properties: [],
        color: type === 'table' ? '#3b82f6' : type === 'document' ? '#10b981' : '#8b5cf6'
      };
      
      const newNodes = [...data.nodes, newNode];
      onNodesChange(newNodes);
    }
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

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