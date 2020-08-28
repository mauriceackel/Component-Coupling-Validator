export interface IApi {
  id: string
  createdBy: string
  name: string,
  metadata: {
    company?: string
    keywords?: string
  }
}

export interface IAsyncApi extends IApi {
  asyncApiSpec: string
}

export interface IOpenApi extends IApi {
  openApiSpec: any
}
