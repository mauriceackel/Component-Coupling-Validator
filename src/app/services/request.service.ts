import { HttpClient } from '@angular/common/http';
import { Injectable } from "@angular/core";
import * as jsonata from 'jsonata';
import { IInterface } from '../models/interface.model';
import { IMapping } from '../models/mapping.model';
import { getRequestUrl } from '../utils/swagger-parser';
import { ApiService } from './api.service';
import { stringifyedToJsonata } from './mapping.service';


@Injectable({
  providedIn: "root"
})
export class RequestService {

  constructor(private httpClient: HttpClient, private apiService: ApiService) { }

  public async sendRequest(sourceInputData: any, mapping: IMapping, targetInterfaces: { [key: string]: IInterface }) {

    const targetInputData = jsonata(stringifyedToJsonata(mapping.requestMapping)).evaluate(sourceInputData);

    const response = {};
    for(const [key, iface] of Object.entries(targetInterfaces)) {
      const { method, url } = await getRequestUrl(iface, targetInputData[key].parameters);

      response[key] = await this.httpClient.request<any>(method, url, { body: targetInputData[key].body, responseType: "json" }).toPromise();
    }

    const sourceOutputData = jsonata(stringifyedToJsonata(mapping.responseMapping)).evaluate(response);

    return sourceOutputData;
  }

}
