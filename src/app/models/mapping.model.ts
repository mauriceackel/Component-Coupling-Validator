import { KeyChain } from '../services/jsontree.service';

export interface IMapping {
  id: string
  createdBy: string
  type: MappingType;
  sourceId: string //Id of IInterface
  targetIds: string[]
}

export interface IMappingPair {
  provided: KeyChain[]
  required: KeyChain
  mappingCode: string
}

export enum MappingType {
  TRANSFORMATION,
  AUTO,
  REVERSE,
  MANUAL
}

export enum MappingDirection {
  INPUT, OUTPUT
}
