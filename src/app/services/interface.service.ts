import { Injectable } from "@angular/core";
import { HttpClient } from '@angular/common/http';
import { IInterface } from '../models/interface.model';
import { interfaceEndpoint } from '~/app/app.config';

@Injectable({
  providedIn: 'root'
})
export class InterfaceService {

  constructor(private httpClient: HttpClient) { }

  public async getInterfaces(conditions?: { [key: string]: string }) : Promise<Array<IInterface>>{
    const filter = conditions && "?" + Object.entries(conditions).map(e => {
      const filterObject = {};
      filterObject[e[0]] = e[1];
      return "filter=" + JSON.stringify(filterObject);
    }).join("&");
    const endpoint = interfaceEndpoint + (filter || '');
    const rawResult = await this.httpClient.get<Array<any>>(endpoint).toPromise();
    return rawResult.map(iface => this.parseInterface(iface));
  }

  public async getInterface(id: string) : Promise<IInterface> {
    const rawResult = await this.httpClient.get<any>(`${interfaceEndpoint}/${id}`).toPromise();
    return this.parseInterface(rawResult);
  }

  private parseInterface(iface: any): IInterface {
    return {
      id: iface._id["$oid"] || iface._id,
      createdBy: iface.createdBy,
      endpoint: iface.endpoint,
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
    return {
      endpoint: iface.endpoint,
      createdBy: iface.createdBy,
      request: {
        body: iface.request.body && JSON.stringify(iface.request.body),
        jsonLdContext: iface.request.jsonLdContext && JSON.stringify(iface.request.jsonLdContext)
      },
      response: {
        body: iface.response.body && JSON.stringify(iface.response.body),
        jsonLdContext: iface.response.jsonLdContext && JSON.stringify(iface.response.jsonLdContext)
      }
    }
  }

  public async createInterface(iface: IInterface) {
    return this.httpClient.post(interfaceEndpoint, iface).toPromise();
  }

  public async updateInterface(iface: IInterface) {
    return this.httpClient.patch(`${interfaceEndpoint}/${iface.id}`, this.serializeInterface(iface)).toPromise();
  }

}
