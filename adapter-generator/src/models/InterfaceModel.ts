import { IAsyncApi, IOpenApi } from './ApiModel';

export interface IAsyncApiInterface {
  api: IAsyncApi,
  operationId: string,
}

export interface IOpenApiInterface {
  api: IOpenApi,
  operationId: string,
  responseId: string
}
