import { KeyChain } from '../services/jsontree.service';

export interface IMapping {
  id: string
  createdBy: string
  type: MappingType;
  sourceId: string //Id of IInterface
  targetIds: string[]
}

export interface IMappingPair {
  creationType: MappingPairType
  provided: KeyChain[]
  required: KeyChain
  mappingCode: string
}

export enum MappingPairType {
  MANUAL, ATTRIBUTE, MAPPING, SYNTAX
}

export enum MappingType {
  TRANSFORMATION,
  AUTO,
  REVERSE
}

export enum MappingDirection {
  INPUT, OUTPUT
}
