
export interface ITask {
  id: string
  name: string
  description: string
  sourceInterface?: {
    apiId: string,
    operationId: string,
    responseId: string
  }
  targetInterfaces?: {
    apiId: string,
    operationId: string,
    responseId: string
  }[],
  type: TaskType
  goal: any
}

export enum TaskType {
  MANUAL,
  TOOL_ONLY,
  TOOL_FULL
}
