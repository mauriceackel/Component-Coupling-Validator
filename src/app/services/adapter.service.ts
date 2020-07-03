import { Injectable } from "@angular/core";
import { IMapping } from '../models/mapping.model';
import { HttpClient } from '@angular/common/http';

const adapterServiceBaseUrl = "http://localhost:8080";
const adapterServiceAdapterUrl = `${adapterServiceBaseUrl}/create-adapter`;
const adapterServiceDownloadUrl = `${adapterServiceBaseUrl}/download`;

@Injectable({
  providedIn: "root"
})
export class AdapterService {

  constructor(
    private httpClient: HttpClient
  ) { }

  public async createAdapter(mapping: IMapping, type: AdapterType) {
    switch (type) {
      case AdapterType.JAVASCRIPT: return await this.createJavaScriptAdapter(mapping);
    }
  }

  private async createJavaScriptAdapter(mapping: IMapping) {
    const response = await this.httpClient.post<{ result: { fileId: string } }>(`${adapterServiceAdapterUrl}/javascript`, { mapping }).toPromise();
    return `${adapterServiceDownloadUrl}/${response.result.fileId}`;
  }

}

export enum AdapterType {
  JAVASCRIPT = "javascript"
}
