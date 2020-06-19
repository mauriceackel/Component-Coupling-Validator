import { Injectable } from "@angular/core";
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/firestore';
import { IApi } from '../models/api.model';
import { removeUndefined } from '../utils/remove-undefined';

@Injectable({
  providedIn: 'root'
})
export class ApiService {

  private apiColl: AngularFirestoreCollection<IApi>;

  constructor(private firestore: AngularFirestore) {
    this.apiColl = firestore.collection('apis');
  }

  public async getApis(conditions: { [key: string]: string } = {}): Promise<Array<IApi>> {
    const apis = (await this.apiColl.get().toPromise()).docs.map(doc => this.parseApi(doc.id, doc.data()));
    const filteredApis = apis.filter(api => Object.entries(conditions).every(e => api[e[0]] === e[1]));

    return filteredApis;
  }

  public async getApi(id: string): Promise<IApi> {
    const doc = await this.apiColl.doc<IApi>(id).get().toPromise();
    return this.parseApi(doc.id, doc.data());
  }

  private parseApi(id: string, api: any): IApi {
    return {
      ...api,
      id,
      openApiSpec: JSON.parse(api.openApiSpec)
    }
  }

  private serializeApi(api: IApi) {
    let result = {
      ...api,
      id: undefined,
      openApiSpec: JSON.stringify(api.openApiSpec)
    }
    result = removeUndefined(result);
    return result;
  }

  public async updateApi(api: IApi) {
    return this.apiColl.doc(api.id || this.firestore.createId()).set(this.serializeApi(api));
  }

}
