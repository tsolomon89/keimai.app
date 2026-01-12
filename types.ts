export interface GraphNode {
  id: string;
  label: string;
  type: 'node' | 'document' | 'table';
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null; // Fixed x for drag
  fy?: number | null; // Fixed y for drag
  properties: NodeProperty[];
  color?: string;
}

export interface NodeProperty {
  id: string;
  key: string;
  value: string;
  type: string; // e.g., string, int, boolean
}

export interface GraphLink {
  id: string;
  source: string | GraphNode; // D3 converts string IDs to object references
  target: string | GraphNode;
  label: string;
  type?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

export interface SimulationConfig {
  strength: number;
  distance: number;
  gravity: number;
  charge: number;
  grouping: 'force' | 'grid' | 'circle';
}

export enum AppMode {
  VIEW = 'VIEW',
  ADD_NODE = 'ADD_NODE',
  ADD_LINK = 'ADD_LINK',
  AI_GENERATING = 'AI_GENERATING'
}