import { MappingType } from './mapping.model';

export interface ITask {
  id: string
  name: string
  description: string
  sourceInterface: string
  targetInterface: string
  mappingType: MappingType
}
