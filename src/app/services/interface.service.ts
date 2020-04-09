import { Injectable } from "@angular/core";
import { AngularFirestore, AngularFirestoreCollection } from '@angular/fire/firestore';
import { IInterface } from '../models/interface.model';
import { removeUndefined } from '../utils/remove-undefined';

@Injectable({
  providedIn: 'root'
})
export class InterfaceService {

  private interfaceColl: AngularFirestoreCollection<IInterface>;

  constructor(private firestore: AngularFirestore) {
    this.interfaceColl = firestore.collection('interfaces');
  }

  public async getInterfaces(conditions: { [key: string]: string } = {}): Promise<Array<IInterface>> {
    const rawInterfaces = (await this.interfaceColl.get().toPromise()).docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const interfaces = rawInterfaces.map(iface => this.parseInterface(iface));
    const filteredInterfaces = interfaces.filter(iface => Object.entries(conditions).every(e => iface[e[0]] === e[1]));

    return filteredInterfaces;
  }

  public async getInterface(id: string): Promise<IInterface> {
    const doc = await this.interfaceColl.doc<IInterface>(id).get().toPromise();
    return this.parseInterface({ id: doc.id, ...doc.data() });
  }

  private parseInterface(iface: any): IInterface {
    return {
      ...iface,
      request: {
        body: iface.request.body && JSON.parse(iface.request.body),
        jsonLdContext: iface.request.jsonLdContext && JSON.parse(iface.request.jsonLdContext)
      },
      response: {
        body: iface.response.body && JSON.parse(iface.response.body),
        jsonLdContext: iface.response.jsonLdContext && JSON.parse(iface.response.jsonLdContext)
      }
    }
  }

  private serializeInterface(iface: IInterface) {
    let result = {
      ...iface,
      id: undefined,
      request: {
        body: iface.request.body && JSON.stringify(iface.request.body),
        jsonLdContext: iface.request.jsonLdContext && JSON.stringify(iface.request.jsonLdContext)
      },
      response: {
        body: iface.response.body && JSON.stringify(iface.response.body),
        jsonLdContext: iface.response.jsonLdContext && JSON.stringify(iface.response.jsonLdContext)
      }
    }
    result = removeUndefined(result);
    return result;
  }

  public async createInterface(iface: IInterface) {
    const id = this.firestore.createId();
    const elem: IInterface = {
      ...this.serializeInterface(iface),
      id
    };
    return this.interfaceColl.doc(id).set(elem);
  }

  public async updateInterface(iface: IInterface) {
    return this.interfaceColl.doc(iface.id).update(this.serializeInterface(iface));
  }

}
