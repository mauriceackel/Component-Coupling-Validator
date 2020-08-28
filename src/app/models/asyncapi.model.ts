import { IApi } from './api.model';

export interface IAsyncApi extends IApi {
  asyncApiSpec: string
}
