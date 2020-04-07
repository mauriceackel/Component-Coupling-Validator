import { KeyChain } from '../services/jsontree.service';

export interface IMapping {
  id: string
  createdBy: string
  type: MappingType;
  sourceId: string //Id of IInterface
  targetId: string
  requestMapping: string //JSONata mapping
  responseMapping: string //JSONata mapping
}

export interface IMappingPair {
  source: KeyChain
  target: KeyChain
}

export enum MappingType {
  MANUAL,
  TRANSFORMATION,
  JSONLD,
  AUTO
}
