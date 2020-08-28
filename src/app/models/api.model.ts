export interface IApi {
  id: string
  createdBy: string
  name: string,
  metadata: {
    company?: string
    keywords?: string
  }
}
