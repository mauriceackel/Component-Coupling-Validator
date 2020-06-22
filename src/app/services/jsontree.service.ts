import { Injectable } from "@angular/core";

@Injectable({
  providedIn: 'root'
})
export class JsonTreeService {

  public toTree(jsonObject: any, keyChain: Array<string> = []): JsonTreeNode[] {
    if (jsonObject && jsonObject.schema && typeof jsonObject.schema === "object" && !(jsonObject.schema instanceof Array)) {
      return Object.keys(jsonObject.schema).map(key => {
        const kChain = new Array<string>(...keyChain, key);

        return {
          name: key,
          optional: jsonObject.schema[key]['x-optional'],
          keyChain: kChain,
          children: this.toTree(jsonObject.schema[key], kChain)
        }
      });
    }
    return [];
  }

}

export interface JsonTreeNode {
  name: string;
  keyChain: KeyChain;
  children?: JsonTreeNode[];
}

export type KeyChain = Array<string>;
