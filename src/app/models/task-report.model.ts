export interface ITaskReport {
  id: string
  task: string
  createdBy: string
  time: number
  fileId?: string
  mapping?: {
    requestMapping: string,
    responseMapping: string
  } | {
    messageMappings: { [key: string]: string}
  }
}
