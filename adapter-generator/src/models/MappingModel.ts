
export interface IMapping {
  id: string
  createdBy: string
  type: MappingType;
  sourceId: string //Id of IInterface
  targetIds: string[]
  requestMapping: string //JSONata mapping
  responseMapping: string //JSONata mapping
}

export enum MappingType {
  TRANSFORMATION,
  AUTO
}
