export interface ITaskReport {
  id: string
  task: string
  start: number
  end?: number
  createdBy: string
  time: number
  fileId?: string
  installTime?: number
  firstSuccess?: number
  mapping?: {
    requestMapping: string,
    responseMapping: string
  } | {
    messageMappings: { [key: string]: string}
  }
}
