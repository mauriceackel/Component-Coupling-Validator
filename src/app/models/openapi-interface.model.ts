import { IOpenApi } from './openapi.model';

export interface IOpenApiInterface {
  api: IOpenApi,
  operationId: string,
  responseId: string
}
