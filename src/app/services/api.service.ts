import { Injectable } from "@angular/core";
import { AngularFirestore } from '@angular/fire/firestore';
import { IOpenApi } from '../models/openapi.model';
import { removeUndefined } from '../utils/remove-undefined';
import { IAsyncApi } from '../models/asyncapi.model';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private readonly openApiColl = this.firestore.collection<IOpenApi>('openApis');
  private readonly asyncApiColl = this.firestore.collection<IAsyncApi>('asyncApis');

  constructor(private firestore: AngularFirestore) { }

  public async getOpenApis(conditions: { [key: string]: string } = {}): Promise<Array<IOpenApi>> {
    const apis = (await this.openApiColl.get().toPromise()).docs.map(doc => this.parseOpenApi(doc.id, doc.data()));
    const filteredApis = apis.filter(api => Object.entries(conditions).every(e => api[e[0]] === e[1]));

    return filteredApis;
  }

  public async getAsyncApis(conditions: { [key: string]: string } = {}): Promise<Array<IAsyncApi>> {
    const apis = (await this.asyncApiColl.get().toPromise()).docs.map(doc => this.parseAsyncApi(doc.id, doc.data()));
    const filteredApis = apis.filter(api => Object.entries(conditions).every(e => api[e[0]] === e[1]));

    return filteredApis;
  }

  public async getOpenApi(id: string): Promise<IOpenApi> {
    const doc = await this.openApiColl.doc<IOpenApi>(id).get().toPromise();
    return this.parseOpenApi(doc.id, doc.data());
  }

  public async getAsyncApi(id: string): Promise<IAsyncApi> {
    const doc = await this.asyncApiColl.doc<IAsyncApi>(id).get().toPromise();
    return { id: doc.id, ...doc.data() } as IAsyncApi;
  }

  private parseOpenApi(id: string, api: any): IOpenApi {
    return {
      ...api,
      id,
      openApiSpec: api.openApiSpec && JSON.parse(api.openApiSpec)
    }
  }

  private parseAsyncApi(id: string, api: any): IAsyncApi {
    return {
      ...api,
      id,
    }
  }

  private serializeOpenApi(api: IOpenApi) {
    let result = {
      ...api,
      id: undefined,
      openApiSpec: JSON.stringify(api.openApiSpec)
    }
    result = removeUndefined(result);
    return result;
  }

  private serializeAsyncApi(api: IAsyncApi) {
    let result = {
      ...api,
      id: undefined,
    }
    result = removeUndefined(result);
    return result;
  }

  public async updateOpenApi(api: IOpenApi) {
    return this.openApiColl.doc(api.id || "X" + this.firestore.createId()).set(this.serializeOpenApi(api));
  }

  public async updateAsyncApi(api: IAsyncApi) {
    return this.asyncApiColl.doc(api.id || "X" + this.firestore.createId()).set(this.serializeAsyncApi(api));
  }

}
