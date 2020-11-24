export interface AttributeNode {
  id?: string;
  component: string[];
  edges: MappingEdge[];
}

export interface MappingEdge {
  source: string;
  target: string;
  transformation: string;
}
