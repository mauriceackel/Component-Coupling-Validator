import { Injectable } from "@angular/core";
import { IOpenApiMapping } from '../models/openapi-mapping.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '~/environments/environment';
import { IAsyncApiMapping } from '../models/asyncapi-mapping.model';

const adapterServiceBaseUrl = environment.adapterServiceBaseUrl;
const adapterServiceOpenApiAdapterUrl = `${adapterServiceBaseUrl}/open-api/create-adapter`;
const adapterServiceAsyncApiAdapterUrl = `${adapterServiceBaseUrl}/async-api/create-adapter`;

@Injectable({
  providedIn: "root"
})
export class AdapterService {

  constructor(
    private httpClient: HttpClient
  ) { }

  public async createOpenApiAdapter(mapping: IOpenApiMapping, type: AdapterType, taskReportId: string) {
    switch (type) {
      case AdapterType.JAVASCRIPT: return await this.createOpenApiJavaScriptAdapter(mapping, taskReportId);
    }
  }

  private async createOpenApiJavaScriptAdapter(mapping: IOpenApiMapping, taskReportId: string) {
    const response = await this.httpClient.post<{ result: { port: string, token: string } }>(`${adapterServiceOpenApiAdapterUrl}/javascript`, { mapping, taskReportId }).toPromise();
    return response.result;
  }

  public async createAsyncApiAdapter(mapping: IAsyncApiMapping, type: AdapterType, taskReportId: string) {
    switch (type) {
      case AdapterType.JAVASCRIPT: return await this.createAsyncApiJavaScriptAdapter(mapping, taskReportId);
    }
  }

  private async createAsyncApiJavaScriptAdapter(mapping: IAsyncApiMapping, taskReportId: string) {
    const response = await this.httpClient.post<{ result: { port: string, token: string } }>(`${adapterServiceAsyncApiAdapterUrl}/javascript`, { mapping, taskReportId }).toPromise();
    return response.result;
  }

}

export enum AdapterType {
  JAVASCRIPT = "javascript"
}
