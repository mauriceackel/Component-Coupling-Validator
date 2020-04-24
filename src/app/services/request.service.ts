import { Injectable } from "@angular/core";
import { IInterface } from '../models/interface.model';
import { IMapping } from '../models/mapping.model';
import { stringifyedToJsonata } from './mapping.service';
import { HttpClient } from '@angular/common/http';
import * as jsonata from 'jsonata';


@Injectable({
  providedIn: "root"
})
export class RequestService {

  constructor(private httpClient: HttpClient) { }

  public async sendRequest(sourceInputData: any, mapping: IMapping, targetInterface: IInterface) {

    const targetInputData = jsonata(stringifyedToJsonata(mapping.requestMapping)).evaluate(sourceInputData);

    const response = await this.httpClient.request<any>(targetInterface.method, targetInterface.endpoint, { body: targetInputData, responseType: "json" }).toPromise();
    const targetOutputData = response.json;

    const sourceOutputData = jsonata(stringifyedToJsonata(mapping.responseMapping)).evaluate(targetOutputData);

    return sourceOutputData;
  }

}
