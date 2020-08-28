import { Injectable } from "@angular/core";
import { IOpenApiMapping } from '../models/openapi-mapping.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '~/environments/environment';
import { IAsyncApiMapping } from '../models/asyncapi-mapping.model';

const adapterServiceBaseUrl = environment.adapterServiceBaseUrl;
const adapterServiceDownloadUrl = `${adapterServiceBaseUrl}/download`;
const adapterServiceOpenApiAdapterUrl = `${adapterServiceBaseUrl}/open-api/create-adapter`;
const adapterServiceAsyncApiAdapterUrl = `${adapterServiceBaseUrl}/async-api/create-adapter`;

@Injectable({
  providedIn: "root"
})
export class AdapterService {

  constructor(
    private httpClient: HttpClient
  ) { }

  public async createOpenApiAdapter(mapping: IOpenApiMapping, type: AdapterType) {
    switch (type) {
      case AdapterType.JAVASCRIPT: return await this.createOpenApiJavaScriptAdapter(mapping);
    }
  }

  private async createOpenApiJavaScriptAdapter(mapping: IOpenApiMapping) {
    const response = await this.httpClient.post<{ result: { fileId: string } }>(`${adapterServiceOpenApiAdapterUrl}/javascript`, { mapping }).toPromise();
    return `${adapterServiceDownloadUrl}/${response.result.fileId}`;
  }

  public async createAsyncApiAdapter(mapping: IAsyncApiMapping, type: AdapterType) {
    switch (type) {
      case AdapterType.JAVASCRIPT: return await this.createAsyncApiJavaScriptAdapter(mapping);
    }
  }

  private async createAsyncApiJavaScriptAdapter(mapping: IAsyncApiMapping) {
    const response = await this.httpClient.post<{ result: { fileId: string } }>(`${adapterServiceAsyncApiAdapterUrl}/javascript`, { mapping }).toPromise();
    return `${adapterServiceDownloadUrl}/${response.result.fileId}`;
  }

}

export enum AdapterType {
  JAVASCRIPT = "javascript"
}
