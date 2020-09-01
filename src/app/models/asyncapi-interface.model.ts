import { IAsyncApi } from './asyncapi.model';

export interface IAsyncApiInterface {
  api: IAsyncApi,
  operationId: string,
  url: string,
  server: string
}
