
export interface IMapping {
  id: string
  createdBy: string
  type: MappingType;
  sourceId: string //Id of IInterface
  targetId: string
  requestMapping: string //JSONata mapping
  responseMapping: string //JSONata mapping
}

export enum MappingType {
  TRANSFORMATION,
  AUTO
}
