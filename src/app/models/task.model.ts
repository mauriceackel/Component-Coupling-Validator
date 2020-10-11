
export interface ITask {
  id: string
  name: string
  description: string
  sourceInterface: string
  targetInterface: string
  type: TaskType
  goal: any
}

export enum TaskType {
  MANUAL,
  TOOL_ONLY,
  TOOL_FULL
}
